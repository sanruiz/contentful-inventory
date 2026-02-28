#!/usr/bin/env node

/**
 * Sync Communities: WordPress Local → Production
 * 
 * Migrates all community CPT entries from local to production.
 * Handles parent/child hierarchy (states → cities).
 * Processes in batches to avoid timeouts.
 * 
 * Usage:
 *   node src/migration/sync-communities-to-prod.js               # Migrate all
 *   node src/migration/sync-communities-to-prod.js --dry-run      # Preview
 *   node src/migration/sync-communities-to-prod.js --only=parents # Only states
 *   node src/migration/sync-communities-to-prod.js --only=children # Only cities
 *   node src/migration/sync-communities-to-prod.js --batch=50     # Custom batch size
 *   node src/migration/sync-communities-to-prod.js --update       # Update existing in prod
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import https from 'https';

dotenv.config();

// --- Configuration ---
const LOCAL = {
  url: process.env.WP_BASE_URL || 'https://memorycare.local',
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
const ONLY = args.find(a => a.startsWith('--only='))?.split('=')[1]; // parents | children
const BATCH_SIZE = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] || '20');
const UPDATE = args.includes('--update');

// --- Colors ---
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

function log(msg, color = '') { console.log(`${color}${msg}${c.reset}`); }
function logOk(msg) { log(`  ✅ ${msg}`, c.green); }
function logWarn(msg) { log(`  ⚠️  ${msg}`, c.yellow); }
function logErr(msg) { log(`  ❌ ${msg}`, c.red); }
function logInfo(msg) { log(`  ℹ️  ${msg}`, c.gray); }

// --- API Helpers ---

function authHeader(env) {
  return 'Basic ' + Buffer.from(`${env.user}:${env.pass}`).toString('base64');
}

function fetchOptions(env) {
  return {
    headers: {
      'Authorization': authHeader(env),
      'Content-Type': 'application/json',
    },
    ...(env.url.includes('.local') ? { agent: httpsAgent } : {}),
  };
}

async function apiFetch(env, endpoint, options = {}) {
  const url = `${env.url}/wp-json/wp/v2${endpoint}`;
  const opts = { ...fetchOptions(env), ...options };
  if (options.body) opts.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  if (options.method) opts.method = options.method;

  const resp = await fetch(url, opts);
  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(`API ${resp.status}: ${data.message || JSON.stringify(data)}`);
  }

  return {
    data,
    total: parseInt(resp.headers.get('x-wp-total') || '0'),
    totalPages: parseInt(resp.headers.get('x-wp-totalpages') || '1'),
  };
}

async function fetchAll(env, endpoint) {
  const items = [];
  let page = 1;
  while (true) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const { data, totalPages } = await apiFetch(env, `${endpoint}${separator}per_page=100&page=${page}&status=any`);
    items.push(...data);
    log(`    Fetched page ${page}/${totalPages} (${items.length} items)`, c.gray);
    if (page >= totalPages) break;
    page++;
  }
  return items;
}

// --- Helpers ---

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// --- Main Migration ---

async function main() {
  log('\n🏘️  WordPress Communities Migration: Local → Production', c.bold);
  log('═'.repeat(60), c.cyan);

  if (DRY_RUN) log('\n  🧪 DRY RUN MODE\n', c.yellow);
  if (UPDATE) log('  ✏️  UPDATE MODE — Existing communities will be overwritten\n', c.yellow);
  if (ONLY) log(`  🎯 Only: ${ONLY}\n`, c.yellow);
  log(`  Batch size: ${BATCH_SIZE}`, c.gray);

  // Step 1: Verify connections
  log('\n  Checking connections...', c.gray);
  try {
    const { data: u1 } = await apiFetch(LOCAL, '/users/me?_fields=id,name');
    logOk(`Local: Connected as "${u1.name}"`);
  } catch (err) { logErr(`Local: ${err.message}`); process.exit(1); }

  try {
    const { data: u2 } = await apiFetch(PROD, '/users/me?_fields=id,name');
    logOk(`Prod:  Connected as "${u2.name}"`);
  } catch (err) { logErr(`Prod: ${err.message}`); process.exit(1); }

  // Step 2: Fetch all local communities
  log('\n  Fetching local communities...', c.gray);
  const localCommunities = await fetchAll(LOCAL, '/community');
  log(`  Total local communities: ${localCommunities.length}`, c.bold);

  // Step 3: Fetch existing prod communities
  log('\n  Fetching prod communities...', c.gray);
  const prodCommunities = await fetchAll(PROD, '/community');
  const prodSlugs = new Map(prodCommunities.map(p => [p.slug, p.id]));
  log(`  Total prod communities: ${prodCommunities.length}`, c.bold);

  // Step 4: Separate parents (states) and children (cities)
  const parents = localCommunities.filter(c => c.parent === 0);
  const children = localCommunities.filter(c => c.parent !== 0);

  log(`\n  Parents (states): ${parents.length}`, c.gray);
  log(`  Children (cities): ${children.length}`, c.gray);

  // ID mapping: local ID → prod ID
  const idMap = {};

  // Also map any existing prod communities
  for (const pc of prodCommunities) {
    const lc = localCommunities.find(l => l.slug === pc.slug);
    if (lc) idMap[lc.id] = pc.id;
  }

  let created = 0, updated = 0, skipped = 0, failed = 0;
  const startTime = Date.now();

  // Step 5: Migrate parents first (states)
  if (ONLY !== 'children') {
  log('\n' + '═'.repeat(60), c.cyan);
  log('  Phase 1: Migrating Parent Communities (States)', c.bold);
  log('═'.repeat(60), c.cyan);

  for (let i = 0; i < parents.length; i++) {
    const item = parents[i];
    const progress = `[${i + 1}/${parents.length}]`;

    if (prodSlugs.has(item.slug)) {
      const prodId = prodSlugs.get(item.slug);
      idMap[item.id] = prodId;

      if (UPDATE) {
        if (DRY_RUN) {
          logWarn(`${progress} [DRY-RUN] Would update parent: "${item.slug}" (prod ID: ${prodId})`);
          updated++;
          continue;
        }

        try {
          const body = {
            title: item.title.rendered,
            content: item.content.rendered,
            excerpt: item.excerpt?.rendered || '',
            status: item.status,
            parent: 0,
          };
          if (item.meta && Object.keys(item.meta).length > 0) {
            body.meta = item.meta;
          }
          await apiFetch(PROD, `/community/${prodId}`, { method: 'PUT', body });
          logOk(`${progress} Updated: "${item.slug}" (prod ID: ${prodId})`);
          updated++;
        } catch (err) {
          logErr(`${progress} Failed to update "${item.slug}": ${err.message}`);
          failed++;
        }
        continue;
      }

      logInfo(`${progress} "${item.slug}" already exists (prod ID: ${prodId})`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      logWarn(`${progress} [DRY-RUN] Would create parent: ${item.slug}`);
      continue;
    }

    try {
      const body = {
        title: item.title.rendered,
        slug: item.slug,
        content: item.content.rendered,
        excerpt: item.excerpt?.rendered || '',
        status: item.status,
        parent: 0,
      };

      // Include meta fields
      if (item.meta && Object.keys(item.meta).length > 0) {
        body.meta = item.meta;
      }

      const { data } = await apiFetch(PROD, '/community', { method: 'POST', body });
      idMap[item.id] = data.id;
      logOk(`${progress} Created: ${data.slug} (prod ID: ${data.id})`);
      created++;
    } catch (err) {
      logErr(`${progress} Failed "${item.slug}": ${err.message}`);
      failed++;
    }
  }
  } // end parents

  // Step 6: Migrate children (cities) in batches
  if (ONLY !== 'parents') {
  log('\n' + '═'.repeat(60), c.cyan);
  log('  Phase 2: Migrating Child Communities (Cities)', c.bold);
  log('═'.repeat(60), c.cyan);

  const totalBatches = Math.ceil(children.length / BATCH_SIZE);

  for (let batch = 0; batch < totalBatches; batch++) {
    const start = batch * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, children.length);
    const batchItems = children.slice(start, end);

    const elapsed = (Date.now() - startTime) / 1000;
    const processed = created + updated;
    const rate = processed > 0 ? elapsed / processed : 0;
    const remaining = (children.length - start) * rate;

    log(`\n  📦 Batch ${batch + 1}/${totalBatches} (items ${start + 1}-${end}) | Elapsed: ${formatTime(elapsed)} | ETA: ${formatTime(remaining)}`, c.blue);

    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];
      const globalIdx = start + i + 1;
      const progress = `[${globalIdx}/${children.length}]`;

      if (prodSlugs.has(item.slug)) {
        const prodId = prodSlugs.get(item.slug);
        idMap[item.id] = prodId;

        if (UPDATE) {
          if (DRY_RUN) {
            logWarn(`${progress} [DRY-RUN] Would update: "${item.slug}" (prod ID: ${prodId})`);
            updated++;
            continue;
          }

          try {
            const prodParentId = idMap[item.parent] || 0;
            const body = {
              title: item.title.rendered,
              content: item.content.rendered,
              excerpt: item.excerpt?.rendered || '',
              status: item.status,
              parent: prodParentId,
            };
            if (item.meta && Object.keys(item.meta).length > 0) {
              body.meta = item.meta;
            }
            await apiFetch(PROD, `/community/${prodId}`, { method: 'PUT', body });
            logOk(`${progress} Updated: "${item.slug}" (prod ID: ${prodId}, parent: ${prodParentId})`);
            updated++;
          } catch (err) {
            logErr(`${progress} Failed to update "${item.slug}": ${err.message}`);
            failed++;
          }
          continue;
        }

        skipped++;
        continue;
      }

      if (DRY_RUN) {
        logWarn(`${progress} [DRY-RUN] Would create: ${item.slug}`);
        continue;
      }

      try {
        const prodParentId = idMap[item.parent] || 0;

        const body = {
          title: item.title.rendered,
          slug: item.slug,
          content: item.content.rendered,
          excerpt: item.excerpt?.rendered || '',
          status: item.status,
          parent: prodParentId,
        };

        if (item.meta && Object.keys(item.meta).length > 0) {
          body.meta = item.meta;
        }

        const { data } = await apiFetch(PROD, '/community', { method: 'POST', body });
        idMap[item.id] = data.id;
        logOk(`${progress} ${data.slug} (prod ID: ${data.id}, parent: ${prodParentId})`);
        created++;
      } catch (err) {
        logErr(`${progress} Failed "${item.slug}": ${err.message}`);
        failed++;
      }
    }

    // Small delay between batches to be nice to the server
    if (batch < totalBatches - 1 && !DRY_RUN) {
      await sleep(500);
    }
  }
  } // end children

  // Summary
  const totalTime = (Date.now() - startTime) / 1000;
  log('\n' + '═'.repeat(60), c.cyan);
  log('  📊 Communities Migration Summary', c.bold);
  log('═'.repeat(60), c.cyan);
  logOk(`Created: ${created}`);
  if (updated > 0) logOk(`Updated: ${updated}`);
  logInfo(`Skipped: ${skipped} (already exist)`);
  if (failed > 0) logErr(`Failed: ${failed}`);
  log(`  Total time: ${formatTime(totalTime)}`, c.gray);
  log(`  Rate: ${((created + updated) / totalTime * 60).toFixed(0)} items/min`, c.gray);
  log('');
}

main().catch(err => {
  logErr(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
