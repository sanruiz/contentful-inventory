<?php
/**
 * Activation and deactivation handlers.
 *
 * @package SilverAssist\ContentfulTables
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   4.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\ContentfulTables\Core;

/**
 * Handles plugin activation and deactivation.
 *
 * @since 4.0.0
 */
final class Activator {

	/**
	 * Run on plugin activation.
	 *
	 * Creates the contentful_tables database table and default options.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	public static function activate(): void {
		self::create_database_table();

		\update_option( 'contentful_tables_version', CTFL_TABLES_VERSION );
		\update_option( 'contentful_tables_flush_needed', 'yes' );
	}

	/**
	 * Run on plugin deactivation.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	public static function deactivate(): void {
		\delete_option( 'contentful_tables_flush_needed' );
	}

	/**
	 * Create the contentful_tables database table.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	private static function create_database_table(): void {
		global $wpdb;

		$table_name      = $wpdb->prefix . 'contentful_tables';
		$charset_collate = $wpdb->get_charset_collate();

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.SchemaChange -- Required for plugin installation.
		$sql = "CREATE TABLE IF NOT EXISTS {$table_name} (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			entry_id VARCHAR(255) NOT NULL,
			table_name VARCHAR(255) NOT NULL,
			table_data LONGTEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			PRIMARY KEY (id),
			UNIQUE KEY entry_id (entry_id)
		) {$charset_collate};";

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		\dbDelta( $sql );
	}
}
