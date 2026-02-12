<?php
/**
 * Cards renderer view.
 *
 * @package SilverAssist\ContentfulTables
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   4.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\ContentfulTables\View;

use SilverAssist\ContentfulTables\Service\TableDataLoader;
use SilverAssist\ContentfulTables\Utils\Helpers;

/**
 * Renders card grid components as HTML.
 *
 * @since 4.0.0
 */
final class CardsRenderer {

	/**
	 * Render a cards component.
	 *
	 * @since 4.0.0
	 *
	 * @param array<string, mixed>|null $card_data   Card data from JSON.
	 * @param string                    $card_id     Contentful entry ID.
	 * @param array<string, string>     $atts        Shortcode attributes.
	 * @param TableDataLoader           $data_loader Data loader for card rows.
	 * @return string Rendered HTML.
	 */
	public static function render( ?array $card_data, string $card_id, array $atts, TableDataLoader $data_loader ): string {
		$custom_title = \sanitize_text_field( $atts['title'] ?? '' );
		$custom_class = \sanitize_text_field( $atts['class'] ?? '' );
		$filters_attr = \sanitize_text_field( $atts['filters'] ?? '' );

		$title = $custom_title ?: ( $card_data['title'] ?? '' );
		$title = Helpers::resolve_title_placeholders( $title );

		// Determine key filter.
		$key_filter       = $filters_attr;
		$has_selected_key = ! empty( $card_data['filters']['selectedKey'] );

		if ( empty( $key_filter ) && $has_selected_key ) {
			$key_filter = 'auto';
		}

		if ( 'auto' === $key_filter ) {
			$post       = \get_post();
			$key_filter = $post ? $post->post_name : '';
		}

		$html = '<div class="contentful-cards' . ( $custom_class ? ' ' . \esc_attr( $custom_class ) : '' ) . '" id="contentful-cards-' . \esc_attr( $card_id ) . '">';

		if ( ! empty( $title ) ) {
			$html .= '<h3 class="cards-title">' . \esc_html( $title ) . '</h3>';
		}

		if ( $card_data ) {
			$rows = $data_loader->get_card_rows( $card_data );
			$html .= self::render_card_grid( $rows, $card_data, $key_filter );
		} else {
			$html .= '<p class="cards-placeholder">[Provider listings]</p>';
		}

		$html .= '</div>';

		return $html;
	}

	/**
	 * Render the card grid from rows.
	 *
	 * @since 4.0.0
	 *
	 * @param array<int, array<int, string>> $rows       Card rows (first row = headers).
	 * @param array<string, mixed>           $card_data  Card metadata.
	 * @param string                         $key_filter Key filter value.
	 * @return string Rendered HTML.
	 */
	private static function render_card_grid( array $rows, array $card_data, string $key_filter ): string {
		if ( empty( $rows ) ) {
			return '<p class="cards-placeholder">[Provider listings]</p>';
		}

		$headers = \array_shift( $rows );

		// Find key column index.
		$key_col_idx = -1;
		if ( ! empty( $key_filter ) ) {
			$key_col_idx = $card_data['keyColumnIndex'] ?? -1;
			if ( $key_col_idx < 0 ) {
				$lowercase_headers = \array_map( 'strtolower', $headers );
				$found             = \array_search( 'key', $lowercase_headers, true );
				$key_col_idx       = ( false !== $found ) ? (int) $found : -1;
			}
		}

		// Filter rows by key.
		if ( ! empty( $key_filter ) && $key_col_idx >= 0 ) {
			$rows = \array_values(
				\array_filter(
					$rows,
					static function ( array $row ) use ( $key_col_idx, $key_filter ): bool {
						$row_key = \strtolower( \trim( $row[ $key_col_idx ] ?? '' ) );
						return $row_key === \strtolower( $key_filter );
					}
				)
			);
		}

		// Determine display columns.
		$display_cols      = [];
		$selected_columns = $card_data['filters']['selectedColumns'] ?? [];

		if ( ! empty( $selected_columns ) ) {
			foreach ( $selected_columns as $col ) {
				$col_name = $col['name'] ?? '';
				$col_idx  = \array_search( \strtolower( $col_name ), \array_map( 'strtolower', $headers ), true );
				if ( false !== $col_idx ) {
					$display_cols[] = (int) $col_idx;
				}
			}
		}

		if ( empty( $display_cols ) ) {
			$hidden = [ 'key', 'slug' ];
			for ( $c = 0, $count = \count( $headers ); $c < $count; $c++ ) {
				if ( ! \in_array( \strtolower( $headers[ $c ] ), $hidden, true ) ) {
					$display_cols[] = $c;
				}
			}
		}

		if ( empty( $rows ) ) {
			return '<p class="cards-placeholder">No listings found.</p>';
		}

		$html = '<div class="cards-grid">';
		foreach ( $rows as $row ) {
			$html .= '<div class="contentful-card">';
			foreach ( $display_cols as $col_idx ) {
				$header = $headers[ $col_idx ] ?? '';
				$cell   = $row[ $col_idx ] ?? '';
				if ( ! empty( $cell ) ) {
					$html .= '<div class="card-field">';
					if ( $header ) {
						$html .= '<span class="card-label">' . \esc_html( Helpers::format_header_label( $header ) ) . ':</span> ';
					}
					$html .= '<span class="card-value">' . \wp_kses_post( $cell ) . '</span>';
					$html .= '</div>';
				}
			}
			$html .= '</div>';
		}
		$html .= '</div>';

		return $html;
	}
}
