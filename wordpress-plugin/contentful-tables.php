<?php
/**
 * Plugin Name: Contentful Tables
 * Plugin URI: https://github.com/sanruiz/contentful-inventory
 * Description: Displays Contentful tables using shortcodes for headless WordPress setups
 * Version: 2.0.0
 * Author: Santiago Ramirez
 * License: GPL v2 or later
 * Text Domain: contentful-tables
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

class ContentfulTablesPlugin {
    
    private $tables_data = [];
    private $plugin_version = '2.0.0';
    
    public function __construct() {
        add_action('init', [$this, 'init']);

        // Register shortcodes with both underscore and hyphen variants
        add_shortcode('contentful_table', [$this, 'render_table_shortcode']);
        add_shortcode('contentful-table', [$this, 'render_table_shortcode']); // backward compat
        add_shortcode('contentful_toc', [$this, 'render_toc_shortcode']);
        add_shortcode('contentful-toc', [$this, 'render_toc_shortcode']); // backward compat

        add_action('wp_enqueue_scripts', [$this, 'enqueue_styles']);
        add_action('admin_menu', [$this, 'add_admin_menu']);
        
        // Plugin activation/deactivation hooks
        register_activation_hook(__FILE__, [$this, 'activate']);
        register_deactivation_hook(__FILE__, [$this, 'deactivate']);
    }
    
    public function init() {
        $this->load_tables_data();
    }
    
    /**
     * Plugin activation
     */
    public function activate() {
        // Create database table for storing Contentful tables
        $this->create_tables_database();
        
        // Set default options
        add_option('contentful_tables_version', $this->plugin_version);
        add_option('contentful_tables_load_css', true);
    }
    
    /**
     * Plugin deactivation
     */
    public function deactivate() {
        // Clean up if needed
    }
    
    /**
     * Create database table for storing Contentful tables
     */
    private function create_tables_database() {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'contentful_tables';
        
        $charset_collate = $wpdb->get_charset_collate();
        
        $sql = "CREATE TABLE $table_name (
            id mediumint(9) NOT NULL AUTO_INCREMENT,
            table_id varchar(50) NOT NULL,
            table_data longtext NOT NULL,
            table_type varchar(50) DEFAULT 'dataVisualizationTable',
            title varchar(255) DEFAULT '',
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY table_id (table_id)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
    }
    
    /**
     * Load table data from WordPress post meta (where we stored them)
     */
    private function load_tables_data() {
        // First try to load from JSON files in wp-content/contentful-tables/
        $this->load_tables_from_files();
        
        // If no tables found, try to load from different possible post IDs
        if (empty($this->tables_data)) {
            $possible_post_ids = [241, 240, 238, 236, 235, 237, 239];
            
            foreach ($possible_post_ids as $post_id) {
                $post_meta = get_post_meta($post_id);
                
                if (!empty($post_meta)) {
                    $found_tables = false;
                    foreach ($post_meta as $meta_key => $meta_values) {
                        if (strpos($meta_key, 'contentful_table_') === 0) {
                            $table_id = str_replace('contentful_table_', '', $meta_key);
                            $table_data = json_decode($meta_values[0], true);
                            
                            if ($table_data) {
                                $this->tables_data[$table_id] = $table_data;
                                $found_tables = true;
                            }
                        }
                    }
                    
                    if ($found_tables) {
                        // Store the working post ID for admin display
                        update_option('contentful_tables_post_id', $post_id);
                        break;
                    }
                }
            }
        }
        
        // If still no tables found, try to load from database table
        if (empty($this->tables_data)) {
            $this->load_tables_from_database();
        }
    }
    
    /**
     * Load table data from JSON files in wp-content/contentful-tables/
     */
    private function load_tables_from_files() {
        $tables_dir = WP_CONTENT_DIR . '/contentful-tables/';
        
        if (is_dir($tables_dir)) {
            $json_files = glob($tables_dir . '*.json');
            
            if (!empty($json_files)) {
                foreach ($json_files as $file) {
                    $table_id = basename($file, '.json');
                    $table_data = json_decode(file_get_contents($file), true);
                    
                    if ($table_data && isset($table_data['type'])) {
                        $this->tables_data[$table_id] = $table_data;
                    }
                }
                
                if (!empty($this->tables_data)) {
                    update_option('contentful_tables_source', 'files');
                    update_option('contentful_tables_post_id', 'JSON Files');
                }
            }
        }
    }
    
    /**
     * Load table data from custom database table
     */
    private function load_tables_from_database() {
        global $wpdb;
        $table_name = $wpdb->prefix . 'contentful_tables';
        
        // Check if table exists
        if ($wpdb->get_var("SHOW TABLES LIKE '$table_name'") == $table_name) {
            $results = $wpdb->get_results("SELECT table_id, table_data FROM $table_name", ARRAY_A);
            foreach ($results as $row) {
                $table_data = json_decode($row['table_data'], true);
                if ($table_data) {
                    $this->tables_data[$row['table_id']] = $table_data;
                }
            }
        }
    }
    
    /**
     * Enqueue plugin styles
     */
    public function enqueue_styles() {
        if (get_option('contentful_tables_load_css', true)) {
            wp_enqueue_style(
                'contentful-tables',
                plugin_dir_url(__FILE__) . 'assets/contentful-tables.css',
                [],
                $this->plugin_version
            );
            
            // If CSS file doesn't exist, add inline styles
            $css_file = plugin_dir_path(__FILE__) . 'assets/contentful-tables.css';
            if (!file_exists($css_file)) {
                $this->add_inline_styles();
            }
        }
    }
    
    /**
     * Add inline CSS styles
     */
    private function add_inline_styles() {
        $css = '
        /* Contentful Tables Plugin Styles */
        .contentful-table-of-contents {
            background: #f9f9f9;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 20px;
            margin: 20px 0;
        }
        
        .contentful-table-of-contents h3 {
            margin-top: 0;
            color: #333;
            font-size: 1.2em;
        }
        
        .toc-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        
        .toc-list li {
            padding: 8px 0;
            border-bottom: 1px solid #eee;
        }
        
        .toc-list li:last-child {
            border-bottom: none;
        }
        
        .toc-list a {
            color: #0073aa;
            text-decoration: none;
            display: block;
            padding: 4px 0;
        }
        
        .toc-list a:hover {
            text-decoration: underline;
            color: #005a87;
        }
        
        .contentful-data-table {
            margin: 20px 0;
        }
        
        .contentful-data-table h3 {
            color: #333;
            margin-bottom: 15px;
            font-size: 1.3em;
        }
        
        .table-responsive {
            overflow-x: auto;
            margin: 15px 0;
        }
        
        .contentful-table {
            width: 100%;
            border-collapse: collapse;
            margin: 0;
            border: 1px solid #ddd;
            background: white;
        }
        
        .contentful-table th,
        .contentful-table td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        
        .contentful-table th {
            background-color: #f8f9fa;
            font-weight: bold;
            color: #333;
        }
        
        .contentful-table tbody tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        
        .contentful-table tbody tr:hover {
            background-color: #f5f5f5;
        }
        
        /* Responsive styles */
        @media (max-width: 768px) {
            .contentful-table {
                font-size: 14px;
            }
            
            .contentful-table th,
            .contentful-table td {
                padding: 8px 10px;
            }
            
            .contentful-table-of-contents {
                padding: 15px;
            }
        }
        
        @media (max-width: 480px) {
            .contentful-table {
                font-size: 12px;
            }
            
            .contentful-table th,
            .contentful-table td {
                padding: 6px 8px;
            }
        }
        
        /* TOC sticky variant */
        .contentful-table-of-contents.toc-sticky {
            position: sticky;
            top: 20px;
            z-index: 10;
        }
        
        /* TOC style variants */
        .contentful-table-of-contents.toc-style-list .toc-list {
            list-style: disc;
            padding-left: 20px;
        }
        
        .contentful-table-of-contents.toc-style-list .toc-list li {
            border-bottom: none;
            padding: 4px 0;
        }
        
        .contentful-table-of-contents .toc-title {
            margin-top: 0;
            color: #333;
            font-size: 1.2em;
        }
        
        /* Table links styling */
        .contentful-table a {
            color: #0073aa;
            text-decoration: none;
        }
        
        .contentful-table a:hover {
            text-decoration: underline;
            color: #005a87;
        }
        ';
        
        wp_add_inline_style('contentful-tables', $css);
    }
    
    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        add_options_page(
            'Contentful Tables',
            'Contentful Tables',
            'manage_options',
            'contentful-tables',
            [$this, 'admin_page']
        );
    }
    
    /**
     * Admin page content
     */
    public function admin_page() {
        ?>
        <div class="wrap">
            <h1>Contentful Tables</h1>
            
            <?php if (isset($_POST['submit'])): ?>
                <?php
                update_option('contentful_tables_load_css', isset($_POST['load_css']));
                echo '<div class="notice notice-success"><p>Settings saved!</p></div>';
                ?>
            <?php endif; ?>
            
            <form method="post" action="">
                <table class="form-table">
                    <tr>
                        <th scope="row">Load CSS</th>
                        <td>
                            <label>
                                <input type="checkbox" name="load_css" <?php checked(get_option('contentful_tables_load_css', true)); ?> />
                                Load plugin CSS styles
                            </label>
                        </td>
                    </tr>
                </table>
                
                <?php submit_button(); ?>
            </form>
            
            <h2>Available Tables</h2>
            <p>Use these shortcodes in your posts and pages:</p>
            
            <div style="background: #f9f9f9; padding: 15px; border-radius: 5px;">
                <?php if (empty($this->tables_data)): ?>
                    <p><strong>No tables found.</strong> Make sure you have imported your Contentful tables using the headless import script.</p>
                <?php else: ?>
                    <?php foreach ($this->tables_data as $table_id => $table_data): ?>
                        <div style="margin-bottom: 15px; padding: 10px; background: white; border-left: 4px solid #0073aa;">
                            <strong>Table ID:</strong> <?php echo esc_html($table_id); ?><br>
                            <strong>Type:</strong> <?php echo esc_html($table_data['type'] ?? 'Unknown'); ?><br>
                            <strong>Title:</strong> <?php echo esc_html($table_data['title'] ?? 'No title'); ?><br>
                            <strong>Shortcode:</strong> 
                            <?php if (($table_data['type'] ?? '') === 'tableOfContents'): ?>
                                <code>[contentful_toc id="<?php echo esc_attr($table_id); ?>"]</code>
                            <?php else: ?>
                                <code>[contentful_table id="<?php echo esc_attr($table_id); ?>"]</code>
                            <?php endif; ?>
                        </div>
                    <?php endforeach; ?>
                <?php endif; ?>
            </div>
            
            <h2>Usage Examples</h2>
            <pre style="background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto;">
Data table:
[contentful_table id="XBIbkCm53nytLcsPx3jlw"]

Table of contents:
[contentful_toc id="2dvEbjLfveBiFUb9PsLxFE"]

With custom CSS class:
[contentful_table id="3JnIHQENe4ZtihjpWwphGI" class="my-custom-table"]

With custom title:
[contentful_table id="408uTkJfTRYN5S7SCmIC5t" title="Custom Table Title"]

Legacy format (also supported):
[contentful-table id="XBIbkCm53nytLcsPx3jlw"]
            </pre>
            
            <h2>Plugin Information</h2>
            <ul>
                <li><strong>Version:</strong> <?php echo esc_html($this->plugin_version); ?></li>
                <li><strong>Tables Loaded:</strong> <?php echo count($this->tables_data); ?></li>
                <li><strong>Source:</strong> 
                    <?php 
                    $source = get_option('contentful_tables_source', 'post_meta');
                    $post_id = get_option('contentful_tables_post_id', 'Not found');
                    
                    if ($source === 'files') {
                        echo 'JSON Files in /wp-content/contentful-tables/';
                    } else {
                        echo 'WordPress Post Meta (Post ID: ' . $post_id . ')';
                    }
                    ?>
                </li>
                <?php if (empty($this->tables_data)): ?>
                <li><strong>Debug:</strong> 
                    <details>
                        <summary>Troubleshooting Information</summary>
                        <ul>
                            <li>Checked post IDs: 240, 238, 236, 235, 237, 239</li>
                            <li>Database table exists: <?php 
                                global $wpdb;
                                $table_name = $wpdb->prefix . 'contentful_tables';
                                echo ($wpdb->get_var("SHOW TABLES LIKE '$table_name'") == $table_name) ? 'Yes' : 'No';
                            ?></li>
                            <li>Possible solutions:
                                <ol>
                                    <li>Re-run the table import script: <code>node headless-meta-storage.js</code></li>
                                    <li>Check if WordPress post exists with table data</li>
                                    <li>Verify .env file has correct WordPress credentials</li>
                                </ol>
                            </li>
                        </ul>
                    </details>
                </li>
                <?php endif; ?>
            </ul>
        </div>
        <?php
    }
    
    /**
     * Render table shortcode [contentful_table id="..."] or [contentful-table id="..."]
     */
    public function render_table_shortcode($atts) {
        $atts = shortcode_atts([
            'id' => '',
            'class' => '',
            'title' => ''
        ], $atts, 'contentful_table');
        
        $table_id = sanitize_text_field($atts['id']);
        $custom_class = sanitize_text_field($atts['class']);
        $custom_title = sanitize_text_field($atts['title']);
        
        if (empty($table_id)) {
            return '<div class="contentful-error">Error: No table ID specified. Usage: [contentful_table id="your-table-id"]</div>';
        }
        
        if (!isset($this->tables_data[$table_id])) {
            return '<div class="contentful-error">Error: Table "' . esc_html($table_id) . '" not found. Available tables: ' . implode(', ', array_keys($this->tables_data)) . '</div>';
        }
        
        $table_data = $this->tables_data[$table_id];
        
        // Override title if custom title is provided
        if (!empty($custom_title)) {
            $table_data['title'] = $custom_title;
        }

        // Route to appropriate renderer based on type
        $type = $table_data['type'] ?? '';
        if ($type === 'tableOfContents') {
            $html = $this->render_table_of_contents($table_data, $table_id);
        } else {
            $html = $this->render_data_table($table_data, $table_id);
        }
        
        // Add custom CSS class if provided
        if (!empty($custom_class)) {
            $html = str_replace(
                ['class="contentful-table-of-contents"', 'class="contentful-data-table"'],
                ['class="contentful-table-of-contents ' . esc_attr($custom_class) . '"', 'class="contentful-data-table ' . esc_attr($custom_class) . '"'],
                $html
            );
        }
        
        return $html;
    }

    /**
     * Render TOC shortcode [contentful_toc id="..."] or [contentful-toc id="..."]
     * Dedicated handler for table of contents components
     */
    public function render_toc_shortcode($atts)
    {
        $atts = shortcode_atts([
            'id' => '',
            'class' => '',
            'title' => ''
        ], $atts, 'contentful_toc');

        $table_id = sanitize_text_field($atts['id']);
        $custom_class = sanitize_text_field($atts['class']);
        $custom_title = sanitize_text_field($atts['title']);

        if (empty($table_id)) {
            return '<div class="contentful-error">Error: No TOC ID specified. Usage: [contentful_toc id="your-toc-id"]</div>';
        }

        if (!isset($this->tables_data[$table_id])) {
            return '<div class="contentful-error">Error: TOC "' . esc_html($table_id) . '" not found. Available: ' . implode(', ', array_keys($this->tables_data)) . '</div>';
        }

        $table_data = $this->tables_data[$table_id];

        // Override title if custom title is provided
        if (!empty($custom_title)) {
            $table_data['title'] = $custom_title;
        }

        $html = $this->render_table_of_contents($table_data, $table_id);

        // Add custom CSS class if provided
        if (!empty($custom_class)) {
            $html = str_replace(
                'class="contentful-table-of-contents"',
                'class="contentful-table-of-contents ' . esc_attr($custom_class) . '"',
                $html
            );
        }

        return $html;
    }

    /**
     * Render table HTML
     */
    private function render_table($table_id, $table_data) {
        if (!$table_data || !isset($table_data['type'])) {
            return '<div class="contentful-error">Error: Invalid table data for table "' . esc_html($table_id) . '"</div>';
        }
        
        $type = $table_data['type'];
        
        if ($type === 'tableOfContents') {
            return $this->render_table_of_contents($table_data, $table_id);
        } else {
            return $this->render_data_table($table_data, $table_id);
        }
    }
    
    /**
     * Render table of contents
     * Generates a dynamic TOC that scans page headings via JavaScript
     */
    private function render_table_of_contents($table_data, $table_id) {
        $header_tags = $table_data['headerTags'] ?? ['H2'];
        $style = $table_data['style'] ?? 'List';
        $is_sticky = !empty($table_data['isSticky']);

        $sticky_class = $is_sticky ? ' toc-sticky' : '';
        $style_class = ' toc-style-' . sanitize_html_class(strtolower($style));

        $html = '<div class="contentful-table-of-contents' . $style_class . $sticky_class . '" id="contentful-toc-' . esc_attr($table_id) . '">';
        
        if (!empty($table_data['title'])) {
            $html .= '<h3 class="toc-title">' . esc_html($table_data['title']) . '</h3>';
        }

        // Check if this has pre-built items
        if (isset($table_data['items']) && is_array($table_data['items'])) {
            $html .= '<ul class="toc-list">';
            foreach ($table_data['items'] as $item) {
                $text = $item['text'] ?? '';
                $anchor = $item['anchor'] ?? sanitize_title($text);
                if (!empty($text)) {
                    $html .= '<li><a href="#' . esc_attr($anchor) . '">' . esc_html($text) . '</a></li>';
                }
            }
            $html .= '</ul>';
        } else {
            // Dynamic TOC: scan page headings via JavaScript
            $selector = implode(', ', array_map(function ($tag) {
                return strtolower(trim($tag));
            }, $header_tags));

            $html .= '<nav class="toc-container" data-headers="' . esc_attr(implode(',', $header_tags)) . '">';
            $html .= '<ul class="toc-list"></ul>';
            $html .= '</nav>';

            // Inline script to populate the TOC from page headings
            $html .= '<script>';
            $html .= '(function(){';
            $html .= 'var toc=document.getElementById("contentful-toc-' . esc_js($table_id) . '");';
            $html .= 'if(!toc)return;';
            $html .= 'var list=toc.querySelector(".toc-list");';
            $html .= 'var sel="' . esc_js($selector) . '";';
            $html .= 'var post=toc.closest(".entry-content")||toc.closest("article")||document;';
            $html .= 'var headings=post.querySelectorAll(sel);';
            $html .= 'if(!headings.length){toc.style.display="none";return;}';
            $html .= 'headings.forEach(function(h,i){';
            $html .= 'var id=h.id||"toc-heading-"+i;';
            $html .= 'if(!h.id)h.id=id;';
            $html .= 'var li=document.createElement("li");';
            $html .= 'var a=document.createElement("a");';
            $html .= 'a.href="#"+id;a.textContent=h.textContent;';
            $html .= 'li.appendChild(a);list.appendChild(li);';
            $html .= '});';
            $html .= '})();';
            $html .= '</script>';
        }
        
        $html .= '</div>';
        
        return $html;
    }
    
    /**
     * Render data table
     */
    private function render_data_table($table_data, $table_id) {
        $html = '<div class="contentful-data-table" id="contentful-table-' . esc_attr($table_id) . '">';
        
        if (!empty($table_data['title'])) {
            $html .= '<h3>' . esc_html($table_data['title']) . '</h3>';
        }
        
        // Check if this is raw Contentful data structure
        if (isset($table_data['rawData']) && is_array($table_data['rawData'])) {
            $rawData = $table_data['rawData'];
            
            // First row is headers
            $headers = array_shift($rawData);
            
            // Remove the 'key' column if it exists (last column)
            if (end($headers) === 'key') {
                array_pop($headers);
                // Also remove key column from data rows
                $rawData = array_map(function($row) {
                    if (is_array($row) && count($row) > 0) {
                        array_pop($row);
                    }
                    return $row;
                }, $rawData);
            }
            
            $html .= '<div class="table-responsive">';
            $html .= '<table class="contentful-table">';
            
            // Render headers
            $html .= '<thead><tr>';
            foreach ($headers as $header) {
                $html .= '<th>' . esc_html($header) . '</th>';
            }
            $html .= '</tr></thead>';
            
            // Render data rows
            $html .= '<tbody>';
            foreach ($rawData as $row) {
                if (is_array($row) && count($row) > 0) {
                    $html .= '<tr>';
                    foreach ($row as $cell) {
                        $html .= '<td>' . wp_kses_post($cell) . '</td>';
                    }
                    $html .= '</tr>';
                }
            }
            $html .= '</tbody>';
            
            $html .= '</table>';
            $html .= '</div>';
        } else {
            // Legacy format with headers and rows arrays
            if (isset($table_data['headers']) && isset($table_data['rows'])) {
                $html .= '<div class="table-responsive">';
                $html .= '<table class="contentful-table">';
                
                // Headers
                if (is_array($table_data['headers'])) {
                    $html .= '<thead><tr>';
                    foreach ($table_data['headers'] as $header) {
                        $html .= '<th>' . esc_html($header) . '</th>';
                    }
                    $html .= '</tr></thead>';
                }
                
                // Rows
                if (is_array($table_data['rows'])) {
                    $html .= '<tbody>';
                    foreach ($table_data['rows'] as $row) {
                        if (is_array($row)) {
                            $html .= '<tr>';
                            foreach ($row as $cell) {
                                $html .= '<td>' . wp_kses_post($cell) . '</td>';
                            }
                            $html .= '</tr>';
                        }
                    }
                    $html .= '</tbody>';
                }
                
                $html .= '</table>';
                $html .= '</div>';
            } else {
                $html .= '<p>No table data available.</p>';
            }
        }
        
        $html .= '</div>';
        
        return $html;
    }
}

// Initialize the plugin
new ContentfulTablesPlugin();

// Add error styles for missing tables
add_action('wp_head', function() {
    echo '<style>.contentful-error { padding: 15px; background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; border-radius: 4px; margin: 15px 0; }</style>';
});
