<?php
/**
 * GraphQL resolver service.
 *
 * @package SilverAssist\ContentfulTables
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   4.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\ContentfulTables\Service;

use SilverAssist\ContentfulTables\Core\Interfaces\LoadableInterface;

/**
 * Applies do_shortcode() to WPGraphQL content fields.
 *
 * Priority 20 — loads alongside shortcode registrar.
 *
 * @since 4.0.0
 */
final class GraphQLResolver implements LoadableInterface {

	/**
	 * GraphQL types whose content fields should be processed.
	 *
	 * @since 4.0.0
	 *
	 * @var string[]
	 */
	private const TARGET_TYPES = [ 'Post', 'Page', 'Community' ];

	/**
	 * Content field keys to process.
	 *
	 * @since 4.0.0
	 *
	 * @var string[]
	 */
	private const TARGET_FIELDS = [ 'content', 'excerpt' ];

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
	 * Register WordPress hooks.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	public function register(): void {
		\add_filter( 'graphql_resolve_field', [ $this, 'resolve_shortcodes' ], 10, 9 );
		\add_action( 'graphql_register_types', [ $this, 'register_rendered_content' ] );
	}

	/**
	 * Apply do_shortcode() to content fields in GraphQL responses.
	 *
	 * @since 4.0.0
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
	 * @return mixed The result with shortcodes rendered.
	 */
	public function resolve_shortcodes(
		mixed $result,
		mixed $source,
		array $args,
		mixed $context,
		mixed $info,
		string $type_name,
		string $field_key,
		mixed $field_def,
		mixed $field_resolver
	): mixed {
		if ( ! \is_string( $result ) || empty( $result ) ) {
			return $result;
		}

		if ( ! \in_array( $field_key, self::TARGET_FIELDS, true ) ) {
			return $result;
		}

		if ( ! \in_array( $type_name, self::TARGET_TYPES, true ) ) {
			return $result;
		}

		if ( false === \strpos( $result, '[' ) ) {
			return $result;
		}

		return \do_shortcode( $result );
	}

	/**
	 * Register renderedContent field on post types.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	public function register_rendered_content(): void {
		if ( ! \function_exists( 'register_graphql_field' ) ) {
			return;
		}

		$post_types = [
			'Post'      => 'post',
			'Page'      => 'page',
			'Community' => 'community',
		];

		foreach ( $post_types as $graphql_type => $wp_type ) {
			if ( ! \post_type_exists( $wp_type ) ) {
				continue;
			}

			\register_graphql_field(
				$graphql_type,
				'renderedContent',
				[
					'type'        => 'String',
					'description' => 'Post content with all shortcodes rendered as HTML.',
					'resolve'     => static function ( $post ): string {
						$content = '';

						if ( isset( $post->contentRaw ) ) {
							$content = $post->contentRaw;
						} elseif ( isset( $post->ID ) ) {
							$post_object = \get_post( $post->ID );
							$content     = $post_object ? $post_object->post_content : '';
						}

						if ( empty( $content ) ) {
							return '';
						}

						$content = \do_shortcode( $content );
						$content = \wpautop( $content );

						return $content;
					},
				]
			);
		}
	}
}
