<?php
/**
 * Plugin Name: Contentful Tables
 * Plugin URI: https://github.com/sanruiz/contentful-inventory
 * Description: Displays Contentful content components (tables, charts, cards, forms) using shortcodes
 * Version: 3.2.0
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
    private $charts_data = [];
    private $cards_data = [];
    private $plugin_version = '3.2.0';
    
    public function __construct() {
        add_action('init', [$this, 'init']);

        // Register shortcodes with both underscore and hyphen variants
        add_shortcode('contentful_table', [$this, 'render_table_shortcode']);
        add_shortcode('contentful-table', [$this, 'render_table_shortcode']);
        add_shortcode('contentful_toc', [$this, 'render_toc_shortcode']);
        add_shortcode('contentful-toc', [$this, 'render_toc_shortcode']);
        add_shortcode('contentful_chart', [$this, 'render_chart_shortcode']);
        add_shortcode('contentful-chart', [$this, 'render_chart_shortcode']);
        add_shortcode('contentful_cards', [$this, 'render_cards_shortcode']);
        add_shortcode('contentful-cards', [$this, 'render_cards_shortcode']);
        add_shortcode('contentful_form', [$this, 'render_form_shortcode']);
        add_shortcode('contentful-form', [$this, 'render_form_shortcode']);

        // Prevent wptexturize from mangling shortcode attributes (smart quotes break IDs)
        add_filter('no_texturize_shortcodes', function ($shortcodes) {
            return array_merge($shortcodes, [
                'contentful_table',
                'contentful-table',
                'contentful_toc',
                'contentful-toc',
                'contentful_chart',
                'contentful-chart',
                'contentful_cards',
                'contentful-cards',
                'contentful_form',
                'contentful-form',
            ]);
        });

        add_action('wp_enqueue_scripts', [$this, 'enqueue_styles']);
        add_action('admin_menu', [$this, 'add_admin_menu']);

        // WPGraphQL: apply do_shortcode() to content fields
        add_filter('graphql_resolve_field', [$this, 'graphql_resolve_shortcodes'], 10, 9);
        add_action('graphql_register_types', [$this, 'graphql_register_rendered_content']);

        // Plugin activation/deactivation hooks
        register_activation_hook(__FILE__, [$this, 'activate']);
        register_deactivation_hook(__FILE__, [$this, 'deactivate']);
    }
    
    public function init() {
        $this->load_tables_data();
        $this->load_charts_data();
        $this->load_cards_data();
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
     * Load table data from JSON or CSV files in wp-content/contentful-tables/
     */
    private function load_tables_from_files() {
        $tables_dir = WP_CONTENT_DIR . '/contentful-tables/';
        
        if (is_dir($tables_dir)) {
            // Load JSON files
            $json_files = glob($tables_dir . '*.json');
            
            if (!empty($json_files)) {
                foreach ($json_files as $file) {
                    $table_id = basename($file, '.json');
                    $table_data = json_decode(file_get_contents($file), true);
                    
                    if ($table_data && isset($table_data['type'])) {
                        $this->tables_data[$table_id] = $table_data;
                    }
                }
            }

            // Load CSV files (parsed into rawData format)
            $csv_files = glob($tables_dir . '*.csv');

            if (!empty($csv_files)) {
                foreach ($csv_files as $file) {
                    $table_id = basename($file, '.csv');
                    // Skip if already loaded from JSON
                    if (isset($this->tables_data[$table_id])) {
                        continue;
                    }

                    $csv_content = file_get_contents($file);
                    if ($csv_content !== false) {
                        $rawData = $this->parse_csv($csv_content);
                        if (!empty($rawData)) {
                            // Auto-detect key column (column named "key")
                            $headers = $rawData[0];
                            $keyColIndex = array_search('key', array_map('strtolower', $headers));
                            $keyColumn = ($keyColIndex !== false) ? $headers[$keyColIndex] : null;
                            $keyValues = [];

                            if ($keyColIndex !== false) {
                                $dataRows = array_slice($rawData, 1);
                                $keyValues = array_values(array_unique(
                                    array_filter(array_map(function ($row) use ($keyColIndex) {
                                        return trim($row[$keyColIndex] ?? '');
                                    }, $dataRows))
                                ));
                            }

                            $this->tables_data[$table_id] = [
                                'type' => 'Plain',
                                'title' => '',
                                'style' => 'Equal Width',
                                'theme' => 'Standard',
                                'fullWidth' => true,
                                'rawData' => $rawData,
                                'keyColumn' => $keyColumn,
                                'keyColumnIndex' => ($keyColIndex !== false) ? (int) $keyColIndex : -1,
                                'keyValues' => $keyValues,
                            ];
                        }
                    }
                }
            }

            if (!empty($this->tables_data)) {
                update_option('contentful_tables_source', 'files');
                update_option('contentful_tables_post_id', 'JSON/CSV Files');
            }
        }
    }

    /**
     * Parse CSV text into array of arrays.
     * Handles quoted fields, commas within quotes, and multiline values.
     * 
     * @param string $text Raw CSV text
     * @return array Array of rows, each row is an array of cell values
     */
    private function parse_csv($text)
    {
        // Strip UTF-8 BOM if present
        if (substr($text, 0, 3) === "\xEF\xBB\xBF") {
            $text = substr($text, 3);
        }

        $rows = [];
        $current = '';
        $in_quotes = false;
        $row = [];
        $len = strlen($text);

        for ($i = 0; $i < $len; $i++) {
            $ch = $text[$i];
            $next = ($i + 1 < $len) ? $text[$i + 1] : '';

            if ($in_quotes) {
                if ($ch === '"' && $next === '"') {
                    $current .= '"';
                    $i++; // skip escaped quote
                } elseif ($ch === '"') {
                    $in_quotes = false;
                } else {
                    $current .= $ch;
                }
            } else {
                if ($ch === '"') {
                    $in_quotes = true;
                } elseif ($ch === ',') {
                    $row[] = trim($current);
                    $current = '';
                } elseif ($ch === "\n" || ($ch === "\r" && $next === "\n")) {
                    $row[] = trim($current);
                    if (
                        array_filter($row, function ($cell) {
                            return $cell !== '';
                        })
                    ) {
                        $rows[] = $row;
                    }
                    $row = [];
                    $current = '';
                    if ($ch === "\r")
                        $i++; // skip \n after \r
                } else {
                    $current .= $ch;
                }
            }
        }

        // Last row
        if ($current !== '' || !empty($row)) {
            $row[] = trim($current);
            if (
                array_filter($row, function ($cell) {
                    return $cell !== '';
                })
            ) {
                $rows[] = $row;
            }
        }

        return $rows;
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

        /* Chart styles */
        .contentful-chart {
            margin: 20px 0;
            padding: 20px;
            background: #f9f9f9;
            border: 1px solid #ddd;
            border-radius: 5px;
        }

        .contentful-chart .chart-title {
            margin-top: 0;
            color: #333;
        }

        .contentful-chart-table {
            margin-top: 10px;
        }

        .chart-placeholder {
            text-align: center;
            color: #666;
            font-style: italic;
            padding: 20px;
        }

        /* Cards styles */
        .contentful-cards {
            margin: 20px 0;
        }

        .cards-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }

        .contentful-card {
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }

        .card-field {
            margin-bottom: 8px;
        }

        .card-label {
            font-weight: bold;
            color: #555;
        }

        /* Form styles */
        .contentful-form-container {
            margin: 20px 0;
            padding: 25px;
            background: #f9f9f9;
            border: 1px solid #ddd;
            border-radius: 5px;
        }

        .contentful-form .form-field {
            margin-bottom: 15px;
        }

        .contentful-form label {
            display: block;
            font-weight: bold;
            margin-bottom: 5px;
            color: #333;
        }

        .contentful-form input,
        .contentful-form textarea {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
        }

        .contentful-form .wp-button {
            display: inline-block;
            padding: 10px 25px;
            background: #0073aa;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }

        .contentful-form .wp-button:hover {
            background: #005a87;
        }

        /* CTA button styles */
        .cta-button-container {
            text-align: center;
            margin: 20px 0;
        }

        .cta-button {
            display: inline-block;
            padding: 12px 30px;
            border-radius: 5px;
            text-decoration: none;
            font-weight: bold;
            font-size: 16px;
        }

        .cta-dark-green { background: #2d6a4f; color: white; }
        .cta-light-green { background: #52b788; color: white; }
        .cta-dark-green:hover { background: #1b4332; }
        .cta-light-green:hover { background: #40916c; }

        /* Back to top link */
        .back-to-top {
            text-align: right;
            margin: 10px 0;
        }

        .back-to-top a {
            color: #0073aa;
            text-decoration: none;
        }

        /* Link reference list */
        .link-reference-list {
            list-style: none;
            padding: 0;
        }

        .link-reference-list li {
            padding: 5px 0;
        }

        .link-reference-list a {
            color: #0073aa;
            text-decoration: none;
        }

        .link-reference-list a:hover {
            text-decoration: underline;
        }

        /* Rich text block */
        .rich-text-block {
            margin: 15px 0;
            padding: 15px;
            background: #fafafa;
            border-left: 3px solid #0073aa;
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
                            <?php if (!empty($table_data['keyValues'])): ?>
                                <br><strong>Filter values:</strong>
                                <?php echo esc_html(implode(', ', $table_data['keyValues'])); ?>
                                <br><em>Usage:</em>
                                <code>[contentful_table id="<?php echo esc_attr($table_id); ?>" filters="<?php echo esc_attr($table_data['keyValues'][0]); ?>"]</code>
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

Filter by key column (single value):
[contentful_table id="6OGCWSrHDT4MJviE31iLsa" filters="food"]

Filter by key column (multiple values):
[contentful_table id="6OGCWSrHDT4MJviE31iLsa" filters="food,agency"]

Filter by heading slug (auto-resolved to key):
[contentful_table id="6OGCWSrHDT4MJviE31iLsa" filters="area-agency-on-aging"]

Legacy key attribute (also supported):
[contentful_table id="6OGCWSrHDT4MJviE31iLsa" key="food"]

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
     * Load chart data from JSON files in wp-content/contentful-charts/
     */
    private function load_charts_data()
    {
        $charts_dir = WP_CONTENT_DIR . '/contentful-charts/';
        if (is_dir($charts_dir)) {
            $json_files = glob($charts_dir . '*.json');
            if (!empty($json_files)) {
                foreach ($json_files as $file) {
                    $chart_id = basename($file, '.json');
                    $chart_data = json_decode(file_get_contents($file), true);
                    if ($chart_data) {
                        $this->charts_data[$chart_id] = $chart_data;
                    }
                }
            }
        }
    }

    /**
     * Load card data from JSON files in wp-content/contentful-cards/
     */
    private function load_cards_data()
    {
        $cards_dir = WP_CONTENT_DIR . '/contentful-cards/';
        if (is_dir($cards_dir)) {
            $json_files = glob($cards_dir . '*.json');
            if (!empty($json_files)) {
                foreach ($json_files as $file) {
                    $card_id = basename($file, '.json');
                    $card_data = json_decode(file_get_contents($file), true);
                    if ($card_data) {
                        $this->cards_data[$card_id] = $card_data;
                    }
                }
            }
        }
    }

    /**
     * Get card rows from card data.
     * Supports inline tableData, cached CSV, or downloads and caches the spreadsheet.
     * 
     * @param array $card_data Card data from JSON
     * @return array Array of rows (first row = headers)
     */
    private function get_card_rows($card_data)
    {
        // Source 1: inline tableData (from card JSON with embedded data)
        if (isset($card_data['source']['dataTable']['tableData'])) {
            return $card_data['source']['dataTable']['tableData'];
        }

        // Source 2: rawData (pre-parsed CSV data in the JSON file)
        if (isset($card_data['rawData']) && is_array($card_data['rawData'])) {
            return $card_data['rawData'];
        }

        // Source 3: cached CSV file for this card
        $card_id = $card_data['id'] ?? '';
        if (!empty($card_id)) {
            $csv_path = WP_CONTENT_DIR . '/contentful-cards/' . $card_id . '.csv';
            if (file_exists($csv_path)) {
                // Use WordPress transient cache to avoid re-parsing large CSV on every page load
                $cache_key = 'ctfl_card_csv_' . substr(md5($card_id), 0, 16);
                $cached = get_transient($cache_key);
                if ($cached !== false) {
                    return $cached;
                }

                $csv_content = file_get_contents($csv_path);
                if ($csv_content !== false) {
                    $rows = $this->parse_csv($csv_content);
                    // Cache parsed data for 24 hours
                    set_transient($cache_key, $rows, DAY_IN_SECONDS);
                    return $rows;
                }
            }
        }

        // Source 4: download spreadsheet and cache locally
        if (isset($card_data['source']['type']) && $card_data['source']['type'] === 'spreadsheet' && !empty($card_data['source']['url'])) {
            $url = $card_data['source']['url'];
            if (strpos($url, '//') === 0)
                $url = 'https:' . $url;

            $response = wp_remote_get($url, ['timeout' => 30]);
            if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
                $csv_content = wp_remote_retrieve_body($response);
                if (!empty($csv_content)) {
                    // Cache the CSV locally
                    if (!empty($card_id)) {
                        $csv_path = WP_CONTENT_DIR . '/contentful-cards/' . $card_id . '.csv';
                        file_put_contents($csv_path, $csv_content);
                    }
                    return $this->parse_csv($csv_content);
                }
            }
        }

        return [];
    }

    /**
     * Format a header label from snake_case or slug to human-readable.
     * Examples: "provider_name" → "Provider Name", "base_pricing_string" → "Base Pricing String"
     * 
     * @param string $header Raw header name
     * @return string Formatted label
     */
    private function format_header_label($header)
    {
        // Replace underscores and hyphens with spaces
        $label = str_replace(['_', '-'], ' ', $header);
        // Remove trailing "string" suffix (e.g., "room_string" → "room")
        $label = preg_replace('/\s+string$/i', '', $label);
        // Title case
        return ucwords(trim($label));
    }

    /**
     * Resolve template placeholders in titles.
     * 
     * Supported placeholders:
     *   [ city-state ] — replaced with "City, ST" from current post slug (e.g. "Birmingham, AL")
     * 
     * Modifiers (appended after the placeholder):
     *   "lowercase" — output in lowercase (e.g. "birmingham, al")
     * 
     * @param string $title Title string possibly containing placeholders
     * @return string Title with placeholders resolved
     */
    private function resolve_title_placeholders($title)
    {
        if (strpos($title, '[ city-state ]') === false && strpos($title, '[city-state]') === false) {
            return $title;
        }

        $post = get_post();
        if (!$post) {
            return $title;
        }

        $slug = $post->post_name; // e.g. "birmingham-al"

        // Try to extract city name and state abbreviation from slug
        // Pattern: "city-name-XX" where XX is 2-letter state code
        $parts = explode('-', $slug);
        $state_abbr = '';
        $city_parts = $parts;

        if (count($parts) >= 2) {
            $last = strtoupper(end($parts));
            // Check if last segment is a 2-letter state abbreviation
            if (strlen($last) === 2 && ctype_alpha($last)) {
                $state_abbr = $last;
                $city_parts = array_slice($parts, 0, -1);
            }
        }

        // Build city name: capitalize each word
        $city_name = implode(' ', array_map('ucfirst', $city_parts));

        // Build replacement string
        if ($state_abbr) {
            $city_state = $city_name . ', ' . $state_abbr;
        } else {
            $city_state = $city_name;
        }

        // Detect "lowercase" modifier: "[ city-state ] lowercase"
        $lowercase = false;
        if (preg_match('/\[ ?city-state ?\]\s+lowercase/i', $title)) {
            $lowercase = true;
            // Remove the "lowercase" modifier from the title
            $title = preg_replace('/(\[ ?city-state ?\])\s+lowercase/i', '$1', $title);
        }

        $replacement = $lowercase ? strtolower($city_state) : $city_state;

        // Replace both "[ city-state ]" and "[city-state]" variants
        $title = str_replace(['[ city-state ]', '[city-state]'], $replacement, $title);

        return $title;
    }

    /**
     * Render chart shortcode [contentful_chart id="..." type="..." title="..."]
     */
    public function render_chart_shortcode($atts)
    {
        $atts = shortcode_atts([
            'id' => '',
            'type' => '',
            'title' => '',
            'class' => '',
        ], $atts, 'contentful_chart');

        $chart_id = sanitize_text_field($atts['id']);
        $custom_title = sanitize_text_field($atts['title']);
        $custom_class = sanitize_text_field($atts['class']);

        if (empty($chart_id)) {
            return '<!-- Chart: No ID specified -->';
        }

        $chart_data = $this->charts_data[$chart_id] ?? null;
        $title = $custom_title ?: ($chart_data['title'] ?? '');
        $viz_type = $chart_data['visualizationType'] ?? $atts['type'];

        // If we have source data with a table, render as an HTML table with chart styling
        $html = '<div class="contentful-chart' . ($custom_class ? ' ' . esc_attr($custom_class) : '') . '" id="contentful-chart-' . esc_attr($chart_id) . '">';

        if (!empty($title)) {
            $html .= '<h3 class="chart-title">' . esc_html($title) . '</h3>';
        }

        if ($chart_data && isset($chart_data['source'])) {
            $source = $chart_data['source'];
            $label_prefix = $chart_data['labelPrefix'] ?? '';

            if ($source['type'] === 'table' && isset($source['dataTable']['tableData'])) {
                $table_rows = $source['dataTable']['tableData'];
                if (count($table_rows) > 0) {
                    $headers = array_shift($table_rows);

                    $html .= '<div class="table-responsive">';
                    $html .= '<table class="contentful-table contentful-chart-table">';
                    $html .= '<thead><tr>';
                    foreach ($headers as $h) {
                        $html .= '<th>' . esc_html($h) . '</th>';
                    }
                    $html .= '</tr></thead><tbody>';

                    foreach ($table_rows as $row) {
                        $html .= '<tr>';
                        foreach ($row as $i => $cell) {
                            // Add prefix to numeric values (skip first column — usually label)
                            $display = $cell;
                            if ($i > 0 && is_numeric($cell) && $label_prefix) {
                                $display = $label_prefix . number_format((float) $cell);
                            }
                            $html .= '<td>' . esc_html($display) . '</td>';
                        }
                        $html .= '</tr>';
                    }

                    $html .= '</tbody></table></div>';
                }
            } elseif ($source['type'] === 'spreadsheet' && !empty($source['url'])) {
                $html .= '<p class="chart-source">Data source: <a href="' . esc_url($source['url']) . '" target="_blank">Download spreadsheet</a></p>';
            }
        } else {
            $html .= '<p class="chart-placeholder">[' . esc_html($viz_type) . ']</p>';
        }

        $html .= '</div>';

        return $html;
    }

    /**
     * Render cards shortcode [contentful_cards id="..." type="..." title="..." filters="..."]
     * 
     * Supports key-based filtering similar to tables:
     * - filters="birmingham-al" filters card rows by key column
     * - filters="auto" auto-detects filter from current post slug
     * - If no filters attribute but card has selectedKey, auto-filters by post slug
     */
    public function render_cards_shortcode($atts)
    {
        $atts = shortcode_atts([
            'id' => '',
            'type' => '',
            'title' => '',
            'class' => '',
            'filters' => '',
        ], $atts, 'contentful_cards');

        $card_id = sanitize_text_field($atts['id']);
        $custom_title = sanitize_text_field($atts['title']);
        $custom_class = sanitize_text_field($atts['class']);
        $filters_attr = sanitize_text_field($atts['filters']);

        if (empty($card_id)) {
            return '<!-- Cards: No ID specified -->';
        }

        $card_data = $this->cards_data[$card_id] ?? null;
        $title = $custom_title ?: ($card_data['title'] ?? '');

        // Resolve template placeholders like [ city-state ] from current post context
        $title = $this->resolve_title_placeholders($title);

        // Determine key filter: explicit filters attr, "auto", or auto-detect from card metadata
        $key_filter = $filters_attr;
        $has_selected_key = !empty($card_data['filters']['selectedKey']);

        if (empty($key_filter) && $has_selected_key) {
            // Auto-filter by post slug when card has selectedKey configured
            $key_filter = 'auto';
        }

        if ($key_filter === 'auto') {
            $post = get_post();
            $key_filter = $post ? $post->post_name : '';
        }

        $html = '<div class="contentful-cards' . ($custom_class ? ' ' . esc_attr($custom_class) : '') . '" id="contentful-cards-' . esc_attr($card_id) . '">';

        if (!empty($title)) {
            $html .= '<h3 class="cards-title">' . esc_html($title) . '</h3>';
        }

        if ($card_data) {
            $rows = $this->get_card_rows($card_data);

            if (!empty($rows)) {
                $headers = array_shift($rows);

                // Find key column index
                $keyColIndex = -1;
                if (!empty($key_filter)) {
                    // Use stored keyColumnIndex or auto-detect
                    $keyColIndex = $card_data['keyColumnIndex'] ?? -1;
                    if ($keyColIndex < 0) {
                        $lowercaseHeaders = array_map('strtolower', $headers);
                        $keyColIndex = array_search('key', $lowercaseHeaders);
                        if ($keyColIndex === false)
                            $keyColIndex = -1;
                    }
                }

                // Filter rows by key
                if (!empty($key_filter) && $keyColIndex >= 0) {
                    $rows = array_values(array_filter($rows, function ($row) use ($keyColIndex, $key_filter) {
                        $rowKey = strtolower(trim($row[$keyColIndex] ?? ''));
                        return $rowKey === strtolower($key_filter);
                    }));
                }

                // Determine which columns to display (from selectedColumns or exclude key/slug)
                $selected_columns = $card_data['filters']['selectedColumns'] ?? [];
                $display_cols = [];

                if (!empty($selected_columns)) {
                    // Use selectedColumns from card metadata
                    foreach ($selected_columns as $col) {
                        $col_name = $col['name'] ?? '';
                        $col_idx = array_search(strtolower($col_name), array_map('strtolower', $headers));
                        if ($col_idx !== false) {
                            $display_cols[] = (int) $col_idx;
                        }
                    }
                }

                if (empty($display_cols)) {
                    // Fallback: show all columns except key and slug
                    $hidden = ['key', 'slug'];
                    for ($c = 0; $c < count($headers); $c++) {
                        if (!in_array(strtolower($headers[$c]), $hidden)) {
                            $display_cols[] = $c;
                        }
                    }
                }

                if (!empty($rows)) {
                    $html .= '<div class="cards-grid">';
                    foreach ($rows as $row) {
                        $html .= '<div class="contentful-card">';
                        foreach ($display_cols as $col_idx) {
                            $header = $headers[$col_idx] ?? '';
                            $cell = $row[$col_idx] ?? '';
                            if (!empty($cell)) {
                                $html .= '<div class="card-field">';
                                if ($header)
                                    $html .= '<span class="card-label">' . esc_html($this->format_header_label($header)) . ':</span> ';
                                $html .= '<span class="card-value">' . wp_kses_post($cell) . '</span>';
                                $html .= '</div>';
                            }
                        }
                        $html .= '</div>';
                    }
                    $html .= '</div>';
                } else {
                    $html .= '<p class="cards-placeholder">No listings found.</p>';
                }
            } else {
                $html .= '<p class="cards-placeholder">[Provider listings]</p>';
            }
        } else {
            $html .= '<p class="cards-placeholder">[Provider listings]</p>';
        }

        $html .= '</div>';

        return $html;
    }

    /**
     * Render form shortcode [contentful_form id="..." title="..." submit="..."]
     */
    public function render_form_shortcode($atts)
    {
        $atts = shortcode_atts([
            'id' => '',
            'title' => 'Contact Us',
            'submit' => 'Send',
            'class' => '',
        ], $atts, 'contentful_form');

        $form_id = sanitize_text_field($atts['id']);
        $title = sanitize_text_field($atts['title']);
        $submit_text = sanitize_text_field($atts['submit']);
        $custom_class = sanitize_text_field($atts['class']);

        $html = '<div class="contentful-form-container' . ($custom_class ? ' ' . esc_attr($custom_class) : '') . '" id="contentful-form-' . esc_attr($form_id) . '">';
        $html .= '<h3>' . esc_html($title) . '</h3>';
        $html .= '<form class="contentful-form" method="post">';
        $html .= '<div class="form-field"><label for="name">Name</label><input type="text" id="name" name="name" required /></div>';
        $html .= '<div class="form-field"><label for="email">Email</label><input type="email" id="email" name="email" required /></div>';
        $html .= '<div class="form-field"><label for="message">Message</label><textarea id="message" name="message" rows="5" required></textarea></div>';
        $html .= '<div class="form-submit"><button type="submit" class="wp-button">' . esc_html($submit_text) . '</button></div>';
        $html .= '</form>';
        $html .= '</div>';

        return $html;
    }

    /**
     * Render table shortcode [contentful_table id="..."] or [contentful-table id="..."]
     */
    public function render_table_shortcode($atts) {
        $atts = shortcode_atts([
            'id' => '',
            'class' => '',
            'title' => '',
            'key' => '',
            'filters' => '',
        ], $atts, 'contentful_table');
        
        $table_id = sanitize_text_field($atts['id']);
        $custom_class = sanitize_text_field($atts['class']);
        $custom_title = sanitize_text_field($atts['title']);
        // Support both "filters" (preferred) and legacy "key" attribute
        $filters_attr = sanitize_text_field($atts['filters']);
        $key_filter = !empty($filters_attr) ? $filters_attr : sanitize_text_field($atts['key']);
        
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
            $html = $this->render_data_table($table_data, $table_id, $key_filter);
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
     * Filter table rows by matching key column values against the filter parameter.
     * 
     * Supports two modes:
     * 1. Direct key match: filters="food" matches rows where key column = "food"
     * 2. Heading-slug resolution: filters="area-agency-on-aging" resolves to key "agency"
     * 
     * Multiple filter values can be separated by commas:
     *   filters="food,agency" matches rows where key = "food" OR key = "agency"
     * 
     * @param array $rows Data rows (without header)
     * @param int $keyColIndex Index of the key column
     * @param string $filterParam The filter value(s) from the shortcode attribute (comma-separated)
     * @param array $keyValues Known key values from table metadata
     * @return array Filtered rows
     */
    private function filter_rows_by_key($rows, $keyColIndex, $filterParam, $keyValues = [])
    {
        if (empty($filterParam) || $keyColIndex < 0)
            return $rows;

        // Parse comma-separated filter values
        $filterValues = array_map('trim', explode(',', $filterParam));
        $filterValues = array_filter($filterValues, function ($v) {
            return $v !== '';
        });

        if (empty($filterValues))
            return $rows;

        // Resolve each filter value to an actual key
        $matchedKeys = [];
        foreach ($filterValues as $filter) {
            $filter = strtolower($filter);

            // Check if the filter value is already a direct key match
            $lowercaseKeyValues = array_map('strtolower', array_map('trim', $keyValues));
            if (in_array($filter, $lowercaseKeyValues)) {
                $matchedKeys[] = $filter;
            } else {
                // Try to resolve as a heading slug
                $resolved = $this->resolve_key_from_heading($filter, $keyValues);
                if ($resolved) {
                    $matchedKeys[] = $resolved;
                }
            }
        }

        if (empty($matchedKeys))
            return $rows;

        $matchedKeys = array_unique($matchedKeys);

        // Filter rows where key column matches any of the resolved keys
        return array_values(array_filter($rows, function ($row) use ($keyColIndex, $matchedKeys) {
            $rowKey = strtolower(trim($row[$keyColIndex] ?? ''));
            return in_array($rowKey, $matchedKeys);
        }));
    }

    /**
     * Resolve which key value matches a heading slug.
     * 
     * Examples:
     *   heading "area-agency-on-aging", keys ["agency","food",...] → "agency"
     *   heading "food-assistance-programs", keys ["agency","food",...] → "food"
     *   heading "home-and-vehicle-repair", keys ["agency","repair",...] → "repair"
     * 
     * @param string $headingSlug Heading text as a slug
     * @param array $keyValues Known key values
     * @return string|null Matched key value or null
     */
    private function resolve_key_from_heading($headingSlug, $keyValues = []) {
        $headingSlug = strtolower($headingSlug);
        $headingWords = preg_split('/[\s\-]+/', $headingSlug);
        
        // If no known key values, try to use the heading slug directly
        if (empty($keyValues)) {
            return $headingSlug;
        }

        // Exact match first
        foreach ($keyValues as $key) {
            $key = strtolower(trim($key));
            if ($headingSlug === $key) {
                return $key;
            }
        }

        // Check if any key value appears as a word in the heading
        foreach ($keyValues as $key) {
            $key = strtolower(trim($key));
            if (in_array($key, $headingWords)) {
                return $key;
            }
        }

        // Starts-with match
        foreach ($keyValues as $key) {
            $key = strtolower(trim($key));
            if (strpos($headingSlug, $key) === 0) {
                return $key;
            }
        }

        // Contains match (last resort)
        foreach ($keyValues as $key) {
            $key = strtolower(trim($key));
            if (strpos($headingSlug, $key) !== false) {
                return $key;
            }
        }

        return null;
    }

    /**
     * Render data table
     * @param array $table_data Table data from JSON
     * @param string $table_id Contentful entry ID
     * @param string $key_filter Optional key value for row filtering (heading slug from shortcode)
     */
    private function render_data_table($table_data, $table_id, $key_filter = '') {
        $html = '<div class="contentful-data-table" id="contentful-table-' . esc_attr($table_id) . '">';
        
        if (!empty($table_data['title']) && empty($key_filter)) {
            // Only show the table title if there's no key filter
            // (when key-filtered, the section heading above already provides context)
            $html .= '<h3>' . esc_html($table_data['title']) . '</h3>';
        }
        
        // Check if this is raw Contentful data structure
        if (isset($table_data['rawData']) && is_array($table_data['rawData'])) {
            $rawData = $table_data['rawData'];
            
            // First row is headers
            $headers = array_shift($rawData);
            
            // Determine the key column index
            $keyColIndex = -1;
            $keyColName = $table_data['keyColumn'] ?? null;

            if (!empty($key_filter)) {
                if ($keyColName) {
                    // Use stored keyColumnIndex from table metadata
                    $keyColIndex = $table_data['keyColumnIndex'] ?? -1;

                    // Fallback: find by column name in headers
                    if ($keyColIndex < 0) {
                        $keyColIndex = array_search($keyColName, $headers);
                        if ($keyColIndex === false)
                            $keyColIndex = -1;
                    }
                }

                // Auto-detect: look for a column named 'key' (case-insensitive)
                if ($keyColIndex < 0) {
                    $lowercaseHeaders = array_map('strtolower', $headers);
                    $keyColIndex = array_search('key', $lowercaseHeaders);
                    if ($keyColIndex === false)
                        $keyColIndex = -1;
                }
            }
            
            // Apply key-based row filtering if key is provided
            if (!empty($key_filter) && $keyColIndex >= 0) {
                $rawData = $this->filter_rows_by_key($rawData, $keyColIndex, $key_filter, $table_data['keyValues'] ?? []);
            }
            
            // Remove the key column from display (headers and rows)
            if ($keyColIndex >= 0) {
                array_splice($headers, $keyColIndex, 1);
                $rawData = array_map(function($row) use ($keyColIndex) {
                    if (is_array($row) && count($row) > $keyColIndex) {
                        array_splice($row, $keyColIndex, 1);
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

    /**
     * WPGraphQL: Apply do_shortcode() to content fields in GraphQL responses.
     *
     * Hooks into graphql_resolve_field to process shortcodes (contentful_table,
     * contentful_toc, contentful_chart, contentful_cards, contentful_form) so
     * they render as HTML instead of raw shortcode text.
     *
     * @param mixed  $result         The resolved field value.
     * @param mixed  $source         The source object (post, term, etc.).
     * @param array  $args           The field arguments.
     * @param mixed  $context        The AppContext.
     * @param mixed  $info           The ResolveInfo.
     * @param string $type_name      The GraphQL type name (e.g., 'Post', 'Page', 'Community').
     * @param string $field_key      The field key (e.g., 'content', 'excerpt').
     * @param mixed  $field_def      The field definition.
     * @param mixed  $field_resolver The field resolver.
     * @return mixed The result with shortcodes rendered as HTML.
     */
    public function graphql_resolve_shortcodes($result, $source, $args, $context, $info, $type_name, $field_key, $field_def, $field_resolver)
    {
        // Only process string results with content in target fields.
        if (!is_string($result) || empty($result)) {
            return $result;
        }

        // Only process known content fields.
        $target_fields = ['content', 'excerpt'];
        if (!in_array($field_key, $target_fields, true)) {
            return $result;
        }

        // Only process known post type GraphQL types.
        $target_types = ['Post', 'Page', 'Community'];
        if (!in_array($type_name, $target_types, true)) {
            return $result;
        }

        // Quick check: skip if no shortcode brackets present.
        if (strpos($result, '[') === false) {
            return $result;
        }

        return do_shortcode($result);
    }

    /**
     * WPGraphQL: Register a dedicated renderedContent field on post types.
     *
     * Provides an explicit GraphQL field that always returns content with all
     * shortcodes processed via do_shortcode(), without modifying the default
     * content field behavior.
     *
     * Usage in GraphQL:
     *   {
     *     posts {
     *       nodes {
     *         title
     *         renderedContent
     *       }
     *     }
     *   }
     */
    public function graphql_register_rendered_content()
    {
        if (!function_exists('register_graphql_field')) {
            return;
        }

        $post_types = [
            'Post' => 'post',
            'Page' => 'page',
            'Community' => 'community',
        ];

        foreach ($post_types as $graphql_type => $wp_type) {
            // Verify the post type exists before registering.
            if (!post_type_exists($wp_type)) {
                continue;
            }

            register_graphql_field($graphql_type, 'renderedContent', [
                'type' => 'String',
                'description' => 'Post content with all shortcodes rendered as HTML.',
                'resolve' => function ($post) {
                    $content = '';

                    // WPGraphQL Post model exposes contentRaw.
                    if (isset($post->contentRaw)) {
                        $content = $post->contentRaw;
                    } elseif (isset($post->ID)) {
                        $post_object = get_post($post->ID);
                        $content = $post_object ? $post_object->post_content : '';
                    }

                    if (empty($content)) {
                        return '';
                    }

                    // Apply shortcodes and formatting.
                    $content = do_shortcode($content);
                    $content = wpautop($content);

                    return $content;
                },
            ]);
        }
    }
}

// Initialize the plugin
new ContentfulTablesPlugin();

// Add error styles for missing tables
add_action('wp_head', function() {
    echo '<style>.contentful-error { padding: 15px; background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; border-radius: 4px; margin: 15px 0; }</style>';
});
