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

async function getAllPosts() {
    try {
        console.log('🔍 Getting all posts...');
        
        const response = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/posts?per_page=50`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${WP_USERNAME}:${WP_APPLICATION_PASSWORD}`).toString('base64')}`,
                'Content-Type': 'application/json'
            },
            agent
        });

        if (!response.ok) {
            console.log(`❌ Failed to get posts: ${response.status}`);
            return;
        }

        const posts = await response.json();
        console.log(`📚 Found ${posts.length} posts:`);
        
        for (const post of posts) {
            console.log(`\n📄 Post ${post.id}: ${post.title.rendered}`);
            console.log(`📝 Content preview: ${post.content.rendered.substring(0, 150).replace(/\s+/g, ' ')}...`);
            
            // Check for shortcodes in rendered content
            if (post.content.rendered.includes('contentful-table')) {
                console.log(`✅ Contains table content`);
            }
            
            // Check if we can access raw content
            await checkPostRawContent(post.id);
        }
        
    } catch (error) {
        console.error('❌ Error getting posts:', error.message);
    }
}

async function checkPostRawContent(postId) {
    try {
        const response = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/posts/${postId}?context=edit`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${WP_USERNAME}:${WP_APPLICATION_PASSWORD}`).toString('base64')}`,
                'Content-Type': 'application/json'
            },
            agent
        });

        if (response.ok) {
            const post = await response.json();
            if (post.content.raw) {
                console.log(`📝 Raw content: ${post.content.raw.substring(0, 100).replace(/\s+/g, ' ')}...`);
                
                // Check for shortcodes in raw content
                const shortcodeMatches = post.content.raw.match(/\[contentful-table[^\]]*\]/g);
                if (shortcodeMatches) {
                    console.log(`🔧 Found shortcodes in raw: ${shortcodeMatches.join(', ')}`);
                }
            }
        }
    } catch (error) {
        // Ignore errors for individual posts
    }
}

getAllPosts().catch(console.error);
