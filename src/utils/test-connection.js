import fetch from 'node-fetch';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const WP_BASE_URL = process.env.WP_BASE_URL;
const WP_USERNAME = process.env.WP_USERNAME;
const WP_APPLICATION_PASSWORD = process.env.WP_APPLICATION_PASSWORD;

console.log('🔍 Testing WordPress connection...');
console.log(`URL: ${WP_BASE_URL}`);
console.log(`Username: ${WP_USERNAME}`);
console.log(`Password: ${WP_APPLICATION_PASSWORD ? 'Set ✅' : 'Not set ❌'}`);

// Create custom agent to ignore SSL certificate errors for local development
const agent = new https.Agent({
    rejectUnauthorized: false
});

async function testConnection() {
    try {
        console.log('\n🌐 Testing basic WordPress API...');
        
        // Test basic API endpoint
        const response = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/posts`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${WP_USERNAME}:${WP_APPLICATION_PASSWORD}`).toString('base64')}`,
                'Content-Type': 'application/json'
            },
            agent
        });

        console.log(`Status: ${response.status}`);
        console.log(`Status Text: ${response.statusText}`);
        
        if (response.ok) {
            const posts = await response.json();
            console.log(`✅ Connection successful! Found ${posts.length} posts`);
            
            if (posts.length > 0) {
                console.log('📄 Available posts:');
                posts.forEach(post => {
                    console.log(`  - ID: ${post.id}, Title: ${post.title.rendered}`);
                });
            }
        } else {
            const errorText = await response.text();
            console.log(`❌ Connection failed: ${response.status}`);
            console.log(`Error details: ${errorText}`);
        }
        
    } catch (error) {
        console.error('❌ Connection error:', error.message);
        console.log('\n🔧 Possible solutions:');
        console.log('1. Check if WordPress site is running (visit https://memorycare.local in browser)');
        console.log('2. Verify Application Password is correct');
        console.log('3. Check if .env file has correct credentials');
        console.log('4. Make sure Local by Flywheel site is started');
    }
}

async function testSiteAccess() {
    try {
        console.log('\n🌐 Testing site accessibility...');
        const response = await fetch(`${WP_BASE_URL}`, {
            method: 'GET',
            agent
        });
        
        console.log(`Site status: ${response.status}`);
        if (response.ok) {
            console.log('✅ WordPress site is accessible');
        } else {
            console.log('❌ WordPress site is not accessible');
        }
    } catch (error) {
        console.error('❌ Cannot reach WordPress site:', error.message);
    }
}

async function main() {
    await testSiteAccess();
    await testConnection();
}

main();
