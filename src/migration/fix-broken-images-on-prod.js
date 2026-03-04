#!/usr/bin/env node

/**
 * Fix Broken Image URLs on Production
 *
 * WordPress added `-1` suffix to uploaded image filenames to avoid conflicts,
 * but the post content still references the original (non-suffixed) URLs.
 * This script finds and replaces all broken image URLs in posts and pages.
 *
 * Usage:
 *   node src/migration/fix-broken-images-on-prod.js --dry-run   # Preview only
 *   node src/migration/fix-broken-images-on-prod.js              # Fix all
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

// ─── Configuration ───────────────────────────────────────────────────

const PROD = {
  url: (process.env.WP_BASE_URL_PROD || 'https://backoffice.memorycare.com').replace(/\/$/, ''),
  user: process.env.WP_USERNAME_PROD || 'admin',
  pass: process.env.WP_APPLICATION_PASSWORD_PROD,
};

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

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

function authHeader() {
  return 'Basic ' + Buffer.from(`${PROD.user}:${PROD.pass}`).toString('base64');
}

async function apiFetch(endpoint, options = {}) {
  const url = `${PROD.url}/wp-json/wp/v2${endpoint}`;
  const resp = await fetch(url, {
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/json',
      ...options.headers,
    },
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

async function fetchAll(endpoint) {
  const items = [];
  let page = 1;
  while (true) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const { data, totalPages } = await apiFetch(`${endpoint}${sep}per_page=100&page=${page}`);
    items.push(...data);
    if (page >= totalPages) break;
    page++;
  }
  return items;
}

// ─── Build Replacement Map ──────────────────────────────────────────

async function buildReplacementMap() {
  log(`${c.gray}Fetching media library...${c.reset}`);
  const media = await fetchAll('/media');
  log(`${c.gray}Media items: ${media.length}${c.reset}`);

  // Build a set of all actual media filenames
  const mediaFilenames = new Set();
  const mediaUrlMap = new Map(); // filename -> full URL
  for (const m of media) {
    const src = m.source_url || '';
    const fname = src.split('/').pop();
    mediaFilenames.add(fname);
    mediaUrlMap.set(fname, src);
  }

  return { mediaFilenames, mediaUrlMap };
}

function findBrokenUrls(content, mediaFilenames, mediaUrlMap) {
  const replacements = new Map();

  // Find all image URLs pointing to wp-content/uploads
  const imgRegex = /https?:\/\/backoffice\.memorycare\.com\/wp-content\/uploads\/\d{4}\/\d{2}\/[^\s"'<>)]+/g;
  const matches = content.match(imgRegex) || [];

  for (const url of matches) {
    const fname = url.split('/').pop();

    // Skip if this URL's file actually exists
    if (mediaFilenames.has(fname)) continue;

    // Strategy 1: Add -1 before extension (most common pattern)
    const dotIdx = fname.lastIndexOf('.');
    if (dotIdx > 0) {
      const base = fname.substring(0, dotIdx);
      const ext = fname.substring(dotIdx);
      const candidate = `${base}-1${ext}`;
      if (mediaFilenames.has(candidate)) {
        replacements.set(url, mediaUrlMap.get(candidate));
        continue;
      }
    }

    // Strategy 2: Double extension fix (e.g., file-scaled.png_extra.png → file-scaled-1.png)
    const doubleExtMatch = fname.match(/^(.+\.(png|jpg|jpeg|gif|webp))_[^.]+\.(png|jpg|jpeg|gif|webp)$/i);
    if (doubleExtMatch) {
      const realName = doubleExtMatch[1];
      const realDotIdx = realName.lastIndexOf('.');
      const realBase = realName.substring(0, realDotIdx);
      const realExt = realName.substring(realDotIdx);
      const candidate = `${realBase}-1${realExt}`;
      if (mediaFilenames.has(candidate)) {
        replacements.set(url, mediaUrlMap.get(candidate));
        continue;
      }
    }

    // Strategy 3: Try -2, -3 suffixes
    if (dotIdx > 0) {
      const base = fname.substring(0, dotIdx);
      const ext = fname.substring(dotIdx);
      for (let i = 2; i <= 5; i++) {
        const candidate = `${base}-${i}${ext}`;
        if (mediaFilenames.has(candidate)) {
          replacements.set(url, mediaUrlMap.get(candidate));
          break;
        }
      }
    }
  }

  return replacements;
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${c.bold}🖼️  Fix Broken Image URLs on Production${c.reset}`);
  console.log('═══════════════════════════════════════════════════════');

  if (DRY_RUN) logWarn('DRY-RUN MODE — no changes will be made\n');

  const { mediaFilenames, mediaUrlMap } = await buildReplacementMap();

  // Fetch posts and pages
  log(`${c.gray}Fetching posts...${c.reset}`);
  const posts = await fetchAll('/posts?status=any');
  log(`${c.gray}Fetching pages...${c.reset}`);
  const pages = await fetchAll('/pages?status=any');

  const allContent = [
    ...posts.map(p => ({ ...p, type: 'post' })),
    ...pages.map(p => ({ ...p, type: 'page' })),
  ];

  log(`${c.gray}Total items to check: ${allContent.length} (${posts.length} posts, ${pages.length} pages)${c.reset}`);

  // Analyze
  console.log(`\n═══════════════════════════════════════════════════════`);
  log(`${c.bold}Scanning for Broken Images${c.reset}`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  let totalFixed = 0;
  let totalFailed = 0;
  let totalBroken = 0;
  const affectedItems = [];

  for (const item of allContent) {
    const rawContent = item.content?.raw || item.content?.rendered || '';
    if (!rawContent) continue;

    const replacements = findBrokenUrls(rawContent, mediaFilenames, mediaUrlMap);
    if (replacements.size === 0) continue;

    totalBroken += replacements.size;
    log(`${c.cyan}${item.type}${c.reset} "${item.slug}" (ID:${item.id}) — ${c.bold}${replacements.size} broken${c.reset}`);
    for (const [old, newUrl] of replacements) {
      const oldFname = old.split('/').pop();
      const newFname = newUrl.split('/').pop();
      log(`  ${c.red}${oldFname}${c.reset} → ${c.green}${newFname}${c.reset}`);
    }

    affectedItems.push({ item, replacements });
  }

  if (totalBroken === 0) {
    logOk('No broken image URLs found!');
    return;
  }

  log(`\n${c.bold}Total: ${totalBroken} broken image URLs in ${affectedItems.length} items${c.reset}`);

  // Fix
  console.log(`\n═══════════════════════════════════════════════════════`);
  log(`${c.bold}Fixing URLs${c.reset}`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  for (const { item, replacements } of affectedItems) {
    // We need the raw content to do replacements
    // Fetch the raw content
    const endpoint = item.type === 'post' ? 'posts' : 'pages';

    let rawContent;
    try {
      const { data } = await apiFetch(`/${endpoint}/${item.id}?context=edit`);
      rawContent = data.content?.raw || '';
    } catch (err) {
      logErr(`Failed to fetch raw content for "${item.slug}": ${err.message}`);
      totalFailed += replacements.size;
      continue;
    }

    if (!rawContent) {
      logWarn(`No raw content for "${item.slug}"`);
      continue;
    }

    let updatedContent = rawContent;
    for (const [oldUrl, newUrl] of replacements) {
      // Replace all occurrences (including in srcset, href, etc.)
      updatedContent = updatedContent.split(oldUrl).join(newUrl);
    }

    if (updatedContent === rawContent) {
      logWarn(`No changes detected in raw content for "${item.slug}" (URLs may be in rendered only)`);
      continue;
    }

    if (DRY_RUN) {
      logWarn(`Would fix ${replacements.size} URLs in "${item.slug}"`);
      totalFixed += replacements.size;
      continue;
    }

    try {
      await apiFetch(`/${endpoint}/${item.id}`, {
        method: 'PUT',
        body: { content: updatedContent },
      });
      logOk(`Fixed ${replacements.size} URLs in "${item.slug}"`);
      totalFixed += replacements.size;
    } catch (err) {
      logErr(`Failed to update "${item.slug}": ${err.message}`);
      totalFailed += replacements.size;
    }
  }

  // Summary
  console.log(`\n═══════════════════════════════════════════════════════`);
  log(`${c.bold}📊 Summary${c.reset}`);
  console.log(`═══════════════════════════════════════════════════════`);
  logOk(`Fixed: ${totalFixed} URLs`);
  if (totalFailed > 0) logErr(`Failed: ${totalFailed} URLs`);
  log(`${c.gray}Items affected: ${affectedItems.length}${c.reset}`);
}

main().catch(err => {
  logErr(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
