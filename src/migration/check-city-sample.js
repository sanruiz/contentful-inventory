import 'dotenv/config';
import pkg from 'contentful-management';
const { createClient } = pkg;

const client = createClient({ accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN });
const space = await client.getSpace('61iwodu7d9u0');
const env = await space.getEnvironment('master');
// Get ALL city entries (slugs only) to understand slug patterns
let all = [];
let skip = 0;
while (true) {
  const batch = await env.getEntries({
    content_type: 'page',
    'fields.pageType': 'city',
    limit: 100,
    skip,
    select: 'sys.id,fields.slug,fields.parentPage',
  });
  all.push(...batch.items);
  if (all.length >= batch.total) break;
  skip += 100;
  process.stderr.write(`\rFetched ${all.length}/${batch.total}...`);
}
console.log(`\nTotal cities: ${all.length}`);

// Check slug patterns
const withFacilities = all.filter(e => e.fields.slug?.['en-US']?.includes('-facilities'));
const withoutFacilities = all.filter(e => !e.fields.slug?.['en-US']?.includes('-facilities'));
console.log(`Slugs ending with -facilities: ${withFacilities.length}`);
console.log(`Slugs without -facilities: ${withoutFacilities.length}`);
if (withoutFacilities.length > 0) {
  console.log('Non-facilities slugs:', withoutFacilities.slice(0, 5).map(e => e.fields.slug?.['en-US']));
}

// Check parent page distribution
const noParent = all.filter(e => !e.fields.parentPage?.['en-US']);
console.log(`\nCities without parentPage: ${noParent.length}`);
if (noParent.length > 0) {
  console.log('No parent:', noParent.slice(0, 5).map(e => ({ id: e.sys.id, slug: e.fields.slug?.['en-US'] })));
}

// Unique parent IDs
const parentIds = new Set(all.map(e => e.fields.parentPage?.['en-US']?.sys?.id).filter(Boolean));
console.log(`\nUnique parent states: ${parentIds.size}`);

// Check for duplicate slugs
const slugCounts = {};
for (const e of all) {
  const slug = e.fields.slug?.['en-US'] || '';
  // Extract just the city part (remove -facilities suffix)
  const citySlug = slug.replace(/-facilities$/, '');
  slugCounts[citySlug] = (slugCounts[citySlug] || 0) + 1;
}
const duplicates = Object.entries(slugCounts).filter(([, c]) => c > 1);
console.log(`\nDuplicate city slugs: ${duplicates.length}`);
if (duplicates.length > 0) {
  console.log('Examples:', duplicates.slice(0, 10));
}
