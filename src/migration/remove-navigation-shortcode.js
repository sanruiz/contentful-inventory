#!/usr/bin/env node

/**
 * Remove [navigationMenu Component: ...] Shortcodes from All Posts
 *
 * Removes leftover Contentful navigationMenu component shortcodes
 * from WordPress post content across all post types (posts, pages, communities).
 *
 * Example shortcode removed:
 *   [navigationMenu Component: 3dHvZFPFI5CZ5ccOM8KNwY]
 *
 * Usage: node src/migration/remove-navigation-shortcode.js
 *   Options:
 *     --dry-run       Preview without updating WP posts
 *     --limit=N       Process only first N posts
 *     --type=TYPE     Only process a specific post type (posts, pages, community)
 */

import 'dotenv/config';
import fetch from 'node-fetch';
import https from 'https';

// ─── Configuration ───────────────────────────────────────────────────

const WP_BASE_URL = process.env.WP_BASE_URL;
const WP_USERNAME = process.env.WP_USERNAME;
const WP_PASSWORD = process.env.WP_APPLICATION_PASSWORD;

const agent = new https.Agent({ rejectUnauthorized: false });
const wpAuth = Buffer.from(`${WP_USERNAME}:${WP_PASSWORD}`).toString('base64');

const RATE_LIMIT_DELAY = 100;

// ─── CLI Arguments ───────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 0;
const TYPE_FILTER = args.find(a => a.startsWith('--type='))?.split('=')[1]?.toLowerCase() || '';

// ─── WordPress API Helpers ───────────────────────────────────────────

async function wpFetch(endpoint, options = {}) {
  const url = `${WP_BASE_URL}/wp-json/wp/v2${endpoint}`;
  return fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${wpAuth}`,
      ...options.headers,
    },
    agent,
    ...options,
  });
}

/**
 * Fetch all items from a paginated WP REST endpoint.
 */
async function fetchAllPosts(endpoint) {
  const posts = [];
  let page = 1;

  while (true) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const res = await wpFetch(`${endpoint}${separator}per_page=100&page=${page}&status=any&context=edit`);

    if (!res.ok) {
      if (res.status === 400) break; // past last page
      throw new Error(`Failed to fetch ${endpoint}: ${res.status} ${res.statusText}`);
    }

    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    posts.push(...batch);
    process.stdout.write(`\r   Fetched ${posts.length} posts from ${endpoint}...`);

    const totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1');
    if (page >= totalPages) break;
    page++;
  }

  return posts;
}

// ─── Shortcode Removal ──────────────────────────────────────────────

/**
 * Remove [navigationMenu Component: <id>] shortcodes from content.
 * Matches any Contentful entry ID inside the shortcode.
 *
 * Examples:
 *   [navigationMenu Component: 3dHvZFPFI5CZ5ccOM8KNwY]
 *   [navigationMenu Component: abc123xyz]
 */
function removeNavigationShortcode(content) {
  // Match [navigationMenu Component: <any-id>] with optional whitespace
  const pattern = /\[navigationMenu\s+Component:\s*[^\]]+\]\s*/g;

  let cleaned = content.replace(pattern, '');

  // Clean up any resulting double blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Trim trailing whitespace at end
  cleaned = cleaned.trimEnd() + '\n';

  return cleaned;
}

// ─── Post type endpoints to scan ─────────────────────────────────────

const POST_TYPES = [
  { name: 'posts', endpoint: '/posts' },
  { name: 'pages', endpoint: '/pages' },
  { name: 'community', endpoint: '/community' },
];

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('🧹 Remove [navigationMenu Component: ...] Shortcodes');
  console.log('='.repeat(60));

  if (DRY_RUN) console.log('🔍 DRY RUN MODE — no WordPress changes will be made\n');
  if (LIMIT) console.log(`📏 Limit: ${LIMIT} posts`);
  if (TYPE_FILTER) console.log(`📂 Type filter: ${TYPE_FILTER} only`);

  if (!WP_BASE_URL || !WP_USERNAME || !WP_PASSWORD) {
    console.error('❌ Missing WordPress credentials. Check your .env file.');
    process.exit(1);
  }

  // ─── Step 1: Fetch posts across all types ─────────────────────────

  const typesToScan = TYPE_FILTER
    ? POST_TYPES.filter(t => t.name === TYPE_FILTER)
    : POST_TYPES;

  if (typesToScan.length === 0) {
    console.error(`❌ Unknown post type: "${TYPE_FILTER}". Available: ${POST_TYPES.map(t => t.name).join(', ')}`);
    process.exit(1);
  }

  console.log('\n📡 Fetching posts from WordPress...');
  let allPosts = [];

  for (const type of typesToScan) {
    console.log(`\n   📂 Fetching ${type.name}...`);
    try {
      const posts = await fetchAllPosts(type.endpoint);
      // Tag each post with its type and endpoint for later updates
      posts.forEach(p => {
        p._wpType = type.name;
        p._wpEndpoint = type.endpoint;
      });
      allPosts.push(...posts);
      console.log(`\n   ✅ ${posts.length} ${type.name}`);
    } catch (error) {
      console.warn(`\n   ⚠️  Could not fetch ${type.name}: ${error.message}`);
    }
  }

  console.log(`\n   📋 Total posts fetched: ${allPosts.length}`);

  // ─── Step 2: Filter to posts that contain the shortcode ───────────

  let targetPosts = allPosts.filter(p => {
    const content = p.content?.raw || p.content?.rendered || '';
    return content.includes('navigationMenu');
  });

  console.log(`   🎯 Posts with [navigationMenu ...] shortcode: ${targetPosts.length}`);

  if (LIMIT) {
    targetPosts = targetPosts.slice(0, LIMIT);
    console.log(`   📏 Limited to ${targetPosts.length} posts`);
  }

  if (targetPosts.length === 0) {
    console.log('\n✨ No posts contain [navigationMenu] shortcodes. Nothing to do!');
    return;
  }

  // ─── Step 3: Process each post ────────────────────────────────────

  console.log('\n🔄 Processing posts...\n');

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < targetPosts.length; i++) {
    const post = targetPosts[i];
    const title = post.title?.raw || post.title?.rendered || post.slug;
    const rawContent = post.content?.raw || post.content?.rendered || '';
    const postType = post._wpType;
    const endpoint = post._wpEndpoint;

    // Progress / ETA
    const elapsed = (Date.now() - startTime) / 1000;
    const avgPer = i > 0 ? elapsed / i : 0;
    const remaining = (targetPosts.length - i) * avgPer;
    const eta = remaining > 60 ? `${Math.round(remaining / 60)}m` : `${Math.round(remaining)}s`;

    // Remove shortcode
    const cleanedContent = removeNavigationShortcode(rawContent);

    if (cleanedContent.trim() === rawContent.trim()) {
      skipped++;
      console.log(`   [${i + 1}/${targetPosts.length}] ⏭️  (${postType}) ${title} — pattern not matched`);
      continue;
    }

    const removedBytes = rawContent.length - cleanedContent.length;

    if (DRY_RUN) {
      console.log(`   [${i + 1}/${targetPosts.length}] 🔍 (${postType}) ${title} — would remove shortcode (−${removedBytes} chars)`);
      updated++;
      continue;
    }

    // Update post in WordPress
    try {
      const res = await wpFetch(`${endpoint}/${post.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          content: cleanedContent,
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`HTTP ${res.status}: ${error}`);
      }

      updated++;
      console.log(`   [${i + 1}/${targetPosts.length}] ✅ (${postType}) ${title} — removed shortcode (−${removedBytes} chars)${i > 0 ? ` | ETA: ${eta}` : ''}`);

      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
    } catch (error) {
      failed++;
      console.error(`   [${i + 1}/${targetPosts.length}] ❌ (${postType}) ${title} — ${error.message}`);
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 NAVIGATION SHORTCODE REMOVAL SUMMARY\n');
  console.log(`   ✅ Updated:        ${updated}`);
  console.log(`   ⏭️  Skipped:        ${skipped}`);
  console.log(`   ❌ Failed:         ${failed}`);
  console.log(`   📋 Total scanned:  ${targetPosts.length}`);
  console.log(`   ⏱️  Time:           ${Math.floor(totalTime / 60)}m ${totalTime % 60}s`);

  if (DRY_RUN) {
    console.log('\n🔍 This was a DRY RUN. Run without --dry-run to apply changes.');
  }

  console.log('\n✨ Navigation shortcode removal complete!');
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
