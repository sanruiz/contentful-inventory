# SilverAssist WordPress Plugin Development Standards

**Version**: 2.0.0  
**Last Updated**: January 24, 2026  
**Applies To**: All SilverAssist WordPress plugins

This document defines the development standards, best practices, testing requirements, and tooling configuration for all SilverAssist WordPress plugins. These standards ensure consistency, quality, and maintainability across the entire plugin suite.

---

## 📋 Table of Contents

1. [Plugin Architecture](#1-plugin-architecture)
2. [PHP Requirements](#2-php-requirements)
3. [Composer Configuration](#3-composer-configuration)
4. [Code Quality Tools](#4-code-quality-tools)
5. [Testing Strategy](#5-testing-strategy)
6. [WordPress Integration](#6-wordpress-integration)
7. [CI/CD Workflows](#7-cicd-workflows)
8. [Security Standards](#8-security-standards)
9. [Documentation Requirements](#9-documentation-requirements)
10. [Release Process](#10-release-process)
11. [VS Code AI Agent Customization](#11-vs-code-ai-agent-customization) ⭐ NEW

---

## 1. Plugin Architecture

### 1.1 File Structure

```
plugin-name/
├── plugin-name.php              # Main plugin file
├── composer.json                # Composer dependencies & autoloading
├── README.md                    # User documentation
├── CONTRIBUTING.md              # Developer documentation
├── CHANGELOG.md                 # Version history
├── LICENSE                      # License file
├── phpcs.xml                    # PHPCS configuration
├── phpstan.neon                 # PHPStan configuration
├── phpunit.xml.dist             # PHPUnit configuration
├── .github/                     # GitHub & AI agent configuration
│   ├── copilot-instructions.md # Global AI agent context
│   ├── instructions/           # File-specific AI instructions
│   │   ├── php.instructions.md
│   │   ├── testing.instructions.md
│   │   └── ...
│   ├── skills/                 # Specialized AI task skills
│   │   ├── release-management/
│   │   ├── quality-checks/
│   │   └── ...
│   └── workflows/              # CI/CD workflows
├── includes/                    # PSR-4 classes
│   ├── Core/                    # Core plugin functionality
│   │   ├── Plugin.php          # Main plugin bootstrap
│   │   ├── Activator.php       # Plugin activation logic
│   │   └── Interfaces/
│   │       └── LoadableInterface.php
│   ├── Service/                 # Business logic services
│   │   └── Loader.php          # Service component loader
│   ├── Admin/                   # WordPress admin integration
│   │   └── Loader.php          # Admin component loader
│   ├── Controller/              # HTTP/Admin request handlers
│   ├── View/                    # HTML rendering (static classes)
│   ├── Model/                   # Domain models
│   ├── Repository/              # Data access layer
│   └── Utils/                   # Utility classes
│       ├── Helpers.php         # Global helper functions
│       └── Logger.php          # Logging functionality
├── assets/                      # Frontend assets
│   ├── css/                    # Stylesheets
│   └── js/                     # JavaScript files
├── languages/                   # Translation files
│   └── plugin-name.pot         # Translation template
├── scripts/                     # Build & deployment scripts
│   ├── build-release.sh        # Production build script
│   ├── run-quality-checks.sh   # Quality checks runner
│   ├── install-wp-tests.sh     # WordPress Test Suite installer
│   ├── update-version-simple.sh # Version update automation
│   └── check-versions.sh       # Version consistency checker
├── tests/                       # PHPUnit tests
│   ├── bootstrap.php           # Test bootstrap
│   ├── README.md               # Testing documentation
│   ├── Unit/                   # Unit tests (mirrors includes/ structure)
│   ├── Integration/            # Integration tests
│   └── Helpers/                # Test utilities
│       ├── TestCase.php        # Base test class
│       └── Helpers.php         # Test helper functions
└── docs/                        # Additional documentation
    └── API_REFERENCE.md        # API documentation
```

### 1.2 PSR-4 Autoloading

Namespace Structure: `SilverAssist\PluginName\`

```json
// composer.json
{
    "autoload": {
        "psr-4": {
            "SilverAssist\\PluginName\\": "includes/"
        }
    }
}
```

**File Naming Rules:**
- PHP classes: `PascalCase.php` matching class names exactly
- Directories: `PascalCase/` (e.g., `Core/`, `Admin/`, `Service/`)
- Assets: `kebab-case.css`, `kebab-case.js`

### 1.3 Main Plugin File Header

**CRITICAL**: All plugins must include the `Update URI` header to prevent update conflicts.

```php
<?php
/**
 * Plugin Name: Plugin Display Name
 * Plugin URI: https://github.com/SilverAssist/plugin-slug
 * Description: Brief plugin description.
 * Version: 1.0.0
 * Author: Silver Assist
 * Author URI: https://silverassist.com
 * License: PolyForm-Noncommercial-1.0.0
 * License URI: https://polyformproject.org/licenses/noncommercial/1.0.0/
 * Text Domain: plugin-text-domain
 * Domain Path: /languages
 * Requires at least: 6.5
 * Tested up to: 6.8
 * Requires PHP: 8.2
 * Network: false
 * Update URI: https://github.com/SilverAssist/plugin-slug
 *
 * @package SilverAssist\PluginName
 * @author Silver Assist
 * @license PolyForm-Noncommercial-1.0.0
 * @since 1.0.0
 */

// Prevent direct access.
\defined( 'ABSPATH' ) || exit;

// Define plugin constants.
define( 'PLUGIN_PREFIX_VERSION', '1.0.0' );
define( 'PLUGIN_PREFIX_FILE', __FILE__ );
define( 'PLUGIN_PREFIX_PATH', plugin_dir_path( __FILE__ ) );
define( 'PLUGIN_PREFIX_BASENAME', plugin_basename( __FILE__ ) );

/**
 * Composer autoloader with security validation.
 */
$plugin_prefix_autoload_path      = PLUGIN_PREFIX_PATH . 'vendor/autoload.php';
$plugin_prefix_real_autoload_path = realpath( $plugin_prefix_autoload_path );
$plugin_prefix_plugin_real_path   = realpath( PLUGIN_PREFIX_PATH );

// Validate: both paths resolve, autoloader is inside plugin directory.
if (
    $plugin_prefix_real_autoload_path &&
    $plugin_prefix_plugin_real_path &&
    0 === strpos( $plugin_prefix_real_autoload_path, $plugin_prefix_plugin_real_path )
) {
    require_once $plugin_prefix_real_autoload_path;
} else {
    add_action(
        'admin_notices',
        function () {
            printf(
                '<div class="notice notice-error"><p>%s</p></div>',
                esc_html__( 'Plugin Name: Missing or invalid Composer dependencies. Run "composer install".', 'plugin-text-domain' )
            );
        }
    );
    return;
}

// Initialize plugin.
add_action(
    'plugins_loaded',
    function () {
        \SilverAssist\PluginName\Core\Plugin::instance()->init();
    }
);

// Register activation hook.
register_activation_hook(
    __FILE__,
    function () {
        \SilverAssist\PluginName\Core\Activator::activate();
    }
);
```

**Key Elements:**
- `Update URI` header prevents WordPress.org update conflicts
- Prefixed global variables for WPCS compliance
- Security validation for Composer autoloader path
- Graceful degradation with admin notice
- Proper hook registration

### 1.4 LoadableInterface Pattern

All components implement priority-based loading:

```php
<?php
namespace SilverAssist\PluginName\Core\Interfaces;

/**
 * LoadableInterface defines the contract for loadable components.
 *
 * @package SilverAssist\PluginName\Core\Interfaces
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
     * Suggested values:
     * - 10: Core components (Plugin, Activator, critical services)
     * - 20: Services (business logic, API clients)
     * - 30: Admin components (controllers, settings pages)
     * - 40: Utils & Assets (helpers, loggers)
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
```

### 1.5 Singleton Pattern with LoadableInterface

Main classes use singleton pattern:

```php
<?php
namespace SilverAssist\PluginName\Core;

use SilverAssist\PluginName\Core\Interfaces\LoadableInterface;

/**
 * Main Plugin Class.
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
        // Initialization logic.
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
        $this->init_hooks();

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
            \SilverAssist\PluginName\Service\ServiceName::class,
            \SilverAssist\PluginName\Admin\Settings::class,
            // Add more components here.
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
```

### 1.6 View Classes (Static, No LoadableInterface)

Views are static classes for HTML rendering:

```php
<?php
namespace SilverAssist\PluginName\View\Admin;

\defined( 'ABSPATH' ) || exit;

/**
 * Settings page view.
 */
class SettingsView {
    /**
     * Render the settings page.
     *
     * @param array<string, mixed> $data Data to render.
     * @return void
     */
    public static function render( array $data ): void {
        ?>
        <div class="wrap">
            <h1><?php \esc_html_e( 'Settings', 'plugin-text-domain' ); ?></h1>
            <!-- HTML content -->
        </div>
        <?php
    }
}
```

---

## 2. PHP Requirements

### 2.1 PHP Version

- **Minimum**: PHP 8.2
- **Recommended**: PHP 8.3+
- **Features**: Modern PHP features (enums, readonly properties, union types, named arguments)

### 2.2 WordPress Naming Conventions

**CRITICAL**: All plugins must follow WordPress naming conventions for WPCS compliance.

#### Global Variables

ALL global variables MUST be prefixed:

```php
// ✅ CORRECT: Prefixed global variables.
$plugin_prefix_autoload_path      = PLUGIN_PREFIX_PATH . 'vendor/autoload.php';
$plugin_prefix_real_autoload_path = realpath( $plugin_prefix_autoload_path );
$plugin_prefix_plugin_real_path   = realpath( PLUGIN_PREFIX_PATH );

// ❌ INCORRECT: Non-prefixed global variables (WPCS violation).
$autoload_path      = PLUGIN_PREFIX_PATH . 'vendor/autoload.php';
$real_autoload_path = realpath( $autoload_path );
$plugin_real_path   = realpath( PLUGIN_PREFIX_PATH );
```

#### Inline Comments

ALL inline comments MUST end with proper punctuation (`.`, `!`, or `?`):

```php
// ✅ CORRECT: Comment ends with period.
// Validate: both paths resolve, autoloader is inside plugin directory.

// ❌ INCORRECT: Comment missing punctuation (WPCS violation).
// Validate: both paths resolve, autoloader is inside plugin directory
```

#### WordPress Function Prefix in Namespaced Code

```php
// ✅ CORRECT: Backslash prefix for WP functions in namespaced code.
\add_action( 'init', [ $this, 'init' ] );
\get_option( 'option_name' );
\sanitize_text_field( $input );

// ❌ INCORRECT: No backslash (may cause issues).
add_action( 'init', [ $this, 'init' ] );
```

#### String Quotation

```php
// ✅ CORRECT: Single quotes for strings without interpolation.
$status = 'active';
__( 'Text', 'plugin-text-domain' );

// ✅ CORRECT: Double quotes for interpolation.
$path = "includes/{$directory}/file.php";

// ❌ INCORRECT: Double quotes without interpolation.
$status = "active";
```

#### Naming Convention Summary

1. Global variables: Prefix with `plugin_prefix_`
2. Functions: Prefix with `plugin_prefix_`
3. Constants: Prefix with `PLUGIN_PREFIX_`
4. Classes: Use namespaced classes (no prefix needed due to PSR-4)
5. Inline comments: Always end with `.`, `!`, or `?`
6. PHPDoc blocks: Follow WordPress documentation standards

---

## 3. Composer Configuration

### 3.1 Base composer.json

```json
{
    "name": "silverassist/plugin-slug",
    "description": "WordPress plugin description",
    "type": "wordpress-plugin",
    "license": "PolyForm-Noncommercial-1.0.0",
    "authors": [
        {
            "name": "Silver Assist",
            "homepage": "https://silverassist.com/"
        }
    ],
    "minimum-stability": "stable",
    "require": {
        "php": ">=8.2",
        "composer/installers": "^2.0",
        "silverassist/wp-github-updater": "^1.1",
        "silverassist/wp-settings-hub": "^1.0"
    },
    "require-dev": {
        "dealerdirect/phpcodesniffer-composer-installer": "^1.0",
        "php-stubs/wordpress-stubs": "^6.6",
        "php-stubs/wordpress-tests-stubs": "^6.6",
        "phpcompatibility/phpcompatibility-wp": "^2.1",
        "phpstan/phpstan": "*",
        "phpunit/phpunit": "^9.6",
        "squizlabs/php_codesniffer": "^3.7 || ^4.0",
        "szepeviktor/phpstan-wordpress": "^1.3 || ^2.0",
        "wp-coding-standards/wpcs": "^3.0",
        "yoast/phpunit-polyfills": "^4.0"
    },
    "autoload": {
        "psr-4": {
            "SilverAssist\\PluginName\\": "includes/"
        }
    },
    "autoload-dev": {
        "psr-4": {
            "SilverAssist\\PluginName\\Tests\\": "tests/"
        }
    },
    "scripts": {
        "phpcs": "phpcs",
        "phpcbf": "phpcbf",
        "phpstan": "phpstan analyse --memory-limit=1G",
        "phpunit": "phpunit",
        "test": [
            "@phpcs",
            "@phpstan",
            "@phpunit"
        ]
    },
    "config": {
        "allow-plugins": {
            "composer/installers": true,
            "dealerdirect/phpcodesniffer-composer-installer": true
        }
    }
}
```

### 3.2 SilverAssist Required Packages

#### wp-github-updater

Enables automatic updates from GitHub releases.

**Installation:**
```bash
composer require silverassist/wp-github-updater:^1.1
```

**Integration (in main Plugin class):**
```php
use SilverAssist\GitHubUpdater\UpdaterConfig;

/**
 * Initialize GitHub updater.
 *
 * @return void
 */
private function init_updater(): void {
    if ( ! class_exists( UpdaterConfig::class ) ) {
        return;
    }

    $config = new UpdaterConfig(
        plugin_basename: PLUGIN_PREFIX_BASENAME,
        version: PLUGIN_PREFIX_VERSION,
        github_repo: 'SilverAssist/plugin-slug',
        plugin_file: PLUGIN_PREFIX_FILE
    );

    $config->init();
}
```

**IMPORTANT:** Do NOT add update-related headers to plugin file (handled programmatically).

#### wp-settings-hub

Provides unified settings interface for all SilverAssist plugins.

**Installation:**
```bash
composer require silverassist/wp-settings-hub:^1.0
```

**Integration (in Settings class):**
```php
use SilverAssist\SettingsHub\SettingsHub;

/**
 * Register settings page.
 *
 * @return void
 */
public function register_settings_page(): void {
    if ( ! class_exists( SettingsHub::class ) ) {
        // Fallback: Register standalone settings page.
        \add_options_page(
            __( 'Plugin Settings', 'plugin-text-domain' ),
            __( 'Plugin Name', 'plugin-text-domain' ),
            'manage_options',
            'plugin-settings',
            [ $this, 'render_settings_page' ]
        );
        return;
    }

    // Register with Settings Hub.
    SettingsHub::get_instance()->register_plugin_page(
        slug: 'plugin-settings',
        title: __( 'Plugin Name', 'plugin-text-domain' ),
        callback: [ $this, 'render_settings_page' ],
        icon: 'dashicons-admin-generic',
        position: 10
    );
}
```

**Note:** Settings Hub uses `get_instance()` (different from plugin singletons).

---

## 4. Code Quality Tools

### 4.1 PHP_CodeSniffer (PHPCS)

**Configuration File:** `phpcs.xml`

```xml
<?xml version="1.0"?>
<ruleset name="SilverAssist Plugin Standards">
    <description>WordPress Coding Standards for SilverAssist Plugins</description>

    <!-- What to scan -->
    <file>.</file>

    <!-- Exclude paths -->
    <exclude-pattern>*/vendor/*</exclude-pattern>
    <exclude-pattern>*/node_modules/*</exclude-pattern>
    <exclude-pattern>*/.git/*</exclude-pattern>
    <exclude-pattern>*/tests/*</exclude-pattern>
    <exclude-pattern>*/build/*</exclude-pattern>
    <exclude-pattern>*/assets/js/*</exclude-pattern>
    <exclude-pattern>*/assets/css/*</exclude-pattern>

    <!-- Show progress and colors -->
    <arg value="ps"/>
    <arg name="colors"/>

    <!-- Check code for cross-version PHP compatibility -->
    <config name="testVersion" value="8.2-"/>

    <!-- Include WordPress-Extra standard -->
    <rule ref="WordPress-Extra">
        <!-- Allow short array syntax -->
        <exclude name="Generic.Arrays.DisallowShortArraySyntax"/>

        <!-- PSR-4 PascalCase filenames, not WordPress hyphenated lowercase -->
        <exclude name="WordPress.Files.FileName.NotHyphenatedLowercase"/>
        <exclude name="WordPress.Files.FileName.InvalidClassFileName"/>

        <!-- Allow opening braces on same line (K&R style) -->
        <exclude name="Generic.Functions.OpeningFunctionBraceKernighanRitchie"/>
        <exclude name="Generic.Classes.OpeningBraceSameLine"/>
    </rule>

    <!-- Allow short array syntax explicitly -->
    <rule ref="Universal.Arrays.DisallowShortArraySyntax">
        <exclude name="Universal.Arrays.DisallowShortArraySyntax.Found"/>
    </rule>

    <!-- Enforce WordPress naming conventions -->
    <rule ref="WordPress.NamingConventions.PrefixAllGlobals">
        <properties>
            <property name="prefixes" type="array">
                <element value="plugin_prefix"/>
                <element value="SilverAssist\PluginName"/>
            </property>
        </properties>
    </rule>

    <!-- Enforce WordPress documentation standards -->
    <rule ref="WordPress-Docs"/>

    <!-- Extra rules -->
    <rule ref="Generic.CodeAnalysis.UnusedFunctionParameter"/>
    <rule ref="Generic.Commenting.Todo"/>

    <!-- Minimum WordPress version -->
    <config name="minimum_supported_wp_version" value="6.5"/>
</ruleset>
```

**Usage:**
```bash
# Auto-fix code standards.
composer phpcbf
# or
vendor/bin/phpcbf

# Check code standards.
composer phpcs
# or
vendor/bin/phpcs

# Check specific file.
vendor/bin/phpcs includes/Core/Plugin.php

# Generate report.
vendor/bin/phpcs --report=summary
```

### 4.2 PHPStan (Static Analysis)

**Configuration File:** `phpstan.neon`

```yaml
includes:
    - vendor/szepeviktor/phpstan-wordpress/extension.neon

parameters:
    level: 8
    paths:
        - includes
    bootstrapFiles:
        - plugin-main-file.php
    scanDirectories:
        - vendor
    excludePaths:
        - tests/*
        - build/*
```

**Usage:**
```bash
# Run static analysis.
composer phpstan
# or
php -d memory_limit=512M vendor/bin/phpstan analyse --no-progress

# Analyze specific directory.
php -d memory_limit=512M vendor/bin/phpstan analyse includes/Service/ --no-progress

# Generate baseline (ignore existing errors).
vendor/bin/phpstan analyse --generate-baseline
```

**Level 8 Requirements:**
- No unused variables
- Strict type checking
- Full PHPDoc coverage
- No mixed types without reason

### 4.3 Quality Check Script

**File:** `scripts/run-quality-checks.sh`

This script centralizes all quality checks for consistent execution across local development and CI/CD.

**Key Features:**
- Auto-fixes code standards (phpcbf)
- Validates WordPress Coding Standards (phpcs)
- Runs static analysis (phpstan level 8)
- Executes PHPUnit tests with WordPress Test Suite
- Proper exit codes for CI/CD failure detection

**Usage:**
```bash
# Run all checks (with WordPress Test Suite).
./scripts/run-quality-checks.sh all

# Run all checks (skip WordPress setup - faster).
./scripts/run-quality-checks.sh --skip-wp-setup all

# Run specific checks.
./scripts/run-quality-checks.sh phpcs phpstan
./scripts/run-quality-checks.sh phpunit

# Quick local checks.
./scripts/run-quality-checks.sh --skip-wp-setup phpcs phpstan
```

**CRITICAL Pattern:** All check functions must return proper exit codes:

```bash
run_phpcs() {
    print_header "🔍 Running PHPCS"

    cd "$PROJECT_ROOT"

    # ✅ CORRECT: Capture exit code and return appropriate value.
    if vendor/bin/phpcs --warning-severity=0; then
        print_success "PHPCS passed - No errors found"
        return 0
    else
        print_error "PHPCS failed - Code style errors found"
        return 1
    fi
}
```

---

## 5. Testing Strategy

### 5.1 PHPUnit Configuration

**File:** `phpunit.xml.dist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:noNamespaceSchemaLocation="https://schema.phpunit.de/9.6/phpunit.xsd"
    bootstrap="tests/bootstrap.php"
    colors="true"
    verbose="true"
    stopOnFailure="false"
    stopOnError="false"
    beStrictAboutOutputDuringTests="true"
    beStrictAboutTodoAnnotatedTests="true">

    <testsuites>
        <testsuite name="unit">
            <directory suffix="Test.php">./tests/Unit</directory>
        </testsuite>
        <testsuite name="integration">
            <directory suffix="Test.php">./tests/Integration</directory>
        </testsuite>
        <testsuite name="all">
            <directory suffix="Test.php">./tests/Unit</directory>
            <directory suffix="Test.php">./tests/Integration</directory>
        </testsuite>
    </testsuites>

    <groups>
        <exclude>
            <group>ajax</group>
            <group>ms-files</group>
            <group>external-http</group>
        </exclude>
    </groups>

    <coverage processUncoveredFiles="true">
        <include>
            <directory suffix=".php">./includes</directory>
        </include>
        <exclude>
            <directory>./vendor</directory>
            <directory>./tests</directory>
        </exclude>
    </coverage>

    <php>
        <!-- Environment Variables -->
        <env name="WP_ENVIRONMENT_TYPE" value="test"/>
        <env name="WP_DEBUG" value="true"/>
        <env name="WP_DEBUG_LOG" value="false"/>
        <env name="WP_DEBUG_DISPLAY" value="false"/>
        <env name="SCRIPT_DEBUG" value="false"/>

        <!-- PHPUnit Configuration -->
        <const name="WP_TESTS_PHPUNIT_POLYFILLS_PATH" value="vendor/yoast/phpunit-polyfills"/>

        <!-- Plugin Testing -->
        <const name="PLUGIN_PREFIX_TESTING" value="true"/>
    </php>
</phpunit>
```

### 5.2 Test Bootstrap

**File:** `tests/bootstrap.php`

```php
<?php
/**
 * PHPUnit Bootstrap for SilverAssist Plugin.
 *
 * @package SilverAssist\PluginName
 */

// Composer autoloader for stubs and dependencies.
require_once dirname( __DIR__ ) . '/vendor/autoload.php';

// Define test constants.
if ( ! defined( 'PLUGIN_PREFIX_TESTING' ) ) {
    define( 'PLUGIN_PREFIX_TESTING', true );
}

define( 'PLUGIN_PREFIX_TESTS_DIR', __DIR__ );
define( 'PLUGIN_PREFIX_PLUGIN_DIR', dirname( __DIR__ ) );
define( 'PLUGIN_PREFIX_PLUGIN_FILE', PLUGIN_PREFIX_PLUGIN_DIR . '/plugin-main-file.php' );

// Define plugin constants (normally defined in main plugin file).
if ( ! defined( 'PLUGIN_PREFIX_VERSION' ) ) {
    define( 'PLUGIN_PREFIX_VERSION', '1.0.0' );
}
if ( ! defined( 'PLUGIN_PREFIX_FILE' ) ) {
    define( 'PLUGIN_PREFIX_FILE', PLUGIN_PREFIX_PLUGIN_FILE );
}
if ( ! defined( 'PLUGIN_PREFIX_PATH' ) ) {
    define( 'PLUGIN_PREFIX_PATH', PLUGIN_PREFIX_PLUGIN_DIR . '/' );
}
if ( ! defined( 'PLUGIN_PREFIX_BASENAME' ) ) {
    define( 'PLUGIN_PREFIX_BASENAME', 'plugin-name/plugin-main-file.php' );
}

// WordPress test environment check.
$_tests_dir = getenv( 'WP_TESTS_DIR' );

if ( ! $_tests_dir ) {
    $_tests_dir = rtrim( sys_get_temp_dir(), '/\\' ) . '/wordpress-tests-lib';
}

// Check if WordPress test suite is available.
$wp_tests_available  = false;
$_tests_includes_dir = null;

if ( file_exists( $_tests_dir . '/includes/functions.php' ) ) {
    // Standard wordpress-tests-lib structure.
    $wp_tests_available  = true;
    $_tests_includes_dir = $_tests_dir . '/includes';
} elseif ( file_exists( $_tests_dir . '/tests/phpunit/includes/functions.php' ) ) {
    // wordpress-develop repository structure.
    $wp_tests_available  = true;
    $_tests_includes_dir = $_tests_dir . '/tests/phpunit/includes';
}

/**
 * Manually load the plugin being tested.
 */
function _manually_load_plugin() {
    // Load composer autoloader.
    if ( file_exists( PLUGIN_PREFIX_PLUGIN_DIR . '/vendor/autoload.php' ) ) {
        require_once PLUGIN_PREFIX_PLUGIN_DIR . '/vendor/autoload.php';
    }

    // Note: Do NOT load main plugin file here.
    // It will be loaded by WordPress Test Suite after WordPress loads.
}

if ( $wp_tests_available ) {
    // Load WordPress Test Suite.
    require_once $_tests_includes_dir . '/functions.php';

    tests_add_filter( 'muplugins_loaded', '_manually_load_plugin' );

    // Start WordPress Test Suite.
    require_once $_tests_includes_dir . '/bootstrap.php';
} else {
    // WordPress Test Suite not available - tests will use mocks.
    echo "Warning: WordPress Test Suite not found. Tests will run with limited functionality.\n";
    _manually_load_plugin();
}
```

### 5.3 Base Test Class

**File:** `tests/Helpers/TestCase.php`

```php
<?php
/**
 * Base Test Case for SilverAssist Plugin.
 *
 * @package SilverAssist\PluginName
 * @subpackage Tests\Helpers
 */

namespace SilverAssist\PluginName\Tests\Helpers;

/**
 * Base test case using WordPress Test Suite.
 *
 * All tests extend this class to have access to WordPress functions,
 * factory methods, and proper database transaction rollback.
 */
abstract class TestCase extends \WP_UnitTestCase {
    // Base test functionality.
}
```

### 5.4 WordPress Factory Pattern

**CRITICAL:** Use `static::factory()` (NOT `$this->factory`) - deprecated since WordPress 6.1+

```php
public function set_up(): void {
    parent::set_up();

    // ✅ CORRECT: static::factory() pattern.
    $this->admin_user_id = static::factory()->user->create( [
        'role' => 'administrator',
    ] );
    \wp_set_current_user( $this->admin_user_id );

    $this->post_id = static::factory()->post->create( [
        'post_title'  => 'Test Post',
        'post_status' => 'publish',
        'post_type'   => 'post',
    ] );

    // ❌ INCORRECT: Old $this->factory pattern (deprecated).
    // $user_id = $this->factory->user->create(...);  // DO NOT USE.
}
```

**Available Factories:**
```php
static::factory()->post->create([...]);      // Create posts.
static::factory()->user->create([...]);      // Create users.
static::factory()->comment->create([...]);   // Create comments.
static::factory()->term->create([...]);      // Create terms.
static::factory()->category->create([...]);  // Create categories.
```

### 5.5 Database Schema Changes in Tests

**CRITICAL:** `CREATE TABLE` triggers implicit MySQL `COMMIT` which breaks WordPress Test Suite's transaction-based rollback.

**The Problem:**
- WordPress Test Suite wraps each test in a transaction (`START TRANSACTION`)
- After each test, it rolls back the transaction (`ROLLBACK`) to restore clean state
- `CREATE TABLE` triggers an implicit COMMIT, breaking this rollback mechanism
- Result: Tables persist incorrectly or disappear unexpectedly between tests

**The Solution - Use wpSetUpBeforeClass():**

```php
class YourTest extends TestCase {
    /**
     * Create shared fixtures before class.
     *
     * Runs ONCE before any tests in the class.
     * Use this for CREATE TABLE statements.
     *
     * @param WP_UnitTest_Factory $factory Factory instance.
     */
    public static function wpSetUpBeforeClass( $factory ): void {
        global $wpdb;

        // ✅ CREATE TABLE happens outside transaction system.
        // Safe to use here - runs once before all tests.
        Activator::create_tables();
    }

    /**
     * Setup test environment.
     *
     * Runs BEFORE EACH test. DO NOT create tables here.
     */
    public function set_up(): void {
        parent::set_up();

        // ✅ TRUNCATE is safe - doesn't trigger COMMIT.
        $this->clean_table_data();
    }

    /**
     * Clean table data.
     *
     * @return void
     */
    protected function clean_table_data(): void {
        global $wpdb;
        $table_name = $wpdb->prefix . 'your_table';

        // TRUNCATE doesn't trigger COMMIT - safe for test isolation.
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery
        $wpdb->query( $wpdb->prepare( 'TRUNCATE TABLE %i', $table_name ) );
    }
}
```

**MySQL Statements That Trigger Implicit COMMIT:**
- `CREATE TABLE` / `DROP TABLE` (use wpSetUpBeforeClass)
- `CREATE DATABASE` / `DROP DATABASE`
- `ALTER TABLE` (use wpSetUpBeforeClass)
- `RENAME TABLE`

**Safe for setUp() / tearDown():**
- `TRUNCATE TABLE` (safe in WordPress Test Suite context)
- `INSERT` / `UPDATE` / `DELETE` (regular DML)
- `SELECT` queries

### 5.6 Test Naming Conventions

Since TestCase extends WP_UnitTestCase, use WordPress-style snake_case for lifecycle methods:

```php
// ✅ CORRECT: WordPress snake_case style (WP_UnitTestCase).
public function set_up(): void
public function tear_down(): void
public static function set_up_before_class(): void
public static function tear_down_after_class(): void

// Test methods use camelCase.
public function testMethodReturnsExpectedValue(): void

// ❌ WRONG: PHPUnit camelCase style (don't use with WP_UnitTestCase).
public function setUp(): void
public function tearDown(): void
```

### 5.7 Running Tests

```bash
# Run all tests.
composer phpunit
# or
vendor/bin/phpunit

# Run specific test suite.
vendor/bin/phpunit --testsuite unit
vendor/bin/phpunit --testsuite integration

# Run specific test file.
vendor/bin/phpunit tests/Unit/Core/PluginTest.php

# Run specific test method.
vendor/bin/phpunit --filter testMethodName

# With coverage (requires xdebug).
vendor/bin/phpunit --coverage-html coverage/
vendor/bin/phpunit --coverage-text

# Human-readable output.
vendor/bin/phpunit --testdox
```

---

## 6. WordPress Integration

### 6.1 WordPress Test Suite Setup

**Script:** `scripts/install-wp-tests.sh`

This script downloads and configures the WordPress Test Suite.

**Usage:**
```bash
bash scripts/install-wp-tests.sh <db-name> <db-user> <db-pass> <db-host> <wp-version> <skip-database-creation>
```

**Example:**
```bash
bash scripts/install-wp-tests.sh wordpress_test root 'root' localhost latest true
```

### 6.2 Real WordPress Functions in Tests

With `WP_UnitTestCase`, you have access to ALL WordPress functions:

```php
// Options API.
\update_option( 'key', 'value' );
$value = \get_option( 'key' );
\delete_option( 'key' );

// User functions.
\wp_set_current_user( $user_id );
$can_edit = \current_user_can( 'edit_posts' );

// Post functions.
\wp_delete_post( $post_id, true );
$post = \get_post( $post_id );

// Hooks.
\has_action( 'hook_name', $callback );
\has_filter( 'filter_name', $callback );
\add_action( 'hook_name', $callback );
\do_action( 'hook_name', $args );
```

### 6.3 Plugin Activation/Deactivation Hooks

```php
// In main plugin file.
register_activation_hook(
    __FILE__,
    function () {
        \SilverAssist\PluginName\Core\Activator::activate();
    }
);

register_deactivation_hook(
    __FILE__,
    function () {
        \SilverAssist\PluginName\Core\Activator::deactivate();
    }
);
```

**Activator Class:**

```php
<?php
namespace SilverAssist\PluginName\Core;

/**
 * Plugin Activator.
 */
class Activator {
    /**
     * Plugin activation logic.
     *
     * @return void
     */
    public static function activate(): void {
        // Create database tables.
        self::create_tables();

        // Set default options.
        self::set_default_options();

        // Flush rewrite rules.
        \flush_rewrite_rules();
    }

    /**
     * Plugin deactivation logic.
     *
     * @return void
     */
    public static function deactivate(): void {
        // Clean up temporary data.
        // Flush rewrite rules.
        \flush_rewrite_rules();
    }

    /**
     * Create database tables.
     *
     * @return void
     */
    public static function create_tables(): void {
        global $wpdb;

        $charset_collate = $wpdb->get_charset_collate();
        $table_name      = $wpdb->prefix . 'plugin_table';

        // IMPORTANT: dbDelta cannot use prepared statements.
        // Table name is safe because it's $wpdb->prefix + literal string.
        $sql = "CREATE TABLE {$table_name} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            created_at datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
            PRIMARY KEY  (id)
        ) {$charset_collate};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        \dbDelta( $sql );
    }

    /**
     * Set default options.
     *
     * @return void
     */
    private static function set_default_options(): void {
        if ( ! \get_option( 'plugin_prefix_settings' ) ) {
            \update_option( 'plugin_prefix_settings', [
                'enabled' => true,
            ] );
        }
    }
}
```

### 6.4 Database Operations

**Use %i placeholder for table/column names (WordPress 6.2+):**

```php
// ✅ CORRECT: Use %i for identifiers.
$results = $wpdb->get_results(
    $wpdb->prepare(
        'SELECT * FROM %i WHERE status = %s AND form_id = %d',
        $table_name,
        $status,
        $form_id
    ),
    ARRAY_A
);

// ✅ CORRECT: DROP TABLE with %i.
$wpdb->query( $wpdb->prepare( 'DROP TABLE IF EXISTS %i', $table_name ) );

// ❌ WRONG: Direct interpolation.
$results = $wpdb->get_results(
    "SELECT * FROM {$table_name} WHERE status = '{$status}'"
);
```

**Placeholder Reference:**

| Placeholder | Use Case | Example |
|-------------|----------|---------|
| `%i` | Identifiers (table/column names) | `SELECT * FROM %i` |
| `%s` | Strings | `WHERE status = %s` |
| `%d` | Integers | `WHERE id = %d` |
| `%f` | Floats | `WHERE price = %f` |

---

## 7. CI/CD Workflows

### 7.1 Workflow Architecture

All SilverAssist plugins use a modular GitHub Actions workflow system:

```
.github/workflows/
├── ci.yml                    # Continuous Integration (PRs and pushes)
├── release.yml               # Release automation (git tags)
├── dependency-updates.yml    # Weekly dependency checks
└── quality-checks.yml        # Reusable quality checks workflow
```

### 7.2 Continuous Integration Workflow

**File:** `.github/workflows/ci.yml`

```yaml
name: CI
permissions:
  contents: read

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]
  workflow_dispatch:

jobs:
  # Quality checks for PHP 8.2 (with coverage).
  quality-checks-82:
    name: Quality Checks (PHP 8.2)
    uses: ./.github/workflows/quality-checks.yml
    with:
      php-version: '8.2'
      skip-wp-setup: false
      upload-coverage: true

  # Quality checks for PHP 8.3.
  quality-checks-83:
    name: Quality Checks (PHP 8.3)
    uses: ./.github/workflows/quality-checks.yml
    with:
      php-version: '8.3'
      skip-wp-setup: false
      upload-coverage: false

  # Quality checks for PHP 8.4.
  quality-checks-84:
    name: Quality Checks (PHP 8.4)
    uses: ./.github/workflows/quality-checks.yml
    with:
      php-version: '8.4'
      skip-wp-setup: false
      upload-coverage: false

  security-scan:
    name: Security Scan
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v5

      - name: Setup PHP 8.2
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
          extensions: mbstring, intl
          coverage: none

      - name: Install Composer dependencies
        run: composer install --no-interaction --no-progress --optimize-autoloader

      - name: Security audit
        run: composer audit

  compatibility:
    name: WordPress Compatibility
    runs-on: ubuntu-latest
    strategy:
      matrix:
        wordpress-version: ['6.5', '6.6', '6.7', 'latest']

    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: wordpress_test
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5

    steps:
      - name: Checkout code
        uses: actions/checkout@v5

      - name: Setup PHP 8.2
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
          extensions: mbstring, intl, mysql, pdo_mysql
          coverage: none

      - name: Install Composer dependencies
        run: composer install --no-interaction --no-progress --optimize-autoloader

      - name: Setup WordPress ${{ matrix.wordpress-version }}
        run: bash scripts/install-wp-tests.sh wordpress_test root 'root' 127.0.0.1 ${{ matrix.wordpress-version }} false

      - name: Run tests
        run: vendor/bin/phpunit
```

### 7.3 Release Workflow

**File:** `.github/workflows/release.yml`

Key features:
- Validates version consistency across all files
- Runs full quality checks
- Builds production ZIP (no dev dependencies)
- Creates GitHub Release automatically

**CRITICAL:** Never manually create releases - let the workflow do it.

### 7.4 Workflow Strategy

| Workflow | WordPress Tests | Approx. Time | Purpose |
|----------|-----------------|--------------|---------|
| ci.yml | ✅ Yes | ~8-10 min | Full integration testing on PRs |
| release.yml | ✅ Yes | ~10-12 min | Exhaustive validation before release |
| dependency-updates.yml | ❌ No | ~2-3 min | Fast Composer package validation |

---

## 8. Security Standards

### 8.1 Input Sanitization

Always sanitize user inputs:

```php
$text  = \sanitize_text_field( \wp_unslash( $_POST['field_name'] ) );
$email = \sanitize_email( $_POST['email'] );
$url   = \esc_url_raw( $_POST['url'] );
$int   = \absint( $_POST['number'] );
$key   = \sanitize_key( $_POST['key'] );
$array = \array_map( 'sanitize_text_field', $_POST['array_field'] );
```

### 8.2 Output Escaping

Always escape outputs:

```php
// HTML output.
echo \esc_html( $text );

// Attribute output.
echo '<div class="' . \esc_attr( $class ) . '">';

// URL output.
echo '<a href="' . \esc_url( $url ) . '">';

// JavaScript output.
echo '<script>var data = ' . \wp_json_encode( $data ) . ';</script>';

// Translation with escaping.
echo \esc_html__( 'Text', 'plugin-text-domain' );
```

### 8.3 Nonce Verification

Use nonces for all forms and AJAX requests:

```php
// Create nonce.
\wp_nonce_field( 'plugin_action', 'plugin_nonce' );

// Verify nonce.
if ( ! isset( $_POST['plugin_nonce'] ) || ! \wp_verify_nonce( $_POST['plugin_nonce'], 'plugin_action' ) ) {
    \wp_die( \esc_html__( 'Security check failed.', 'plugin-text-domain' ) );
}

// AJAX nonce.
\wp_localize_script( 'plugin-script', 'pluginAjax', [
    'ajaxurl' => \admin_url( 'admin-ajax.php' ),
    'nonce'   => \wp_create_nonce( 'plugin_ajax_nonce' ),
] );

// Verify AJAX nonce.
\check_ajax_referer( 'plugin_ajax_nonce', 'nonce' );
```

### 8.4 Capability Checks

Always verify user capabilities:

```php
// Check capability.
if ( ! \current_user_can( 'manage_options' ) ) {
    \wp_die( \esc_html__( 'Insufficient permissions.', 'plugin-text-domain' ) );
}

// Capability for post editing.
if ( ! \current_user_can( 'edit_post', $post_id ) ) {
    return;
}
```

---

## 9. Documentation Requirements

### 9.1 PHPDoc Requirements

All classes, methods, and properties must have PHPDoc:

```php
/**
 * Class description.
 *
 * Longer description if needed.
 *
 * @package SilverAssist\PluginName
 * @since 1.0.0
 */
class ClassName {
    /**
     * Property description.
     *
     * @var string
     */
    private string $property;

    /**
     * Method description.
     *
     * Longer description if needed.
     *
     * @param string $param Parameter description.
     * @return bool Return value description.
     * @since 1.0.0
     */
    public function method_name( string $param ): bool {
        // Implementation.
        return true;
    }
}
```

### 9.2 Internationalization (i18n)

**Pre-PR Requirement:** Always regenerate `.pot` before PRs:

```bash
wp i18n make-pot . languages/plugin-text-domain.pot --domain=plugin-text-domain
```

**Text Domain Rules:**

```php
// ✅ CORRECT: Literal text domain (extractable).
__( 'Error occurred', 'plugin-text-domain' );
\esc_html_e( 'Success!', 'plugin-text-domain' );

// ❌ WRONG: Variable/constant (NOT extractable).
__( 'Error', $text_domain );
__( 'Error', PLUGIN_TEXT_DOMAIN );
```

**Ordered Placeholders (MANDATORY for Multiple Args):**

```php
// ✅ CORRECT: Positional placeholders with translator comment.
sprintf(
    /* translators: %1$s: form name, %2$d: submission count */
    __( 'Form "%1$s" has %2$d submissions', 'plugin-text-domain' ),
    $form_name,
    $count
);

// ❌ WRONG: Unordered placeholders (PHPCS error).
sprintf( __( 'Form "%s" has %d submissions', 'plugin-text-domain' ), $form_name, $count );
```

---

## 10. Release Process

### 10.1 Version Numbering

Follow [Semantic Versioning](https://semver.org/):
- **Major** (1.0.0): Breaking changes
- **Minor** (1.1.0): New features, backward compatible
- **Patch** (1.0.1): Bug fixes

### 10.2 Release Checklist

1. **Update Version Numbers:**
   ```bash
   ./scripts/update-version-simple.sh 1.2.0 --no-confirm --force
   ```

2. **Verify Version Consistency:**
   ```bash
   ./scripts/check-versions.sh
   ```

3. **Update CHANGELOG.md:**
   ```markdown
   ## [1.2.0] - 2026-01-24

   ### Added
   - New feature description

   ### Changed
   - Changed feature description

   ### Fixed
   - Bug fix description
   ```

4. **Run Quality Checks:**
   ```bash
   ./scripts/run-quality-checks.sh all
   ```

5. **Update Translations:**
   ```bash
   wp i18n make-pot . languages/plugin-text-domain.pot --domain=plugin-text-domain
   ```

6. **Commit and Push:**
   ```bash
   git add -A
   git commit -m "chore: bump version to 1.2.0 for release"
   git push origin main
   ```

7. **Create Tag (Triggers Release):**
   ```bash
   git tag v1.2.0 -m "Release v1.2.0"
   git push origin v1.2.0
   ```

### 10.3 CRITICAL: Immutable Tags

GitHub enforces **immutability** on tags and releases. Once a tag is used (even if release fails), it **CANNOT be reused**.

```bash
# ❌ FORBIDDEN: causes "immutable release" errors.
gh release create v1.3.5 --title "..." --notes "..."

# ✅ CORRECT: Only create and push the tag.
git tag v1.3.6 -m "Release v1.3.6"
git push origin v1.3.6
```

**If a Release Fails:**
1. **DO NOT** try to delete and recreate the same tag
2. **DO NOT** manually create a release
3. **INCREMENT** the version (e.g., v1.3.5 → v1.3.6)
4. Start from Step 1 with the new version

---

## 11. VS Code AI Agent Customization

> **NEW in v2.0** - This section documents the 3-tier system for customizing AI coding agents (GitHub Copilot, Claude, etc.) in VS Code.

### 11.1 Overview

VS Code supports a hierarchical system for providing context to AI agents:

| Level | Location | Scope | Use Case |
|-------|----------|-------|----------|
| **Global Context** | `.github/copilot-instructions.md` | Always active | Project overview, architecture, critical rules |
| **File-Specific** | `.github/instructions/*.instructions.md` | Conditional via `applyTo` | Standards for file types (PHP, tests, JS) |
| **Task Skills** | `.github/skills/*/SKILL.md` | On-demand | Complex multi-step tasks |

### 11.2 Global Context (copilot-instructions.md)

**File:** `.github/copilot-instructions.md`

This file provides high-level context that's **always** included in AI conversations.

**Keep it concise** (~100-150 lines max). Move details to Instructions or Skills.

```markdown
# Plugin Name - Copilot Instructions

## Project Overview

WordPress plugin description. Follows **SilverAssist WordPress Plugin Development Standards**.

| Attribute | Value |
|-----------|-------|
| Namespace | `SilverAssist\PluginName\` |
| PHP | 8.2+ |
| WordPress | 6.5+ |
| Standards | PHPCS (WordPress-Extra), PHPStan Level 8, PHPUnit |

## Architecture

### LoadableInterface Priority System
All components implement `LoadableInterface` with `init()`, `get_priority()`, `should_load()`:
- **10**: Core (Plugin, Activator, critical services)
- **20**: Services (business logic, API clients)
- **30**: Admin & Controllers (settings pages, request handlers)
- **40**: Utils (helpers, loggers)

### Key Directories
- `includes/` - PSR-4 source code
- `includes/Service/` - Business logic
- `includes/View/` - HTML rendering (static classes)
- `includes/Controller/` - Request handlers
- `tests/` - WordPress Test Suite

## Critical Rules

### Pre-PR Checklist (MANDATORY)
```bash
vendor/bin/phpcbf              # Auto-fix formatting
vendor/bin/phpcs               # Must pass with 0 errors
vendor/bin/phpstan analyse     # Must pass Level 8
vendor/bin/phpunit             # Must pass all tests
wp i18n make-pot . languages/plugin-name.pot --domain=plugin-name  # Update translations
```

### WordPress Functions in Namespaced Code
```php
// ✅ Use backslash prefix for WP functions
\add_action('init', [$this, 'init']);
\get_option('option_name');
```

## Additional Resources

- **File-specific instructions**: `.github/instructions/*.instructions.md`
- **Specialized skills**: `.github/skills/*/SKILL.md`

## Quick References

| Task | Command/Location |
|------|------------------|
| Run all quality checks | `./scripts/run-quality-checks.sh` |
| Update versions | `./scripts/update-version-simple.sh X.Y.Z` |
| Verify version consistency | `./scripts/check-versions.sh` |
| Update translations | `wp i18n make-pot ...` |
| Text domain | `'plugin-text-domain'` (literal string always) |
```

### 11.3 File-Specific Instructions

**Location:** `.github/instructions/*.instructions.md`

Instructions use YAML frontmatter with `applyTo` glob patterns:

```markdown
---
description: PHP coding standards, WordPress conventions, and security best practices
name: PHP Standards
applyTo: "**/*.php"
---

# PHP Code Quality Standards

**Applies to**: `**/*.php`

## Quality Gates (MANDATORY Before Commit)

```bash
vendor/bin/phpcbf
vendor/bin/phpcs
vendor/bin/phpstan analyse includes/ --level=8
vendor/bin/phpunit
```

## WordPress Coding Standards

### Inline Comments MUST End with Punctuation
...

### String Quotation
...

## Security
...
```

**Recommended Instructions Files:**

| File | `applyTo` | Content |
|------|-----------|---------|
| `php.instructions.md` | `**/*.php` | PHPCS rules, security, architecture |
| `testing.instructions.md` | `tests/**/*.php` | Test patterns, WP factories, assertions |
| `github-workflow.instructions.md` | `.github/workflows/**` | CI/CD patterns |
| `documentation-language.instructions.md` | `**/*.md` | Language rules for docs |

### 11.4 Task Skills

**Location:** `.github/skills/skill-name/SKILL.md`

Skills are **specialized instructions** for complex, multi-step tasks. They're invoked on-demand by AI agents.

**Structure:**

```markdown
---
name: skill-name
description: Brief description of when to use this skill. Explains the task category and typical use cases.
---

# Skill Title

## When to Use
- Scenario 1
- Scenario 2
- Scenario 3

## Step-by-Step Process

### Step 1: Description
```bash
command example
```

### Step 2: Description
...

## Common Pitfalls
...

## Checklist
- [ ] Item 1
- [ ] Item 2
```

### 11.5 Recommended Skills for WordPress Plugins

| Skill | Description |
|-------|-------------|
| `release-management` | Version bumps, immutable tags, release workflow |
| `quality-checks` | PHPCS, PHPStan, PHPUnit troubleshooting |
| `create-component` | New services, controllers, views with LoadableInterface |
| `database-operations` | SQL, dbDelta, migrations, prepared statements |
| `i18n-translations` | Generate .pot files, translator comments |
| `github-cli` | Workflow monitoring, PR management (always use `\| cat`) |
| `pr-review-response` | Responding to PR review comments |

### 11.6 Skill Template

```markdown
---
name: skill-name
description: One-line description of the skill and when to use it. Be specific about the task category.
---

# Skill Name

## When to Use

- User asks to [specific task]
- Need to [specific action]
- When [specific condition]

## Prerequisites

- Required tools/access
- Required knowledge

## Process

### Step 1: Title

Description of what this step accomplishes.

```bash
# Command or code example
example_command --flag value
```

### Step 2: Title

...

## Common Issues

### Issue 1
**Symptom:** What the user sees
**Solution:** How to fix it

### Issue 2
...

## Checklist

- [ ] Step completed
- [ ] Verification done
- [ ] Edge cases handled
```

### 11.7 VS Code Settings

Enable Skills in VS Code settings:

```json
{
    "chat.agentSkills.enabled": true
}
```

### 11.8 Skills vs Instructions Decision Matrix

| Scenario | Use Instructions | Use Skills |
|----------|------------------|------------|
| Code style rules | ✅ | ❌ |
| Security patterns | ✅ | ❌ |
| Architecture conventions | ✅ | ❌ |
| Multi-step workflows | ❌ | ✅ |
| Release process | ❌ | ✅ |
| Troubleshooting guides | ❌ | ✅ |
| File-specific rules | ✅ | ❌ |
| Complex debugging | ❌ | ✅ |

---

## 📚 Additional Resources

- [WordPress Coding Standards](https://developer.wordpress.org/coding-standards/wordpress-coding-standards/)
- [WordPress Plugin Handbook](https://developer.wordpress.org/plugins/)
- [PHPStan Documentation](https://phpstan.org/user-guide/getting-started)
- [PHPUnit Documentation](https://phpunit.de/documentation.html)
- [WordPress Test Suite](https://make.wordpress.org/core/handbook/testing/automated-testing/phpunit/)
- [VS Code Agent Skills](https://code.visualstudio.com/docs/copilot/copilot-customization)

---

## 🔄 Keeping This Document Updated

This document should be updated whenever:
- New development tools are added
- Coding standards change
- Workflow processes are modified
- Testing strategies evolve
- New SilverAssist packages are created
- AI customization patterns are refined

---

**Maintained By:** Silver Assist  
**Repository:** https://github.com/SilverAssist
