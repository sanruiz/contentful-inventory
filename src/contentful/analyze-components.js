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

async function analyzeComponents() {
  console.log('🔍 Analyzing embedded components to identify table types...\n');
  
  // Read the blog posts data
  const blogPostsPath = path.join(__dirname, 'out', 'blog_posts.json');
  const blogPosts = JSON.parse(fs.readFileSync(blogPostsPath, 'utf8'));
  
  const space = await client.getSpace(spaceId);
  const environment = await space.getEnvironment('master');
  
  const postsWithTables = [];
  
  for (const post of blogPosts) {
    if (post.embeddedComponents && post.embeddedComponents.entries && post.embeddedComponents.entries.length > 0) {
      console.log(`📄 Analyzing: ${post.title}`);
      
      const componentDetails = [];
      
      for (const entryId of post.embeddedComponents.entries) {
        try {
          const entry = await environment.getEntry(entryId);
          const contentType = entry.sys.contentType.sys.id;
          
          componentDetails.push({
            id: entryId,
            contentType: contentType,
            contentfulUrl: `https://app.contentful.com/spaces/${spaceId}/entries/${entryId}`,
            isTable: contentType === 'dataVisualizationTables' || contentType === 'tableOfContents'
          });
          
          console.log(`   ✓ ${entryId} - ${contentType}`);
          
        } catch (error) {
          console.log(`   ✗ ${entryId} - Failed to fetch: ${error.message}`);
          componentDetails.push({
            id: entryId,
            contentType: 'unknown',
            contentfulUrl: `https://app.contentful.com/spaces/${spaceId}/entries/${entryId}`,
            isTable: false,
            error: error.message
          });
        }
      }
      
      const tableComponents = componentDetails.filter(comp => comp.isTable);
      
      if (tableComponents.length > 0 || componentDetails.length > 0) {
        postsWithTables.push({
          title: post.title,
          slug: post.slug,
          id: post.id,
          contentfulUrl: `https://app.contentful.com/spaces/${spaceId}/entries/${post.id}`,
          wordPressUrl: `http://memorycare.local/wp-admin/post.php?post=${getWordPressId(post.slug)}&action=edit`,
          allComponents: componentDetails,
          tableComponents: tableComponents,
          totalComponents: componentDetails.length,
          totalTables: tableComponents.length
        });
      }
      
      console.log(`   📊 Found ${tableComponents.length} table components out of ${componentDetails.length} total\n`);
    }
  }
  
  // Create detailed export
  const detailedExport = {
    exportDate: new Date().toISOString(),
    totalPostsAnalyzed: blogPosts.length,
    postsWithComponents: postsWithTables.length,
    totalTableComponents: postsWithTables.reduce((sum, post) => sum + post.totalTables, 0),
    posts: postsWithTables
  };
  
  const exportPath = path.join(__dirname, 'out', 'detailed-tables-export.json');
  fs.writeFileSync(exportPath, JSON.stringify(detailedExport, null, 2));
  
  // Create CSV for tables only
  const csvLines = ['Post Title,Slug,Post ID,Table Component ID,Table Type,Contentful Component URL,WordPress Post URL'];
  
  postsWithTables.forEach(post => {
    if (post.tableComponents.length > 0) {
      post.tableComponents.forEach(table => {
        const wpUrl = `http://memorycare.local/wp-admin/post.php?action=edit&post=UNKNOWN`;
        csvLines.push(`"${post.title}","${post.slug}","${post.id}","${table.id}","${table.contentType}","${table.contentfulUrl}","${wpUrl}"`);
      });
    } else {
      // Include posts with other components for reference
      const wpUrl = `http://memorycare.local/wp-admin/post.php?action=edit&post=UNKNOWN`;
      csvLines.push(`"${post.title}","${post.slug}","${post.id}","NO_TABLES","${post.allComponents.map(c => c.contentType).join('; ')}","N/A","${wpUrl}"`);
    }
  });
  
  const csvPath = path.join(__dirname, 'out', 'tables-detailed-export.csv');
  fs.writeFileSync(csvPath, csvLines.join('\n'));
  
  // Summary report
  console.log('📋 DETAILED ANALYSIS SUMMARY:');
  console.log(`Total posts analyzed: ${blogPosts.length}`);
  console.log(`Posts with embedded components: ${postsWithTables.length}`);
  console.log(`Total table components found: ${detailedExport.totalTableComponents}`);
  
  console.log('\n📊 TABLE COMPONENTS BY TYPE:');
  const componentTypes = {};
  postsWithTables.forEach(post => {
    post.tableComponents.forEach(comp => {
      componentTypes[comp.contentType] = (componentTypes[comp.contentType] || 0) + 1;
    });
  });
  
  Object.entries(componentTypes).forEach(([type, count]) => {
    console.log(`   ${type}: ${count} components`);
  });
  
  console.log('\n📝 POSTS WITH TABLE COMPONENTS:');
  postsWithTables.forEach((post, index) => {
    if (post.totalTables > 0) {
      console.log(`\n${index + 1}. ${post.title}`);
      console.log(`   Slug: ${post.slug}`);
      console.log(`   Tables: ${post.totalTables}/${post.totalComponents}`);
      post.tableComponents.forEach(table => {
        console.log(`     • ${table.id} (${table.contentType})`);
        console.log(`       ${table.contentfulUrl}`);
      });
    }
  });
  
  console.log(`\n✅ Detailed export files created:`);
  console.log(`📄 JSON: ${exportPath}`);
  console.log(`📊 CSV: ${csvPath}`);
}

function getWordPressId(slug) {
  // This would need to be mapped from the WordPress import results
  // For now, return placeholder
  return 'UNKNOWN';
}

analyzeComponents().catch(console.error);
