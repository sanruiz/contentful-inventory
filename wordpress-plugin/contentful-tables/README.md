# Contentful Tables

**Version:** 4.0.0  
**Requires PHP:** 8.2+  
**Requires WordPress:** 6.5+  
**License:** PolyForm-Noncommercial-1.0.0

## Description

Displays Contentful content components (tables, charts, cards, forms, table-of-contents) using shortcodes. Includes WPGraphQL integration for headless WordPress setups.

## Architecture

Follows **SilverAssist WordPress Plugin Development Standards v2.0.0** with PSR-4 autoloading and priority-based component loading.

### Directory Structure

```
contentful-tables/
├── contentful-tables.php              # Main plugin file (constants, autoloader, hooks)
├── composer.json                      # Composer config with PSR-4 autoload
├── phpcs.xml                          # WPCS configuration
├── phpstan.neon                       # PHPStan Level 8 configuration
├── includes/
│   ├── Admin/
│   │   └── SettingsPage.php           # Admin settings page (priority 30)
│   ├── Core/
│   │   ├── Activator.php              # Activation/deactivation handlers
│   │   ├── Interfaces/
│   │   │   └── LoadableInterface.php  # Component contract
│   │   └── Plugin.php                 # Singleton bootstrap
│   ├── Service/
│   │   ├── GraphQLResolver.php        # WPGraphQL do_shortcode() (priority 20)
│   │   ├── ShortcodeRegistrar.php     # Shortcode registration (priority 20)
│   │   └── TableDataLoader.php        # Data loading service (priority 10)
│   ├── Utils/
│   │   ├── CsvParser.php              # CSV parsing utility
│   │   └── Helpers.php                # Shared helper methods
│   └── View/
│       ├── CardsRenderer.php          # Cards grid HTML renderer
│       ├── ChartRenderer.php          # Chart HTML renderer
│       ├── FormRenderer.php           # Form HTML renderer
│       ├── TableRenderer.php          # Data table HTML renderer
│       └── TocRenderer.php            # Table of contents HTML renderer
└── assets/
    └── contentful-tables.css          # Optional external stylesheet
```

### Component Loading Order

| Priority | Component           | Responsibility                     |
|----------|---------------------|------------------------------------|
| 10       | TableDataLoader     | Load data from JSON/CSV/DB/meta    |
| 20       | ShortcodeRegistrar  | Register all shortcodes + styles   |
| 20       | GraphQLResolver     | Apply do_shortcode() to GraphQL    |
| 30       | SettingsPage        | Admin settings UI                  |

## Installation

```bash
cd contentful-tables
composer install
```

Activate the plugin in WordPress admin or via WP-CLI:

```bash
wp plugin activate contentful-tables
```

## Shortcodes

| Shortcode                        | Description              |
|----------------------------------|--------------------------|
| `[contentful_table id="..."]`    | Render a data table      |
| `[contentful_toc id="..."]`      | Render table of contents |
| `[contentful_chart id="..."]`    | Render a chart           |
| `[contentful_cards id="..."]`    | Render a card grid       |
| `[contentful_form id="..."]`     | Render a contact form    |

### Table Filtering

```
[contentful_table id="..." filters="food"]
[contentful_table id="..." filters="food,agency"]
```

## WPGraphQL Integration

The plugin automatically applies `do_shortcode()` to `content` and `excerpt` fields for Post, Page, and Community types.

A dedicated `renderedContent` field is also registered:

```graphql
{
  posts {
    nodes {
      title
      renderedContent
    }
  }
}
```

## Data Sources

Tables are loaded in this order:

1. **JSON/CSV files** in `wp-content/contentful-tables/`
2. **WordPress post meta** (`contentful_table_*` keys)
3. **Database table** (`wp_contentful_tables`)

Charts load from `wp-content/contentful-charts/` and cards from `wp-content/contentful-cards/`.
