import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Auto-inject Contentful tables into WordPress posts
 * This replaces component placeholders with actual table HTML
 */
class WordPressTableInjector {
  
  constructor() {
    this.tablesDir = path.join(__dirname, 'out', 'tables');
    this.wpUrl = process.env.WP_URL || 'http://memorycare.local';
    this.wpUser = process.env.WP_USERNAME || 'sanruiz';
    this.wpPassword = process.env.WP_PASSWORD;
  }

  /**
   * Simulate WordPress post update (since we don't have node-fetch)
   * This generates the SQL commands you can run manually
   */
  generateUpdateCommands() {
    console.log('🔧 Generating WordPress update commands...\n');

    // Read the table processing results
    const csvPath = path.join(__dirname, 'out', 'tables-detailed-export.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n').slice(1);

    const updateCommands = [];
    const shortcodeReplacements = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      
      const [title, slug, postId, tableId, tableType] = line.split(',').map(field => 
        field.replace(/^"|"$/g, '').trim()
      );

      if (tableId === 'NO_TABLES') continue;

      // Check if we have the table file
      const htmlFile = path.join(this.tablesDir, `${tableId}.html`);
      if (fs.existsSync(htmlFile)) {
        const tableHTML = fs.readFileSync(htmlFile, 'utf8');
        
        // Generate different integration options
        
        // Option 1: Direct HTML injection
        const escapedHTML = tableHTML.replace(/'/g, "\\'").replace(/\n/g, '\\n');
        updateCommands.push({
          type: 'Direct HTML',
          slug,
          title: title.substring(0, 50) + '...',
          tableId,
          sql: `-- Update post: ${title.substring(0, 50)}...\nUPDATE wp_posts SET post_content = CONCAT(post_content, '${escapedHTML}') WHERE post_name = '${slug}';`
        });

        // Option 2: Shortcode injection
        shortcodeReplacements.push({
          slug,
          title: title.substring(0, 50) + '...',
          tableId,
          shortcode: `[contentful-table id="${tableId}"]`
        });
      }
    }

    // Save update commands to file
    const commandsPath = path.join(__dirname, 'out', 'wordpress-table-updates.sql');
    const sqlCommands = updateCommands.map(cmd => cmd.sql).join('\n\n');
    fs.writeFileSync(commandsPath, sqlCommands);

    // Save shortcode replacements
    const shortcodesPath = path.join(__dirname, 'out', 'wordpress-shortcodes.txt');
    const shortcodeText = shortcodeReplacements.map(sc => 
      `Post: ${sc.title}\nSlug: ${sc.slug}\nShortcode: ${sc.shortcode}\n---\n`
    ).join('\n');
    fs.writeFileSync(shortcodesPath, shortcodeText);

    // Generate installation instructions
    const instructionsPath = path.join(__dirname, 'out', 'wordpress-integration-guide.md');
    const instructions = this.generateInstructions(updateCommands.length, shortcodeReplacements.length);
    fs.writeFileSync(instructionsPath, instructions);

    console.log('✅ Generated WordPress integration files:');
    console.log(`📄 SQL Commands: ${commandsPath}`);
    console.log(`🔧 Shortcodes: ${shortcodesPath}`);
    console.log(`📋 Instructions: ${instructionsPath}`);
    console.log(`\n📊 Summary:`);
    console.log(`   Tables ready for integration: ${updateCommands.length}`);
    console.log(`   Shortcodes generated: ${shortcodeReplacements.length}`);

    return { updateCommands, shortcodeReplacements };
  }

  generateInstructions(sqlCount, shortcodeCount) {
    return `# WordPress Contentful Tables Integration Guide

Generated on: ${new Date().toISOString()}

## 🎯 Overview
You have **${sqlCount} tables** ready to integrate into your WordPress posts. There are 3 integration methods:

## 📋 Method 1: WordPress Plugin/Shortcodes (Recommended)

### Setup:
1. Copy \`wordpress-contentful-tables.php\` to your theme's \`functions.php\` or create as a plugin
2. Create directory: \`wp-content/themes/your-theme/contentful-tables/\`
3. Copy all JSON files from \`out/tables/\` to this directory
4. Add shortcodes to your posts

### Usage:
\`\`\`
[contentful-table id="XBIbkCm53nytLcsPx3jlw"]
[contentful-table id="3JnIHQENe4ZtihjpWwphGI" class="custom-style"]
\`\`\`

### Available Tables:
${fs.readdirSync(path.join(__dirname, 'out', 'tables'))
  .filter(file => file.endsWith('.json'))
  .map(file => `- ${file.replace('.json', '')}`)
  .join('\n')}

---

## 📋 Method 2: Direct HTML Injection

### Database Method:
1. Backup your WordPress database
2. Run the SQL commands in \`wordpress-table-updates.sql\`
3. Clear any caches

### Manual Method:
1. Edit each post in WordPress admin
2. Copy HTML from \`out/tables/{table-id}.html\`
3. Paste into post content (use Text/HTML editor mode)

---

## 📋 Method 3: Custom WordPress REST API Integration

If you have the WordPress Application Passwords plugin or similar authentication:

1. Set environment variables:
   \`\`\`
   WP_URL=http://memorycare.local
   WP_USERNAME=your_username  
   WP_PASSWORD=your_app_password
   \`\`\`

2. Install node-fetch: \`npm install node-fetch\`
3. Uncomment the REST API code in \`contentful-table-processor.js\`
4. Run automatic updates

---

## 🔧 Files Generated:

- \`wordpress-contentful-tables.php\` - WordPress plugin code
- \`wordpress-table-updates.sql\` - Direct database updates
- \`wordpress-shortcodes.txt\` - List of shortcodes for each post
- HTML files in \`out/tables/\` - Individual table HTML
- JSON files in \`out/tables/\` - Table data for WordPress plugin

---

## 📊 Table Types:

1. **Table of Contents** (\`XBIbkCm53nytLcsPx3jlw\`)
   - Automatically generates navigation based on headings
   - Used in multiple posts

2. **Data Visualization Tables**
   - Interactive comparison tables
   - Responsive design
   - Custom styling

---

## 🎯 Next Steps:

1. **Quick Start**: Use Method 1 (shortcodes) for easiest integration
2. **Test**: Add one shortcode to a test post first
3. **Deploy**: Add shortcodes to all posts using the reference file
4. **Style**: Customize CSS in the plugin if needed

---

## 🔍 Troubleshooting:

- **Shortcode not working**: Check if plugin is activated and table files exist
- **Tables not styled**: Ensure CSS is loading (check browser dev tools)
- **JavaScript TOC not working**: Check for console errors, ensure jQuery is loaded

---

Happy integrating! 🚀`;
  }

  /**
   * Copy table files to WordPress directory (if accessible)
   */
  copyTablesToWordPress(wpThemeDir) {
    if (!wpThemeDir || !fs.existsSync(wpThemeDir)) {
      console.log('WordPress theme directory not accessible');
      return false;
    }

    const targetDir = path.join(wpThemeDir, 'contentful-tables');
    
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const tableFiles = fs.readdirSync(this.tablesDir).filter(file => 
        file.endsWith('.json') || file.endsWith('.html')
      );

      for (const file of tableFiles) {
        const sourcePath = path.join(this.tablesDir, file);
        const targetPath = path.join(targetDir, file);
        fs.copyFileSync(sourcePath, targetPath);
      }

      console.log(`✅ Copied ${tableFiles.length} files to: ${targetDir}`);
      return true;
    } catch (error) {
      console.error('❌ Error copying files:', error.message);
      return false;
    }
  }
}

// Main execution
const injector = new WordPressTableInjector();
const results = injector.generateUpdateCommands();

// If you have direct access to WordPress files, uncomment this:
// injector.copyTablesToWordPress('/path/to/wordpress/wp-content/themes/your-theme');

console.log('\n🎯 Ready for WordPress integration!');
console.log('📋 See wordpress-integration-guide.md for complete instructions');
