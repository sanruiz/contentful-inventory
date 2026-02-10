#!/usr/bin/env node

/**
 * Content Restoration Script
 * 
 * Restores original content to WordPress posts that were affected during migration
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function restoreContent() {
    try {
        console.log('🔄 Restoring post content...');
        
        // Run both restoration scripts
        console.log('   Restoring main posts...');
        execSync(`node ${join(__dirname, 'restore-all-posts.js')}`, { stdio: 'inherit' });
        
        console.log('   Restoring remaining posts...');
        execSync(`node ${join(__dirname, 'restore-remaining-posts.js')}`, { stdio: 'inherit' });
        
        console.log('✅ Content restoration completed!');
        
    } catch (error) {
        console.error('❌ Content restoration failed:', error.message);
        process.exit(1);
    }
}

restoreContent();
