# Community Listings CPT

**Version:** 2.0.0  
**Requires PHP:** 8.2+  
**Requires WordPress:** 6.5+  
**License:** PolyForm-Noncommercial-1.0.0

## Description

Registers a hierarchical "Community" custom post type for state and city memory care listings. Includes REST API filtering and WPGraphQL support with shortcode rendering.

## Architecture

Follows **SilverAssist WordPress Plugin Development Standards v2.0.0** with PSR-4 autoloading and priority-based component loading.

### Directory Structure

```
community-listings/
├── community-listings.php             # Main plugin file (constants, autoloader, hooks)
├── composer.json                      # Composer config with PSR-4 autoload
├── phpcs.xml                          # WPCS configuration
├── phpstan.neon                       # PHPStan Level 8 configuration
├── includes/
│   ├── Core/
│   │   ├── Activator.php              # Activation/deactivation handlers
│   │   ├── Interfaces/
│   │   │   └── LoadableInterface.php  # Component contract
│   │   └── Plugin.php                 # Singleton bootstrap
│   └── Service/
│       ├── CptRegistrar.php           # CPT + meta field registration (priority 10)
│       ├── GraphQLResolver.php        # WPGraphQL do_shortcode() (priority 20)
│       └── RestApiFilters.php         # REST API query filters (priority 20)
```

### Component Loading Order

| Priority | Component       | Responsibility                        |
|----------|-----------------|---------------------------------------|
| 10       | CptRegistrar    | Register CPT and meta fields          |
| 20       | RestApiFilters  | REST API query params and filtering   |
| 20       | GraphQLResolver | Apply do_shortcode() to GraphQL       |

## Installation

```bash
cd community-listings
composer install
```

Activate the plugin in WordPress admin or via WP-CLI:

```bash
wp plugin activate community-listings
```

## Custom Post Type

- **Post Type:** `community`
- **REST Base:** `/wp-json/wp/v2/community`
- **Hierarchical:** Yes (state → city)
- **Slug:** `/communities/`

### Meta Fields

| Field              | Type    | Description                      |
|--------------------|---------|----------------------------------|
| contentful_id      | string  | Contentful entry ID              |
| listing_type       | string  | "state" or "city"                |
| state_short        | string  | State abbreviation (e.g., TX)    |
| state_long         | string  | State slug (e.g., texas)         |
| original_slug      | string  | Original Contentful slug         |
| original_url       | string  | Old memorycare.com URL           |
| content_bucket     | string  | Content bucket identifier        |
| sitemap_group      | string  | Sitemap group identifier         |
| link_text          | string  | Display name                     |
| hero_text_contrast | boolean | Hero text contrast flag          |
| noindex            | boolean | SEO noindex flag                 |
| nofollow           | boolean | SEO nofollow flag                |

## REST API Filtering

```
GET /wp-json/wp/v2/community?listing_type=state
GET /wp-json/wp/v2/community?state_short=TX
GET /wp-json/wp/v2/community?state_long=texas
```

## WPGraphQL Integration

The plugin applies `do_shortcode()` to `content` and `excerpt` fields on the Community type.

A dedicated `renderedContent` field is also registered:

```graphql
{
  communities {
    nodes {
      title
      renderedContent
    }
  }
}
```
