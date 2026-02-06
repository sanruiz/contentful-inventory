#!/usr/bin/env node

/**
 * WordPress Import Script for Contentful Corporate Pages
 * 
 * This script imports the exported corporate pages from Contentful into WordPress
 * using the WordPress REST API.
 * 
 * Requirements:
 * - WordPress site with REST API enabled
 * - Application password or JWT token for authentication
 * - Node.js with axios package
 */

const fs = require('fs');
const axios = require('axios');
const https = require('https');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config();

// Create axios instance with SSL handling for local development
const axiosInstance = axios.create({
  // For local development, ignore self-signed certificates
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  }),
  // Increase timeout for local environments
  timeout: 30000
});

// Configuration
const config = {
  wpBaseUrl: process.env.WP_BASE_URL || 'http://localhost:8080',
  username: process.env.WP_USERNAME || 'admin',
  applicationPassword: process.env.WP_APPLICATION_PASSWORD,
  
  // Contentful API configuration for fetching assets
  contentfulSpaceId: process.env.CONTENTFUL_SPACE_ID,
  contentfulAccessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
  contentfulEnvironment: process.env.CONTENTFUL_ENVIRONMENT_ID || 'master',
  
  // Import settings
  postStatus: process.env.WP_POST_STATUS || 'draft',
  postType: process.env.WP_POST_TYPE || 'page',
  defaultAuthor: parseInt(process.env.WP_DEFAULT_AUTHOR) || 1,
  
  // Test mode - import only one page for testing
  testMode: process.env.TEST_MODE === 'true',
  testPageSlug: process.env.TEST_PAGE_SLUG || 'about-us'
};

// Cache for imported media to avoid duplicate uploads
const mediaCache = new Map();
const entryCache = new Map();

// Fetch entry details from Contentful
async function fetchContentfulEntry(entryId) {
  if (!config.contentfulSpaceId || !config.contentfulAccessToken) {
    console.log('⚠️  Contentful credentials not configured - cannot fetch entries');
    return null;
  }

  // Check cache first
  if (entryCache.has(entryId)) {
    return entryCache.get(entryId);
  }

  try {
    const response = await axiosInstance.get(
      `https://api.contentful.com/spaces/${config.contentfulSpaceId}/environments/${config.contentfulEnvironment}/entries/${entryId}?locale=*`,
      {
        headers: {
          'Authorization': `Bearer ${config.contentfulAccessToken}`
        }
      }
    );

    const entry = response.data;
    console.log(`🔍 Fetched entry ${entryId} (type: ${entry.sys.contentType.sys.id})`);
    
    // Handle localized fields properly
    const getLocalizedValue = (field) => {
      if (!field) return '';
      
      // If it's already a string, return it
      if (typeof field === 'string') return field;
      
      // If it's an object with locale keys
      if (typeof field === 'object') {
        // Try common locales
        return field['en-US'] || field['en'] || field[Object.keys(field)[0]] || '';
      }
      
      return '';
    };

    const processedEntry = {
      id: entryId,
      contentType: entry.sys.contentType.sys.id,
      fields: {}
    };

    // Process all fields
    for (const [fieldName, fieldValue] of Object.entries(entry.fields || {})) {
      processedEntry.fields[fieldName] = getLocalizedValue(fieldValue);
    }

    // Cache the result
    entryCache.set(entryId, processedEntry);
    return processedEntry;

  } catch (error) {
    console.error(`❌ Failed to fetch Contentful entry ${entryId}:`, error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }

  return null;
}

// Fetch asset details from Contentful
async function fetchContentfulAsset(assetId) {
  if (!config.contentfulSpaceId || !config.contentfulAccessToken) {
    console.log('⚠️  Contentful credentials not configured - cannot fetch assets');
    return null;
  }

  try {
    // First try with locale parameter
    const response = await axiosInstance.get(
      `https://api.contentful.com/spaces/${config.contentfulSpaceId}/environments/${config.contentfulEnvironment}/assets/${assetId}?locale=*`,
      {
        headers: {
          'Authorization': `Bearer ${config.contentfulAccessToken}`
        }
      }
    );

    const asset = response.data;
    console.log('🔍 Raw asset data:', JSON.stringify(asset.fields, null, 2));
    
    // Handle localized fields properly
    const getLocalizedValue = (field) => {
      if (!field) return '';
      
      // If it's already a string, return it
      if (typeof field === 'string') return field;
      
      // If it's an object with locale keys
      if (typeof field === 'object') {
        // Try common locales
        return field['en-US'] || field['en'] || field[Object.keys(field)[0]] || '';
      }
      
      return '';
    };

    const fileField = asset.fields?.file;
    let fileUrl = '';
    let fileName = '';
    let contentType = '';

    if (fileField) {
      const fileData = typeof fileField === 'object' ? 
        (fileField['en-US'] || fileField['en'] || fileField[Object.keys(fileField)[0]]) : 
        fileField;
      
      if (fileData) {
        fileUrl = fileData.url;
        fileName = fileData.fileName;
        contentType = fileData.contentType;
      }
    }

    const title = getLocalizedValue(asset.fields?.title) || fileName || 'Untitled Asset';
    const description = getLocalizedValue(asset.fields?.description) || '';

    console.log('📸 Processed asset data:', { 
      id: assetId, 
      fileUrl, 
      fileName, 
      title, 
      description, 
      contentType 
    });

    if (fileUrl) {
      return {
        id: assetId,
        url: fileUrl.startsWith('//') ? `https:${fileUrl}` : fileUrl,
        fileName,
        title,
        description,
        contentType
      };
    } else {
      console.log('⚠️  No file URL found for asset', assetId);
    }
  } catch (error) {
    console.error(`❌ Failed to fetch Contentful asset ${assetId}:`, error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }

  return null;
}

// Download image from Contentful and upload to WordPress
async function uploadAssetToWordPress(assetData) {
  try {
    // Check cache first
    if (mediaCache.has(assetData.id)) {
      return mediaCache.get(assetData.id);
    }

    console.log(`📸 Downloading image: ${assetData.fileName}`);

    // Download the image from Contentful
    const imageResponse = await axiosInstance.get(assetData.url, {
      responseType: 'stream'
    });

    // Create form data for WordPress media upload
    const form = new FormData();
    form.append('file', imageResponse.data, {
      filename: assetData.fileName,
      contentType: assetData.contentType || 'image/jpeg'
    });

    // Upload to WordPress media library
    const auth = Buffer.from(`${config.username}:${config.applicationPassword}`).toString('base64');
    
    const uploadResponse = await axiosInstance.post(
      `${config.wpBaseUrl}/wp-json/wp/v2/media`,
      form,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          ...form.getHeaders()
        }
      }
    );

    const wpMedia = {
      id: uploadResponse.data.id,
      url: uploadResponse.data.source_url,
      title: assetData.title,
      alt: assetData.description
    };

    // Cache the result
    mediaCache.set(assetData.id, wpMedia);

    console.log(`✅ Uploaded image: ${assetData.fileName} (WordPress ID: ${wpMedia.id})`);
    return wpMedia;

  } catch (error) {
    console.error(`❌ Failed to upload asset ${assetData.fileName}:`, error.response?.data || error.message);
    return null;
  }
}

// Rich text converter - converts Contentful rich text to WordPress blocks
async function convertRichTextToBlocks(richTextDocument, assetMap = new Map(), entryMap = new Map()) {
  if (!richTextDocument || !richTextDocument.content) {
    return [];
  }

  const blocks = [];
  
  for (const node of richTextDocument.content) {
    switch (node.nodeType) {
      case 'paragraph':
        const text = extractTextFromNode(node);
        if (text.trim()) {
          blocks.push({
            blockName: 'core/paragraph',
            innerHTML: `<p>${text}</p>`,
            innerContent: [`<p>${text}</p>`]
          });
        }
        break;
        
      case 'heading-2':
        const headingText = extractTextFromNode(node);
        blocks.push({
          blockName: 'core/heading',
          attrs: { level: 2 },
          innerHTML: `<h2 class="wp-block-heading">${headingText}</h2>`,
          innerContent: [`<h2 class="wp-block-heading">${headingText}</h2>`]
        });
        break;
        
      case 'heading-3':
        const h3Text = extractTextFromNode(node);
        blocks.push({
          blockName: 'core/heading',
          attrs: { level: 3 },
          innerHTML: `<h3 class="wp-block-heading">${h3Text}</h3>`,
          innerContent: [`<h3 class="wp-block-heading">${h3Text}</h3>`]
        });
        break;
        
      case 'heading-4':
        const h4Text = extractTextFromNode(node);
        blocks.push({
          blockName: 'core/heading',
          attrs: { level: 4 },
          innerHTML: `<h4 class="wp-block-heading">${h4Text}</h4>`,
          innerContent: [`<h4 class="wp-block-heading">${h4Text}</h4>`]
        });
        break;
        
      case 'heading-5':
        const h5Text = extractTextFromNode(node);
        blocks.push({
          blockName: 'core/heading',
          attrs: { level: 5 },
          innerHTML: `<h5 class="wp-block-heading">${h5Text}</h5>`,
          innerContent: [`<h5 class="wp-block-heading">${h5Text}</h5>`]
        });
        break;
        
      case 'heading-6':
        const h6Text = extractTextFromNode(node);
        blocks.push({
          blockName: 'core/heading',
          attrs: { level: 6 },
          innerHTML: `<h6 class="wp-block-heading">${h6Text}</h6>`,
          innerContent: [`<h6 class="wp-block-heading">${h6Text}</h6>`]
        });
        break;
        
      case 'unordered-list':
        const listItems = node.content.map(item => {
          const itemText = extractTextFromNode(item);
          return `<li>${itemText}</li>`;
        }).join('');
        
        blocks.push({
          blockName: 'core/list',
          innerHTML: `<ul>${listItems}</ul>`,
          innerContent: [`<ul>${listItems}</ul>`]
        });
        break;
        
      case 'ordered-list':
        const orderedItems = node.content.map(item => {
          const itemText = extractTextFromNode(item);
          return `<li>${itemText}</li>`;
        }).join('');
        
        blocks.push({
          blockName: 'core/list',
          attrs: { ordered: true },
          innerHTML: `<ol>${orderedItems}</ol>`,
          innerContent: [`<ol>${orderedItems}</ol>`]
        });
        break;
        
      case 'hyperlink':
        // Handle hyperlinks within paragraphs
        break;
        
      case 'embedded-asset-block':
        // Handle embedded assets (images, files)
        const assetId = node.data?.target?.sys?.id;
        if (assetId) {
          // Check if we have this asset in our map
          if (assetMap.has(assetId)) {
            const wpMedia = assetMap.get(assetId);
            blocks.push({
              blockName: 'core/image',
              attrs: {
                id: wpMedia.id,
                sizeSlug: 'large',
                linkDestination: 'none'
              },
              innerHTML: `<figure class="wp-block-image size-large"><img src="${wpMedia.url}" alt="${wpMedia.alt || ''}" class="wp-image-${wpMedia.id}"/></figure>`,
              innerContent: [`<figure class="wp-block-image size-large"><img src="${wpMedia.url}" alt="${wpMedia.alt || ''}" class="wp-image-${wpMedia.id}"/></figure>`]
            });
          } else {
            // Fallback if asset not processed
            blocks.push({
              blockName: 'core/paragraph',
              innerHTML: `<p><em>[Image Asset: ${assetId} - Processing...]</em></p>`,
              innerContent: [`<p><em>[Image Asset: ${assetId} - Processing...]</em></p>`]
            });
          }
        }
        break;
        
      case 'embedded-entry-block':
        // Handle embedded entries (components, forms, etc.)
        const entryId = node.data?.target?.sys?.id;
        if (entryId) {
          // Check if we have this entry in our map
          if (entryMap.has(entryId)) {
            const entry = entryMap.get(entryId);
            
            // Handle different content types
            switch (entry.contentType) {
              case 'error':
                // Convert error component to WordPress error message
                const errorCode = entry.fields.errorCode || '';
                const errorMessage = entry.fields.errorMessage || '';
                const userMessage = entry.fields.userMessage || '';
                const linkText = entry.fields.linkText || 'Return to Homepage';
                
                blocks.push({
                  blockName: 'core/group',
                  attrs: { className: 'error-page-content' },
                  innerHTML: `<div class="wp-block-group error-page-content">
                    <h1>${errorCode} - ${errorMessage}</h1>
                    <p>${userMessage}</p>
                    <p><a href="/" class="wp-element-button">${linkText}</a></p>
                  </div>`,
                  innerContent: [`<div class="wp-block-group error-page-content">
                    <h1>${errorCode} - ${errorMessage}</h1>
                    <p>${userMessage}</p>
                    <p><a href="/" class="wp-element-button">${linkText}</a></p>
                  </div>`]
                });
                break;
                
              case 'form':
                // Convert Contentful form to WordPress Contact Form 7 or HTML form
                const formTitle = entry.fields.title || 'Contact Form';
                const submitText = entry.fields.submitText || 'Submit';
                
                // Create a basic HTML contact form
                const formHtml = `<div class="wp-block-group contact-form-wrapper">
                  <h3>${formTitle}</h3>
                  <form class="contentful-contact-form" method="post" action="/wp-admin/admin-post.php">
                    <input type="hidden" name="action" value="contentful_form_submit">
                    <div class="form-row">
                      <label for="cf-name">Name *</label>
                      <input type="text" id="cf-name" name="name" required>
                    </div>
                    <div class="form-row">
                      <label for="cf-email">Email *</label>
                      <input type="email" id="cf-email" name="email" required>
                    </div>
                    <div class="form-row">
                      <label for="cf-subject">Subject</label>
                      <input type="text" id="cf-subject" name="subject">
                    </div>
                    <div class="form-row">
                      <label for="cf-message">Message *</label>
                      <textarea id="cf-message" name="message" rows="5" required></textarea>
                    </div>
                    <div class="form-row">
                      <button type="submit" class="wp-element-button">${submitText}</button>
                    </div>
                  </form>
                  <style>
                    .contentful-contact-form { max-width: 600px; }
                    .form-row { margin-bottom: 1rem; }
                    .form-row label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
                    .form-row input, .form-row textarea { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; }
                    .form-row button { background: #0073aa; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 4px; cursor: pointer; }
                    .form-row button:hover { background: #005177; }
                  </style>
                </div>`;
                
                blocks.push({
                  blockName: 'core/html',
                  innerHTML: formHtml,
                  innerContent: [formHtml]
                });
                break;

              case 'tableOfContents':
                // Convert Contentful Table of Contents to WordPress TOC
                const tocTitle = entry.fields.title || 'Table of Contents';
                const headerTags = entry.fields.includedHeaderTags || ['H2'];
                const tocStyle = entry.fields.style || 'List';
                const isSticky = entry.fields.stickyOnScroll || false;
                
                const tocHtml = `<div class="wp-block-group table-of-contents${isSticky ? ' sticky-toc' : ''}">
                  <h3>${tocTitle}</h3>
                  <div class="toc-placeholder" data-header-tags="${headerTags.join(',')}" data-style="${tocStyle.toLowerCase()}">
                    <p><em>[Table of Contents will be automatically generated from ${headerTags.join(', ')} headings]</em></p>
                  </div>
                  <style>
                    .table-of-contents { 
                      background: #f8f9fa; 
                      padding: 1.5rem; 
                      border-left: 4px solid #0073aa; 
                      margin: 2rem 0; 
                    }
                    .table-of-contents h3 { 
                      margin: 0 0 1rem 0; 
                      color: #0073aa; 
                    }
                    .sticky-toc { 
                      position: sticky; 
                      top: 2rem; 
                      z-index: 10; 
                    }
                    .toc-placeholder { 
                      font-style: italic; 
                      color: #666; 
                    }
                  </style>
                </div>`;
                
                blocks.push({
                  blockName: 'core/html',
                  innerHTML: tocHtml,
                  innerContent: [tocHtml]
                });
                break;

              case 'dataVisualizationTables':
                // Convert Contentful data tables to WordPress table blocks
                const tableTitle = entry.fields.title || 'Data Table';
                const tableStyle = entry.fields.style || 'Equal Width';
                const tableType = entry.fields.type || 'Plain';
                
                // Since we don't have the actual table data in the entry fields,
                // we'll create a placeholder that can be manually filled
                const tableHtml = `<div class="wp-block-group data-visualization-table">
                  <h4>${tableTitle}</h4>
                  <div class="table-placeholder" data-style="${tableStyle}" data-type="${tableType}">
                    <table class="wp-block-table">
                      <thead>
                        <tr>
                          <th>Column 1</th>
                          <th>Column 2</th>
                          <th>Column 3</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td colspan="3"><em>[Table data from "${tableTitle}" needs to be imported manually]</em></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <style>
                    .data-visualization-table { 
                      margin: 2rem 0; 
                    }
                    .data-visualization-table h4 { 
                      color: #0073aa; 
                      margin-bottom: 1rem; 
                    }
                    .data-visualization-table table { 
                      width: 100%; 
                      border-collapse: collapse; 
                    }
                    .data-visualization-table th, 
                    .data-visualization-table td { 
                      padding: 0.75rem; 
                      border: 1px solid #ddd; 
                      text-align: left; 
                    }
                    .data-visualization-table th { 
                      background: #f8f9fa; 
                      font-weight: bold; 
                    }
                  </style>
                </div>`;
                
                blocks.push({
                  blockName: 'core/html',
                  innerHTML: tableHtml,
                  innerContent: [tableHtml]
                });
                break;
                
              default:
                // Fallback for other component types
                blocks.push({
                  blockName: 'core/paragraph',
                  innerHTML: `<p><em>[${entry.contentType} Component: ${entryId}]</em></p>`,
                  innerContent: [`<p><em>[${entry.contentType} Component: ${entryId}]</em></p>`]
                });
            }
          } else {
            // Fallback if entry not processed
            blocks.push({
              blockName: 'core/paragraph',
              innerHTML: `<p><em>[Embedded Component: ${entryId} - Processing...]</em></p>`,
              innerContent: [`<p><em>[Embedded Component: ${entryId} - Processing...]</em></p>`]
            });
          }
        }
        break;
        
      default:
        console.log(`Unhandled node type: ${node.nodeType}`);
    }
  }
  
  return blocks;
}

// Extract all asset IDs from rich text content
function extractAssetIds(richTextDocument) {
  if (!richTextDocument || !richTextDocument.content) {
    return [];
  }

  const assetIds = [];

  function traverse(nodes) {
    for (const node of nodes) {
      if (node.nodeType === 'embedded-asset-block') {
        const assetId = node.data?.target?.sys?.id;
        if (assetId && !assetIds.includes(assetId)) {
          assetIds.push(assetId);
        }
      }
      if (node.content) {
        traverse(node.content);
      }
    }
  }

  traverse(richTextDocument.content);
  return assetIds;
}

// Extract all entry IDs from rich text content
function extractEntryIds(richTextDocument) {
  if (!richTextDocument || !richTextDocument.content) {
    return [];
  }

  const entryIds = [];

  function traverse(nodes) {
    for (const node of nodes) {
      if (node.nodeType === 'embedded-entry-block') {
        const entryId = node.data?.target?.sys?.id;
        if (entryId && !entryIds.includes(entryId)) {
          entryIds.push(entryId);
        }
      }
      if (node.content) {
        traverse(node.content);
      }
    }
  }

  traverse(richTextDocument.content);
  return entryIds;
}

function extractTextFromNode(node) {
  if (!node.content) return '';
  
  return node.content.map(child => {
    if (child.nodeType === 'text') {
      let text = child.value;
      
      // Apply formatting marks
      if (child.marks) {
        child.marks.forEach(mark => {
          switch (mark.type) {
            case 'bold':
              text = `<strong>${text}</strong>`;
              break;
            case 'italic':
              text = `<em>${text}</em>`;
              break;
            case 'underline':
              text = `<u>${text}</u>`;
              break;
          }
        });
      }
      
      return text;
    } else if (child.nodeType === 'hyperlink') {
      const linkText = extractTextFromNode(child);
      return `<a href="${child.data.uri}">${linkText}</a>`;
    } else if (child.content) {
      return extractTextFromNode(child);
    }
    
    return '';
  }).join('');
}

// Convert blocks to WordPress content
function blocksToContent(blocks) {
  return blocks.map(block => {
    const attrs = block.attrs ? ` ${JSON.stringify(block.attrs)}` : '';
    return `<!-- wp:${block.blockName}${attrs} -->\n${block.innerHTML}\n<!-- /wp:${block.blockName} -->`;
  }).join('\n\n');
}

async function importPage(pageData) {
  try {
    console.log(`📄 Processing: ${pageData.title} (${pageData.slug})`);
    
    // Step 1: Extract all asset IDs and entry IDs from the page content
    const heroAssetIds = pageData.heroContent ? extractAssetIds(pageData.heroContent) : [];
    const bodyAssetIds = pageData.body ? extractAssetIds(pageData.body) : [];
    const allAssetIds = [...new Set([...heroAssetIds, ...bodyAssetIds])];

    const heroEntryIds = pageData.heroContent ? extractEntryIds(pageData.heroContent) : [];
    const bodyEntryIds = pageData.body ? extractEntryIds(pageData.body) : [];
    const allEntryIds = [...new Set([...heroEntryIds, ...bodyEntryIds])];

    // Step 2: Process assets - fetch from Contentful and upload to WordPress
    const assetMap = new Map();
    if (allAssetIds.length > 0) {
      console.log(`📸 Processing ${allAssetIds.length} images...`);
      
      for (const assetId of allAssetIds) {
        try {
          const assetData = await fetchContentfulAsset(assetId);
          if (assetData) {
            const wpMedia = await uploadAssetToWordPress(assetData);
            if (wpMedia) {
              assetMap.set(assetId, wpMedia);
            }
          }
        } catch (error) {
          console.error(`⚠️  Failed to process asset ${assetId}:`, error.message);
        }
      }
    }

    // Step 3: Process embedded entries - fetch from Contentful
    const entryMap = new Map();
    if (allEntryIds.length > 0) {
      console.log(`🔗 Processing ${allEntryIds.length} embedded components...`);
      
      for (const entryId of allEntryIds) {
        try {
          const entryData = await fetchContentfulEntry(entryId);
          if (entryData) {
            entryMap.set(entryId, entryData);
          }
        } catch (error) {
          console.error(`⚠️  Failed to process entry ${entryId}:`, error.message);
        }
      }
    }

    // Step 4: Convert rich text content to WordPress blocks (with asset and entry maps)
    const heroBlocks = pageData.heroContent ? await convertRichTextToBlocks(pageData.heroContent, assetMap, entryMap) : [];
    const bodyBlocks = pageData.body ? await convertRichTextToBlocks(pageData.body, assetMap, entryMap) : [];
    
    // Combine hero and body content
    const allBlocks = [...heroBlocks, ...bodyBlocks];
    const content = blocksToContent(allBlocks);
    
    // Prepare WordPress post data
    const postData = {
      title: pageData.title || `Corporate Page: ${pageData.slug}`,
      content: content,
      slug: pageData.slug,
      status: config.postStatus,
      type: config.postType,
      author: config.defaultAuthor,
      excerpt: pageData.description || '',
      meta: {
        // Store original Contentful data as meta
        contentful_id: pageData.id,
        contentful_category: pageData.category || '',
        contentful_page_type: pageData.pageType || '',
        contentful_content_bucket: pageData.contentBucket || '',
        contentful_sitemap_group: pageData.sitemapGroup || '',
        contentful_assets_imported: allAssetIds.length,
        contentful_components_imported: allEntryIds.length
      }
    };
    
    // Set SEO meta if noindex/nofollow are specified
    if (pageData.noindex === true || pageData.nofollow === true) {
      postData.meta.robots_meta = [];
      if (pageData.noindex === true) postData.meta.robots_meta.push('noindex');
      if (pageData.nofollow === true) postData.meta.robots_meta.push('nofollow');
    }
    
    // Make API request to WordPress
    const auth = Buffer.from(`${config.username}:${config.applicationPassword}`).toString('base64');
    
    // Determine the correct endpoint based on post type
    const endpoint = config.postType === 'post' ? 'posts' : `${config.postType}s`;
    
    const response = await axiosInstance.post(
      `${config.wpBaseUrl}/wp-json/wp/v2/${endpoint}`,
      postData,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`✅ Successfully imported: ${pageData.title} (ID: ${response.data.id}, ${allAssetIds.length} images, ${allEntryIds.length} components)`);
    return response.data;
    
  } catch (error) {
    console.error(`❌ Failed to import ${pageData.title}:`, error.response?.data || error.message);
    throw error;
  }
}

async function main() {
  try {
    // Validate configuration
    if (!config.applicationPassword) {
      console.error('❌ Missing WP_APPLICATION_PASSWORD in environment variables');
      console.log('\n📝 To set up Application Password:');
      console.log('1. Go to your WordPress Admin → Users → Your Profile');
      console.log('2. Scroll to "Application Passwords" section');
      console.log('3. Enter name: "Contentful Import"');
      console.log('4. Click "Add New Application Password"');
      console.log('5. Copy the generated password to your .env file');
      process.exit(1);
    }

    console.log(`🔧 Configuration:`);
    console.log(`   WordPress URL: ${config.wpBaseUrl}`);
    console.log(`   Username: ${config.username}`);
    console.log(`   Post Type: ${config.postType}`);
    console.log(`   Post Status: ${config.postStatus}`);
    console.log(`   Test Mode: ${config.testMode ? 'ON' : 'OFF'}`);
    if (config.testMode) {
      console.log(`   Test Page: ${config.testPageSlug}`);
    }
    console.log('');

    // Test WordPress connection
    console.log('🔗 Testing WordPress connection...');
    try {
      const auth = Buffer.from(`${config.username}:${config.applicationPassword}`).toString('base64');
      const testResponse = await axiosInstance.get(
        `${config.wpBaseUrl}/wp-json/wp/v2/users/me`,
        {
          headers: {
            'Authorization': `Basic ${auth}`
          }
        }
      );
      console.log(`✅ Connected as: ${testResponse.data.name} (ID: ${testResponse.data.id})`);
    } catch (error) {
      console.error('❌ WordPress connection failed:', error.response?.data || error.message);
      console.log('\n🔍 Common issues:');
      console.log('- Check if WordPress is running at:', config.wpBaseUrl);
      console.log('- Verify username and application password');
      console.log('- Ensure REST API is enabled');
      
      // Specific SSL suggestions
      if (error.message.includes('self-signed certificate') || error.code === 'CERT_HAS_EXPIRED') {
        console.log('- SSL Certificate issue detected');
        console.log('- Try using HTTP instead: http://memorycare.local');
        console.log('- Or trust the certificate in your browser first');
      }
      process.exit(1);
    }

    // Read the exported corporate pages data
    const corporatePages = JSON.parse(
      fs.readFileSync('../out/corporate_pages.json', 'utf8')
    );
    
    // Filter pages for test mode
    const pagesToImport = config.testMode 
      ? corporatePages.filter(page => page.slug === config.testPageSlug)
      : corporatePages;
    
    console.log(`🚀 Starting import of ${pagesToImport.length} corporate pages to WordPress...\n`);
    
    const results = [];
    
    // Import each page
    for (const page of pagesToImport) {
      if (page.found && page.id) {
        console.log(`📄 Importing: ${page.title} (${page.slug})`);
        
        try {
          const result = await importPage(page);
          results.push({ success: true, page: page.slug, wpId: result.id });
          
          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          results.push({ success: false, page: page.slug, error: error.message });
        }
      } else {
        console.log(`⚠️  Skipping ${page.slug} - not found in Contentful`);
        results.push({ success: false, page: page.slug, error: 'Not found in Contentful' });
      }
    }
    
    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n📊 Import Summary:`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (failed > 0) {
      console.log(`\n🔍 Failed imports:`);
      results.filter(r => !r.success).forEach(r => {
        console.log(`   - ${r.page}: ${r.error}`);
      });
    }
    
    // Save import log
    fs.writeFileSync(
      '../out/wp-import-log.json',
      JSON.stringify(results, null, 2)
    );
    
    console.log(`\n📝 Import log saved to: out/wp-import-log.json`);
    
  } catch (error) {
    console.error('💥 Import failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { importPage, convertRichTextToBlocks, fetchContentfulEntry, fetchContentfulAsset };
