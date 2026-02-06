#!/usr/bin/env node

/**
 * WordPress Image Diagnostic Script
 * 
 * This script checks for image issues and provides detailed debugging information
 */

const fs = require('fs');
const axios = require('axios');
const https = require('https');
require('dotenv').config();

// Create axios instance with SSL handling
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  }),
  timeout: 30000
});

const config = {
  wpBaseUrl: process.env.WP_BASE_URL || 'http://localhost:8080',
  username: process.env.WP_USERNAME || 'admin',
  applicationPassword: process.env.WP_APPLICATION_PASSWORD,
  contentfulSpaceId: process.env.CONTENTFUL_SPACE_ID,
  contentfulAccessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
  contentfulEnvironment: process.env.CONTENTFUL_ENVIRONMENT_ID || 'master'
};

async function checkWordPressMedia() {
  console.log('🔍 Checking WordPress Media Library...\n');
  
  try {
    const auth = Buffer.from(`${config.username}:${config.applicationPassword}`).toString('base64');
    
    const mediaResponse = await axiosInstance.get(
      `${config.wpBaseUrl}/wp-json/wp/v2/media?per_page=20&orderby=date&order=desc`,
      {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      }
    );
    
    console.log(`📊 Found ${mediaResponse.data.length} media items in WordPress:`);
    
    mediaResponse.data.forEach((item, index) => {
      console.log(`${index + 1}. ${item.title?.rendered || 'Untitled'}`);
      console.log(`   ID: ${item.id}`);
      console.log(`   URL: ${item.source_url}`);
      console.log(`   Type: ${item.mime_type}`);
      console.log(`   Date: ${new Date(item.date).toLocaleString()}`);
      console.log('');
    });
    
    return mediaResponse.data;
    
  } catch (error) {
    console.error('❌ Failed to fetch WordPress media:', error.response?.data || error.message);
    return [];
  }
}

async function checkAboutPageContent() {
  console.log('🔍 Checking About Page Content...\n');
  
  try {
    const auth = Buffer.from(`${config.username}:${config.applicationPassword}`).toString('base64');
    
    // Get the about-us page
    const pageResponse = await axiosInstance.get(
      `${config.wpBaseUrl}/wp-json/wp/v2/pages?slug=about-us`,
      {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      }
    );
    
    if (pageResponse.data.length > 0) {
      const page = pageResponse.data[0];
      console.log(`📄 About Page Details:`);
      console.log(`   ID: ${page.id}`);
      console.log(`   Title: ${page.title?.rendered}`);
      console.log(`   Status: ${page.status}`);
      console.log('');
      
      console.log(`📝 Content Preview (first 500 chars):`);
      console.log(page.content?.rendered?.substring(0, 500) + '...');
      console.log('');
      
      // Check if content contains image blocks
      if (page.content?.rendered?.includes('wp-block-image')) {
        console.log('✅ Found image blocks in content');
      } else {
        console.log('⚠️  No image blocks found in content');
      }
      
      // Check for any image tags
      if (page.content?.rendered?.includes('<img')) {
        console.log('✅ Found img tags in content');
        
        // Extract image URLs
        const imgMatches = page.content.rendered.match(/<img[^>]+src="([^"]+)"/g);
        if (imgMatches) {
          console.log(`📸 Found ${imgMatches.length} images:`);
          imgMatches.forEach((match, index) => {
            const srcMatch = match.match(/src="([^"]+)"/);
            if (srcMatch) {
              console.log(`   ${index + 1}. ${srcMatch[1]}`);
            }
          });
        }
      } else {
        console.log('⚠️  No img tags found in content');
      }
      
      return page;
    } else {
      console.log('❌ About page not found');
      return null;
    }
    
  } catch (error) {
    console.error('❌ Failed to fetch About page:', error.response?.data || error.message);
    return null;
  }
}

async function checkContentfulAssets() {
  console.log('🔍 Checking Contentful Assets...\n');
  
  // Read the exported corporate pages data
  const corporatePages = JSON.parse(
    fs.readFileSync('../out/corporate_pages.json', 'utf8')
  );
  
  const aboutPage = corporatePages.find(page => page.slug === 'about-us');
  
  if (!aboutPage) {
    console.log('❌ About page not found in export data');
    return [];
  }
  
  console.log('📊 About Page Data:');
  console.log(`   Title: ${aboutPage.title}`);
  console.log(`   ID: ${aboutPage.id}`);
  console.log(`   Hero Content: ${aboutPage.heroContent ? 'Yes' : 'No'}`);
  console.log(`   Body Content: ${aboutPage.body ? 'Yes' : 'No'}`);
  console.log('');
  
  // Extract asset IDs
  const assetIds = [];
  
  function extractAssets(content, contentName) {
    if (!content || !content.content) return;
    
    function traverse(nodes) {
      for (const node of nodes) {
        if (node.nodeType === 'embedded-asset-block') {
          const assetId = node.data?.target?.sys?.id;
          if (assetId && !assetIds.includes(assetId)) {
            assetIds.push(assetId);
            console.log(`📸 Found asset in ${contentName}: ${assetId}`);
          }
        }
        if (node.content) {
          traverse(node.content);
        }
      }
    }
    
    traverse(content.content);
  }
  
  if (aboutPage.heroContent) {
    extractAssets(aboutPage.heroContent, 'hero');
  }
  
  if (aboutPage.body) {
    extractAssets(aboutPage.body, 'body');
  }
  
  console.log(`\n📊 Found ${assetIds.length} assets total`);
  
  // Try to fetch asset details from Contentful
  if (assetIds.length > 0 && config.contentfulSpaceId && config.contentfulAccessToken) {
    console.log('\n🔍 Fetching asset details from Contentful...');
    
    for (const assetId of assetIds) {
      try {
        const response = await axiosInstance.get(
          `https://api.contentful.com/spaces/${config.contentfulSpaceId}/environments/${config.contentfulEnvironment}/assets/${assetId}?locale=*`,
          {
            headers: {
              'Authorization': `Bearer ${config.contentfulAccessToken}`
            }
          }
        );
        
        const asset = response.data;
        
        // Handle localized fields properly
        const getLocalizedValue = (field) => {
          if (!field) return '';
          if (typeof field === 'string') return field;
          if (typeof field === 'object') {
            return field['en-US'] || field['en'] || field[Object.keys(field)[0]] || '';
          }
          return '';
        };

        const fileField = asset.fields?.file;
        let fileName = '';
        let fileUrl = '';
        let contentType = '';

        if (fileField) {
          const fileData = typeof fileField === 'object' ? 
            (fileField['en-US'] || fileField['en'] || fileField[Object.keys(fileField)[0]]) : 
            fileField;
          
          if (fileData) {
            fileName = fileData.fileName || '';
            fileUrl = fileData.url || '';
            contentType = fileData.contentType || '';
          }
        }

        const title = getLocalizedValue(asset.fields?.title) || fileName || 'Untitled';
        
        console.log(`📸 Asset ${assetId}:`);
        console.log(`   Title: ${title}`);
        console.log(`   File: ${fileName}`);
        console.log(`   URL: ${fileUrl}`);
        console.log(`   Type: ${contentType}`);
        console.log('');
        
      } catch (error) {
        console.error(`❌ Failed to fetch asset ${assetId}:`, error.message);
      }
    }
  }
  
  return assetIds;
}

async function main() {
  console.log('🔧 WordPress Image Diagnostic Tool\n');
  console.log('🌐 WordPress URL:', config.wpBaseUrl);
  console.log('👤 Username:', config.username);
  console.log('📦 Contentful Space:', config.contentfulSpaceId);
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Check WordPress media library
  const mediaItems = await checkWordPressMedia();
  
  console.log('='.repeat(50) + '\n');
  
  // Check About page content
  const aboutPage = await checkAboutPageContent();
  
  console.log('='.repeat(50) + '\n');
  
  // Check Contentful assets
  const assetIds = await checkContentfulAssets();
  
  console.log('='.repeat(50) + '\n');
  
  // Summary and recommendations
  console.log('📋 Diagnostic Summary:');
  console.log(`   WordPress Media Items: ${mediaItems.length}`);
  console.log(`   Contentful Asset IDs Found: ${assetIds.length}`);
  console.log(`   About Page Found: ${aboutPage ? 'Yes' : 'No'}`);
  
  if (aboutPage && !aboutPage.content?.rendered?.includes('<img')) {
    console.log('\n💡 Recommendations:');
    console.log('   - Images may not be processing correctly during import');
    console.log('   - Check if Contentful credentials are configured');
    console.log('   - Try running import again with test mode');
    console.log('   - Verify images exist in WordPress admin: /wp-admin/upload.php');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { checkWordPressMedia, checkAboutPageContent, checkContentfulAssets };
