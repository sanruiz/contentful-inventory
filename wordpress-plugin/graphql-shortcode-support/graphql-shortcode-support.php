<?php
/**
 * Plugin Name: GraphQL Shortcode Support
 * Plugin URI: https://github.com/SilverAssist/graphql-shortcode-support
 * Description: Applies do_shortcode() to WPGraphQL content fields, rendering shortcodes as HTML in GraphQL responses.
 * Version: 1.0.0
 * Author: Silver Assist
 * Author URI: https://silverassist.com
 * License: PolyForm-Noncommercial-1.0.0
 * License URI: https://polyformproject.org/licenses/noncommercial/1.0.0/
 * Text Domain: graphql-shortcode-support
 * Domain Path: /languages
 * Requires at least: 6.5
 * Tested up to: 6.8
 * Requires PHP: 8.2
 * Network: false
 * Update URI: https://github.com/SilverAssist/graphql-shortcode-support
 *
 * @package SilverAssist\GraphQLShortcodeSupport
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   1.0.0
 */

// Prevent direct access.
\defined( 'ABSPATH' ) || exit;

// Define plugin constants.
define( 'GSS_VERSION', '1.0.0' );
define( 'GSS_FILE', __FILE__ );
define( 'GSS_PATH', plugin_dir_path( __FILE__ ) );
define( 'GSS_BASENAME', plugin_basename( __FILE__ ) );

/**
 * Composer autoloader with security validation.
 */
$gss_autoload_path      = GSS_PATH . 'vendor/autoload.php';
$gss_real_autoload_path = realpath( $gss_autoload_path );
$gss_plugin_real_path   = realpath( GSS_PATH );

// Validate: both paths resolve, autoloader is inside plugin directory.
if (
	$gss_real_autoload_path &&
	$gss_plugin_real_path &&
	0 === strpos( $gss_real_autoload_path, $gss_plugin_real_path )
) {
	require_once $gss_real_autoload_path;
} else {
	\add_action(
		'admin_notices',
		function () {
			printf(
				'<div class="notice notice-error"><p>%s</p></div>',
				\esc_html__( 'GraphQL Shortcode Support: Missing or invalid Composer dependencies. Run "composer install".', 'graphql-shortcode-support' )
			);
		}
	);
	return;
}

// Initialize plugin.
\add_action(
	'plugins_loaded',
	function () {
		\SilverAssist\GraphQLShortcodeSupport\Core\Plugin::instance()->init();
	}
);

// Register activation hook.
\register_activation_hook(
	__FILE__,
	function () {
		\SilverAssist\GraphQLShortcodeSupport\Core\Activator::activate();
	}
);

// Register deactivation hook.
\register_deactivation_hook(
	__FILE__,
	function () {
		\SilverAssist\GraphQLShortcodeSupport\Core\Activator::deactivate();
	}
);
