<?php
/**
 * Plugin bootstrap.
 *
 * @package SilverAssist\CommunityListings
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   2.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\CommunityListings\Core;

use SilverAssist\CommunityListings\Core\Interfaces\LoadableInterface;
use SilverAssist\CommunityListings\Service\CptRegistrar;
use SilverAssist\CommunityListings\Service\GraphQLResolver;
use SilverAssist\CommunityListings\Service\RestApiFilters;

/**
 * Singleton that bootstraps the plugin.
 *
 * @since 2.0.0
 */
final class Plugin {

	/**
	 * Singleton instance.
	 *
	 * @since 2.0.0
	 *
	 * @var self|null
	 */
	private static ?self $instance = null;

	/**
	 * Registered loadable components.
	 *
	 * @since 2.0.0
	 *
	 * @var LoadableInterface[]
	 */
	private array $components = [];

	/**
	 * Prevent direct instantiation.
	 *
	 * @since 2.0.0
	 */
	private function __construct() {}

	/**
	 * Return the singleton instance.
	 *
	 * @since 2.0.0
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
	 * @since 2.0.0
	 *
	 * @return void
	 */
	public function init(): void {
		$this->components = [
			new CptRegistrar(),
			new RestApiFilters(),
			new GraphQLResolver(),
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
