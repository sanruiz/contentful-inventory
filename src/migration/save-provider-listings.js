#!/usr/bin/env node

/**
 * Save Provider Listings to WordPress Custom Field
 *
 * Downloads the provider listings CSV (from the card data source),
 * filters rows by each city's slug (key column), and saves the
 * matching rows as a JSON custom field `provider_listings` on each
 * WordPress community post of type "city".
 *
 * This allows the frontend (e.g., headless/Next.js) to access
 * provider listings data directly from the REST API or GraphQL
 * without relying on shortcode rendering.
 *
 * Usage: node src/migration/save-provider-listings.js
 *   Options:
 *     --dry-run     Preview without updating WP posts
 *     --limit=N     Process only first N cities
 *     --state=XX    Only process cities for a specific state
 */

import 'dotenv/config';
import fetch from 'node-fetch';
import https from 'https';
import fs from 'fs';
import path from 'path';

// ─── Configuration ───────────────────────────────────────────────────

const WP_BASE_URL = process.env.WP_BASE_URL;
const WP_USERNAME = process.env.WP_USERNAME;
const WP_PASSWORD = process.env.WP_APPLICATION_PASSWORD;

const agent = new https.Agent({ rejectUnauthorized: false });
const wpAuth = Buffer.from(`${WP_USERNAME}:${WP_PASSWORD}`).toString('base64');

// The card data file that contains the source CSV URL
const CARD_DATA_PATH = path.join(process.cwd(), 'out', 'cards', '1xZL9ddpnnXt4at49qfB92.json');

const RATE_LIMIT_DELAY = 100; // ms between WP requests

// ─── CLI Arguments ───────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 0;
const STATE_FILTER = args.find(a => a.startsWith('--state='))?.split('=')[1]?.toUpperCase() || '';

// ─── WordPress API Helpers ───────────────────────────────────────────

async function wpFetch(endpoint, options = {}) {
  const url = `${WP_BASE_URL}/wp-json/wp/v2${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${wpAuth}`,
      ...options.headers,
    },
    agent,
    ...options,
  });
  return response;
}

/**
 * Fetch all city community posts from WordPress (paginated).
 */
async function fetchAllCityPosts() {
  const posts = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const res = await wpFetch(`/community?listing_type=city&per_page=${perPage}&page=${page}&status=any`);

    if (!res.ok) {
      if (res.status === 400) break; // No more pages
      throw new Error(`Failed to fetch posts: ${res.status} ${res.statusText}`);
    }

    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    posts.push(...batch);
    process.stdout.write(`\r   Fetched ${posts.length} city posts...`);

    const totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1');
    if (page >= totalPages) break;
    page++;
  }

  console.log(`\n   Total: ${posts.length} city posts`);
  return posts;
}

// ─── CSV Parsing ─────────────────────────────────────────────────────

/**
 * Parse CSV content into array of rows (each row is array of strings).
 * Handles quoted fields with commas and newlines.
 */
function parseCsv(csvText) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  const row = [];

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(current.trim());
        current = '';
      } else if (char === '\n' || (char === '\r' && next === '\n')) {
        row.push(current.trim());
        if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
          rows.push([...row]);
        }
        row.length = 0;
        current = '';
        if (char === '\r') i++; // skip \n
      } else {
        current += char;
      }
    }
  }

  // Last row
  if (current || row.length > 0) {
    row.push(current.trim());
    rows.push([...row]);
  }

  return rows;
}

/**
 * Convert rows to array of objects using headers.
 * Excludes the "key" column from the output objects.
 */
function rowsToObjects(headers, rows) {
  return rows.map(row => {
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toLowerCase();
      if (header === 'key') continue; // Exclude key column
      obj[headers[i]] = row[i] || '';
    }
    return obj;
  });
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('🏥 Save Provider Listings to WordPress Custom Fields');
  console.log('='.repeat(60));

  if (DRY_RUN) console.log('🔍 DRY RUN MODE — no WordPress changes will be made\n');
  if (LIMIT) console.log(`📏 Limit: ${LIMIT} cities`);
  if (STATE_FILTER) console.log(`🗺️  State filter: ${STATE_FILTER} only`);

  // Validate environment
  if (!WP_BASE_URL || !WP_USERNAME || !WP_PASSWORD) {
    console.error('❌ Missing WordPress credentials. Check your .env file.');
    process.exit(1);
  }

  // ─── Step 1: Load card data to get CSV source URL ─────────────────

  console.log('\n📋 Loading card data...');
  if (!fs.existsSync(CARD_DATA_PATH)) {
    console.error(`❌ Card data file not found: ${CARD_DATA_PATH}`);
    console.error('   Run extract-charts.js first to generate card data.');
    process.exit(1);
  }

  const cardData = JSON.parse(fs.readFileSync(CARD_DATA_PATH, 'utf-8'));
  const csvUrl = cardData.source?.url;

  if (!csvUrl) {
    console.error('❌ No source URL found in card data.');
    process.exit(1);
  }

  console.log(`   Card: ${cardData.title}`);
  console.log(`   Source: ${csvUrl}`);

  // ─── Step 2: Download and parse CSV ───────────────────────────────

  console.log('\n📥 Downloading CSV data...');
  const csvResponse = await fetch(csvUrl);
  if (!csvResponse.ok) {
    console.error(`❌ Failed to download CSV: ${csvResponse.status}`);
    process.exit(1);
  }

  const csvText = await csvResponse.text();
  const allRows = parseCsv(csvText);

  if (allRows.length < 2) {
    console.error('❌ CSV has no data rows.');
    process.exit(1);
  }

  const headers = allRows[0];
  const dataRows = allRows.slice(1);
  console.log(`   Headers: ${headers.join(', ')}`);
  console.log(`   Data rows: ${dataRows.length}`);

  // Find key column index
  const keyColIdx = headers.findIndex(h => h.toLowerCase() === 'key');
  if (keyColIdx < 0) {
    console.error('❌ No "key" column found in CSV headers.');
    process.exit(1);
  }
  console.log(`   Key column: "${headers[keyColIdx]}" (index ${keyColIdx})`);

  // Build a map: key → rows
  const listingsByKey = {};
  for (const row of dataRows) {
    const key = (row[keyColIdx] || '').toLowerCase().trim();
    if (!key) continue;
    if (!listingsByKey[key]) listingsByKey[key] = [];
    listingsByKey[key].push(row);
  }

  const uniqueKeys = Object.keys(listingsByKey);
  console.log(`   Unique keys: ${uniqueKeys.length}`);

  // Determine display columns (from card data filters)
  const selectedColumns = cardData.filters?.selectedColumns || [];
  let displayHeaders = [];

  if (selectedColumns.length > 0) {
    for (const col of selectedColumns) {
      const colName = col.name || '';
      const idx = headers.findIndex(h => h.toLowerCase() === colName.toLowerCase());
      if (idx >= 0) {
        displayHeaders.push({ name: headers[idx], index: idx });
      }
    }
  }

  if (displayHeaders.length === 0) {
    // Fallback: use all columns except key and slug
    const hidden = ['key', 'slug'];
    for (let i = 0; i < headers.length; i++) {
      if (!hidden.includes(headers[i].toLowerCase())) {
        displayHeaders.push({ name: headers[i], index: i });
      }
    }
  }

  console.log(`   Display columns: ${displayHeaders.map(h => h.name).join(', ')}`);

  // ─── Step 3: Fetch all city posts from WordPress ──────────────────

  console.log('\n📡 Fetching city posts from WordPress...');
  let cityPosts = await fetchAllCityPosts();

  // Apply filters
  if (STATE_FILTER) {
    cityPosts = cityPosts.filter(p => (p.meta?.state_short || '').toUpperCase() === STATE_FILTER);
    console.log(`   Filtered to ${cityPosts.length} cities in ${STATE_FILTER}`);
  }

  if (LIMIT) {
    cityPosts = cityPosts.slice(0, LIMIT);
    console.log(`   Limited to ${cityPosts.length} cities`);
  }

  // ─── Step 4: Process each city and save custom field ──────────────

  console.log('\n🔄 Processing cities...\n');

  let updated = 0;
  let skipped = 0;
  let noListings = 0;
  let failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < cityPosts.length; i++) {
    const post = cityPosts[i];
    const slug = post.slug;
    const title = post.title?.rendered || post.slug;

    // Progress
    const elapsed = (Date.now() - startTime) / 1000;
    const avgPer = i > 0 ? elapsed / i : 0;
    const remaining = (cityPosts.length - i) * avgPer;
    const eta = remaining > 60 ? `${Math.round(remaining / 60)}m` : `${Math.round(remaining)}s`;

    // Find matching listings for this city slug
    const matchingRows = listingsByKey[slug.toLowerCase()] || [];

    if (matchingRows.length === 0) {
      noListings++;
      if (i < 10 || i % 50 === 0) {
        console.log(`   [${i + 1}/${cityPosts.length}] ⏭️  ${title} — no listings found`);
      }
      continue;
    }

    // Convert to array of objects
    const listings = rowsToObjects(headers, matchingRows);

    // Build the JSON payload
    const listingsJson = JSON.stringify(listings);

    // Check if already saved (skip if identical)
    const existingMeta = post.meta?.provider_listings || '';
    if (existingMeta === listingsJson) {
      skipped++;
      if (i < 10 || i % 50 === 0) {
        console.log(`   [${i + 1}/${cityPosts.length}] ✓ ${title} — already up to date (${listings.length} listings)`);
      }
      continue;
    }

    if (DRY_RUN) {
      console.log(`   [${i + 1}/${cityPosts.length}] 🔍 ${title} — would save ${listings.length} listings (${(listingsJson.length / 1024).toFixed(1)}KB)`);
      updated++;
      continue;
    }

    // Update WordPress post meta
    try {
      const res = await wpFetch(`/community/${post.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          meta: {
            provider_listings: listingsJson,
          },
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`HTTP ${res.status}: ${error}`);
      }

      updated++;
      console.log(`   [${i + 1}/${cityPosts.length}] ✅ ${title} — saved ${listings.length} listings (${(listingsJson.length / 1024).toFixed(1)}KB)${eta ? ` | ETA: ${eta}` : ''}`);

      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
    } catch (error) {
      failed++;
      console.error(`   [${i + 1}/${cityPosts.length}] ❌ ${title} — ${error.message}`);
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 PROVIDER LISTINGS SAVE SUMMARY\n');
  console.log(`   ✅ Updated:      ${updated}`);
  console.log(`   ✓  Already OK:   ${skipped}`);
  console.log(`   ⏭️  No listings:  ${noListings}`);
  console.log(`   ❌ Failed:       ${failed}`);
  console.log(`   📋 Total posts:  ${cityPosts.length}`);
  console.log(`   ⏱️  Time:         ${Math.floor(totalTime / 60)}m ${totalTime % 60}s`);

  // Save a sample of what was saved for debugging
  const sampleDir = path.join(process.cwd(), 'out', 'provider-listings-sample');
  if (!fs.existsSync(sampleDir)) fs.mkdirSync(sampleDir, { recursive: true });

  // Save a few samples
  let sampleCount = 0;
  for (const [key, rows] of Object.entries(listingsByKey)) {
    if (sampleCount >= 3) break;
    const listings = rowsToObjects(headers, rows);
    fs.writeFileSync(
      path.join(sampleDir, `${key}.json`),
      JSON.stringify(listings, null, 2)
    );
    sampleCount++;
  }
  console.log(`\n💾 Sample JSON files saved to: ${sampleDir}`);

  console.log('\n✨ Provider listings save complete!');
  console.log('\n📖 The data is now available via REST API:');
  console.log(`   GET ${WP_BASE_URL}/wp-json/wp/v2/community/<id>`);
  console.log('   → response.meta.provider_listings (JSON string)');
  console.log('\n   Frontend usage:');
  console.log('   const listings = JSON.parse(post.meta.provider_listings);');
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
