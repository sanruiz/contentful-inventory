#!/usr/bin/env node

/**
 * Import State Pages from Contentful to WordPress
 * 
 * Fetches all 51 state pages (pageType: "state") from Contentful,
 * converts rich text to HTML, and creates them as top-level
 * "community" CPT posts in WordPress (parent=0).
 * 
 * Usage: node src/migration/import-states.js
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

// State name → abbreviation map
const STATE_ABBREVIATIONS = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new-hampshire': 'NH', 'new-jersey': 'NJ', 'new-mexico': 'NM', 'new-york': 'NY',
  'north-carolina': 'NC', 'north-dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode-island': 'RI', 'south-carolina': 'SC',
  'south-dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west-virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY',
};

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
 * Check if a community post with this slug already exists
 */
async function findExistingCommunity(slug) {
  const res = await wpFetch(`/community?slug=${slug}&status=any&per_page=1`);
  const posts = await res.json();
  if (Array.isArray(posts) && posts.length > 0) {
    return posts[0];
  }
  return null;
}

/**
 * Create or update a WordPress community post
 */
async function createOrUpdateCommunity(postData) {
  const existing = await findExistingCommunity(postData.slug);

  if (existing) {
    console.log(`   📝 Already exists (ID: ${existing.id}), updating...`);
    const res = await wpFetch(`/community/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify(postData),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to update community: ${error}`);
    }

    const updated = await res.json();
    return { id: updated.id, action: 'updated', url: updated.link };
  }

  // Create new
  const res = await wpFetch('/community', {
    method: 'POST',
    body: JSON.stringify(postData),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create community: ${error}`);
  }

  const created = await res.json();
  return { id: created.id, action: 'created', url: created.link };
}

// ─── Contentful Content Resolution ──────────────────────────────────

/**
 * Recursively find entry references in a document
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
 * Recursively find asset references in a document
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

/**
 * Resolve all embedded entries referenced in the rich text
 */
async function resolveEmbeddedEntries(document, environment) {
  const entries = {};
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

      if (ct === 'link') {
        entries[entryId].url = fields.url?.['en-US'] || fields.href?.['en-US'] || '';
        entries[entryId].title = fields.text?.['en-US'] || fields.title?.['en-US'] || fields.label?.['en-US'] || '';
      }

      // Resolve nested linked entries (e.g., linkReference → link entries)
      if (ct === 'linkReference') {
        const links = fields.links?.['en-US'] || [];
        for (const linkRef of links) {
          const linkedId = linkRef?.sys?.id;
          if (linkedId && !entries[linkedId]) {
            try {
              const linkedEntry = await environment.getEntry(linkedId);
              const linkedCt = linkedEntry.sys.contentType.sys.id;
              entries[linkedId] = {
                contentType: linkedCt,
                title: linkedEntry.fields.title?.['en-US'] || linkedEntry.fields.linkText?.['en-US'] || '',
                url: linkedEntry.fields.url?.['en-US'] || '',
                fields: linkedEntry.fields,
              };
            } catch (e) {
              console.warn(`   ⚠️  Could not resolve linked entry ${linkedId}: ${e.message}`);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`   ⚠️  Could not resolve entry ${entryId}: ${error.message}`);
      entries[entryId] = { contentType: 'unknown', title: '', error: error.message };
    }
  }

  return entries;
}

/**
 * Resolve all embedded assets referenced in the rich text
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
 * Convert a rich text document to HTML, resolving all references
 */
async function convertRichText(document, environment) {
  if (!document || document.nodeType !== 'document') return '';

  const [entries, assets] = await Promise.all([
    resolveEmbeddedEntries(document, environment),
    resolveEmbeddedAssets(document, environment),
  ]);

  const html = richTextToHtml(document, { assets, entries });
  return { html, entryCount: Object.keys(entries).length, assetCount: Object.keys(assets).length };
}

/**
 * Extract the state slug from a Contentful slug
 * "memory-care-in-texas" → "texas"
 * "memory-care-in-new-york" → "new-york"
 */
function extractStateSlug(contentfulSlug) {
  return contentfulSlug.replace(/^memory-care-in-/, '').replace(/\d+$/, '').trim();
}

// ─── Main Import Flow ───────────────────────────────────────────────

async function main() {
  console.log('🏛️  Import State Pages: Contentful → WordPress');
  console.log('='.repeat(60));

  // Validate environment
  if (!WP_BASE_URL || !WP_USERNAME || !WP_PASSWORD) {
    console.error('❌ Missing WordPress credentials. Check your .env file.');
    process.exit(1);
  }

  if (!process.env.CONTENTFUL_MANAGEMENT_TOKEN) {
    console.error('❌ Missing CONTENTFUL_MANAGEMENT_TOKEN.');
    process.exit(1);
  }

  // Connect to Contentful
  console.log('\n📡 Connecting to Contentful...');
  const space = await contentfulClient.getSpace(spaceId);
  const environment = await space.getEnvironment(envId);
  console.log('   ✅ Connected');

  // Fetch all state pages
  console.log('\n📥 Fetching state pages from Contentful...');
  const allStatePages = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    const batch = await environment.getEntries({
      content_type: 'page',
      'fields.pageType': 'state',
      limit,
      skip,
    });
    allStatePages.push(...batch.items);
    if (allStatePages.length >= batch.total) break;
    skip += limit;
  }

  console.log(`   Found ${allStatePages.length} state pages`);

  // Filter out duplicates (e.g., "memory-care-in-alaska2")
  const statePages = allStatePages.filter(entry => {
    const slug = entry.fields.slug?.['en-US'] || '';
    // Skip entries with trailing numbers (duplicates like "alaska2")
    return !slug.match(/\d+$/);
  });

  console.log(`   After filtering duplicates: ${statePages.length} state pages`);

  // Sort by slug for predictable order
  statePages.sort((a, b) => {
    const slugA = a.fields.slug?.['en-US'] || '';
    const slugB = b.fields.slug?.['en-US'] || '';
    return slugA.localeCompare(slugB);
  });

  // Process each state
  const results = [];
  const outputDir = path.join(process.cwd(), 'out', 'communities', 'states');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (let i = 0; i < statePages.length; i++) {
    const entry = statePages[i];
    const fields = entry.fields;
    const contentfulSlug = fields.slug?.['en-US'] || '';
    const title = fields.title?.['en-US'] || '';
    const description = fields.description?.['en-US'] || '';
    const stateSlug = extractStateSlug(contentfulSlug);
    const stateShort = STATE_ABBREVIATIONS[stateSlug] || '';
    const linkText = fields.linkText?.['en-US'] || '';
    const heroTextContrast = fields.heroTextContrast?.['en-US'] || false;
    const noindex = fields.noindex?.['en-US'] || false;
    const nofollow = fields.nofollow?.['en-US'] || false;
    const contentBucket = fields.contentBucket?.['en-US'] || '';
    const sitemapGroup = fields.sitemapGroup?.['en-US'] || '';

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[${i + 1}/${statePages.length}] 🏛️  ${title} (${stateShort})`);
    console.log(`   Contentful slug: ${contentfulSlug}`);
    console.log(`   WP slug: ${stateSlug}`);

    try {
      const body = fields.body?.['en-US'];
      const heroContent = fields.heroContent?.['en-US'];

      // Convert hero content
      let heroHtml = '';
      if (heroContent && heroContent.nodeType === 'document') {
        const result = await convertRichText(heroContent, environment);
        heroHtml = result.html;
      }

      // Convert body content
      let bodyHtml = '';
      let entryCount = 0;
      let assetCount = 0;

      if (body && body.nodeType === 'document') {
        const result = await convertRichText(body, environment);
        bodyHtml = result.html;
        entryCount = result.entryCount;
        assetCount = result.assetCount;
        console.log(`   📊 Resolved: ${entryCount} entries, ${assetCount} assets`);
      } else {
        console.log(`   ⚠️  No body content`);
      }

      // Combine content
      let fullContent = '';
      if (heroHtml) {
        fullContent += `<!-- Hero Content -->\n${heroHtml}\n\n<!-- Main Content -->\n`;
      }
      fullContent += bodyHtml;

      // Save HTML preview
      const htmlFilePath = path.join(outputDir, `${stateSlug}.html`);
      fs.writeFileSync(htmlFilePath, fullContent);

      // Create WordPress community post
      console.log(`   📤 Sending to WordPress...`);
      const postData = {
        title,
        slug: stateSlug,
        content: fullContent,
        status: 'publish',
        parent: 0,
        excerpt: description,
        meta: {
          contentful_id: entry.sys.id,
          listing_type: 'state',
          state_short: stateShort,
          state_long: stateSlug,
          original_slug: contentfulSlug,
          original_url: `https://www.memorycare.com/${contentfulSlug}/`,
          content_bucket: contentBucket,
          sitemap_group: sitemapGroup,
          link_text: linkText || title.replace('Memory Care in ', ''),
          hero_text_contrast: heroTextContrast,
          noindex,
          nofollow,
        },
      };

      const result = await createOrUpdateCommunity(postData);
      console.log(`   ✅ ${result.action}: ID ${result.id}`);

      results.push({
        stateSlug,
        stateShort,
        title,
        contentfulId: entry.sys.id,
        wpPostId: result.id,
        action: result.action,
        success: true,
        embeddedEntries: entryCount,
        embeddedAssets: assetCount,
      });

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      results.push({
        stateSlug,
        stateShort,
        title,
        contentfulId: entry.sys.id,
        success: false,
        error: error.message,
      });
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 STATE IMPORT SUMMARY\n');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  successful.forEach(r => {
    console.log(`   • ${r.title} (${r.stateShort}) → WP ID: ${r.wpPostId} [${r.action}]`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    failed.forEach(r => {
      console.log(`   • ${r.title}: ${r.error}`);
    });
  }

  // Save results — this mapping is needed for city imports
  const resultsPath = path.join(process.cwd(), 'out', 'communities', 'state-import-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${resultsPath}`);

  // Save state slug → WP ID mapping for city import
  const stateMap = {};
  for (const r of successful) {
    stateMap[r.contentfulId] = {
      wpPostId: r.wpPostId,
      stateSlug: r.stateSlug,
      stateShort: r.stateShort,
      title: r.title,
    };
  }

  const mapPath = path.join(process.cwd(), 'out', 'communities', 'state-contentful-to-wp-map.json');
  fs.writeFileSync(mapPath, JSON.stringify(stateMap, null, 2));
  console.log(`📋 State mapping saved to: ${mapPath}`);
  console.log(`   (This file is needed for city imports to set parent IDs)\n`);

  console.log('✨ State import complete!');
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
