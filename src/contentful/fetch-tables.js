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

// Sample table component IDs from our export
const sampleTableIds = [
  'XBIbkCm53nytLcsPx3jlw', // tableOfContents
  '3JnIHQENe4ZtihjpWwphGI', // dataVisualizationTables
  'wJCeOiel472Htk9lDc0rB', // dataVisualizationTables
];

async function fetchTableData() {
  console.log('🔍 Fetching table component data from Contentful...\n');
  
  const space = await client.getSpace(spaceId);
  const environment = await space.getEnvironment('master');
  
  for (const tableId of sampleTableIds) {
    try {
      console.log(`📊 Fetching: ${tableId}`);
      const entry = await environment.getEntry(tableId);
      
      console.log(`   Type: ${entry.sys.contentType.sys.id}`);
      console.log(`   Created: ${entry.sys.createdAt}`);
      console.log(`   Updated: ${entry.sys.updatedAt}`);
      
      // Log the fields available
      console.log('   Fields available:');
      Object.keys(entry.fields).forEach(field => {
        console.log(`     - ${field}`);
      });
      
      // Save raw data for analysis
      const outputPath = path.join(__dirname, 'out', `table-${tableId}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(entry, null, 2));
      console.log(`   ✅ Saved to: ${outputPath}`);
      
      console.log('   Raw field data:');
      Object.entries(entry.fields).forEach(([key, value]) => {
        if (value['en-US']) {
          const content = typeof value['en-US'] === 'string' 
            ? value['en-US'].substring(0, 100) + (value['en-US'].length > 100 ? '...' : '')
            : JSON.stringify(value['en-US']).substring(0, 100);
          console.log(`     ${key}: ${content}`);
        }
      });
      
      console.log('');
      
    } catch (error) {
      console.error(`❌ Error fetching ${tableId}:`, error.message);
    }
  }
}

fetchTableData().catch(console.error);
