#!/usr/bin/env node

/**
 * Extract Chart & Card Data from Contentful
 * 
 * Extracts data for dataVisualizationCharts and dataVisualizationCards
 * entries, resolving their data sources (dataSourceTable, dataSourceSpreadsheet)
 * and saving as JSON files for the WordPress plugin to render.
 * 
 * Usage: node src/migration/extract-charts.js
 */

import 'dotenv/config';
import pkg from 'contentful-management';
const { createClient } = pkg;
import fs from 'fs';
import path from 'path';

const client = createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

const spaceId = process.env.CONTENTFUL_SPACE_ID || '61iwodu7d9u0';
const envId = process.env.CONTENTFUL_ENVIRONMENT_ID || 'master';

async function main() {
  console.log('📊 Extract Charts & Cards Data from Contentful');
  console.log('='.repeat(60));

  const space = await client.getSpace(spaceId);
  const environment = await space.getEnvironment(envId);

  const chartsDir = path.join(process.cwd(), 'out', 'charts');
  const cardsDir = path.join(process.cwd(), 'out', 'cards');
  const wpChartsDir = '/Users/santiagoramirez/Local Sites/memorycarecom/app/public/wp-content/contentful-charts';
  const wpCardsDir = '/Users/santiagoramirez/Local Sites/memorycarecom/app/public/wp-content/contentful-cards';

  for (const dir of [chartsDir, cardsDir, wpChartsDir, wpCardsDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  // ─── Extract Charts ───────────────────────────────────────────────

  console.log('\n📈 Extracting charts...');
  const allCharts = [];
  let skip = 0;
  while (true) {
    const batch = await environment.getEntries({ content_type: 'dataVisualizationCharts', limit: 100, skip });
    allCharts.push(...batch.items);
    if (allCharts.length >= batch.total) break;
    skip += 100;
  }
  console.log(`   Found ${allCharts.length} charts`);

  let chartSuccess = 0;
  let chartFailed = 0;

  for (const chart of allCharts) {
    const id = chart.sys.id;
    const fields = chart.fields;
    const title = fields.title?.['en-US'] || '';
    const sourceRef = fields.source?.['en-US'];

    try {
      // Resolve data source
      let sourceData = null;
      if (sourceRef?.sys?.id) {
        const source = await environment.getEntry(sourceRef.sys.id);
        const sourceCt = source.sys.contentType.sys.id;

        if (sourceCt === 'dataSourceTable') {
          sourceData = {
            type: 'table',
            title: source.fields.title?.['en-US'] || '',
            dataTable: source.fields.dataTable?.['en-US'] || null,
            dataNotes: source.fields.dataNotes?.['en-US'] || null,
          };
        } else if (sourceCt === 'dataSourceSpreadsheet') {
          // Resolve the spreadsheet asset
          const assetRef = source.fields.source?.['en-US'];
          let assetUrl = '';
          if (assetRef?.sys?.id) {
            try {
              const asset = await environment.getAsset(assetRef.sys.id);
              assetUrl = asset.fields.file?.['en-US']?.url || '';
              if (assetUrl.startsWith('//')) assetUrl = `https:${assetUrl}`;
            } catch (e) {
              console.warn(`      ⚠️  Could not resolve asset: ${e.message}`);
            }
          }
          sourceData = {
            type: 'spreadsheet',
            title: source.fields.title?.['en-US'] || '',
            url: assetUrl,
          };
        }
      }

      const chartData = {
        id,
        title,
        visualizationType: fields.visualizationType?.['en-US'] || 'Bar Chart',
        layout: fields.layout?.['en-US'] || 'vertical',
        theme: fields.theme?.['en-US'] || 'Standard',
        groupMode: fields.groupMode?.['en-US'] || 'grouped',
        barPadding: fields.barPadding?.['en-US'] || 0.1,
        showLegend: fields.showLegend?.['en-US'] ?? true,
        legendLocation: fields.legendLocation?.['en-US'] || 'bottom',
        xAxisLabel: fields.xAxisLabel?.['en-US'] || '',
        yAxisLabel: fields.yAxisLabel?.['en-US'] || '',
        labelPrefix: fields.labelPrefix?.['en-US'] || '',
        filters: fields.filters?.['en-US'] || null,
        source: sourceData,
      };

      const jsonStr = JSON.stringify(chartData, null, 2);
      fs.writeFileSync(path.join(chartsDir, `${id}.json`), jsonStr);
      fs.writeFileSync(path.join(wpChartsDir, `${id}.json`), jsonStr);
      chartSuccess++;
    } catch (error) {
      console.warn(`   ⚠️  Chart ${id} (${title}): ${error.message}`);
      chartFailed++;
    }
  }

  console.log(`   ✅ Extracted: ${chartSuccess} | ❌ Failed: ${chartFailed}`);

  // ─── Extract Cards ────────────────────────────────────────────────

  console.log('\n🃏 Extracting cards...');
  const allCards = await environment.getEntries({ content_type: 'dataVisualizationCards', limit: 100 });
  console.log(`   Found ${allCards.items.length} cards`);

  let cardSuccess = 0;
  let cardFailed = 0;

  for (const card of allCards.items) {
    const id = card.sys.id;
    const fields = card.fields;
    const title = fields.title?.['en-US'] || '';
    const sourceRef = fields.source?.['en-US'];

    try {
      let sourceData = null;
      if (sourceRef?.sys?.id) {
        const source = await environment.getEntry(sourceRef.sys.id);
        const sourceCt = source.sys.contentType.sys.id;

        if (sourceCt === 'dataSourceTable') {
          sourceData = {
            type: 'table',
            title: source.fields.title?.['en-US'] || '',
            dataTable: source.fields.dataTable?.['en-US'] || null,
          };
        } else if (sourceCt === 'dataSourceSpreadsheet') {
          const assetRef = source.fields.source?.['en-US'];
          let assetUrl = '';
          if (assetRef?.sys?.id) {
            try {
              const asset = await environment.getAsset(assetRef.sys.id);
              assetUrl = asset.fields.file?.['en-US']?.url || '';
              if (assetUrl.startsWith('//')) assetUrl = `https:${assetUrl}`;
            } catch (e) {
              console.warn(`      ⚠️  Could not resolve asset: ${e.message}`);
            }
          }
          sourceData = {
            type: 'spreadsheet',
            title: source.fields.title?.['en-US'] || '',
            url: assetUrl,
          };
        }
      }

      const cardData = {
        id,
        title,
        type: fields.type?.['en-US'] || 'Summary',
        arrangement: fields.arrangement?.['en-US'] || 'Stacked',
        theme: fields.theme?.['en-US'] || 'Standard',
        filters: fields.filters?.['en-US'] || null,
        source: sourceData,
      };

      const jsonStr = JSON.stringify(cardData, null, 2);
      fs.writeFileSync(path.join(cardsDir, `${id}.json`), jsonStr);
      fs.writeFileSync(path.join(wpCardsDir, `${id}.json`), jsonStr);
      cardSuccess++;
    } catch (error) {
      console.warn(`   ⚠️  Card ${id} (${title}): ${error.message}`);
      cardFailed++;
    }
  }

  console.log(`   ✅ Extracted: ${cardSuccess} | ❌ Failed: ${cardFailed}`);

  // ─── Also re-extract all tables (some may be new for city pages) ──

  console.log('\n📋 Re-extracting tables (ensuring all are covered)...');
  const tablesDir = path.join(process.cwd(), 'out', 'tables');
  const wpTablesDir = '/Users/santiagoramirez/Local Sites/memorycarecom/app/public/wp-content/contentful-tables';
  if (!fs.existsSync(tablesDir)) fs.mkdirSync(tablesDir, { recursive: true });
  if (!fs.existsSync(wpTablesDir)) fs.mkdirSync(wpTablesDir, { recursive: true });

  const existingTables = fs.readdirSync(tablesDir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
  console.log(`   Currently have ${existingTables.length} table files`);

  const allTables = [];
  skip = 0;
  while (true) {
    const batch = await environment.getEntries({ content_type: 'dataVisualizationTables', limit: 100, skip });
    allTables.push(...batch.items);
    if (allTables.length >= batch.total) break;
    skip += 100;
  }
  console.log(`   Found ${allTables.length} table entries in Contentful`);

  let tableNew = 0;
  let tableExisting = 0;
  let tableFailed = 0;

  for (const table of allTables) {
    const id = table.sys.id;
    if (existingTables.includes(id)) {
      tableExisting++;
      continue;
    }

    const fields = table.fields;
    const title = fields.title?.['en-US'] || '';
    const sourceRef = fields.source?.['en-US'];

    try {
      let sourceData = null;
      if (sourceRef?.sys?.id) {
        const source = await environment.getEntry(sourceRef.sys.id);
        const sourceCt = source.sys.contentType.sys.id;

        if (sourceCt === 'dataSourceTable') {
          sourceData = {
            type: 'table',
            title: source.fields.title?.['en-US'] || '',
            dataTable: source.fields.dataTable?.['en-US'] || null,
            dataNotes: source.fields.dataNotes?.['en-US'] || null,
          };
        } else if (sourceCt === 'dataSourceSpreadsheet') {
          const assetRef = source.fields.source?.['en-US'];
          let assetUrl = '';
          if (assetRef?.sys?.id) {
            try {
              const asset = await environment.getAsset(assetRef.sys.id);
              assetUrl = asset.fields.file?.['en-US']?.url || '';
              if (assetUrl.startsWith('//')) assetUrl = `https:${assetUrl}`;
            } catch (e) { /* skip */ }
          }
          sourceData = {
            type: 'spreadsheet',
            title: source.fields.title?.['en-US'] || '',
            url: assetUrl,
          };
        }
      }

      const tableData = {
        id,
        title,
        type: fields.type?.['en-US'] || 'Plain',
        style: fields.style?.['en-US'] || 'Equal Width',
        theme: fields.theme?.['en-US'] || 'Standard',
        fullWidth: fields.fullWidth?.['en-US'] ?? true,
        filters: fields.filters?.['en-US'] || null,
        source: sourceData,
      };

      const jsonStr = JSON.stringify(tableData, null, 2);
      fs.writeFileSync(path.join(tablesDir, `${id}.json`), jsonStr);
      fs.writeFileSync(path.join(wpTablesDir, `${id}.json`), jsonStr);
      tableNew++;
    } catch (error) {
      console.warn(`   ⚠️  Table ${id} (${title}): ${error.message}`);
      tableFailed++;
    }
  }

  console.log(`   ✅ New: ${tableNew} | Already had: ${tableExisting} | ❌ Failed: ${tableFailed}`);
  console.log(`   Total table files now: ${tableNew + tableExisting}`);

  // ─── Summary ──────────────────────────────────────────────────────

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 EXTRACTION SUMMARY\n');
  console.log(`   Charts: ${chartSuccess} extracted → out/charts/ & wp-content/contentful-charts/`);
  console.log(`   Cards:  ${cardSuccess} extracted → out/cards/ & wp-content/contentful-cards/`);
  console.log(`   Tables: ${tableNew} new + ${tableExisting} existing = ${tableNew + tableExisting} total`);
  console.log('\n✨ Extraction complete!');
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
