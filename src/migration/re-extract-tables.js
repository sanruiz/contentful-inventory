#!/usr/bin/env node

/**
 * Re-extract ALL table data from Contentful
 * 
 * Fixes the extraction by:
 * 1. Converting dataSourceTable → rawData (array of arrays) format
 * 2. Downloading CSV from dataSourceSpreadsheet assets → rawData
 * 3. Generating HTML for each table
 * 4. Preserving filters and metadata
 * 
 * Usage: node src/migration/re-extract-tables.js
 */

import 'dotenv/config';
import pkg from 'contentful-management';
const { createClient } = pkg;
import fs from 'fs';
import path from 'path';

const client = createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

const spaceId = process.env.CONTENTFUL_SPACE_ID || '61iwodu7d9u0';
const envId = process.env.CONTENTFUL_ENVIRONMENT_ID || 'master';

const WP_TABLES_DIR = '/Users/santiagoramirez/Local Sites/memorycarecom/app/public/wp-content/contentful-tables';
const OUT_TABLES_DIR = path.join(process.cwd(), 'out', 'tables');

/**
 * Parse CSV text into array of arrays
 */
function parseCSV(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  let row = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current.trim());
        current = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(current.trim());
        if (row.some(cell => cell !== '')) {
          rows.push(row);
        }
        row = [];
        current = '';
        if (ch === '\r') i++; // skip \n after \r
      } else {
        current += ch;
      }
    }
  }

  // Last row
  if (current || row.length > 0) {
    row.push(current.trim());
    if (row.some(cell => cell !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Apply column filters to raw data, but KEEP the key column for runtime filtering.
 * Returns { displayData, keyColumn, keyColumnIndex, keyValues }
 */
function applyFilters(rawData, filters) {
  if (!filters || !rawData || rawData.length === 0) {
    return { displayData: rawData, keyColumn: null, keyColumnIndex: -1, keyValues: [] };
  }

  const headers = rawData[0];
  const dataRows = rawData.slice(1);

  const selectedCols = filters.selectedColumns || [];
  const selectedKey = filters.selectedKey || [];

  // Determine key column info
  let keyColumn = null;
  let keyColumnIndex = -1;
  let keyValues = [];

  if (selectedKey.length > 0) {
    keyColumn = selectedKey[0].name;
    keyColumnIndex = selectedKey[0].id;
    // Collect unique key values from data
    keyValues = [...new Set(dataRows.map(row => (row[keyColumnIndex] || '').toString().trim()).filter(Boolean))];
  }

  // Apply column filtering for display columns
  if (selectedCols.length === 0) {
    return { displayData: rawData, keyColumn, keyColumnIndex, keyValues };
  }

  const colIndices = selectedCols.map(col => col.id);

  // Include display columns + key column (if not already included)
  const allIndices = [...colIndices];
  if (keyColumnIndex >= 0 && !allIndices.includes(keyColumnIndex)) {
    allIndices.push(keyColumnIndex);
  }

  const filteredHeaders = allIndices.map(i => headers[i] || '');
  const filteredRows = dataRows.map(row =>
    allIndices.map(i => row[i] || '')
  );

  // Recalculate key column index in the filtered data
  const filteredKeyIndex = keyColumnIndex >= 0 ? allIndices.indexOf(keyColumnIndex) : -1;

  return {
    displayData: [filteredHeaders, ...filteredRows],
    keyColumn,
    keyColumnIndex: filteredKeyIndex, // Index within the filtered data
    keyValues,
  };
}

/**
 * Generate HTML table from rawData
 */
function generateTableHtml(tableJson) {
  const rawData = tableJson.rawData;
  if (!rawData || rawData.length === 0) return '';

  const title = tableJson.title || '';
  const style = (tableJson.style || 'Equal Width').toLowerCase().replace(/\s+/g, '-');
  const theme = (tableJson.theme || 'Standard').toLowerCase();
  const fullWidth = tableJson.fullWidth !== false ? ' table-full-width' : '';

  let html = `<div class="contentful-data-table${fullWidth} style-${style} theme-${theme}">\n`;

  if (title) {
    html += `  <h3 class="table-title">${escHtml(title)}</h3>\n`;
  }

  html += '  <div class="table-responsive">\n';
  html += '    <table class="contentful-table">\n';

  // Headers (first row)
  const headers = rawData[0];
  html += '      <thead>\n        <tr>\n';
  for (const h of headers) {
    html += `          <th>${escHtml(h)}</th>\n`;
  }
  html += '        </tr>\n      </thead>\n';

  // Data rows
  html += '      <tbody>\n';
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    html += '        <tr>\n';
    for (const cell of row) {
      // Allow links in cells
      const cellHtml = typeof cell === 'string' && cell.includes('http')
        ? cell.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
        : escHtml(cell);
      html += `          <td>${cellHtml}</td>\n`;
    }
    html += '        </tr>\n';
  }
  html += '      </tbody>\n';

  html += '    </table>\n';
  html += '  </div>\n';
  html += '</div>\n';

  return html;
}

function escHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function main() {
  console.log('📋 Re-extract ALL Tables from Contentful (with actual data)');
  console.log('='.repeat(60));

  const space = await client.getSpace(spaceId);
  const environment = await space.getEnvironment(envId);

  for (const dir of [OUT_TABLES_DIR, WP_TABLES_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  // Fetch all table entries
  console.log('\n📥 Fetching all dataVisualizationTables entries...');
  const allTables = [];
  let skip = 0;
  while (true) {
    const batch = await environment.getEntries({ content_type: 'dataVisualizationTables', limit: 100, skip });
    allTables.push(...batch.items);
    if (allTables.length >= batch.total) break;
    skip += 100;
    process.stdout.write(`\r   Fetched ${allTables.length}/${batch.total}...`);
  }
  console.log(`\n   Found ${allTables.length} table entries`);

  // Also fetch all tableOfContents entries
  console.log('\n📥 Fetching tableOfContents entries...');
  const allTOC = await environment.getEntries({ content_type: 'tableOfContents', limit: 100 });
  console.log(`   Found ${allTOC.items.length} TOC entries`);

  let success = 0;
  let spreadsheetSuccess = 0;
  let inlineSuccess = 0;
  let failed = 0;
  let tocSuccess = 0;

  // Process data tables
  console.log('\n📊 Processing tables...');
  for (let i = 0; i < allTables.length; i++) {
    const table = allTables[i];
    const id = table.sys.id;
    const fields = table.fields;
    const title = fields.title?.['en-US'] || '';
    const sourceRef = fields.source?.['en-US'];

    process.stdout.write(`\r   [${i + 1}/${allTables.length}] ${title.substring(0, 50).padEnd(50)}`);

    try {
      let rawData = null;
      let sourceType = 'unknown';

      if (sourceRef?.sys?.id) {
        const source = await environment.getEntry(sourceRef.sys.id);
        const sourceCt = source.sys.contentType.sys.id;

        if (sourceCt === 'dataSourceTable') {
          // Inline data: dataTable.tableData is array of arrays
          sourceType = 'inline';
          const dt = source.fields.dataTable?.['en-US'];
          if (dt?.tableData && Array.isArray(dt.tableData)) {
            rawData = dt.tableData;
          }
        } else if (sourceCt === 'dataSourceSpreadsheet') {
          // Spreadsheet: download CSV from asset
          sourceType = 'spreadsheet';
          const assetRef = source.fields.source?.['en-US'];
          if (assetRef?.sys?.id) {
            try {
              const asset = await environment.getAsset(assetRef.sys.id);
              let url = asset.fields.file?.['en-US']?.url || '';
              if (url.startsWith('//')) url = `https:${url}`;

              if (url) {
                const response = await fetch(url);
                if (response.ok) {
                  const text = await response.text();
                  rawData = parseCSV(text);
                }
              }
            } catch (e) {
              // Asset fetch failed, continue without data
            }
          }
        }
      }

      // Apply filters if present
      const filters = fields.filters?.['en-US'] || null;
      let filteredResult = { displayData: rawData, keyColumn: null, keyColumnIndex: -1, keyValues: [] };
      if (rawData && filters) {
        filteredResult = applyFilters(rawData, filters);
      }

      const tableJson = {
        type: fields.type?.['en-US'] || 'Plain',
        title,
        style: fields.style?.['en-US'] || 'Equal Width',
        theme: fields.theme?.['en-US'] || 'Standard',
        fullWidth: fields.fullWidth?.['en-US'] ?? true,
        filters: filters,
        rawData: filteredResult.displayData || [],
        // Key-based filtering metadata
        keyColumn: filteredResult.keyColumn,
        keyColumnIndex: filteredResult.keyColumnIndex,
        keyValues: filteredResult.keyValues,
      };

      // Generate HTML
      tableJson.html = generateTableHtml(tableJson);

      const jsonStr = JSON.stringify(tableJson, null, 2);
      fs.writeFileSync(path.join(OUT_TABLES_DIR, `${id}.json`), jsonStr);
      fs.writeFileSync(path.join(WP_TABLES_DIR, `${id}.json`), jsonStr);

      success++;
      if (sourceType === 'spreadsheet') spreadsheetSuccess++;
      if (sourceType === 'inline') inlineSuccess++;

    } catch (error) {
      console.warn(`\n   ⚠️  Table ${id} (${title}): ${error.message}`);
      failed++;
    }
  }

  // Process TOC entries
  console.log('\n\n📑 Processing table of contents...');
  for (const toc of allTOC.items) {
    const id = toc.sys.id;
    const fields = toc.fields;
    const title = fields.title?.['en-US'] || '';

    try {
      const tocJson = {
        type: 'tableOfContents',
        title,
        style: fields.style?.['en-US'] || 'List',
        headerTags: fields.headerTags?.['en-US'] || ['H2'],
        isSticky: fields.isSticky?.['en-US'] || false,
      };

      const jsonStr = JSON.stringify(tocJson, null, 2);
      fs.writeFileSync(path.join(OUT_TABLES_DIR, `${id}.json`), jsonStr);
      fs.writeFileSync(path.join(WP_TABLES_DIR, `${id}.json`), jsonStr);
      tocSuccess++;
    } catch (error) {
      console.warn(`   ⚠️  TOC ${id}: ${error.message}`);
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 TABLE RE-EXTRACTION SUMMARY\n');
  console.log(`   Total tables: ${success}/${allTables.length}`);
  console.log(`     Inline data: ${inlineSuccess}`);
  console.log(`     Spreadsheet: ${spreadsheetSuccess}`);
  console.log(`   TOC entries: ${tocSuccess}`);
  console.log(`   Failed: ${failed}`);
  console.log(`\n   Files saved to:`);
  console.log(`     ${OUT_TABLES_DIR}`);
  console.log(`     ${WP_TABLES_DIR}`);
  console.log('\n✨ Re-extraction complete!');
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
