import "dotenv/config";
import contentfulManagement from "contentful-management";
import fs from "node:fs/promises";
import path from "node:path";

type ContentTypeRow = {
  contentTypeId: string;
  contentTypeName: string;
  entries: number;
  fields: number;
};

type FieldRow = {
  contentTypeId: string;
  contentTypeName: string;
  fieldId: string;
  fieldName: string;
  type: string;
  required: boolean;
  localized: boolean;
  itemsType: string;
  linkType: string;
  validations: string;
};

type RefRow = {
  contentTypeId: string;
  contentTypeName: string;
  fieldId: string;
  fieldName: string;
  linkType: string; // Entry | Asset
  allowedContentTypes: string; // pipe-separated
  isArray: boolean;
};

type EnumRow = {
  contentTypeId: string;
  contentTypeName: string;
  fieldId: string;
  fieldName: string;
  values: string; // pipe-separated
};

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll(`"`, `""`)}"` : s;
}

function toCSV<T extends Record<string, unknown>>(rows: T[], headers: string[]) {
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape((r as any)[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN!;
const spaceId = process.env.CONTENTFUL_SPACE_ID!;
const envId = process.env.CONTENTFUL_ENVIRONMENT_ID || "master";

if (!token || !spaceId) {
  console.error("Falta CONTENTFUL_MANAGEMENT_TOKEN o CONTENTFUL_SPACE_ID en .env");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function generateHTMLReport(
  combined: {
    spaceId: string;
    environmentId: string;
    generatedAt: string;
    assetsTotal: number;
    summary: ContentTypeRow[];
    fields: FieldRow[];
  },
  referenceRows: RefRow[],
  enumRows: EnumRow[]
): string {
  const { spaceId, environmentId, generatedAt, assetsTotal, summary, fields } = combined;

  // HTML escape function to prevent XSS
  const escapeHtml = (text: string): string => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  };

  // Sanitize ID to ensure it's valid for HTML id attribute
  const sanitizeId = (id: string): string => {
    // Replace invalid characters with hyphens and ensure it starts with a letter
    const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, '-');
    // Ensure it starts with a letter
    return /^[a-zA-Z]/.test(sanitized) ? sanitized : `id-${sanitized}`;
  };

  // Group fields by content type
  const fieldsByContentType = fields.reduce((acc, field) => {
    if (!acc[field.contentTypeId]) {
      acc[field.contentTypeId] = [];
    }
    acc[field.contentTypeId].push(field);
    return acc;
  }, {} as Record<string, FieldRow[]>);

  // Group references by content type
  const refsByContentType = referenceRows.reduce((acc, ref) => {
    if (!acc[ref.contentTypeId]) {
      acc[ref.contentTypeId] = [];
    }
    acc[ref.contentTypeId].push(ref);
    return acc;
  }, {} as Record<string, RefRow[]>);

  // Group enums by content type
  const enumsByContentType = enumRows.reduce((acc, enumRow) => {
    if (!acc[enumRow.contentTypeId]) {
      acc[enumRow.contentTypeId] = [];
    }
    acc[enumRow.contentTypeId].push(enumRow);
    return acc;
  }, {} as Record<string, EnumRow[]>);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contentful Inventory Report</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f5f5f5;
      color: #171F22;
      line-height: 1.6;
    }

    .header {
      background: #666B64;
      color: #C1D1CF;
      padding: 2rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .header h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      color: #fff;
    }

    .header .meta {
      color: #C1D1CF;
      font-size: 0.95rem;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: white;
      padding: 1.5rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      border-left: 4px solid #748B91;
    }

    .stat-card h3 {
      color: #666B64;
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 0.5rem;
    }

    .stat-card .value {
      font-size: 2.5rem;
      font-weight: bold;
      color: #171F22;
    }

    .content-types {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: hidden;
    }

    .content-types h2 {
      background: #666B64;
      color: white;
      padding: 1.5rem;
      font-size: 1.5rem;
    }

    .content-type-item {
      border-bottom: 1px solid #e0e0e0;
    }

    .content-type-header {
      padding: 1.5rem;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: white;
      transition: background 0.2s;
    }

    .content-type-header:hover {
      background: #f8f8f8;
    }

    .content-type-header:focus {
      outline: 2px solid #748B91;
      outline-offset: -2px;
      background: #f8f8f8;
    }

    .content-type-header .left {
      flex: 1;
    }

    .content-type-header h3 {
      color: #171F22;
      font-size: 1.25rem;
      margin-bottom: 0.25rem;
    }

    .content-type-header .id {
      color: #748B91;
      font-size: 0.875rem;
      font-family: 'Courier New', monospace;
    }

    .content-type-header .stats {
      display: flex;
      gap: 2rem;
    }

    .content-type-header .stat {
      text-align: center;
    }

    .content-type-header .stat-label {
      color: #666B64;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .content-type-header .stat-value {
      color: #171F22;
      font-size: 1.5rem;
      font-weight: bold;
    }

    .content-type-details {
      display: none;
      background: #f9f9f9;
      padding: 1.5rem;
    }

    .content-type-item.expanded .content-type-details {
      display: block;
    }

    .content-type-item.expanded .content-type-header {
      background: #f9f9f9;
    }

    .fields-table {
      width: 100%;
      background: white;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 1rem;
    }

    .fields-table table {
      width: 100%;
      border-collapse: collapse;
    }

    .fields-table th {
      background: #666B64;
      color: white;
      padding: 0.75rem;
      text-align: left;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .fields-table td {
      padding: 0.75rem;
      border-bottom: 1px solid #e0e0e0;
      font-size: 0.875rem;
    }

    .fields-table tr:last-child td {
      border-bottom: none;
    }

    .fields-table tr:hover {
      background: #f5f5f5;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .badge.required {
      background: #C1D1CF;
      color: #171F22;
    }

    .badge.localized {
      background: #748B91;
      color: white;
    }

    .badge.array {
      background: #666B64;
      color: white;
    }

    .code {
      font-family: 'Courier New', monospace;
      background: #f5f5f5;
      padding: 0.125rem 0.375rem;
      border-radius: 3px;
      font-size: 0.875rem;
    }

    .section-title {
      color: #666B64;
      font-size: 1rem;
      margin: 1.5rem 0 0.75rem 0;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #C1D1CF;
    }

    .no-data {
      color: #748B91;
      font-style: italic;
      padding: 1rem;
      text-align: center;
    }

    .toggle-icon {
      font-size: 1.5rem;
      color: #748B91;
      transition: transform 0.3s;
    }

    .content-type-item.expanded .toggle-icon {
      transform: rotate(90deg);
    }

    @media (max-width: 768px) {
      .stats-grid {
        grid-template-columns: 1fr;
      }
      
      .content-type-header .stats {
        flex-direction: column;
        gap: 0.5rem;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="container">
      <h1>📦 Contentful Inventory Report</h1>
      <div class="meta">
        <strong>Space:</strong> ${escapeHtml(spaceId)} | 
        <strong>Environment:</strong> ${escapeHtml(environmentId)} | 
        <strong>Generated:</strong> ${escapeHtml(new Date(generatedAt).toLocaleString())}
      </div>
    </div>
  </div>

  <div class="container">
    <div class="stats-grid">
      <div class="stat-card">
        <h3>Content Types</h3>
        <div class="value">${summary.length}</div>
      </div>
      <div class="stat-card">
        <h3>Total Entries</h3>
        <div class="value">${summary.reduce((sum, ct) => sum + ct.entries, 0).toLocaleString()}</div>
      </div>
      <div class="stat-card">
        <h3>Total Assets</h3>
        <div class="value">${assetsTotal.toLocaleString()}</div>
      </div>
      <div class="stat-card">
        <h3>Total Fields</h3>
        <div class="value">${fields.length}</div>
      </div>
    </div>

    <div class="content-types">
      <h2>Content Types</h2>
      ${summary
        .map(
          (ct) => {
            const sanitizedId = sanitizeId(ct.contentTypeId);
            return `
        <div class="content-type-item" id="ct-${sanitizedId}">
          <div class="content-type-header" 
               data-ct-id="${sanitizedId}"
               role="button"
               tabindex="0"
               aria-expanded="false"
               aria-controls="ct-details-${sanitizedId}">
            <div class="left">
              <h3>${escapeHtml(ct.contentTypeName)}</h3>
              <div class="id">${escapeHtml(ct.contentTypeId)}</div>
            </div>
            <div class="stats">
              <div class="stat">
                <div class="stat-label">Entries</div>
                <div class="stat-value">${ct.entries.toLocaleString()}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Fields</div>
                <div class="stat-value">${ct.fields}</div>
              </div>
              <div class="toggle-icon">›</div>
            </div>
          </div>
          <div class="content-type-details" id="ct-details-${sanitizedId}">
            ${
              fieldsByContentType[ct.contentTypeId]?.length > 0
                ? `
            <div class="section-title">Fields</div>
            <div class="fields-table">
              <table>
                <thead>
                  <tr>
                    <th>Field Name</th>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Attributes</th>
                  </tr>
                </thead>
                <tbody>
                  ${fieldsByContentType[ct.contentTypeId]
                    .map(
                      (field) => `
                    <tr>
                      <td><strong>${escapeHtml(field.fieldName)}</strong></td>
                      <td><span class="code">${escapeHtml(field.fieldId)}</span></td>
                      <td>
                        <span class="code">${escapeHtml(field.type)}</span>
                        ${field.itemsType ? `<span class="code">&lt;${escapeHtml(field.itemsType)}&gt;</span>` : ""}
                        ${field.linkType ? `<span class="code">(${escapeHtml(field.linkType)})</span>` : ""}
                      </td>
                      <td>
                        ${field.required ? '<span class="badge required">Required</span>' : ""}
                        ${field.localized ? '<span class="badge localized">Localized</span>' : ""}
                      </td>
                    </tr>
                  `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
            `
                : '<div class="no-data">No fields defined</div>'
            }

            ${
              refsByContentType[ct.contentTypeId]?.length > 0
                ? `
            <div class="section-title">References</div>
            <div class="fields-table">
              <table>
                <thead>
                  <tr>
                    <th>Field Name</th>
                    <th>Link Type</th>
                    <th>Allowed Content Types</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  ${refsByContentType[ct.contentTypeId]
                    .map(
                      (ref) => `
                    <tr>
                      <td><strong>${escapeHtml(ref.fieldName)}</strong> <span class="code">${escapeHtml(ref.fieldId)}</span></td>
                      <td><span class="code">${escapeHtml(ref.linkType)}</span></td>
                      <td>${ref.allowedContentTypes ? escapeHtml(ref.allowedContentTypes) : '<em>Any</em>'}</td>
                      <td>${ref.isArray ? '<span class="badge array">Array</span>' : '<span class="badge">Single</span>'}</td>
                    </tr>
                  `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
            `
                : ""
            }

            ${
              enumsByContentType[ct.contentTypeId]?.length > 0
                ? `
            <div class="section-title">Enumerations</div>
            <div class="fields-table">
              <table>
                <thead>
                  <tr>
                    <th>Field Name</th>
                    <th>Allowed Values</th>
                  </tr>
                </thead>
                <tbody>
                  ${enumsByContentType[ct.contentTypeId]
                    .map(
                      (enumRow) => `
                    <tr>
                      <td><strong>${escapeHtml(enumRow.fieldName)}</strong> <span class="code">${escapeHtml(enumRow.fieldId)}</span></td>
                      <td>${enumRow.values.split("|").map((v) => `<span class="code">${escapeHtml(v.trim())}</span>`).join(" ")}</td>
                    </tr>
                  `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
            `
                : ""
            }
          </div>
        </div>
      `;
          }
        )
        .join("")}
    </div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', function() {
      // Toggle function for content type sections
      function toggleSection(header) {
        const ctId = header.getAttribute('data-ct-id');
        if (ctId) {
          const element = document.getElementById('ct-' + ctId);
          if (element) {
            const isExpanded = element.classList.contains('expanded');
            element.classList.toggle('expanded');
            header.setAttribute('aria-expanded', !isExpanded ? 'true' : 'false');
          }
        }
      }

      // Add click and keyboard event listeners
      document.querySelectorAll('.content-type-header').forEach(function(header) {
        // Click event
        header.addEventListener('click', function() {
          toggleSection(this);
        });
        
        // Keyboard event (Enter and Space)
        header.addEventListener('keydown', function(event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleSection(this);
          }
        });
      });
    });
  </script>
</body>
</html>`;
}

async function main() {
  const client = contentfulManagement.createClient({ accessToken: token });

  const space = await client.getSpace(spaceId);
  const env = await space.getEnvironment(envId);

  // 1) Content Types (modelo)
  const ctRes = await env.getContentTypes({ limit: 1000 });
  const contentTypes = ctRes.items;

  // 2) Conteo de assets (rápido: usando total)
  const assetsRes = await env.getAssets({ limit: 1 });
  const assetsTotal = assetsRes.total;

  const summaryRows: ContentTypeRow[] = [];
  const fieldRows: FieldRow[] = [];
  const referenceRows: RefRow[] = [];
  const enumRows: EnumRow[] = [];

  // 3) Para cada content type: contar entries (usando total)
  for (const ct of contentTypes) {
    const ctId = ct.sys.id;
    const ctName = ct.name;

    // fields detalle
    for (const f of ct.fields || []) {
      fieldRows.push({
        contentTypeId: ctId,
        contentTypeName: ctName,
        fieldId: f.id,
        fieldName: f.name,
        type: f.type,
        required: !!f.required,
        localized: !!f.localized,
        itemsType: (f as any).items?.type || "",
        linkType: (f as any).linkType || "",
        validations: (f.validations || []).map((v: any) => JSON.stringify(v)).join(" | ")
      });

      // enum validations ("in")
      const enumValidation = (f.validations || []).find((v: any) => Array.isArray(v?.in));
      if (enumValidation?.in?.length) {
        enumRows.push({
          contentTypeId: ctId,
          contentTypeName: ctName,
          fieldId: f.id,
          fieldName: f.name,
          values: enumValidation.in.join("|")
        });
      }

      // references: single Link fields
      if ((f as any).type === "Link" && (((f as any).linkType === "Entry") || ((f as any).linkType === "Asset"))) {
        const allowed = (f.validations || [])
          .flatMap((v: any) => (Array.isArray(v?.linkContentType) ? v.linkContentType : []))
          .join("|");

        referenceRows.push({
          contentTypeId: ctId,
          contentTypeName: ctName,
          fieldId: f.id,
          fieldName: f.name,
          linkType: (f as any).linkType,
          allowedContentTypes: allowed,
          isArray: false
        });
      }

      // references: array of Links
      if ((f as any).type === "Array" && (f as any).items?.type === "Link") {
        const lt = (f as any).items?.linkType;
        if (lt === "Entry" || lt === "Asset") {
          const allowed = (((f as any).items?.validations) || [])
            .flatMap((v: any) => (Array.isArray(v?.linkContentType) ? v.linkContentType : []))
            .join("|");

          referenceRows.push({
            contentTypeId: ctId,
            contentTypeName: ctName,
            fieldId: f.id,
            fieldName: f.name,
            linkType: lt,
            allowedContentTypes: allowed,
            isArray: true
          });
        }
      }
    }

    // entries conteo (no baja todo; solo pide 1 y usa "total")
    const entriesRes = await env.getEntries({ content_type: ctId, limit: 1 });
    summaryRows.push({
      contentTypeId: ctId,
      contentTypeName: ctName,
      entries: entriesRes.total,
      fields: (ct.fields || []).length
    });

    // pequeño throttle para evitar rate limit
    await sleep(150);
  }

  // ordenar por cantidad desc
  summaryRows.sort((a, b) => b.entries - a.entries);

  const outDir = path.join(process.cwd(), "out");
  await fs.mkdir(outDir, { recursive: true });

  const summaryCsv = toCSV(summaryRows, ["contentTypeId", "contentTypeName", "entries", "fields"]);
  const fieldsCsv = toCSV(fieldRows, [
    "contentTypeId",
    "contentTypeName",
    "fieldId",
    "fieldName",
    "type",
    "required",
    "localized",
    "itemsType",
    "linkType",
    "validations"
  ]);

  const referencesCsv = toCSV(referenceRows, [
    "contentTypeId",
    "contentTypeName",
    "fieldId",
    "fieldName",
    "linkType",
    "allowedContentTypes",
    "isArray"
  ]);

  const enumsCsv = toCSV(enumRows, [
    "contentTypeId",
    "contentTypeName",
    "fieldId",
    "fieldName",
    "values"
  ]);

  await fs.writeFile(path.join(outDir, "inventory_summary.csv"), summaryCsv, "utf8");
  await fs.writeFile(path.join(outDir, "inventory_fields.csv"), fieldsCsv, "utf8");
  await fs.writeFile(path.join(outDir, "inventory_references.csv"), referencesCsv, "utf8");
  await fs.writeFile(path.join(outDir, "inventory_enums.csv"), enumsCsv, "utf8");

  const combined = {
    spaceId,
    environmentId: envId,
    generatedAt: new Date().toISOString(),
    assetsTotal,
    summary: summaryRows,
    fields: fieldRows
  };
  await fs.writeFile(path.join(outDir, "inventory.json"), JSON.stringify(combined, null, 2), "utf8");

  // Generate HTML report
  const html = generateHTMLReport(combined, referenceRows, enumRows);
  await fs.writeFile(path.join(outDir, "inventory.html"), html, "utf8");

  console.log("Listo ✅");
  console.log("out/inventory_summary.csv");
  console.log("out/inventory_fields.csv");
  console.log("out/inventory_references.csv");
  console.log("out/inventory_enums.csv");
  console.log("out/inventory.json");
  console.log("out/inventory.html");
  console.log("Assets total:", assetsTotal);
}

main().catch((err) => {
  console.error("Error:", err?.message || err);
  process.exit(1);
});