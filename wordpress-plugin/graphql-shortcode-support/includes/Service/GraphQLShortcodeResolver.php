<?php
/**
 * GraphQL Shortcode Resolver Service.
 *
 * Applies do_shortcode() to WPGraphQL content fields so that shortcodes
 * (e.g., [contentful_table], [contentful_toc], [contentful_chart]) are
 * rendered as HTML in GraphQL responses instead of raw shortcode text.
 *
 * @package SilverAssist\GraphQLShortcodeSupport\Service
 * @since   1.0.0
 */

namespace SilverAssist\GraphQLShortcodeSupport\Service;

use SilverAssist\GraphQLShortcodeSupport\Core\Interfaces\LoadableInterface;

// Prevent direct access.
\defined( 'ABSPATH' ) || exit;

/**
 * GraphQLShortcodeResolver singleton class.
 *
 * Hooks into WPGraphQL to process shortcodes in content fields.
 *
 * @since 1.0.0
 */
class GraphQLShortcodeResolver implements LoadableInterface {

	/**
	 * Service instance.
	 *
	 * @var GraphQLShortcodeResolver|null
	 */
	private static ?GraphQLShortcodeResolver $instance = null;

	/**
	 * Plugin settings.
	 *
	 * @var array<string, mixed>
	 */
	private array $settings = [];

	/**
	 * Get service instance.
	 *
	 * @return GraphQLShortcodeResolver
	 */
	public static function instance(): GraphQLShortcodeResolver {
		if ( self::$instance === null ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Private constructor.
	 */
	private function __construct() {
		// Initialization happens in init().
	}

	/**
	 * Initialize the service.
	 *
	 * Registers WPGraphQL filters for shortcode processing.
	 * The `renderedContent` field is always registered so consumers can
	 * explicitly request processed content. The automatic `content` field
	 * processing can be toggled on/off via the admin settings.
	 *
	 * @return void
	 */
	public function init(): void {
		$this->settings = $this->get_settings();

		// Always register the dedicated renderedContent field.
		\add_action( 'graphql_register_types', [ $this, 'register_rendered_content_field' ] );

		// Only apply automatic do_shortcode() on content fields when enabled.
		if ( ! empty( $this->settings['enabled'] ) ) {
			\add_filter( 'graphql_resolve_field', [ $this, 'resolve_shortcodes_in_field' ], 10, 9 );
		}
	}

	/**
	 * Get loading priority.
	 *
	 * @return int
	 */
	public function get_priority(): int {
		return 20;
	}

	/**
	 * Should this component load?
	 *
	 * Only loads when WPGraphQL is active.
	 *
	 * @return bool
	 */
	public function should_load(): bool {
		return class_exists( 'WPGraphQL' );
	}

	/**
	 * Get plugin settings with defaults.
	 *
	 * @return array<string, mixed>
	 */
	private function get_settings(): array {
		$defaults = [
			'enabled'    => true,
			'post_types' => [ 'post', 'page', 'community' ],
			'fields'     => [ 'content' ],
		];

		$saved = \get_option( 'gss_settings', [] );

		if ( ! is_array( $saved ) ) {
			return $defaults;
		}

		return \wp_parse_args( $saved, $defaults );
	}

	/**
	 * Filter GraphQL field resolution to apply do_shortcode() on content fields.
	 *
	 * Hooked into `graphql_resolve_field`. Applies shortcode processing to
	 * configured content fields for configured post types.
	 *
	 * @param mixed                 $result     The resolved field value.
	 * @param mixed                 $source     The source object (post, term, etc.).
	 * @param array<string, mixed>  $args       The field arguments.
	 * @param mixed                 $context    The AppContext.
	 * @param mixed                 $info       The ResolveInfo.
	 * @param string                $type_name  The GraphQL type name.
	 * @param string                $field_key  The field key.
	 * @param mixed                 $field_def  The field definition.
	 * @param mixed                 $field_resolver The field resolver.
	 * @return mixed The filtered result with shortcodes processed.
	 */
	public function resolve_shortcodes_in_field( $result, $source, $args, $context, $info, $type_name, $field_key, $field_def, $field_resolver ) {
		// Only process string results.
		if ( ! is_string( $result ) || empty( $result ) ) {
			return $result;
		}

		// Check if this field is in our configured fields list.
		$target_fields = $this->settings['fields'] ?? [ 'content' ];
		if ( ! in_array( $field_key, $target_fields, true ) ) {
			return $result;
		}

		// Check if the type corresponds to a configured post type.
		if ( ! $this->is_target_graphql_type( $type_name ) ) {
			return $result;
		}

		// Only process if content actually contains shortcodes.
		if ( ! \has_shortcode( $result, 'contentful_table' )
			&& ! \has_shortcode( $result, 'contentful-table' )
			&& ! \has_shortcode( $result, 'contentful_toc' )
			&& ! \has_shortcode( $result, 'contentful-toc' )
			&& ! \has_shortcode( $result, 'contentful_chart' )
			&& ! \has_shortcode( $result, 'contentful-chart' )
			&& ! \has_shortcode( $result, 'contentful_cards' )
			&& ! \has_shortcode( $result, 'contentful-cards' )
			&& ! \has_shortcode( $result, 'contentful_form' )
			&& ! \has_shortcode( $result, 'contentful-form' )
		) {
			// Fall back to generic shortcode bracket detection.
			if ( false === strpos( $result, '[' ) ) {
				return $result;
			}
		}

		return \do_shortcode( $result );
	}

	/**
	 * Check if a GraphQL type name corresponds to a configured post type.
	 *
	 * Maps WPGraphQL type names (PascalCase) back to WordPress post types.
	 *
	 * @param string $type_name The GraphQL type name (e.g., 'Post', 'Page', 'Community').
	 * @return bool Whether this type should have shortcodes processed.
	 */
	private function is_target_graphql_type( string $type_name ): bool {
		$post_types = $this->settings['post_types'] ?? [ 'post', 'page', 'community' ];

		// WPGraphQL registers types with ucfirst names by default.
		// Also check exact match and lowercase match.
		$type_lower = strtolower( $type_name );

		foreach ( $post_types as $post_type ) {
			// Direct match (e.g., 'post' === 'post').
			if ( $post_type === $type_lower ) {
				return true;
			}

			// PascalCase match (e.g., 'Post' === ucfirst('post')).
			if ( $type_name === ucfirst( $post_type ) ) {
				return true;
			}

			// Check WPGraphQL registered type name for custom post types.
			$post_type_object = \get_post_type_object( $post_type );
			if ( $post_type_object && isset( $post_type_object->graphql_single_name ) ) {
				if ( ucfirst( $post_type_object->graphql_single_name ) === $type_name ) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Register a dedicated `renderedContent` field in WPGraphQL.
	 *
	 * This provides an explicit field that always returns shortcode-processed
	 * content, without modifying the default `content` field behavior.
	 *
	 * @return void
	 */
	public function register_rendered_content_field(): void {
		$post_types = $this->settings['post_types'] ?? [ 'post', 'page', 'community' ];

		foreach ( $post_types as $post_type ) {
			$graphql_type = $this->get_graphql_type_name( $post_type );

			if ( empty( $graphql_type ) ) {
				continue;
			}

			\register_graphql_field(
				$graphql_type,
				'renderedContent',
				[
					'type'        => 'String',
					'description' => \__( 'Post content with all shortcodes rendered as HTML.', 'graphql-shortcode-support' ),
					'resolve'     => function ( $post ) {
						$content = '';

						if ( isset( $post->contentRaw ) ) {
							$content = $post->contentRaw;
						} elseif ( isset( $post->ID ) ) {
							$post_object = \get_post( $post->ID );
							$content     = $post_object ? $post_object->post_content : '';
						} elseif ( is_object( $post ) && method_exists( $post, '__get' ) ) {
							// WPGraphQL Post model.
							$content = $post->contentRaw ?? '';
						}

						if ( empty( $content ) ) {
							return '';
						}

						// Apply content filters (wpautop, shortcodes, etc.).
						$content = \do_shortcode( $content );
						$content = \wpautop( $content );

						return $content;
					},
				]
			);
		}
	}

	/**
	 * Get the WPGraphQL type name for a WordPress post type.
	 *
	 * @param string $post_type The WordPress post type slug.
	 * @return string The GraphQL type name, or empty string if not found.
	 */
	private function get_graphql_type_name( string $post_type ): string {
		$post_type_object = \get_post_type_object( $post_type );

		if ( ! $post_type_object ) {
			return '';
		}

		// Check if WPGraphQL has registered a custom type name.
		if ( isset( $post_type_object->graphql_single_name ) ) {
			return ucfirst( $post_type_object->graphql_single_name );
		}

		// Default: capitalize the post type name.
		return ucfirst( $post_type );
	}
}
