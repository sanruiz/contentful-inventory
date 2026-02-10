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

// Sample content for the "What You Need to Know About Sundowning and Dementia" post
const originalContent = `
<p>Sundowning is a common phenomenon experienced by many individuals with dementia, characterized by increased confusion, agitation, and behavioral changes that typically occur in the late afternoon or evening. Understanding this condition is crucial for families and caregivers who want to provide the best possible care for their loved ones.</p>

<h2 id="understanding-sundowning">Understanding Sundowning</h2>
<p>Sundowning, also known as late-day confusion, affects up to 66% of people living with dementia. The exact cause remains unclear, but researchers believe it may be related to changes in the brain's internal clock, increased fatigue, or environmental factors.</p>

<h2 id="common-signs-symptoms">Common Signs and Symptoms</h2>
<p>The symptoms of sundowning can vary from person to person but typically include:</p>
<ul>
<li>Increased confusion and disorientation</li>
<li>Restlessness and pacing</li>
<li>Agitation or irritability</li>
<li>Mood swings</li>
<li>Difficulty sleeping</li>
<li>Paranoia or hallucinations</li>
</ul>

[contentful-table id="XBIbkCm53nytLcsPx3jlw"]

<h2 id="causes-triggers">Causes and Triggers</h2>
<p>Several factors may contribute to sundowning episodes:</p>

[contentful-table id="1nTH4E5o92iEc7kxuREFhC"]

<h2 id="management-strategies">Management Strategies</h2>
<p>While sundowning can be challenging, there are several strategies that can help manage symptoms:</p>

[contentful-table id="15GbfxM5TVSOko8p0dJuMp"]

<h2 id="when-to-seek-help">When to Seek Professional Help</h2>
<p>If sundowning symptoms become severe or interfere significantly with daily life, it's important to consult with healthcare professionals who specialize in dementia care. They can provide additional strategies and may recommend medications if necessary.</p>

<p>Remember, every person with dementia is unique, and what works for one individual may not work for another. Patience, understanding, and consistent routines are key to managing sundowning effectively.</p>
`;

async function restorePostContent() {
    try {
        console.log('🔄 Restoring original post content...');
        
        const updateData = {
            content: originalContent.trim()
        };
        
        const response = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/posts/203`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${WP_USERNAME}:${WP_APPLICATION_PASSWORD}`).toString('base64')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData),
            agent
        });

        if (response.ok) {
            const result = await response.json();
            console.log(`✅ Successfully restored content for post "${result.title.rendered}"`);
            console.log(`📄 Post URL: ${result.link}`);
            console.log(`📝 Content preview: ${result.content.rendered.substring(0, 200).replace(/\s+/g, ' ')}...`);
        } else {
            const errorText = await response.text();
            console.log(`❌ Failed to update post: ${response.status}`);
            console.log(`Error: ${errorText}`);
        }
        
    } catch (error) {
        console.error('❌ Error restoring post content:', error.message);
    }
}

restorePostContent();
