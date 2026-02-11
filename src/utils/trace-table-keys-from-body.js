#!/usr/bin/env node

/**
 * Debug: Check if table embedded-entry-block nodes carry key data
 * in their node.data properties (not just the target reference)
 */

import 'dotenv/config';
import pkg from 'contentful-management';
const { createClient } = pkg;

const client = createClient({ accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN });
const space = await client.getSpace('61iwodu7d9u0');
const env = await space.getEnvironment('master');

const TABLE_ID = '6OGCWSrHDT4MJviE31iLsa';

// Find Birmingham page
const pages = await env.getEntries({
  content_type: 'page',
  'fields.slug': 'birmingham-al-facilities',
  limit: 1,
});

const page = pages.items[0];
const body = page.fields.body?.['en-US'];

console.log('🔍 Looking at embedded-entry-block nodes that reference table', TABLE_ID);
console.log('');

let count = 0;
function inspect(node, parentContent, idx) {
  if (!node) return;
  
  if (node.nodeType === 'embedded-entry-block' && node.data?.target?.sys?.id === TABLE_ID) {
    count++;
    
    // Get preceding sibling for context
    let prevHeading = '';
    if (parentContent && idx > 0) {
      for (let j = idx - 1; j >= 0; j--) {
        const sib = parentContent[j];
        if (sib.nodeType?.startsWith('heading-')) {
          prevHeading = extractText(sib);
          break;
        }
      }
    }
    
    console.log(`── Reference #${count} (preceded by: "${prevHeading}") ──`);
    console.log('   Full node.data:', JSON.stringify(node.data, null, 4));
    console.log('');
  }
  
  if (node.content) {
    node.content.forEach((child, i) => inspect(child, node.content, i));
  }
}

function extractText(node) {
  if (!node) return '';
  if (node.value) return node.value;
  if (node.content) return node.content.map(extractText).join('');
  return '';
}

inspect(body, null, 0);
console.log(`\nTotal references: ${count}`);

// Also check the table entry itself for keys field
console.log('\n\n📊 Table entry fields:');
const table = await env.getEntry(TABLE_ID);
const fields = table.fields;
for (const [key, val] of Object.entries(fields)) {
  const v = val?.['en-US'];
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    console.log(`   ${key}: ${v}`);
  } else if (Array.isArray(v)) {
    console.log(`   ${key}: [${v.join(', ')}]`);
  } else if (v?.sys) {
    console.log(`   ${key}: → ${v.sys.linkType} ${v.sys.id}`);
  } else {
    console.log(`   ${key}: ${JSON.stringify(v)?.substring(0, 120)}`);
  }
}
