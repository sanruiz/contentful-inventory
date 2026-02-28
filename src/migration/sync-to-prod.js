#!/usr/bin/env node

/**
 * Sync WordPress Local → Production
 * 
 * Migrates content from local WordPress (memorycare.local) to production
 * (backoffice.memorycare.com) via REST API.
 * 
 * Usage:
 *   node src/migration/sync-to-prod.js                    # Migrate all (categories, pages, posts)
 *   node src/migration/sync-to-prod.js --only=categories  # Only categories
 *   node src/migration/sync-to-prod.js --only=pages       # Only pages
 *   node src/migration/sync-to-prod.js --only=posts       # Only posts
 *   node src/migration/sync-to-prod.js --dry-run          # Preview without creating
 *   node src/migration/sync-to-prod.js --update           # Overwrite existing pages & posts in prod
 *   node src/migration/sync-to-prod.js --update --dry-run # Preview what would be overwritten
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import https from 'https';

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

// For local dev SSL
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const UPDATE = args.includes('--update');
const ONLY = args.find(a => a.startsWith('--only='))?.split('=')[1];

// --- Colors ---
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

function log(msg, color = '') { console.log(`${color}${msg}${c.reset}`); }
function logStep(n, msg) { log(`\n${'═'.repeat(50)}`, c.cyan); log(`  Step ${n}: ${msg}`, c.bold); log(`${'═'.repeat(50)}`, c.cyan); }
function logOk(msg) { log(`  ✅ ${msg}`, c.green); }
function logWarn(msg) { log(`  ⚠️  ${msg}`, c.yellow); }
function logErr(msg) { log(`  ❌ ${msg}`, c.red); }
function logInfo(msg) { log(`  ℹ️  ${msg}`, c.gray); }

// --- API Helpers ---

function authHeader(env) {
  return 'Basic ' + Buffer.from(`${env.user}:${env.pass}`).toString('base64');
}

function fetchOptions(env) {
  return {
    headers: {
      'Authorization': authHeader(env),
      'Content-Type': 'application/json',
    },
    ...(env.url.includes('.local') ? { agent: httpsAgent } : {}),
  };
}

async function apiFetch(env, endpoint, options = {}) {
  const url = `${env.url}/wp-json/wp/v2${endpoint}`;
  const opts = { ...fetchOptions(env), ...options };
  if (options.body) opts.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  if (options.method) opts.method = options.method;

  const resp = await fetch(url, opts);
  const total = resp.headers.get('x-wp-total');
  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(`API ${resp.status}: ${data.message || JSON.stringify(data)}`);
  }

  return { data, total: total ? parseInt(total) : null, totalPages: parseInt(resp.headers.get('x-wp-totalpages') || '1') };
}

// Fetch all items with pagination
async function fetchAll(env, endpoint) {
  const items = [];
  let page = 1;
  while (true) {
    const { data, totalPages } = await apiFetch(env, `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}&status=any`);
    items.push(...data);
    if (page >= totalPages) break;
    page++;
  }
  return items;
}

// --- Migration Functions ---

const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };
const slugMap = { categories: {}, pages: {}, posts: {} }; // local ID → prod ID

async function migrateCategories() {
  logStep(1, 'Migrating Categories');

  const localCats = await fetchAll(LOCAL, '/categories');
  const prodCats = await fetchAll(PROD, '/categories');
  const prodSlugs = new Map(prodCats.map(c => [c.slug, c.id]));

  log(`\n  Local: ${localCats.length} categories | Prod: ${prodCats.length} categories`, c.gray);

  for (const cat of localCats) {
    if (cat.slug === 'uncategorized') {
      // Map to existing uncategorized in prod
      const prodUncatId = prodSlugs.get('uncategorized');
      if (prodUncatId) slugMap.categories[cat.id] = prodUncatId;
      logInfo(`Skipping "uncategorized" (mapped to prod ID: ${prodUncatId})`);
      stats.skipped++;
      continue;
    }

    if (prodSlugs.has(cat.slug)) {
      slugMap.categories[cat.id] = prodSlugs.get(cat.slug);
      logInfo(`Category "${cat.name}" already exists in prod (ID: ${prodSlugs.get(cat.slug)})`);
      stats.skipped++;
      continue;
    }

    if (DRY_RUN) {
      logWarn(`[DRY-RUN] Would create category: ${cat.name} (${cat.slug})`);
      continue;
    }

    try {
      const { data } = await apiFetch(PROD, '/categories', {
        method: 'POST',
        body: { name: cat.name, slug: cat.slug, description: cat.description || '' },
      });
      slugMap.categories[cat.id] = data.id;
      logOk(`Created category: ${data.name} (prod ID: ${data.id})`);
      stats.created++;
    } catch (err) {
      logErr(`Failed to create category "${cat.name}": ${err.message}`);
      stats.failed++;
    }
  }
}

async function migratePages() {
  logStep(2, 'Migrating Pages');

  const localPages = await fetchAll(LOCAL, '/pages');
  const prodPages = await fetchAll(PROD, '/pages');
  const prodSlugs = new Map(prodPages.map(p => [p.slug, p.id]));

  log(`\n  Local: ${localPages.length} pages | Prod: ${prodPages.length} pages`, c.gray);

  // Sort: parents first, then children
  localPages.sort((a, b) => (a.parent || 0) - (b.parent || 0));

  for (const page of localPages) {
    if (prodSlugs.has(page.slug)) {
      const prodId = prodSlugs.get(page.slug);
      slugMap.pages[page.id] = prodId;

      if (UPDATE) {
        // Overwrite existing page in prod
        if (DRY_RUN) {
          logWarn(`[DRY-RUN] Would update page: "${page.slug}" (prod ID: ${prodId}) [${page.status}]`);
          stats.updated++;
          continue;
        }

        try {
          const body = {
            title: page.title.rendered,
            content: page.content.rendered,
            excerpt: page.excerpt?.rendered || '',
            status: page.status,
            parent: page.parent ? (slugMap.pages[page.parent] || 0) : 0,
          };

          if (page.meta && Object.keys(page.meta).length > 0) {
            body.meta = page.meta;
          }

          await apiFetch(PROD, `/pages/${prodId}`, { method: 'PUT', body });
          logOk(`Updated page: "${page.slug}" (prod ID: ${prodId}) [${page.status}]`);
          stats.updated++;
        } catch (err) {
          logErr(`Failed to update page "${page.slug}": ${err.message}`);
          stats.failed++;
        }
        continue;
      }

      logInfo(`Page "${page.slug}" already exists in prod (ID: ${prodId})`);
      stats.skipped++;
      continue;
    }

    if (DRY_RUN) {
      logWarn(`[DRY-RUN] Would create page: ${page.slug} [${page.status}]`);
      continue;
    }

    try {
      const body = {
        title: page.title.rendered,
        slug: page.slug,
        content: page.content.rendered,
        excerpt: page.excerpt?.rendered || '',
        status: page.status,
        parent: page.parent ? (slugMap.pages[page.parent] || 0) : 0,
      };

      // Copy meta fields if available
      if (page.meta && Object.keys(page.meta).length > 0) {
        body.meta = page.meta;
      }

      const { data } = await apiFetch(PROD, '/pages', { method: 'POST', body });
      slugMap.pages[page.id] = data.id;
      logOk(`Created page: ${data.slug} (prod ID: ${data.id}) [${data.status}]`);
      stats.created++;
    } catch (err) {
      logErr(`Failed to create page "${page.slug}": ${err.message}`);
      stats.failed++;
    }
  }
}

async function migratePosts() {
  logStep(3, 'Migrating Posts');

  const localPosts = await fetchAll(LOCAL, '/posts');
  const prodPosts = await fetchAll(PROD, '/posts');
  const prodSlugs = new Map(prodPosts.map(p => [p.slug, p.id]));

  log(`\n  Local: ${localPosts.length} posts | Prod: ${prodPosts.length} posts`, c.gray);

  for (const post of localPosts) {
    // Skip empty slug drafts
    if (!post.slug) {
      logInfo(`Skipping post ID:${post.id} (no slug)`);
      stats.skipped++;
      continue;
    }

    if (prodSlugs.has(post.slug)) {
      const prodId = prodSlugs.get(post.slug);
      slugMap.posts[post.id] = prodId;

      if (UPDATE) {
        // Overwrite existing post in prod
        const prodCategories = (post.categories || [])
          .map(localId => slugMap.categories[localId])
          .filter(Boolean);

        if (DRY_RUN) {
          logWarn(`[DRY-RUN] Would update post: "${post.slug}" (prod ID: ${prodId}) [${post.status}]`);
          stats.updated++;
          continue;
        }

        try {
          const body = {
            title: post.title.rendered,
            content: post.content.rendered,
            excerpt: post.excerpt?.rendered || '',
            status: post.status,
            categories: prodCategories.length > 0 ? prodCategories : undefined,
          };

          if (post.meta && Object.keys(post.meta).length > 0) {
            body.meta = post.meta;
          }

          await apiFetch(PROD, `/posts/${prodId}`, { method: 'PUT', body });
          logOk(`Updated post: "${post.slug}" (prod ID: ${prodId}) [${post.status}]`);
          stats.updated++;
        } catch (err) {
          logErr(`Failed to update post "${post.slug}": ${err.message}`);
          stats.failed++;
        }
        continue;
      }

      logInfo(`Post "${post.slug}" already exists in prod (ID: ${prodId})`);
      stats.skipped++;
      continue;
    }

    if (DRY_RUN) {
      logWarn(`[DRY-RUN] Would create post: ${post.slug} [${post.status}]`);
      continue;
    }

    try {
      // Map local category IDs to prod category IDs
      const prodCategories = (post.categories || [])
        .map(localId => slugMap.categories[localId])
        .filter(Boolean);

      const body = {
        title: post.title.rendered,
        slug: post.slug,
        content: post.content.rendered,
        excerpt: post.excerpt?.rendered || '',
        status: post.status,
        categories: prodCategories.length > 0 ? prodCategories : undefined,
      };

      // Copy meta fields if available
      if (post.meta && Object.keys(post.meta).length > 0) {
        body.meta = post.meta;
      }

      // Copy featured image reference (yoast SEO etc.)
      if (post.featured_media && post.featured_media > 0) {
        logInfo(`  Post "${post.slug}" has featured_media ID:${post.featured_media} (media migration pending)`);
      }

      const { data } = await apiFetch(PROD, '/posts', { method: 'POST', body });
      slugMap.posts[post.id] = data.id;
      logOk(`Created post: ${data.slug} (prod ID: ${data.id}) [${data.status}]`);
      stats.created++;
    } catch (err) {
      logErr(`Failed to create post "${post.slug}": ${err.message}`);
      stats.failed++;
    }
  }
}

// --- Main ---

async function main() {
  log('\n🔄 WordPress Local → Production Migration', c.bold);
  log('═'.repeat(50), c.cyan);

  if (DRY_RUN) {
    log('\n  🧪 DRY RUN MODE — No changes will be made\n', c.yellow);
  }

  if (UPDATE) {
    log('  ✏️  UPDATE MODE — Existing pages & posts will be overwritten\n', c.yellow);
  }

  // Validate credentials
  log('\n  Checking connections...', c.gray);

  try {
    const { data: localUser } = await apiFetch(LOCAL, '/users/me?_fields=id,name');
    logOk(`Local: Connected as "${localUser.name}"`);
  } catch (err) {
    logErr(`Local connection failed: ${err.message}`);
    process.exit(1);
  }

  try {
    const { data: prodUser } = await apiFetch(PROD, '/users/me?_fields=id,name');
    logOk(`Prod:  Connected as "${prodUser.name}"`);
  } catch (err) {
    logErr(`Prod connection failed: ${err.message}`);
    process.exit(1);
  }

  // Run migrations
  const steps = {
    categories: migrateCategories,
    pages: migratePages,
    posts: migratePosts,
  };

  if (ONLY && steps[ONLY]) {
    await steps[ONLY]();
  } else if (ONLY) {
    logErr(`Unknown --only value: "${ONLY}". Use: categories, pages, posts`);
    process.exit(1);
  } else {
    for (const fn of Object.values(steps)) {
      await fn();
    }
  }

  // Summary
  log('\n' + '═'.repeat(50), c.cyan);
  log('  📊 Migration Summary', c.bold);
  log('═'.repeat(50), c.cyan);
  logOk(`Created: ${stats.created}`);
  if (stats.updated > 0) logOk(`Updated: ${stats.updated}`);
  logInfo(`Skipped: ${stats.skipped} (already exist)`);
  if (stats.failed > 0) logErr(`Failed: ${stats.failed}`);
  log('');
}

main().catch(err => {
  logErr(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
