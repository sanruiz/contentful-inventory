#!/usr/bin/env node

/**
 * Import Guide Posts from Contentful to WordPress
 * 
 * Fetches 6 guide posts from Contentful, converts their rich text content
 * to WordPress HTML, resolves embedded assets and entries, and creates
 * WordPress posts with the "guides" category.
 * 
 * Usage: node src/migration/import-guides.js
 */

import 'dotenv/config';
import pkg from 'contentful-management';
const { createClient } = pkg;
import fetch from 'node-fetch';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { richTextToHtml } from '../contentful/rich-text-to-html.js';

// ─── Configuration ───────────────────────────────────────────────────

const contentfulClient = createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

const spaceId = process.env.CONTENTFUL_SPACE_ID || '61iwodu7d9u0';
const envId = process.env.CONTENTFUL_ENVIRONMENT_ID || 'master';

const WP_BASE_URL = process.env.WP_BASE_URL;
const WP_USERNAME = process.env.WP_USERNAME;
const WP_PASSWORD = process.env.WP_APPLICATION_PASSWORD;

const agent = new https.Agent({ rejectUnauthorized: false });
const wpAuth = Buffer.from(`${WP_USERNAME}:${WP_PASSWORD}`).toString('base64');

const CATEGORY_NAME = 'Guides';

// Target guide posts
const TARGET_SLUGS = [
  'diabetes-care-guide-for-seniors',
  'guide-to-lgbtqia-senior-housing',
  'financial-assistance-for-seniors',
  'financial-and-legal-planning-resources-for-people-with-alzheimers',
  'guide-to-caring-for-an-aging-parent-from-a-long-distance',
  'senior-dental-care-guide',
];

// ─── WordPress API Helpers ───────────────────────────────────────────

async function wpFetch(endpoint, options = {}) {
  const url = `${WP_BASE_URL}/wp-json/wp/v2${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${wpAuth}`,
      ...options.headers,
    },
    agent,
    ...options,
  });
  return response;
}

/**
 * Get or create the "Guides" category in WordPress
 */
async function getOrCreateCategory() {
  console.log(`\n📂 Looking for category: "${CATEGORY_NAME}"...`);

  // Search existing categories
  const searchRes = await wpFetch(`/categories?search=${encodeURIComponent(CATEGORY_NAME)}&per_page=100`);
  const categories = await searchRes.json();

  const existing = categories.find(c =>
    c.name.toLowerCase() === CATEGORY_NAME.toLowerCase() ||
    c.slug === CATEGORY_NAME.toLowerCase()
  );

  if (existing) {
    console.log(`   ✅ Found existing category: ID ${existing.id} (${existing.name})`);
    return existing.id;
  }

  // Create category
  console.log(`   Creating category "${CATEGORY_NAME}"...`);
  const createRes = await wpFetch('/categories', {
    method: 'POST',
    body: JSON.stringify({
      name: CATEGORY_NAME,
      slug: 'guides',
      description: 'Comprehensive guides for seniors and caregivers',
    }),
  });

  if (!createRes.ok) {
    const error = await createRes.text();
    throw new Error(`Failed to create category: ${error}`);
  }

  const newCategory = await createRes.json();
  console.log(`   ✅ Created category: ID ${newCategory.id}`);
  return newCategory.id;
}

/**
 * Check if a post with this slug already exists
 */
async function findExistingPost(slug) {
  const res = await wpFetch(`/posts?slug=${slug}&status=any`);
  const posts = await res.json();
  return posts.length > 0 ? posts[0] : null;
}

/**
 * Create or update a WordPress post
 */
async function createOrUpdatePost(postData) {
  const existing = await findExistingPost(postData.slug);

  if (existing) {
    console.log(`   📝 Post already exists (ID: ${existing.id}), updating...`);
    const res = await wpFetch(`/posts/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify(postData),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to update post: ${error}`);
    }

    const updated = await res.json();
    return { id: updated.id, action: 'updated', url: updated.link };
  }

  // Create new post
  const res = await wpFetch('/posts', {
    method: 'POST',
    body: JSON.stringify(postData),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create post: ${error}`);
  }

  const created = await res.json();
  return { id: created.id, action: 'created', url: created.link };
}

// ─── Contentful Content Resolution ──────────────────────────────────

/**
 * Resolve all embedded entries in the rich text content
 */
async function resolveEmbeddedEntries(document, environment) {
  const entries = {};

  // Recursively find all embedded entry references
  const entryIds = new Set();
  findEntryRefs(document, entryIds);

  for (const entryId of entryIds) {
    try {
      const entry = await environment.getEntry(entryId);
      const ct = entry.sys.contentType.sys.id;
      const fields = entry.fields;

      entries[entryId] = {
        contentType: ct,
        title: fields.title?.['en-US'] || fields.name?.['en-US'] || '',
        fields,
      };

      // Resolve link entries
      if (ct === 'link') {
        entries[entryId].url = fields.url?.['en-US'] || fields.href?.['en-US'] || '';
        entries[entryId].title = fields.text?.['en-US'] || fields.title?.['en-US'] || fields.label?.['en-US'] || '';
      }

    } catch (error) {
      console.warn(`   ⚠️  Could not resolve entry ${entryId}: ${error.message}`);
      entries[entryId] = { contentType: 'unknown', title: '', error: error.message };
    }
  }

  return entries;
}

/**
 * Resolve all embedded assets in the rich text content
 */
async function resolveEmbeddedAssets(document, environment) {
  const assets = {};

  const assetIds = new Set();
  findAssetRefs(document, assetIds);

  for (const assetId of assetIds) {
    try {
      const asset = await environment.getAsset(assetId);
      const file = asset.fields.file?.['en-US'];

      assets[assetId] = {
        title: asset.fields.title?.['en-US'] || '',
        description: asset.fields.description?.['en-US'] || '',
        fileName: file?.fileName || '',
        contentType: file?.contentType || '',
        url: file?.url || '',
        width: file?.details?.image?.width,
        height: file?.details?.image?.height,
      };
    } catch (error) {
      console.warn(`   ⚠️  Could not resolve asset ${assetId}: ${error.message}`);
      assets[assetId] = { title: '', url: '', error: error.message };
    }
  }

  return assets;
}

/**
 * Recursively find entry references in document
 */
function findEntryRefs(node, ids) {
  if (!node) return;
  if (node.data?.target?.sys?.linkType === 'Entry') {
    ids.add(node.data.target.sys.id);
  }
  if (node.content) {
    node.content.forEach(child => findEntryRefs(child, ids));
  }
}

/**
 * Recursively find asset references in document
 */
function findAssetRefs(node, ids) {
  if (!node) return;
  if (node.data?.target?.sys?.linkType === 'Asset') {
    ids.add(node.data.target.sys.id);
  }
  if (node.content) {
    node.content.forEach(child => findAssetRefs(child, ids));
  }
}

// ─── Main Import Flow ───────────────────────────────────────────────

async function main() {
  console.log('🚀 Import Guide Posts: Contentful → WordPress');
  console.log('='.repeat(60));

  // Validate environment
  if (!WP_BASE_URL || !WP_USERNAME || !WP_PASSWORD) {
    console.error('❌ Missing WordPress credentials. Check your .env file.');
    console.error('   Required: WP_BASE_URL, WP_USERNAME, WP_APPLICATION_PASSWORD');
    process.exit(1);
  }

  if (!process.env.CONTENTFUL_MANAGEMENT_TOKEN) {
    console.error('❌ Missing CONTENTFUL_MANAGEMENT_TOKEN. Check your .env file.');
    process.exit(1);
  }

  // Step 1: Get or create WordPress category
  const categoryId = await getOrCreateCategory();

  // Step 2: Connect to Contentful
  console.log('\n📡 Connecting to Contentful...');
  const space = await contentfulClient.getSpace(spaceId);
  const environment = await space.getEnvironment(envId);
  console.log('   ✅ Connected');

  // Step 3: Fetch and process each guide post
  const results = [];
  const outputDir = path.join(process.cwd(), 'out', 'guides');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const slug of TARGET_SLUGS) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📄 Processing: ${slug}`);

    try {
      // Find entry by slug
      const entriesRes = await environment.getEntries({
        content_type: 'page',
        'fields.slug': slug,
        limit: 1,
      });

      if (entriesRes.items.length === 0) {
        console.log(`   ❌ Not found in Contentful`);
        results.push({ slug, success: false, error: 'Not found' });
        continue;
      }

      const entry = entriesRes.items[0];
      const fields = entry.fields;
      const title = fields.title?.['en-US'] || '';
      const description = fields.description?.['en-US'] || '';
      const body = fields.body?.['en-US'];
      const heroContent = fields.heroContent?.['en-US'];

      console.log(`   📋 Title: ${title}`);
      console.log(`   📋 Entry ID: ${entry.sys.id}`);

      if (!body || body.nodeType !== 'document') {
        console.log(`   ⚠️  No body rich text content found`);
        results.push({ slug, title, success: false, error: 'No body content' });
        continue;
      }

      // Resolve embedded entries and assets in body
      console.log(`   🔗 Resolving embedded content...`);
      const [bodyEntries, bodyAssets] = await Promise.all([
        resolveEmbeddedEntries(body, environment),
        resolveEmbeddedAssets(body, environment),
      ]);

      // Also resolve hero content if it exists
      let heroHtml = '';
      if (heroContent && heroContent.nodeType === 'document') {
        const [heroEntries, heroAssets] = await Promise.all([
          resolveEmbeddedEntries(heroContent, environment),
          resolveEmbeddedAssets(heroContent, environment),
        ]);
        heroHtml = richTextToHtml(heroContent, {
          assets: heroAssets,
          entries: heroEntries,
        });
      }

      const entryCount = Object.keys(bodyEntries).length;
      const assetCount = Object.keys(bodyAssets).length;
      console.log(`   📊 Resolved: ${entryCount} entries, ${assetCount} assets`);

      // Convert body rich text to HTML
      console.log(`   🔄 Converting rich text to WordPress HTML...`);
      const bodyHtml = richTextToHtml(body, {
        assets: bodyAssets,
        entries: bodyEntries,
      });

      // Combine hero + body content
      let fullContent = '';
      if (heroHtml) {
        fullContent += `<!-- Hero Content -->\n${heroHtml}\n\n<!-- Main Content -->\n`;
      }
      fullContent += bodyHtml;

      // Save HTML to file for review
      const htmlFilePath = path.join(outputDir, `${slug}.html`);
      fs.writeFileSync(htmlFilePath, fullContent);
      console.log(`   💾 Saved HTML preview: ${htmlFilePath}`);

      // Create/update WordPress post
      console.log(`   📤 Sending to WordPress...`);
      const postData = {
        title,
        slug,
        content: fullContent,
        status: 'publish',
        categories: [categoryId],
        excerpt: description,
        meta: {
          contentful_entry_id: entry.sys.id,
          contentful_content_type: 'page',
        },
      };

      const result = await createOrUpdatePost(postData);
      console.log(`   ✅ Post ${result.action}: ID ${result.id}`);
      console.log(`   🔗 URL: ${result.url}`);

      results.push({
        slug,
        title,
        success: true,
        wpPostId: result.id,
        action: result.action,
        url: result.url,
        embeddedEntries: entryCount,
        embeddedAssets: assetCount,
      });

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      results.push({ slug, success: false, error: error.message });
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 IMPORT SUMMARY\n');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  successful.forEach(r => {
    console.log(`   • ${r.title} (ID: ${r.wpPostId}, ${r.action})`);
    console.log(`     ${r.url}`);
    console.log(`     Embedded: ${r.embeddedEntries} entries, ${r.embeddedAssets} assets`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    failed.forEach(r => {
      console.log(`   • ${r.slug}: ${r.error}`);
    });
  }

  // Save results
  const resultsPath = path.join(process.cwd(), 'out', 'guides-import-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${resultsPath}`);

  console.log(`\n🏷️  Category: "${CATEGORY_NAME}" (ID: ${categoryId})`);
  console.log('✨ Import complete!');
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
