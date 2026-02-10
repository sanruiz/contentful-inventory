import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// For local development - ignore SSL certificate issues
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

async function quickTableUpdate() {
  const wpUrl = process.env.WP_BASE_URL || 'https://memorycare.local';
  const wpUser = process.env.WP_USERNAME || 'sanruiz';
  const wpPassword = process.env.WP_APPLICATION_PASSWORD;

  console.log('🚀 Quick Table Update - Adding shortcodes to WordPress posts\n');

  // Read the blog import log to get WordPress IDs
  const importLogPath = path.join(__dirname, 'out', 'wp-blog-import-log.json');
  const importLog = JSON.parse(fs.readFileSync(importLogPath, 'utf8'));

  // Read the table mapping
  const csvPath = path.join(__dirname, 'out', 'tables-detailed-export.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.split('\n').slice(1);

  // Create mapping of slugs to tables
  const slugToTables = new Map();
  for (const line of lines) {
    if (!line.trim()) continue;
    
    const [title, slug, postId, tableId, tableType] = line.split(',').map(field => 
      field.replace(/^"|"$/g, '').trim()
    );

    if (tableId === 'NO_TABLES') continue;

    // Check if we have the table file
    const tableFile = path.join(__dirname, 'out', 'tables', `${tableId}.html`);
    if (!fs.existsSync(tableFile)) continue;

    if (!slugToTables.has(slug)) {
      slugToTables.set(slug, []);
    }
    slugToTables.get(slug).push(tableId);
  }

  console.log(`📋 Found ${slugToTables.size} posts with tables to process\n`);

  // Process each imported post
  for (const logEntry of importLog) {
    if (!logEntry.success) continue;

    const slug = logEntry.post;
    const wpId = logEntry.wpId;
    
    if (!slugToTables.has(slug)) {
      console.log(`⚪ ${slug}: No tables to add`);
      continue;
    }

    const tables = slugToTables.get(slug);
    console.log(`📝 Processing: ${slug} (WP ID: ${wpId})`);
    console.log(`   Tables to add: ${tables.length} (${tables.join(', ')})`);

    try {
      // Get current post content
      const getResponse = await fetch(`${wpUrl}/wp-json/wp/v2/posts/${wpId}`, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${wpUser}:${wpPassword}`).toString('base64'),
          'Content-Type': 'application/json'
        },
        agent: wpUrl.startsWith('https:') ? httpsAgent : undefined
      });

      if (!getResponse.ok) {
        console.log(`   ❌ Failed to get post: ${getResponse.statusText}`);
        continue;
      }

      const post = await getResponse.json();
      let currentContent = post.content.raw || '';

      console.log(`   📄 Current content length: ${currentContent.length} chars`);

      // Add shortcodes for each table (if not already present)
      let contentUpdated = false;
      for (const tableId of tables) {
        const shortcode = `[contentful-table id="${tableId}"]`;
        
        if (!currentContent.includes(shortcode) && !currentContent.includes(`contentful-table-${tableId}`)) {
          currentContent += `\n\n${shortcode}`;
          contentUpdated = true;
          console.log(`   ✅ Added shortcode: ${tableId}`);
        } else {
          console.log(`   ⚠️  Shortcode already exists: ${tableId}`);
        }
      }

      if (!contentUpdated) {
        console.log(`   ⚪ No updates needed`);
        continue;
      }

      // Update the post
      const updateResponse = await fetch(`${wpUrl}/wp-json/wp/v2/posts/${wpId}`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${wpUser}:${wpPassword}`).toString('base64'),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: currentContent
        }),
        agent: wpUrl.startsWith('https:') ? httpsAgent : undefined
      });

      if (updateResponse.ok) {
        console.log(`   ✅ Successfully updated post ${wpId}`);
      } else {
        const errorText = await updateResponse.text();
        console.log(`   ❌ Failed to update: ${updateResponse.status} ${errorText}`);
      }

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }

    console.log(''); // Empty line for readability
  }

  console.log('🎉 Quick table update complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Install the WordPress plugin code');
  console.log('2. Copy table files to your theme');
  console.log('3. Check your posts - shortcodes should now render as tables');
}

quickTableUpdate().catch(console.error);
