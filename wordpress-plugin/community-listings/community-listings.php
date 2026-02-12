<?php
/**
 * Plugin Name: Community Listings CPT
 * Plugin URI: https://github.com/SilverAssist/community-listings
 * Description: Registers a hierarchical "Community" custom post type for state and city memory care listings with WPGraphQL support.
 * Version: 2.0.0
 * Author: Silver Assist
 * Author URI: https://silverassist.com
 * License: PolyForm-Noncommercial-1.0.0
 * License URI: https://polyformproject.org/licenses/noncommercial/1.0.0/
 * Text Domain: community-listings
 * Domain Path: /languages
 * Requires at least: 6.5
 * Tested up to: 6.8
 * Requires PHP: 8.2
 * Network: false
 * Update URI: https://github.com/SilverAssist/community-listings
 *
 * @package SilverAssist\CommunityListings
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   1.0.0
 */

// Prevent direct access.
\defined( 'ABSPATH' ) || exit;

// Define plugin constants.
\define( 'CMTY_LISTINGS_VERSION', '2.0.0' );
\define( 'CMTY_LISTINGS_FILE', __FILE__ );
\define( 'CMTY_LISTINGS_PATH', \plugin_dir_path( __FILE__ ) );
\define( 'CMTY_LISTINGS_URL', \plugin_dir_url( __FILE__ ) );
\define( 'CMTY_LISTINGS_BASENAME', \plugin_basename( __FILE__ ) );

/**
 * Composer autoloader with security validation.
 */
$cmty_listings_autoload_path      = CMTY_LISTINGS_PATH . 'vendor/autoload.php';
$cmty_listings_real_autoload_path = \realpath( $cmty_listings_autoload_path );
$cmty_listings_plugin_real_path   = \realpath( CMTY_LISTINGS_PATH );

// Validate: both paths resolve, autoloader is inside plugin directory.
if (
	$cmty_listings_real_autoload_path &&
	$cmty_listings_plugin_real_path &&
	0 === \strpos( $cmty_listings_real_autoload_path, $cmty_listings_plugin_real_path )
) {
	require_once $cmty_listings_real_autoload_path;
} else {
	\add_action(
		'admin_notices',
		function () {
			\printf(
				'<div class="notice notice-error"><p>%s</p></div>',
				\esc_html__( 'Community Listings: Missing or invalid Composer dependencies. Run "composer install".', 'community-listings' )
			);
		}
	);
	return;
}

// Initialize plugin.
\add_action(
	'plugins_loaded',
	function () {
		\SilverAssist\CommunityListings\Core\Plugin::instance()->init();
	}
);

// Register activation hook.
\register_activation_hook(
	__FILE__,
	function () {
		\SilverAssist\CommunityListings\Core\Activator::activate();
	}
);

// Register deactivation hook.
\register_deactivation_hook(
	__FILE__,
	function () {
		\SilverAssist\CommunityListings\Core\Activator::deactivate();
	}
);
