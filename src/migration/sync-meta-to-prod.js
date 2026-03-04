#!/usr/bin/env node

/**
 * Sync Community Meta Fields: Local → Production
 *
 * Reads all community meta fields from local WordPress and pushes them
 * to production. Specifically handles `provider_listings` and any other
 * custom meta fields that may have been missed during content sync.
 *
 * Usage:
 *   node src/migration/sync-meta-to-prod.js --dry-run    # Preview only
 *   node src/migration/sync-meta-to-prod.js               # Sync all meta
 *   node src/migration/sync-meta-to-prod.js --only=provider_listings  # Single field
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import https from 'https';

dotenv.config();

// ─── Configuration ───────────────────────────────────────────────────

const LOCAL = {
  url: (process.env.WP_BASE_URL || 'https://memorycare.local').replace(/\/$/, ''),
  user: process.env.WP_USERNAME || 'sanruiz',
  pass: process.env.WP_APPLICATION_PASSWORD,
};

const PROD = {
  url: (process.env.WP_BASE_URL_PROD || 'https://backoffice.memorycare.com').replace(/\/$/, ''),
  user: process.env.WP_USERNAME_PROD || 'admin',
  pass: process.env.WP_APPLICATION_PASSWORD_PROD,
};

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY_FIELD = args.find(a => a.startsWith('--only='))?.split('=')[1] || '';

// Meta fields to sync
const META_FIELDS = [
  'contentful_id',
  'listing_type',
  'state_short',
  'state_long',
  'original_slug',
  'original_url',
  'content_bucket',
  'sitemap_group',
  'link_text',
  'hero_text_contrast',
  'noindex',
  'nofollow',
  'provider_listings',
];

// ─── Colors ──────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', gray: '\x1b[90m', cyan: '\x1b[36m',
};

const log = (msg) => console.log(`  ${msg}`);
const logOk = (msg) => console.log(`  ${c.green}✅ ${msg}${c.reset}`);
const logWarn = (msg) => console.log(`  ${c.yellow}⚠️  ${msg}${c.reset}`);
const logErr = (msg) => console.log(`  ${c.red}❌ ${msg}${c.reset}`);

// ─── API Helpers ─────────────────────────────────────────────────────

function authHeader(env) {
  return 'Basic ' + Buffer.from(`${env.user}:${env.pass}`).toString('base64');
}

async function apiFetch(env, endpoint, options = {}) {
  const url = `${env.url}/wp-json/wp/v2${endpoint}`;
  const isLocal = env.url.includes('.local');
  const resp = await fetch(url, {
    headers: {
      'Authorization': authHeader(env),
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...(isLocal ? { agent: httpsAgent } : {}),
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`API ${resp.status}: ${data.message || JSON.stringify(data)}`);
  }
  return {
    data,
    totalPages: parseInt(resp.headers.get('x-wp-totalpages') || '1'),
  };
}

async function fetchAll(env, endpoint) {
  const items = [];
  let page = 1;
  while (true) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const { data, totalPages } = await apiFetch(env, `${endpoint}${sep}per_page=100&page=${page}&status=any`);
    items.push(...data);
    if (page >= totalPages) break;
    page++;
  }
  return items;
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${c.bold}🔄 Sync Community Meta Fields: Local → Production${c.reset}`);
  console.log('═══════════════════════════════════════════════════════');

  if (DRY_RUN) logWarn('DRY-RUN MODE — no changes will be made\n');
  if (ONLY_FIELD) log(`${c.cyan}Only syncing: ${ONLY_FIELD}${c.reset}\n`);

  // Step 1: Fetch all local communities
  log(`${c.gray}Fetching local communities...${c.reset}`);
  const localCommunities = await fetchAll(LOCAL, '/community');
  log(`${c.gray}Local communities: ${localCommunities.length}${c.reset}`);

  // Step 2: Fetch all prod communities
  log(`${c.gray}Fetching prod communities...${c.reset}`);
  const prodCommunities = await fetchAll(PROD, '/community');
  log(`${c.gray}Prod communities: ${prodCommunities.length}${c.reset}`);

  // Build prod slug → ID map
  const prodMap = new Map(prodCommunities.map(p => [p.slug, { id: p.id, meta: p.meta || {} }]));

  // Step 3: Analyze what needs to be synced
  const fieldsToSync = ONLY_FIELD ? [ONLY_FIELD] : META_FIELDS;
  let totalNeedSync = 0;
  const syncItems = [];

  for (const local of localCommunities) {
    const prod = prodMap.get(local.slug);
    if (!prod) continue; // Not in prod, skip

    const localMeta = local.meta || {};
    const prodMeta = prod.meta || {};
    const diffs = {};

    for (const field of fieldsToSync) {
      const localVal = localMeta[field];
      const prodVal = prodMeta[field];

      // Skip if no local value
      if (localVal === undefined || localVal === null || localVal === '') continue;

      // Compare values (handle booleans, strings)
      const localStr = typeof localVal === 'boolean' ? String(localVal) : String(localVal);
      const prodStr = typeof prodVal === 'boolean' ? String(prodVal) : String(prodVal || '');

      if (localStr !== prodStr) {
        diffs[field] = localVal;
      }
    }

    if (Object.keys(diffs).length > 0) {
      syncItems.push({
        slug: local.slug,
        localId: local.id,
        prodId: prod.id,
        diffs,
      });
      totalNeedSync++;
    }
  }

  // Summary of what needs to sync
  console.log(`\n═══════════════════════════════════════════════════════`);
  log(`${c.bold}Analysis Results${c.reset}`);
  console.log(`═══════════════════════════════════════════════════════`);
  log(`${c.gray}Matched (local↔prod): ${prodMap.size} communities${c.reset}`);
  log(`${c.bold}Need meta sync: ${totalNeedSync} communities${c.reset}`);

  // Count by field
  const fieldCounts = {};
  for (const item of syncItems) {
    for (const field of Object.keys(item.diffs)) {
      fieldCounts[field] = (fieldCounts[field] || 0) + 1;
    }
  }
  for (const [field, count] of Object.entries(fieldCounts)) {
    log(`  ${c.cyan}${field}${c.reset}: ${count} items`);
  }

  if (totalNeedSync === 0) {
    logOk('All meta fields are already in sync!');
    return;
  }

  // Step 4: Sync
  console.log(`\n═══════════════════════════════════════════════════════`);
  log(`${c.bold}Syncing Meta Fields${c.reset}`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  let synced = 0;
  let failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < syncItems.length; i++) {
    const item = syncItems[i];
    const fields = Object.keys(item.diffs).join(', ');
    const progress = `[${i + 1}/${syncItems.length}]`;

    // ETA
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = i > 0 ? elapsed / i : 1;
    const remaining = (syncItems.length - i) * rate;
    const eta = remaining > 60 ? `${Math.round(remaining / 60)}m` : `${Math.round(remaining)}s`;

    if (DRY_RUN) {
      logWarn(`${progress} Would sync "${item.slug}" — ${fields}`);
      synced++;
      continue;
    }

    try {
      await apiFetch(PROD, `/community/${item.prodId}`, {
        method: 'PUT',
        body: { meta: item.diffs },
      });

      logOk(`${progress} Synced "${item.slug}" — ${fields} | ETA: ${eta}`);
      synced++;
    } catch (err) {
      logErr(`${progress} Failed "${item.slug}": ${err.message}`);
      failed++;
    }
  }

  // Summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n═══════════════════════════════════════════════════════`);
  log(`${c.bold}📊 Summary${c.reset}`);
  console.log(`═══════════════════════════════════════════════════════`);
  logOk(`Synced: ${synced}`);
  if (failed > 0) logErr(`Failed: ${failed}`);
  log(`${c.gray}Time: ${totalTime}s${c.reset}`);
}

main().catch(err => {
  logErr(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
