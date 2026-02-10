# Contentful Inventory

📊 Generate a beautiful HTML report of your Contentful space's content model, including content types, fields, references, and enumerations.

![Contentful Inventory Report](https://img.shields.io/badge/Contentful-Content%20Model%20Inventory-blue?style=for-the-badge&logo=contentful)

## ✨ Features

- **Visual HTML Report** - Clean, modern UI to explore your content model
- **Content Types Overview** - See all content types with entry counts and field counts
- **Field Details** - Complete field information including types, validations, and attributes
- **Reference Mapping** - Understand relationships between content types
- **Enumeration Values** - View all allowed values for dropdown/select fields
- **Expandable Sections** - Interactive accordion-style content type details
- **No Server Required** - Static HTML file that works anywhere

## 📋 Prerequisites

- Node.js 18+ 
- A Contentful space with a Management API token

## 🚀 Installation

1. Clone this repository:
```bash
git clone https://github.com/sanruiz/contentful-inventory.git
cd contentful-inventory
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
CONTENTFUL_MANAGEMENT_TOKEN=your_management_token_here
CONTENTFUL_SPACE_ID=your_space_id_here
CONTENTFUL_ENVIRONMENT_ID=master  # Optional, defaults to 'master'
```

## 🔑 Getting Your Contentful Credentials

### Management Token
1. Go to your Contentful space
2. Navigate to **Settings** → **CMA tokens**
3. Click **Generate personal token**
4. Copy the token to your `.env` file

### Space ID
1. Go to your Contentful space
2. Navigate to **Settings** → **General settings**
3. Copy the **Space ID**

## 📖 Usage

Generate the inventory report:

```bash
npm run inventory
```

This will create an `out/inventory.html` file with your complete content model documentation.

Open the file in any browser to explore your content types:

```bash
open out/inventory.html  # macOS
# or
xdg-open out/inventory.html  # Linux
# or
start out/inventory.html  # Windows
```

## 📊 Report Contents

The generated report includes:

| Section | Description |
|---------|-------------|
| **Summary Stats** | Total content types, entries, and assets |
| **Content Types** | List of all content types with entry/field counts |
| **Fields Table** | Field name, ID, type, and attributes (required, localized) |
| **References** | Link fields showing allowed content types |
| **Enumerations** | Fields with predefined allowed values |

## 🛠️ Development

### Type Checking
```bash
npm run typecheck
```

### Project Structure
```
contentful-inventory/
├── src/
│   └── inventory.ts    # Main script
├── out/
│   └── inventory.html  # Generated report
├── .env                # Your credentials (not committed)
├── package.json
├── tsconfig.json
└── README.md
```

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

ISC License - feel free to use this in your own projects!

## 🙏 Acknowledgments

- Built with [Contentful Management API](https://www.contentful.com/developers/docs/references/content-management-api/)
- Uses [tsx](https://github.com/esbuild-kit/tsx) for TypeScript execution

---

Made with ❤️ for the Contentful community
