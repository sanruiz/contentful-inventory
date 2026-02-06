#!/usr/bin/env node

/**
 * Check WordPress Pages
 */

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

async function checkPages() {
  try {
    const auth = Buffer.from(`${config.username}:${config.applicationPassword}`).toString('base64');
    
    const response = await axiosInstance.get(
      `${config.wpBaseUrl}/wp-json/wp/v2/pages?per_page=20&orderby=date&order=desc`,
      {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      }
    );
    
    console.log(`📄 Found ${response.data.length} pages in WordPress:`);
    
    response.data.forEach((page, index) => {
      console.log(`${index + 1}. ${page.title?.rendered || 'Untitled'}`);
      console.log(`   ID: ${page.id}`);
      console.log(`   Slug: ${page.slug}`);
      console.log(`   Status: ${page.status}`);
      console.log(`   Date: ${new Date(page.date).toLocaleString()}`);
      
      // Check if this page has images
      if (page.content?.rendered?.includes('<img')) {
        const imgCount = (page.content.rendered.match(/<img/g) || []).length;
        console.log(`   Images: ${imgCount}`);
      } else {
        console.log(`   Images: 0`);
      }
      
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Failed to fetch pages:', error.response?.data || error.message);
  }
}

checkPages();
