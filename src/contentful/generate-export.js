import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the blog posts data
const blogPostsPath = path.join(__dirname, 'out', 'blog_posts.json');
const blogPosts = JSON.parse(fs.readFileSync(blogPostsPath, 'utf8'));

console.log('📊 Analyzing blog posts for embedded table components...\n');

const postsWithTables = [];

blogPosts.forEach(post => {
  // Check if this post has embedded entries (components)
  if (post.embeddedComponents && post.embeddedComponents.entries && post.embeddedComponents.entries.length > 0) {
    const tableComponents = [];
    
    // We need to look at the actual content to identify table components
    // Since we don't have the component details in this file, we'll extract all entry IDs
    post.embeddedComponents.entries.forEach(entryId => {
      tableComponents.push({
        id: entryId,
        type: 'embedded-entry' // We'll need to check the type manually
      });
    });

    if (tableComponents.length > 0) {
      postsWithTables.push({
        title: post.title,
        slug: post.slug,
        id: post.id,
        contentfulUrl: `https://app.contentful.com/spaces/61iwodu7d9u0/entries/${post.id}`,
        embeddedComponents: tableComponents,
        totalComponents: tableComponents.length
      });
    }
  }
});

// Create the export
const exportData = {
  exportDate: new Date().toISOString(),
  totalPostsAnalyzed: blogPosts.length,
  postsWithEmbeddedComponents: postsWithTables.length,
  posts: postsWithTables
};

// Save to file
const exportPath = path.join(__dirname, 'out', 'posts-with-tables-export.json');
fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));

// Create a CSV for easy viewing
const csvLines = ['Title,Slug,Post ID,Contentful URL,Component IDs,Total Components'];

postsWithTables.forEach(post => {
  const componentIds = post.embeddedComponents.map(comp => comp.id).join('; ');
  csvLines.push(`"${post.title}","${post.slug}","${post.id}","${post.contentfulUrl}","${componentIds}",${post.totalComponents}`);
});

const csvPath = path.join(__dirname, 'out', 'posts-with-tables-export.csv');
fs.writeFileSync(csvPath, csvLines.join('\n'));

// Display summary
console.log('📋 Export Summary:');
console.log(`Total posts analyzed: ${blogPosts.length}`);
console.log(`Posts with embedded components: ${postsWithTables.length}`);
console.log('\n📝 Posts with Embedded Components:');

postsWithTables.forEach((post, index) => {
  console.log(`\n${index + 1}. ${post.title}`);
  console.log(`   Slug: ${post.slug}`);
  console.log(`   Post ID: ${post.id}`);
  console.log(`   Components: ${post.totalComponents}`);
  console.log(`   Component IDs: ${post.embeddedComponents.map(c => c.id).join(', ')}`);
  console.log(`   Contentful URL: ${post.contentfulUrl}`);
});

console.log(`\n✅ Export files created:`);
console.log(`📄 JSON: ${exportPath}`);
console.log(`📊 CSV: ${csvPath}`);
