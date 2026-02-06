#!/usr/bin/env node

/**
 * Diagnostic script to check WordPress posts vs pages
 */

const axios = require('axios');
require('dotenv').config();

const config = {
  wpBaseUrl: process.env.WP_BASE_URL,
  username: process.env.WP_USERNAME,
  applicationPassword: process.env.WP_APPLICATION_PASSWORD
};

async function main() {
  console.log('🔍 Checking WordPress content types...\n');
  
  const auth = Buffer.from(`${config.username}:${config.applicationPassword}`).toString('base64');
  const headers = { 'Authorization': `Basic ${auth}` };

  try {
    // Check posts
    console.log('=== CHECKING POSTS ===');
    const postsResponse = await axios.get(`${config.wpBaseUrl}/wp-json/wp/v2/posts?per_page=10`, { headers });
    console.log(`Total posts found: ${postsResponse.data.length}`);
    
    if (postsResponse.data.length > 0) {
      console.log('Recent posts:');
      postsResponse.data.slice(0, 3).forEach(post => {
        console.log(`  - ${post.title.rendered} (ID: ${post.id}, slug: ${post.slug})`);
      });
    }

    // Check pages  
    console.log('\n=== CHECKING PAGES ===');
    const pagesResponse = await axios.get(`${config.wpBaseUrl}/wp-json/wp/v2/pages?per_page=10`, { headers });
    console.log(`Total pages found: ${pagesResponse.data.length}`);
    
    if (pagesResponse.data.length > 0) {
      console.log('Recent pages:');
      pagesResponse.data.slice(0, 3).forEach(page => {
        console.log(`  - ${page.title.rendered} (ID: ${page.id}, slug: ${page.slug})`);
      });
    }

    // Check specific post ID 172
    console.log('\n=== CHECKING SPECIFIC POST ID 172 ===');
    try {
      const specificPost = await axios.get(`${config.wpBaseUrl}/wp-json/wp/v2/posts/172`, { headers });
      console.log('✅ Post 172 found:');
      console.log(`   Title: ${specificPost.data.title.rendered}`);
      console.log(`   Slug: ${specificPost.data.slug}`);
      console.log(`   Status: ${specificPost.data.status}`);
    } catch (err) {
      console.log('❌ Post 172 not found in posts');
      
      // Maybe it was created as a page instead?
      try {
        const specificPage = await axios.get(`${config.wpBaseUrl}/wp-json/wp/v2/pages/172`, { headers });
        console.log('⚠️  Found ID 172 as a PAGE instead:');
        console.log(`   Title: ${specificPage.data.title.rendered}`);
        console.log(`   Slug: ${specificPage.data.slug}`);
      } catch (pageErr) {
        console.log('❌ ID 172 not found as page either');
      }
    }

    // Check media
    console.log('\n=== CHECKING MEDIA ===');
    const mediaResponse = await axios.get(`${config.wpBaseUrl}/wp-json/wp/v2/media?per_page=5`, { headers });
    console.log(`Total media items: ${mediaResponse.data.length}`);
    
    if (mediaResponse.data.length > 0) {
      console.log('Recent media:');
      mediaResponse.data.slice(0, 3).forEach(media => {
        console.log(`  - ${media.title.rendered} (ID: ${media.id})`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

main();
