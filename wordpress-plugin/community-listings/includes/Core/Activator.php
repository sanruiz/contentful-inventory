<?php
/**
 * Activation and deactivation handlers.
 *
 * @package SilverAssist\CommunityListings
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   2.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\CommunityListings\Core;

use SilverAssist\CommunityListings\Service\CptRegistrar;

/**
 * Handles plugin activation and deactivation.
 *
 * @since 2.0.0
 */
final class Activator {

	/**
	 * Run on plugin activation.
	 *
	 * Registers the CPT and flushes rewrite rules.
	 *
	 * @since 2.0.0
	 *
	 * @return void
	 */
	public static function activate(): void {
		CptRegistrar::register_post_type();
		\flush_rewrite_rules();
	}

	/**
	 * Run on plugin deactivation.
	 *
	 * Flushes rewrite rules to clean up.
	 *
	 * @since 2.0.0
	 *
	 * @return void
	 */
	public static function deactivate(): void {
		\flush_rewrite_rules();
	}
}
