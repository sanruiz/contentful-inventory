<?php
/**
 * Main Plugin Class.
 *
 * Bootstraps all components using LoadableInterface priority system.
 *
 * @package SilverAssist\GraphQLShortcodeSupport\Core
 * @since   1.0.0
 */

namespace SilverAssist\GraphQLShortcodeSupport\Core;

use SilverAssist\GraphQLShortcodeSupport\Core\Interfaces\LoadableInterface;

// Prevent direct access.
\defined( 'ABSPATH' ) || exit;

/**
 * Plugin singleton class.
 *
 * @since 1.0.0
 */
class Plugin implements LoadableInterface {

	/**
	 * Plugin instance.
	 *
	 * @var Plugin|null
	 */
	private static ?Plugin $instance = null;

	/**
	 * Initialization flag.
	 *
	 * @var bool
	 */
	private bool $initialized = false;

	/**
	 * Get plugin instance.
	 *
	 * @return Plugin
	 */
	public static function instance(): Plugin {
		if ( self::$instance === null ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Private constructor to prevent direct instantiation.
	 */
	private function __construct() {
		// Initialization happens in init().
	}

	/**
	 * Initialize plugin.
	 *
	 * @return void
	 */
	public function init(): void {
		if ( $this->initialized ) {
			return;
		}

		$this->load_components();

		$this->initialized = true;
	}

	/**
	 * Get loading priority.
	 *
	 * @return int
	 */
	public function get_priority(): int {
		return 10;
	}

	/**
	 * Should this component load?
	 *
	 * @return bool
	 */
	public function should_load(): bool {
		return true;
	}

	/**
	 * Get components to load.
	 *
	 * @return array<class-string<LoadableInterface>>
	 */
	private function get_components(): array {
		return [
			\SilverAssist\GraphQLShortcodeSupport\Service\GraphQLShortcodeResolver::class,
			\SilverAssist\GraphQLShortcodeSupport\Admin\SettingsPage::class,
		];
	}

	/**
	 * Load all components by priority.
	 *
	 * @return void
	 */
	private function load_components(): void {
		$components = [];

		foreach ( $this->get_components() as $class ) {
			if ( method_exists( $class, 'instance' ) ) {
				$instance = $class::instance();
				if ( $instance->should_load() ) {
					$components[] = $instance;
				}
			}
		}

		// Sort by priority (lower first).
		usort( $components, fn( $a, $b ) => $a->get_priority() <=> $b->get_priority() );

		// Initialize all.
		foreach ( $components as $component ) {
			$component->init();
		}
	}
}
