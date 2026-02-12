<?php
/**
 * Table data loader service.
 *
 * @package SilverAssist\ContentfulTables
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   4.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\ContentfulTables\Service;

use SilverAssist\ContentfulTables\Core\Interfaces\LoadableInterface;
use SilverAssist\ContentfulTables\Utils\CsvParser;

/**
 * Loads table, chart, and card data from files, post meta, and database.
 *
 * Priority 10 — loads before shortcode renderers.
 *
 * @since 4.0.0
 */
final class TableDataLoader implements LoadableInterface {

	/**
	 * Loaded table data keyed by entry ID.
	 *
	 * @since 4.0.0
	 *
	 * @var array<string, array<string, mixed>>
	 */
	private array $tables_data = [];

	/**
	 * Loaded chart data keyed by entry ID.
	 *
	 * @since 4.0.0
	 *
	 * @var array<string, array<string, mixed>>
	 */
	private array $charts_data = [];

	/**
	 * Loaded card data keyed by entry ID.
	 *
	 * @since 4.0.0
	 *
	 * @var array<string, array<string, mixed>>
	 */
	private array $cards_data = [];

	/**
	 * Return the loading priority.
	 *
	 * @since 4.0.0
	 *
	 * @return int Loading priority.
	 */
	public function priority(): int {
		return 10;
	}

	/**
	 * Register WordPress hooks.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	public function register(): void {
		\add_action( 'init', [ $this, 'load_all_data' ] );
	}

	/**
	 * Load all content data on init.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	public function load_all_data(): void {
		$this->load_tables_data();
		$this->load_charts_data();
		$this->load_cards_data();
	}

	/**
	 * Get the tables data array.
	 *
	 * @since 4.0.0
	 *
	 * @return array<string, array<string, mixed>> Tables keyed by entry ID.
	 */
	public function get_tables_data(): array {
		return $this->tables_data;
	}

	/**
	 * Get a single table by ID.
	 *
	 * @since 4.0.0
	 *
	 * @param string $table_id Entry ID.
	 * @return array<string, mixed>|null Table data or null.
	 */
	public function get_table( string $table_id ): ?array {
		return $this->tables_data[ $table_id ] ?? null;
	}

	/**
	 * Get the charts data array.
	 *
	 * @since 4.0.0
	 *
	 * @return array<string, array<string, mixed>> Charts keyed by entry ID.
	 */
	public function get_charts_data(): array {
		return $this->charts_data;
	}

	/**
	 * Get a single chart by ID.
	 *
	 * @since 4.0.0
	 *
	 * @param string $chart_id Entry ID.
	 * @return array<string, mixed>|null Chart data or null.
	 */
	public function get_chart( string $chart_id ): ?array {
		return $this->charts_data[ $chart_id ] ?? null;
	}

	/**
	 * Get the cards data array.
	 *
	 * @since 4.0.0
	 *
	 * @return array<string, array<string, mixed>> Cards keyed by entry ID.
	 */
	public function get_cards_data(): array {
		return $this->cards_data;
	}

	/**
	 * Get a single card by ID.
	 *
	 * @since 4.0.0
	 *
	 * @param string $card_id Entry ID.
	 * @return array<string, mixed>|null Card data or null.
	 */
	public function get_card( string $card_id ): ?array {
		return $this->cards_data[ $card_id ] ?? null;
	}

	/**
	 * Get card rows from card data.
	 *
	 * Supports inline tableData, rawData, cached CSV, or remote spreadsheet.
	 *
	 * @since 4.0.0
	 *
	 * @param array<string, mixed> $card_data Card data from JSON.
	 * @return array<int, array<int, string>> Array of rows (first row = headers).
	 */
	public function get_card_rows( array $card_data ): array {
		// Source 1: inline tableData.
		if ( isset( $card_data['source']['dataTable']['tableData'] ) ) {
			return $card_data['source']['dataTable']['tableData'];
		}

		// Source 2: rawData (pre-parsed CSV data in the JSON file).
		if ( isset( $card_data['rawData'] ) && \is_array( $card_data['rawData'] ) ) {
			return $card_data['rawData'];
		}

		// Source 3: cached CSV file for this card.
		$card_id = $card_data['id'] ?? '';
		if ( ! empty( $card_id ) ) {
			$csv_path = WP_CONTENT_DIR . '/contentful-cards/' . $card_id . '.csv';
			if ( \file_exists( $csv_path ) ) {
				$cache_key = 'ctfl_card_csv_' . \substr( \md5( $card_id ), 0, 16 );
				$cached    = \get_transient( $cache_key );
				if ( false !== $cached ) {
					return $cached;
				}

				$csv_content = \file_get_contents( $csv_path );
				if ( false !== $csv_content ) {
					$rows = CsvParser::parse( $csv_content );
					\set_transient( $cache_key, $rows, DAY_IN_SECONDS );
					return $rows;
				}
			}
		}

		// Source 4: download spreadsheet and cache locally.
		if (
			isset( $card_data['source']['type'] ) &&
			'spreadsheet' === $card_data['source']['type'] &&
			! empty( $card_data['source']['url'] )
		) {
			$url = $card_data['source']['url'];
			if ( 0 === \strpos( $url, '//' ) ) {
				$url = 'https:' . $url;
			}

			$response = \wp_remote_get( $url, [ 'timeout' => 30 ] );
			if ( ! \is_wp_error( $response ) && 200 === \wp_remote_retrieve_response_code( $response ) ) {
				$csv_content = \wp_remote_retrieve_body( $response );
				if ( ! empty( $csv_content ) ) {
					if ( ! empty( $card_id ) ) {
						$csv_path = WP_CONTENT_DIR . '/contentful-cards/' . $card_id . '.csv';
						// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- Writing cached CSV.
						\file_put_contents( $csv_path, $csv_content );
					}
					return CsvParser::parse( $csv_content );
				}
			}
		}

		return [];
	}

	/**
	 * Load table data from files, post meta, or database.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	private function load_tables_data(): void {
		// First try JSON/CSV files.
		$this->load_tables_from_files();

		// Fallback to post meta.
		if ( empty( $this->tables_data ) ) {
			$this->load_tables_from_post_meta();
		}

		// Fallback to database table.
		if ( empty( $this->tables_data ) ) {
			$this->load_tables_from_database();
		}
	}

	/**
	 * Load table data from JSON and CSV files in wp-content/contentful-tables/.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	private function load_tables_from_files(): void {
		$tables_dir = WP_CONTENT_DIR . '/contentful-tables/';

		if ( ! \is_dir( $tables_dir ) ) {
			return;
		}

		// Load JSON files.
		$json_files = \glob( $tables_dir . '*.json' );
		if ( ! empty( $json_files ) ) {
			foreach ( $json_files as $file ) {
				$table_id   = \basename( $file, '.json' );
				$table_data = \json_decode( (string) \file_get_contents( $file ), true );

				if ( $table_data && isset( $table_data['type'] ) ) {
					$this->tables_data[ $table_id ] = $table_data;
				}
			}
		}

		// Load CSV files (parsed into rawData format).
		$csv_files = \glob( $tables_dir . '*.csv' );
		if ( ! empty( $csv_files ) ) {
			foreach ( $csv_files as $file ) {
				$table_id = \basename( $file, '.csv' );
				// Skip if already loaded from JSON.
				if ( isset( $this->tables_data[ $table_id ] ) ) {
					continue;
				}

				$csv_content = \file_get_contents( $file );
				if ( false !== $csv_content ) {
					$raw_data = CsvParser::parse( $csv_content );
					if ( ! empty( $raw_data ) ) {
						$headers       = $raw_data[0];
						$key_col_index = \array_search( 'key', \array_map( 'strtolower', $headers ), true );
						$key_column    = ( false !== $key_col_index ) ? $headers[ $key_col_index ] : null;
						$key_values    = [];

						if ( false !== $key_col_index ) {
							$data_rows  = \array_slice( $raw_data, 1 );
							$key_values = \array_values(
								\array_unique(
									\array_filter(
										\array_map(
											static function ( array $row ) use ( $key_col_index ): string {
												return \trim( $row[ $key_col_index ] ?? '' );
											},
											$data_rows
										)
									)
								)
							);
						}

						$this->tables_data[ $table_id ] = [
							'type'           => 'Plain',
							'title'          => '',
							'style'          => 'Equal Width',
							'theme'          => 'Standard',
							'fullWidth'      => true,
							'rawData'        => $raw_data,
							'keyColumn'      => $key_column,
							'keyColumnIndex' => ( false !== $key_col_index ) ? (int) $key_col_index : -1,
							'keyValues'      => $key_values,
						];
					}
				}
			}
		}

		if ( ! empty( $this->tables_data ) ) {
			\update_option( 'contentful_tables_source', 'files' );
			\update_option( 'contentful_tables_post_id', 'JSON/CSV Files' );
		}
	}

	/**
	 * Load table data from WordPress post meta.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	private function load_tables_from_post_meta(): void {
		$possible_post_ids = [ 241, 240, 238, 236, 235, 237, 239 ];

		foreach ( $possible_post_ids as $post_id ) {
			$post_meta = \get_post_meta( $post_id );

			if ( empty( $post_meta ) ) {
				continue;
			}

			$found_tables = false;
			foreach ( $post_meta as $meta_key => $meta_values ) {
				if ( 0 === \strpos( $meta_key, 'contentful_table_' ) ) {
					$table_id   = \str_replace( 'contentful_table_', '', $meta_key );
					$table_data = \json_decode( $meta_values[0], true );

					if ( $table_data ) {
						$this->tables_data[ $table_id ] = $table_data;
						$found_tables                   = true;
					}
				}
			}

			if ( $found_tables ) {
				\update_option( 'contentful_tables_post_id', $post_id );
				break;
			}
		}
	}

	/**
	 * Load table data from the custom database table.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	private function load_tables_from_database(): void {
		global $wpdb;

		$table_name = $wpdb->prefix . 'contentful_tables';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$exists = $wpdb->get_var(
			$wpdb->prepare( 'SHOW TABLES LIKE %s', $table_name )
		);

		if ( $exists !== $table_name ) {
			return;
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$results = $wpdb->get_results(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name is prefixed, not user input.
			"SELECT table_id, table_data FROM {$table_name}",
			ARRAY_A
		);

		if ( ! \is_array( $results ) ) {
			return;
		}

		foreach ( $results as $row ) {
			$table_data = \json_decode( $row['table_data'], true );
			if ( $table_data ) {
				$this->tables_data[ $row['table_id'] ] = $table_data;
			}
		}
	}

	/**
	 * Load chart data from JSON files in wp-content/contentful-charts/.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	private function load_charts_data(): void {
		$charts_dir = WP_CONTENT_DIR . '/contentful-charts/';
		if ( ! \is_dir( $charts_dir ) ) {
			return;
		}

		$json_files = \glob( $charts_dir . '*.json' );
		if ( empty( $json_files ) ) {
			return;
		}

		foreach ( $json_files as $file ) {
			$chart_id   = \basename( $file, '.json' );
			$chart_data = \json_decode( (string) \file_get_contents( $file ), true );
			if ( $chart_data ) {
				$this->charts_data[ $chart_id ] = $chart_data;
			}
		}
	}

	/**
	 * Load card data from JSON files in wp-content/contentful-cards/.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	private function load_cards_data(): void {
		$cards_dir = WP_CONTENT_DIR . '/contentful-cards/';
		if ( ! \is_dir( $cards_dir ) ) {
			return;
		}

		$json_files = \glob( $cards_dir . '*.json' );
		if ( empty( $json_files ) ) {
			return;
		}

		foreach ( $json_files as $file ) {
			$card_id   = \basename( $file, '.json' );
			$card_data = \json_decode( (string) \file_get_contents( $file ), true );
			if ( $card_data ) {
				$this->cards_data[ $card_id ] = $card_data;
			}
		}
	}
}
