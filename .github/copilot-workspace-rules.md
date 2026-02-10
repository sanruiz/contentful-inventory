# Copilot Workspace Rules

## Code Style Guidelines

### JavaScript/Node.js
- Use ES modules (`import`/`export`)
- Prefer `async`/`await` over Promise chains
- Use `const` for immutable values, `let` for mutable
- Destructure objects and arrays when appropriate
- Use template literals for string interpolation

### File Organization
- Group imports at the top (Node.js modules first, then local modules)
- Export functions at the bottom of files
- Use descriptive function and variable names
- Keep functions focused and single-purpose

### Error Handling
```javascript
// Preferred pattern
try {
    const result = await apiCall();
    return result;
} catch (error) {
    console.error(`Error in ${functionName}:`, error.message);
    throw new Error(`Failed to ${action}: ${error.message}`);
}
```

### API Client Patterns
```javascript
// WordPress API calls
const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/endpoint`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
    },
    body: JSON.stringify(data)
});

if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}
```

## WordPress Plugin Development

### PHP Style
- Follow WordPress coding standards
- Use proper escaping for output (`esc_html`, `esc_attr`)
- Implement proper nonce verification for security
- Use WordPress hooks and filters appropriately

### Shortcode Implementation
```php
// Register shortcode
add_shortcode('contentful_table', array($this, 'render_table_shortcode'));

// Render method
public function render_table_shortcode($atts) {
    $atts = shortcode_atts(array(
        'id' => '',
        'type' => 'table'
    ), $atts);
    
    // Load and render table data
    return $this->render_table($atts['id'], $atts['type']);
}
```

## Migration Script Patterns

### Data Processing
- Always validate input data before processing
- Use consistent data structures across scripts
- Implement progress logging for long operations
- Handle partial failures gracefully

### File Operations
```javascript
// Safe file writing
import { promises as fs } from 'fs';
import path from 'path';

const writeTableFile = async (tableData, filename) => {
    const outputDir = './wp-content/contentful-tables';
    await fs.mkdir(outputDir, { recursive: true });
    
    const filepath = path.join(outputDir, `${filename}.json`);
    await fs.writeFile(filepath, JSON.stringify(tableData, null, 2));
    
    console.log(`✅ Saved table: ${filepath}`);
};
```

## Documentation Standards

### Function Documentation
```javascript
/**
 * Extracts table components from Contentful entry
 * @param {Object} entry - Contentful entry object
 * @param {string} entryId - Entry ID for reference
 * @returns {Array} Array of table objects with metadata
 */
const extractTablesFromEntry = async (entry, entryId) => {
    // Implementation
};
```

### README Updates
- Keep installation instructions current
- Document new environment variables
- Update workflow diagrams when adding features
- Include troubleshooting sections for common issues

## Git and Collaboration

### Commit Messages
- Use descriptive commit messages
- Start with action verb (Add, Update, Fix, Remove)
- Include scope when relevant: "Fix(wordpress): resolve plugin activation issue"

### Branch Naming
- Feature branches: `feature/table-export-enhancement`
- Bug fixes: `fix/shortcode-rendering-error`
- Documentation: `docs/update-installation-guide`

## Testing Guidelines

### Manual Testing Checklist
1. WordPress plugin activation
2. Shortcode rendering in posts
3. Table data file generation
4. Migration workflow end-to-end
5. Error handling scenarios

### Code Testing
- Test API connections before running migrations
- Validate data structures after transformations
- Check file permissions and directory creation
- Verify WordPress authentication
