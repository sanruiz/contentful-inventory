#!/usr/bin/env node

/**
 * Contentful Content Analysis Script
 * 
 * Analyzes Contentful content to identify tables and embedded components
 * for migration planning.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Run the existing analysis script
try {
    console.log('🔍 Analyzing Contentful content...');
    execSync(`node ${join(__dirname, '../contentful/analyze-components.js')}`, { stdio: 'inherit' });
    console.log('✅ Content analysis completed!');
} catch (error) {
    console.error('❌ Content analysis failed:', error.message);
    process.exit(1);
}
