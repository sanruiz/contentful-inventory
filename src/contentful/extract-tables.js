#!/usr/bin/env node

/**
 * Contentful Table Extraction Script
 * 
 * This script extracts table components from Contentful and processes them
 * for WordPress integration.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Run the existing table processor
try {
    console.log('🔍 Extracting tables from Contentful...');
    execSync(`node ${join(__dirname, 'table-processor.js')}`, { stdio: 'inherit' });
    console.log('✅ Table extraction completed!');
} catch (error) {
    console.error('❌ Table extraction failed:', error.message);
    process.exit(1);
}
