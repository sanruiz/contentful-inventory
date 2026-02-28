#!/usr/bin/env node

/**
 * Fix Double Extension URLs in WordPress Content
 *
 * Scans all WordPress posts, pages, and communities for image URLs
 * with double extensions (e.g., .png.png, .jpg.jpg) and fixes them.
 *
 * Usage:
 *   node src/migration/fix-double-extensions.js --dry-run   # Preview only
 *   node src/migration/fix-double-extensions.js              # Fix all
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import https from 'https';

dotenv.config();

// ─── Configuration ───────────────────────────────────────────────────

const WP_BASE_URL = (process.env.WP_BASE_URL || 'https://memorycare.local').replace(/\/$/, '');
const WP_USERNAME = process.env.WP_USERNAME || 'sanruiz';
const WP_PASSWORD = process.env.WP_APPLICATION_PASSWORD;

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const AUTH = Buffer.from(`${WP_USERNAME}:${WP_PASSWORD}`).toString('base64');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// Regex: match URLs ending with a double extension like .png.png, .jpg.jpg, etc.
const DOUBLE_EXT_REGEX = /(https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|gif|webp|svg))\.\2/gi;

// ─── Colors ──────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', gray: '\x1b[90m', cyan: '\x1b[36m',
};

const log = (msg) => console.log(`  ${msg}`);
const logOk = (msg) => console.log(`  ${c.green}✅ ${msg}${c.reset}`);
const logWarn = (msg) => console.log(`  ${c.yellow}⚠️  ${msg}${c.reset}`);
const logErr = (msg) => console.log(`  ${c.red}❌ ${msg}${c.reset}`);
const logInfo = (msg) => console.log(`  ${c.cyan}ℹ️  ${msg}${c.reset}`);

// ─── WordPress API ──────────────────────────────────────────────────

async function wpFetch(endpoint, options = {}) {
  const url = `${WP_BASE_URL}/wp-json/wp/v2/${endpoint}`;
  const resp = await fetch(url, {
    ...options,
    agent: httpsAgent,
    headers: {
      'Authorization': `Basic ${AUTH}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return resp;
}

async function fetchAll(endpoint) {
  const items = [];
  let page = 1;
  while (true) {
    const resp = await wpFetch(`${endpoint}?per_page=100&page=${page}&context=edit`);
    if (!resp.ok) break;
    const data = await resp.json();
    if (!data.length) break;
    items.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return items;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${c.bold}🔧 Fix Double Extension URLs in WordPress Content${c.reset}`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (DRY_RUN) logWarn('DRY-RUN MODE — no changes will be made\n');

  log('Fetching WordPress content...');
  const posts = await fetchAll('posts');
  logInfo(`Fetched ${posts.length} posts`);
  const pages = await fetchAll('pages');
  logInfo(`Fetched ${pages.length} pages`);
  const communities = await fetchAll('community');
  logInfo(`Fetched ${communities.length} communities`);

  const allItems = [
    ...posts.map(p => ({ ...p, wpType: 'posts' })),
    ...pages.map(p => ({ ...p, wpType: 'pages' })),
    ...communities.map(p => ({ ...p, wpType: 'community' })),
  ];

  console.log(`\n  Total content items to scan: ${allItems.length}\n`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Scanning for double extension URLs');
  console.log('═══════════════════════════════════════════════════════\n');

  let totalFound = 0;
  let totalFixed = 0;
  let totalFailed = 0;
  const affected = [];

  for (const item of allItems) {
    const rawContent = item.content?.raw || '';
    const matches = [...rawContent.matchAll(DOUBLE_EXT_REGEX)];

    if (matches.length === 0) continue;

    totalFound += matches.length;
    const fixes = matches.map(m => ({
      broken: m[0],              // e.g., .../badge.png.png
      fixed: m[1],               // e.g., .../badge.png  (captured group 1)
    }));

    affected.push({
      id: item.id,
      slug: item.slug,
      type: item.wpType,
      fixes,
    });
  }

  logInfo(`Found ${totalFound} double-extension URLs across ${affected.length} content items\n`);

  if (totalFound === 0) {
    logOk('No double-extension URLs found. Nothing to fix!');
    return;
  }

  // Show preview
  for (const item of affected.slice(0, 5)) {
    log(`${c.gray}${item.type} "${item.slug}" (ID: ${item.id}) → ${item.fixes.length} URLs${c.reset}`);
    log(`  ${c.red}${item.fixes[0].broken}${c.reset}`);
    log(`  ${c.green}→ ${item.fixes[0].fixed}${c.reset}`);
  }
  if (affected.length > 5) log(`${c.gray}  ... and ${affected.length - 5} more items${c.reset}`);

  if (DRY_RUN) {
    console.log('\n═══════════════════════════════════════════════════════');
    logWarn(`DRY-RUN complete. Would fix ${totalFound} URLs in ${affected.length} items.`);
    return;
  }

  // Apply fixes
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Applying fixes');
  console.log('═══════════════════════════════════════════════════════\n');

  for (const item of affected) {
    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Re-fetch current raw content to avoid stale data
        const resp = await wpFetch(`${item.type}/${item.id}?context=edit`);
        if (!resp.ok) {
          logErr(`Failed to fetch ${item.type} "${item.slug}" (ID: ${item.id}): ${resp.status}`);
          break;
        }
        const current = await resp.json();
        let content = current.content?.raw || '';

        let replacedCount = 0;
        // Replace all double extensions
        content = content.replace(DOUBLE_EXT_REGEX, (match, base, ext) => {
          replacedCount++;
          return base; // just the URL without the duplicate extension
        });

        if (replacedCount === 0) {
          logInfo(`No changes needed for ${item.type} "${item.slug}" (ID: ${item.id})`);
          success = true;
          break;
        }

        // Update the post
        const updateResp = await wpFetch(`${item.type}/${item.id}`, {
          method: 'PUT',
          body: JSON.stringify({ content }),
        });

        if (updateResp.ok) {
          logOk(`Fixed ${item.type} "${item.slug}" (ID: ${item.id}) → ${replacedCount} URLs`);
          totalFixed += replacedCount;
          success = true;
          break;
        } else {
          const errText = await updateResp.text();
          logErr(`Failed to update ${item.type} "${item.slug}" (ID: ${item.id}): ${updateResp.status}`);
          break;
        }
      } catch (err) {
        if (attempt < 3) {
          logWarn(`Retry ${attempt}/3 for ${item.type} "${item.slug}" (ID: ${item.id}): ${err.message}`);
          await new Promise(r => setTimeout(r, 2000 * attempt));
        } else {
          logErr(`Failed after 3 retries: ${item.type} "${item.slug}" (ID: ${item.id}): ${err.message}`);
        }
      }
    }
    if (!success) totalFailed += item.fixes.length;
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  📊 Fix Summary');
  console.log('═══════════════════════════════════════════════════════');
  logOk(`Fixed: ${totalFixed} URLs`);
  if (totalFailed) logErr(`Failed: ${totalFailed} URLs`);
  logInfo(`Affected items: ${affected.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
