#!/usr/bin/env node

/**
 * Test WordPress Connection
 * Quick script to test if WordPress is accessible and REST API is working
 */

const axios = require('axios');
const https = require('https');
require('dotenv').config();

// Create axios instance with SSL handling
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  }),
  timeout: 10000
});

const config = {
  wpBaseUrl: process.env.WP_BASE_URL || 'http://localhost:8080',
  username: process.env.WP_USERNAME || 'admin',
  applicationPassword: process.env.WP_APPLICATION_PASSWORD
};

async function testConnection() {
  console.log('🔧 WordPress Connection Test');
  console.log(`📍 URL: ${config.wpBaseUrl}`);
  console.log(`👤 Username: ${config.username}`);
  console.log('');

  // Test 1: Basic WordPress site accessibility
  console.log('🌐 Testing basic site accessibility...');
  try {
    const siteResponse = await axiosInstance.get(config.wpBaseUrl);
    console.log('✅ WordPress site is accessible');
  } catch (error) {
    console.error('❌ Cannot access WordPress site:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Suggestions:');
      console.log('  - Is WordPress running?');
      console.log('  - Check the URL in your browser');
      console.log('  - Try different ports (8080, 8888, 80)');
    }
    
    return false;
  }

  // Test 2: REST API accessibility
  console.log('🔌 Testing REST API accessibility...');
  try {
    const apiResponse = await axiosInstance.get(`${config.wpBaseUrl}/wp-json/wp/v2/`);
    console.log('✅ REST API is accessible');
  } catch (error) {
    console.error('❌ REST API not accessible:', error.message);
    console.log('💡 Suggestions:');
    console.log('  - REST API might be disabled');
    console.log('  - Check permalink settings in WordPress admin');
    console.log('  - Try: /wp-json/ in your browser');
    return false;
  }

  // Test 3: Authentication
  if (!config.applicationPassword) {
    console.log('⚠️  No application password set - skipping auth test');
    console.log('💡 Set WP_APPLICATION_PASSWORD in .env file');
    return true;
  }

  console.log('🔐 Testing authentication...');
  try {
    const auth = Buffer.from(`${config.username}:${config.applicationPassword}`).toString('base64');
    const authResponse = await axiosInstance.get(
      `${config.wpBaseUrl}/wp-json/wp/v2/users/me`,
      {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      }
    );
    
    console.log(`✅ Authenticated as: ${authResponse.data.name} (ID: ${authResponse.data.id})`);
    console.log(`📧 Email: ${authResponse.data.email || 'Not provided'}`);
    console.log(`🎭 Roles: ${Array.isArray(authResponse.data.roles) ? authResponse.data.roles.join(', ') : 'Not specified'}`);
    
  } catch (error) {
    console.error('❌ Authentication failed:', error.response?.data?.message || error.message);
    console.log('💡 Suggestions:');
    console.log('  - Check username and application password');
    console.log('  - Generate new application password in WP Admin');
    console.log('  - Ensure user has proper permissions');
    return false;
  }

  console.log('\n🎉 All tests passed! Ready to import content.');
  return true;
}

if (require.main === module) {
  testConnection().catch(console.error);
}

module.exports = { testConnection };
