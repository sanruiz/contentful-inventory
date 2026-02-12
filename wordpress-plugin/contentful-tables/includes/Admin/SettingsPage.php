<?php
/**
 * Admin settings page.
 *
 * @package SilverAssist\ContentfulTables
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   4.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\ContentfulTables\Admin;

use SilverAssist\ContentfulTables\Core\Interfaces\LoadableInterface;
use SilverAssist\ContentfulTables\Service\TableDataLoader;

/**
 * Registers the admin settings page under Settings.
 *
 * Priority 30 — loads after data loader and shortcodes.
 *
 * @since 4.0.0
 */
final class SettingsPage implements LoadableInterface {

	/**
	 * Shared data loader.
	 *
	 * @since 4.0.0
	 *
	 * @var TableDataLoader
	 */
	private TableDataLoader $data_loader;

	/**
	 * Constructor.
	 *
	 * @since 4.0.0
	 *
	 * @param TableDataLoader $data_loader Shared data loader instance.
	 */
	public function __construct( TableDataLoader $data_loader ) {
		$this->data_loader = $data_loader;
	}

	/**
	 * Return the loading priority.
	 *
	 * @since 4.0.0
	 *
	 * @return int Loading priority.
	 */
	public function priority(): int {
		return 30;
	}

	/**
	 * Register WordPress hooks.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	public function register(): void {
		\add_action( 'admin_menu', [ $this, 'add_menu' ] );
	}

	/**
	 * Add the settings page to the admin menu.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	public function add_menu(): void {
		\add_options_page(
			'Contentful Tables',
			'Contentful Tables',
			'manage_options',
			'contentful-tables',
			[ $this, 'render_page' ]
		);
	}

	/**
	 * Render the admin settings page.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	public function render_page(): void {
		// Handle form submission.
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Simple options page.
		if ( isset( $_POST['submit'] ) ) {
			// phpcs:ignore WordPress.Security.NonceVerification.Missing
			\update_option( 'contentful_tables_load_css', isset( $_POST['load_css'] ) );
			echo '<div class="notice notice-success"><p>Settings saved!</p></div>';
		}

		$tables_data = $this->data_loader->get_tables_data();
		?>
		<div class="wrap">
			<h1>Contentful Tables</h1>

			<form method="post" action="">
				<table class="form-table">
					<tr>
						<th scope="row">Load CSS</th>
						<td>
							<label>
								<input type="checkbox" name="load_css" <?php \checked( \get_option( 'contentful_tables_load_css', true ) ); ?> />
								Load plugin CSS styles
							</label>
						</td>
					</tr>
				</table>
				<?php \submit_button(); ?>
			</form>

			<h2>Available Tables</h2>
			<p>Use these shortcodes in your posts and pages:</p>

			<div style="background: #f9f9f9; padding: 15px; border-radius: 5px;">
				<?php if ( empty( $tables_data ) ) : ?>
					<p><strong>No tables found.</strong> Make sure you have imported your Contentful tables using the headless import script.</p>
				<?php else : ?>
					<?php foreach ( $tables_data as $table_id => $table_data ) : ?>
						<div style="margin-bottom: 15px; padding: 10px; background: white; border-left: 4px solid #0073aa;">
							<strong>Table ID:</strong> <?php echo \esc_html( $table_id ); ?><br>
							<strong>Type:</strong> <?php echo \esc_html( $table_data['type'] ?? 'Unknown' ); ?><br>
							<strong>Title:</strong> <?php echo \esc_html( $table_data['title'] ?? 'No title' ); ?><br>
							<strong>Shortcode:</strong>
							<?php if ( 'tableOfContents' === ( $table_data['type'] ?? '' ) ) : ?>
								<code>[contentful_toc id="<?php echo \esc_attr( $table_id ); ?>"]</code>
							<?php else : ?>
								<code>[contentful_table id="<?php echo \esc_attr( $table_id ); ?>"]</code>
							<?php endif; ?>
							<?php if ( ! empty( $table_data['keyValues'] ) ) : ?>
								<br><strong>Filter values:</strong>
								<?php echo \esc_html( \implode( ', ', $table_data['keyValues'] ) ); ?>
								<br><em>Usage:</em>
								<code>[contentful_table id="<?php echo \esc_attr( $table_id ); ?>" filters="<?php echo \esc_attr( $table_data['keyValues'][0] ); ?>"]</code>
							<?php endif; ?>
						</div>
					<?php endforeach; ?>
				<?php endif; ?>
			</div>

			<h2>Usage Examples</h2>
			<pre style="background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto;">
Data table:
[contentful_table id="XBIbkCm53nytLcsPx3jlw"]

Table of contents:
[contentful_toc id="2dvEbjLfveBiFUb9PsLxFE"]

With custom CSS class:
[contentful_table id="3JnIHQENe4ZtihjpWwphGI" class="my-custom-table"]

With custom title:
[contentful_table id="408uTkJfTRYN5S7SCmIC5t" title="Custom Table Title"]

Filter by key column (single value):
[contentful_table id="6OGCWSrHDT4MJviE31iLsa" filters="food"]

Filter by key column (multiple values):
[contentful_table id="6OGCWSrHDT4MJviE31iLsa" filters="food,agency"]
			</pre>

			<h2>Plugin Information</h2>
			<ul>
				<li><strong>Version:</strong> <?php echo \esc_html( CTFL_TABLES_VERSION ); ?></li>
				<li><strong>Tables Loaded:</strong> <?php echo \count( $tables_data ); ?></li>
				<li><strong>Source:</strong>
					<?php
					$source  = \get_option( 'contentful_tables_source', 'post_meta' );
					$post_id = \get_option( 'contentful_tables_post_id', 'Not found' );

					if ( 'files' === $source ) {
						echo 'JSON Files in /wp-content/contentful-tables/';
					} else {
						echo 'WordPress Post Meta (Post ID: ' . \esc_html( (string) $post_id ) . ')';
					}
					?>
				</li>
				<?php if ( empty( $tables_data ) ) : ?>
				<li><strong>Debug:</strong>
					<details>
						<summary>Troubleshooting Information</summary>
						<ul>
							<li>Checked post IDs: 240, 238, 236, 235, 237, 239</li>
							<li>Database table exists:
								<?php
								global $wpdb;
								$table_name = $wpdb->prefix . 'contentful_tables';
								// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
								echo ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table_name ) ) === $table_name ) ? 'Yes' : 'No';
								?>
							</li>
							<li>Possible solutions:
								<ol>
									<li>Re-run the table import script: <code>node headless-meta-storage.js</code></li>
									<li>Check if WordPress post exists with table data</li>
									<li>Verify .env file has correct WordPress credentials</li>
								</ol>
							</li>
						</ul>
					</details>
				</li>
				<?php endif; ?>
			</ul>
		</div>
		<?php
	}
}
