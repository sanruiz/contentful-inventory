<?php
/**
 * LoadableInterface defines the contract for loadable components.
 *
 * @package SilverAssist\GraphQLShortcodeSupport\Core\Interfaces
 * @since   1.0.0
 */

namespace SilverAssist\GraphQLShortcodeSupport\Core\Interfaces;

/**
 * LoadableInterface for priority-based component loading.
 *
 * @since 1.0.0
 */
interface LoadableInterface {

	/**
	 * Initialize the component.
	 *
	 * @return void
	 */
	public function init(): void;

	/**
	 * Get the loading priority.
	 *
	 * Lower numbers = higher priority.
	 * - 10: Core components (Plugin, Activator, critical services).
	 * - 20: Services (business logic, API clients).
	 * - 30: Admin components (controllers, settings pages).
	 * - 40: Utils & Assets (helpers, loggers).
	 *
	 * @return int
	 */
	public function get_priority(): int;

	/**
	 * Check if component should load.
	 *
	 * @return bool
	 */
	public function should_load(): bool;
}
