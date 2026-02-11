import 'dotenv/config';
import pkg from 'contentful-management';
const { createClient } = pkg;
import fs from 'fs';

const client = createClient({ accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN });
const space = await client.getSpace('61iwodu7d9u0');
const env = await space.getEnvironment('master');

const table = await env.getEntry('6OGCWSrHDT4MJviE31iLsa');
const srcRef = table.fields.source?.['en-US'];
const src = await env.getEntry(srcRef.sys.id);
const ct = src.sys.contentType.sys.id;
console.log('Source content type:', ct);

const assetRef = src.fields.source?.['en-US'];
const asset = await env.getAsset(assetRef.sys.id);
let url = asset.fields.file?.['en-US']?.url;
if (url.startsWith('//')) url = 'https:' + url;

const r = await fetch(url);
const text = await r.text();

// Save raw CSV for inspection
fs.writeFileSync('/tmp/birmingham-resources.csv', text);
console.log('CSV saved to /tmp/birmingham-resources.csv');

// Parse CSV with proper handling of quoted fields
function parseCSV(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  let row = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(current.trim()); current = ''; }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(current.trim());
        if (row.some(c => c !== '')) rows.push(row);
        row = []; current = '';
        if (ch === '\r') i++;
      } else { current += ch; }
    }
  }
  if (current || row.length > 0) { row.push(current.trim()); if (row.some(c => c !== '')) rows.push(row); }
  return rows;
}

const parsed = parseCSV(text);
console.log('\nParsed CSV:');
console.log('Headers:', parsed[0]);
console.log('Columns:', parsed[0].length);
console.log('');

// Show rows with key values
const keyColIndex = parsed[0].indexOf('key');
console.log('Key column index:', keyColIndex);
console.log('');

const uniqueKeys = new Set();
for (let i = 1; i < parsed.length; i++) {
  const key = parsed[i][keyColIndex] || 'EMPTY';
  uniqueKeys.add(key);
  console.log(`Row ${i}: key="${key}" | name="${parsed[i][0].substring(0, 60)}"`);
}

console.log('\nUnique key values:', [...uniqueKeys]);
console.log('Total unique keys:', uniqueKeys.size);

// Now show the Contentful page headings that precede each table reference
console.log('\n\n--- Contentful Page Section Headings ---');
const page = (await env.getEntries({ content_type: 'page', 'fields.slug': 'birmingham-al-facilities', limit: 1 })).items[0];
const body = page.fields.body?.['en-US'];

const sections = [];
let lastHeading = '';
for (const node of body.content) {
  if (node.nodeType === 'heading-3') {
    lastHeading = node.content?.map(n => n.value || '').join('') || '';
  }
  if (node.nodeType === 'embedded-entry-block' && node.data?.target?.sys?.id === '6OGCWSrHDT4MJviE31iLsa') {
    sections.push(lastHeading);
    console.log(`Section: "${lastHeading}"`);
  }
}

console.log('\nTotal sections using this table:', sections.length);
