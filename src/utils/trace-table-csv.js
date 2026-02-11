import 'dotenv/config';
import pkg from 'contentful-management';
const { createClient } = pkg;

const client = createClient({ accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN });
const space = await client.getSpace('61iwodu7d9u0');
const env = await space.getEnvironment('master');

const table = await env.getEntry('6OGCWSrHDT4MJviE31iLsa');
const srcRef = table.fields.source?.['en-US'];
const src = await env.getEntry(srcRef.sys.id);
const ct = src.sys.contentType.sys.id;
console.log('Source content type:', ct);

if (ct === 'dataSourceSpreadsheet') {
  const assetRef = src.fields.source?.['en-US'];
  const asset = await env.getAsset(assetRef.sys.id);
  let url = asset.fields.file?.['en-US']?.url;
  if (url.startsWith('//')) url = 'https:' + url;
  console.log('CSV URL:', url);

  const r = await fetch(url);
  const text = await r.text();
  
  // Parse CSV properly
  const lines = text.split('\n').filter(l => l.trim());
  console.log('\nRaw CSV headers:', lines[0]);
  console.log('Total data rows:', lines.length - 1);

  // Show all rows with key column visible
  console.log('\n--- ALL ROWS (showing key column) ---');
  for (let i = 0; i < lines.length; i++) {
    console.log(`[${i}] ${lines[i].substring(0, 200)}`);
  }
}
