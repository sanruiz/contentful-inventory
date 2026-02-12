<?php
/**
 * CSV parser utility.
 *
 * @package SilverAssist\ContentfulTables
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   4.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\ContentfulTables\Utils;

/**
 * Parses CSV text into array-of-arrays.
 *
 * Handles quoted fields, commas within quotes, multiline values,
 * and UTF-8 BOM.
 *
 * @since 4.0.0
 */
final class CsvParser {

	/**
	 * Parse CSV text into an array of rows.
	 *
	 * @since 4.0.0
	 *
	 * @param string $text Raw CSV text.
	 * @return array<int, array<int, string>> Array of rows, each row is an array of cell values.
	 */
	public static function parse( string $text ): array {
		// Strip UTF-8 BOM if present.
		if ( \str_starts_with( $text, "\xEF\xBB\xBF" ) ) {
			$text = \substr( $text, 3 );
		}

		$rows      = [];
		$current   = '';
		$in_quotes = false;
		$row       = [];
		$len       = \strlen( $text );

		for ( $i = 0; $i < $len; $i++ ) {
			$ch   = $text[ $i ];
			$next = ( $i + 1 < $len ) ? $text[ $i + 1 ] : '';

			if ( $in_quotes ) {
				if ( '"' === $ch && '"' === $next ) {
					$current .= '"';
					++$i; // Skip escaped quote.
				} elseif ( '"' === $ch ) {
					$in_quotes = false;
				} else {
					$current .= $ch;
				}
			} elseif ( '"' === $ch ) {
				$in_quotes = true;
			} elseif ( ',' === $ch ) {
				$row[]   = \trim( $current );
				$current = '';
			} elseif ( "\n" === $ch || ( "\r" === $ch && "\n" === $next ) ) {
				$row[] = \trim( $current );
				if ( \array_filter( $row, static fn( string $cell ): bool => '' !== $cell ) ) {
					$rows[] = $row;
				}
				$row     = [];
				$current = '';
				if ( "\r" === $ch ) {
					++$i; // Skip \n after \r.
				}
			} else {
				$current .= $ch;
			}
		}

		// Last row.
		if ( '' !== $current || ! empty( $row ) ) {
			$row[] = \trim( $current );
			if ( \array_filter( $row, static fn( string $cell ): bool => '' !== $cell ) ) {
				$rows[] = $row;
			}
		}

		return $rows;
	}
}
