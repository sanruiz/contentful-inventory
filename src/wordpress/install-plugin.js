#!/usr/bin/env node

/**
 * WordPress Plugin Installation Script
 * 
 * Installs the Contentful Tables plugin to WordPress automatically
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WP_BASE_URL = process.env.WP_BASE_URL;

function getWordPressPath() {
    // Try to determine WordPress path based on URL
    if (WP_BASE_URL?.includes('.local')) {
        // Local by Flywheel pattern
        const siteName = WP_BASE_URL.replace('https://', '').replace('.local', '');
        return `/Users/${process.env.USER}/Local Sites/${siteName}/app/public`;
    } else if (WP_BASE_URL?.includes('localhost')) {
        // MAMP/XAMPP pattern
        return '/Applications/MAMP/htdocs';
    }
    
    return null;
}

async function installPlugin() {
    try {
        console.log('🔌 Installing WordPress plugin...');
        
        const wpPath = getWordPressPath();
        
        if (!wpPath || !fs.existsSync(wpPath)) {
            console.log('⚠️  Could not auto-detect WordPress path.');
            console.log('Please manually copy the plugin:');
            console.log(`   Source: ${path.join(__dirname, '../../wordpress-plugin/')}`);
            console.log('   Target: /path/to/wordpress/wp-content/plugins/contentful-tables/');
            return;
        }
        
        const pluginSource = path.join(__dirname, '../../wordpress-plugin/');
        const pluginTarget = path.join(wpPath, 'wp-content/plugins/contentful-tables/');
        
        // Create target directory
        if (!fs.existsSync(pluginTarget)) {
            fs.mkdirSync(pluginTarget, { recursive: true });
        }
        
        // Copy plugin files
        const files = fs.readdirSync(pluginSource);
        files.forEach(file => {
            const sourcePath = path.join(pluginSource, file);
            const targetPath = path.join(pluginTarget, file);
            
            if (fs.statSync(sourcePath).isFile()) {
                fs.copyFileSync(sourcePath, targetPath);
                console.log(`   ✅ Copied: ${file}`);
            }
        });
        
        // Copy table files to wp-content
        const tablesSource = path.join(__dirname, '../../out/tables/');
        const tablesTarget = path.join(wpPath, 'wp-content/contentful-tables/');
        
        if (fs.existsSync(tablesSource)) {
            if (!fs.existsSync(tablesTarget)) {
                fs.mkdirSync(tablesTarget, { recursive: true });
            }
            
            const tableFiles = fs.readdirSync(tablesSource);
            tableFiles.forEach(file => {
                if (file.endsWith('.json')) {
                    const sourcePath = path.join(tablesSource, file);
                    const targetPath = path.join(tablesTarget, file);
                    fs.copyFileSync(sourcePath, targetPath);
                }
            });
            
            console.log(`   ✅ Copied ${tableFiles.filter(f => f.endsWith('.json')).length} table files`);
        }
        
        console.log('\\n✅ Plugin installation completed!');
        console.log('\\nNext steps:');
        console.log('1. Go to WordPress Admin → Plugins');
        console.log('2. Activate "Contentful Tables" plugin');
        console.log('3. Check Settings → Contentful Tables for configuration');
        
    } catch (error) {
        console.error('❌ Plugin installation failed:', error.message);
        process.exit(1);
    }
}

installPlugin();
