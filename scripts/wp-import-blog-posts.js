#!/usr/bin/env node

/**
 * WordPress Blog Posts Import Script for Contentful
 * 
 * This script imports the exported blog posts from Contentful into WordPress
 * using the WordPress REST API with enhanced component handling.
 * 
 * Based on the enhanced wp-import.js script but adapted for blog posts.
 */

const fs = require('fs');
const { importPage } = require('./wp-import.js');
require('dotenv').config();

// Configuration
const config = {
  wpBaseUrl: process.env.WP_BASE_URL || 'http://memorycare.local',
  username: process.env.WP_USERNAME || 'admin',
  applicationPassword: process.env.WP_APPLICATION_PASSWORD,
  
  // Import settings for blog posts
  postStatus: process.env.WP_POST_STATUS || 'draft',
  postType: 'post', // Change to 'post' for blog posts instead of 'page'
  defaultAuthor: parseInt(process.env.WP_DEFAULT_AUTHOR) || 1,
  
  // Test mode - import only one blog post for testing
  testMode: process.env.TEST_MODE === 'true',
  testPageSlug: process.env.TEST_PAGE_SLUG || 'veterans'
};

async function main() {
  try {
    // Validate configuration
    if (!config.applicationPassword) {
      console.error('❌ Missing WP_APPLICATION_PASSWORD in environment variables');
      process.exit(1);
    }

    console.log(`🔧 Configuration:`);
    console.log(`   WordPress URL: ${config.wpBaseUrl}`);
    console.log(`   Username: ${config.username}`);
    console.log(`   Post Type: ${config.postType}`);
    console.log(`   Post Status: ${config.postStatus}`);
    console.log(`   Test Mode: ${config.testMode ? 'ON' : 'OFF'}`);
    if (config.testMode) {
      console.log(`   Test Post: ${config.testPageSlug}`);
    }
    console.log('');

    // Read the exported blog posts data
    if (!fs.existsSync('../out/blog_posts.json')) {
      console.error('❌ Blog posts data not found. Run export-blog-posts.js first.');
      process.exit(1);
    }

    const blogPosts = JSON.parse(
      fs.readFileSync('../out/blog_posts.json', 'utf8')
    );
    
    // Filter posts for test mode
    const postsToImport = config.testMode 
      ? blogPosts.filter(post => post.slug === config.testPageSlug)
      : blogPosts;
    
    console.log(`🚀 Starting import of ${postsToImport.length} blog posts to WordPress...\n`);
    
    const results = [];
    
    // Import each blog post
    for (const post of postsToImport) {
      if (post.found && post.id) {
        console.log(`📝 Importing: ${post.title} (${post.slug})`);
        
        try {
          // Transform the blog post data to match the import format
          const pageData = {
            id: post.id,
            slug: post.slug,
            title: post.title,
            description: post.description || '',
            heroContent: post.heroContent,
            body: post.body,
            // Blog post specific fields
            publishedDate: post.publishedDate,
            author: post.author,
            // Add category and tags if available
            category: 'blog', // Default category
            tags: [], // Could be extracted from Contentful if available
          };
          
          const result = await importPage(pageData);
          results.push({ success: true, post: post.slug, wpId: result.id });
          
          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`❌ Failed to import ${post.title}:`, error.message);
          results.push({ success: false, post: post.slug, error: error.message });
        }
      } else {
        console.log(`⚠️  Skipping ${post.slug} - not found in Contentful`);
        results.push({ success: false, post: post.slug, error: 'Not found in Contentful' });
      }
    }
    
    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n📊 Import Summary:`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (failed > 0) {
      console.log(`\n🔍 Failed imports:`);
      results.filter(r => !r.success).forEach(r => {
        console.log(`   - ${r.post}: ${r.error}`);
      });
    }
    
    // Save import log
    fs.writeFileSync(
      '../out/wp-blog-import-log.json',
      JSON.stringify(results, null, 2)
    );
    
    console.log(`\n📝 Import log saved to: out/wp-blog-import-log.json`);
    
  } catch (error) {
    console.error('💥 Blog import failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
