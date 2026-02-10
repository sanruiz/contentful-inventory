#!/usr/bin/env node

/**
 * Extract Missing Tables for Guide Posts
 * 
 * Identifies table components referenced in the 6 guide posts that haven't
 * been extracted yet, fetches them from Contentful, generates JSON + HTML,
 * and installs them into WordPress.
 * 
 * Usage: node src/migration/extract-guide-tables.js
 */

import 'dotenv/config';
import pkg from 'contentful-management';
const { createClient } = pkg;
import fs from 'fs';
import path from 'path';

// ─── Configuration ───────────────────────────────────────────────────

const client = createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

const spaceId = process.env.CONTENTFUL_SPACE_ID || '61iwodu7d9u0';
const envId = process.env.CONTENTFUL_ENVIRONMENT_ID || 'master';
const WP_BASE_URL = process.env.WP_BASE_URL;

const TARGET_SLUGS = [
  'diabetes-care-guide-for-seniors',
  'guide-to-lgbtqia-senior-housing',
  'financial-assistance-for-seniors',
  'financial-and-legal-planning-resources-for-people-with-alzheimers',
  'guide-to-caring-for-an-aging-parent-from-a-long-distance',
  'senior-dental-care-guide',
];

// ─── CSV Parser ─────────────────────────────────────────────────────

/**
 * Parse CSV text into a 2D array, handling quoted fields with commas/newlines.
 */
function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i++;
      } else if (char === '"') {
        // End of quoted field
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        if (char === '\r') i++; // skip \n in \r\n
      } else {
        currentField += char;
      }
    }
  }
  
  // Push last field/row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f !== '')) {
      rows.push(currentRow);
    }
  }
  
  return rows;
}

// ─── Table Processing (from table-processor.js) ─────────────────────

function escapeHtml(text) {
  if (typeof text !== 'string') return String(text ?? '');
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function processTableOfContents(tableConfig) {
  const fields = tableConfig.fields;
  const title = fields.title?.['en-US'] || 'Table of Contents';
  const headerTags = fields.includedHeaderTags?.['en-US'] || ['H2'];
  const style = fields.style?.['en-US'] || 'List';
  const isSticky = fields.stickyOnScroll?.['en-US'] || false;

  const stickyClass = isSticky ? ' toc-sticky' : '';
  const styleClass = style.toLowerCase().replace(/\s+/g, '-');

  const html = `
<div class="contentful-toc${stickyClass} toc-style-${styleClass}">
  <h3 class="toc-title">${escapeHtml(title)}</h3>
  <div class="toc-container" data-headers="${headerTags.join(',')}">
  </div>
</div>
<script>
(function() {
  var tocContainer = document.querySelector('.toc-container[data-headers]');
  if (!tocContainer) return;
  var headers = tocContainer.getAttribute('data-headers').split(',');
  var selector = headers.map(function(h) { return h.toLowerCase(); }).join(', ');
  var headings = document.querySelectorAll(selector);
  if (headings.length === 0) return;
  var tocHTML = '<ul class="toc-list">';
  headings.forEach(function(heading, index) {
    var id = heading.id || 'heading-' + index;
    if (!heading.id) heading.id = id;
    tocHTML += '<li><a href="#' + id + '">' + heading.textContent + '</a></li>';
  });
  tocHTML += '</ul>';
  tocContainer.innerHTML = tocHTML;
})();
</script>`;

  return {
    type: 'tableOfContents',
    title,
    headerTags,
    style,
    isSticky,
    html,
  };
}

async function processDataVisualizationTable(tableConfig, environment) {
  const fields = tableConfig.fields;
  const title = fields.title?.['en-US'] || 'Data Table';
  const sourceId = fields.source?.['en-US']?.sys?.id;

  if (!sourceId) {
    console.warn(`   ⚠️  No source ID for table: ${title}`);
    return null;
  }

  const sourceEntry = await environment.getEntry(sourceId);
  const sourceCt = sourceEntry.sys.contentType.sys.id;
  
  let rawData;
  
  if (sourceCt === 'dataSourceSpreadsheet') {
    // Source is a spreadsheet asset — download and parse CSV
    const assetId = sourceEntry.fields.source?.['en-US']?.sys?.id;
    if (!assetId) {
      console.warn(`   ⚠️  No asset ID for spreadsheet source: ${title}`);
      return null;
    }
    const asset = await environment.getAsset(assetId);
    const fileUrl = asset.fields.file?.['en-US']?.url;
    if (!fileUrl) {
      console.warn(`   ⚠️  No file URL for spreadsheet: ${title}`);
      return null;
    }
    
    const url = fileUrl.startsWith('//') ? `https:${fileUrl}` : fileUrl;
    const response = await globalThis.fetch(url);
    const csvText = await response.text();
    rawData = parseCSV(csvText);
    console.log(`      📊 Parsed CSV: ${rawData.length} rows, ${rawData[0]?.length || 0} columns`);
  } else {
    // Standard dataTable source
    rawData = sourceEntry.fields.dataTable?.['en-US']?.tableData;
  }

  if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
    console.warn(`   ⚠️  No valid table data for: ${title}`);
    return null;
  }

  const filters = fields.filters?.['en-US'];
  const style = fields.style?.['en-US'] || 'Equal Width';
  const theme = fields.theme?.['en-US'] || 'Standard';
  const fullWidth = fields.fullWidth?.['en-US'] || false;

  const [headerRow, ...dataRows] = rawData;
  const selectedColumns = filters?.selectedColumns || headerRow.map((col, i) => ({ id: i, name: col }));

  // Detect URL column index for linking
  const urlColIndex = headerRow.findIndex(h => h.toLowerCase() === 'url');
  // Detect which column should be linked (first non-url, non-key column)
  const linkTargetColIndex = headerRow.findIndex((h, i) => 
    i !== urlColIndex && h.toLowerCase() !== 'key'
  );

  // Filter out 'url' and 'key' columns from display
  const displayColumns = selectedColumns.filter(col => {
    const name = (typeof col.name === 'string' ? col.name : '').toLowerCase().trim();
    return name !== 'url' && name !== 'key';
  });

  const widthClass = fullWidth ? 'table-full-width' : '';
  const styleClass = style.toLowerCase().replace(/\s+/g, '-');
  const themeClass = theme.toLowerCase().replace(/\s+/g, '-');

  let html = `<div class="contentful-data-table ${widthClass} style-${styleClass} theme-${themeClass}">
  <h3 class="table-title">${escapeHtml(title)}</h3>
  <div class="table-responsive">
    <table class="data-table">
      <thead>
        <tr>\n`;

  displayColumns.forEach(col => {
    const headerText = col.name !== '   ' ? col.name : '';
    html += `          <th>${escapeHtml(headerText)}</th>\n`;
  });

  html += `        </tr>
      </thead>
      <tbody>\n`;

  dataRows.forEach(row => {
    // Skip rows where key column is 'key' (header duplicates)
    const keyColIndex = headerRow.findIndex(h => h.toLowerCase() === 'key');
    if (keyColIndex >= 0 && row[keyColIndex] === 'key') return;
    
    html += `        <tr>\n`;
    displayColumns.forEach(col => {
      let cellData = '';
      if (typeof col.id === 'number' && row[col.id] !== undefined) {
        cellData = row[col.id];
      } else if (col.name && row[headerRow.indexOf(col.name)] !== undefined) {
        cellData = row[headerRow.indexOf(col.name)];
      }
      
      // If this is the linkable column and we have a URL, wrap in <a>
      const colIndex = typeof col.id === 'number' ? col.id : headerRow.indexOf(col.name);
      const rowUrl = urlColIndex >= 0 ? (row[urlColIndex] || '').trim() : '';
      
      if (colIndex === linkTargetColIndex && rowUrl && rowUrl.startsWith('http')) {
        html += `          <td><a href="${escapeHtml(rowUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cellData)}</a></td>\n`;
      } else {
        html += `          <td>${escapeHtml(cellData)}</td>\n`;
      }
    });
    html += `        </tr>\n`;
  });

  html += `      </tbody>
    </table>
  </div>
</div>`;

  return {
    type: 'dataVisualizationTable',
    title,
    style,
    theme,
    fullWidth,
    filters,
    rawData,
    html,
  };
}

async function fetchTableComponent(tableId, environment) {
  const tableConfig = await environment.getEntry(tableId);
  const contentType = tableConfig.sys.contentType.sys.id;

  if (contentType === 'tableOfContents') {
    return processTableOfContents(tableConfig);
  } else if (contentType === 'dataVisualizationTables') {
    return await processDataVisualizationTable(tableConfig, environment);
  } else if (contentType === 'link') {
    // Not a table — skip silently
    return null;
  } else {
    console.warn(`   ⚠️  Unknown content type: ${contentType} for entry ${tableId}`);
    return null;
  }
}

// ─── Collect table IDs from rich text ───────────────────────────────

function findEmbeddedEntryIds(node, ids = new Set()) {
  if (!node) return ids;
  if (
    (node.nodeType === 'embedded-entry-block' || node.nodeType === 'embedded-entry-inline') &&
    node.data?.target?.sys?.id
  ) {
    ids.add(node.data.target.sys.id);
  }
  if (node.content) {
    node.content.forEach(child => findEmbeddedEntryIds(child, ids));
  }
  return ids;
}

// ─── WordPress path detection ───────────────────────────────────────

function getWordPressTablesPath() {
  if (WP_BASE_URL?.includes('.local')) {
    const siteName = WP_BASE_URL.replace('https://', '').replace('http://', '').replace('.local', '');
    return `/Users/${process.env.USER}/Local Sites/${siteName}/app/public/wp-content/contentful-tables`;
  }
  return null;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 Extract Missing Tables for Guide Posts');
  console.log('='.repeat(60));

  const space = await client.getSpace(spaceId);
  const environment = await space.getEnvironment(envId);

  // 1. Get existing tables
  const tablesDir = path.join(process.cwd(), 'out', 'tables');
  if (!fs.existsSync(tablesDir)) {
    fs.mkdirSync(tablesDir, { recursive: true });
  }

  const existingTables = new Set(
    fs.readdirSync(tablesDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
  );
  console.log(`\n📂 Existing tables: ${existingTables.size}`);

  // 2. Fetch guide posts and collect all embedded entry IDs
  console.log('\n📥 Scanning guide posts for table references...');
  const allTableIds = new Set();
  const tablePostMap = {}; // tableId → post title

  for (const slug of TARGET_SLUGS) {
    const entriesRes = await environment.getEntries({
      content_type: 'page',
      'fields.slug': slug,
      limit: 1,
    });

    if (entriesRes.items.length === 0) continue;

    const entry = entriesRes.items[0];
    const title = entry.fields.title?.['en-US'] || slug;
    const body = entry.fields.body?.['en-US'];

    if (!body) continue;

    const entryIds = findEmbeddedEntryIds(body);
    console.log(`   📄 ${title}: ${entryIds.size} embedded entries`);

    for (const id of entryIds) {
      allTableIds.add(id);
      if (!tablePostMap[id]) tablePostMap[id] = [];
      tablePostMap[id].push(title);
    }
  }

  // 3. Find missing tables
  const missingIds = [...allTableIds].filter(id => !existingTables.has(id));
  console.log(`\n📊 Total table references: ${allTableIds.size}`);
  console.log(`   Already extracted: ${allTableIds.size - missingIds.length}`);
  console.log(`   Missing: ${missingIds.length}`);

  if (missingIds.length === 0) {
    console.log('\n✅ All tables already extracted!');
    return;
  }

  // 4. Extract missing tables
  console.log(`\n🔄 Extracting ${missingIds.length} missing tables...\n`);
  const results = [];

  for (const tableId of missingIds) {
    const postNames = tablePostMap[tableId]?.join(', ') || 'unknown';
    console.log(`   📊 ${tableId}`);
    console.log(`      Used in: ${postNames}`);

    try {
      const tableData = await fetchTableComponent(tableId, environment);

      if (tableData) {
        // Save JSON
        const jsonPath = path.join(tablesDir, `${tableId}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(tableData, null, 2));

        // Save HTML
        const htmlPath = path.join(tablesDir, `${tableId}.html`);
        fs.writeFileSync(htmlPath, tableData.html);

        console.log(`      ✅ Saved: ${tableData.type} — "${tableData.title}"`);
        results.push({ tableId, type: tableData.type, title: tableData.title, success: true });
      } else {
        console.log(`      ❌ Could not process (no data)`);
        results.push({ tableId, success: false, error: 'No data returned' });
      }
    } catch (error) {
      console.log(`      ❌ Error: ${error.message}`);
      results.push({ tableId, success: false, error: error.message });
    }
  }

  // 5. Install to WordPress
  const wpTablesPath = getWordPressTablesPath();
  if (wpTablesPath) {
    console.log(`\n📦 Installing tables to WordPress: ${wpTablesPath}`);
    if (!fs.existsSync(wpTablesPath)) {
      fs.mkdirSync(wpTablesPath, { recursive: true });
    }

    const allJsonFiles = fs.readdirSync(tablesDir).filter(f => f.endsWith('.json'));
    let copied = 0;
    for (const file of allJsonFiles) {
      fs.copyFileSync(path.join(tablesDir, file), path.join(wpTablesPath, file));
      copied++;
    }
    console.log(`   ✅ Copied ${copied} table files to WordPress`);
  } else {
    console.log('\n⚠️  Could not detect WordPress path. Copy tables manually:');
    console.log(`   Source: ${tablesDir}`);
    console.log('   Target: /path/to/wordpress/wp-content/contentful-tables/');
  }

  // 6. Summary
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 EXTRACTION SUMMARY\n');
  console.log(`✅ Extracted: ${successful.length}/${missingIds.length}`);
  successful.forEach(r => {
    console.log(`   • ${r.title} (${r.type}) — ${r.tableId}`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    failed.forEach(r => {
      console.log(`   • ${r.tableId}: ${r.error}`);
    });
  }

  // Total tables now available
  const totalNow = fs.readdirSync(tablesDir).filter(f => f.endsWith('.json')).length;
  console.log(`\n📂 Total tables in out/tables/: ${totalNow}`);
  console.log('✨ Done!');
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
