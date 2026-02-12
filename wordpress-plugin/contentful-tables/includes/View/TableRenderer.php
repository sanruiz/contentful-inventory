<?php
/**
 * Table renderer view.
 *
 * @package SilverAssist\ContentfulTables
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   4.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\ContentfulTables\View;

use SilverAssist\ContentfulTables\Utils\Helpers;

/**
 * Renders data tables as HTML.
 *
 * @since 4.0.0
 */
final class TableRenderer {

	/**
	 * Render a data table.
	 *
	 * @since 4.0.0
	 *
	 * @param array<string, mixed> $table_data Table data from JSON.
	 * @param string               $table_id   Contentful entry ID.
	 * @param string               $key_filter Optional key value for row filtering.
	 * @return string Rendered HTML.
	 */
	public static function render( array $table_data, string $table_id, string $key_filter = '' ): string {
		$html = '<div class="contentful-data-table" id="contentful-table-' . \esc_attr( $table_id ) . '">';

		if ( ! empty( $table_data['title'] ) && empty( $key_filter ) ) {
			$html .= '<h3>' . \esc_html( $table_data['title'] ) . '</h3>';
		}

		// Raw data structure (rawData array).
		if ( isset( $table_data['rawData'] ) && \is_array( $table_data['rawData'] ) ) {
			$html .= self::render_raw_data( $table_data, $key_filter );
		} elseif ( isset( $table_data['headers'] ) && isset( $table_data['rows'] ) ) {
			// Legacy format with headers and rows arrays.
			$html .= self::render_legacy( $table_data );
		} else {
			$html .= '<p>No table data available.</p>';
		}

		$html .= '</div>';

		return $html;
	}

	/**
	 * Render table from rawData format.
	 *
	 * @since 4.0.0
	 *
	 * @param array<string, mixed> $table_data Table data.
	 * @param string               $key_filter Key filter value.
	 * @return string Rendered HTML.
	 */
	private static function render_raw_data( array $table_data, string $key_filter ): string {
		$raw_data = $table_data['rawData'];
		$headers  = \array_shift( $raw_data );

		// Determine the key column index.
		$key_col_idx = -1;
		$key_col_name = $table_data['keyColumn'] ?? null;

		if ( ! empty( $key_filter ) ) {
			if ( $key_col_name ) {
				$key_col_idx = $table_data['keyColumnIndex'] ?? -1;
				if ( $key_col_idx < 0 ) {
					$found = \array_search( $key_col_name, $headers, true );
					$key_col_idx = ( false !== $found ) ? (int) $found : -1;
				}
			}

			// Auto-detect: look for a column named 'key'.
			if ( $key_col_idx < 0 ) {
				$found = \array_search( 'key', \array_map( 'strtolower', $headers ), true );
				$key_col_idx = ( false !== $found ) ? (int) $found : -1;
			}
		}

		// Apply key-based row filtering.
		if ( ! empty( $key_filter ) && $key_col_idx >= 0 ) {
			$raw_data = Helpers::filter_rows_by_key(
				$raw_data,
				$key_col_idx,
				$key_filter,
				$table_data['keyValues'] ?? []
			);
		}

		// Remove the key column from display.
		if ( $key_col_idx >= 0 ) {
			\array_splice( $headers, $key_col_idx, 1 );
			$raw_data = \array_map(
				static function ( array $row ) use ( $key_col_idx ): array {
					if ( \count( $row ) > $key_col_idx ) {
						\array_splice( $row, $key_col_idx, 1 );
					}
					return $row;
				},
				$raw_data
			);
		}

		$html  = '<div class="table-responsive">';
		$html .= '<table class="contentful-table">';

		// Headers.
		$html .= '<thead><tr>';
		foreach ( $headers as $header ) {
			$html .= '<th>' . \esc_html( $header ) . '</th>';
		}
		$html .= '</tr></thead>';

		// Data rows.
		$html .= '<tbody>';
		foreach ( $raw_data as $row ) {
			if ( \is_array( $row ) && \count( $row ) > 0 ) {
				$html .= '<tr>';
				foreach ( $row as $cell ) {
					$html .= '<td>' . \wp_kses_post( $cell ) . '</td>';
				}
				$html .= '</tr>';
			}
		}
		$html .= '</tbody></table></div>';

		return $html;
	}

	/**
	 * Render table from legacy headers/rows format.
	 *
	 * @since 4.0.0
	 *
	 * @param array<string, mixed> $table_data Table data.
	 * @return string Rendered HTML.
	 */
	private static function render_legacy( array $table_data ): string {
		$html  = '<div class="table-responsive">';
		$html .= '<table class="contentful-table">';

		if ( \is_array( $table_data['headers'] ) ) {
			$html .= '<thead><tr>';
			foreach ( $table_data['headers'] as $header ) {
				$html .= '<th>' . \esc_html( $header ) . '</th>';
			}
			$html .= '</tr></thead>';
		}

		if ( \is_array( $table_data['rows'] ) ) {
			$html .= '<tbody>';
			foreach ( $table_data['rows'] as $row ) {
				if ( \is_array( $row ) ) {
					$html .= '<tr>';
					foreach ( $row as $cell ) {
						$html .= '<td>' . \wp_kses_post( $cell ) . '</td>';
					}
					$html .= '</tr>';
				}
			}
			$html .= '</tbody>';
		}

		$html .= '</table></div>';

		return $html;
	}
}
