import fetch from 'node-fetch';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const WP_BASE_URL = process.env.WP_BASE_URL;
const WP_USERNAME = process.env.WP_USERNAME;
const WP_APPLICATION_PASSWORD = process.env.WP_APPLICATION_PASSWORD;

// Create custom agent to ignore SSL certificate errors for local development
const agent = new https.Agent({
    rejectUnauthorized: false
});

async function checkAndFixPost(postId) {
    try {
        console.log(`\n🔍 Checking post ${postId}...`);
        
        // Get the post content
        const getResponse = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/posts/${postId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${WP_USERNAME}:${WP_APPLICATION_PASSWORD}`).toString('base64')}`,
                'Content-Type': 'application/json'
            },
            agent
        });

        if (!getResponse.ok) {
            console.log(`❌ Failed to get post ${postId}: ${getResponse.status}`);
            return;
        }

        const post = await getResponse.json();
        console.log(`📄 Post title: ${post.title.rendered}`);
        console.log(`📝 Current content preview: ${post.content.rendered.substring(0, 200)}...`);
        
        // Check if the content contains the raw shortcodes as text
        const content = post.content.rendered;
        const shortcodePattern = /\[contentful-table id="([^"]+)"\]/g;
        const shortcodes = content.match(shortcodePattern);
        
        if (shortcodes && shortcodes.length > 0) {
            console.log(`🔧 Found ${shortcodes.length} shortcodes in content:`, shortcodes);
            
            // The content should contain shortcodes, but they should be processed by WordPress
            // Let's check the raw content (post.content.raw if available)
            console.log(`📋 Raw content available: ${!!post.content.raw}`);
            
            if (post.content.raw) {
                console.log(`📝 Raw content preview: ${post.content.raw.substring(0, 200)}...`);
            }
        } else {
            console.log(`⚠️  No shortcodes found in rendered content`);
        }
        
    } catch (error) {
        console.error(`❌ Error checking post ${postId}:`, error.message);
    }
}

async function main() {
    console.log('🔍 Checking WordPress posts for shortcode issues...');
    
    // Check the problematic post (203 from the screenshot)
    await checkAndFixPost(203);
    
    // Also check some other posts that might have the same issue
    const postsToCheck = [202, 204, 205];
    
    for (const postId of postsToCheck) {
        await checkAndFixPost(postId);
    }
}

main().catch(console.error);
