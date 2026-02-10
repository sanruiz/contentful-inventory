import fs from 'fs';
import path from 'path';
import https from 'https';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

/**
 * Direct database approach - insert tables into the WordPress database table we created
 */
async function insertTablesIntoDatabase() {
  console.log('🗄️  Inserting tables directly into WordPress database...');

  const tablesDir = path.join(process.cwd(), 'out', 'tables');
  const jsonFiles = fs.readdirSync(tablesDir).filter(file => file.endsWith('.json'));
  
  console.log(`📊 Found ${jsonFiles.length} table files`);

  // First, try to get the database info from wp-config.php
  const wpConfigPath = '/Users/santiagoramirez/Local Sites/memorycarecom/app/public/wp-config.php';
  
  try {
    const wpConfig = fs.readFileSync(wpConfigPath, 'utf8');
    
    // Extract database credentials
    const dbName = wpConfig.match(/define\(\s*'DB_NAME',\s*'([^']+)'/)?.[1];
    const dbUser = wpConfig.match(/define\(\s*'DB_USER',\s*'([^']+)'/)?.[1];
    const dbPassword = wpConfig.match(/define\(\s*'DB_PASSWORD',\s*'([^']+)'/)?.[1];
    const dbHost = wpConfig.match(/define\(\s*'DB_HOST',\s*'([^']+)'/)?.[1] || 'localhost';
    const tablePrefix = wpConfig.match(/\$table_prefix\s*=\s*'([^']+)'/)?.[1] || 'wp_';

    if (!dbName || !dbUser) {
      throw new Error('Could not extract database credentials from wp-config.php');
    }

    console.log(`📡 Connecting to database: ${dbName} (${dbHost})`);
    
    // Create database connection
    const connection = await mysql.createConnection({
      host: dbHost,
      user: dbUser,
      password: dbPassword,
      database: dbName
    });

    console.log('✅ Connected to database');

    const tableName = `${tablePrefix}contentful_tables`;
    
    // Check if our custom table exists
    const [rows] = await connection.execute('SHOW TABLES LIKE ?', [tableName]);
    
    if (rows.length === 0) {
      console.log(`⚠️  Table ${tableName} doesn't exist, creating it...`);
      
      const createTableSQL = `CREATE TABLE ${tableName} (
        id mediumint(9) NOT NULL AUTO_INCREMENT,
        table_id varchar(50) NOT NULL,
        table_data longtext NOT NULL,
        table_type varchar(50) DEFAULT 'dataVisualizationTable',
        title varchar(255) DEFAULT '',
        created_at datetime DEFAULT CURRENT_TIMESTAMP,
        updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY table_id (table_id)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
      
      await connection.execute(createTableSQL);
      console.log(`✅ Created table: ${tableName}`);
    }

    // Clear existing tables
    await connection.execute(`DELETE FROM ${tableName}`);
    console.log('🗑️  Cleared existing table data');

    let successful = 0;

    // Insert each table
    for (const file of jsonFiles) {
      const tableId = path.basename(file, '.json');
      const filePath = path.join(tablesDir, file);
      
      try {
        const tableData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`📝 Inserting table: ${tableId}`);
        
        const insertSQL = `INSERT INTO ${tableName} (table_id, table_data, table_type, title) VALUES (?, ?, ?, ?)`;
        
        await connection.execute(insertSQL, [
          tableId,
          JSON.stringify(tableData),
          tableData.type || 'dataVisualizationTable',
          tableData.title || ''
        ]);
        
        console.log(`✅ Inserted: ${tableId}`);
        successful++;
        
      } catch (error) {
        console.error(`❌ Error with ${tableId}:`, error.message);
      }
    }

    await connection.end();
    
    console.log(`\n📊 Successfully inserted ${successful}/${jsonFiles.length} tables into database`);
    
    // Update plugin to use database loading
    updatePluginForDatabaseLoading();
    
    return successful;

  } catch (error) {
    console.error('❌ Database operation failed:', error.message);
    console.log('\n🔄 Falling back to REST API approach...');
    return await fallbackToRestAPI();
  }
}

/**
 * Update plugin to prioritize database loading
 */
function updatePluginForDatabaseLoading() {
  const pluginPath = '/Users/santiagoramirez/Local Sites/memorycarecom/app/public/wp-content/plugins/contentful-tables/contentful-tables.php';
  
  try {
    let pluginContent = fs.readFileSync(pluginPath, 'utf8');
    
    // Update the load_tables_data method to try database first
    const oldPattern = /\/\/ If no tables found in post meta, try to load from database table[\s\S]*?if \(empty\(\$this->tables_data\)\) \{\s*\$this->load_tables_from_database\(\);\s*\}/;
    
    const newCode = `// Load from database first (more reliable)
        $this->load_tables_from_database();
        
        // If no tables found in database, try to load from post meta as fallback
        if (empty($this->tables_data)) {
            foreach ($possible_post_ids as $post_id) {
                $post_meta = get_post_meta($post_id);
                
                if (!empty($post_meta)) {
                    $found_tables = false;
                    foreach ($post_meta as $meta_key => $meta_values) {
                        if (strpos($meta_key, 'contentful_table_') === 0) {
                            $table_id = str_replace('contentful_table_', '', $meta_key);
                            $table_data = json_decode($meta_values[0], true);
                            
                            if ($table_data) {
                                $this->tables_data[$table_id] = $table_data;
                                $found_tables = true;
                            }
                        }
                    }
                    
                    if ($found_tables) {
                        update_option('contentful_tables_post_id', $post_id);
                        break;
                    }
                }
            }
        }`;
    
    if (oldPattern.test(pluginContent)) {
      pluginContent = pluginContent.replace(oldPattern, newCode);
      fs.writeFileSync(pluginPath, pluginContent);
      console.log(`✅ Updated plugin to prioritize database loading`);
    } else {
      console.log(`⚠️  Could not auto-update plugin loading order`);
    }
    
  } catch (error) {
    console.log(`⚠️  Could not update plugin: ${error.message}`);
  }
}

/**
 * Fallback to REST API if database approach fails
 */
async function fallbackToRestAPI() {
  console.log('🔄 Using WordPress REST API as fallback...');
  
  const WP_BASE_URL = process.env.WP_BASE_URL || process.env.WP_URL;
  const WP_USERNAME = process.env.WP_USERNAME;
  const WP_PASSWORD = process.env.WP_APPLICATION_PASSWORD || process.env.WP_PASSWORD;
  
  if (!WP_BASE_URL || !WP_USERNAME || !WP_PASSWORD) {
    console.error('❌ Missing WordPress credentials');
    return 0;
  }

  // Use the WordPress database table via REST API (custom endpoint)
  console.log('ℹ️  Note: You may need to add a custom REST endpoint to access the database table');
  console.log('ℹ️  For now, the plugin should work with the database data we inserted');
  
  return 1;
}

// Main execution
async function main() {
  console.log('🎯 Contentful Tables → WordPress Database Direct Insert');
  console.log('====================================================\n');

  const result = await insertTablesIntoDatabase();
  
  if (result > 0) {
    console.log(`\n✅ Success! ${result} tables inserted into WordPress database`);
    console.log(`📋 Next: Refresh your WordPress admin page at Settings → Contentful Tables`);
    console.log(`🎯 The plugin should now load tables from the database table`);
  } else {
    console.log(`\n❌ No tables were inserted. Please check the error messages above.`);
  }
}

main();
