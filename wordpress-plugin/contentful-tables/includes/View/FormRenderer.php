<?php
/**
 * Form renderer view.
 *
 * @package SilverAssist\ContentfulTables
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   4.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\ContentfulTables\View;

/**
 * Renders contact form components as HTML.
 *
 * @since 4.0.0
 */
final class FormRenderer {

	/**
	 * Render a form component.
	 *
	 * @since 4.0.0
	 *
	 * @param array<string, string> $atts Shortcode attributes.
	 * @return string Rendered HTML.
	 */
	public static function render( array $atts ): string {
		$form_id      = \sanitize_text_field( $atts['id'] ?? '' );
		$title        = \sanitize_text_field( $atts['title'] ?? 'Contact Us' );
		$submit_text  = \sanitize_text_field( $atts['submit'] ?? 'Send' );
		$custom_class = \sanitize_text_field( $atts['class'] ?? '' );

		$html  = '<div class="contentful-form-container' . ( $custom_class ? ' ' . \esc_attr( $custom_class ) : '' ) . '" id="contentful-form-' . \esc_attr( $form_id ) . '">';
		$html .= '<h3>' . \esc_html( $title ) . '</h3>';
		$html .= '<form class="contentful-form" method="post">';
		$html .= '<div class="form-field"><label for="name">Name</label><input type="text" id="name" name="name" required /></div>';
		$html .= '<div class="form-field"><label for="email">Email</label><input type="email" id="email" name="email" required /></div>';
		$html .= '<div class="form-field"><label for="message">Message</label><textarea id="message" name="message" rows="5" required></textarea></div>';
		$html .= '<div class="form-submit"><button type="submit" class="wp-button">' . \esc_html( $submit_text ) . '</button></div>';
		$html .= '</form>';
		$html .= '</div>';

		return $html;
	}
}
