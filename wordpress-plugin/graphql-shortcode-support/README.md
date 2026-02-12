# GraphQL Shortcode Support

**Version**: 1.0.0  
**Requires**: WordPress 6.5+, PHP 8.2+, [WPGraphQL](https://www.wpgraphql.com/)  
**License**: PolyForm-Noncommercial-1.0.0

## Description

A WordPress plugin that applies `do_shortcode()` to WPGraphQL content fields. When content contains shortcodes like `[contentful_table]`, `[contentful_toc]`, `[contentful_chart]`, etc., they are rendered as HTML in GraphQL responses instead of being returned as raw shortcode text.

## Features

- **Automatic Processing**: Filters the `content` field to render shortcodes as HTML (can be toggled on/off).
- **Dedicated `renderedContent` Field**: Registers a new GraphQL field with explicit shortcode processing (always available).
- **Raw Content Mode**: Disable automatic processing to return raw shortcode text in `content`, while `renderedContent` still provides processed output.
- **Configurable Post Types**: Choose which post types get shortcode processing (default: `post`, `page`, `community`).
- **Configurable Fields**: Choose which GraphQL fields to process.
- **Admin UI**: Settings page under **Tools → GraphQL Shortcodes**.
- **Performance**: Only processes content that actually contains shortcode brackets.
- **SilverAssist Standards**: Built with PSR-4, LoadableInterface, WPCS, PHPStan Level 8.

## Requirements

- WordPress 6.5+
- PHP 8.2+
- [WPGraphQL](https://www.wpgraphql.com/) plugin (active)
- [Contentful Tables](../contentful-tables.php) plugin (for shortcode rendering)

## Installation

1. Copy the `graphql-shortcode-support/` folder to `wp-content/plugins/`.
2. Run `composer install` inside the plugin directory.
3. Activate the plugin in WordPress Admin → Plugins.
4. Configure settings at **Tools → GraphQL Shortcodes**.

## Usage

### Mode 1: Automatic Processing Enabled (default)

When **Enable Processing** is checked, the `content` field is automatically processed through `do_shortcode()`. Your existing queries work without changes:

```graphql
{
  posts {
    nodes {
      title
      content           # ← Shortcodes rendered as HTML automatically
      renderedContent    # ← Also available (always processed)
    }
  }
}
```

### Mode 2: Raw Content (processing disabled)

When **Enable Processing** is unchecked, the `content` field returns raw shortcode text. Use `renderedContent` to get processed output on demand:

```graphql
{
  posts {
    nodes {
      title
      content           # ← Raw shortcode text (e.g. [contentful_table id="..."])
      renderedContent    # ← Shortcodes rendered as HTML (always available)
    }
  }
}
```

> **Note:** The `renderedContent` field is always registered regardless of the toggle, so you can always query it explicitly for processed output.

### Community Post Type

Works with the Community custom post type:

```graphql
{
  communities {
    nodes {
      title
      content
      renderedContent
    }
  }
}
```

## Configuration

Navigate to **Tools → GraphQL Shortcodes** in the WordPress admin:

| Setting | Description | Default |
|---------|-------------|---------|
| Enable Processing | Apply `do_shortcode()` automatically to the `content` field. When disabled, `content` returns raw text but `renderedContent` remains available. | ✅ Enabled |
| Post Types | Which post types to process | post, page, community |
| GraphQL Fields | Which fields to apply `do_shortcode()` to | content |

## Supported Shortcodes

This plugin processes any registered shortcode. It's designed to work with:

- `[contentful_table id="..."]` — Data tables
- `[contentful_toc]` — Table of contents
- `[contentful_chart id="..."]` — Charts and visualizations
- `[contentful_cards id="..."]` — Card components
- `[contentful_form id="..."]` — Forms

## Architecture

```
graphql-shortcode-support/
├── graphql-shortcode-support.php    # Main plugin file
├── composer.json                     # Composer config & PSR-4
├── phpcs.xml                         # WPCS configuration
├── phpstan.neon                      # PHPStan Level 8
├── README.md
└── includes/
    ├── Core/
    │   ├── Interfaces/
    │   │   └── LoadableInterface.php # Component contract
    │   ├── Plugin.php                # Singleton bootstrap
    │   └── Activator.php            # Activation/deactivation
    ├── Service/
    │   └── GraphQLShortcodeResolver.php  # Core shortcode resolver
    └── Admin/
        └── SettingsPage.php         # Admin settings UI
```

## Development

```bash
# Install dependencies.
composer install

# Run quality checks.
composer phpcs      # WordPress Coding Standards
composer phpstan    # Static analysis (Level 8)
composer phpunit    # PHPUnit tests

# Auto-fix code style.
composer phpcbf
```

## Changelog

### 1.0.0 - 2026-02-11

#### Added
- Initial release.
- Automatic `do_shortcode()` processing for GraphQL content fields.
- Dedicated `renderedContent` GraphQL field.
- Admin settings page under Tools menu.
- Support for post, page, and community post types.
- PSR-4 autoloading with SilverAssist standards.
