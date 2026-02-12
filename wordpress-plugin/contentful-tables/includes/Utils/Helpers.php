<?php
/**
 * Helper utilities.
 *
 * @package SilverAssist\ContentfulTables
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   4.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\ContentfulTables\Utils;

/**
 * Static helper methods shared across components.
 *
 * @since 4.0.0
 */
final class Helpers {

	/**
	 * Format a header label from snake_case or slug to human-readable.
	 *
	 * Examples: "provider_name" → "Provider Name", "base_pricing_string" → "Base Pricing".
	 *
	 * @since 4.0.0
	 *
	 * @param string $header Raw header name.
	 * @return string Formatted label.
	 */
	public static function format_header_label( string $header ): string {
		// Replace underscores and hyphens with spaces.
		$label = \str_replace( [ '_', '-' ], ' ', $header );
		// Remove trailing "string" suffix (e.g., "room_string" → "room").
		$label = (string) \preg_replace( '/\s+string$/i', '', $label );
		// Title case.
		return \ucwords( \trim( $label ) );
	}

	/**
	 * Resolve template placeholders in titles.
	 *
	 * Supported placeholders:
	 *   [ city-state ] — replaced with "City, ST" from current post slug.
	 *
	 * Modifiers (appended after the placeholder):
	 *   "lowercase" — output in lowercase (e.g. "birmingham, al").
	 *
	 * @since 4.0.0
	 *
	 * @param string $title Title string possibly containing placeholders.
	 * @return string Title with placeholders resolved.
	 */
	public static function resolve_title_placeholders( string $title ): string {
		if ( false === \strpos( $title, '[ city-state ]' ) && false === \strpos( $title, '[city-state]' ) ) {
			return $title;
		}

		$post = \get_post();
		if ( ! $post ) {
			return $title;
		}

		$slug       = $post->post_name;
		$parts      = \explode( '-', $slug );
		$state_abbr = '';
		$city_parts = $parts;

		if ( \count( $parts ) >= 2 ) {
			$last = \strtoupper( (string) \end( $parts ) );
			// Check if last segment is a 2-letter state abbreviation.
			if ( 2 === \strlen( $last ) && \ctype_alpha( $last ) ) {
				$state_abbr = $last;
				$city_parts = \array_slice( $parts, 0, -1 );
			}
		}

		$city_name  = \implode( ' ', \array_map( 'ucfirst', $city_parts ) );
		$city_state = $state_abbr ? $city_name . ', ' . $state_abbr : $city_name;

		// Detect "lowercase" modifier.
		$lowercase = false;
		if ( \preg_match( '/\[ ?city-state ?\]\s+lowercase/i', $title ) ) {
			$lowercase = true;
			$title     = (string) \preg_replace( '/(\[ ?city-state ?\])\s+lowercase/i', '$1', $title );
		}

		$replacement = $lowercase ? \strtolower( $city_state ) : $city_state;

		return \str_replace( [ '[ city-state ]', '[city-state]' ], $replacement, $title );
	}

	/**
	 * Resolve which key value matches a heading slug.
	 *
	 * Uses exact match, word match, starts-with, and contains strategies.
	 *
	 * @since 4.0.0
	 *
	 * @param string   $heading_slug Heading text as a slug.
	 * @param string[] $key_values   Known key values.
	 * @return string|null Matched key value or null.
	 */
	public static function resolve_key_from_heading( string $heading_slug, array $key_values = [] ): ?string {
		$heading_slug  = \strtolower( $heading_slug );
		$heading_words = \preg_split( '/[\s\-]+/', $heading_slug );

		if ( empty( $key_values ) ) {
			return $heading_slug;
		}

		// Exact match first.
		foreach ( $key_values as $key ) {
			$key = \strtolower( \trim( $key ) );
			if ( $heading_slug === $key ) {
				return $key;
			}
		}

		// Check if any key value appears as a word in the heading.
		foreach ( $key_values as $key ) {
			$key = \strtolower( \trim( $key ) );
			if ( \in_array( $key, $heading_words, true ) ) {
				return $key;
			}
		}

		// Starts-with match.
		foreach ( $key_values as $key ) {
			$key = \strtolower( \trim( $key ) );
			if ( \str_starts_with( $heading_slug, $key ) ) {
				return $key;
			}
		}

		// Contains match (last resort).
		foreach ( $key_values as $key ) {
			$key = \strtolower( \trim( $key ) );
			if ( false !== \strpos( $heading_slug, $key ) ) {
				return $key;
			}
		}

		return null;
	}

	/**
	 * Filter table rows by matching key column values against filter parameter.
	 *
	 * Supports direct key matches and heading-slug resolution.
	 * Multiple values can be comma-separated.
	 *
	 * @since 4.0.0
	 *
	 * @param array<int, array<int, string>> $rows        Data rows (without header).
	 * @param int                            $key_col_idx Index of the key column.
	 * @param string                         $filter      Filter value(s) from shortcode (comma-separated).
	 * @param string[]                       $key_values  Known key values from table metadata.
	 * @return array<int, array<int, string>> Filtered rows.
	 */
	public static function filter_rows_by_key( array $rows, int $key_col_idx, string $filter, array $key_values = [] ): array {
		if ( '' === $filter || $key_col_idx < 0 ) {
			return $rows;
		}

		$filter_values = \array_filter(
			\array_map( 'trim', \explode( ',', $filter ) ),
			static fn( string $v ): bool => '' !== $v
		);

		if ( empty( $filter_values ) ) {
			return $rows;
		}

		$matched_keys        = [];
		$lowercase_key_values = \array_map( 'strtolower', \array_map( 'trim', $key_values ) );

		foreach ( $filter_values as $val ) {
			$val = \strtolower( $val );

			if ( \in_array( $val, $lowercase_key_values, true ) ) {
				$matched_keys[] = $val;
			} else {
				$resolved = self::resolve_key_from_heading( $val, $key_values );
				if ( null !== $resolved ) {
					$matched_keys[] = $resolved;
				}
			}
		}

		if ( empty( $matched_keys ) ) {
			return $rows;
		}

		$matched_keys = \array_unique( $matched_keys );

		return \array_values(
			\array_filter(
				$rows,
				static function ( array $row ) use ( $key_col_idx, $matched_keys ): bool {
					$row_key = \strtolower( \trim( $row[ $key_col_idx ] ?? '' ) );
					return \in_array( $row_key, $matched_keys, true );
				}
			)
		);
	}
}
