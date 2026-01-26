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

  console.log("Listo ✅");
  console.log("out/inventory_summary.csv");
  console.log("out/inventory_fields.csv");
  console.log("out/inventory_references.csv");
  console.log("out/inventory_enums.csv");
  console.log("out/inventory.json");
  console.log("Assets total:", assetsTotal);
}

main().catch((err) => {
  console.error("Error:", err?.message || err);
  process.exit(1);
});