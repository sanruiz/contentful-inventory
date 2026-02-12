<?php
/**
 * TOC renderer view.
 *
 * @package SilverAssist\ContentfulTables
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   4.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\ContentfulTables\View;

/**
 * Renders table of contents as HTML.
 *
 * Supports pre-built items and dynamic JS-based heading scanning.
 *
 * @since 4.0.0
 */
final class TocRenderer {

	/**
	 * Render a table of contents.
	 *
	 * @since 4.0.0
	 *
	 * @param array<string, mixed> $table_data TOC data from JSON.
	 * @param string               $table_id   Contentful entry ID.
	 * @return string Rendered HTML.
	 */
	public static function render( array $table_data, string $table_id ): string {
		$header_tags = $table_data['headerTags'] ?? [ 'H2' ];
		$style       = $table_data['style'] ?? 'List';
		$is_sticky   = ! empty( $table_data['isSticky'] );

		$sticky_class = $is_sticky ? ' toc-sticky' : '';
		$style_class  = ' toc-style-' . \sanitize_html_class( \strtolower( $style ) );

		$html = '<div class="contentful-table-of-contents' . $style_class . $sticky_class . '" id="contentful-toc-' . \esc_attr( $table_id ) . '">';

		if ( ! empty( $table_data['title'] ) ) {
			$html .= '<h3 class="toc-title">' . \esc_html( $table_data['title'] ) . '</h3>';
		}

		if ( isset( $table_data['items'] ) && \is_array( $table_data['items'] ) ) {
			$html .= self::render_static_items( $table_data['items'] );
		} else {
			$html .= self::render_dynamic_toc( $header_tags, $table_id );
		}

		$html .= '</div>';

		return $html;
	}

	/**
	 * Render pre-built TOC items.
	 *
	 * @since 4.0.0
	 *
	 * @param array<int, array<string, string>> $items TOC items.
	 * @return string Rendered HTML.
	 */
	private static function render_static_items( array $items ): string {
		$html = '<ul class="toc-list">';

		foreach ( $items as $item ) {
			$text   = $item['text'] ?? '';
			$anchor = $item['anchor'] ?? \sanitize_title( $text );
			if ( ! empty( $text ) ) {
				$html .= '<li><a href="#' . \esc_attr( $anchor ) . '">' . \esc_html( $text ) . '</a></li>';
			}
		}

		$html .= '</ul>';

		return $html;
	}

	/**
	 * Render dynamic TOC with JavaScript heading scanner.
	 *
	 * @since 4.0.0
	 *
	 * @param string[] $header_tags Header tags to scan (e.g., ['H2', 'H3']).
	 * @param string   $table_id    Contentful entry ID.
	 * @return string Rendered HTML with inline script.
	 */
	private static function render_dynamic_toc( array $header_tags, string $table_id ): string {
		$selector = \implode(
			', ',
			\array_map(
				static fn( string $tag ): string => \strtolower( \trim( $tag ) ),
				$header_tags
			)
		);

		$html  = '<nav class="toc-container" data-headers="' . \esc_attr( \implode( ',', $header_tags ) ) . '">';
		$html .= '<ul class="toc-list"></ul>';
		$html .= '</nav>';

		// Inline script to populate the TOC from page headings.
		$html .= '<script>';
		$html .= '(function(){';
		$html .= 'var toc=document.getElementById("contentful-toc-' . \esc_js( $table_id ) . '");';
		$html .= 'if(!toc)return;';
		$html .= 'var list=toc.querySelector(".toc-list");';
		$html .= 'var sel="' . \esc_js( $selector ) . '";';
		$html .= 'var post=toc.closest(".entry-content")||toc.closest("article")||document;';
		$html .= 'var headings=post.querySelectorAll(sel);';
		$html .= 'if(!headings.length){toc.style.display="none";return;}';
		$html .= 'headings.forEach(function(h,i){';
		$html .= 'var id=h.id||"toc-heading-"+i;';
		$html .= 'if(!h.id)h.id=id;';
		$html .= 'var li=document.createElement("li");';
		$html .= 'var a=document.createElement("a");';
		$html .= 'a.href="#"+id;a.textContent=h.textContent;';
		$html .= 'li.appendChild(a);list.appendChild(li);';
		$html .= '});';
		$html .= '})();';
		$html .= '</script>';

		return $html;
	}
}
