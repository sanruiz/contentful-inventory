import 'dotenv/config';
import pkg from 'contentful-management';
const { createClient } = pkg;
import https from 'https';

const client = createClient({ accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN });
const space = await client.getSpace('61iwodu7d9u0');
const env = await space.getEnvironment('master');

// Spreadsheet source entries and their assets
const spreadsheetSources = [
  { tableId: '2c3VSTp799nSTyBJJNHjuT', sourceId: '7mRJJrPqGeyRb5sl0o9Mle', assetId: '4PaVmddLggEvzz1aKU7Mal', title: 'Retirement and Independent Living Communities for LGBTQIA+ Seniors' },
  { tableId: '7sTwuurW1KuQiYimlILMfI', sourceId: '56WHYbaikRFBI7k9SS6Ne0', assetId: '6cYBx2lXvba2XyAkc9Mc0E', title: 'Assisted Living and Memory Care for LGBTQIA+ Seniors' },
  { tableId: '2v4SBIZxACU7u5riIjilcC', sourceId: '2Hp5Bvp2NhjI97oHiFMLSR', assetId: '5hhXyFSxxlVSCs4JknJrG1', title: 'Low-Income Housing for LGBTQIA+ Seniors' },
  { tableId: '7utd5KeBZmW8d2fdxSObKw', sourceId: 'ZvI10yLzwiUrZ23Wyi9rn', assetId: '4dsHdjIkE5ehNmxl5aioCq', title: 'Resources for LGBTQIA+ Seniors' },
  { tableId: '5SsSY3pZh2k8RGuCyxkT9J', sourceId: '1eu6KRd6pijx07g2BlCUwZ', assetId: '6KeujMFZUWXLQlzpT0mis6', title: 'Guide to Caring for an Aging Parent From Long Distance' },
  { tableId: '4kepYtMVuplc3UAr4ls1fm', sourceId: '5WP3alkiGXO6hjfgPsT2oE', assetId: '7lSmFeORa4bEfsHhu6yCeb', title: 'Using Technology to Stay Connected' },
  { tableId: '7BzXjZFAImz0AGPRbjhgqL', sourceId: '1BQ22mXe0efXYeKgJ1KEef', assetId: '3eOaiOvmYdYaibdRigg6yJ', title: 'State by State Resources for Long-Distance Caregivers' },
];

for (const s of spreadsheetSources) {
  console.log(`\n--- ${s.title} ---`);
  try {
    const asset = await env.getAsset(s.assetId);
    const file = asset.fields.file?.['en-US'];
    console.log('File name:', file?.fileName);
    console.log('Content type:', file?.contentType);
    console.log('URL:', file?.url);
    console.log('Size:', file?.details?.size, 'bytes');
    
    // Try to fetch the CSV/spreadsheet content
    if (file?.url) {
      const url = file.url.startsWith('//') ? `https:${file.url}` : file.url;
      const response = await fetch(url);
      const text = await response.text();
      const lines = text.split('\n');
      console.log('Lines:', lines.length);
      console.log('First 3 lines:');
      lines.slice(0, 3).forEach((l, i) => console.log(`  ${i}: ${l.substring(0, 150)}`));
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
}
