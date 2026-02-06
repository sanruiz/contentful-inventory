/**
 * Convert Contentful corporate pages to WordPress CSV import format
 * 
 * This script converts the rich text content to HTML and creates a CSV
 * that can be imported using WordPress CSV import plugins like:
 * - WP All Import
 * - CSV Importer
 * - Ultimate Member Import
 */

const fs = require('fs');

function convertRichTextToHtml(richTextDocument) {
  if (!richTextDocument || !richTextDocument.content) {
    return '';
  }

  let html = '';
  
  richTextDocument.content.forEach(node => {
    switch (node.nodeType) {
      case 'paragraph':
        const text = extractHtmlFromNode(node);
        if (text.trim()) {
          html += `<p>${text}</p>\n`;
        }
        break;
        
      case 'heading-2':
        html += `<h2>${extractHtmlFromNode(node)}</h2>\n`;
        break;
        
      case 'heading-3':
        html += `<h3>${extractHtmlFromNode(node)}</h3>\n`;
        break;
        
      case 'heading-4':
        html += `<h4>${extractHtmlFromNode(node)}</h4>\n`;
        break;
        
      case 'unordered-list':
        const listItems = node.content.map(item => {
          return `<li>${extractHtmlFromNode(item)}</li>`;
        }).join('\n');
        html += `<ul>\n${listItems}\n</ul>\n`;
        break;
        
      case 'ordered-list':
        const orderedItems = node.content.map(item => {
          return `<li>${extractHtmlFromNode(item)}</li>`;
        }).join('\n');
        html += `<ol>\n${orderedItems}\n</ol>\n`;
        break;
    }
  });
  
  return html;
}

function extractHtmlFromNode(node) {
  if (!node.content) return '';
  
  return node.content.map(child => {
    if (child.nodeType === 'text') {
      let text = escapeHtml(child.value);
      
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
      const linkText = extractHtmlFromNode(child);
      return `<a href="${escapeHtml(child.data.uri)}">${linkText}</a>`;
    } else if (child.content) {
      return extractHtmlFromNode(child);
    }
    
    return '';
  }).join('');
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function escapeCsv(text) {
  if (text == null) return '';
  const str = String(text);
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function main() {
  try {
    // Read the exported corporate pages data
    const corporatePages = JSON.parse(
      fs.readFileSync('../out/corporate_pages.json', 'utf8')
    );
    
    console.log(`Converting ${corporatePages.length} pages to WordPress CSV format...`);
    
    // CSV headers for WordPress import
    const headers = [
      'post_title',
      'post_content',
      'post_excerpt', 
      'post_status',
      'post_type',
      'post_name', // slug
      'menu_order',
      'post_date',
      'comment_status',
      'ping_status',
      'meta:contentful_id',
      'meta:contentful_category',
      'meta:contentful_page_type',
      'meta:contentful_content_bucket',
      'meta:contentful_sitemap_group',
      'meta:seo_noindex',
      'meta:seo_nofollow'
    ];
    
    const csvRows = [headers.join(',')];
    
    corporatePages.forEach(page => {
      if (page.found && page.id) {
        // Convert rich text to HTML
        const heroHtml = page.heroContent ? convertRichTextToHtml(page.heroContent) : '';
        const bodyHtml = page.body ? convertRichTextToHtml(page.body) : '';
        const fullContent = [heroHtml, bodyHtml].filter(Boolean).join('\n\n');
        
        // Prepare row data
        const rowData = [
          page.title || `Corporate Page: ${page.slug}`,
          fullContent,
          page.description || '',
          'draft', // post_status - change to 'publish' if needed
          'page', // post_type
          page.slug,
          0, // menu_order
          new Date().toISOString().slice(0, 19).replace('T', ' '), // post_date
          'closed', // comment_status
          'closed', // ping_status
          page.id,
          page.category || '',
          page.pageType || '',
          page.contentBucket || '',
          page.sitemapGroup || '',
          page.noindex === true ? '1' : '0',
          page.nofollow === true ? '1' : '0'
        ];
        
        // Escape and join row
        const csvRow = rowData.map(field => escapeCsv(field)).join(',');
        csvRows.push(csvRow);
        
        console.log(`✅ Processed: ${page.title} (${page.slug})`);
      } else {
        console.log(`⚠️  Skipped: ${page.slug} - not found in Contentful`);
      }
    });
    
    // Write CSV file
    const csvContent = csvRows.join('\n');
    fs.writeFileSync('../out/wordpress-import.csv', csvContent, 'utf8');
    
    console.log(`\n📄 WordPress CSV import file created: out/wordpress-import.csv`);
    console.log(`📝 ${csvRows.length - 1} pages ready for import`);
    
    // Create import instructions
    const instructions = `
# WordPress Import Instructions

## Method 1: Using WP All Import Plugin

1. Install WP All Import plugin in WordPress
2. Go to All Import > New Import
3. Upload the file: wordpress-import.csv
4. Map the CSV columns to WordPress fields:
   - post_title → Post Title
   - post_content → Post Content
   - post_excerpt → Post Excerpt
   - post_status → Post Status
   - post_type → Post Type
   - post_name → Post Slug
   - meta fields → Custom Fields
5. Run the import

## Method 2: Using WordPress CSV Importer

1. Install "CSV Importer" plugin
2. Go to Tools > Import > CSV
3. Upload wordpress-import.csv
4. Map columns and import

## Method 3: Manual Custom Script

Use the wp-import.js script for more control over the import process.

## Post-Import Steps

1. Review imported pages in WordPress admin
2. Update page statuses from 'draft' to 'publish' when ready
3. Set up proper menu structure
4. Configure SEO settings based on meta fields
5. Test all internal links and formatting

## Troubleshooting

- If content appears garbled, ensure your WordPress database uses UTF-8 encoding
- Large content blocks might hit WordPress limits - consider splitting long pages
- Test with one page first before importing all
`;
    
    fs.writeFileSync('../out/wordpress-import-instructions.md', instructions, 'utf8');
    console.log(`📋 Import instructions saved: out/wordpress-import-instructions.md`);
    
  } catch (error) {
    console.error('💥 Conversion failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { convertRichTextToHtml };
