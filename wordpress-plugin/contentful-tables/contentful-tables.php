<?php
/**
 * Plugin Name: Contentful Tables
 * Plugin URI: https://github.com/SilverAssist/contentful-tables
 * Description: Displays Contentful content components (tables, charts, cards, forms) using shortcodes with WPGraphQL support.
 * Version: 4.0.0
 * Author: Silver Assist
 * Author URI: https://silverassist.com
 * License: PolyForm-Noncommercial-1.0.0
 * License URI: https://polyformproject.org/licenses/noncommercial/1.0.0/
 * Text Domain: contentful-tables
 * Domain Path: /languages
 * Requires at least: 6.5
 * Tested up to: 6.8
 * Requires PHP: 8.2
 * Network: false
 * Update URI: https://github.com/SilverAssist/contentful-tables
 *
 * @package SilverAssist\ContentfulTables
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   1.0.0
 */

// Prevent direct access.
\defined( 'ABSPATH' ) || exit;

// Define plugin constants.
\define( 'CTFL_TABLES_VERSION', '4.0.0' );
\define( 'CTFL_TABLES_FILE', __FILE__ );
\define( 'CTFL_TABLES_PATH', \plugin_dir_path( __FILE__ ) );
\define( 'CTFL_TABLES_URL', \plugin_dir_url( __FILE__ ) );
\define( 'CTFL_TABLES_BASENAME', \plugin_basename( __FILE__ ) );

/**
 * Composer autoloader with security validation.
 */
$ctfl_tables_autoload_path      = CTFL_TABLES_PATH . 'vendor/autoload.php';
$ctfl_tables_real_autoload_path = \realpath( $ctfl_tables_autoload_path );
$ctfl_tables_plugin_real_path   = \realpath( CTFL_TABLES_PATH );

// Validate: both paths resolve, autoloader is inside plugin directory.
if (
	$ctfl_tables_real_autoload_path &&
	$ctfl_tables_plugin_real_path &&
	0 === \strpos( $ctfl_tables_real_autoload_path, $ctfl_tables_plugin_real_path )
) {
	require_once $ctfl_tables_real_autoload_path;
} else {
	\add_action(
		'admin_notices',
		function () {
			\printf(
				'<div class="notice notice-error"><p>%s</p></div>',
				\esc_html__( 'Contentful Tables: Missing or invalid Composer dependencies. Run "composer install".', 'contentful-tables' )
			);
		}
	);
	return;
}

// Initialize plugin.
\add_action(
	'plugins_loaded',
	function () {
		\SilverAssist\ContentfulTables\Core\Plugin::instance()->init();
	}
);

// Register activation hook.
\register_activation_hook(
	__FILE__,
	function () {
		\SilverAssist\ContentfulTables\Core\Activator::activate();
	}
);

// Register deactivation hook.
\register_deactivation_hook(
	__FILE__,
	function () {
		\SilverAssist\ContentfulTables\Core\Activator::deactivate();
	}
);
