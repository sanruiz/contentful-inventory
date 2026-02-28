#!/usr/bin/env node

/**
 * Fix ALL tables with empty rawData
 * 
 * Multiple tables have empty rawData because their CSV data wasn't downloaded
 * during the original extraction. The filters.selectedColumns lack `id` (column index),
 * which caused the applyFilters function to produce empty arrays.
 *
 * This script:
 * 1. Scans out/tables/ for JSON files with empty rawData
 * 2. Re-fetches the source data from Contentful (CSV or inline)
 * 3. Resolves column indices by name (fix for missing id)
 * 4. Saves corrected JSON to out/tables/ and WP contentful-tables/
 * 5. Fixes WordPress posts that have old placeholder HTML instead of shortcodes
 */

import 'dotenv/config';
import pkg from 'contentful-management';
const { createClient } = pkg;
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import https from 'https';

const client = createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

const spaceId = process.env.CONTENTFUL_SPACE_ID || '61iwodu7d9u0';
const envId = process.env.CONTENTFUL_ENVIRONMENT_ID || 'master';

const OUT_TABLES_DIR = path.join(process.cwd(), 'out', 'tables');
const WP_TABLES_DIR = '/Users/santiagoramirez/Local Sites/memorycarecom/app/public/wp-content/contentful-tables';

const WP_BASE_URL = process.env.WP_BASE_URL || 'https://memorycare.local';
const WP_USERNAME = process.env.WP_USERNAME || 'sanruiz';
const WP_PASSWORD = process.env.WP_APPLICATION_PASSWORD;
const wpAgent = new https.Agent({ rejectUnauthorized: false });
const wpAuth = Buffer.from(`${WP_USERNAME}:${WP_PASSWORD}`).toString('base64');

/**
 * Scan out/tables/ for JSON files with empty rawData (excluding TOC entries)
 */
function findEmptyTables() {
  const empty = [];
  for (const file of fs.readdirSync(OUT_TABLES_DIR)) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(path.join(OUT_TABLES_DIR, file), 'utf8'));
    if (data.type === 'tableOfContents') continue;
    const rows = data.rawData || [];
    const hasData = rows.some(row => row.some(cell => cell !== ''));
    if (!hasData && rows.length > 0) {
      empty.push(file.replace('.json', ''));
    }
  }
  return empty;
}

function parseCSV(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  let row = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(current.trim()); current = ''; }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(current.trim());
        if (row.some(c => c !== '')) rows.push(row);
        row = []; current = '';
        if (ch === '\r') i++;
      } else { current += ch; }
    }
  }
  if (current || row.length > 0) {
    row.push(current.trim());
    if (row.some(c => c !== '')) rows.push(row);
  }
  return rows;
}

function escHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateTableHtml(tableJson) {
  const rawData = tableJson.rawData;
  if (!rawData || rawData.length === 0) return '';

  const title = tableJson.title || '';
  const style = (tableJson.style || 'Equal Width').toLowerCase().replace(/\s+/g, '-');
  const theme = (tableJson.theme || 'Standard').toLowerCase();
  const fullWidth = tableJson.fullWidth !== false ? ' table-full-width' : '';

  let html = `<div class="contentful-data-table${fullWidth} style-${style} theme-${theme}">\n`;
  if (title) html += `  <h3 class="table-title">${escHtml(title)}</h3>\n`;
  html += '  <div class="table-responsive">\n    <table class="contentful-table">\n';
  html += '      <thead>\n        <tr>\n';
  for (const h of rawData[0]) html += `          <th>${escHtml(h)}</th>\n`;
  html += '        </tr>\n      </thead>\n      <tbody>\n';
  for (let i = 1; i < rawData.length; i++) {
    html += '        <tr>\n';
    for (const cell of rawData[i]) html += `          <td>${escHtml(cell)}</td>\n`;
    html += '        </tr>\n';
  }
  html += '      </tbody>\n    </table>\n  </div>\n</div>\n';
  return html;
}

async function main() {
  console.log('🔧 Fix ALL Tables with Empty Data');
  console.log('='.repeat(60));

  // Step 1: Find all tables with empty rawData
  const TABLE_IDS = findEmptyTables();
  console.log(`\n📋 Found ${TABLE_IDS.length} tables with empty rawData:`);
  for (const id of TABLE_IDS) {
    const data = JSON.parse(fs.readFileSync(path.join(OUT_TABLES_DIR, `${id}.json`), 'utf8'));
    console.log(`   ${id}: ${data.title}`);
  }

  if (TABLE_IDS.length === 0) {
    console.log('\n✅ No empty tables found — all good!');
    return;
  }

  const space = await client.getSpace(spaceId);
  const environment = await space.getEnvironment(envId);
  const fixed = [];

  for (const tableId of TABLE_IDS) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📊 Processing: ${tableId}`);

    const entry = await environment.getEntry(tableId);
    const fields = entry.fields;
    const title = fields.title?.['en-US'] || '';
    const filters = fields.filters?.['en-US'] || null;

    console.log(`   Title: ${title}`);

    // Get source → spreadsheet or inline → data
    const sourceRef = fields.source?.['en-US'];
    if (!sourceRef?.sys?.id) { console.log('   ❌ No source reference'); continue; }

    const source = await environment.getEntry(sourceRef.sys.id);
    const sourceCt = source.sys.contentType.sys.id;
    console.log(`   Source type: ${sourceCt}`);

    let rawData = null;

    if (sourceCt === 'dataSourceSpreadsheet') {
      const assetRef = source.fields.source?.['en-US'];
      if (!assetRef?.sys?.id) { console.log('   ❌ No asset reference'); continue; }

      const asset = await environment.getAsset(assetRef.sys.id);
      let url = asset.fields.file?.['en-US']?.url || '';
      if (url.startsWith('//')) url = `https:${url}`;

      console.log(`   CSV URL: ${url}`);
      try {
        const response = await fetch(url);
        if (!response.ok) { console.log(`   ❌ Failed to fetch CSV: ${response.status}`); continue; }
        const text = await response.text();
        rawData = parseCSV(text);
        console.log(`   ✅ CSV parsed: ${rawData.length} rows`);
      } catch (err) {
        console.log(`   ❌ Fetch error: ${err.message}`);
        continue;
      }
    } else if (sourceCt === 'dataSourceTable') {
      const dt = source.fields.dataTable?.['en-US'];
      if (dt?.tableData) {
        rawData = dt.tableData;
        console.log(`   ✅ Inline data: ${rawData.length} rows`);
      }
    }

    if (!rawData || rawData.length === 0) {
      console.log('   ❌ No data found');
      continue;
    }

    console.log(`   Headers: ${rawData[0].join(', ')}`);

    // Apply column filters resolving by NAME (fix for missing id)
    const headers = rawData[0];
    const selectedCols = filters?.selectedColumns || [];
    const selectedKey = filters?.selectedKey || [];

    let keyColumn = null;
    let keyColumnIndex = -1;
    let keyValues = [];

    if (selectedKey.length > 0) {
      keyColumn = selectedKey[0].name;
      keyColumnIndex = selectedKey[0].id !== undefined ? selectedKey[0].id : headers.indexOf(keyColumn);
      if (keyColumnIndex >= 0) {
        keyValues = [...new Set(rawData.slice(1).map(row => (row[keyColumnIndex] || '').toString().trim()).filter(Boolean))];
      }
      console.log(`   Key column: "${keyColumn}" at index ${keyColumnIndex}`);
      console.log(`   Key values: ${keyValues.join(', ')}`);
    }

    let displayData = rawData;
    if (selectedCols.length > 0) {
      const colIndices = selectedCols.map(col => {
        if (col.id !== undefined && col.id !== null) return col.id;
        return headers.indexOf(col.name);
      }).filter(i => i >= 0);

      const allIndices = [...colIndices];
      if (keyColumnIndex >= 0 && !allIndices.includes(keyColumnIndex)) {
        allIndices.push(keyColumnIndex);
      }

      if (allIndices.length > 0) {
        displayData = rawData.map(row => allIndices.map(i => row[i] || ''));
        keyColumnIndex = keyColumnIndex >= 0 ? allIndices.indexOf(keyColumnIndex) : -1;
        console.log(`   Filtered columns: ${allIndices.map(i => headers[i]).join(', ')}`);
      }
    }

    console.log(`   Display data: ${displayData.length} rows x ${displayData[0].length} cols`);
    if (displayData.length > 1) console.log(`   Sample row: ${displayData[1].join(' | ')}`);

    // Build JSON
    const tableJson = {
      type: fields.type?.['en-US'] || 'Plain',
      title,
      style: fields.style?.['en-US'] || 'Equal Width',
      theme: fields.theme?.['en-US'] || 'Standard',
      fullWidth: fields.fullWidth?.['en-US'] ?? true,
      filters,
      rawData: displayData,
      keyColumn,
      keyColumnIndex,
      keyValues,
    };

    tableJson.html = generateTableHtml(tableJson);

    // Save to out/tables/
    const jsonStr = JSON.stringify(tableJson, null, 2);
    fs.writeFileSync(path.join(OUT_TABLES_DIR, `${tableId}.json`), jsonStr);
    console.log(`   ✅ Saved: out/tables/${tableId}.json`);

    // Save to WP contentful-tables/
    if (fs.existsSync(WP_TABLES_DIR)) {
      fs.writeFileSync(path.join(WP_TABLES_DIR, `${tableId}.json`), jsonStr);
      console.log(`   ✅ Saved: WP contentful-tables/${tableId}.json`);
    } else {
      console.log(`   ⚠️  WP dir not found: ${WP_TABLES_DIR}`);
    }

    fixed.push({ id: tableId, title });
  }

  // Step 2: Fix WordPress posts that have old placeholder HTML
  console.log(`\n${'='.repeat(60)}`);
  console.log('🔄 Scanning WordPress posts for placeholder HTML blocks...\n');
  await fixWordPressPosts(fixed);

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 SUMMARY\n');
  console.log(`   Tables fixed: ${fixed.length}/${TABLE_IDS.length}`);
  for (const t of fixed) console.log(`     ✅ ${t.title}`);
  console.log('\n✨ Done!');
}

/**
 * Scan WordPress posts for placeholder HTML blocks and replace with shortcodes
 */
async function fixWordPressPosts(fixedTables) {
  // Build a title→id lookup from all table JSON files
  const titleToId = {};
  for (const file of fs.readdirSync(OUT_TABLES_DIR)) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(path.join(OUT_TABLES_DIR, file), 'utf8'));
    if (data.title) {
      // Normalize: strip " - Data Viz" suffix and HTML entities
      const normalizedTitle = data.title.replace(/\s*[-–]\s*Data Viz$/i, '').trim();
      titleToId[normalizedTitle] = file.replace('.json', '');
      titleToId[data.title] = file.replace('.json', '');
    }
  }

  // Fetch all posts (paginated)
  let page = 1;
  let totalFixed = 0;

  while (true) {
    const res = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/posts?context=edit&per_page=50&page=${page}&status=any`, {
      headers: { 'Authorization': `Basic ${wpAuth}` },
      agent: wpAgent,
    });

    if (!res.ok) break;
    const posts = await res.json();
    if (posts.length === 0) break;

    for (const post of posts) {
      const raw = post.content.raw;
      if (!raw.includes('data-visualization-table')) continue;

      // Find and replace each placeholder block
      const placeholderRegex = /<div class="wp-block-group data-visualization-table">\s*<h4>(.*?)<\/h4>[\s\S]*?<\/style>\s*<\/div>/g;
      let newContent = raw;
      let match;
      let replaced = 0;

      while ((match = placeholderRegex.exec(raw)) !== null) {
        const blockTitle = match[1]
          .replace(/&#8211;/g, '–')
          .replace(/&#8217;/g, "'")
          .replace(/&amp;/g, '&');

        // Try to find the table ID by title
        let tableId = titleToId[blockTitle];
        if (!tableId) {
          // Try without " - Data Viz"
          const stripped = blockTitle.replace(/\s*[-–]\s*Data Viz$/i, '').trim();
          tableId = titleToId[stripped];
        }

        if (tableId) {
          newContent = newContent.replace(match[0], `\n[contentful_table id="${tableId}"]\n`);
          replaced++;
          console.log(`   📝 Post ${post.id} "${post.title.raw.substring(0, 50)}": replaced "${blockTitle}" → [contentful_table id="${tableId}"]`);
        } else {
          console.log(`   ⚠️  Post ${post.id}: no table ID found for "${blockTitle}"`);
        }
      }

      if (replaced > 0) {
        // Update the post
        const updateRes = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/posts/${post.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${wpAuth}`,
          },
          body: JSON.stringify({ content: newContent }),
          agent: wpAgent,
        });

        if (updateRes.ok) {
          console.log(`   ✅ Post ${post.id} updated (${replaced} placeholders replaced)`);
          totalFixed++;
        } else {
          console.log(`   ❌ Post ${post.id} update failed: ${updateRes.status}`);
        }
      }
    }

    page++;
    const totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1');
    if (page > totalPages) break;
  }

  console.log(`\n   Posts updated: ${totalFixed}`);
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
