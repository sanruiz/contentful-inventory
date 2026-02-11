#!/usr/bin/env node

/**
 * Debug: Trace how a specific table is embedded in a Contentful page
 */

import 'dotenv/config';
import pkg from 'contentful-management';
const { createClient } = pkg;

const client = createClient({ accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN });
const space = await client.getSpace('61iwodu7d9u0');
const env = await space.getEnvironment('master');

const TABLE_ID = '6OGCWSrHDT4MJviE31iLsa';
const CITY_SLUG = 'birmingham-al-facilities';

// 1. Find the Birmingham AL city page
console.log(`\n🔍 Finding page with slug: ${CITY_SLUG}`);
const pages = await env.getEntries({
  content_type: 'page',
  'fields.slug': CITY_SLUG,
  limit: 1,
});

if (pages.items.length === 0) {
  console.log('❌ Page not found');
  process.exit(1);
}

const page = pages.items[0];
console.log(`✅ Found: "${page.fields.title?.['en-US']}" (ID: ${page.sys.id})`);

// 2. Look at the table entry
console.log(`\n📊 Looking up table: ${TABLE_ID}`);
const table = await env.getEntry(TABLE_ID);
console.log(`   Title: ${table.fields.title?.['en-US']}`);
console.log(`   Type: ${table.fields.type?.['en-US']}`);
console.log(`   Content Type: ${table.sys.contentType.sys.id}`);

// 3. Scan the body rich text for embedded entry references to find this table
const body = page.fields.body?.['en-US'];
if (!body) {
  console.log('❌ No body content');
  process.exit(1);
}

console.log(`\n📄 Scanning body rich text for table references...`);

function findNodes(node, targetId, path = '') {
  const results = [];
  if (!node) return results;

  // Check if this node references our table
  if (node.data?.target?.sys?.id === targetId) {
    results.push({
      nodeType: node.nodeType,
      path,
      data: node.data,
    });
  }

  // Recurse into content
  if (node.content) {
    node.content.forEach((child, i) => {
      results.push(...findNodes(child, targetId, `${path}/content[${i}]`));
    });
  }

  return results;
}

const tableRefs = findNodes(body, TABLE_ID);
console.log(`   Found ${tableRefs.length} reference(s) to table ${TABLE_ID}:\n`);

for (const ref of tableRefs) {
  console.log(`   Node type: ${ref.nodeType}`);
  console.log(`   Path: ${ref.path}`);
  console.log(`   Link type: ${ref.data?.target?.sys?.linkType}`);
  console.log('');
}

// 4. Show the context around each reference (sibling nodes)
console.log(`\n📋 Context around each table reference:`);

function findNodesWithContext(node, targetId, parentPath = '', depth = 0) {
  if (!node || !node.content) return;

  for (let i = 0; i < node.content.length; i++) {
    const child = node.content[i];
    
    if (child.data?.target?.sys?.id === targetId) {
      console.log(`\n   ─── Reference at ${parentPath}/content[${i}] ───`);
      
      // Show 2 nodes before
      for (let j = Math.max(0, i - 2); j < i; j++) {
        const prev = node.content[j];
        const text = extractText(prev);
        console.log(`   [${j}] ${prev.nodeType}: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
      }
      
      // Show the table reference itself
      console.log(`   [${i}] >>> ${child.nodeType} → TARGET: ${child.data.target.sys.id} (${child.data.target.sys.linkType}) <<<`);
      
      // Show 2 nodes after
      for (let j = i + 1; j <= Math.min(node.content.length - 1, i + 2); j++) {
        const next = node.content[j];
        const text = extractText(next);
        console.log(`   [${j}] ${next.nodeType}: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
      }
    }
    
    // Recurse
    findNodesWithContext(child, targetId, `${parentPath}/content[${i}]`, depth + 1);
  }
}

function extractText(node) {
  if (!node) return '';
  if (node.value) return node.value;
  if (node.content) return node.content.map(extractText).join('');
  return '';
}

findNodesWithContext(body, TABLE_ID);

// 5. Show how many times the SAME table ID appears (it appeared multiple times in the screenshot)
console.log(`\n\n📊 All embedded-entry-block references in body:`);
let embeddedCount = 0;
function countEmbedded(node) {
  if (!node) return;
  if (node.nodeType === 'embedded-entry-block') {
    embeddedCount++;
    const id = node.data?.target?.sys?.id;
    const isTarget = id === TABLE_ID ? ' ⭐' : '';
    console.log(`   [${embeddedCount}] ${id}${isTarget}`);
  }
  if (node.content) node.content.forEach(countEmbedded);
}
countEmbedded(body);
console.log(`\n   Total embedded entries: ${embeddedCount}`);
