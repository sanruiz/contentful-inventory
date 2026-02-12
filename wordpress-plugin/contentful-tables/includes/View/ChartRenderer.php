<?php
/**
 * Chart renderer view.
 *
 * @package SilverAssist\ContentfulTables
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   4.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\ContentfulTables\View;

/**
 * Renders chart components as HTML tables with chart styling.
 *
 * @since 4.0.0
 */
final class ChartRenderer {

	/**
	 * Render a chart component.
	 *
	 * @since 4.0.0
	 *
	 * @param array<string, mixed>|null $chart_data Chart data from JSON.
	 * @param string                    $chart_id   Contentful entry ID.
	 * @param array<string, string>     $atts       Shortcode attributes.
	 * @return string Rendered HTML.
	 */
	public static function render( ?array $chart_data, string $chart_id, array $atts ): string {
		$custom_title = \sanitize_text_field( $atts['title'] ?? '' );
		$custom_class = \sanitize_text_field( $atts['class'] ?? '' );

		$title    = $custom_title ?: ( $chart_data['title'] ?? '' );
		$viz_type = $chart_data['visualizationType'] ?? ( $atts['type'] ?? '' );

		$html = '<div class="contentful-chart' . ( $custom_class ? ' ' . \esc_attr( $custom_class ) : '' ) . '" id="contentful-chart-' . \esc_attr( $chart_id ) . '">';

		if ( ! empty( $title ) ) {
			$html .= '<h3 class="chart-title">' . \esc_html( $title ) . '</h3>';
		}

		if ( $chart_data && isset( $chart_data['source'] ) ) {
			$html .= self::render_source( $chart_data );
		} else {
			$html .= '<p class="chart-placeholder">[' . \esc_html( $viz_type ) . ']</p>';
		}

		$html .= '</div>';

		return $html;
	}

	/**
	 * Render chart source data.
	 *
	 * @since 4.0.0
	 *
	 * @param array<string, mixed> $chart_data Chart data.
	 * @return string Rendered HTML.
	 */
	private static function render_source( array $chart_data ): string {
		$source       = $chart_data['source'];
		$label_prefix = $chart_data['labelPrefix'] ?? '';

		if ( 'table' === $source['type'] && isset( $source['dataTable']['tableData'] ) ) {
			return self::render_table_source( $source['dataTable']['tableData'], $label_prefix );
		}

		if ( 'spreadsheet' === $source['type'] && ! empty( $source['url'] ) ) {
			return '<p class="chart-source">Data source: <a href="' . \esc_url( $source['url'] ) . '" target="_blank">Download spreadsheet</a></p>';
		}

		return '';
	}

	/**
	 * Render a table-based chart source.
	 *
	 * @since 4.0.0
	 *
	 * @param array<int, array<int, string>> $table_rows Table data rows.
	 * @param string                          $label_prefix Prefix for numeric values.
	 * @return string Rendered HTML.
	 */
	private static function render_table_source( array $table_rows, string $label_prefix ): string {
		if ( empty( $table_rows ) ) {
			return '';
		}

		$headers = \array_shift( $table_rows );

		$html  = '<div class="table-responsive">';
		$html .= '<table class="contentful-table contentful-chart-table">';
		$html .= '<thead><tr>';

		foreach ( $headers as $h ) {
			$html .= '<th>' . \esc_html( $h ) . '</th>';
		}

		$html .= '</tr></thead><tbody>';

		foreach ( $table_rows as $row ) {
			$html .= '<tr>';
			foreach ( $row as $i => $cell ) {
				$display = $cell;
				if ( $i > 0 && \is_numeric( $cell ) && $label_prefix ) {
					$display = $label_prefix . \number_format( (float) $cell );
				}
				$html .= '<td>' . \esc_html( $display ) . '</td>';
			}
			$html .= '</tr>';
		}

		$html .= '</tbody></table></div>';

		return $html;
	}
}
