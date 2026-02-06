#!/usr/bin/env node

const axios = require('axios');
const https = require('https');
require('dotenv').config();

const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  }),
  timeout: 30000
});

const config = {
  wpBaseUrl: process.env.WP_BASE_URL || 'http://localhost:8080',
  username: process.env.WP_USERNAME || 'admin',
  applicationPassword: process.env.WP_APPLICATION_PASSWORD
};

async function checkAllContent() {
  const auth = Buffer.from(`${config.username}:${config.applicationPassword}`).toString('base64');
  
  console.log('🔍 Checking all WordPress content...\n');
  
  // Check pages
  try {
    const pagesResponse = await axiosInstance.get(
      `${config.wpBaseUrl}/wp-json/wp/v2/pages?status=any&per_page=50`,
      {
        headers: { 'Authorization': `Basic ${auth}` }
      }
    );
    
    console.log(`📄 Pages found: ${pagesResponse.data.length}`);
    if (pagesResponse.data.length > 0) {
      pagesResponse.data.forEach(page => {
        console.log(`  - ${page.title?.rendered} (${page.slug}) - Status: ${page.status}`);
      });
    }
  } catch (error) {
    console.error('❌ Pages error:', error.response?.data || error.message);
  }
  
  console.log('');
  
  // Check posts  
  try {
    const postsResponse = await axiosInstance.get(
      `${config.wpBaseUrl}/wp-json/wp/v2/posts?status=any&per_page=50`,
      {
        headers: { 'Authorization': `Basic ${auth}` }
      }
    );
    
    console.log(`📝 Posts found: ${postsResponse.data.length}`);
    if (postsResponse.data.length > 0) {
      postsResponse.data.forEach(post => {
        console.log(`  - ${post.title?.rendered} (${post.slug}) - Status: ${post.status}`);
      });
    }
  } catch (error) {
    console.error('❌ Posts error:', error.response?.data || error.message);
  }
  
  console.log('');
  
  // Check media
  try {
    const mediaResponse = await axiosInstance.get(
      `${config.wpBaseUrl}/wp-json/wp/v2/media?per_page=50`,
      {
        headers: { 'Authorization': `Basic ${auth}` }
      }
    );
    
    console.log(`📸 Media found: ${mediaResponse.data.length}`);
    if (mediaResponse.data.length > 0) {
      mediaResponse.data.forEach(media => {
        console.log(`  - ${media.title?.rendered} (ID: ${media.id})`);
      });
    }
  } catch (error) {
    console.error('❌ Media error:', error.response?.data || error.message);
  }
  
  // Test direct page access
  console.log('\n🔍 Testing direct page access...');
  try {
    const directResponse = await axiosInstance.get(
      `${config.wpBaseUrl}/wp-json/wp/v2/pages/71`,
      {
        headers: { 'Authorization': `Basic ${auth}` }
      }
    );
    
    console.log(`✅ Direct page access successful:`);
    console.log(`   Title: ${directResponse.data.title?.rendered}`);
    console.log(`   Slug: ${directResponse.data.slug}`);
    console.log(`   Status: ${directResponse.data.status}`);
    
  } catch (error) {
    console.error('❌ Direct page access failed:', error.response?.status, error.response?.data || error.message);
  }
}

checkAllContent();
