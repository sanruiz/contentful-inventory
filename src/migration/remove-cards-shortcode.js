#!/usr/bin/env node

/**
 * Remove contentful_cards Shortcode from City Pages
 *
 * Now that provider listings data is stored in the `provider_listings`
 * custom field, the [contentful_cards] shortcode is no longer needed
 * in the post content. This script removes it from all city pages.
 *
 * Usage: node src/migration/remove-cards-shortcode.js
 *   Options:
 *     --dry-run     Preview without updating WP posts
 *     --limit=N     Process only first N cities
 *     --state=XX    Only process cities for a specific state
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
const STATE_FILTER = args.find(a => a.startsWith('--state='))?.split('=')[1]?.toUpperCase() || '';

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

// ─── Shortcode Removal ──────────────────────────────────────────────

/**
 * Remove the contentful_cards shortcode line from content.
 * Matches: [contentful_cards id="1xZL9ddpnnXt4at49qfB92" ...]
 * Also handles the variant with hyphens: [contentful-cards ...]
 */
function removeCardsShortcode(content) {
  // Match the full shortcode including nested brackets in the title attribute
  // Pattern: [contentful_cards ... ] or [contentful-cards ... ]
  // The title contains "[ city-state ]" so we need to handle nested brackets
  const pattern = /\[contentful[_-]cards\s+id="1xZL9ddpnnXt4at49qfB92"[^\]]*\[[^\]]*\][^\]]*\]\s*/g;

  let cleaned = content.replace(pattern, '');

  // Fallback: broader pattern for any contentful_cards shortcode with this ID
  if (cleaned === content) {
    // Try a simpler approach — match from [contentful_cards to lowercase"]
    const fallback = /\[contentful[_-]cards\s+id="1xZL9ddpnnXt4at49qfB92".*?lowercase"\]\s*/gs;
    cleaned = content.replace(fallback, '');
  }

  // Clean up any resulting double blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned;
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('🧹 Remove contentful_cards Shortcode from City Pages');
  console.log('='.repeat(60));

  if (DRY_RUN) console.log('🔍 DRY RUN MODE — no WordPress changes will be made\n');
  if (LIMIT) console.log(`📏 Limit: ${LIMIT} cities`);
  if (STATE_FILTER) console.log(`🗺️  State filter: ${STATE_FILTER} only`);

  if (!WP_BASE_URL || !WP_USERNAME || !WP_PASSWORD) {
    console.error('❌ Missing WordPress credentials. Check your .env file.');
    process.exit(1);
  }

  // ─── Step 1: Fetch all city posts (with raw content) ──────────────

  console.log('\n📡 Fetching city posts from WordPress...');
  const posts = [];
  let page = 1;

  while (true) {
    const res = await wpFetch(`/community?listing_type=city&per_page=100&page=${page}&status=any&context=edit`);

    if (!res.ok) {
      if (res.status === 400) break;
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

  // Apply filters
  let cityPosts = posts;

  if (STATE_FILTER) {
    cityPosts = cityPosts.filter(p => (p.meta?.state_short || '').toUpperCase() === STATE_FILTER);
    console.log(`   Filtered to ${cityPosts.length} cities in ${STATE_FILTER}`);
  }

  if (LIMIT) {
    cityPosts = cityPosts.slice(0, LIMIT);
    console.log(`   Limited to ${cityPosts.length} cities`);
  }

  // ─── Step 2: Process each post ────────────────────────────────────

  console.log('\n🔄 Processing cities...\n');

  let updated = 0;
  let noShortcode = 0;
  let failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < cityPosts.length; i++) {
    const post = cityPosts[i];
    const title = post.title?.raw || post.slug;
    const rawContent = post.content?.raw || '';

    // Progress
    const elapsed = (Date.now() - startTime) / 1000;
    const avgPer = i > 0 ? elapsed / i : 0;
    const remaining = (cityPosts.length - i) * avgPer;
    const eta = remaining > 60 ? `${Math.round(remaining / 60)}m` : `${Math.round(remaining)}s`;

    // Check if shortcode exists
    if (!rawContent.includes('contentful_cards') && !rawContent.includes('contentful-cards')) {
      noShortcode++;
      continue;
    }

    // Remove shortcode
    const cleanedContent = removeCardsShortcode(rawContent);

    if (cleanedContent === rawContent) {
      noShortcode++;
      if (i < 5) console.log(`   [${i + 1}/${cityPosts.length}] ⏭️  ${title} — shortcode pattern not matched`);
      continue;
    }

    const removedBytes = rawContent.length - cleanedContent.length;

    if (DRY_RUN) {
      console.log(`   [${i + 1}/${cityPosts.length}] 🔍 ${title} — would remove shortcode (−${removedBytes} chars)`);
      updated++;
      continue;
    }

    // Update post
    try {
      const res = await wpFetch(`/community/${post.id}`, {
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
      console.log(`   [${i + 1}/${cityPosts.length}] ✅ ${title} — removed shortcode (−${removedBytes} chars)${i > 0 ? ` | ETA: ${eta}` : ''}`);

      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
    } catch (error) {
      failed++;
      console.error(`   [${i + 1}/${cityPosts.length}] ❌ ${title} — ${error.message}`);
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 SHORTCODE REMOVAL SUMMARY\n');
  console.log(`   ✅ Updated:        ${updated}`);
  console.log(`   ⏭️  No shortcode:   ${noShortcode}`);
  console.log(`   ❌ Failed:         ${failed}`);
  console.log(`   📋 Total posts:    ${cityPosts.length}`);
  console.log(`   ⏱️  Time:           ${Math.floor(totalTime / 60)}m ${totalTime % 60}s`);
  console.log('\n✨ Shortcode removal complete!');
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
