# Installation Guide

This guide walks you through setting up the Contentful to WordPress Migration Tool.

## Prerequisites

- **Node.js** (v16 or higher)
- **WordPress** installation with REST API enabled
- **Contentful** space with Management API access
- **Git** (for cloning the repository)

## Step 1: Clone and Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sanruiz/contentful-inventory.git
   cd contentful-inventory
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

## Step 2: Environment Configuration

1. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Configure your credentials** in `.env`:
   ```env
   # Contentful Configuration
   CONTENTFUL_MANAGEMENT_TOKEN=your_management_token_here
   CONTENTFUL_SPACE_ID=your_space_id_here
   CONTENTFUL_ENVIRONMENT_ID=master

   # WordPress Configuration
   WP_BASE_URL=https://your-site.local
   WP_USERNAME=your_wp_username
   WP_APPLICATION_PASSWORD=your_app_password

   # Optional Settings
   WP_POST_STATUS=draft
   WP_POST_TYPE=post
   WP_DEFAULT_AUTHOR=1
   TEST_MODE=false
   ```

### Getting Contentful Credentials

1. **Management Token:**
   - Go to Contentful → Settings → API keys
   - Create new Personal Access Token
   - Copy the token value

2. **Space ID:**
   - Found in Contentful → Settings → General Settings
   - Copy the Space ID

### Getting WordPress Credentials

1. **Application Password:**
   - Go to WordPress Admin → Users → Your Profile
   - Scroll to "Application Passwords"
   - Generate new password
   - Copy the generated password

## Step 3: WordPress Setup

### Enable REST API (if needed)

Most modern WordPress installations have the REST API enabled by default. To verify:

```bash
curl https://your-site.com/wp-json/wp/v2/posts
```

If this returns JSON data, you're good to go.

### Local Development Setup

For local WordPress development, we recommend:

1. **Local by Flywheel** (recommended)
   - Creates sites at `https://sitename.local`
   - SSL certificates included
   
2. **MAMP/XAMPP**
   - Usually at `http://localhost/sitename`
   - May need SSL setup for HTTPS

## Step 4: Test Connection

Test your configuration:

```bash
npm run test-connection
```

This will verify:
- WordPress API accessibility
- Authentication credentials
- Basic connectivity

## Step 5: Run Migration

### Full Migration Process

```bash
npm run migrate
```

This runs the complete migration workflow:
1. Environment check
2. WordPress connection test
3. Contentful content analysis
4. Table extraction
5. WordPress plugin installation
6. Content migration
7. Post content restoration

### Individual Steps

You can also run individual steps:

```bash
# Analyze Contentful content
npm run analyze

# Extract table data
npm run extract-tables

# Install WordPress plugin
npm run install-plugin

# Restore post content
npm run restore-content
```

## Troubleshooting

### Common Issues

1. **SSL Certificate Errors**
   - For local development, the tool ignores SSL errors
   - For production, ensure valid SSL certificates

2. **Authentication Failed**
   - Verify Application Password is correct
   - Check username matches WordPress user
   - Ensure user has proper permissions

3. **No Posts Found**
   - Posts might be in "draft" status
   - Check WordPress admin for imported content

4. **Plugin Not Working**
   - Verify plugin files are in correct location
   - Check WordPress error logs
   - Ensure JSON table files are present

### Debug Mode

For detailed debugging:

```bash
DEBUG=true npm run migrate
```

### Manual Plugin Installation

If automatic installation fails:

1. Copy `wordpress-plugin/` contents to `wp-content/plugins/contentful-tables/`
2. Copy `out/tables/*.json` files to `wp-content/contentful-tables/`
3. Activate plugin in WordPress admin

## Next Steps

After successful installation:

1. **Check WordPress Admin**
   - Go to Posts to see imported content
   - Posts will be in "draft" status

2. **Configure Plugin**
   - Go to Settings → Contentful Tables
   - Verify tables are loaded

3. **Test Frontend**
   - Publish a post
   - Check that tables render correctly

4. **Customize Styling**
   - Edit plugin CSS if needed
   - Add custom styles to theme
