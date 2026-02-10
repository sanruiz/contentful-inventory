const fs = require('fs');
const path = require('path');
const https = require('https');

// Import fetch
let fetch;
(async () => {
  fetch = (await import('node-fetch')).default;
})();

require('dotenv').config();

// Configuration for headless WordPress
const WP_BASE_URL = process.env.WP_BASE_URL || process.env.WP_URL;
const WP_USERNAME = process.env.WP_USERNAME;
const WP_PASSWORD = process.env.WP_APPLICATION_PASSWORD || process.env.WP_PASSWORD;

// SSL agent for local development
const agent = new https.Agent({
  rejectUnauthorized: false
});

/**
 * Import all tables into WordPress database via REST API
 */
async function importTablesIntoWordPress() {
  if (!WP_BASE_URL || !WP_USERNAME || !WP_PASSWORD) {
    console.error('❌ Missing WordPress credentials. Please check your .env file:');
    console.error('   WP_BASE_URL (or WP_URL)');
    console.error('   WP_USERNAME');
    console.error('   WP_APPLICATION_PASSWORD (or WP_PASSWORD)');
    return;
  }

  console.log('🚀 Starting table import to headless WordPress...');
  console.log(`📡 WordPress URL: ${WP_BASE_URL}`);

  const tablesDir = path.join(__dirname, 'out', 'tables');
  
  if (!fs.existsSync(tablesDir)) {
    console.error(`❌ Tables directory not found: ${tablesDir}`);
    return;
  }

  const jsonFiles = fs.readdirSync(tablesDir).filter(file => file.endsWith('.json'));
  
  if (jsonFiles.length === 0) {
    console.error('❌ No JSON table files found in out/tables/');
    return;
  }

  console.log(`📊 Found ${jsonFiles.length} table files to import`);

  const results = [];

  for (const file of jsonFiles) {
    const tableId = path.basename(file, '.json');
    const filePath = path.join(tablesDir, file);
    
    try {
      const tableData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      console.log(`\n📝 Importing table: ${tableId}`);
      
      const success = await importSingleTable(tableId, tableData);
      results.push({ tableId, file, success });
      
      if (success) {
        console.log(`✅ Successfully imported: ${tableId}`);
      } else {
        console.log(`❌ Failed to import: ${tableId}`);
      }
      
    } catch (error) {
      console.error(`❌ Error importing ${tableId}:`, error.message);
      results.push({ tableId, file, success: false, error: error.message });
    }
  }

  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`\n📊 Import Summary:`);
  console.log(`   ✅ Successful: ${successful}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📊 Total: ${results.length}`);

  // Save results
  const resultsFile = path.join(__dirname, 'out', 'headless-import-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { successful, failed, total: results.length },
    results
  }, null, 2));
  
  console.log(`\n💾 Results saved to: ${resultsFile}`);

  if (successful > 0) {
    console.log(`\n🎯 Next Steps:`);
    console.log(`   1. Install the WordPress plugin: headless-wordpress-plugin.php`);
    console.log(`   2. Access tables via REST API: ${WP_BASE_URL}/wp-json/contentful/v1/tables`);
    console.log(`   3. Get specific table: ${WP_BASE_URL}/wp-json/contentful/v1/tables/{tableId}`);
    console.log(`   4. Get rendered HTML: ${WP_BASE_URL}/wp-json/contentful/v1/tables/{tableId}/render`);
  }
}

/**
 * Import a single table into WordPress
 */
async function importSingleTable(tableId, tableData) {
  const url = `${WP_BASE_URL}/wp-json/contentful/v1/tables`;
  
  const auth = Buffer.from(`${WP_USERNAME}:${WP_PASSWORD}`).toString('base64');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify({
        table_id: tableId,
        table_data: tableData
      }),
      agent: agent
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HTTP ${response.status}: ${errorText}`);
      return false;
    }

    const result = await response.json();
    return result.success === true;
    
  } catch (error) {
    console.error(`Network error: ${error.message}`);
    return false;
  }
}

/**
 * Test WordPress connection and plugin availability
 */
async function testWordPressConnection() {
  console.log('🔍 Testing WordPress connection...');
  
  const testUrl = `${WP_BASE_URL}/wp-json/contentful/v1/tables`;
  
  try {
    const response = await fetch(testUrl, {
      method: 'GET',
      agent: agent
    });

    if (response.status === 404) {
      console.log('⚠️  Plugin not installed yet. Install headless-wordpress-plugin.php first');
      return false;
    } else if (response.ok) {
      const result = await response.json();
      console.log(`✅ Plugin is working! Found ${result.count} existing tables`);
      return true;
    } else {
      console.log(`❌ Connection issue: HTTP ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Connection failed: ${error.message}`);
    return false;
  }
}

/**
 * Show how to access tables from your frontend
 */
function showUsageExamples() {
  console.log(`\n📖 Usage Examples for your headless frontend:`);
  console.log(`\n// Get all available tables:`);
  console.log(`fetch('${WP_BASE_URL}/wp-json/contentful/v1/tables')`);
  console.log(`  .then(res => res.json())`);
  console.log(`  .then(data => console.log(data.tables));`);
  
  console.log(`\n// Get specific table data:`);
  console.log(`fetch('${WP_BASE_URL}/wp-json/contentful/v1/tables/XBIbkCm53nytLcsPx3jlw')`);
  console.log(`  .then(res => res.json())`);
  console.log(`  .then(data => console.log(data.data));`);
  
  console.log(`\n// Get rendered table HTML:`);
  console.log(`fetch('${WP_BASE_URL}/wp-json/contentful/v1/tables/XBIbkCm53nytLcsPx3jlw/render')`);
  console.log(`  .then(res => res.json())`);
  console.log(`  .then(data => document.getElementById('table').innerHTML = data.html);`);
}

// Main execution
async function main() {
  if (!fetch) {
    // Wait for dynamic import to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    fetch = (await import('node-fetch')).default;
  }

  console.log('🎯 Contentful Tables → Headless WordPress Import');
  console.log('================================================\n');

  // Test connection first
  const connectionOK = await testWordPressConnection();
  
  if (!connectionOK) {
    console.log(`\n📋 Setup Steps:`);
    console.log(`   1. Install plugin: Copy headless-wordpress-plugin.php to your WordPress plugins or theme`);
    console.log(`   2. Activate plugin in WordPress admin`);
    console.log(`   3. Run this script again to import table data`);
    return;
  }

  // Import tables
  await importTablesIntoWordPress();
  
  // Show usage examples
  showUsageExamples();
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--test')) {
  testWordPressConnection();
} else if (args.includes('--examples')) {
  showUsageExamples();
} else {
  main();
}

module.exports = {
  importTablesIntoWordPress,
  testWordPressConnection,
  showUsageExamples
};
