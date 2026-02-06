#!/usr/bin/env node

/**
 * Blog Posts Export Script for Contentful
 * 
 * This script exports specific blog post pages from Contentful and analyzes them
 * for embedded components that need special handling.
 */

const contentful = require('contentful-management');
const fs = require('fs');
require('dotenv').config();

// Configuration
const config = {
  spaceId: process.env.CONTENTFUL_SPACE_ID,
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
  environment: process.env.CONTENTFUL_ENVIRONMENT_ID || 'master'
};

// Blog post IDs to export
const blogPostIds = [
  '2Uo6ukOqfx0z3AVtnR5F9X', // step-by-step-guide-to-hiring-an-in-home-dementia-caregiver
  '41sYwm5jwVxeo5atguaf0g', // power-of-reading-and-benefits-of-libraries-for-people-with-dementia
  '6amktQOhC3PSr7A3N1L4Z5', // ten-early-warning-signs
  '4RfUuZ4adLcWYXIRbYRAvE', // how-amazon-alexa-can-help-seniors-with-alzheimers-dementia
  '1lEgPuFS07WRJ6K6itXGHW', // veterans
  'TymErcV13ubPV69sAFXB3',  // 11-ways-an-elder-care-attorney-can-help-caregivers
  '2dVQavFWMzqUbgntiuMApP', // memory-care-guide-for-muslim-seniors
  '18Ie4UonGCPACveMGsSiH2', // is-there-a-tax-deduction-for-memory-care-facility-costs
  '1CNCXAIspEXv0paqncWSfi', // what-you-need-to-know-about-sundowning-and-dementia
  '3fyqD1ubssEbuGcdTcbFkS', // sexual-health-and-stds-in-seniors
  '5ODHcDRHPXzCSRxGlvht5T', // care-guide-for-seniors-with-parkinsons
  '50qi3FAVSm8eZuvuiYRHtW', // support-for-dementia-caregivers
  '2Zw3uPUtBLSirpFUVujwMR', // treating-alzheimers-at-home
  '35BbDwDEiCZeMLynQLlnOc', // alzheimers-vs-dementia
  '5AYI99KIPkFC0NbvRBbrc4', // what-to-expect-in-memory-care
  '3HPHl6xAZD9b2ADGMTOb9G', // paying-for-alzheimers-care
  '25TUx5g6plhKIli05ggcug', // what-is-a-memory-care-facility
  '4OKvyrDtDXUtW67mdhtyeD', // disability-benefits
  '2pOBkKu8P6sHp7aZ5QPiGo', // seven-stages-of-alzheimers
  '5oI4augsuUQ6vQVV5say65', // does-medicare-cover-memory-care
  '652sDfOFwChgIxioc0efoz', // does-medicaid-pay-for-memory-care
  '2hK5qybiFNt30kagqbjU5d'  // when-to-consider-memory-care
];

// Extract embedded components from rich text content
function extractEmbeddedComponents(content) {
  const components = {
    assets: [],
    entries: []
  };

  if (!content || !content.content) return components;

  function traverse(nodes) {
    for (const node of nodes) {
      if (node.nodeType === 'embedded-asset-block') {
        const assetId = node.data?.target?.sys?.id;
        if (assetId && !components.assets.includes(assetId)) {
          components.assets.push(assetId);
        }
      }
      if (node.nodeType === 'embedded-entry-block') {
        const entryId = node.data?.target?.sys?.id;
        if (entryId && !components.entries.includes(entryId)) {
          components.entries.push(entryId);
        }
      }
      if (node.content) {
        traverse(node.content);
      }
    }
  }

  traverse(content.content);
  return components;
}

async function main() {
  try {
    console.log('🔍 Exporting blog posts and analyzing components...\n');
    
    // Initialize Contentful client
    const client = contentful.createClient({
      accessToken: config.accessToken
    });

    const space = await client.getSpace(config.spaceId);
    const environment = await space.getEnvironment(config.environment);

    const exportedPosts = [];
    const allComponents = {
      assets: new Set(),
      entries: new Set()
    };

    // Process each blog post
    for (const entryId of blogPostIds) {
      try {
        console.log(`📄 Processing entry: ${entryId}`);
        
        const entry = await environment.getEntry(entryId);
        const fields = entry.fields;
        
        // Extract basic info
        const blogPost = {
          id: entry.sys.id,
          contentType: entry.sys.contentType.sys.id,
          slug: fields.slug?.['en-US'] || '',
          title: fields.title?.['en-US'] || '',
          description: fields.description?.['en-US'] || '',
          publishedDate: fields.publishedDate?.['en-US'] || '',
          author: fields.author?.['en-US'] || '',
          heroContent: fields.heroContent?.['en-US'] || '',
          body: fields.body?.['en-US'] || '',
          found: true
        };

        // Analyze embedded components
        const heroComponents = extractEmbeddedComponents(blogPost.heroContent);
        const bodyComponents = extractEmbeddedComponents(blogPost.body);
        
        // Combine and track components
        const allPostComponents = {
          assets: [...new Set([...heroComponents.assets, ...bodyComponents.assets])],
          entries: [...new Set([...heroComponents.entries, ...bodyComponents.entries])]
        };

        blogPost.embeddedComponents = allPostComponents;

        // Add to global tracking
        allPostComponents.assets.forEach(id => allComponents.assets.add(id));
        allPostComponents.entries.forEach(id => allComponents.entries.add(id));

        exportedPosts.push(blogPost);

        if (allPostComponents.assets.length > 0 || allPostComponents.entries.length > 0) {
          console.log(`  📦 Found ${allPostComponents.assets.length} assets, ${allPostComponents.entries.length} entries`);
        } else {
          console.log(`  ✅ No embedded components`);
        }

      } catch (error) {
        console.error(`❌ Failed to process ${entryId}:`, error.message);
        exportedPosts.push({
          id: entryId,
          slug: 'unknown',
          title: 'Failed to fetch',
          found: false,
          error: error.message
        });
      }
    }

    // Save exported data
    const outputPath = '../out/blog_posts.json';
    fs.writeFileSync(outputPath, JSON.stringify(exportedPosts, null, 2));
    console.log(`\n💾 Exported ${exportedPosts.length} blog posts to: ${outputPath}`);

    // Summary report
    console.log(`\n📊 COMPONENT ANALYSIS SUMMARY:`);
    console.log(`Total blog posts: ${exportedPosts.length}`);
    console.log(`Successfully exported: ${exportedPosts.filter(p => p.found).length}`);
    console.log(`Failed exports: ${exportedPosts.filter(p => !p.found).length}`);
    console.log(`Unique embedded assets: ${allComponents.assets.size}`);
    console.log(`Unique embedded entries: ${allComponents.entries.size}`);

    if (allComponents.entries.size > 0) {
      console.log(`\n🔍 EMBEDDED ENTRY COMPONENTS FOUND:`);
      Array.from(allComponents.entries).forEach(entryId => {
        const postsWithComponent = exportedPosts.filter(post => 
          post.embeddedComponents?.entries.includes(entryId)
        );
        console.log(`  - ${entryId} (used in ${postsWithComponent.length} posts)`);
      });
    }

    if (allComponents.assets.size > 0) {
      console.log(`\n📸 EMBEDDED ASSET COMPONENTS:`);
      console.log(`  Found ${allComponents.assets.size} unique embedded assets`);
    }

  } catch (error) {
    console.error('💥 Export failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { extractEmbeddedComponents };
