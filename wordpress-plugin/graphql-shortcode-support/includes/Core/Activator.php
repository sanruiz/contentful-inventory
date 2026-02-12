<?php
/**
 * Plugin Activator.
 *
 * Handles plugin activation and deactivation logic.
 *
 * @package SilverAssist\GraphQLShortcodeSupport\Core
 * @since   1.0.0
 */

namespace SilverAssist\GraphQLShortcodeSupport\Core;

// Prevent direct access.
\defined( 'ABSPATH' ) || exit;

/**
 * Activator class.
 *
 * @since 1.0.0
 */
class Activator {

	/**
	 * Plugin activation logic.
	 *
	 * Sets default options for the plugin.
	 *
	 * @return void
	 */
	public static function activate(): void {
		self::set_default_options();
		\flush_rewrite_rules();
	}

	/**
	 * Plugin deactivation logic.
	 *
	 * @return void
	 */
	public static function deactivate(): void {
		\flush_rewrite_rules();
	}

	/**
	 * Set default plugin options.
	 *
	 * @return void
	 */
	private static function set_default_options(): void {
		if ( ! \get_option( 'gss_settings' ) ) {
			\update_option(
				'gss_settings',
				[
					'enabled'    => true,
					'post_types' => [ 'post', 'page', 'community' ],
					'fields'     => [ 'content' ],
				]
			);
		}
	}
}
