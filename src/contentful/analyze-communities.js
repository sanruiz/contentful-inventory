#!/usr/bin/env node

/**
 * Analyze State and City content types in Contentful
 * 
 * Inspects the structure of state listing and city listing entries
 * to plan the import into WordPress as a hierarchical CPT.
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

async function main() {
  console.log('🔍 Analyzing State & City content in Contentful...\n');

  const space = await client.getSpace(spaceId);
  const environment = await space.getEnvironment(envId);

  // Step 1: List all content types to find state/city related ones
  const contentTypes = await environment.getContentTypes({ limit: 100 });
  
  console.log('=== ALL CONTENT TYPES ===');
  for (const ct of contentTypes.items) {
    const entries = await environment.getEntries({ content_type: ct.sys.id, limit: 1 });
    console.log(`  ${ct.sys.id} (${ct.name}) — ${entries.total} entries`);
  }

  // Step 2: Look for state/city content types
  const possibleTypes = contentTypes.items.filter(ct => {
    const name = ct.name.toLowerCase();
    const id = ct.sys.id.toLowerCase();
    return name.includes('state') || name.includes('city') || name.includes('listing') ||
           name.includes('location') || name.includes('communit') || name.includes('facilit') ||
           id.includes('state') || id.includes('city') || id.includes('listing') ||
           id.includes('location') || id.includes('communit');
  });

  console.log('\n=== POTENTIAL STATE/CITY CONTENT TYPES ===');
  for (const ct of possibleTypes) {
    console.log(`\n📋 Content Type: ${ct.sys.id} (${ct.name})`);
    console.log('   Fields:');
    for (const field of ct.fields) {
      const extra = [];
      if (field.required) extra.push('required');
      if (field.localized) extra.push('localized');
      if (field.type === 'Link') extra.push(`→ ${field.linkType}`);
      if (field.type === 'Array' && field.items) extra.push(`Array<${field.items.type}${field.items.linkType ? ':' + field.items.linkType : ''}>`);
      console.log(`     - ${field.id} (${field.type}) ${extra.length ? '[' + extra.join(', ') + ']' : ''}`);
    }

    // Fetch a few sample entries
    const entries = await environment.getEntries({ content_type: ct.sys.id, limit: 3 });
    console.log(`\n   Sample entries (${entries.total} total):`);
    for (const entry of entries.items) {
      const fields = entry.fields;
      const title = fields.title?.['en-US'] || fields.name?.['en-US'] || fields.stateName?.['en-US'] || fields.cityName?.['en-US'] || 'N/A';
      const slug = fields.slug?.['en-US'] || fields.urlSlug?.['en-US'] || 'N/A';
      console.log(`     • "${title}" — slug: ${slug} — id: ${entry.sys.id}`);
      
      // Show all field keys and their value types
      console.log(`       Fields present: ${Object.keys(fields).join(', ')}`);
      
      // Show field value previews
      for (const [key, value] of Object.entries(fields)) {
        const val = value['en-US'];
        if (val === null || val === undefined) continue;
        
        if (typeof val === 'string') {
          console.log(`       ${key}: "${val.substring(0, 80)}${val.length > 80 ? '...' : ''}"`);
        } else if (typeof val === 'number' || typeof val === 'boolean') {
          console.log(`       ${key}: ${val}`);
        } else if (val?.sys?.type === 'Link') {
          console.log(`       ${key}: → ${val.sys.linkType} ${val.sys.id}`);
        } else if (Array.isArray(val)) {
          if (val.length > 0 && val[0]?.sys?.type === 'Link') {
            console.log(`       ${key}: [${val.length} links → ${val[0].sys.linkType}]`);
          } else if (val.length > 0 && val[0]?.nodeType) {
            console.log(`       ${key}: [Rich Text content]`);
          } else {
            console.log(`       ${key}: [Array of ${val.length} items]`);
          }
        } else if (val?.nodeType === 'document') {
          // Rich text - count nodes
          const nodeCount = val.content?.length || 0;
          const nodeTypes = [...new Set((val.content || []).map(n => n.nodeType))];
          console.log(`       ${key}: [Rich Text — ${nodeCount} nodes: ${nodeTypes.join(', ')}]`);
        } else if (typeof val === 'object') {
          console.log(`       ${key}: {${Object.keys(val).join(', ')}}`);
        }
      }
      console.log('');
    }
  }

  // Step 3: Deep dive - get counts
  console.log('\n=== ENTRY COUNTS ===');
  for (const ct of possibleTypes) {
    const entries = await environment.getEntries({ content_type: ct.sys.id, limit: 1 });
    console.log(`  ${ct.sys.id}: ${entries.total} entries`);
  }

  // Save analysis to file
  const outDir = path.join(__dirname, '../../out');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  
  const report = {
    date: new Date().toISOString(),
    contentTypes: possibleTypes.map(ct => ({
      id: ct.sys.id,
      name: ct.name,
      fields: ct.fields.map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        required: f.required,
        linkType: f.linkType,
        itemsType: f.items?.type,
      })),
    })),
  };
  
  fs.writeFileSync(
    path.join(outDir, 'community-analysis.json'),
    JSON.stringify(report, null, 2)
  );
  
  console.log('\n✅ Analysis saved to out/community-analysis.json');
}

main().catch(console.error);
