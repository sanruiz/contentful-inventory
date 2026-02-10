import 'dotenv/config';
import pkg from 'contentful-management';
const { createClient } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

const spaceId = '61iwodu7d9u0';

async function fetchCompleteTableData() {
  console.log('🔍 Fetching complete table data with sources...\n');
  
  const space = await client.getSpace(spaceId);
  const environment = await space.getEnvironment('master');
  
  // Fetch table configuration
  const tableConfig = await environment.getEntry('3JnIHQENe4ZtihjpWwphGI');
  console.log('📊 Table Configuration:');
  console.log(`   Title: ${tableConfig.fields.title['en-US']}`);
  console.log(`   Source ID: ${tableConfig.fields.source['en-US'].sys.id}`);
  
  // Fetch actual table data
  const sourceId = tableConfig.fields.source['en-US'].sys.id;
  const tableData = await environment.getEntry(sourceId);
  
  console.log('\n📋 Table Data Source:');
  console.log(`   Type: ${tableData.sys.contentType.sys.id}`);
  console.log('   Fields:');
  Object.keys(tableData.fields).forEach(field => {
    console.log(`     - ${field}`);
  });
  
  // Save the complete table data
  const outputPath = path.join(__dirname, 'out', `complete-table-${sourceId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(tableData, null, 2));
  console.log(`   ✅ Complete data saved to: ${outputPath}`);
  
  // Extract and format the actual table content
  if (tableData.fields.data && tableData.fields.data['en-US']) {
    console.log('\n📊 Raw Table Data Preview:');
    const rawData = tableData.fields.data['en-US'];
    
    if (Array.isArray(rawData)) {
      console.log(`   Rows: ${rawData.length}`);
      if (rawData.length > 0) {
        console.log(`   Columns: ${Object.keys(rawData[0]).length}`);
        console.log('   First row:', rawData[0]);
        if (rawData.length > 1) {
          console.log('   Second row:', rawData[1]);
        }
      }
    } else {
      console.log('   Data type:', typeof rawData);
      console.log('   Data:', JSON.stringify(rawData).substring(0, 200) + '...');
    }
  }
  
  return { tableConfig, tableData };
}

async function createWordPressTableHTML(tableConfig, tableData) {
  console.log('\n🔧 Converting to WordPress HTML...');
  
  const title = tableConfig.fields.title['en-US'];
  const data = tableData.fields.data['en-US'];
  
  let html = `<!-- Table: ${title} -->\n`;
  html += `<div class="contentful-table">\n`;
  html += `  <h3>${title}</h3>\n`;
  html += `  <div class="table-responsive">\n`;
  html += `    <table class="table table-striped">\n`;
  
  if (Array.isArray(data) && data.length > 0) {
    // Get columns from filters or first row
    const columns = tableConfig.fields.filters['en-US'].selectedColumns;
    
    // Header
    html += `      <thead>\n        <tr>\n`;
    columns.forEach(col => {
      html += `          <th>${col.name}</th>\n`;
    });
    html += `        </tr>\n      </thead>\n`;
    
    // Body
    html += `      <tbody>\n`;
    data.forEach(row => {
      html += `        <tr>\n`;
      columns.forEach(col => {
        const cellData = row[col.name] || row[col.id] || '';
        html += `          <td>${cellData}</td>\n`;
      });
      html += `        </tr>\n`;
    });
    html += `      </tbody>\n`;
  }
  
  html += `    </table>\n`;
  html += `  </div>\n`;
  html += `</div>\n`;
  
  return html;
}

async function main() {
  try {
    const { tableConfig, tableData } = await fetchCompleteTableData();
    
    // Create WordPress-ready HTML
    const wordpressHTML = await createWordPressTableHTML(tableConfig, tableData);
    
    // Save the HTML
    const htmlPath = path.join(__dirname, 'out', 'sample-table.html');
    fs.writeFileSync(htmlPath, wordpressHTML);
    
    console.log('\n✅ WordPress Table HTML:');
    console.log(wordpressHTML);
    console.log(`\n📄 HTML saved to: ${htmlPath}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();
