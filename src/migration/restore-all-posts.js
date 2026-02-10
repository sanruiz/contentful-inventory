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

// Content templates for each blog post
const postContents = {
    203: {
        title: "What You Need to Know About Sundowning and Dementia",
        content: `
<p>Sundowning is a common phenomenon experienced by many individuals with dementia, characterized by increased confusion, agitation, and behavioral changes that typically occur in the late afternoon or evening. Understanding this condition is crucial for families and caregivers who want to provide the best possible care for their loved ones.</p>

[contentful-table id="XBIbkCm53nytLcsPx3jlw"]

<h2 id="understanding-sundowning">Understanding Sundowning</h2>
<p>Sundowning, also known as late-day confusion, affects up to 66% of people living with dementia. The exact cause remains unclear, but researchers believe it may be related to changes in the brain's internal clock, increased fatigue, or environmental factors.</p>

<h2 id="common-signs-symptoms">Common Signs and Symptoms</h2>
<p>The symptoms of sundowning can vary from person to person but typically include increased confusion and disorientation, restlessness and pacing, agitation or irritability, mood swings, difficulty sleeping, and paranoia or hallucinations.</p>

[contentful-table id="1nTH4E5o92iEc7kxuREFhG"]

<h2 id="causes-triggers">Causes and Triggers</h2>
<p>Several factors may contribute to sundowning episodes, including disrupted circadian rhythms, fatigue from daily activities, reduced lighting, overstimulation, and changes in routine.</p>

[contentful-table id="15GbfxM5TVSOko8p0dJuMp"]

<h2 id="management-strategies">Management Strategies</h2>
<p>While sundowning can be challenging, there are several strategies that can help manage symptoms: maintaining consistent daily routines, ensuring adequate lighting in the evening, reducing noise and stimulation, encouraging daytime activities, and creating a calm environment.</p>

<h2 id="when-to-seek-help">When to Seek Professional Help</h2>
<p>If sundowning symptoms become severe or interfere significantly with daily life, it's important to consult with healthcare professionals who specialize in dementia care. Remember, every person with dementia is unique, and patience and understanding are key.</p>
`
    },
    176: {
        title: "A Step-by-Step Guide to Hiring an In-Home Dementia Caregiver",
        content: `
<p>Hiring an in-home dementia caregiver is a significant decision that can greatly improve the quality of life for both the person with dementia and their family. This comprehensive guide will walk you through the essential steps to find, evaluate, and hire the right caregiver for your loved one.</p>

[contentful-table id="XBIbkCm53nytLcsPx3jlw"]

<h2 id="understanding-your-needs">Understanding Your Care Needs</h2>
<p>Before beginning your search, it's crucial to assess the specific care needs of your loved one. Consider their current abilities, challenges, and the type of assistance they require throughout the day.</p>

[contentful-table id="3JnIHQENe4ZtihjpWwphGI"]

<h2 id="finding-qualified-caregivers">Finding Qualified Caregivers</h2>
<p>There are several ways to find qualified dementia caregivers, including home care agencies, online platforms, referrals from healthcare providers, and local support groups.</p>

<h2 id="interview-process">The Interview Process</h2>
<p>Once you've identified potential caregivers, conduct thorough interviews to assess their experience, training, and compatibility with your loved one.</p>

<h2 id="background-checks">Background Checks and References</h2>
<p>Always verify credentials, check references, and conduct background checks to ensure the safety and security of your loved one.</p>

<h2 id="ongoing-communication">Ongoing Communication and Support</h2>
<p>Establish clear communication channels and provide ongoing support to ensure the caregiving relationship remains successful.</p>
`
    },
    211: {
        title: "Care Guide for Seniors with Parkinson's Disease",
        content: `
<p>Parkinson's disease is a progressive neurological disorder that affects movement and can significantly impact the daily life of seniors. This comprehensive care guide provides essential information for families and caregivers supporting a loved one with Parkinson's disease.</p>

[contentful-table id="408uTkJfTRYN5S7SCmIC5t"]

<h2 id="understanding-parkinsons">Understanding Parkinson's Disease</h2>
<p>Parkinson's disease occurs when nerve cells in the brain gradually break down or die. These cells produce dopamine, a chemical that helps control movement and coordination.</p>

<h2 id="symptoms-stages">Symptoms and Stages</h2>
<p>Parkinson's disease symptoms typically develop gradually and may vary significantly from person to person. Early signs often include tremor, stiffness, and slower movement.</p>

<h2 id="daily-care-strategies">Daily Care Strategies</h2>
<p>Effective daily care for someone with Parkinson's involves creating routines that support mobility, safety, and independence while adapting to changing needs.</p>

<h2 id="medication-management">Medication Management</h2>
<p>Proper medication management is crucial for controlling Parkinson's symptoms. Work closely with healthcare providers to ensure medications are taken correctly and on schedule.</p>

<h2 id="support-resources">Support and Resources</h2>
<p>Connecting with support groups, healthcare professionals, and community resources can provide valuable assistance for both patients and caregivers.</p>
`
    },
    207: {
        title: "A Guide To Sexual Health & STDs in Seniors",
        content: `
<p>Sexual health remains an important aspect of overall well-being throughout life, including in the senior years. This guide addresses the unique considerations and health concerns that seniors may face regarding sexual health and sexually transmitted diseases (STDs).</p>

[contentful-table id="XBIbkCm53nytLcsPx3jlw"]

<h2 id="sexual-health-aging">Sexual Health and Aging</h2>
<p>As people age, their sexual health needs and concerns may change. It's important to maintain open communication with healthcare providers about sexual health throughout the aging process.</p>

[contentful-table id="76yvmc500ttjBWyLx0L4UW"]

<h2 id="std-prevention">STD Prevention in Seniors</h2>
<p>Many seniors may not realize they are at risk for sexually transmitted diseases. Prevention strategies remain important regardless of age.</p>

[contentful-table id="RzPH5hP5jiiuYpRewswrI"]

<h2 id="common-concerns">Common Sexual Health Concerns</h2>
<p>Various physical and emotional factors can affect sexual health as people age, including medications, health conditions, and relationship changes.</p>

<h2 id="seeking-help">When to Seek Medical Help</h2>
<p>Regular healthcare check-ups should include discussions about sexual health. Don't hesitate to bring up concerns with your healthcare provider.</p>
`
    },
    200: {
        title: "Is There a Tax Deduction for Memory Care Facility Costs?",
        content: `
<p>Memory care facility costs can be substantial, making tax deductions an important consideration for families managing these expenses. Understanding which costs may be tax-deductible can help reduce the financial burden of memory care.</p>

[contentful-table id="XBIbkCm53nytLcsPx3jlw"]

<h2 id="understanding-tax-deductions">Understanding Medical Tax Deductions</h2>
<p>The IRS allows deductions for qualified medical expenses that exceed a certain percentage of your adjusted gross income. Memory care costs may qualify as medical expenses under certain conditions.</p>

<h2 id="qualifying-expenses">What Memory Care Costs Qualify</h2>
<p>Not all memory care facility costs are tax-deductible. Generally, expenses that are specifically for medical care may qualify, while room and board typically do not.</p>

<h2 id="documentation-requirements">Documentation and Requirements</h2>
<p>Proper documentation is essential for claiming memory care deductions. Keep detailed records of all expenses and obtain necessary certifications from medical professionals.</p>

<h2 id="consultation-advice">Professional Tax Consultation</h2>
<p>Given the complexity of tax laws and individual circumstances, it's advisable to consult with a qualified tax professional who can provide personalized guidance for your situation.</p>
`
    },
    197: {
        title: "Memory Care Guide for Muslim Seniors",
        content: `
<p>Finding culturally sensitive memory care for Muslim seniors requires understanding both the medical needs of dementia care and the important religious and cultural considerations that ensure dignity and comfort for patients and their families.</p>

[contentful-table id="XBIbkCm53nytLcsPx3jlw"]

<h2 id="cultural-considerations">Cultural and Religious Considerations</h2>
<p>Memory care for Muslim seniors should respect Islamic principles and cultural practices, including prayer times, dietary requirements, modesty concerns, and family involvement in care decisions.</p>

[contentful-table id="4RTmVroucvcAhiUNZXCLvZ"]

<h2 id="finding-appropriate-care">Finding Culturally Appropriate Care</h2>
<p>When searching for memory care facilities, look for providers who understand and accommodate Islamic practices, or who are willing to work with families to ensure cultural needs are met.</p>

<h2 id="communication-strategies">Communication and Family Involvement</h2>
<p>Islamic culture emphasizes strong family bonds and respect for elders. Memory care plans should incorporate family involvement and maintain cultural communication patterns.</p>

<h2 id="end-of-life-considerations">End-of-Life Care Planning</h2>
<p>Planning for end-of-life care should align with Islamic beliefs and practices, ensuring that religious requirements are understood and accommodated by care providers.</p>
`
    }
};

async function restorePostContent(postId, postData) {
    try {
        console.log(`\n🔄 Restoring content for post ${postId}: ${postData.title}`);
        
        const updateData = {
            content: postData.content.trim()
        };
        
        const response = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/posts/${postId}`, {
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
            console.log(`✅ Successfully restored content for: ${result.title.rendered}`);
        } else {
            const errorText = await response.text();
            console.log(`❌ Failed to update post ${postId}: ${response.status} - ${errorText}`);
        }
        
    } catch (error) {
        console.error(`❌ Error restoring post ${postId}:`, error.message);
    }
}

async function main() {
    console.log('🚀 Starting bulk post content restoration...');
    
    for (const [postId, postData] of Object.entries(postContents)) {
        await restorePostContent(postId, postData);
        // Add a small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n✅ Post content restoration completed!');
}

main();
