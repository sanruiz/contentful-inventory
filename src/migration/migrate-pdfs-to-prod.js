#!/usr/bin/env node

/**
 * Migrate Contentful PDF Assets → WordPress Media Library
 *
 * Downloads PDF files from Contentful CDN, uploads them to WP media library,
 * then replaces all Contentful asset URLs in post content with the new WP URLs.
 *
 * Usage:
 *   node src/migration/migrate-pdfs-to-prod.js --dry-run   # Preview only
 *   node src/migration/migrate-pdfs-to-prod.js              # Download, upload & fix
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

dotenv.config();

// ─── Configuration ───────────────────────────────────────────────────

const PROD = {
  url: (process.env.WP_BASE_URL_PROD || 'https://backoffice.memorycare.com').replace(/\/$/, ''),
  user: process.env.WP_USERNAME_PROD || 'admin',
  pass: process.env.WP_APPLICATION_PASSWORD_PROD,
};

const TEMP_DIR = path.join(process.cwd(), 'temp', 'pdfs');
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
      ...(options.headers || {}),
    },
    ...options,
  });

  // For upload, body is already a Buffer, don't JSON.stringify
  if (!resp.ok) {
    const text = await resp.text();
    let msg;
    try {
      msg = JSON.parse(text).message;
    } catch {
      msg = text.substring(0, 200);
    }
    throw new Error(`API ${resp.status}: ${msg}`);
  }

  const data = await resp.json();
  return {
    data,
    totalPages: parseInt(resp.headers.get('x-wp-totalpages') || '1'),
  };
}

async function fetchAllPosts() {
  const items = [];
  let page = 1;
  while (true) {
    const { data, totalPages } = await apiFetch(`/posts?per_page=100&page=${page}&status=any`);
    items.push(...data);
    if (page >= totalPages) break;
    page++;
  }
  return items;
}

// ─── Step 1: Find all Contentful asset URLs ─────────────────────────

function findContentfulUrls(posts) {
  const urlMap = new Map(); // ctfUrl → { posts: [{id, slug}], filename }

  for (const p of posts) {
    const content = p.content?.rendered || '';
    const matches = content.match(/https:\/\/assets\.ctfassets\.net\/[^\s"'<>)]+/g) || [];

    for (const url of matches) {
      const filename = url.split('/').pop();
      if (!urlMap.has(url)) {
        urlMap.set(url, { posts: [], filename });
      }
      const entry = urlMap.get(url);
      if (!entry.posts.find(x => x.id === p.id)) {
        entry.posts.push({ id: p.id, slug: p.slug });
      }
    }
  }

  return urlMap;
}

// ─── Step 2: Download from Contentful ───────────────────────────────

async function downloadPdf(url, filename) {
  const filePath = path.join(TEMP_DIR, filename);

  // Skip if already downloaded
  if (fs.existsSync(filePath)) {
    return filePath;
  }

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} downloading ${filename}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

// ─── Step 3: Upload to WordPress ────────────────────────────────────

async function uploadToWordPress(filePath, filename) {
  const fileBuffer = fs.readFileSync(filePath);

  const url = `${PROD.url}/wp-json/wp/v2/media`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader(),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/pdf',
    },
    body: fileBuffer,
  });

  if (!resp.ok) {
    const text = await resp.text();
    let msg;
    try {
      msg = JSON.parse(text).message;
    } catch {
      msg = text.substring(0, 200);
    }
    throw new Error(`Upload failed ${resp.status}: ${msg}`);
  }

  const data = await resp.json();
  return data.source_url;
}

// ─── Step 4: Replace URLs in post content ───────────────────────────

async function replaceUrlsInPost(postId, replacements) {
  // Fetch raw content
  const { data } = await apiFetch(`/posts/${postId}?context=edit`);
  let rawContent = data.content?.raw || '';

  if (!rawContent) {
    throw new Error('No raw content');
  }

  let changed = false;
  for (const [oldUrl, newUrl] of replacements) {
    if (rawContent.includes(oldUrl)) {
      rawContent = rawContent.split(oldUrl).join(newUrl);
      changed = true;
    }
  }

  if (!changed) return false;

  // Update the post
  const updateUrl = `${PROD.url}/wp-json/wp/v2/posts/${postId}`;
  const resp = await fetch(updateUrl, {
    method: 'PUT',
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: rawContent }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Update failed: ${text.substring(0, 200)}`);
  }

  return true;
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${c.bold}📄 Migrate Contentful PDFs → WordPress Media Library${c.reset}`);
  console.log('═══════════════════════════════════════════════════════');

  if (DRY_RUN) logWarn('DRY-RUN MODE — no changes will be made\n');

  // Ensure temp dir exists
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  // Step 1: Find all Contentful URLs in posts
  log(`${c.gray}Fetching posts from production...${c.reset}`);
  const posts = await fetchAllPosts();
  log(`${c.gray}Posts: ${posts.length}${c.reset}`);

  const ctfUrls = findContentfulUrls(posts);
  log(`${c.bold}Contentful asset URLs found: ${ctfUrls.size}${c.reset}`);

  if (ctfUrls.size === 0) {
    logOk('No Contentful asset URLs found — nothing to migrate!');
    return;
  }

  // Show summary
  console.log(`\n═══════════════════════════════════════════════════════`);
  log(`${c.bold}Assets to Migrate${c.reset}`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  const postGroups = new Map();
  for (const [url, info] of ctfUrls) {
    for (const p of info.posts) {
      if (!postGroups.has(p.slug)) postGroups.set(p.slug, []);
      postGroups.get(p.slug).push(info.filename);
    }
  }
  for (const [slug, files] of postGroups) {
    log(`${c.cyan}${slug}${c.reset} — ${files.length} PDFs`);
  }

  if (DRY_RUN) {
    log(`\n${c.yellow}Dry-run complete. ${ctfUrls.size} PDFs would be migrated.${c.reset}`);
    return;
  }

  // Step 2 & 3: Download from Contentful and upload to WordPress
  console.log(`\n═══════════════════════════════════════════════════════`);
  log(`${c.bold}Downloading & Uploading PDFs${c.reset}`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  const urlReplacements = new Map(); // oldCtfUrl → newWpUrl
  let downloaded = 0;
  let uploaded = 0;
  let failed = 0;
  const startTime = Date.now();

  const entries = [...ctfUrls.entries()];
  for (let i = 0; i < entries.length; i++) {
    const [ctfUrl, info] = entries[i];
    const progress = `[${i + 1}/${entries.length}]`;

    try {
      // Download
      const filePath = await downloadPdf(ctfUrl, info.filename);
      downloaded++;

      // Upload to WP
      const wpUrl = await uploadToWordPress(filePath, info.filename);
      uploaded++;

      urlReplacements.set(ctfUrl, wpUrl);
      logOk(`${progress} ${info.filename}`);
      log(`  ${c.gray}→ ${wpUrl}${c.reset}`);
    } catch (err) {
      logErr(`${progress} ${info.filename}: ${err.message}`);
      failed++;
    }
  }

  log(`\n${c.gray}Downloaded: ${downloaded}, Uploaded: ${uploaded}, Failed: ${failed}${c.reset}`);

  if (urlReplacements.size === 0) {
    logErr('No files were uploaded — skipping URL replacement');
    return;
  }

  // Step 4: Replace URLs in post content
  console.log(`\n═══════════════════════════════════════════════════════`);
  log(`${c.bold}Replacing URLs in Post Content${c.reset}`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  // Group replacements by post
  const postReplacements = new Map(); // postId → [[oldUrl, newUrl], ...]
  for (const [ctfUrl, info] of ctfUrls) {
    const wpUrl = urlReplacements.get(ctfUrl);
    if (!wpUrl) continue;

    for (const p of info.posts) {
      if (!postReplacements.has(p.id)) {
        postReplacements.set(p.id, { slug: p.slug, replacements: [] });
      }
      postReplacements.get(p.id).replacements.push([ctfUrl, wpUrl]);
    }
  }

  let postsFixed = 0;
  let postsFailed = 0;

  for (const [postId, { slug, replacements }] of postReplacements) {
    try {
      const updated = await replaceUrlsInPost(postId, replacements);
      if (updated) {
        logOk(`Updated "${slug}" — ${replacements.length} URLs replaced`);
        postsFixed++;
      } else {
        logWarn(`No changes in raw content for "${slug}"`);
      }
    } catch (err) {
      logErr(`Failed to update "${slug}": ${err.message}`);
      postsFailed++;
    }
  }

  // Summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n═══════════════════════════════════════════════════════`);
  log(`${c.bold}📊 Summary${c.reset}`);
  console.log(`═══════════════════════════════════════════════════════`);
  logOk(`PDFs uploaded: ${uploaded}/${entries.length}`);
  logOk(`Posts updated: ${postsFixed}/${postReplacements.size}`);
  if (failed > 0) logErr(`Upload failures: ${failed}`);
  if (postsFailed > 0) logErr(`Post update failures: ${postsFailed}`);
  log(`${c.gray}Time: ${totalTime}s${c.reset}`);

  // Cleanup temp files
  log(`${c.gray}Temp files kept in: ${TEMP_DIR}${c.reset}`);
}

main().catch(err => {
  logErr(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
