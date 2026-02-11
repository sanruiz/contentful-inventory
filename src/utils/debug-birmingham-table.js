#!/usr/bin/env node
/**
 * Debug: Show how a table is embedded in the Birmingham AL page in Contentful
 */
import 'dotenv/config';
import pkg from 'contentful-management';
const { createClient } = pkg;

const client = createClient({ accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN });
const space = await client.getSpace('61iwodu7d9u0');
const env = await space.getEnvironment('master');

// Find the Birmingham AL city page
const results = await env.getEntries({
  content_type: 'page',
  'fields.slug': 'birmingham-al-facilities',
  limit: 1,
});

const entry = results.items[0];
console.log('Entry ID:', entry.sys.id);
console.log('Title:', entry.fields.title?.['en-US']);
console.log('Slug:', entry.fields.slug?.['en-US']);

const body = entry.fields.body?.['en-US'];

// Show the full body structure with table references highlighted
console.log('\n📄 BODY RICH TEXT STRUCTURE:');
console.log('─'.repeat(70));

for (let i = 0; i < body.content.length; i++) {
  const node = body.content[i];

  if (node.nodeType === 'embedded-entry-block') {
    const id = node.data?.target?.sys?.id;
    const isTarget = id === '6OGCWSrHDT4MJviE31iLsa';
    const prefix = isTarget ? '🎯' : '📦';
    console.log(`  [${i}] ${prefix} embedded-entry-block → ${id}${isTarget ? ' ← THIS TABLE' : ''}`);
  } else if (node.nodeType.startsWith('heading-')) {
    const text = node.content?.map(c => c.value || '').join('') || '';
    console.log(`  [${i}] ${node.nodeType}: "${text}"`);
  } else if (node.nodeType === 'paragraph') {
    const text = node.content?.map(c => c.value || '').join('') || '';
    const preview = text.length > 90 ? text.substring(0, 90) + '...' : text;
    console.log(`  [${i}] paragraph: "${preview}"`);
  } else if (node.nodeType === 'unordered-list' || node.nodeType === 'ordered-list') {
    console.log(`  [${i}] ${node.nodeType} (${node.content?.length || 0} items)`);
  } else {
    console.log(`  [${i}] ${node.nodeType}`);
  }
}

// Now look at the table entry itself
console.log('\n\n📊 TABLE ENTRY DETAILS (6OGCWSrHDT4MJviE31iLsa):');
console.log('─'.repeat(70));

try {
  const tableEntry = await env.getEntry('6OGCWSrHDT4MJviE31iLsa');
  const ct = tableEntry.sys.contentType.sys.id;
  const fields = tableEntry.fields;
  
  console.log('Content Type:', ct);
  console.log('Title:', fields.title?.['en-US']);
  console.log('Type:', fields.type?.['en-US']);
  console.log('Style:', fields.style?.['en-US']);
  console.log('Theme:', fields.theme?.['en-US']);
  console.log('Full Width:', fields.fullWidth?.['en-US']);
  
  // Show filters
  const filters = fields.filters?.['en-US'];
  if (filters) {
    console.log('\nFilters:');
    console.log('  selectedColumns:', JSON.stringify(filters.selectedColumns));
    console.log('  selectedKey:', JSON.stringify(filters.selectedKey));
  }
  
  // Show data source
  const sourceRef = fields.source?.['en-US'];
  if (sourceRef?.sys?.id) {
    console.log('\nData Source Reference:', sourceRef.sys.id);
    
    const source = await env.getEntry(sourceRef.sys.id);
    const sourceCt = source.sys.contentType.sys.id;
    console.log('  Source Content Type:', sourceCt);
    console.log('  Source Title:', source.fields.title?.['en-US']);
    
    if (sourceCt === 'dataSourceTable') {
      const dt = source.fields.dataTable?.['en-US'];
      if (dt?.tableData) {
        console.log('  tableData rows:', dt.tableData.length);
        console.log('  Headers:', JSON.stringify(dt.tableData[0]));
        console.log('  Row 1:', JSON.stringify(dt.tableData[1]?.slice(0, 4)));
      }
    } else if (sourceCt === 'dataSourceSpreadsheet') {
      const assetRef = source.fields.source?.['en-US'];
      if (assetRef?.sys?.id) {
        const asset = await env.getAsset(assetRef.sys.id);
        const file = asset.fields.file?.['en-US'];
        console.log('  Spreadsheet Asset:', file?.fileName);
        console.log('  URL:', file?.url);
        console.log('  Content-Type:', file?.contentType);
      }
    }
  }
} catch (err) {
  console.log('Error fetching table entry:', err.message);
}

// Show the generated HTML in out/ for comparison
console.log('\n\n📝 GENERATED WP HTML (from out/communities/cities/birmingham-al.html):');
console.log('─'.repeat(70));
import fs from 'fs';
const htmlPath = '/Users/santiagoramirez/Sites/contentful-inventory/out/communities/cities/birmingham-al.html';
if (fs.existsSync(htmlPath)) {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  // Find all contentful_table shortcodes with surrounding context
  const lines = html.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('contentful_table') || lines[i].includes('contentful_toc')) {
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length - 1, i + 2);
      console.log(`\n  --- Line ${i + 1} ---`);
      for (let j = start; j <= end; j++) {
        const marker = j === i ? '→ ' : '  ';
        console.log(`  ${marker}${lines[j]}`);
      }
    }
  }
} else {
  console.log('  File not found');
}
