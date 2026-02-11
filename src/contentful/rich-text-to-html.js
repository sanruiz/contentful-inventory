#!/usr/bin/env node

/**
 * Contentful Rich Text to WordPress HTML Converter
 * 
 * Converts Contentful rich text document structure to clean WordPress HTML.
 * Handles all node types: headings, paragraphs, lists, links, images, 
 * embedded entries (tables/TOC), and text marks (bold, italic, underline).
 */

/**
 * Convert a Contentful rich text document to WordPress HTML
 * @param {Object} document - Contentful rich text document node
 * @param {Object} options - Conversion options
 * @param {Object} options.assets - Map of asset ID → asset data { url, title, fileName, contentType }
 * @param {Object} options.entries - Map of entry ID → entry data { contentType, title, fields }
 * @param {Function} options.resolveEntryUrl - Function to resolve entry URL from entry data
 * @param {Function} options.renderEmbeddedEntry - Custom renderer for embedded entries
 * @returns {string} WordPress-compatible HTML
 */
export function richTextToHtml(document, options = {}) {
  if (!document || document.nodeType !== 'document') {
    return '';
  }

  const {
    assets = {},
    entries = {},
    resolveEntryUrl = null,
    renderEmbeddedEntry = null,
  } = options;

  const context = { assets, entries, resolveEntryUrl, renderEmbeddedEntry };

  // Process nodes with sibling awareness — each node can see its siblings
  // for context (e.g., heading before a table determines the key filter)
  return document.content
    .map((node, index, siblings) => renderNode(node, context, siblings, index))
    .join('\n\n');
}

/**
 * Render a single rich text node to HTML
 * @param {Object} node - The node to render
 * @param {Object} context - Rendering context
 * @param {Array} siblings - Sibling nodes array (for context-aware rendering)
 * @param {number} index - Current index in siblings array
 */
function renderNode(node, context, siblings = null, index = -1) {
  switch (node.nodeType) {
    case 'paragraph':
      return renderParagraph(node, context);
    case 'heading-1':
    case 'heading-2':
    case 'heading-3':
    case 'heading-4':
    case 'heading-5':
    case 'heading-6':
      return renderHeading(node, context);
    case 'unordered-list':
      return renderList(node, 'ul', context);
    case 'ordered-list':
      return renderList(node, 'ol', context);
    case 'list-item':
      return renderListItem(node, context);
    case 'blockquote':
      return renderBlockquote(node, context);
    case 'hr':
      return '<hr />';
    case 'hyperlink':
      return renderHyperlink(node, context);
    case 'entry-hyperlink':
      return renderEntryHyperlink(node, context);
    case 'asset-hyperlink':
      return renderAssetHyperlink(node, context);
    case 'embedded-entry-block':
      return renderEmbeddedEntryBlock(node, context, siblings, index);
    case 'embedded-entry-inline':
      return renderEmbeddedEntryInline(node, context);
    case 'embedded-asset-block':
      return renderEmbeddedAssetBlock(node, context);
    case 'text':
      return renderText(node);
    case 'table':
      return renderTable(node, context);
    case 'table-row':
      return renderTableRow(node, context);
    case 'table-cell':
      return renderTableCell(node, 'td', context);
    case 'table-header-cell':
      return renderTableCell(node, 'th', context);
    default:
      console.warn(`⚠️  Unknown node type: ${node.nodeType}`);
      if (node.content) {
        return node.content.map(child => renderNode(child, context)).join('');
      }
      return '';
  }
}

/**
 * Render inline content (children of block nodes)
 */
function renderInlineContent(nodes, context) {
  if (!nodes || !Array.isArray(nodes)) return '';
  return nodes.map(node => renderNode(node, context)).join('');
}

/**
 * Render a text node with marks (bold, italic, etc.)
 */
function renderText(node) {
  let text = escapeHtml(node.value || '');

  if (!node.marks || node.marks.length === 0) {
    return text;
  }

  // Apply marks in order
  for (const mark of node.marks) {
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
      case 'code':
        text = `<code>${text}</code>`;
        break;
      case 'superscript':
        text = `<sup>${text}</sup>`;
        break;
      case 'subscript':
        text = `<sub>${text}</sub>`;
        break;
      default:
        console.warn(`⚠️  Unknown mark type: ${mark.type}`);
    }
  }

  return text;
}

/**
 * Render a paragraph node
 */
function renderParagraph(node, context) {
  const content = renderInlineContent(node.content, context);
  // Skip empty paragraphs
  if (!content.trim()) return '';
  return `<p>${content}</p>`;
}

/**
 * Render a heading node with auto-generated ID for anchor links
 */
function renderHeading(node, context) {
  const level = node.nodeType.split('-')[1];
  const content = renderInlineContent(node.content, context);
  const id = generateSlug(stripHtml(content));
  return `<h${level} id="${id}">${content}</h${level}>`;
}

/**
 * Render a list (ul or ol)
 */
function renderList(node, tag, context) {
  const items = node.content
    .map(child => renderNode(child, context))
    .join('\n');
  return `<${tag}>\n${items}\n</${tag}>`;
}

/**
 * Render a list item
 */
function renderListItem(node, context) {
  // List items can contain paragraphs or direct text
  const content = node.content
    .map(child => {
      if (child.nodeType === 'paragraph') {
        return renderInlineContent(child.content, context);
      }
      return renderNode(child, context);
    })
    .join('');
  return `<li>${content}</li>`;
}

/**
 * Render a blockquote
 */
function renderBlockquote(node, context) {
  const content = node.content
    .map(child => renderNode(child, context))
    .join('\n');
  return `<blockquote>\n${content}\n</blockquote>`;
}

/**
 * Render a hyperlink
 */
function renderHyperlink(node, context) {
  const url = node.data?.uri || '#';
  const content = renderInlineContent(node.content, context);
  
  // Add target="_blank" for external links
  const isExternal = url.startsWith('http') && !url.includes('memorycare');
  const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
  
  return `<a href="${escapeAttr(url)}"${attrs}>${content}</a>`;
}

/**
 * Render an entry hyperlink (link to another Contentful entry)
 */
function renderEntryHyperlink(node, context) {
  const entryId = node.data?.target?.sys?.id;
  const content = renderInlineContent(node.content, context);

  if (entryId && context.resolveEntryUrl) {
    const url = context.resolveEntryUrl(entryId, context.entries[entryId]);
    return `<a href="${escapeAttr(url)}">${content}</a>`;
  }

  // Fallback: link to Contentful entry or just render as text
  if (entryId && context.entries[entryId]?.slug) {
    return `<a href="/${context.entries[entryId].slug}">${content}</a>`;
  }

  return content;
}

/**
 * Render an asset hyperlink (link to a Contentful asset like a PDF)
 */
function renderAssetHyperlink(node, context) {
  const assetId = node.data?.target?.sys?.id;
  const content = renderInlineContent(node.content, context);
  const asset = context.assets[assetId];

  if (asset?.url) {
    const url = asset.url.startsWith('//') ? `https:${asset.url}` : asset.url;
    return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${content}</a>`;
  }

  return content;
}

/**
 * Detect the key filter value for a table by looking at the preceding heading.
 * 
 * In Contentful, tables with `selectedKey` are embedded multiple times in the same page,
 * each preceded by a heading (h3, h2, etc.) that implicitly identifies which rows to show.
 * The heading text contains one of the key column values as a word.
 * 
 * Strategy: Get the known key values from the entry's filters, then find which key value
 * appears as a word in the nearest preceding heading.
 * 
 * Example: key values = ["agency", "food", "equipment", "repair", "legal", "security", "utility", "veterans"]
 *   heading "Area Agency on Aging" contains "agency" → key = "agency"
 *   heading "Food Assistance Programs" contains "food" → key = "food"
 * 
 * @param {Object} entry - The resolved entry data
 * @param {Array} siblings - Sibling nodes in the rich text document
 * @param {number} index - Current node index in siblings
 * @returns {string|null} The key value to filter by, or null if no key filtering
 */
function detectTableKey(entry, siblings, index) {
  // Check if this table has key filtering configured
  const filters = entry.fields?.filters?.['en-US'] || {};
  const selectedKey = filters.selectedKey || [];
  if (selectedKey.length === 0) return null;

  // No sibling context available
  if (!siblings || index < 0) return null;

  // Walk backwards through siblings to find the nearest heading
  for (let i = index - 1; i >= 0; i--) {
    const sibling = siblings[i];
    const nt = sibling.nodeType;

    // Found a heading — extract text and match against known key values
    if (nt && nt.startsWith('heading-')) {
      const headingText = extractPlainText(sibling).toLowerCase();
      if (headingText) {
        // We don't know the actual key values at conversion time (they're in the CSV data),
        // so we store the heading slug and let the plugin do the matching at render time
        const headingSlug = headingText
          .replace(/[^a-z0-9\s]/g, '')
          .trim()
          .replace(/\s+/g, '-');
        return headingSlug;
      }
    }

    // If we hit another embedded-entry-block, stop looking (section boundary)
    if (nt === 'embedded-entry-block') break;
  }

  return null;
}

/**
 * Extract plain text from a rich text node (recursively)
 */
function extractPlainText(node) {
  if (!node) return '';
  if (node.value) return node.value;
  if (node.content) return node.content.map(extractPlainText).join('');
  return '';
}

/**
 * Render an embedded entry block (tables, TOC, etc.)
 * @param {Object} node - The embedded entry node
 * @param {Object} context - Rendering context
 * @param {Array} siblings - Sibling nodes for context-aware rendering
 * @param {number} index - Current index in siblings
 */
function renderEmbeddedEntryBlock(node, context, siblings = null, index = -1) {
  const entryId = node.data?.target?.sys?.id;

  if (!entryId) {
    return '<!-- Embedded entry: missing ID -->';
  }

  // Use custom renderer if provided
  if (context.renderEmbeddedEntry) {
    const result = context.renderEmbeddedEntry(entryId, context.entries[entryId]);
    if (result) return result;
  }

  const entry = context.entries[entryId];
  if (!entry) {
    return `<!-- Embedded entry: ${entryId} (not resolved) -->`;
  }

  // Handle known content types
  switch (entry.contentType) {
    case 'tableOfContents':
      return `[contentful_toc id="${entryId}"]`;

    case 'dataVisualizationTables': {
      // Check if this table has key-based filtering
      // The key value is derived from the nearest preceding heading
      const keyAttr = detectTableKey(entry, siblings, index);
      if (keyAttr) {
        return `[contentful_table id="${entryId}" key="${escapeAttr(keyAttr)}"]`;
      }
      return `[contentful_table id="${entryId}"]`;
    }

      case 'dataVisualizationCharts': {
          // Render chart as a shortcode for the WP plugin to process
          const chartTitle = entry.fields?.title?.['en-US'] || '';
          const vizType = entry.fields?.visualizationType?.['en-US'] || 'Bar Chart';
          return `[contentful_chart id="${entryId}" type="${escapeAttr(vizType)}" title="${escapeAttr(chartTitle)}"]`;
      }

      case 'dataVisualizationCards': {
          // Render cards as a shortcode for the WP plugin to process
          const cardTitle = entry.fields?.title?.['en-US'] || '';
          const cardType = entry.fields?.type?.['en-US'] || 'Summary';
          return `[contentful_cards id="${entryId}" type="${escapeAttr(cardType)}" title="${escapeAttr(cardTitle)}"]`;
      }

      case 'link': {
          // Render link component based on type
          const linkType = entry.fields?.type?.['en-US'] || '';
          const linkText = entry.fields?.linkText?.['en-US'] || entry.title || 'Learn More';
          const linkUrl = entry.fields?.url?.['en-US'] || entry.url || '';

          if (linkType === 'backtotop') {
              return `<p class="back-to-top"><a href="#top">↑ ${escapeHtml(linkText)}</a></p>`;
          }
          if (linkType === 'internal' && linkText) {
              // Internal link — try to resolve from slug or just use text
              return `<p><a href="/${generateSlug(linkText)}" class="wp-button">${escapeHtml(linkText)}</a></p>`;
          }
          if (linkUrl) {
              return `<p><a href="${escapeAttr(linkUrl)}" class="wp-button">${escapeHtml(linkText)}</a></p>`;
          }
          return `<!-- Link component: ${entryId} (type: ${linkType}) -->`;
      }

      case 'linkReference': {
          // Render as a list of links
          const refTitle = entry.fields?.title?.['en-US'] || '';
          const links = entry.fields?.links?.['en-US'] || [];
          if (links.length === 0) return `<!-- Link reference: ${entryId} (empty) -->`;

          let html = '';
          if (refTitle) html += `<h3>${escapeHtml(refTitle)}</h3>\n`;
          html += '<ul class="link-reference-list">\n';
          for (const linkRef of links) {
              const linkedId = linkRef?.sys?.id;
              const linkedEntry = linkedId ? context.entries[linkedId] : null;
              if (linkedEntry) {
                  const text = linkedEntry.fields?.linkText?.['en-US'] || linkedEntry.title || 'Link';
                  const url = linkedEntry.fields?.url?.['en-US'] || linkedEntry.url || '#';
                  html += `<li><a href="${escapeAttr(url)}">${escapeHtml(text)}</a></li>\n`;
              }
          }
          html += '</ul>';
          return html;
      }

      case 'navigationBlock': {
          // Navigation/linking module — render as navigation section
          const navName = entry.fields?.name?.['en-US'] || '';
          return `<!-- Navigation Block: ${escapeHtml(navName)} -->`;
      }

      case 'form': {
          // Contact form — render as a styled HTML form placeholder
          const formTitle = entry.fields?.title?.['en-US'] || 'Contact Form';
          const submitText = entry.fields?.submitText?.['en-US'] || 'Submit';
          return `[contentful_form id="${entryId}" title="${escapeAttr(formTitle)}" submit="${escapeAttr(submitText)}"]`;
      }

      case 'modalForm': {
          // CTA button that opens a modal form
          const modalTitle = entry.fields?.title?.['en-US'] || '';
          const buttonColor = entry.fields?.buttonColor?.['en-US'] || 'green';
          return `<div class="cta-button-container">
<a href="#contact" class="wp-button cta-button cta-${escapeAttr(buttonColor)}">${escapeHtml(modalTitle || 'Get Started')}</a>
</div>`;
      }

      case 'richText': {
          // Nested rich text block — recursively render if body content exists
          const rtBody = entry.fields?.body?.['en-US'];
          if (rtBody && rtBody.nodeType === 'document') {
              const nestedHtml = rtBody.content
                  .map(node => renderNode(node, context))
                  .join('\n\n');
              return `<div class="rich-text-block">\n${nestedHtml}\n</div>`;
          }
          const rtText = entry.fields?.text?.['en-US'] || entry.fields?.content?.['en-US'] || '';
          if (rtText) return `<div class="rich-text-block">${escapeHtml(rtText)}</div>`;
          return `<!-- Rich text block: ${entryId} (empty) -->`;
      }

      case 'image': {
          // Image component
          const imgTitle = entry.fields?.title?.['en-US'] || '';
          const imgAssetRef = entry.fields?.image?.['en-US'];
          if (imgAssetRef?.sys?.id) {
              const asset = context.assets[imgAssetRef.sys.id];
              if (asset?.url) {
                  const url = asset.url.startsWith('//') ? `https:${asset.url}` : asset.url;
                  return `<figure class="wp-block-image">
<img src="${escapeAttr(url)}" alt="${escapeAttr(imgTitle || asset.title || '')}" />
${imgTitle ? `<figcaption>${escapeHtml(imgTitle)}</figcaption>` : ''}
</figure>`;
              }
          }
          return `<!-- Image component: ${entryId} -->`;
      }

    default:
      return `<!-- Embedded entry: ${entryId} (type: ${entry.contentType}) -->`;
  }
}

/**
 * Render an embedded entry inline
 */
function renderEmbeddedEntryInline(node, context) {
  const entryId = node.data?.target?.sys?.id;
  const entry = context.entries[entryId];

    if (!entry) return `<!-- Inline entry: ${entryId} (not resolved) -->`;

    switch (entry.contentType) {
        case 'link': {
            const linkType = entry.fields?.type?.['en-US'] || '';
            const linkText = entry.fields?.linkText?.['en-US'] || entry.title || 'Link';
            const linkUrl = entry.fields?.url?.['en-US'] || entry.url || '';

            if (linkType === 'backtotop') {
                return `<a href="#top">↑ ${escapeHtml(linkText)}</a>`;
            }
            if (linkUrl) {
                return `<a href="${escapeAttr(linkUrl)}">${escapeHtml(linkText)}</a>`;
            }
            if (linkType === 'internal') {
                return `<a href="/${generateSlug(linkText)}">${escapeHtml(linkText)}</a>`;
            }
            return escapeHtml(linkText);
        }

        case 'modalForm': {
            const btnText = entry.fields?.title?.['en-US'] || 'Get Started';
            const btnColor = entry.fields?.buttonColor?.['en-US'] || 'green';
            return `<a href="#contact" class="wp-button cta-button cta-${escapeAttr(btnColor)}">${escapeHtml(btnText)}</a>`;
        }

      default:
          return `<!-- Inline entry: ${entryId} (type: ${entry.contentType}) -->`;
  }
}

/**
 * Render an embedded asset block (images, PDFs, etc.)
 */
function renderEmbeddedAssetBlock(node, context) {
  const assetId = node.data?.target?.sys?.id;
  const asset = context.assets[assetId];

  if (!asset) {
    return `<!-- Embedded asset: ${assetId} (not resolved) -->`;
  }

  const url = asset.url?.startsWith('//') ? `https:${asset.url}` : asset.url;

  // Handle images
  if (asset.contentType?.startsWith('image/')) {
    const alt = escapeAttr(asset.title || asset.fileName || '');
    return `<figure class="wp-block-image">
<img src="${escapeAttr(url)}" alt="${alt}" />
${asset.title ? `<figcaption>${escapeHtml(asset.title)}</figcaption>` : ''}
</figure>`;
  }

  // Handle PDFs and other documents
  if (asset.contentType === 'application/pdf') {
    const title = asset.title || asset.fileName || 'Download PDF';
    return `<p><a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" class="wp-block-file">📄 ${escapeHtml(title)}</a></p>`;
  }

  // Generic file download
  const title = asset.title || asset.fileName || 'Download file';
  return `<p><a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">📎 ${escapeHtml(title)}</a></p>`;
}

/**
 * Render a table node
 */
function renderTable(node, context) {
  const rows = node.content
    .map(child => renderNode(child, context))
    .join('\n');
  return `<table class="wp-block-table">\n<tbody>\n${rows}\n</tbody>\n</table>`;
}

/**
 * Render a table row
 */
function renderTableRow(node, context) {
  const cells = node.content
    .map(child => renderNode(child, context))
    .join('');
  return `<tr>${cells}</tr>`;
}

/**
 * Render a table cell (td or th)
 */
function renderTableCell(node, tag, context) {
  const content = node.content
    .map(child => {
      if (child.nodeType === 'paragraph') {
        return renderInlineContent(child.content, context);
      }
      return renderNode(child, context);
    })
    .join('');

  const attrs = [];
  if (node.data?.colspan && node.data.colspan > 1) attrs.push(`colspan="${node.data.colspan}"`);
  if (node.data?.rowspan && node.data.rowspan > 1) attrs.push(`rowspan="${node.data.rowspan}"`);

  const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
  return `<${tag}${attrStr}>${content}</${tag}>`;
}

// ─── Utility Functions ───────────────────────────────────────────────

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Escape attribute values
 */
function escapeAttr(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Strip HTML tags from text
 */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Generate a URL-friendly slug from text
 */
function generateSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export default richTextToHtml;
