<?php
/**
 * Loadable interface.
 *
 * @package SilverAssist\CommunityListings
 * @author  Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since   2.0.0
 */

declare( strict_types=1 );

namespace SilverAssist\CommunityListings\Core\Interfaces;

/**
 * Contract for components that register WordPress hooks.
 *
 * @since 2.0.0
 */
interface LoadableInterface {

	/**
	 * Return the loading priority.
	 *
	 * Lower numbers load first.
	 *
	 * @since 2.0.0
	 *
	 * @return int Loading priority.
	 */
	public function priority(): int;

	/**
	 * Register all WordPress hooks for this component.
	 *
	 * @since 2.0.0
	 *
	 * @return void
	 */
	public function register(): void;
}
