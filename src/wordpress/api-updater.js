import 'dotenv/config';
import pkg from 'contentful-management';
const { createClient } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import https from 'https';

// For local development - ignore SSL certificate issues
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WordPressAutoTableUpdater {
  
  constructor() {
    this.tablesDir = path.join(__dirname, 'out', 'tables');
    this.wpUrl = process.env.WP_BASE_URL || 'http://memorycare.local';
    this.wpUser = process.env.WP_USERNAME || 'sanruiz';
    this.wpPassword = process.env.WP_APPLICATION_PASSWORD;
    
    if (!this.wpPassword) {
      throw new Error('WP_APPLICATION_PASSWORD not found in .env file');
    }
    
    console.log(`🔧 WordPress Configuration:`);
    console.log(`   URL: ${this.wpUrl}`);
    console.log(`   Username: ${this.wpUser}`);
    console.log(`   Password: ${'*'.repeat(this.wpPassword.length)}`);
  }

  /**
   * Get WordPress post by slug
   */
  async getWordPressPost(slug) {
    try {
      const response = await fetch(`${this.wpUrl}/wp-json/wp/v2/posts?slug=${slug}`, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${this.wpUser}:${this.wpPassword}`).toString('base64'),
          'Content-Type': 'application/json'
        },
        agent: this.wpUrl.startsWith('https:') ? httpsAgent : undefined
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const posts = await response.json();
      return posts.length > 0 ? posts[0] : null;
    } catch (error) {
      console.error(`❌ Error fetching post ${slug}:`, error.message);
      return null;
    }
  }

  /**
   * Update WordPress post content
   */
  async updateWordPressPost(postId, newContent) {
    try {
      const response = await fetch(`${this.wpUrl}/wp-json/wp/v2/posts/${postId}`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${this.wpUser}:${this.wpPassword}`).toString('base64'),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: newContent
        }),
        agent: this.wpUrl.startsWith('https:') ? httpsAgent : undefined
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`❌ Error updating post ${postId}:`, error.message);
      return null;
    }
  }

  /**
   * Get all WordPress posts to see what's available
   */
  async getAllWordPressPosts() {
    try {
      const response = await fetch(`${this.wpUrl}/wp-json/wp/v2/posts?per_page=100`, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${this.wpUser}:${this.wpPassword}`).toString('base64'),
          'Content-Type': 'application/json'
        },
        agent: this.wpUrl.startsWith('https:') ? httpsAgent : undefined
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const posts = await response.json();
      return posts;
    } catch (error) {
      console.error(`❌ Error fetching all posts:`, error.message);
      return [];
    }
  }

  /**
   * Check if table shortcode already exists in content
   */
  hasTableShortcode(content, tableId) {
    return content.includes(`[contentful-table id="${tableId}"]`) || 
           content.includes(`contentful-table-${tableId}`) ||
           content.includes(`<!-- Table: ${tableId} -->`);
  }

  /**
   * Insert table into post content
   */
  insertTableIntoPost(currentContent, tableHTML, tableId, insertMethod = 'shortcode') {
    // Check if table already exists
    if (this.hasTableShortcode(currentContent, tableId)) {
      console.log(`   ⚠️  Table ${tableId} already exists in post, skipping...`);
      return currentContent;
    }

    if (insertMethod === 'shortcode') {
      // Add shortcode at the end of content
      const shortcode = `\n\n[contentful-table id="${tableId}"]`;
      return currentContent + shortcode;
    } else {
      // Add HTML directly
      const htmlWithComment = `\n\n<!-- Table: ${tableId} -->\n${tableHTML}`;
      return currentContent + htmlWithComment;
    }
  }

  /**
   * Process all tables and update WordPress posts
   */
  async processAllTables(insertMethod = 'shortcode', dryRun = false) {
    console.log(`\n🚀 Starting WordPress table integration...`);
    console.log(`   Method: ${insertMethod}`);
    console.log(`   Dry Run: ${dryRun ? 'YES (no actual updates)' : 'NO (will update posts)'}\n`);

    // Read the table mapping
    const csvPath = path.join(__dirname, 'out', 'tables-detailed-export.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n').slice(1);

    const results = [];
    const processedPosts = new Map(); // Track posts to avoid duplicates

    for (const line of lines) {
      if (!line.trim()) continue;
      
      const [title, slug, postId, tableId, tableType] = line.split(',').map(field => 
        field.replace(/^"|"$/g, '').trim()
      );

      if (tableId === 'NO_TABLES') continue;

      console.log(`📝 Processing: ${title.substring(0, 50)}...`);
      console.log(`   Slug: ${slug}`);
      console.log(`   Table ID: ${tableId}`);

      // Check if we have the table file
      const tableHTMLPath = path.join(this.tablesDir, `${tableId}.html`);
      if (!fs.existsSync(tableHTMLPath)) {
        console.log(`   ❌ Table file not found: ${tableId}`);
        results.push({ slug, tableId, success: false, reason: 'Table file not found' });
        continue;
      }

      // Get WordPress post
      const wpPost = await this.getWordPressPost(slug);
      if (!wpPost) {
        console.log(`   ❌ WordPress post not found: ${slug}`);
        results.push({ slug, tableId, success: false, reason: 'WordPress post not found' });
        continue;
      }

      console.log(`   ✅ Found WordPress post ID: ${wpPost.id}`);

      // Get current content (check if we already processed this post)
      let currentContent;
      if (processedPosts.has(slug)) {
        currentContent = processedPosts.get(slug);
        console.log(`   🔄 Using updated content from previous table...`);
      } else {
        currentContent = wpPost.content.raw || wpPost.content.rendered || '';
        console.log(`   📄 Current content length: ${currentContent.length} characters`);
      }

      // Prepare table content
      let tableContent;
      if (insertMethod === 'shortcode') {
        tableContent = `[contentful-table id="${tableId}"]`;
      } else {
        tableContent = fs.readFileSync(tableHTMLPath, 'utf8');
      }

      // Insert table into content
      const updatedContent = this.insertTableIntoPost(currentContent, tableContent, tableId, insertMethod);
      
      if (updatedContent === currentContent) {
        console.log(`   ⚠️  No changes made (table already exists)`);
        results.push({ slug, tableId, success: true, reason: 'Already exists' });
        continue;
      }

      // Store updated content for this post
      processedPosts.set(slug, updatedContent);

      if (dryRun) {
        console.log(`   ✅ DRY RUN: Would add table ${tableId}`);
        results.push({ slug, tableId, success: true, reason: 'Dry run - would update' });
      } else {
        // Update WordPress post
        console.log(`   🔄 Updating WordPress post...`);
        const updateResult = await this.updateWordPressPost(wpPost.id, updatedContent);
        
        if (updateResult) {
          console.log(`   ✅ Successfully updated post!`);
          results.push({ slug, tableId, success: true, reason: 'Updated successfully' });
        } else {
          console.log(`   ❌ Failed to update post`);
          results.push({ slug, tableId, success: false, reason: 'WordPress update failed' });
        }
      }

      console.log(''); // Empty line for readability
    }

    // Now update all posts that had changes
    if (!dryRun && processedPosts.size > 0) {
      console.log(`\n🔄 Updating ${processedPosts.size} posts with final content...`);
      
      for (const [slug, finalContent] of processedPosts) {
        const wpPost = await this.getWordPressPost(slug);
        if (wpPost && wpPost.content.raw !== finalContent) {
          console.log(`📝 Final update for: ${slug}`);
          const updateResult = await this.updateWordPressPost(wpPost.id, finalContent);
          if (updateResult) {
            console.log(`   ✅ Final update successful`);
          } else {
            console.log(`   ❌ Final update failed`);
          }
        }
      }
    }

    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const alreadyExists = results.filter(r => r.reason === 'Already exists').length;

    console.log(`\n📊 Integration Summary:`);
    console.log(`   Total tables processed: ${results.length}`);
    console.log(`   Successful: ${successful}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Already existed: ${alreadyExists}`);
    console.log(`   Posts updated: ${processedPosts.size}`);

    // Save results
    const resultsPath = path.join(__dirname, 'out', 'wordpress-update-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      method: insertMethod,
      dryRun,
      results,
      summary: { total: results.length, successful, failed, alreadyExists, postsUpdated: processedPosts.size }
    }, null, 2));

    console.log(`\n📄 Results saved to: ${resultsPath}`);
    
    return results;
  }

  /**
   * Test WordPress connection
   */
  async testConnection() {
    console.log('🔍 Testing WordPress connection...');
    
    try {
      // Test both posts and pages endpoints
      const postsResponse = await fetch(`${this.wpUrl}/wp-json/wp/v2/posts?per_page=1`, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${this.wpUser}:${this.wpPassword}`).toString('base64'),
          'Content-Type': 'application/json'
        },
        agent: this.wpUrl.startsWith('https:') ? httpsAgent : undefined
      });

      if (!postsResponse.ok) {
        throw new Error(`HTTP ${postsResponse.status}: ${postsResponse.statusText}`);
      }

      const posts = await postsResponse.json();
      console.log(`✅ WordPress connection successful!`);
      console.log(`   Found ${Array.isArray(posts) ? posts.length : 0} posts in first page`);
      
      if (posts.length > 0) {
        console.log(`   Sample post: "${posts[0].title.rendered}" (ID: ${posts[0].id}, Slug: ${posts[0].slug})`);
      }
      
      return true;
    } catch (error) {
      console.error(`❌ WordPress connection failed:`, error.message);
      return false;
    }
  }

  /**
   * Setup WordPress plugin files
   */
  async setupWordPressPlugin() {
    console.log('🔧 Setting up WordPress plugin integration...');
    
    // Check if WordPress is accessible for file operations
    const possiblePaths = [
      `/Users/${process.env.USER}/Local Sites/memorycare/app/public/wp-content/themes`,
      `/Users/${process.env.USER}/Sites/memorycare.local/wp-content/themes`,
      `/var/www/html/wp-content/themes`,
      `./wordpress/wp-content/themes`
    ];

    let wpThemePath = null;
    for (const basePath of possiblePaths) {
      if (fs.existsSync(basePath)) {
        // Look for active theme
        const themes = fs.readdirSync(basePath);
        for (const theme of themes) {
          const themePath = path.join(basePath, theme);
          if (fs.statSync(themePath).isDirectory()) {
            wpThemePath = themePath;
            break;
          }
        }
        if (wpThemePath) break;
      }
    }

    if (wpThemePath) {
      console.log(`✅ Found WordPress theme at: ${wpThemePath}`);
      
      // Create contentful-tables directory
      const tablesDir = path.join(wpThemePath, 'contentful-tables');
      fs.mkdirSync(tablesDir, { recursive: true });
      
      // Copy table files
      const tableFiles = fs.readdirSync(this.tablesDir);
      for (const file of tableFiles) {
        if (file.endsWith('.json')) {
          fs.copyFileSync(
            path.join(this.tablesDir, file),
            path.join(tablesDir, file)
          );
        }
      }
      
      console.log(`📂 Copied ${tableFiles.filter(f => f.endsWith('.json')).length} table files`);
      console.log(`📋 Next: Add the plugin code to your theme's functions.php`);
      
      return true;
    } else {
      console.log(`⚠️  WordPress theme directory not found automatically`);
      console.log(`📋 Manual setup required - see integration guide`);
      return false;
    }
  }
}

// Main execution
async function main() {
  try {
    const updater = new WordPressAutoTableUpdater();
    
    console.log('🚀 WordPress REST API Table Integration\n');
    
    // Test connection first
    const connectionOK = await updater.testConnection();
    if (!connectionOK) {
      console.log('\n❌ Cannot proceed without WordPress connection');
      process.exit(1);
    }
    
    // Check what posts are available
    console.log('\n📋 Checking available WordPress posts...');
    const allPosts = await updater.getAllWordPressPosts();
    console.log(`Found ${allPosts.length} posts:`);
    allPosts.slice(0, 10).forEach(post => {
      console.log(`   - "${post.title.rendered}" (slug: ${post.slug})`);
    });
    if (allPosts.length > 10) {
      console.log(`   ... and ${allPosts.length - 10} more`);
    }
    
    console.log('\n📋 Integration Options:');
    console.log('1. Shortcode integration (recommended)');
    console.log('2. Direct HTML injection');
    console.log('3. Dry run (test without making changes)');
    console.log('4. Setup plugin files');
    
    // For now, let's do a dry run first
    console.log('\n🧪 Running DRY RUN to preview changes...');
    await updater.processAllTables('shortcode', true);
    
    console.log('\n🎯 To execute actual updates:');
    console.log('   node wordpress-rest-api-updater.js --live');
    console.log('   node wordpress-rest-api-updater.js --html');
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Check command line arguments
const args = process.argv.slice(2);
const isLive = args.includes('--live');
const useHTML = args.includes('--html');
const setupOnly = args.includes('--setup');

if (setupOnly) {
  const updater = new WordPressAutoTableUpdater();
  updater.setupWordPressPlugin();
} else if (isLive) {
  const updater = new WordPressAutoTableUpdater();
  updater.testConnection().then(success => {
    if (success) {
      updater.processAllTables(useHTML ? 'html' : 'shortcode', false);
    }
  });
} else {
  main();
}

export default WordPressAutoTableUpdater;
