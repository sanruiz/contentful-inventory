#!/usr/bin/env node

/**
 * Analyze State and City pages within the 'page' content type
 * 
 * State URLs: memory-care-in-{state}/
 * City URLs: {city}-{state-short}-facilities/
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
  console.log('🔍 Scanning all pages for state/city patterns...\n');

  const space = await client.getSpace(spaceId);
  const environment = await space.getEnvironment(envId);

  // Fetch ALL page entries (paginated)
  const allPages = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    const batch = await environment.getEntries({
      content_type: 'page',
      limit,
      skip,
      select: 'sys.id,fields.slug,fields.title,fields.description',
    });
    allPages.push(...batch.items);
    console.log(`  Fetched ${allPages.length} / ${batch.total} pages...`);
    if (allPages.length >= batch.total) break;
    skip += limit;
  }

  console.log(`\n📊 Total pages: ${allPages.length}\n`);

  // Categorize pages by URL pattern
  const statePages = [];
  const cityPages = [];
  const otherPages = [];

  for (const entry of allPages) {
    const slug = entry.fields.slug?.['en-US'] || '';
    const title = entry.fields.title?.['en-US'] || '';

    if (slug.startsWith('memory-care-in-')) {
      statePages.push({ id: entry.sys.id, slug, title });
    } else if (slug.match(/-[a-z]{2}-facilities$/)) {
      cityPages.push({ id: entry.sys.id, slug, title });
    } else {
      otherPages.push({ id: entry.sys.id, slug, title });
    }
  }

  console.log('=== STATE PAGES ===');
  console.log(`Found: ${statePages.length} state pages\n`);
  for (const p of statePages.sort((a, b) => a.slug.localeCompare(b.slug))) {
    console.log(`  ${p.slug} — "${p.title}"`);
  }

  console.log('\n=== CITY PAGES ===');
  console.log(`Found: ${cityPages.length} city pages\n`);
  // Show first 20 and count by state
  const citiesByState = {};
  for (const p of cityPages) {
    const match = p.slug.match(/-([a-z]{2})-facilities$/);
    const stateCode = match ? match[1].toUpperCase() : 'UNKNOWN';
    if (!citiesByState[stateCode]) citiesByState[stateCode] = [];
    citiesByState[stateCode].push(p);
  }

  console.log('Cities per state:');
  for (const [state, cities] of Object.entries(citiesByState).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${state}: ${cities.length} cities`);
  }

  console.log(`\nFirst 20 city pages:`);
  for (const p of cityPages.slice(0, 20)) {
    console.log(`  ${p.slug} — "${p.title}"`);
  }

  console.log('\n=== OTHER PAGES (not state/city) ===');
  console.log(`Found: ${otherPages.length} other pages\n`);
  for (const p of otherPages.slice(0, 20)) {
    console.log(`  ${p.slug} — "${p.title}"`);
  }
  if (otherPages.length > 20) {
    console.log(`  ... and ${otherPages.length - 20} more`);
  }

  // Step 2: Deep dive into one state page to see full structure
  console.log('\n\n=== DEEP DIVE: SAMPLE STATE PAGE ===');
  if (statePages.length > 0) {
    const sampleState = await environment.getEntry(statePages[0].id);
    const fields = sampleState.fields;
    console.log(`\nState: ${fields.title?.['en-US']}`);
    console.log(`Slug: ${fields.slug?.['en-US']}`);
    console.log(`\nAll fields:`);
    for (const [key, value] of Object.entries(fields)) {
      const val = value['en-US'];
      if (val === null || val === undefined) {
        console.log(`  ${key}: null`);
      } else if (typeof val === 'string') {
        console.log(`  ${key}: "${val.substring(0, 120)}${val.length > 120 ? '...' : ''}"`);
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        console.log(`  ${key}: ${val}`);
      } else if (val?.sys?.type === 'Link') {
        console.log(`  ${key}: → ${val.sys.linkType} ${val.sys.id}`);
      } else if (Array.isArray(val)) {
        if (val.length > 0 && val[0]?.sys?.type === 'Link') {
          console.log(`  ${key}: [${val.length} links → ${val[0].sys.linkType}]`);
        } else {
          console.log(`  ${key}: [Array of ${val.length} items]`);
        }
      } else if (val?.nodeType === 'document') {
        const nodeCount = val.content?.length || 0;
        const nodeTypes = [...new Set((val.content || []).map(n => n.nodeType))];
        console.log(`  ${key}: [Rich Text — ${nodeCount} nodes: ${nodeTypes.join(', ')}]`);
      } else if (typeof val === 'object') {
        console.log(`  ${key}: {${Object.keys(val).join(', ')}}`);
      }
    }
  }

  // Step 3: Deep dive into one city page
  console.log('\n\n=== DEEP DIVE: SAMPLE CITY PAGE ===');
  if (cityPages.length > 0) {
    const sampleCity = await environment.getEntry(cityPages[0].id);
    const fields = sampleCity.fields;
    console.log(`\nCity: ${fields.title?.['en-US']}`);
    console.log(`Slug: ${fields.slug?.['en-US']}`);
    console.log(`\nAll fields:`);
    for (const [key, value] of Object.entries(fields)) {
      const val = value['en-US'];
      if (val === null || val === undefined) {
        console.log(`  ${key}: null`);
      } else if (typeof val === 'string') {
        console.log(`  ${key}: "${val.substring(0, 120)}${val.length > 120 ? '...' : ''}"`);
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        console.log(`  ${key}: ${val}`);
      } else if (val?.sys?.type === 'Link') {
        console.log(`  ${key}: → ${val.sys.linkType} ${val.sys.id}`);
      } else if (Array.isArray(val)) {
        if (val.length > 0 && val[0]?.sys?.type === 'Link') {
          console.log(`  ${key}: [${val.length} links → ${val[0].sys.linkType}]`);
        } else {
          console.log(`  ${key}: [Array of ${val.length} items]`);
        }
      } else if (val?.nodeType === 'document') {
        const nodeCount = val.content?.length || 0;
        const nodeTypes = [...new Set((val.content || []).map(n => n.nodeType))];
        console.log(`  ${key}: [Rich Text — ${nodeCount} nodes: ${nodeTypes.join(', ')}]`);
      } else if (typeof val === 'object') {
        console.log(`  ${key}: {${Object.keys(val).join(', ')}}`);
      }
    }
  }

  // Save results
  const outDir = path.join(__dirname, '../../out');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const report = {
    date: new Date().toISOString(),
    summary: {
      totalPages: allPages.length,
      statePages: statePages.length,
      cityPages: cityPages.length,
      otherPages: otherPages.length,
    },
    citiesByState: Object.fromEntries(
      Object.entries(citiesByState).map(([state, cities]) => [
        state,
        cities.map(c => ({ id: c.id, slug: c.slug, title: c.title })),
      ])
    ),
    statePages: statePages.sort((a, b) => a.slug.localeCompare(b.slug)),
  };

  fs.writeFileSync(
    path.join(outDir, 'community-pages-analysis.json'),
    JSON.stringify(report, null, 2)
  );

  console.log('\n\n✅ Analysis saved to out/community-pages-analysis.json');
}

main().catch(console.error);
