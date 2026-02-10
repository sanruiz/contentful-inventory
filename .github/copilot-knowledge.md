# Copilot Knowledge Base

## Project Context
This repository contains a **professional migration tool** for importing complete Contentful content (posts, pages, media, components) into WordPress with specialized shortcode handling for complex components.

## Architecture Overview

### Core Components
1. **Contentful Integration** (`src/contentful/`)
   - Extract complete content structure from Contentful entries
   - Process posts, pages, media assets, and components
   - Handle rich text with embedded references and links
   - Special processing for `tableOfContents` and `dataVisualizationTable` components
   - Generate JSON exports for WordPress consumption

2. **WordPress Integration** (`src/wordpress/`)
   - REST API client with Application Password auth
   - Create/update posts and pages with full content
   - Handle media uploads and asset management
   - Automated plugin installation and activation
   - Content injection with shortcode embedding for special components

3. **Migration Engine** (`src/migration/`)
   - Orchestrates full content migration workflow
   - Processes different Contentful content types
   - Maintains content relationships and metadata
   - Multiple storage strategies (files/database/meta)
   - Content restoration and error recovery

4. **WordPress Plugin** (`wordpress-plugin/`)
   - Renders shortcodes: `[contentful_table id="..."]` and `[contentful_toc id="..."]`
   - File-based data loading from `wp-content/contentful-tables/`
   - Supports both table types with proper formatting
   - Integrates with WordPress content management workflow

## API Endpoints Used

### WordPress REST API
- `GET /wp-json/wp/v2/posts` - List posts
- `POST /wp-json/wp/v2/posts` - Create posts
- `PUT /wp-json/wp/v2/posts/{id}` - Update posts
- `GET /wp-json/wp/v2/pages` - List pages
- `POST /wp-json/wp/v2/pages` - Create pages
- `POST /wp-json/wp/v2/media` - Upload media files
- `GET /wp-json/wp/v2/plugins` - List plugins
- `POST /wp-json/wp/v2/plugins` - Install plugins

### Contentful Management API
- `GET /spaces/{spaceId}/entries` - Fetch entries
- `GET /spaces/{spaceId}/entries/{entryId}` - Get specific entry
- `GET /spaces/{spaceId}/content_types` - Get content type definitions
- `GET /spaces/{spaceId}/assets` - Fetch media assets
- Content type filtering for posts, pages, and components

## Environment Variables
```bash
# Contentful
CONTENTFUL_SPACE_ID=your_space_id
CONTENTFUL_ACCESS_TOKEN=your_management_token

# WordPress
WORDPRESS_URL=https://your-site.local
WORDPRESS_USERNAME=your_username
WORDPRESS_APP_PASSWORD=your_app_password
```

## Common Debugging Patterns

### WordPress Connection Issues
```javascript
// Test WordPress connectivity
const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/users/me`, {
    headers: {
        'Authorization': `Basic ${Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64')}`
    }
});
```

### Contentful Data Extraction
```javascript
// Extract all content from entry including rich text
const processContentfulEntry = (entry) => {
    const content = entry.fields.content?.['en-US'];
    const title = entry.fields.title?.['en-US'];
    const slug = entry.fields.slug?.['en-US'];
    
    // Process rich text content
    if (content?.nodeType === 'document') {
        return processRichTextContent(content);
    }
    
    // Extract table components
    const tables = content?.content?.filter(item => 
        item.nodeType === 'embedded-entry-block' &&
        (item.data.target.sys.contentType.sys.id === 'tableOfContents' ||
         item.data.target.sys.contentType.sys.id === 'dataVisualizationTable')
    ) || [];
    
    return { title, slug, content, tables };
};
```

### WordPress Content Creation
```javascript
// Create WordPress post with full content
const createWordPressPost = async (contentfulEntry) => {
    const postData = {
        title: contentfulEntry.title,
        content: convertRichTextToHTML(contentfulEntry.content),
        status: 'publish',
        slug: contentfulEntry.slug,
        meta: {
            contentful_id: contentfulEntry.sys.id,
            contentful_updated: contentfulEntry.sys.updatedAt
        }
    };
    
    // Embed shortcodes for table components
    if (contentfulEntry.tables.length > 0) {
        postData.content = embedTableShortcodes(postData.content, contentfulEntry.tables);
    }
    
    const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`
        },
        body: JSON.stringify(postData)
    });
    
    return response.json();
};
```

## Error Handling Patterns
- Always wrap API calls in try/catch
- Log detailed error information for debugging
- Provide graceful fallbacks for missing data
- Use descriptive error messages

## Testing Approach
- Use Local by Flywheel for WordPress development
- Test with complete Contentful content structure
- Verify post/page creation and content rendering
- Check plugin activation and shortcode rendering
- Test media upload and asset handling
- Validate content relationships and metadata preservation
- Check post content preservation during migration

## Performance Considerations
- Batch API requests when possible
- Cache Contentful data during processing
- Handle large content volumes efficiently
- Use efficient WordPress query patterns
- Optimize media upload processes
- Monitor memory usage during large migrations
- Implement progress tracking for long operations
