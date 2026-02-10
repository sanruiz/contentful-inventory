import fs from 'fs';
import path from 'path';
import https from 'https';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const WP_BASE_URL = process.env.WP_BASE_URL || process.env.WP_URL;
const WP_USERNAME = process.env.WP_USERNAME;
const WP_PASSWORD = process.env.WP_APPLICATION_PASSWORD || process.env.WP_PASSWORD;

// SSL agent for local development
const agent = new https.Agent({
  rejectUnauthorized: false
});

/**
 * Store table data in WordPress custom fields (headless-friendly approach)
 */
async function storeTablesInWordPressMeta() {
  if (!WP_BASE_URL || !WP_USERNAME || !WP_PASSWORD) {
    console.error('❌ Missing WordPress credentials');
    return;
  }

  console.log('🚀 Storing tables as WordPress meta data for headless access...');

  const tablesDir = path.join(process.cwd(), 'out', 'tables');
  const jsonFiles = fs.readdirSync(tablesDir).filter(file => file.endsWith('.json'));
  
  console.log(`📊 Found ${jsonFiles.length} table files`);

  // Create a single WordPress post to hold all table data
  const tablePostId = await createTablesDataPost();
  
  if (!tablePostId) {
    console.error('❌ Failed to create tables data post');
    return;
  }

  const results = [];

  for (const file of jsonFiles) {
    const tableId = path.basename(file, '.json');
    const filePath = path.join(tablesDir, file);
    
    try {
      const tableData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      console.log(`\n📝 Storing table: ${tableId}`);
      
      // Store as custom field
      const success = await updatePostMeta(tablePostId, `contentful_table_${tableId}`, JSON.stringify(tableData));
      
      if (success) {
        console.log(`✅ Stored: ${tableId}`);
        results.push({ tableId, success: true });
      } else {
        console.log(`❌ Failed: ${tableId}`);
        results.push({ tableId, success: false });
      }
      
    } catch (error) {
      console.error(`❌ Error storing ${tableId}:`, error.message);
      results.push({ tableId, success: false, error: error.message });
    }
  }

  const successful = results.filter(r => r.success).length;
  console.log(`\n📊 Stored ${successful}/${jsonFiles.length} tables`);
  console.log(`📍 WordPress Post ID: ${tablePostId}`);
  
  // Generate access instructions
  generateHeadlessAccessCode(tablePostId);

  return { postId: tablePostId, results };
}

/**
 * Create a WordPress post to hold table data
 */
async function createTablesDataPost() {
  const url = `${WP_BASE_URL}/wp-json/wp/v2/posts`;
  const auth = Buffer.from(`${WP_USERNAME}:${WP_PASSWORD}`).toString('base64');

  const postData = {
    title: 'Contentful Tables Data',
    content: 'This post contains Contentful table data for headless WordPress access.',
    status: 'private', // Keep it private since it's just data storage
    meta: {
      contentful_tables_version: '1.0',
      contentful_tables_count: 0
    }
  };

  try {
    const response = await fetch(url, {
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
      console.log(`✅ Created tables data post: ID ${result.id}`);
      return result.id;
    } else {
      const error = await response.text();
      console.error(`❌ Failed to create post: ${response.status} - ${error}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Network error: ${error.message}`);
    return null;
  }
}

/**
 * Update post meta field
 */
async function updatePostMeta(postId, metaKey, metaValue) {
  const url = `${WP_BASE_URL}/wp-json/wp/v2/posts/${postId}`;
  const auth = Buffer.from(`${WP_USERNAME}:${WP_PASSWORD}`).toString('base64');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify({
        meta: {
          [metaKey]: metaValue
        }
      }),
      agent: agent
    });

    return response.ok;
  } catch (error) {
    console.error(`❌ Failed to update meta: ${error.message}`);
    return false;
  }
}

/**
 * Generate code examples for accessing tables from headless frontend
 */
function generateHeadlessAccessCode(postId) {
  const accessCodeFile = path.join(process.cwd(), 'headless-table-access.js');
  
  const code = `// Headless WordPress Table Access
// Generated on: ${new Date().toISOString()}
//
// This code shows how to access your Contentful tables from a headless frontend

const WORDPRESS_API_BASE = '${WP_BASE_URL}/wp-json/wp/v2';
const TABLES_POST_ID = ${postId};

/**
 * Get all available table IDs
 */
async function getAvailableTableIds() {
  try {
    const response = await fetch(\`\${WORDPRESS_API_BASE}/posts/\${TABLES_POST_ID}\`);
    const post = await response.json();
    
    // Extract table IDs from meta keys
    const tableIds = Object.keys(post.meta)
      .filter(key => key.startsWith('contentful_table_'))
      .map(key => key.replace('contentful_table_', ''));
    
    return tableIds;
  } catch (error) {
    console.error('Failed to get table IDs:', error);
    return [];
  }
}

/**
 * Get specific table data
 */
async function getTableData(tableId) {
  try {
    const response = await fetch(\`\${WORDPRESS_API_BASE}/posts/\${TABLES_POST_ID}\`);
    const post = await response.json();
    
    const tableData = post.meta[\`contentful_table_\${tableId}\`];
    
    if (!tableData) {
      throw new Error(\`Table \${tableId} not found\`);
    }
    
    return JSON.parse(tableData);
  } catch (error) {
    console.error(\`Failed to get table \${tableId}:\`, error);
    return null;
  }
}

/**
 * Render table as HTML
 */
function renderTableHTML(tableData) {
  if (!tableData || !tableData.type) {
    return '<p>Invalid table data</p>';
  }

  if (tableData.type === 'tableOfContents') {
    return renderTableOfContents(tableData);
  } else {
    return renderDataTable(tableData);
  }
}

function renderTableOfContents(tableData) {
  let html = '<div class="contentful-table-of-contents">';
  
  if (tableData.title) {
    html += \`<h3>\${tableData.title}</h3>\`;
  }
  
  html += '<ul class="toc-list">';
  
  if (tableData.items) {
    tableData.items.forEach(item => {
      const text = item.text || '';
      const anchor = item.anchor || text.toLowerCase().replace(/\\s+/g, '-');
      html += \`<li><a href="#\${anchor}">\${text}</a></li>\`;
    });
  }
  
  html += '</ul></div>';
  
  return html;
}

function renderDataTable(tableData) {
  let html = '<div class="contentful-data-table">';
  
  if (tableData.title) {
    html += \`<h3>\${tableData.title}</h3>\`;
  }
  
  if (tableData.headers && tableData.rows) {
    html += '<div class="table-responsive">';
    html += '<table class="contentful-table">';
    
    // Headers
    html += '<thead><tr>';
    tableData.headers.forEach(header => {
      html += \`<th>\${header}</th>\`;
    });
    html += '</tr></thead>';
    
    // Rows
    html += '<tbody>';
    tableData.rows.forEach(row => {
      html += '<tr>';
      row.forEach(cell => {
        html += \`<td>\${cell}</td>\`;
      });
      html += '</tr>';
    });
    html += '</tbody>';
    
    html += '</table>';
    html += '</div>';
  }
  
  html += '</div>';
  
  return html;
}

/**
 * Example usage in a React component
 */
const ExampleReactComponent = {
  code: \`
import { useState, useEffect } from 'react';

function ContentfulTable({ tableId }) {
  const [tableHTML, setTableHTML] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTable() {
      try {
        const tableData = await getTableData(tableId);
        if (tableData) {
          const html = renderTableHTML(tableData);
          setTableHTML(html);
        }
      } catch (error) {
        console.error('Error loading table:', error);
      } finally {
        setLoading(false);
      }
    }

    loadTable();
  }, [tableId]);

  if (loading) return <div>Loading table...</div>;
  
  return (
    <div 
      className="contentful-table-container"
      dangerouslySetInnerHTML={{ __html: tableHTML }}
    />
  );
}

// Usage
<ContentfulTable tableId="XBIbkCm53nytLcsPx3jlw" />
\`
};

/**
 * Example usage in vanilla JavaScript
 */
const ExampleVanillaJS = {
  code: \`
// Load and display a table
async function displayTable(tableId, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = 'Loading...';
  
  try {
    const tableData = await getTableData(tableId);
    if (tableData) {
      const html = renderTableHTML(tableData);
      container.innerHTML = html;
    } else {
      container.innerHTML = 'Table not found';
    }
  } catch (error) {
    container.innerHTML = 'Error loading table';
    console.error(error);
  }
}

// Usage
displayTable('XBIbkCm53nytLcsPx3jlw', 'my-table-container');
\`
};

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getAvailableTableIds,
    getTableData,
    renderTableHTML,
    renderTableOfContents,
    renderDataTable,
    ExampleReactComponent,
    ExampleVanillaJS
  };
}`;

  fs.writeFileSync(accessCodeFile, code);
  
  console.log(`\n📖 Generated headless access code: ${accessCodeFile}`);
  console.log(`\n🎯 Quick Start for your headless frontend:`);
  console.log(`\n   // Get table data:`);
  console.log(`   const tableData = await getTableData('XBIbkCm53nytLcsPx3jlw');`);
  console.log(`\n   // Render HTML:`);
  console.log(`   const html = renderTableHTML(tableData);`);
  console.log(`   document.getElementById('table').innerHTML = html;`);
  
  console.log(`\n🌐 WordPress API Endpoints:`);
  console.log(`   📊 All data: ${WP_BASE_URL}/wp-json/wp/v2/posts/${postId}`);
  console.log(`   🔍 Specific meta: ${WP_BASE_URL}/wp-json/wp/v2/posts/${postId}?_fields=meta`);
}

// Main execution
async function main() {
  console.log('🎯 Contentful Tables → Headless WordPress (Meta Storage)');
  console.log('========================================================\n');

  const result = await storeTablesInWordPressMeta();
  
  if (result) {
    console.log(`\n✅ Done! Tables are now available in your headless WordPress.`);
    console.log(`📄 Check the generated file: headless-table-access.js`);
  }
}

// Handle command line execution
main();

export {
  storeTablesInWordPressMeta,
  createTablesDataPost,
  updatePostMeta,
  generateHeadlessAccessCode
};
