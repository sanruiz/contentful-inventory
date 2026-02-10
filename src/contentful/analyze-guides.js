#!/usr/bin/env node

/**
 * Analyze Guide Posts in Contentful
 * 
 * Fetches and analyzes the content structure of specific guide posts
 * to determine what conversion is needed for WordPress import.
 */

import 'dotenv/config';
import pkg from 'contentful-management';
const { createClient } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

const spaceId = process.env.CONTENTFUL_SPACE_ID || '61iwodu7d9u0';
const envId = process.env.CONTENTFUL_ENVIRONMENT_ID || 'master';

// Target slugs for guide posts
const TARGET_SLUGS = [
  'diabetes-care-guide-for-seniors',
  'guide-to-lgbtqia-senior-housing',
  'financial-assistance-for-seniors',
  'financial-and-legal-planning-resources-for-people-with-alzheimers',
  'guide-to-caring-for-an-aging-parent-from-a-long-distance',
  'senior-dental-care-guide',
];

/**
 * Recursively analyze rich text node structure
 */
function analyzeNode(node, depth = 0) {
  const info = {
    nodeType: node.nodeType,
    depth,
  };

  if (node.value) {
    info.valuePreview = node.value.substring(0, 100);
  }

  // Check for marks (bold, italic, etc.)
  if (node.marks && node.marks.length > 0) {
    info.marks = node.marks.map(m => m.type);
  }

  // Check for data (links, embedded entries, etc.)
  if (node.data && Object.keys(node.data).length > 0) {
    if (node.data.uri) {
      info.linkUri = node.data.uri;
    }
    if (node.data.target) {
      info.targetType = node.data.target.sys?.type;
      info.targetLinkType = node.data.target.sys?.linkType;
      info.targetId = node.data.target.sys?.id;
    }
  }

  // Process children
  if (node.content && Array.isArray(node.content)) {
    info.childCount = node.content.length;
    info.children = node.content.map(child => analyzeNode(child, depth + 1));
  }

  return info;
}

/**
 * Collect unique node types used in the document
 */
function collectNodeTypes(node, types = new Set()) {
  types.add(node.nodeType);
  if (node.marks) {
    node.marks.forEach(m => types.add(`mark:${m.type}`));
  }
  if (node.content) {
    node.content.forEach(child => collectNodeTypes(child, types));
  }
  return types;
}

/**
 * Collect all embedded entries and assets
 */
function collectEmbeddedRefs(node, refs = { entries: [], assets: [], links: [] }) {
  if (node.nodeType === 'embedded-entry-block' || node.nodeType === 'embedded-entry-inline') {
    refs.entries.push({
      nodeType: node.nodeType,
      id: node.data?.target?.sys?.id,
    });
  }
  if (node.nodeType === 'embedded-asset-block') {
    refs.assets.push({
      nodeType: node.nodeType,
      id: node.data?.target?.sys?.id,
    });
  }
  if (node.nodeType === 'hyperlink') {
    refs.links.push({
      uri: node.data?.uri,
    });
  }
  if (node.nodeType === 'entry-hyperlink') {
    refs.links.push({
      type: 'entry-hyperlink',
      id: node.data?.target?.sys?.id,
    });
  }
  if (node.nodeType === 'asset-hyperlink') {
    refs.links.push({
      type: 'asset-hyperlink',
      id: node.data?.target?.sys?.id,
    });
  }
  if (node.content) {
    node.content.forEach(child => collectEmbeddedRefs(child, refs));
  }
  return refs;
}

async function main() {
  console.log('🔍 Analyzing Guide Posts in Contentful...\n');

  const space = await client.getSpace(spaceId);
  const environment = await space.getEnvironment(envId);

  // First, list all content types to find the right one
  console.log('📋 Listing content types with slug field...');
  const contentTypesRes = await environment.getContentTypes({ limit: 100 });
  
  const typesWithSlug = contentTypesRes.items.filter(ct => 
    ct.fields.some(f => f.id === 'slug')
  );
  
  console.log(`   Found ${typesWithSlug.length} content types with "slug" field:`);
  typesWithSlug.forEach(ct => {
    console.log(`   • ${ct.sys.id} (${ct.name}) - ${ct.fields.length} fields`);
  });

  const results = [];

  for (const slug of TARGET_SLUGS) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔎 Searching for slug: ${slug}`);
    
    let foundEntry = null;
    
    // Search across all content types that have a slug field
    for (const ct of typesWithSlug) {
      try {
        const entries = await environment.getEntries({
          content_type: ct.sys.id,
          'fields.slug': slug,
          limit: 1,
        });
        
        if (entries.items.length > 0) {
          foundEntry = entries.items[0];
          console.log(`   ✅ Found in content type: ${ct.sys.id} (${ct.name})`);
          break;
        }
      } catch (err) {
        // Skip errors (some content types may not support this query)
      }
    }
    if (!foundEntry) {
      console.log(`   ❌ Not found in any content type!`);
      results.push({ slug, found: false });
      continue;
    }

    const entry = foundEntry;
    const fields = entry.fields;
    const contentType = entry.sys.contentType.sys.id;
    
    console.log(`   ✅ Found! Content Type: ${contentType}`);
    console.log(`   📋 Entry ID: ${entry.sys.id}`);
    console.log(`   📋 Title: ${fields.title?.['en-US'] || fields.title || 'N/A'}`);
    
    // List all available fields
    const fieldNames = Object.keys(fields);
    console.log(`   📋 Available fields: ${fieldNames.join(', ')}`);

    // Check each field's type
    const fieldAnalysis = {};
    for (const [key, value] of Object.entries(fields)) {
      const val = value?.['en-US'] !== undefined ? value['en-US'] : value;
      
      if (val === null || val === undefined) {
        fieldAnalysis[key] = { type: 'null' };
      } else if (typeof val === 'string') {
        fieldAnalysis[key] = { type: 'string', length: val.length, preview: val.substring(0, 80) };
      } else if (typeof val === 'boolean') {
        fieldAnalysis[key] = { type: 'boolean', value: val };
      } else if (typeof val === 'number') {
        fieldAnalysis[key] = { type: 'number', value: val };
      } else if (Array.isArray(val)) {
        fieldAnalysis[key] = { type: 'array', length: val.length };
      } else if (val.nodeType === 'document') {
        // Rich text field
        const nodeTypes = collectNodeTypes(val);
        const refs = collectEmbeddedRefs(val);
        const topLevelNodes = val.content?.map(n => n.nodeType) || [];
        
        fieldAnalysis[key] = {
          type: 'richText',
          topLevelNodeCount: val.content?.length || 0,
          topLevelNodes: [...new Set(topLevelNodes)],
          allNodeTypes: [...nodeTypes],
          embeddedEntries: refs.entries.length,
          embeddedAssets: refs.assets.length,
          links: refs.links.length,
          embeddedEntryIds: refs.entries.map(e => e.id),
          embeddedAssetIds: refs.assets.map(a => a.id),
          linkDetails: refs.links,
        };
        
        console.log(`   📝 Rich Text field "${key}":`);
        console.log(`      - Top-level nodes: ${val.content?.length || 0}`);
        console.log(`      - Node types used: ${[...nodeTypes].join(', ')}`);
        console.log(`      - Embedded entries: ${refs.entries.length}`);
        console.log(`      - Embedded assets: ${refs.assets.length}`);
        console.log(`      - Links: ${refs.links.length}`);
        
        if (refs.entries.length > 0) {
          console.log(`      - Entry IDs: ${refs.entries.map(e => e.id).join(', ')}`);
          
          // Fetch embedded entry content types
          for (const ref of refs.entries) {
            try {
              const embeddedEntry = await environment.getEntry(ref.id);
              const embContentType = embeddedEntry.sys.contentType.sys.id;
              ref.contentType = embContentType;
              ref.title = embeddedEntry.fields.title?.['en-US'] || embeddedEntry.fields.name?.['en-US'] || 'N/A';
              console.log(`        • ${ref.id} → ${embContentType}: ${ref.title}`);
            } catch (err) {
              console.log(`        • ${ref.id} → Error: ${err.message}`);
              ref.contentType = 'error';
              ref.error = err.message;
            }
          }
        }
        
        if (refs.assets.length > 0) {
          console.log(`      - Asset IDs: ${refs.assets.map(a => a.id).join(', ')}`);
          
          for (const ref of refs.assets) {
            try {
              const asset = await environment.getAsset(ref.id);
              ref.title = asset.fields.title?.['en-US'] || 'N/A';
              ref.fileName = asset.fields.file?.['en-US']?.fileName || 'N/A';
              ref.contentType = asset.fields.file?.['en-US']?.contentType || 'N/A';
              ref.url = asset.fields.file?.['en-US']?.url || 'N/A';
              console.log(`        • ${ref.id} → ${ref.contentType}: ${ref.fileName}`);
            } catch (err) {
              console.log(`        • ${ref.id} → Error: ${err.message}`);
            }
          }
        }

      } else if (val.sys) {
        // Reference field
        fieldAnalysis[key] = { type: 'reference', linkType: val.sys.linkType, id: val.sys.id };
      } else {
        fieldAnalysis[key] = { type: typeof val, preview: JSON.stringify(val).substring(0, 100) };
      }
    }

    const result = {
      slug,
      found: true,
      entryId: entry.sys.id,
      contentType,
      title: fields.title?.['en-US'] || fields.title || 'N/A',
      fields: fieldAnalysis,
    };
    
    results.push(result);
  }

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('\n📊 ANALYSIS SUMMARY\n');
  
  const found = results.filter(r => r.found);
  const notFound = results.filter(r => !r.found);
  
  console.log(`Found: ${found.length}/${TARGET_SLUGS.length}`);
  if (notFound.length > 0) {
    console.log(`Not found: ${notFound.map(r => r.slug).join(', ')}`);
  }
  
  // Collect all unique content types, node types, and embedded component types
  const allNodeTypes = new Set();
  const allEmbeddedTypes = new Set();
  let totalEmbeddedEntries = 0;
  let totalEmbeddedAssets = 0;
  
  found.forEach(r => {
    Object.values(r.fields).forEach(f => {
      if (f.type === 'richText') {
        f.allNodeTypes?.forEach(t => allNodeTypes.add(t));
        totalEmbeddedEntries += f.embeddedEntries || 0;
        totalEmbeddedAssets += f.embeddedAssets || 0;
      }
    });
  });
  
  console.log(`\n📋 Rich Text Node Types Used Across All Posts:`);
  [...allNodeTypes].sort().forEach(t => console.log(`   • ${t}`));
  
  console.log(`\n📋 Total Embedded Entries: ${totalEmbeddedEntries}`);
  console.log(`📋 Total Embedded Assets: ${totalEmbeddedAssets}`);
  
  console.log('\n🔧 CONVERSION REQUIREMENTS:');
  console.log('   The following node types need conversion to WordPress HTML:');
  
  const conversionMap = {
    'document': '→ Root container (no conversion needed)',
    'paragraph': '→ <p> tags',
    'heading-1': '→ <h1>',
    'heading-2': '→ <h2>',
    'heading-3': '→ <h3>',
    'heading-4': '→ <h4>',
    'heading-5': '→ <h5>',
    'heading-6': '→ <h6>',
    'unordered-list': '→ <ul>',
    'ordered-list': '→ <ol>',
    'list-item': '→ <li>',
    'blockquote': '→ <blockquote>',
    'hr': '→ <hr>',
    'hyperlink': '→ <a href="...">',
    'entry-hyperlink': '→ <a> (needs entry URL resolution)',
    'asset-hyperlink': '→ <a> (needs asset URL resolution)',
    'embedded-entry-block': '→ Needs component rendering (tables, etc.)',
    'embedded-entry-inline': '→ Needs inline component rendering',
    'embedded-asset-block': '→ <img> or <figure> (needs asset URL)',
    'text': '→ Text node with marks',
    'mark:bold': '→ <strong>',
    'mark:italic': '→ <em>',
    'mark:underline': '→ <u>',
    'mark:code': '→ <code>',
    'mark:superscript': '→ <sup>',
    'mark:subscript': '→ <sub>',
    'table': '→ <table>',
    'table-row': '→ <tr>',
    'table-cell': '→ <td>',
    'table-header-cell': '→ <th>',
  };
  
  [...allNodeTypes].sort().forEach(t => {
    const conversion = conversionMap[t] || '→ (unknown - needs investigation)';
    console.log(`   ${t} ${conversion}`);
  });

  // Save analysis to file
  const outputDir = path.join(process.cwd(), 'out');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputPath = path.join(outputDir, 'guides-analysis.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Full analysis saved to: ${outputPath}`);
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
