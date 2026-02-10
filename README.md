# Contentful to WordPress Migration Tool

A comprehensive tool for migrating content from Contentful to WordPress, with specialized support for embedded tables, components, and headless WordPress setups.

## 🚀 Features

- **Content Migration**: Migrate posts, pages, and custom content from Contentful to WordPress
- **Table Integration**: Extract and render Contentful tables as WordPress shortcodes
- **Headless WordPress Support**: Built for headless WordPress installations
- **Plugin System**: Complete WordPress plugin for table rendering
- **Multiple Storage Options**: Support for file-based, database, and meta field storage
- **Automated Processing**: Batch processing and automated content updates

## 📁 Project Structure

```
contentful-inventory/
├── src/
│   ├── contentful/          # Contentful API integrations
│   ├── wordpress/           # WordPress API integrations  
│   ├── migration/           # Migration scripts and tools
│   └── utils/               # Shared utilities and helpers
├── wordpress-plugin/        # WordPress plugin for table rendering
├── docs/                    # Documentation and guides
├── examples/               # Example configurations and usage
├── out/                    # Generated exports and outputs
└── temp/                   # Temporary files (development only)
```

## 🛠️ Setup

### Prerequisites

- Node.js (v16 or higher)
- WordPress installation with REST API enabled
- Contentful space with Management API access

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/sanruiz/contentful-inventory.git
   cd contentful-inventory
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your credentials:
   ```env
   # Contentful Configuration
   CONTENTFUL_MANAGEMENT_TOKEN=your_token
   CONTENTFUL_SPACE_ID=your_space_id
   CONTENTFUL_ENVIRONMENT_ID=master

   # WordPress Configuration
   WP_BASE_URL=https://your-site.local
   WP_USERNAME=your_username
   WP_APPLICATION_PASSWORD=your_app_password
   ```

## 📖 Usage

### Quick Start

1. **Analyze Contentful content**
   ```bash
   npm run analyze
   ```

2. **Extract tables from Contentful**
   ```bash
   npm run extract-tables
   ```

3. **Install WordPress plugin**
   ```bash
   npm run install-plugin
   ```

4. **Migrate content**
   ```bash
   npm run migrate
   ```

### Available Scripts

- `npm run analyze` - Analyze Contentful content and identify tables
- `npm run extract-tables` - Extract table components from Contentful
- `npm run migrate` - Run full migration process
- `npm run install-plugin` - Install WordPress plugin
- `npm run test-connection` - Test WordPress API connection

## 🔧 Configuration

### WordPress Plugin Setup

The included WordPress plugin provides shortcode functionality for rendering Contentful tables:

1. Copy plugin to WordPress:
   ```bash
   cp -r wordpress-plugin/* /path/to/wp-content/plugins/contentful-tables/
   ```

2. Activate plugin in WordPress admin

3. Configure table sources in Settings → Contentful Tables

### Migration Options

The tool supports multiple migration strategies:

- **File-based storage**: Tables stored as JSON files in `wp-content/`
- **Database storage**: Tables stored in custom WordPress database table
- **Meta field storage**: Tables stored as post meta fields

## 📚 Documentation

- [Installation Guide](docs/installation.md)
- [Plugin Documentation](docs/plugin.md)
- [Migration Guide](docs/migration.md)
- [API Reference](docs/api.md)
- [Troubleshooting](docs/troubleshooting.md)

## 🎯 Examples

See the `examples/` directory for:
- Sample configurations
- Custom migration scripts
- Integration examples

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- Create an [issue](https://github.com/sanruiz/contentful-inventory/issues) for bug reports
- Check [documentation](docs/) for detailed guides
- Review [examples](examples/) for usage patterns
