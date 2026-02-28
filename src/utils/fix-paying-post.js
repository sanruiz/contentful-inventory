#!/usr/bin/env node

/**
 * Fix WordPress post #216 (paying-for-alzheimers-care)
 * 
 * Replaces old placeholder HTML blocks with [contentful_table] shortcodes
 * so the plugin can render the actual table data.
 */

import fetch from 'node-fetch';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });
const auth = Buffer.from('sanruiz:dUdknRLYVTTWbjzombXKV4g9').toString('base64');
const BASE_URL = 'https://memorycare.local';

async function main() {
  console.log('🔧 Fixing post #216: paying-for-alzheimers-care\n');

  // Step 1: Fetch raw content
  console.log('📥 Fetching post content...');
  const res = await fetch(`${BASE_URL}/wp-json/wp/v2/posts/216?context=edit`, {
    headers: { 'Authorization': `Basic ${auth}` },
    agent,
  });

  if (!res.ok) {
    console.error(`❌ Failed to fetch post: ${res.status}`);
    const err = await res.text();
    console.error(err.substring(0, 300));
    return;
  }

  const post = await res.json();
  let content = post.content.raw;
  console.log(`   Content length: ${content.length} chars`);

  // Step 2: Find and replace placeholder blocks
  // City Table placeholder → shortcode
  const cityRegex = /<div class="wp-block-group data-visualization-table">\s*<h4>Paying for Alzheimers Care City Table[\s\S]*?<\/style>\s*<\/div>/;
  // States Table placeholder → shortcode
  const statesRegex = /<div class="wp-block-group data-visualization-table">\s*<h4>Paying for Alzheimers Care States Table[\s\S]*?<\/style>\s*<\/div>/;

  const cityMatch = content.match(cityRegex);
  const statesMatch = content.match(statesRegex);

  console.log(`\n🔍 City table placeholder: ${cityMatch ? '✅ found (' + cityMatch[0].length + ' chars)' : '❌ not found'}`);
  console.log(`🔍 States table placeholder: ${statesMatch ? '✅ found (' + statesMatch[0].length + ' chars)' : '❌ not found'}`);

  let replacements = 0;

  if (cityMatch) {
    content = content.replace(cityRegex, '\n[contentful_table id="01mbN3oaSpbxpD1zKOlZgr"]\n');
    replacements++;
    console.log(`   ✅ Replaced City table → [contentful_table id="01mbN3oaSpbxpD1zKOlZgr"]`);
  }

  if (statesMatch) {
    content = content.replace(statesRegex, '\n[contentful_table id="4v29NkFMlamIzXFFzGob9G"]\n');
    replacements++;
    console.log(`   ✅ Replaced States table → [contentful_table id="4v29NkFMlamIzXFFzGob9G"]`);
  }

  if (replacements === 0) {
    console.log('\n⚠️  No placeholder blocks found to replace.');
    return;
  }

  console.log(`\n   New content length: ${content.length} chars`);

  // Step 3: Update the post
  console.log('\n📤 Updating post...');
  const updateRes = await fetch(`${BASE_URL}/wp-json/wp/v2/posts/216`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify({ content }),
    agent,
  });

  if (updateRes.ok) {
    const updated = await updateRes.json();
    console.log(`   ✅ Post updated! ID: ${updated.id}`);
    console.log(`   🔗 ${updated.link}`);
  } else {
    const err = await updateRes.text();
    console.error(`   ❌ Update failed: ${updateRes.status}`);
    console.error(err.substring(0, 300));
  }

  console.log('\n✨ Done! The tables should now render via the contentful-tables plugin.');
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
