import fs from 'fs';
import path from 'path';
import https from 'https';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const WP_BASE_URL = process.env.WP_BASE_URL || process.env.WP_URL;
const WP_USERNAME = process.env.WP_USERNAME;
const WP_PASSWORD = process.env.WP_APPLICATION_PASSWORD || process.env.WP_PASSWORD;

// SSL agent for local development
const agent = new https.Agent({
  rejectUnauthorized: false
});

/**
 * Direct database approach - store tables as individual WordPress posts
 */
async function storeTablesAsIndividualPosts() {
  if (!WP_BASE_URL || !WP_USERNAME || !WP_PASSWORD) {
    console.error('❌ Missing WordPress credentials');
    return;
  }

  console.log('🎯 Storing each table as individual WordPress post...');

  const tablesDir = path.join(process.cwd(), 'out', 'tables');
  const jsonFiles = fs.readdirSync(tablesDir).filter(file => file.endsWith('.json'));
  
  console.log(`📊 Found ${jsonFiles.length} table files`);

  const results = [];
  const auth = Buffer.from(`${WP_USERNAME}:${WP_PASSWORD}`).toString('base64');

  for (const file of jsonFiles) {
    const tableId = path.basename(file, '.json');
    const filePath = path.join(tablesDir, file);
    
    try {
      const tableData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      console.log(`\n📝 Creating post for table: ${tableId}`);
      
      // Create WordPress post for this table
      const postData = {
        title: `Contentful Table: ${tableId}`,
        content: `<!-- Contentful Table Data: ${tableId} -->`,
        status: 'private',
        meta: {
          [`contentful_table_${tableId}`]: JSON.stringify(tableData),
          'contentful_table_id': tableId,
          'contentful_table_type': tableData.type || 'dataVisualizationTable'
        }
      };

      const response = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`
        },
        body: JSON.stringify(postData),
        agent: agent
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Created post ID: ${result.id}`);
        results.push({ tableId, postId: result.id, success: true });
      } else {
        const error = await response.text();
        console.log(`❌ Failed: ${error}`);
        results.push({ tableId, success: false, error });
      }
      
    } catch (error) {
      console.error(`❌ Error with ${tableId}:`, error.message);
      results.push({ tableId, success: false, error: error.message });
    }
  }

  const successful = results.filter(r => r.success).length;
  console.log(`\n📊 Created ${successful}/${jsonFiles.length} table posts`);
  
  // Update plugin with table post IDs
  if (successful > 0) {
    const tablePostIds = results.filter(r => r.success).map(r => r.postId);
    console.log(`\n📋 Table Post IDs: ${tablePostIds.join(', ')}`);
    
    await updatePluginWithPostIds(tablePostIds);
  }

  return results;
}

/**
 * Update the plugin to use the correct post IDs
 */
async function updatePluginWithPostIds(postIds) {
  const pluginPath = '/Users/santiagoramirez/Local Sites/memorycarecom/app/public/wp-content/plugins/contentful-tables/contentful-tables.php';
  
  try {
    let pluginContent = fs.readFileSync(pluginPath, 'utf8');
    
    // Update the load_tables_data method to use these post IDs
    const newPostIds = JSON.stringify(postIds);
    const oldPattern = /\$possible_post_ids = \[[\d, ]+\]/;
    const newLine = `$possible_post_ids = ${newPostIds}`;
    
    pluginContent = pluginContent.replace(oldPattern, newLine);
    
    fs.writeFileSync(pluginPath, pluginContent);
    
    console.log(`✅ Updated plugin with post IDs: ${postIds.join(', ')}`);
  } catch (error) {
    console.log(`⚠️ Could not auto-update plugin: ${error.message}`);
    console.log(`📝 Manual update needed: Use post IDs ${postIds.join(', ')} in the plugin`);
  }
}

/**
 * Alternative: Store all tables in a single post with better error handling
 */
async function storeTablesInSinglePost() {
  console.log('\n🔄 Trying alternative: Single post approach...');
  
  const tablesDir = path.join(process.cwd(), 'out', 'tables');
  const jsonFiles = fs.readdirSync(tablesDir).filter(file => file.endsWith('.json'));
  
  const allTables = {};
  
  // Load all tables
  for (const file of jsonFiles) {
    const tableId = path.basename(file, '.json');
    const filePath = path.join(tablesDir, file);
    const tableData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    allTables[tableId] = tableData;
  }
  
  const postData = {
    title: 'Contentful Tables Data Store',
    content: 'This post contains all Contentful table data for the plugin.',
    status: 'private',
    meta: {}
  };
  
  // Add each table as a separate meta field
  for (const [tableId, tableData] of Object.entries(allTables)) {
    postData.meta[`contentful_table_${tableId}`] = JSON.stringify(tableData);
  }
  
  const auth = Buffer.from(`${WP_USERNAME}:${WP_PASSWORD}`).toString('base64');
  
  try {
    const response = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(postData),
      agent: agent
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Created single post with all tables: ID ${result.id}`);
      
      // Update plugin to use this post ID
      await updatePluginWithSinglePostId(result.id);
      
      return result.id;
    } else {
      const error = await response.text();
      console.log(`❌ Failed to create single post: ${error}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Network error: ${error.message}`);
    return null;
  }
}

/**
 * Update plugin to use single post ID
 */
async function updatePluginWithSinglePostId(postId) {
  const pluginPath = '/Users/santiagoramirez/Local Sites/memorycarecom/app/public/wp-content/plugins/contentful-tables/contentful-tables.php';
  
  try {
    let pluginContent = fs.readFileSync(pluginPath, 'utf8');
    
    // Update the load_tables_data method
    const oldPattern = /\$possible_post_ids = \[[\d, \[\]]+\]/;
    const newLine = `$possible_post_ids = [${postId}]`;
    
    pluginContent = pluginContent.replace(oldPattern, newLine);
    
    fs.writeFileSync(pluginPath, pluginContent);
    
    console.log(`✅ Updated plugin to use post ID: ${postId}`);
  } catch (error) {
    console.log(`⚠️ Could not auto-update plugin: ${error.message}`);
    console.log(`📝 Manual update needed: Use post ID ${postId} in the plugin`);
  }
}

// Main execution
async function main() {
  console.log('🎯 Contentful Tables → WordPress Direct Import');
  console.log('==============================================\n');

  // Try single post approach first (simpler)
  const singlePostId = await storeTablesInSinglePost();
  
  if (singlePostId) {
    console.log(`\n✅ Success! Tables imported to WordPress post ${singlePostId}`);
    console.log(`📋 Next: Refresh your WordPress admin page at Settings → Contentful Tables`);
  } else {
    console.log(`\n🔄 Single post failed, trying individual posts...`);
    const results = await storeTablesAsIndividualPosts();
    
    const successful = results.filter(r => r.success).length;
    if (successful > 0) {
      console.log(`\n✅ Success! Created ${successful} table posts`);
    } else {
      console.log(`\n❌ All approaches failed. Please check your WordPress credentials and try again.`);
    }
  }
}

main();
