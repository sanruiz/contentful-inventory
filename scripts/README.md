# Local WordPress Setup Guide

## 🚀 Quick Setup

### 1. Set up Local WordPress
Choose one option:

**Option A: Local by Flywheel (Recommended)**
```bash
# Download from: https://localwp.com/
# Create new site: "memorycare"
# URL will be: https://memorycare.local
```

**Option B: MAMP/XAMPP**
```bash
# Download from: https://www.mamp.info/
# Create folder: /Applications/MAMP/htdocs/memorycare
# Extract WordPress files there
# URL will be: http://localhost:8888/memorycare
```

**Option C: Docker/wp-cli**
```bash
# Install wp-cli: https://wp-cli.org/
docker run -d -p 8080:80 -e WORDPRESS_DB_HOST=db -e WORDPRESS_DB_NAME=wordpress wordpress:latest
```

### 2. Configure Environment
```bash
cd scripts
cp .env.example .env
# Edit .env with your local settings
```

### 3. Set Up Application Password
1. Go to WordPress Admin → Users → Your Profile
2. Scroll to "Application Passwords" section  
3. Enter name: "Contentful Import"
4. Click "Add New Application Password"
5. Copy the password to your `.env` file

### 4. Test Import (Single Page)
```bash
npm run import:test
```

### 5. Full Import (All Pages)
```bash
npm run import
```

## 📁 Example .env Configuration

```bash
# Local WordPress (adjust URL based on your setup)
WP_BASE_URL=https://memorycare.local
WP_USERNAME=admin
WP_APPLICATION_PASSWORD=abcd 1234 5678 9012 efgh ijkl

# Import Settings
WP_POST_STATUS=draft
WP_POST_TYPE=page
WP_DEFAULT_AUTHOR=1

# Test Mode (import only one page)
TEST_MODE=true
TEST_PAGE_SLUG=about-us
```

## 🔍 Troubleshooting

### WordPress Connection Issues
- ✅ Check WordPress is running at the correct URL
- ✅ Verify REST API is enabled: `/wp-json/wp/v2/`
- ✅ Test application password manually
- ✅ Check CORS settings if running on different ports

### Import Issues
- ✅ Start with test mode first: `npm run import:test`
- ✅ Check WordPress error logs
- ✅ Verify user permissions for creating pages
- ✅ Test with smaller content first

### Common Local URLs
```
Local by Flywheel: https://sitename.local
MAMP:             http://localhost:8888/sitename  
XAMPP:            http://localhost/sitename
Docker:           http://localhost:8080
```

## 🎯 Next Steps After Import

1. **Review Pages**: Check imported pages in WP Admin
2. **Publish**: Change status from 'draft' to 'publish'
3. **Menus**: Set up navigation menus
4. **SEO**: Configure meta tags and descriptions  
5. **Styling**: Apply theme styles and customizations
6. **Testing**: Test all links and functionality

## 🔗 Useful Commands

```bash
# Test import (one page only)
npm run import:test

# Full import (all corporate pages)  
npm run import

# Generate CSV for manual import
npm run convert:csv

# Check WordPress connection
curl -u "username:app-password" http://localhost:8080/wp-json/wp/v2/users/me
```
