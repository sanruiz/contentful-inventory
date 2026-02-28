#!/usr/bin/env node

/**
 * Migrate Contentful CDN Images to WordPress
 *
 * Scans all WordPress posts and pages for images served from
 * images.ctfassets.net, downloads them, uploads to WordPress media library,
 * and replaces the URLs in post/page content.
 *
 * Usage:
 *   node src/migration/migrate-contentful-images.js                # Migrate all
 *   node src/migration/migrate-contentful-images.js --dry-run      # Preview only
 *   node src/migration/migrate-contentful-images.js --post-type=posts  # Only posts
 *   node src/migration/migrate-contentful-images.js --post-type=pages  # Only pages
 *   node src/migration/migrate-contentful-images.js --report       # Generate report only
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import https from 'https';
import path from 'path';
import fs from 'fs';

dotenv.config();

// ─── Configuration ───────────────────────────────────────────────────

const WP_BASE_URL = (process.env.WP_BASE_URL || 'https://memorycare.local').replace(/\/$/, '');
const WP_USERNAME = process.env.WP_USERNAME || 'sanruiz';
const WP_PASSWORD = process.env.WP_APPLICATION_PASSWORD;

const CONTENTFUL_SPACE_ID = process.env.CONTENTFUL_SPACE_ID || '61iwodu7d9u0';
const CONTENTFUL_ENV_ID = process.env.CONTENTFUL_ENVIRONMENT_ID || 'master';
const CONTENTFUL_TOKEN = process.env.CONTENTFUL_MANAGEMENT_TOKEN;

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const REPORT_ONLY = args.includes('--report');
const POST_TYPE_ARG = args.find(a => a.startsWith('--post-type='));
const POST_TYPE = POST_TYPE_ARG ? POST_TYPE_ARG.split('=')[1] : 'all'; // 'posts', 'pages', 'all'

// Regex to find Contentful CDN image URLs in content
const CONTENTFUL_IMG_REGEX = /https?:\/\/images\.ctfassets\.net\/[a-zA-Z0-9_\-\/]+\.[a-zA-Z]{3,4}(?:\?[^"'\s)]*)?/g;

// ─── Colors ──────────────────────────────────────────────────────────

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

// ─── WordPress API Helpers ───────────────────────────────────────────

function authHeader() {
  return 'Basic ' + Buffer.from(`${WP_USERNAME}:${WP_PASSWORD}`).toString('base64');
}

async function wpFetch(endpoint, options = {}) {
  const url = `${WP_BASE_URL}/wp-json/wp/v2${endpoint}`;
  const fetchOpts = {
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...(WP_BASE_URL.includes('.local') ? { agent: httpsAgent } : {}),
    ...options,
  };
  const resp = await fetch(url, fetchOpts);
  const total = resp.headers.get('x-wp-total');
  const data = await resp.json();
  if (!resp.ok) throw new Error(`API ${resp.status}: ${data.message || JSON.stringify(data)}`);
  return { data, total: total ? parseInt(total) : null, totalPages: parseInt(resp.headers.get('x-wp-totalpages') || '1') };
}

async function fetchAll(endpoint) {
  const items = [];
  let page = 1;
  while (true) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const { data, totalPages } = await wpFetch(`${endpoint}${sep}per_page=100&page=${page}`);
    items.push(...data);
    if (page >= totalPages) break;
    page++;
  }
  return items;
}

// ─── Image Processing ────────────────────────────────────────────────

/**
 * Extract all Contentful CDN image URLs from HTML content
 */
function extractContentfulUrls(html) {
  if (!html) return [];
  const matches = html.match(CONTENTFUL_IMG_REGEX) || [];
  // Deduplicate
  return [...new Set(matches)];
}

/**
 * Get a clean filename from a Contentful URL
 * e.g. https://images.ctfassets.net/61iwodu7d9u0/6gPPS.../abc123/image-name.png
 *      → image-name.png
 */
function getFilenameFromUrl(url) {
  // Remove query params
  const cleanUrl = url.split('?')[0];
  const segments = cleanUrl.split('/');
  let filename = segments.pop() || 'contentful-image.jpg';

  // Sanitize filename: keep only safe characters
  filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

  // If no extension, try to figure it out
  if (!/\.\w{3,4}$/.test(filename)) {
    filename += '.jpg';
  }

  return filename;
}

/**
 * Determine MIME type from filename
 */
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
  };
  return mimeMap[ext] || 'image/jpeg';
}

/**
 * Download an image from Contentful CDN
 * If direct download fails (403), tries to resolve the correct URL via Management API
 * Returns { buffer, resolvedFilename } — resolvedFilename is set when the API provided a better name
 */
async function downloadImage(url) {
  let resp = await fetch(url);
  let resolvedFilename = null;

  // If 403, the URL stored in WP may differ from the real Contentful asset URL
  // Try to resolve via Management API using the asset ID from the URL
  if (resp.status === 403 && CONTENTFUL_TOKEN) {
    const resolved = await resolveContentfulAssetUrl(url);
    if (resolved && resolved.url !== url) {
      logInfo(`  Resolved via API: ${resolved.filename || resolved.url.split('/').pop()}`);
      resp = await fetch(resolved.url);
      resolvedFilename = resolved.filename;
    }
  }

  if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  return { buffer, resolvedFilename };
}

/**
 * Extract asset ID from a Contentful CDN URL and fetch the real URL via Management API
 * URL format: https://images.ctfassets.net/{spaceId}/{assetId}/{hash}/{filename}
 */
async function resolveContentfulAssetUrl(cdnUrl) {
  try {
    const parts = cdnUrl.split('/');
    const spaceIdx = parts.indexOf(CONTENTFUL_SPACE_ID);
    if (spaceIdx < 0) return null;
    const assetId = parts[spaceIdx + 1];
    if (!assetId) return null;

    const apiUrl = `https://api.contentful.com/spaces/${CONTENTFUL_SPACE_ID}/environments/${CONTENTFUL_ENV_ID}/assets/${assetId}`;
    const resp = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${CONTENTFUL_TOKEN}` },
    });

    if (!resp.ok) return null;
    const asset = await resp.json();
    const fileField = asset.fields?.file?.['en-US'];
    const fileUrl = fileField?.url;
    if (!fileUrl) return null;

    const url = fileUrl.startsWith('//') ? `https:${fileUrl}` : fileUrl;
    const filename = fileField?.fileName || null;

    return { url, filename };
  } catch {
    return null;
  }
}

/**
 * Upload an image buffer to WordPress media library
 */
async function uploadToWordPress(buffer, filename, mimeType) {
  const url = `${WP_BASE_URL}/wp-json/wp/v2/media`;
  const fetchOpts = {
    method: 'POST',
    headers: {
      'Authorization': authHeader(),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Type': mimeType,
    },
    body: buffer,
    ...(WP_BASE_URL.includes('.local') ? { agent: httpsAgent } : {}),
  };

  const resp = await fetch(url, fetchOpts);
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(`Upload failed ${resp.status}: ${err.message || JSON.stringify(err)}`);
  }

  return resp.json();
}

/**
 * Check if a Contentful image already exists in WP media library (by filename)
 */
async function findExistingMedia(filename) {
  try {
    const searchName = path.basename(filename, path.extname(filename));
    const { data } = await wpFetch(`/media?search=${encodeURIComponent(searchName)}&per_page=10`);
    // Match by filename in source_url
    return data.find(m => m.source_url?.split('/').pop() === filename);
  } catch {
    return null;
  }
}

// ─── Main Migration Logic ────────────────────────────────────────────

async function main() {
  log('\n🖼️  Contentful CDN → WordPress Image Migration', c.bold);
  log('═'.repeat(55), c.cyan);

  if (!WP_PASSWORD) {
    logErr('Missing WP_APPLICATION_PASSWORD in .env');
    process.exit(1);
  }

  if (DRY_RUN) log('\n  🧪 DRY RUN MODE — no changes will be made\n', c.yellow);
  if (REPORT_ONLY) log('\n  📋 REPORT MODE — scanning only\n', c.yellow);

  // ─── Step 1: Fetch all WP content ───
  log('\n  Fetching WordPress content...', c.gray);

  let allContent = [];

  if (POST_TYPE === 'all' || POST_TYPE === 'posts') {
    const posts = await fetchAll('/posts?status=any');
    allContent.push(...posts.map(p => ({ ...p, _type: 'post' })));
    logInfo(`Fetched ${posts.length} posts`);
  }

  if (POST_TYPE === 'all' || POST_TYPE === 'pages') {
    const pages = await fetchAll('/pages?status=any');
    allContent.push(...pages.map(p => ({ ...p, _type: 'page' })));
    logInfo(`Fetched ${pages.length} pages`);
  }

  // Also check custom post types if they exist
  if (POST_TYPE === 'all') {
    try {
      const communities = await fetchAll('/community?status=any');
      allContent.push(...communities.map(p => ({ ...p, _type: 'community' })));
      logInfo(`Fetched ${communities.length} communities`);
    } catch {
      // Custom post type may not exist
    }
  }

  log(`\n  Total content items to scan: ${allContent.length}`, c.gray);

  // ─── Step 2: Scan content for Contentful URLs ───
  log('\n' + '═'.repeat(55), c.cyan);
  log('  Scanning for Contentful CDN images', c.bold);
  log('═'.repeat(55), c.cyan);

  const urlMap = {}; // contentful URL → { posts: [], filename }
  let totalImages = 0;

  for (const item of allContent) {
    const content = item.content?.rendered || item.content?.raw || '';
    const urls = extractContentfulUrls(content);

    if (urls.length > 0) {
      for (const url of urls) {
        const cleanUrl = url.split('?')[0]; // Normalize (strip query params for dedup)
        if (!urlMap[cleanUrl]) {
          urlMap[cleanUrl] = {
            originalUrls: new Set(),
            posts: [],
            filename: getFilenameFromUrl(url),
          };
          totalImages++;
        }
        urlMap[cleanUrl].originalUrls.add(url); // Track with query params too
        urlMap[cleanUrl].posts.push({
          id: item.id,
          type: item._type,
          slug: item.slug,
          title: item.title?.rendered || item.title || '',
        });
      }
    }
  }

  log(`\n  Found ${totalImages} unique Contentful images across content`, c.bold);

  // Show summary of affected content
  const affectedItems = new Set();
  for (const entry of Object.values(urlMap)) {
    for (const post of entry.posts) {
      affectedItems.add(`${post.type}:${post.id}`);
    }
  }
  logInfo(`Affected content items: ${affectedItems.size}`);

  // ─── Report mode: show details and exit ───
  if (REPORT_ONLY) {
    log('\n' + '═'.repeat(55), c.cyan);
    log('  📋 Contentful Image Report', c.bold);
    log('═'.repeat(55), c.cyan);

    const report = {
      totalImages,
      affectedContentItems: affectedItems.size,
      images: [],
    };

    for (const [url, entry] of Object.entries(urlMap)) {
      const postList = entry.posts.map(p => `${p.type}:${p.slug}`).join(', ');
      logInfo(`${entry.filename} → used in: ${postList}`);
      log(`    ${c.gray}${url}${c.reset}`);
      report.images.push({
        url,
        filename: entry.filename,
        usedIn: entry.posts,
      });
    }

    // Save report
    const reportPath = path.join('temp', 'contentful-images-report.json');
    fs.mkdirSync('temp', { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    logOk(`Report saved to ${reportPath}`);
    return;
  }

  if (totalImages === 0) {
    logOk('No Contentful CDN images found. Nothing to migrate!');
    return;
  }

  // ─── Step 3: Download & Upload images ───
  log('\n' + '═'.repeat(55), c.cyan);
  log('  Downloading & Uploading Images', c.bold);
  log('═'.repeat(55), c.cyan);

  const replacements = {}; // contentful URL → new WP URL
  let uploaded = 0, skipped = 0, failed = 0;
  const entries = Object.entries(urlMap);

  for (let i = 0; i < entries.length; i++) {
    const [contentfulUrl, entry] = entries[i];
    const { filename } = entry;
    const progress = `[${i + 1}/${entries.length}]`;

    try {
      // Check if already uploaded
      const existing = await findExistingMedia(filename);
      if (existing) {
        logInfo(`${progress} "${filename}" already in WP media (ID: ${existing.id})`);
        replacements[contentfulUrl] = existing.source_url;
        // Also map all original URLs with query params
        for (const origUrl of entry.originalUrls) {
          replacements[origUrl] = existing.source_url;
        }
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        logWarn(`${progress} [DRY-RUN] Would migrate: ${filename}`);
        log(`    ${c.gray}From: ${contentfulUrl}${c.reset}`);
        continue;
      }

      // Download from Contentful
      const { buffer, resolvedFilename } = await downloadImage(contentfulUrl);
      // Use resolved filename from API if available (fixes mismatched names like mc.com → mc.com_infographic.png)
      const uploadFilename = resolvedFilename
        ? getFilenameFromUrl(resolvedFilename)
        : filename;
      const mimeType = getMimeType(uploadFilename);
      const size = (buffer.length / 1024).toFixed(0) + 'KB';

      // Upload to WordPress
      const media = await uploadToWordPress(buffer, uploadFilename, mimeType);

      replacements[contentfulUrl] = media.source_url;
      // Also map URLs with query params
      for (const origUrl of entry.originalUrls) {
        replacements[origUrl] = media.source_url;
      }

      logOk(`${progress} Uploaded: ${filename} (${size}) → WP ID: ${media.id}`);
      uploaded++;

      // Small delay to avoid overwhelming the server
      await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      logErr(`${progress} Failed "${filename}": ${err.message}`);
      log(`    ${c.gray}URL: ${contentfulUrl}${c.reset}`);
      failed++;
    }
  }

  // ─── Step 4: Replace URLs in content ───
  if (!DRY_RUN && Object.keys(replacements).length > 0) {
    log('\n' + '═'.repeat(55), c.cyan);
    log('  Replacing URLs in Content', c.bold);
    log('═'.repeat(55), c.cyan);

    let updatedPosts = 0;

    for (const item of allContent) {
      let content = item.content?.rendered || item.content?.raw || '';
      let changed = false;

      // Sort replacements by URL length (longest first) to avoid partial replacements
      const sortedReplacements = Object.entries(replacements)
        .sort(([a], [b]) => b.length - a.length);

      for (const [oldUrl, newUrl] of sortedReplacements) {
        if (content.includes(oldUrl)) {
          content = content.replaceAll(oldUrl, newUrl);
          changed = true;
        }
      }

      if (changed) {
        try {
          const endpoint = item._type === 'page' ? '/pages'
            : item._type === 'community' ? '/community'
            : '/posts';

          await wpFetch(`${endpoint}/${item.id}`, {
            method: 'POST',
            body: JSON.stringify({ content }),
          });

          logOk(`Updated: ${item._type} "${item.slug}" (ID: ${item.id})`);
          updatedPosts++;
        } catch (err) {
          logErr(`Failed to update ${item._type} "${item.slug}": ${err.message}`);
        }
      }
    }

    logInfo(`Updated ${updatedPosts} content items with new image URLs`);
  }

  // ─── Summary ───
  log('\n' + '═'.repeat(55), c.cyan);
  log('  📊 Migration Summary', c.bold);
  log('═'.repeat(55), c.cyan);
  logOk(`Uploaded: ${uploaded}`);
  logInfo(`Skipped: ${skipped} (already in WP)`);
  if (failed > 0) logErr(`Failed: ${failed}`);
  logInfo(`URL replacements: ${Object.keys(replacements).length}`);

  // Save URL mapping for reference
  if (Object.keys(replacements).length > 0) {
    const mapPath = path.join('temp', 'contentful-to-wp-image-map.json');
    fs.mkdirSync('temp', { recursive: true });
    fs.writeFileSync(mapPath, JSON.stringify(replacements, null, 2));
    logInfo(`URL mapping saved to ${mapPath}`);
  }

  log('');
}

main().catch(err => {
  logErr(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
