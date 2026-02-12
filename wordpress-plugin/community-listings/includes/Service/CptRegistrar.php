<?php
/**
 * CPT registrar service.
 *
 * @package SilverAssist\CommunityListings
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   2.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\CommunityListings\Service;

use SilverAssist\CommunityListings\Core\Interfaces\LoadableInterface;

/**
 * Registers the Community custom post type and meta fields.
 *
 * Priority 10 — loads first.
 *
 * @since 2.0.0
 */
final class CptRegistrar implements LoadableInterface {

	/**
	 * Meta fields with their types.
	 *
	 * @since 2.0.0
	 *
	 * @var array<string, string>
	 */
	private const META_FIELDS = [
		'contentful_id'      => 'string',
		'listing_type'       => 'string',
		'state_short'        => 'string',
		'state_long'         => 'string',
		'original_slug'      => 'string',
		'original_url'       => 'string',
		'content_bucket'     => 'string',
		'sitemap_group'      => 'string',
		'link_text'          => 'string',
		'hero_text_contrast' => 'boolean',
		'noindex'            => 'boolean',
		'nofollow'           => 'boolean',
	];

	/**
	 * Return the loading priority.
	 *
	 * @since 2.0.0
	 *
	 * @return int Loading priority.
	 */
	public function priority(): int {
		return 10;
	}

	/**
	 * Register WordPress hooks.
	 *
	 * @since 2.0.0
	 *
	 * @return void
	 */
	public function register(): void {
		\add_action( 'init', [ self::class, 'register_post_type' ] );
		\add_action( 'init', [ $this, 'register_meta' ] );
	}

	/**
	 * Register the Community custom post type.
	 *
	 * @since 2.0.0
	 *
	 * @return void
	 */
	public static function register_post_type(): void {
		$labels = [
			'name'               => 'Communities',
			'singular_name'      => 'Community',
			'menu_name'          => 'Communities',
			'name_admin_bar'     => 'Community',
			'add_new'            => 'Add New',
			'add_new_item'       => 'Add New Community',
			'new_item'           => 'New Community',
			'edit_item'          => 'Edit Community',
			'view_item'          => 'View Community',
			'all_items'          => 'All Communities',
			'search_items'       => 'Search Communities',
			'parent_item_colon'  => 'Parent State:',
			'not_found'          => 'No communities found.',
			'not_found_in_trash' => 'No communities found in Trash.',
		];

		$args = [
			'labels'             => $labels,
			'public'             => true,
			'publicly_queryable' => true,
			'show_ui'            => true,
			'show_in_menu'       => true,
			'show_in_rest'       => true,
			'rest_base'          => 'community',
			'query_var'          => true,
			'rewrite'            => [
				'slug'       => 'communities',
				'with_front' => false,
			],
			'capability_type'    => 'post',
			'map_meta_cap'       => true,
			'has_archive'        => true,
			'hierarchical'       => true,
			'menu_position'      => 5,
			'menu_icon'          => 'dashicons-location-alt',
			'supports'           => [
				'title',
				'editor',
				'excerpt',
				'thumbnail',
				'custom-fields',
				'page-attributes',
				'revisions',
			],
		];

		\register_post_type( 'community', $args );
	}

	/**
	 * Register custom meta fields for the REST API.
	 *
	 * @since 2.0.0
	 *
	 * @return void
	 */
	public function register_meta(): void {
		foreach ( self::META_FIELDS as $key => $type ) {
			\register_post_meta(
				'community',
				$key,
				[
					'show_in_rest'  => true,
					'single'        => true,
					'type'          => $type,
					'auth_callback' => static function (): bool {
						return \current_user_can( 'edit_posts' );
					},
				]
			);
		}
	}
}
