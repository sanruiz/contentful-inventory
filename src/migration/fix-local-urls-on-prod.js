#!/usr/bin/env node

/**
 * Fix Local URLs on Production
 * 
 * Replaces all memorycare.local URLs in production content
 * with the correct backoffice.memorycare.com URLs.
 * 
 * Usage:
 *   node src/migration/fix-local-urls-on-prod.js --dry-run   # Preview
 *   node src/migration/fix-local-urls-on-prod.js              # Fix all
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

// --- Configuration ---
const PROD = {
  url: (process.env.WP_BASE_URL_PROD || 'https://backoffice.memorycare.com').replace(/\/$/, ''),
  user: process.env.WP_USERNAME_PROD || 'admin',
  pass: process.env.WP_APPLICATION_PASSWORD_PROD,
};

const LOCAL_DOMAIN = 'https://memorycare.local';
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

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
function authHeader() {
  return 'Basic ' + Buffer.from(`${PROD.user}:${PROD.pass}`).toString('base64');
}

async function apiFetch(endpoint, options = {}) {
  const url = `${PROD.url}/wp-json/wp/v2${endpoint}`;
  const headers = { 'Authorization': authHeader(), 'Content-Type': 'application/json' };
  const fetchOpts = {
    headers: { ...headers, ...options.headers },
    ...options,
  };
  if (options.body && typeof options.body === 'object') {
    fetchOpts.body = JSON.stringify(options.body);
  }
  const resp = await fetch(url, fetchOpts);
  const data = await resp.json();
  if (!resp.ok) throw new Error(`API ${resp.status}: ${data.message || JSON.stringify(data)}`);
  return data;
}

async function fetchAll(endpoint) {
  const items = [];
  let page = 1;
  while (true) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const url = `${PROD.url}/wp-json/wp/v2${endpoint}${sep}per_page=100&page=${page}`;
    const resp = await fetch(url, {
      headers: { 'Authorization': authHeader() }
    });
    if (!resp.ok) break;
    const data = await resp.json();
    if (!data.length) break;
    items.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return items;
}

// --- Main ---
async function main() {
  log('\n🔗 Fix Local URLs on Production', c.bold);
  log('═'.repeat(55), c.cyan);
  log(`  Replacing: ${LOCAL_DOMAIN}`, c.gray);
  log(`  With:      ${PROD.url}`, c.gray);
  if (DRY_RUN) log('\n  🧪 DRY RUN MODE\n', c.yellow);

  // Fetch all content from prod
  log('\n  Fetching production content...', c.gray);
  const posts = await fetchAll('/posts?status=any');
  const pages = await fetchAll('/pages?status=any');
  const communities = await fetchAll('/community?status=any');

  log(`  Posts: ${posts.length} | Pages: ${pages.length} | Communities: ${communities.length}`, c.gray);

  const allContent = [
    ...posts.map(p => ({ ...p, _endpoint: '/posts', _type: 'post' })),
    ...pages.map(p => ({ ...p, _endpoint: '/pages', _type: 'page' })),
    ...communities.map(p => ({ ...p, _endpoint: '/community', _type: 'community' })),
  ];

  // Scan for local URLs
  const affected = allContent.filter(item => {
    const content = item.content?.rendered || '';
    return content.includes(LOCAL_DOMAIN);
  });

  log(`\n  Found ${affected.length} items with local URLs\n`, c.bold);

  if (affected.length === 0) {
    logOk('No local URLs found in production. Everything is clean!');
    return;
  }

  // Group by type
  const byType = { post: 0, page: 0, community: 0 };
  for (const item of affected) byType[item._type]++;
  log(`  Posts: ${byType.post} | Pages: ${byType.page} | Communities: ${byType.community}`, c.gray);

  // Fix
  log('\n' + '═'.repeat(55), c.cyan);
  log('  Fixing URLs', c.bold);
  log('═'.repeat(55), c.cyan);

  let fixed = 0, failed = 0;

  for (let i = 0; i < affected.length; i++) {
    const item = affected[i];
    const progress = `[${i + 1}/${affected.length}]`;
    const content = item.content.rendered;

    // Count occurrences
    const matches = content.match(new RegExp(LOCAL_DOMAIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
    const count = matches ? matches.length : 0;

    // Replace local domain with prod domain
    const newContent = content.replaceAll(LOCAL_DOMAIN, PROD.url);

    if (DRY_RUN) {
      logWarn(`${progress} [DRY-RUN] Would fix ${item._type}: "${item.slug}" (${count} URLs)`);
      fixed++;
      continue;
    }

    try {
      await apiFetch(`${item._endpoint}/${item.id}`, {
        method: 'POST',
        body: { content: newContent },
      });
      logOk(`${progress} Fixed ${item._type}: "${item.slug}" (${count} URLs)`);
      fixed++;
    } catch (err) {
      logErr(`${progress} Failed ${item._type} "${item.slug}": ${err.message}`);
      failed++;
    }
  }

  // Summary
  log('\n' + '═'.repeat(55), c.cyan);
  log('  📊 Summary', c.bold);
  log('═'.repeat(55), c.cyan);
  logOk(`Fixed: ${fixed}`);
  if (failed > 0) logErr(`Failed: ${failed}`);
  log('');
}

main().catch(err => {
  logErr(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
