import fetch from 'node-fetch';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const WP_BASE_URL = process.env.WP_BASE_URL;
const WP_USERNAME = process.env.WP_USERNAME;
const WP_APPLICATION_PASSWORD = process.env.WP_APPLICATION_PASSWORD;

const agent = new https.Agent({
    rejectUnauthorized: false
});

async function checkAllPosts() {
    try {
        console.log('🔍 Checking posts with different parameters...');
        
        // Test different endpoints and parameters
        const endpoints = [
            '/wp-json/wp/v2/posts',
            '/wp-json/wp/v2/posts?status=draft',
            '/wp-json/wp/v2/posts?status=publish',
            '/wp-json/wp/v2/posts?status=any',
            '/wp-json/wp/v2/posts?per_page=100',
            '/wp-json/wp/v2/posts?context=edit'
        ];
        
        for (const endpoint of endpoints) {
            console.log(`\n📡 Testing: ${endpoint}`);
            
            const response = await fetch(`${WP_BASE_URL}${endpoint}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${Buffer.from(`${WP_USERNAME}:${WP_APPLICATION_PASSWORD}`).toString('base64')}`,
                    'Content-Type': 'application/json'
                },
                agent
            });

            if (response.ok) {
                const posts = await response.json();
                console.log(`✅ Status: ${response.status}, Posts found: ${posts.length}`);
                
                if (posts.length > 0) {
                    console.log('📄 Posts:');
                    posts.forEach(post => {
                        console.log(`  - ID: ${post.id}, Status: ${post.status}, Title: ${post.title.rendered}`);
                    });
                }
            } else {
                const errorText = await response.text();
                console.log(`❌ Status: ${response.status}, Error: ${errorText}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

async function testSpecificPost() {
    try {
        console.log('\n🎯 Testing specific post ID 203...');
        
        const response = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/posts/203`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${WP_USERNAME}:${WP_APPLICATION_PASSWORD}`).toString('base64')}`,
                'Content-Type': 'application/json'
            },
            agent
        });

        if (response.ok) {
            const post = await response.json();
            console.log(`✅ Post 203 found: ${post.title.rendered}`);
            console.log(`Status: ${post.status}`);
            console.log(`Content preview: ${post.content.rendered.substring(0, 100)}...`);
        } else {
            const errorText = await response.text();
            console.log(`❌ Post 203 not found: ${response.status} - ${errorText}`);
        }
        
    } catch (error) {
        console.error('❌ Error testing post 203:', error.message);
    }
}

async function main() {
    await checkAllPosts();
    await testSpecificPost();
}

main();
