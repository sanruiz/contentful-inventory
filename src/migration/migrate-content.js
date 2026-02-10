#!/usr/bin/env node

/**
 * Main Migration Script
 * 
 * This script orchestrates the complete migration process from Contentful to WordPress
 * including content analysis, table extraction, and WordPress integration.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, description) {
    log(`\n🚀 Step ${step}: ${description}`, 'cyan');
}

async function runScript(scriptPath, description) {
    try {
        log(`   Running: ${description}...`, 'yellow');
        execSync(`node ${scriptPath}`, { stdio: 'inherit', cwd: __dirname });
        log(`   ✅ Completed: ${description}`, 'green');
    } catch (error) {
        log(`   ❌ Failed: ${description}`, 'red');
        log(`   Error: ${error.message}`, 'red');
        throw error;
    }
}

async function checkEnvironment() {
    const required = [
        'CONTENTFUL_MANAGEMENT_TOKEN',
        'CONTENTFUL_SPACE_ID',
        'WP_BASE_URL',
        'WP_USERNAME',
        'WP_APPLICATION_PASSWORD'
    ];
    
    const missing = required.filter(var_ => !process.env[var_]);
    
    if (missing.length > 0) {
        log('❌ Missing required environment variables:', 'red');
        missing.forEach(var_ => log(`   - ${var_}`, 'red'));
        log('\nPlease check your .env file and try again.', 'yellow');
        process.exit(1);
    }
    
    log('✅ Environment variables configured', 'green');
}

async function main() {
    log('🎯 Contentful to WordPress Migration Tool v2.0', 'bright');
    log('=' .repeat(50), 'cyan');
    
    try {
        // Step 1: Check environment
        logStep(1, 'Environment Check');
        await checkEnvironment();
        
        // Step 2: Test WordPress connection
        logStep(2, 'Testing WordPress Connection');
        await runScript('../utils/test-connection.js', 'WordPress API connection test');
        
        // Step 3: Analyze Contentful content
        logStep(3, 'Analyzing Contentful Content');
        await runScript('../contentful/analyze-components.js', 'Content analysis and table identification');
        
        // Step 4: Extract tables
        logStep(4, 'Extracting Tables');
        await runScript('../contentful/table-processor.js', 'Table data extraction and processing');
        
        // Step 5: Install WordPress plugin
        logStep(5, 'Installing WordPress Plugin');
        await runScript('../wordpress/install-plugin.js', 'WordPress plugin installation');
        
        // Step 6: Migrate content
        logStep(6, 'Migrating Content');
        await runScript('./meta-storage.js', 'Content and table migration to WordPress');
        
        // Step 7: Restore post content
        logStep(7, 'Restoring Post Content');
        await runScript('./restore-all-posts.js', 'Post content restoration');
        
        log('\n🎉 Migration completed successfully!', 'green');
        log('\nNext steps:', 'cyan');
        log('1. Check WordPress admin for imported content', 'yellow');
        log('2. Review and publish draft posts', 'yellow');
        log('3. Test table rendering on frontend', 'yellow');
        log('4. Configure plugin settings if needed', 'yellow');
        
    } catch (error) {
        log('\n💥 Migration failed!', 'red');
        log('Check the error messages above for details.', 'yellow');
        process.exit(1);
    }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
    log('Contentful to WordPress Migration Tool', 'bright');
    log('\nUsage: npm run migrate [options]', 'cyan');
    log('\nOptions:', 'yellow');
    log('  --help, -h     Show this help message');
    log('  --dry-run      Run without making changes');
    log('\nEnvironment Variables Required:', 'yellow');
    log('  CONTENTFUL_MANAGEMENT_TOKEN');
    log('  CONTENTFUL_SPACE_ID'); 
    log('  CONTENTFUL_ENVIRONMENT_ID');
    log('  WP_BASE_URL');
    log('  WP_USERNAME');
    log('  WP_APPLICATION_PASSWORD');
    process.exit(0);
}

if (args.includes('--dry-run')) {
    log('🔍 Dry run mode - no changes will be made', 'yellow');
    process.env.DRY_RUN = 'true';
}

main();
