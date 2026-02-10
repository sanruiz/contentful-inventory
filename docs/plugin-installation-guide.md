# Contentful Tables WordPress Plugin Installation Guide

## 📦 Installation Steps

### Method 1: Upload as Plugin (Recommended)

1. **Create plugin folder:**
   ```bash
   mkdir -p /path/to/your/wordpress/wp-content/plugins/contentful-tables/
   ```

2. **Copy the plugin file:**
   ```bash
   cp contentful-tables-plugin.php /path/to/your/wordpress/wp-content/plugins/contentful-tables/contentful-tables.php
   ```

3. **Activate in WordPress Admin:**
   - Go to WordPress Admin → Plugins
   - Find "Contentful Tables" 
   - Click "Activate"

### Method 2: Add to functions.php (Alternative)

If you prefer to add it to your theme's functions.php instead:

```php
// Add this line to your theme's functions.php
require_once get_template_directory() . '/contentful-tables-plugin.php';
```

## ✅ Verify Installation

1. **Check WordPress Admin:**
   - Go to Settings → Contentful Tables
   - You should see your imported tables listed

2. **Test a shortcode:**
   - Add this to any post/page: `[contentful-table id="XBIbkCm53nytLcsPx3jlw"]`
   - Preview the post to see the table

## 🎯 Available Shortcodes

Based on your imported tables, you can use these shortcodes:

```
[contentful-table id="15GbfxM5TVSOko8p0dJuMp"]
[contentful-table id="1nTH4E5o92iEc7kxuREFhG"]
[contentful-table id="2np25i4loM5hoXqt9zhRjC"]
[contentful-table id="3JnIHQENe4ZtihjpWwphGI"]
[contentful-table id="408uTkJfTRYN5S7SCmIC5t"]
[contentful-table id="5dN7T469iC59SaBgOUehEx"]
[contentful-table id="76yvmc500ttjBWyLx0L4UW"]
[contentful-table id="RzPH5hP5jiiuYpRewswrI"]
[contentful-table id="XBIbkCm53nytLcsPx3jlw"]  <!-- Table of Contents -->
[contentful-table id="wJCeOiel472Htk9lDc0rB"]
```

## 🎨 Shortcode Options

```php
// Basic usage
[contentful-table id="XBIbkCm53nytLcsPx3jlw"]

// With custom CSS class
[contentful-table id="3JnIHQENe4ZtihjpWwphGI" class="my-custom-style"]

// With custom title
[contentful-table id="408uTkJfTRYN5S7SCmIC5t" title="My Custom Table Title"]

// Combined options
[contentful-table id="5dN7T469iC59SaBgOUehEx" class="highlight-table" title="Important Data"]
```

## ⚙️ Plugin Settings

The plugin includes an admin page at **Settings → Contentful Tables** with:

- **CSS Loading Control:** Enable/disable plugin CSS
- **Available Tables:** List of all imported tables with their shortcodes
- **Usage Examples:** Copy-paste ready shortcode examples

## 🎨 Custom Styling

If you want to customize the table styles, you can:

1. **Disable plugin CSS** in Settings → Contentful Tables
2. **Add your own CSS** to your theme:

```css
/* Custom styles for Contentful tables */
.contentful-table {
    border: 2px solid #your-color;
    background: #your-background;
}

.contentful-table-of-contents {
    background: #your-toc-background;
}
```

## 🐛 Troubleshooting

### "Table not found" error
- Check that the table ID is correct
- Verify tables were imported (check Settings → Contentful Tables)
- Make sure the WordPress post with table data (ID 236) exists

### Tables not showing
- Activate the plugin in WordPress Admin → Plugins
- Check that shortcode syntax is correct: `[contentful-table id="your-id"]`
- Verify the post/page is published, not in draft

### Styling issues
- Check if plugin CSS is enabled in Settings → Contentful Tables
- Clear any caching plugins
- Check browser developer tools for CSS conflicts

## 📊 What the Plugin Does

1. **Loads table data** from WordPress post meta (Post ID 236)
2. **Registers shortcode** `[contentful-table]` for rendering tables
3. **Includes responsive CSS** for mobile-friendly tables
4. **Provides admin interface** for managing tables
5. **Handles two table types:**
   - **Table of Contents:** Navigation lists with anchor links
   - **Data Tables:** Responsive tables with headers and data rows

## 🚀 Next Steps

1. **Install the plugin** using Method 1 above
2. **Test a shortcode** in a post or page
3. **Check the admin page** to see all available tables
4. **Add shortcodes** to your content where you want tables to appear

Your Contentful tables are now ready to use as WordPress shortcodes! 🎉
