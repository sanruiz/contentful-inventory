# GitHub Copilot Instructions

## Project Overview
This is a **comprehensive Contentful to WordPress migration tool** that imports complete content from Contentful entries (posts, pages, components) into WordPress. It includes specialized handling for table components through a custom plugin system, but supports full content migration workflows.

## Key Technologies
- **Node.js** with ES modules
- **WordPress REST API** with Application Password authentication
- **Contentful Management API**
- **WordPress Plugin** with shortcode system

## Project Structure
```
src/
├── contentful/     # Contentful API integration
├── wordpress/      # WordPress API integration  
├── migration/      # Migration orchestration scripts
└── utils/          # Utilities and helpers

wordpress-plugin/   # WordPress plugin files
docs/              # Documentation
```

## Important Context for AI Assistance

### Authentication Patterns
- WordPress uses Application Password authentication
- Contentful uses Management API tokens
- All credentials stored in `.env` file

### Data Flow
1. **Analyze** - Scan Contentful space for entries and content types
2. **Extract** - Process complete content structure (posts, pages, components)
3. **Transform** - Convert Contentful rich text to WordPress-compatible format
4. **Import** - Create WordPress posts/pages with proper metadata
5. **Process Components** - Handle special components (tables, media, etc.)
6. **Install Plugin** - Deploy WordPress plugin for component rendering
7. **Inject Content** - Embed processed content with shortcodes where needed
8. **Restore** - Ensure content integrity and fix any import issues

### Common Tasks
- **Full Migration**: `npm run migrate` - Complete content migration workflow
- **Content Analysis**: `npm run analyze` - Analyze Contentful space structure
- **Content Import**: Import posts, pages, and custom content types
- **Component Processing**: Handle tables, media, and rich text components
- **Plugin Management**: `npm run install-plugin` - WordPress plugin deployment
- **Content Restoration**: `npm run restore-content` - Fix content issues post-migration

### Code Patterns
- Use ES modules (`import`/`export`)
- Async/await for API calls
- Error handling with try/catch
- Fetch API for HTTP requests
- WordPress REST API endpoints: `/wp-json/wp/v2/`

### WordPress Integration
- Plugin creates shortcodes: `[contentful_table]` and `[contentful_toc]`
- Data stored in `/wp-content/contentful-tables/` directory
- Supports multiple storage methods (files, database, meta fields)

### Contentful Integration
- Fetches all content types and entries from Contentful space
- Processes rich text content with embedded references
- Handles assets (images, documents) and linked entries
- Supports `tableOfContents` and `dataVisualizationTable` types
- Converts Contentful document structure to WordPress format
- Preserves content relationships and metadata

## Development Guidelines
- Follow existing code patterns
- Use proper error handling
- Update documentation when adding features
- Test with local WordPress installation (Local by Flywheel)
- Keep migration scripts modular and reusable
