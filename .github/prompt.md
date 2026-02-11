I'm migrating content from Contentful to WordPress. I need to continue implementing key-based table row filtering for tables that are embedded multiple times in the same page (e.g., Birmingham AL has the same table 6OGCWSrHDT4MJviE31iLsa embedded 8 times, once per section like "Food Assistance Programs", "Area Agency on Aging", etc.).

The CSV data has 5 columns: program-name, url, phone-number, description, key. The key column has values like agency, food, equipment, repair, legal, security, utility, veterans. The Contentful filters.selectedColumns picks display columns (0,2,3) and filters.selectedKey identifies the key column (index 4).

What I've already done (changes are in the codebase):

re-extract-tables.js — Updated applyFilters() to keep the key column in rawData (not filter it out). It now returns { displayData, keyColumn, keyColumnIndex, keyValues }. The table JSON now includes keyColumn, keyColumnIndex, and keyValues fields. BUT I haven't re-run this script yet — need to run node src/migration/re-extract-tables.js to regenerate all 423+ table JSON files.

rich-text-to-html.js — Updated to pass sibling context (siblings, index) through renderNode() → renderEmbeddedEntryBlock(). Added detectTableKey() which walks backwards from the table embed to find the preceding heading, slugifies it, and outputs [contentful_table id="..." key="heading-slug"]. However, I now suspect the key might actually be stored directly on the embedded entry reference in the Contentful rich text node.data (not derived from headings). Please check node.data on the embedded-entry-block nodes in the Birmingham page body to see if there's a key property.

contentful-tables.php — Updated render_table_shortcode() to accept key attribute, added filter_rows_by_key() and resolve_key_from_heading() methods that match heading slugs against known key values (e.g., "area-agency-on-aging" matches key "agency" because "agency" appears as a word in it). Updated render_data_table() to accept $key_filter parameter, filter rows by key column, then remove the key column from display.

What still needs to be done:

Investigate: Check if the key is stored in node.data on the embedded-entry-block nodes (run trace-table-in-page.js and inspect the full node.data object). If yes, update the converter to use that instead of heading-based detection.
Run re-extraction: node src/migration/re-extract-tables.js to regenerate all table JSONs with key column preserved.
Copy table files to WordPress: Copy from tables to WordPress wp-content/contentful-tables/.
Deploy plugin: Copy updated contentful-tables.php to WordPress.
Re-import cities: Run node src/migration/import-cities.js to re-import all 820 cities with the updated rich-text converter that includes key attributes on table shortcodes.
Test: Check Birmingham AL page to verify tables show filtered rows per section.
Import remaining pages: County (17), Resource (20), Article (9), Terms/About/Contact/Home (~8).
Important notes:

WordPress: https://memorycare.local, auth in .env (must unset WP_APPLICATION_PASSWORD before running scripts in existing terminal sessions)
WordPress path: /Users/santiagoramirez/Local Sites/memorycarecom/app/public
Contentful: space 61iwodu7d9u0, env master, Management API
Terminal output is often unreliable — prefer writing scripts to files and using tee or file redirection
