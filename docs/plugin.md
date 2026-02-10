# WordPress Plugin Documentation

The Contentful Tables WordPress plugin provides shortcode functionality for rendering tables extracted from Contentful.

## Features

- **Shortcode Support**: Render tables using `[contentful-table]` shortcodes
- **Multiple Data Sources**: File-based, database, or post meta storage
- **Responsive Design**: Mobile-friendly table rendering
- **Admin Interface**: Easy configuration and management
- **Customizable Styling**: Built-in CSS with customization options

## Installation

### Automatic Installation

```bash
npm run install-plugin
```

### Manual Installation

1. Copy plugin files:
   ```bash
   cp -r wordpress-plugin/* /path/to/wp-content/plugins/contentful-tables/
   ```

2. Copy table data:
   ```bash
   cp out/tables/*.json /path/to/wp-content/contentful-tables/
   ```

3. Activate plugin in WordPress admin

## Usage

### Basic Shortcode

```
[contentful-table id="table_id_here"]
```

### Shortcode Options

- **id** (required): The Contentful table ID
- **class** (optional): Custom CSS class
- **title** (optional): Override table title

### Examples

```
<!-- Basic usage -->
[contentful-table id="XBIbkCm53nytLcsPx3jlw"]

<!-- With custom styling -->
[contentful-table id="3JnIHQENe4ZtihjpWwphGI" class="my-custom-table"]

<!-- With custom title -->
[contentful-table id="408uTkJfTRYN5S7SCmIC5t" title="Custom Table Title"]
```

## Admin Interface

### Settings Page

Access plugin settings at **Settings → Contentful Tables**.

The admin page shows:
- Number of tables loaded
- Data source (files, database, or post meta)
- List of available tables with shortcodes
- Plugin configuration options

### Available Tables

Each table displays:
- **Table ID**: Unique identifier
- **Type**: Table of Contents or Data Visualization Table
- **Title**: Display name
- **Shortcode**: Copy-paste ready shortcode

## Data Sources

The plugin supports multiple data storage methods:

### 1. File-Based (Recommended)

- **Location**: `/wp-content/contentful-tables/`
- **Format**: JSON files named by table ID
- **Pros**: Fast loading, easy backup
- **Cons**: Files need manual upload

### 2. WordPress Database

- **Table**: `wp_contentful_tables`
- **Pros**: Integrated with WordPress
- **Cons**: Requires database access

### 3. Post Meta Fields

- **Storage**: WordPress post meta
- **Format**: JSON in meta fields
- **Pros**: Uses WordPress native storage
- **Cons**: Can be slow with many tables

## Customization

### CSS Styling

The plugin includes responsive CSS. To customize:

1. **Disable plugin CSS** in Settings → Contentful Tables
2. **Add custom styles** to your theme:

```css
/* Table of Contents */
.contentful-table-of-contents {
    background: #f9f9f9;
    border: 1px solid #ddd;
    padding: 20px;
    margin: 20px 0;
}

/* Data Tables */
.contentful-table {
    width: 100%;
    border-collapse: collapse;
}

.contentful-table th,
.contentful-table td {
    padding: 12px;
    border: 1px solid #ddd;
    text-align: left;
}
```

### Table Types

#### Table of Contents

- **Purpose**: Page navigation
- **Format**: Unordered list with anchor links
- **CSS Class**: `.contentful-table-of-contents`

#### Data Visualization Tables

- **Purpose**: Display structured data
- **Format**: HTML table with headers and rows
- **CSS Class**: `.contentful-data-table`

## Troubleshooting

### No Tables Found

1. **Check file location**: Ensure JSON files are in `/wp-content/contentful-tables/`
2. **Verify permissions**: Files should be readable by WordPress
3. **Check format**: Files should be valid JSON with required structure

### Shortcode Not Rendering

1. **Check table ID**: Ensure ID matches existing table
2. **Plugin activated**: Verify plugin is active in WordPress admin
3. **Debug mode**: Enable WordPress debug logging

### Styling Issues

1. **CSS conflicts**: Check for theme CSS conflicts
2. **Responsive issues**: Test on mobile devices
3. **Custom styles**: Verify custom CSS is loading

### Performance Issues

1. **File vs database**: File-based loading is usually faster
2. **Large tables**: Consider pagination for very large datasets
3. **Caching**: Use WordPress caching plugins

## Technical Details

### File Structure

```
contentful-tables/
├── contentful-tables.php     # Main plugin file
├── assets/
│   └── contentful-tables.css # Plugin styles (optional)
└── readme.txt               # WordPress plugin readme
```

### Database Schema

```sql
CREATE TABLE wp_contentful_tables (
    id mediumint(9) NOT NULL AUTO_INCREMENT,
    table_id varchar(50) NOT NULL,
    table_data longtext NOT NULL,
    table_type varchar(50) DEFAULT 'dataVisualizationTable',
    title varchar(255) DEFAULT '',
    created_at datetime DEFAULT CURRENT_TIMESTAMP,
    updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY table_id (table_id)
);
```

### JSON Data Format

#### Table of Contents
```json
{
  "type": "tableOfContents",
  "title": "Table of Contents",
  "headerTags": ["H2"],
  "style": "List",
  "html": "..."
}
```

#### Data Table
```json
{
  "type": "dataVisualizationTable",
  "title": "Comparison Table",
  "rawData": [
    ["Header 1", "Header 2", "Header 3"],
    ["Row 1 Col 1", "Row 1 Col 2", "Row 1 Col 3"],
    ["Row 2 Col 1", "Row 2 Col 2", "Row 2 Col 3"]
  ]
}
```

## Hooks and Filters

### Actions

- `contentful_tables_before_render`: Before table rendering
- `contentful_tables_after_render`: After table rendering

### Filters

- `contentful_tables_data`: Modify table data before rendering
- `contentful_tables_html`: Modify final HTML output
- `contentful_tables_css`: Modify plugin CSS

### Example Usage

```php
// Modify table data
add_filter('contentful_tables_data', function($data, $table_id) {
    if ($table_id === 'specific-table') {
        // Modify data for specific table
        $data['title'] = 'Custom Title';
    }
    return $data;
}, 10, 2);

// Add custom CSS
add_filter('contentful_tables_css', function($css) {
    $css .= '.my-custom-table { border: 2px solid red; }';
    return $css;
});
```
