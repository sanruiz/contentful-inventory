<?php
/**
 * Plugin Name: Community Listings CPT
 * Plugin URI: https://github.com/sanruiz/contentful-inventory
 * Description: Registers a hierarchical "Community" custom post type for state and city memory care listings
 * Version: 1.0.0
 * Author: Santiago Ramirez
 * License: GPL v2 or later
 * Text Domain: community-listings
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Register the Community custom post type
 */
function community_listings_register_cpt() {
    $labels = [
        'name'                  => 'Communities',
        'singular_name'         => 'Community',
        'menu_name'             => 'Communities',
        'name_admin_bar'        => 'Community',
        'add_new'               => 'Add New',
        'add_new_item'          => 'Add New Community',
        'new_item'              => 'New Community',
        'edit_item'             => 'Edit Community',
        'view_item'             => 'View Community',
        'all_items'             => 'All Communities',
        'search_items'          => 'Search Communities',
        'parent_item_colon'     => 'Parent State:',
        'not_found'             => 'No communities found.',
        'not_found_in_trash'    => 'No communities found in Trash.',
    ];

    $args = [
        'labels'             => $labels,
        'public'             => true,
        'publicly_queryable' => true,
        'show_ui'            => true,
        'show_in_menu'       => true,
        'show_in_rest'       => true,       // Enable REST API + Gutenberg
        'rest_base'          => 'community', // REST endpoint: /wp-json/wp/v2/community
        'query_var'          => true,
        'rewrite'            => ['slug' => 'communities', 'with_front' => false],
        'capability_type'    => 'post',
        'map_meta_cap'       => true,       // Map meta capabilities to post capabilities
        'has_archive'        => true,
        'hierarchical'       => true,       // Parent/child support (state → city)
        'menu_position'      => 5,
        'menu_icon'          => 'dashicons-location-alt',
        'supports'           => [
            'title',
            'editor',
            'excerpt',
            'thumbnail',
            'custom-fields',
            'page-attributes',  // Required for parent/child + menu_order
            'revisions',
        ],
    ];

    register_post_type('community', $args);
}
add_action('init', 'community_listings_register_cpt');

/**
 * Register custom meta fields for the REST API
 */
function community_listings_register_meta() {
    $meta_fields = [
        'contentful_id'       => 'string',
        'listing_type'        => 'string',   // "state" or "city"
        'state_short'         => 'string',   // "TX", "CA"
        'state_long'          => 'string',   // "texas", "california"
        'original_slug'       => 'string',   // Original Contentful slug
        'original_url'        => 'string',   // Old memorycare.com URL
        'content_bucket'      => 'string',   // "geo-content"
        'sitemap_group'       => 'string',   // "memory-care-states" or "memory-care-geos"
        'link_text'           => 'string',   // Display name like "Texas" or "Austin, TX"
        'hero_text_contrast'  => 'boolean',
        'noindex'             => 'boolean',
        'nofollow'            => 'boolean',
    ];

    foreach ($meta_fields as $key => $type) {
        register_post_meta('community', $key, [
            'show_in_rest'  => true,
            'single'        => true,
            'type'          => $type,
            'auth_callback' => function () {
                return current_user_can('edit_posts');
            },
        ]);
    }
}
add_action('init', 'community_listings_register_meta');

/**
 * Allow filtering community posts by meta fields via REST API
 * Enables: /wp-json/wp/v2/community?listing_type=state
 *          /wp-json/wp/v2/community?state_short=TX
 */
function community_listings_rest_query($args, $request) {
    // Filter by listing_type
    if ($request->get_param('listing_type')) {
        $args['meta_query'][] = [
            'key'   => 'listing_type',
            'value' => sanitize_text_field($request->get_param('listing_type')),
        ];
    }

    // Filter by state_short
    if ($request->get_param('state_short')) {
        $args['meta_query'][] = [
            'key'   => 'state_short',
            'value' => strtoupper(sanitize_text_field($request->get_param('state_short'))),
        ];
    }

    // Filter by state_long
    if ($request->get_param('state_long')) {
        $args['meta_query'][] = [
            'key'   => 'state_long',
            'value' => sanitize_text_field($request->get_param('state_long')),
        ];
    }

    return $args;
}
add_filter('rest_community_query', 'community_listings_rest_query', 10, 2);

/**
 * Register custom REST API query params
 */
function community_listings_rest_params($params) {
    $params['listing_type'] = [
        'description' => 'Filter by listing type: state or city',
        'type'        => 'string',
        'enum'        => ['state', 'city'],
    ];
    $params['state_short'] = [
        'description' => 'Filter by state abbreviation (e.g., TX)',
        'type'        => 'string',
    ];
    $params['state_long'] = [
        'description' => 'Filter by state slug (e.g., texas)',
        'type'        => 'string',
    ];
    return $params;
}
add_filter('rest_community_collection_params', 'community_listings_rest_params');

/**
 * Flush rewrite rules on activation
 */
function community_listings_activate() {
    community_listings_register_cpt();
    flush_rewrite_rules();
}
register_activation_hook(__FILE__, 'community_listings_activate');

/**
 * Flush rewrite rules on deactivation
 */
function community_listings_deactivate() {
    flush_rewrite_rules();
}
register_deactivation_hook(__FILE__, 'community_listings_deactivate');

/**
 * WPGraphQL: Apply do_shortcode() to Community content fields.
 *
 * Filters graphql_resolve_field so that shortcodes embedded in community
 * post content (e.g., [contentful_table], [contentful_cards]) are rendered
 * as HTML in GraphQL responses instead of raw shortcode text.
 *
 * @param mixed  $result         The resolved field value.
 * @param mixed  $source         The source object.
 * @param array  $args           The field arguments.
 * @param mixed  $context        The AppContext.
 * @param mixed  $info           The ResolveInfo.
 * @param string $type_name      The GraphQL type name.
 * @param string $field_key      The field key.
 * @param mixed  $field_def      The field definition.
 * @param mixed  $field_resolver The field resolver.
 * @return mixed The result with shortcodes rendered as HTML.
 */
function community_listings_graphql_resolve_shortcodes($result, $source, $args, $context, $info, $type_name, $field_key, $field_def, $field_resolver)
{
    // Only process string results.
    if (!is_string($result) || empty($result)) {
        return $result;
    }

    // Only process content/excerpt fields on Community type.
    $target_fields = ['content', 'excerpt'];
    if (!in_array($field_key, $target_fields, true)) {
        return $result;
    }

    if ($type_name !== 'Community') {
        return $result;
    }

    // Quick check: skip if no shortcode brackets present.
    if (strpos($result, '[') === false) {
        return $result;
    }

    return do_shortcode($result);
}
add_filter('graphql_resolve_field', 'community_listings_graphql_resolve_shortcodes', 10, 9);

/**
 * WPGraphQL: Register renderedContent field on Community type.
 *
 * Provides an explicit GraphQL field that returns community content with all
 * shortcodes processed via do_shortcode().
 *
 * Usage:
 *   {
 *     communities {
 *       nodes {
 *         title
 *         renderedContent
 *       }
 *     }
 *   }
 */
function community_listings_graphql_register_rendered_content()
{
    if (!function_exists('register_graphql_field')) {
        return;
    }

    register_graphql_field('Community', 'renderedContent', [
        'type' => 'String',
        'description' => 'Community content with all shortcodes rendered as HTML.',
        'resolve' => function ($post) {
            $content = '';

            if (isset($post->contentRaw)) {
                $content = $post->contentRaw;
            } elseif (isset($post->ID)) {
                $post_object = get_post($post->ID);
                $content = $post_object ? $post_object->post_content : '';
            }

            if (empty($content)) {
                return '';
            }

            $content = do_shortcode($content);
            $content = wpautop($content);

            return $content;
        },
    ]);
}
add_action('graphql_register_types', 'community_listings_graphql_register_rendered_content');
