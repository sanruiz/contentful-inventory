<?php
/**
 * Plugin bootstrap.
 *
 * @package SilverAssist\ContentfulTables
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   4.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\ContentfulTables\Core;

use SilverAssist\ContentfulTables\Admin\SettingsPage;
use SilverAssist\ContentfulTables\Core\Interfaces\LoadableInterface;
use SilverAssist\ContentfulTables\Service\GraphQLResolver;
use SilverAssist\ContentfulTables\Service\ShortcodeRegistrar;
use SilverAssist\ContentfulTables\Service\TableDataLoader;

/**
 * Singleton that bootstraps the plugin.
 *
 * @since 4.0.0
 */
final class Plugin {

	/**
	 * Singleton instance.
	 *
	 * @since 4.0.0
	 *
	 * @var self|null
	 */
	private static ?self $instance = null;

	/**
	 * Registered loadable components.
	 *
	 * @since 4.0.0
	 *
	 * @var LoadableInterface[]
	 */
	private array $components = [];

	/**
	 * Prevent direct instantiation.
	 *
	 * @since 4.0.0
	 */
	private function __construct() {}

	/**
	 * Return the singleton instance.
	 *
	 * @since 4.0.0
	 *
	 * @return self Plugin instance.
	 */
	public static function instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Initialise all plugin components.
	 *
	 * @since 4.0.0
	 *
	 * @return void
	 */
	public function init(): void {
		// Build shared data loader.
		$data_loader = new TableDataLoader();

		// Register components by priority.
		$this->components = [
			new ShortcodeRegistrar( $data_loader ),
			new GraphQLResolver(),
			new SettingsPage( $data_loader ),
		];

		// Sort by priority ascending.
		\usort(
			$this->components,
			static fn ( LoadableInterface $a, LoadableInterface $b ): int => $a->priority() <=> $b->priority()
		);

		// Register hooks.
		foreach ( $this->components as $component ) {
			$component->register();
		}
	}
}
