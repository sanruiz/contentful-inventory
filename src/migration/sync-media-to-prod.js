#!/usr/bin/env node

/**
 * Sync Media: WordPress Local → Production
 * 
 * Downloads media from local WordPress and uploads to production.
 * Then updates content references from local URLs to production URLs.
 * 
 * Usage:
 *   node src/migration/sync-media-to-prod.js             # Migrate all media
 *   node src/migration/sync-media-to-prod.js --dry-run    # Preview without uploading
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import https from 'https';
import { Readable } from 'stream';

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

async function apiFetch(env, endpoint, options = {}) {
  const url = `${env.url}/wp-json/wp/v2${endpoint}`;
  const headers = { 'Authorization': authHeader(env), 'Content-Type': 'application/json' };
  const fetchOpts = {
    headers: { ...headers, ...options.headers },
    ...(env.url.includes('.local') ? { agent: httpsAgent } : {}),
    ...options,
  };
  if (options.body && typeof options.body !== 'string' && !(options.body instanceof Buffer) && !(options.body instanceof Uint8Array)) {
    fetchOpts.body = JSON.stringify(options.body);
  }
  const resp = await fetch(url, fetchOpts);
  const total = resp.headers.get('x-wp-total');
  const data = await resp.json();
  if (!resp.ok) throw new Error(`API ${resp.status}: ${data.message || JSON.stringify(data)}`);
  return { data, total: total ? parseInt(total) : null, totalPages: parseInt(resp.headers.get('x-wp-totalpages') || '1') };
}

async function fetchAll(env, endpoint) {
  const items = [];
  let page = 1;
  while (true) {
    const { data, totalPages } = await apiFetch(env, `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    items.push(...data);
    if (page >= totalPages) break;
    page++;
  }
  return items;
}

// --- Media Migration ---

async function downloadMedia(url) {
  const fetchOpts = url.includes('.local') ? { agent: httpsAgent } : {};
  const resp = await fetch(url, fetchOpts);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  return buffer;
}

async function uploadMedia(env, buffer, filename, mimeType, title, altText, caption, description) {
  const url = `${env.url}/wp-json/wp/v2/media`;
  
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader(env),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Type': mimeType,
    },
    body: buffer,
  });

  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(`Upload failed ${resp.status}: ${err.message || JSON.stringify(err)}`);
  }

  const media = await resp.json();

  // Update alt text, caption, description if available
  if (altText || caption || description || title) {
    const updateBody = {};
    if (title) updateBody.title = title;
    if (altText) updateBody.alt_text = altText;
    if (caption) updateBody.caption = caption;
    if (description) updateBody.description = description;

    await fetch(`${env.url}/wp-json/wp/v2/media/${media.id}`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader(env),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateBody),
    });
  }

  return media;
}

async function main() {
  log('\n📷 WordPress Media Migration: Local → Production', c.bold);
  log('═'.repeat(55), c.cyan);

  if (DRY_RUN) log('\n  🧪 DRY RUN MODE\n', c.yellow);

  // Step 1: Get all local media
  log('\n  Fetching local media...', c.gray);
  const localMedia = await fetchAll(LOCAL, '/media');
  log(`  Found ${localMedia.length} media items locally`, c.gray);

  // Step 2: Get existing prod media (to avoid duplicates)
  log('  Fetching prod media...', c.gray);
  const prodMedia = await fetchAll(PROD, '/media');
  const prodFilenames = new Set(prodMedia.map(m => m.source_url?.split('/').pop()));
  log(`  Found ${prodMedia.length} media items in prod`, c.gray);

  // Step 3: Migrate
  log('\n' + '═'.repeat(55), c.cyan);
  log('  Uploading Media', c.bold);
  log('═'.repeat(55), c.cyan);

  const urlMap = {}; // local URL → prod URL
  let created = 0, skipped = 0, failed = 0;

  for (let i = 0; i < localMedia.length; i++) {
    const media = localMedia[i];
    const filename = media.source_url?.split('/').pop();
    const progress = `[${i + 1}/${localMedia.length}]`;

    if (prodFilenames.has(filename)) {
      const existing = prodMedia.find(m => m.source_url?.split('/').pop() === filename);
      if (existing) {
        urlMap[media.source_url] = existing.source_url;
        logInfo(`${progress} "${filename}" already exists in prod`);
      }
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      const size = media.media_details?.filesize ? (media.media_details.filesize / 1024).toFixed(0) + 'KB' : '?';
      logWarn(`${progress} [DRY-RUN] Would upload: ${filename} (${size})`);
      continue;
    }

    try {
      // Download from local
      const buffer = await downloadMedia(media.source_url);
      
      // Upload to prod
      const uploaded = await uploadMedia(
        PROD,
        buffer,
        filename,
        media.mime_type,
        media.title?.rendered || '',
        media.alt_text || '',
        media.caption?.rendered || '',
        media.description?.rendered || ''
      );

      urlMap[media.source_url] = uploaded.source_url;

      // Also map all intermediate sizes
      if (media.media_details?.sizes) {
        for (const [sizeName, sizeData] of Object.entries(media.media_details.sizes)) {
          const localSizeUrl = sizeData.source_url;
          if (uploaded.media_details?.sizes?.[sizeName]?.source_url) {
            urlMap[localSizeUrl] = uploaded.media_details.sizes[sizeName].source_url;
          }
        }
      }

      const size = (buffer.length / 1024).toFixed(0) + 'KB';
      logOk(`${progress} Uploaded: ${filename} (${size}) → prod ID: ${uploaded.id}`);
      created++;
    } catch (err) {
      logErr(`${progress} Failed "${filename}": ${err.message}`);
      failed++;
    }
  }

  // Step 4: Update content references
  if (!DRY_RUN && Object.keys(urlMap).length > 0) {
    log('\n' + '═'.repeat(55), c.cyan);
    log('  Updating Content URLs', c.bold);
    log('═'.repeat(55), c.cyan);

    await updateContentUrls(urlMap);
  }

  // Summary
  log('\n' + '═'.repeat(55), c.cyan);
  log('  📊 Media Migration Summary', c.bold);
  log('═'.repeat(55), c.cyan);
  logOk(`Uploaded: ${created}`);
  logInfo(`Skipped: ${skipped} (already exist)`);
  if (failed > 0) logErr(`Failed: ${failed}`);
  log(`  URL mappings: ${Object.keys(urlMap).length}`, c.gray);
  log('');
}

async function updateContentUrls(urlMap) {
  const localDomain = LOCAL.url; // https://memorycare.local

  // Get all posts, pages, and communities from prod
  const posts = await fetchAll(PROD, '/posts?status=any');
  const pages = await fetchAll(PROD, '/pages?status=any');
  const communities = await fetchAll(PROD, '/community?status=any');
  const allContent = [
    ...posts.map(p => ({ ...p, _endpoint: '/posts' })),
    ...pages.map(p => ({ ...p, _endpoint: '/pages' })),
    ...communities.map(p => ({ ...p, _endpoint: '/community' })),
  ];

  log(`\n  Scanning ${posts.length} posts, ${pages.length} pages, ${communities.length} communities...`, c.gray);

  let updated = 0;

  for (const item of allContent) {
    let content = item.content.rendered;
    let changed = false;

    // Replace specific URL mappings
    for (const [localUrl, prodUrl] of Object.entries(urlMap)) {
      if (content.includes(localUrl)) {
        content = content.replaceAll(localUrl, prodUrl);
        changed = true;
      }
    }

    // Also replace any remaining references to local domain in wp-content/uploads
    const localPattern = localDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/wp-content/uploads/';
    const regex = new RegExp(localPattern, 'g');
    if (regex.test(content)) {
      content = content.replace(regex, PROD.url + '/wp-content/uploads/');
      changed = true;
    }

    if (changed) {
      try {
        await apiFetch(PROD, `${item._endpoint}/${item.id}`, {
          method: 'POST',
          body: { content },
        });
        logOk(`Updated URLs in ${item.type || 'community'}: ${item.slug}`);
        updated++;
      } catch (err) {
        logErr(`Failed to update ${item.type || 'community'} "${item.slug}": ${err.message}`);
      }
    }
  }

  logInfo(`Updated ${updated} items with new media URLs`);
}

main().catch(err => {
  logErr(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
