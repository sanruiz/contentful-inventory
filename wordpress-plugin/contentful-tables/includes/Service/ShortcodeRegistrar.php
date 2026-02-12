<?php
/**
 * Shortcode registrar service.
 *
 * @package SilverAssist\ContentfulTables
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   4.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\ContentfulTables\Service;

use SilverAssist\ContentfulTables\Core\Interfaces\LoadableInterface;
use SilverAssist\ContentfulTables\View\CardsRenderer;
use SilverAssist\ContentfulTables\View\ChartRenderer;
use SilverAssist\ContentfulTables\View\FormRenderer;
use SilverAssist\ContentfulTables\View\TableRenderer;
use SilverAssist\ContentfulTables\View\TocRenderer;

/**
 * Registers all shortcodes and delegates rendering to view classes.
 *
 * Priority 20 — registers after data loader.
 *
 * @since 4.0.0
 */
final class ShortcodeRegistrar implements LoadableInterface {

	/**
	 * Shared data loader.
	 *
	 * @since 4.0.0
	 *
	 * @var TableDataLoader
	 */
	private TableDataLoader $data_loader;

	/**
	 * Constructor.
	 *
	 * @since 4.0.0
	 *
	 * @param TableDataLoader $data_loader Shared data loader instance.
	 */
	public function __construct( TableDataLoader $data_loader ) {
		$this->data_loader = $data_loader;
	}

	/**
	 * Return the loading priority.
	 *
	 * @since 4.0.0
	 *
	 * @return int Loading priority.
	 */
	public function priority(): int {
		return 20;
	}

	/**
	 * Register all shortcodes and related hooks.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	public function register(): void {
		// Register shortcodes with both underscore and hyphen variants.
		\add_shortcode( 'contentful_table', [ $this, 'render_table_shortcode' ] );
		\add_shortcode( 'contentful-table', [ $this, 'render_table_shortcode' ] );
		\add_shortcode( 'contentful_toc', [ $this, 'render_toc_shortcode' ] );
		\add_shortcode( 'contentful-toc', [ $this, 'render_toc_shortcode' ] );
		\add_shortcode( 'contentful_chart', [ $this, 'render_chart_shortcode' ] );
		\add_shortcode( 'contentful-chart', [ $this, 'render_chart_shortcode' ] );
		\add_shortcode( 'contentful_cards', [ $this, 'render_cards_shortcode' ] );
		\add_shortcode( 'contentful-cards', [ $this, 'render_cards_shortcode' ] );
		\add_shortcode( 'contentful_form', [ $this, 'render_form_shortcode' ] );
		\add_shortcode( 'contentful-form', [ $this, 'render_form_shortcode' ] );

		// Prevent wptexturize from mangling shortcode attributes.
		\add_filter(
			'no_texturize_shortcodes',
			static function ( array $shortcodes ): array {
				return \array_merge(
					$shortcodes,
					[
						'contentful_table',
						'contentful-table',
						'contentful_toc',
						'contentful-toc',
						'contentful_chart',
						'contentful-chart',
						'contentful_cards',
						'contentful-cards',
						'contentful_form',
						'contentful-form',
					]
				);
			}
		);

		// Enqueue styles.
		\add_action( 'wp_enqueue_scripts', [ $this, 'enqueue_styles' ] );

		// Error styles.
		\add_action(
			'wp_head',
			static function (): void {
				echo '<style>.contentful-error { padding: 15px; background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; border-radius: 4px; margin: 15px 0; }</style>';
			}
		);
	}

	/**
	 * Enqueue plugin styles.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	public function enqueue_styles(): void {
		if ( ! \get_option( 'contentful_tables_load_css', true ) ) {
			return;
		}

		$css_file = CTFL_TABLES_PATH . 'assets/contentful-tables.css';

		if ( \file_exists( $css_file ) ) {
			\wp_enqueue_style(
				'contentful-tables',
				CTFL_TABLES_URL . 'assets/contentful-tables.css',
				[],
				CTFL_TABLES_VERSION
			);
		} else {
			// Register an empty handle and add inline styles.
			\wp_register_style( 'contentful-tables', false, [], CTFL_TABLES_VERSION );
			\wp_enqueue_style( 'contentful-tables' );
			\wp_add_inline_style( 'contentful-tables', $this->get_inline_css() );
		}
	}

	/**
	 * Render table shortcode.
	 *
	 * @since 4.0.0
	 *
	 * @param array<string, string>|string $atts Shortcode attributes.
	 * @return string Rendered HTML.
	 */
	public function render_table_shortcode( $atts ): string {
		$atts = \shortcode_atts(
			[
				'id'      => '',
				'class'   => '',
				'title'   => '',
				'key'     => '',
				'filters' => '',
			],
			$atts,
			'contentful_table'
		);

		$table_id     = \sanitize_text_field( $atts['id'] );
		$custom_class = \sanitize_text_field( $atts['class'] );
		$custom_title = \sanitize_text_field( $atts['title'] );
		$filters_attr = \sanitize_text_field( $atts['filters'] );
		$key_filter   = ! empty( $filters_attr ) ? $filters_attr : \sanitize_text_field( $atts['key'] );

		if ( empty( $table_id ) ) {
			return '<div class="contentful-error">Error: No table ID specified. Usage: [contentful_table id="your-table-id"]</div>';
		}

		$table_data = $this->data_loader->get_table( $table_id );
		if ( null === $table_data ) {
			return '<div class="contentful-error">Error: Table "' . \esc_html( $table_id ) . '" not found. Available tables: ' . \implode( ', ', \array_keys( $this->data_loader->get_tables_data() ) ) . '</div>';
		}

		if ( ! empty( $custom_title ) ) {
			$table_data['title'] = $custom_title;
		}

		$type = $table_data['type'] ?? '';
		if ( 'tableOfContents' === $type ) {
			$html = TocRenderer::render( $table_data, $table_id );
		} else {
			$html = TableRenderer::render( $table_data, $table_id, $key_filter );
		}

		if ( ! empty( $custom_class ) ) {
			$html = \str_replace(
				[ 'class="contentful-table-of-contents"', 'class="contentful-data-table"' ],
				[ 'class="contentful-table-of-contents ' . \esc_attr( $custom_class ) . '"', 'class="contentful-data-table ' . \esc_attr( $custom_class ) . '"' ],
				$html
			);
		}

		return $html;
	}

	/**
	 * Render TOC shortcode.
	 *
	 * @since 4.0.0
	 *
	 * @param array<string, string>|string $atts Shortcode attributes.
	 * @return string Rendered HTML.
	 */
	public function render_toc_shortcode( $atts ): string {
		$atts = \shortcode_atts(
			[
				'id'    => '',
				'class' => '',
				'title' => '',
			],
			$atts,
			'contentful_toc'
		);

		$table_id     = \sanitize_text_field( $atts['id'] );
		$custom_class = \sanitize_text_field( $atts['class'] );
		$custom_title = \sanitize_text_field( $atts['title'] );

		if ( empty( $table_id ) ) {
			return '<div class="contentful-error">Error: No TOC ID specified. Usage: [contentful_toc id="your-toc-id"]</div>';
		}

		$table_data = $this->data_loader->get_table( $table_id );
		if ( null === $table_data ) {
			return '<div class="contentful-error">Error: TOC "' . \esc_html( $table_id ) . '" not found. Available: ' . \implode( ', ', \array_keys( $this->data_loader->get_tables_data() ) ) . '</div>';
		}

		if ( ! empty( $custom_title ) ) {
			$table_data['title'] = $custom_title;
		}

		$html = TocRenderer::render( $table_data, $table_id );

		if ( ! empty( $custom_class ) ) {
			$html = \str_replace(
				'class="contentful-table-of-contents"',
				'class="contentful-table-of-contents ' . \esc_attr( $custom_class ) . '"',
				$html
			);
		}

		return $html;
	}

	/**
	 * Render chart shortcode.
	 *
	 * @since 4.0.0
	 *
	 * @param array<string, string>|string $atts Shortcode attributes.
	 * @return string Rendered HTML.
	 */
	public function render_chart_shortcode( $atts ): string {
		$atts = \shortcode_atts(
			[
				'id'    => '',
				'type'  => '',
				'title' => '',
				'class' => '',
			],
			$atts,
			'contentful_chart'
		);

		$chart_id = \sanitize_text_field( $atts['id'] );
		if ( empty( $chart_id ) ) {
			return '<!-- Chart: No ID specified -->';
		}

		$chart_data = $this->data_loader->get_chart( $chart_id );

		return ChartRenderer::render( $chart_data, $chart_id, $atts );
	}

	/**
	 * Render cards shortcode.
	 *
	 * @since 4.0.0
	 *
	 * @param array<string, string>|string $atts Shortcode attributes.
	 * @return string Rendered HTML.
	 */
	public function render_cards_shortcode( $atts ): string {
		$atts = \shortcode_atts(
			[
				'id'      => '',
				'type'    => '',
				'title'   => '',
				'class'   => '',
				'filters' => '',
			],
			$atts,
			'contentful_cards'
		);

		$card_id = \sanitize_text_field( $atts['id'] );
		if ( empty( $card_id ) ) {
			return '<!-- Cards: No ID specified -->';
		}

		$card_data = $this->data_loader->get_card( $card_id );

		return CardsRenderer::render( $card_data, $card_id, $atts, $this->data_loader );
	}

	/**
	 * Render form shortcode.
	 *
	 * @since 4.0.0
	 *
	 * @param array<string, string>|string $atts Shortcode attributes.
	 * @return string Rendered HTML.
	 */
	public function render_form_shortcode( $atts ): string {
		$atts = \shortcode_atts(
			[
				'id'     => '',
				'title'  => 'Contact Us',
				'submit' => 'Send',
				'class'  => '',
			],
			$atts,
			'contentful_form'
		);

		return FormRenderer::render( $atts );
	}

	/**
	 * Get inline CSS styles.
	 *
	 * @since 4.0.0
	 *
	 * @return string CSS styles.
	 */
	private function get_inline_css(): string {
		return '
/* Contentful Tables Plugin Styles */
.contentful-table-of-contents { background: #f9f9f9; border: 1px solid #ddd; border-radius: 5px; padding: 20px; margin: 20px 0; }
.contentful-table-of-contents h3 { margin-top: 0; color: #333; font-size: 1.2em; }
.toc-list { list-style: none; padding: 0; margin: 0; }
.toc-list li { padding: 8px 0; border-bottom: 1px solid #eee; }
.toc-list li:last-child { border-bottom: none; }
.toc-list a { color: #0073aa; text-decoration: none; display: block; padding: 4px 0; }
.toc-list a:hover { text-decoration: underline; color: #005a87; }
.contentful-data-table { margin: 20px 0; }
.contentful-data-table h3 { color: #333; margin-bottom: 15px; font-size: 1.3em; }
.table-responsive { overflow-x: auto; margin: 15px 0; }
.contentful-table { width: 100%; border-collapse: collapse; margin: 0; border: 1px solid #ddd; background: white; }
.contentful-table th, .contentful-table td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #ddd; }
.contentful-table th { background-color: #f8f9fa; font-weight: bold; color: #333; }
.contentful-table tbody tr:nth-child(even) { background-color: #f9f9f9; }
.contentful-table tbody tr:hover { background-color: #f5f5f5; }
@media (max-width: 768px) { .contentful-table { font-size: 14px; } .contentful-table th, .contentful-table td { padding: 8px 10px; } .contentful-table-of-contents { padding: 15px; } }
@media (max-width: 480px) { .contentful-table { font-size: 12px; } .contentful-table th, .contentful-table td { padding: 6px 8px; } }
.contentful-table-of-contents.toc-sticky { position: sticky; top: 20px; z-index: 10; }
.contentful-table-of-contents.toc-style-list .toc-list { list-style: disc; padding-left: 20px; }
.contentful-table-of-contents.toc-style-list .toc-list li { border-bottom: none; padding: 4px 0; }
.contentful-table-of-contents .toc-title { margin-top: 0; color: #333; font-size: 1.2em; }
.contentful-table a { color: #0073aa; text-decoration: none; }
.contentful-table a:hover { text-decoration: underline; color: #005a87; }
.contentful-chart { margin: 20px 0; padding: 20px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 5px; }
.contentful-chart .chart-title { margin-top: 0; color: #333; }
.contentful-chart-table { margin-top: 10px; }
.chart-placeholder { text-align: center; color: #666; font-style: italic; padding: 20px; }
.contentful-cards { margin: 20px 0; }
.cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px; margin-top: 15px; }
.contentful-card { background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
.card-field { margin-bottom: 8px; }
.card-label { font-weight: bold; color: #555; }
.contentful-form-container { margin: 20px 0; padding: 25px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 5px; }
.contentful-form .form-field { margin-bottom: 15px; }
.contentful-form label { display: block; font-weight: bold; margin-bottom: 5px; color: #333; }
.contentful-form input, .contentful-form textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
.contentful-form .wp-button { display: inline-block; padding: 10px 25px; background: #0073aa; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
.contentful-form .wp-button:hover { background: #005a87; }
.cta-button-container { text-align: center; margin: 20px 0; }
.cta-button { display: inline-block; padding: 12px 30px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 16px; }
.cta-dark-green { background: #2d6a4f; color: white; } .cta-light-green { background: #52b788; color: white; }
.cta-dark-green:hover { background: #1b4332; } .cta-light-green:hover { background: #40916c; }
.back-to-top { text-align: right; margin: 10px 0; } .back-to-top a { color: #0073aa; text-decoration: none; }
.link-reference-list { list-style: none; padding: 0; } .link-reference-list li { padding: 5px 0; }
.link-reference-list a { color: #0073aa; text-decoration: none; } .link-reference-list a:hover { text-decoration: underline; }
.rich-text-block { margin: 15px 0; padding: 15px; background: #fafafa; border-left: 3px solid #0073aa; }';
	}
}
