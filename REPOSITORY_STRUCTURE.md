# Project Structure Overview

## 📁 Repository Organization

```
contentful-inventory/
├── 📂 .github/                      # GitHub configuration and Copilot docs
│   ├── copilot-instructions.md      # GitHub Copilot guidance
│   ├── copilot-knowledge.md         # Project knowledge base
│   └── copilot-workspace-rules.md   # Code style and patterns
│
├── 📂 src/                          # Source code (organized by functionality)
│   ├── 📂 contentful/               # Contentful API integration
│   │   ├── analyze-components.js     # Analyze content for tables
│   │   ├── extract-tables.js        # Extract table data
│   │   ├── fetch-complete-table.js  # Fetch individual tables
│   │   ├── fetch-tables.js          # Batch fetch tables
│   │   ├── generate-export.js       # Generate exports
│   │   └── table-processor.js       # Process table data
│   │
│   ├── 📂 wordpress/                # WordPress API integration
│   │   ├── api-updater.js           # WordPress REST API updates
│   │   ├── install-plugin.js       # Auto plugin installation
│   │   └── table-injector.js        # Inject tables into posts
│   │
│   ├── 📂 migration/                # Migration orchestration
│   │   ├── analyze-tables.js        # Analysis entry point
│   │   ├── database-insert.js       # Database storage method
│   │   ├── direct-import.js         # Direct WordPress import
│   │   ├── headless-importer.js     # Headless WordPress import
│   │   ├── meta-storage.js          # Meta field storage method
│   │   ├── migrate-content.js       # Main migration script
│   │   ├── restore-all-posts.js     # Restore post content
│   │   ├── restore-content.js       # Content restoration entry point
│   │   ├── restore-post-content.js  # Individual post restoration
│   │   └── restore-remaining-posts.js # Batch restoration
│   │
│   └── 📂 utils/                    # Utilities and helpers
│       ├── check-posts.js           # Check WordPress posts
│       ├── debug-posts.js           # Debug WordPress connection
│       ├── fix-content.js           # Fix content issues
│       ├── quick-update.js          # Quick update utilities
│       └── test-connection.js       # Test WordPress connection
│
├── 📂 wordpress-plugin/             # WordPress Plugin
│   ├── contentful-tables.php        # Main plugin file
│   ├── legacy-plugin.php           # Legacy version
│   └── legacy-tables.php           # Legacy tables plugin
│
├── 📂 docs/                         # Documentation
│   ├── COMPONENT_MIGRATION_SUMMARY.md
│   ├── installation.md             # Installation guide
│   ├── legacy-readme.md            # Original README
│   ├── plugin-installation-guide.md
│   └── plugin.md                   # Plugin documentation
│
├── 📂 examples/                     # Example configurations (empty, for future)
├── 📂 out/                          # Generated exports and outputs
├── 📂 temp/                         # Temporary development files
└── 📂 scripts/                      # Legacy scripts (maintained for compatibility)
```

## 🚀 NPM Scripts

### Main Commands
- `npm run migrate` - Complete migration workflow
- `npm run analyze` - Analyze Contentful content
- `npm run extract-tables` - Extract table data
- `npm run install-plugin` - Install WordPress plugin
- `npm run test-connection` - Test WordPress connectivity
- `npm run restore-content` - Restore post content

### Development Commands
- `npm run inventory` - Generate content inventory
- `npm run build` - Build TypeScript
- `npm run dev` - Development mode
- `npm run clean` - Clean output directories

## 📋 Migration Workflow

1. **Setup** - Configure environment variables
2. **Analyze** - Identify Contentful tables and content
3. **Extract** - Process table data for WordPress
4. **Install** - Deploy WordPress plugin
5. **Migrate** - Transfer content to WordPress
6. **Restore** - Fix post content with embedded shortcodes

## 🔧 Key Features

- **Modular Architecture** - Organized by functionality
- **Multiple Storage Options** - Files, database, or meta fields
- **Automated Pipeline** - One-command migration
- **Comprehensive Docs** - Installation and usage guides
- **Plugin System** - Complete WordPress integration
- **Error Handling** - Robust error management and recovery

## 📖 Quick Start

```bash
# 1. Install
git clone https://github.com/sanruiz/contentful-inventory.git
cd contentful-inventory
npm install

# 2. Configure
cp .env.example .env
# Edit .env with your credentials

# 3. Migrate
npm run migrate
```

## 🎯 Next Steps

This repository is now organized as a professional migration tool that can be:

1. **Reused** for multiple Contentful → WordPress migrations
2. **Extended** with new content types and migration strategies
3. **Maintained** with clear separation of concerns
4. **Documented** for easy onboarding and troubleshooting
5. **Shared** with proper licensing and contribution guidelines
