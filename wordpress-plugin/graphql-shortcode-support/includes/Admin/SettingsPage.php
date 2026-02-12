<?php
/**
 * Admin Settings Page.
 *
 * Provides a WordPress admin UI to configure which post types and fields
 * should have shortcodes processed in WPGraphQL responses.
 *
 * @package SilverAssist\GraphQLShortcodeSupport\Admin
 * @since   1.0.0
 */

namespace SilverAssist\GraphQLShortcodeSupport\Admin;

use SilverAssist\GraphQLShortcodeSupport\Core\Interfaces\LoadableInterface;

// Prevent direct access.
\defined( 'ABSPATH' ) || exit;

/**
 * SettingsPage singleton class.
 *
 * @since 1.0.0
 */
class SettingsPage implements LoadableInterface {

	/**
	 * Instance.
	 *
	 * @var SettingsPage|null
	 */
	private static ?SettingsPage $instance = null;

	/**
	 * Settings option key.
	 *
	 * @var string
	 */
	private const OPTION_KEY = 'gss_settings';

	/**
	 * Settings page slug.
	 *
	 * @var string
	 */
	private const PAGE_SLUG = 'graphql-shortcode-support';

	/**
	 * Nonce action.
	 *
	 * @var string
	 */
	private const NONCE_ACTION = 'gss_save_settings';

	/**
	 * Get instance.
	 *
	 * @return SettingsPage
	 */
	public static function instance(): SettingsPage {
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
	 * Initialize the admin settings page.
	 *
	 * @return void
	 */
	public function init(): void {
		\add_action( 'admin_menu', [ $this, 'add_settings_page' ] );
		\add_action( 'admin_init', [ $this, 'register_settings' ] );
	}

	/**
	 * Get loading priority.
	 *
	 * @return int
	 */
	public function get_priority(): int {
		return 30;
	}

	/**
	 * Should this component load?
	 *
	 * Only loads in admin context.
	 *
	 * @return bool
	 */
	public function should_load(): bool {
		return \is_admin();
	}

	/**
	 * Add the settings page under the Tools menu.
	 *
	 * @return void
	 */
	public function add_settings_page(): void {
		\add_management_page(
			\__( 'GraphQL Shortcode Support', 'graphql-shortcode-support' ),
			\__( 'GraphQL Shortcodes', 'graphql-shortcode-support' ),
			'manage_options',
			self::PAGE_SLUG,
			[ $this, 'render_settings_page' ]
		);
	}

	/**
	 * Register settings with the WordPress Settings API.
	 *
	 * @return void
	 */
	public function register_settings(): void {
		\register_setting(
			'gss_settings_group',
			self::OPTION_KEY,
			[
				'type'              => 'array',
				'sanitize_callback' => [ $this, 'sanitize_settings' ],
				'default'           => [
					'enabled'    => true,
					'post_types' => [ 'post', 'page', 'community' ],
					'fields'     => [ 'content' ],
				],
			]
		);

		// Main section.
		\add_settings_section(
			'gss_main_section',
			\__( 'Shortcode Processing Settings', 'graphql-shortcode-support' ),
			[ $this, 'render_section_description' ],
			self::PAGE_SLUG
		);

		// Enabled field.
		\add_settings_field(
			'gss_enabled',
			\__( 'Enable Processing', 'graphql-shortcode-support' ),
			[ $this, 'render_enabled_field' ],
			self::PAGE_SLUG,
			'gss_main_section'
		);

		// Post types field.
		\add_settings_field(
			'gss_post_types',
			\__( 'Post Types', 'graphql-shortcode-support' ),
			[ $this, 'render_post_types_field' ],
			self::PAGE_SLUG,
			'gss_main_section'
		);

		// Content fields.
		\add_settings_field(
			'gss_fields',
			\__( 'GraphQL Fields', 'graphql-shortcode-support' ),
			[ $this, 'render_fields_field' ],
			self::PAGE_SLUG,
			'gss_main_section'
		);
	}

	/**
	 * Sanitize settings before saving.
	 *
	 * @param mixed $input The raw input from the form.
	 * @return array<string, mixed> Sanitized settings.
	 */
	public function sanitize_settings( $input ): array {
		$sanitized = [];

		$sanitized['enabled'] = ! empty( $input['enabled'] );

		$sanitized['post_types'] = [];
		if ( ! empty( $input['post_types'] ) && is_array( $input['post_types'] ) ) {
			$sanitized['post_types'] = array_map( 'sanitize_key', $input['post_types'] );
		}

		$sanitized['fields'] = [];
		if ( ! empty( $input['fields'] ) ) {
			// Split comma-separated values and sanitize each.
			$fields_raw           = is_array( $input['fields'] ) ? $input['fields'] : explode( ',', $input['fields'] );
			$sanitized['fields'] = array_map( 'sanitize_key', array_map( 'trim', $fields_raw ) );
			$sanitized['fields'] = array_filter( $sanitized['fields'] );
		}

		if ( empty( $sanitized['fields'] ) ) {
			$sanitized['fields'] = [ 'content' ];
		}

		return $sanitized;
	}

	/**
	 * Render the section description.
	 *
	 * @return void
	 */
	public function render_section_description(): void {
		echo '<p>';
		\esc_html_e(
			'Configure which post types and GraphQL fields should have shortcodes processed. When enabled, shortcodes like [contentful_table] and [contentful_toc] will be rendered as HTML in GraphQL responses.',
			'graphql-shortcode-support'
		);
		echo '</p>';

		// Show WPGraphQL status.
		if ( class_exists( 'WPGraphQL' ) ) {
			echo '<p style="color: green;">✅ ';
			\esc_html_e( 'WPGraphQL is active.', 'graphql-shortcode-support' );
			echo '</p>';
		} else {
			echo '<p style="color: red;">⚠️ ';
			\esc_html_e( 'WPGraphQL is not active. This plugin requires WPGraphQL to function.', 'graphql-shortcode-support' );
			echo '</p>';
		}
	}

	/**
	 * Render the enabled checkbox field.
	 *
	 * @return void
	 */
	public function render_enabled_field(): void {
		$settings = \get_option( self::OPTION_KEY, [] );
		$enabled  = $settings['enabled'] ?? true;

		printf(
			'<label><input type="checkbox" name="%s[enabled]" value="1" %s /> %s</label>',
			\esc_attr( self::OPTION_KEY ),
			\checked( $enabled, true, false ),
			\esc_html__( 'Apply do_shortcode() automatically to GraphQL content fields.', 'graphql-shortcode-support' )
		);

		echo '<p class="description">';
		\esc_html_e(
			'When disabled, the content field returns raw shortcode text. The renderedContent field is always available regardless of this setting.',
			'graphql-shortcode-support'
		);
		echo '</p>';
	}

	/**
	 * Render the post types checkboxes field.
	 *
	 * @return void
	 */
	public function render_post_types_field(): void {
		$settings       = \get_option( self::OPTION_KEY, [] );
		$selected_types = $settings['post_types'] ?? [ 'post', 'page', 'community' ];

		// Get all public post types that have GraphQL support.
		$post_types = \get_post_types(
			[
				'public'       => true,
				'show_in_rest' => true,
			],
			'objects'
		);

		foreach ( $post_types as $post_type ) {
			$checked = in_array( $post_type->name, $selected_types, true );

			// Show GraphQL type name if available.
			$graphql_label = '';
			if ( isset( $post_type->graphql_single_name ) ) {
				$graphql_label = sprintf(
					' <code>(%s)</code>',
					\esc_html( $post_type->graphql_single_name )
				);
			}

			printf(
				'<label style="display: block; margin-bottom: 5px;"><input type="checkbox" name="%s[post_types][]" value="%s" %s /> %s%s</label>',
				\esc_attr( self::OPTION_KEY ),
				\esc_attr( $post_type->name ),
				\checked( $checked, true, false ),
				\esc_html( $post_type->labels->singular_name ),
				$graphql_label // Already escaped above.
			);
		}

		echo '<p class="description">';
		\esc_html_e( 'Select which post types should have shortcodes processed in GraphQL.', 'graphql-shortcode-support' );
		echo '</p>';
	}

	/**
	 * Render the GraphQL fields input.
	 *
	 * @return void
	 */
	public function render_fields_field(): void {
		$settings = \get_option( self::OPTION_KEY, [] );
		$fields   = $settings['fields'] ?? [ 'content' ];

		printf(
			'<input type="text" name="%s[fields]" value="%s" class="regular-text" />',
			\esc_attr( self::OPTION_KEY ),
			\esc_attr( implode( ', ', $fields ) )
		);

		echo '<p class="description">';
		\esc_html_e( 'Comma-separated list of GraphQL field names to process (e.g., content, excerpt).', 'graphql-shortcode-support' );
		echo '</p>';
	}

	/**
	 * Render the settings page HTML.
	 *
	 * @return void
	 */
	public function render_settings_page(): void {
		if ( ! \current_user_can( 'manage_options' ) ) {
			return;
		}

		?>
		<div class="wrap">
			<h1><?php \esc_html_e( 'GraphQL Shortcode Support', 'graphql-shortcode-support' ); ?></h1>

			<form method="post" action="options.php">
				<?php
				\settings_fields( 'gss_settings_group' );
				\do_settings_sections( self::PAGE_SLUG );
				\submit_button( \__( 'Save Settings', 'graphql-shortcode-support' ) );
				?>
			</form>

			<hr />

			<h2><?php \esc_html_e( 'Usage', 'graphql-shortcode-support' ); ?></h2>

			<h3><?php \esc_html_e( 'Option 1: Automatic Processing (content field)', 'graphql-shortcode-support' ); ?></h3>
			<p><?php \esc_html_e( 'When "Enable Processing" is checked, the content field is automatically processed. Your existing queries work without changes:', 'graphql-shortcode-support' ); ?></p>
			<pre style="background: #f0f0f0; padding: 15px; border-radius: 4px; overflow-x: auto;"><code>{
  posts {
    nodes {
      title
      content    # ← Shortcodes are rendered as HTML automatically.
    }
  }
}</code></pre>

			<h3><?php \esc_html_e( 'Option 2: Raw content + renderedContent', 'graphql-shortcode-support' ); ?></h3>
			<p><?php \esc_html_e( 'When "Enable Processing" is unchecked, content returns raw shortcode text. Use renderedContent when you need processed output:', 'graphql-shortcode-support' ); ?></p>
			<pre style="background: #f0f0f0; padding: 15px; border-radius: 4px; overflow-x: auto;"><code>{
  posts {
    nodes {
      title
      content           # ← Raw content with shortcode tags.
      renderedContent    # ← Shortcodes rendered as HTML (always available).
    }
  }
}</code></pre>

			<h3><?php \esc_html_e( 'Supported Shortcodes', 'graphql-shortcode-support' ); ?></h3>
			<ul style="list-style: disc; padding-left: 20px;">
				<li><code>[contentful_table id="..."]</code></li>
				<li><code>[contentful_toc]</code></li>
				<li><code>[contentful_chart id="..."]</code></li>
				<li><code>[contentful_cards id="..."]</code></li>
				<li><code>[contentful_form id="..."]</code></li>
			</ul>
		</div>
		<?php
	}
}
