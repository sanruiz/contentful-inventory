<?php
/**
 * REST API filters service.
 *
 * @package SilverAssist\CommunityListings
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   2.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\CommunityListings\Service;

use SilverAssist\CommunityListings\Core\Interfaces\LoadableInterface;
use WP_REST_Request;

/**
 * Adds custom query parameters and filters to the Community REST endpoint.
 *
 * Priority 20 — loads after CPT registration.
 *
 * @since 2.0.0
 */
final class RestApiFilters implements LoadableInterface {

	/**
	 * Return the loading priority.
	 *
	 * @since 2.0.0
	 *
	 * @return int Loading priority.
	 */
	public function priority(): int {
		return 20;
	}

	/**
	 * Register WordPress hooks.
	 *
	 * @since 2.0.0
	 *
	 * @return void
	 */
	public function register(): void {
		\add_filter( 'rest_community_query', [ $this, 'filter_query' ], 10, 2 );
		\add_filter( 'rest_community_collection_params', [ $this, 'register_params' ] );
	}

	/**
	 * Filter community queries by custom meta parameters.
	 *
	 * Enables:
	 *   /wp-json/wp/v2/community?listing_type=state
	 *   /wp-json/wp/v2/community?state_short=TX
	 *   /wp-json/wp/v2/community?state_long=texas
	 *
	 * @since 2.0.0
	 *
	 * @param array<string, mixed> $args    Query arguments.
	 * @param WP_REST_Request      $request REST request.
	 * @return array<string, mixed> Modified query arguments.
	 */
	public function filter_query( array $args, WP_REST_Request $request ): array {
		$listing_type = $request->get_param( 'listing_type' );
		if ( $listing_type ) {
			$args['meta_query'][] = [
				'key'   => 'listing_type',
				'value' => \sanitize_text_field( $listing_type ),
			];
		}

		$state_short = $request->get_param( 'state_short' );
		if ( $state_short ) {
			$args['meta_query'][] = [
				'key'   => 'state_short',
				'value' => \strtoupper( \sanitize_text_field( $state_short ) ),
			];
		}

		$state_long = $request->get_param( 'state_long' );
		if ( $state_long ) {
			$args['meta_query'][] = [
				'key'   => 'state_long',
				'value' => \sanitize_text_field( $state_long ),
			];
		}

		return $args;
	}

	/**
	 * Register custom REST API collection parameters.
	 *
	 * @since 2.0.0
	 *
	 * @param array<string, array<string, mixed>> $params Existing parameters.
	 * @return array<string, array<string, mixed>> Modified parameters.
	 */
	public function register_params( array $params ): array {
		$params['listing_type'] = [
			'description' => 'Filter by listing type: state or city.',
			'type'        => 'string',
			'enum'        => [ 'state', 'city' ],
		];
		$params['state_short']  = [
			'description' => 'Filter by state abbreviation (e.g., TX).',
			'type'        => 'string',
		];
		$params['state_long']   = [
			'description' => 'Filter by state slug (e.g., texas).',
			'type'        => 'string',
		];

		return $params;
	}
}
