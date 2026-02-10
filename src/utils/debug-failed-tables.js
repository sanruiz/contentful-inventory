import 'dotenv/config';
import pkg from 'contentful-management';
const { createClient } = pkg;

const client = createClient({ accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN });
const space = await client.getSpace('61iwodu7d9u0');
const env = await space.getEnvironment('master');

const failedIds = [
  '2c3VSTp799nSTyBJJNHjuT',
  '7sTwuurW1KuQiYimlILMfI',
  '2v4SBIZxACU7u5riIjilcC',
  '7utd5KeBZmW8d2fdxSObKw',
  '5SsSY3pZh2k8RGuCyxkT9J',
  '4kepYtMVuplc3UAr4ls1fm',
  '7BzXjZFAImz0AGPRbjhgqL',
  '5kHg14bCSYK8St7RHkyBES',
];

for (const id of failedIds) {
  try {
    const entry = await env.getEntry(id);
    const ct = entry.sys.contentType.sys.id;
    const title = entry.fields.title?.['en-US'] || entry.fields.text?.['en-US'] || 'N/A';
    const source = entry.fields.source?.['en-US']?.sys?.id || 'NO SOURCE';
    console.log('---');
    console.log('ID:', id);
    console.log('ContentType:', ct);
    console.log('Title:', title);
    console.log('Fields:', Object.keys(entry.fields).join(', '));
    
    if (ct === 'link') {
      console.log('URL:', entry.fields.url?.['en-US'] || entry.fields.href?.['en-US'] || 'N/A');
      continue;
    }
    
    console.log('Source ID:', source);
    
    if (source !== 'NO SOURCE') {
      const sourceEntry = await env.getEntry(source);
      const sourceCt = sourceEntry.sys.contentType.sys.id;
      console.log('Source ContentType:', sourceCt);
      
      const dt = sourceEntry.fields.dataTable?.['en-US'];
      if (dt) {
        console.log('dataTable keys:', Object.keys(dt));
        if (dt.tableData) {
          console.log('tableData type:', typeof dt.tableData, 'isArray:', Array.isArray(dt.tableData), 'length:', dt.tableData?.length);
          if (dt.tableData.length > 0) {
            console.log('First row:', JSON.stringify(dt.tableData[0]).substring(0, 200));
          }
        }
        for (const [k, v] of Object.entries(dt)) {
          if (k !== 'tableData') {
            const str = JSON.stringify(v);
            console.log(`  dt.${k}:`, str?.substring(0, 150));
          }
        }
      } else {
        console.log('No dataTable field. Source fields:');
        for (const [k, v] of Object.entries(sourceEntry.fields)) {
          const val = v?.['en-US'];
          const str = JSON.stringify(val);
          console.log(`  ${k}:`, typeof val, str?.substring(0, 150));
        }
      }
    }
  } catch (err) {
    console.log('Error for', id, ':', err.message);
  }
}
