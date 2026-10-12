import { z } from "zod";
import type { Env, SessionUser } from "../env";
import type { Permission } from "../../shared/permissions";
import { all, first, run } from "../repositories/db";
import { uuid } from "../lib/crypto";
import { badRequest, conflict, notFound } from "../lib/errors";
import { audit } from "./audit";

const text = (max = 200) => z.string().trim().max(max).default("");
const required = (label: string, max = 200) => z.string().trim().min(1, `${label} is required.`).max(max);
const link = z.string().trim().max(1000).refine((v) => v === "" || /^(https?:\/\/|\/)/.test(v), "Links must start with https:// or /.").default("");
const int = (min = 0, max = 1_000_000_000) => z.number().int().min(min).max(max);
const flag = z.union([z.boolean(), z.number()]).transform((v) => (v ? 1 : 0));
const list = (max = 12, len = 160) => z.array(z.string().trim().min(1).max(len)).max(max).default([]);
const optionalId = z.string().trim().max(64).nullable().default(null).transform((v) => v || null);
const optionalDate = z.string().trim().nullable().default(null).refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Invalid date.").transform((v) => v || null);

interface Collection {
  table: string;
  key: "id" | "slug" | "path";
  perm: Permission;
  order: string;
  noun: string;
  fields: z.ZodRawShape;
  json?: string[];
  slug?: boolean;
  publicWhere?: string;
  inUse?: string;
}

export const COLLECTIONS: Record<string, Collection> = {
  rooms: {
    table: "rooms", key: "id", perm: "edit_packages", order: "sort, name", noun: "room", slug: true, json: ["features"], publicWhere: "active = 1",
    fields: { name: required("Name", 80), kind: text(80), description: text(600), image_url: link, capacity: int(1, 200), hourly_kobo: int(), features: list(8, 80), sort: int(), active: flag },
    inUse: "SELECT 1 FROM bookings WHERE room_id = ?1 UNION ALL SELECT 1 FROM packages WHERE room_id = ?1",
  },
  categories: {
    table: "categories", key: "slug", perm: "edit_packages", order: "sort, name", noun: "category",
    fields: { name: required("Name", 80), blurb: text(300), sort: int() },
    inUse: "SELECT 1 FROM services WHERE category = ?1 UNION ALL SELECT 1 FROM packages WHERE service_category = ?1",
  },
  services: {
    table: "services", key: "id", perm: "edit_packages", order: "sort, name", noun: "service", slug: true, json: ["deliverables", "gallery"], publicWhere: "active = 1",
    fields: {
      name: required("Name", 100), category: required("Category", 40), description: required("Summary", 400), details: text(2000), deliverables: list(8, 120),
      duration_label: text(80), price_label: text(60), image_url: link, gallery: list(12, 1000), sort: int(), active: flag,
    },
  },
  extras: {
    table: "extras", key: "id", perm: "edit_packages", order: "category, price_kobo", noun: "extra", slug: true, publicWhere: "active = 1",
    fields: { name: required("Name", 80), price_kobo: int(), category: text(40), active: flag },
  },
  portfolio: {
    table: "portfolio", key: "id", perm: "edit_content", order: "sort, created_at DESC", noun: "project", publicWhere: "published = 1",
    fields: {
      title: required("Title", 120), category: required("Category", 40), client: text(120), description: text(1000), image_url: link, embed_url: link, link_url: link,
      year: text(10), featured: flag, sort: int(), published: flag,
    },
  },
  team: {
    table: "team", key: "id", perm: "edit_content", order: "sort, name", noun: "team member", publicWhere: "published = 1",
    fields: { name: required("Name", 80), role: text(80), bio: text(600), image_url: link, sort: int(), published: flag },
  },
  equipment: {
    table: "equipment", key: "id", perm: "edit_content", order: "sort, category, name", noun: "equipment item",
    fields: { category: required("Category", 60), name: required("Name", 120), detail: text(300), room_id: optionalId, sort: int() },
  },
  gallery: {
    table: "gallery", key: "id", perm: "edit_content", order: "sort", noun: "photo",
    fields: { image_url: required("Image", 1000), caption: text(160), room_id: optionalId, sort: int() },
  },
  testimonials: {
    table: "testimonials", key: "id", perm: "edit_content", order: "sort", noun: "testimonial", publicWhere: "published = 1",
    fields: { quote: required("Quote", 600), name: required("Name", 80), role: text(80), featured: flag, sort: int(), published: flag },
  },
  faqs: {
    table: "faqs", key: "id", perm: "edit_content", order: "sort", noun: "FAQ", publicWhere: "published = 1",
    fields: { question: required("Question", 200), answer: required("Answer", 1500), sort: int(), published: flag },
  },
  announcements: {
    table: "announcements", key: "id", perm: "edit_content", order: "created_at DESC", noun: "announcement",
    publicWhere: "published = 1 AND (starts_on IS NULL OR starts_on <= ?1) AND (ends_on IS NULL OR ends_on >= ?1)",
    fields: { title: required("Title", 120), body: text(300), link_label: text(40), link_url: link, starts_on: optionalDate, ends_on: optionalDate, published: flag },
  },
  page_meta: {
    table: "page_meta", key: "path", perm: "edit_content", order: "path", noun: "page",
    fields: { title: text(120), description: text(300), image_url: link },
  },
};

export const collectionFor = (name: string) => {
  const c = COLLECTIONS[name];
  if (!c) throw notFound("Unknown collection.");
  return c;
};

const slugify = (v: string) => v.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";

function decode(c: Collection, row: Record<string, unknown>) {
  for (const k of c.json ?? []) row[k] = JSON.parse(String(row[k] ?? "[]"));
  return row;
}

async function uniqueSlug(db: D1Database, table: string, base: string) {
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await first(db, `SELECT 1 FROM ${table} WHERE slug = ?`, slug))) return slug;
  }
}

export const collectionsService = {
  async list(env: Env, name: string, onlyPublic = false, today = "") {
    const c = collectionFor(name);
    const where = onlyPublic && c.publicWhere ? `WHERE ${c.publicWhere}` : "";
    const rows = await all<Record<string, unknown>>(env.DB, `SELECT * FROM ${c.table} ${where} ORDER BY ${c.order}`, ...(where.includes("?1") ? [today] : []));
    return rows.map((r) => decode(c, r));
  },

  async save(env: Env, actor: SessionUser, name: string, key: string | null, input: unknown) {
    const c = collectionFor(name);
    const parsed = z.object(c.fields).safeParse(input);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input.");
    const data: Record<string, unknown> = { ...parsed.data };
    for (const k of c.json ?? []) data[k] = JSON.stringify(data[k]);
    const creating = !key;
    if (creating) {
      if (c.key === "path") throw badRequest("Choose an existing page.");
      const label = String(data.name ?? data.title ?? data.question ?? "item");
      key = c.key === "slug" ? await uniqueSlug(env.DB, c.table, slugify(label)) : uuid();
      if (c.slug) data.slug = await uniqueSlug(env.DB, c.table, slugify(label));
      if ("sort" in c.fields && !data.sort) data.sort = ((await first<{ n: number }>(env.DB, `SELECT COALESCE(MAX(sort), 0) + 1 n FROM ${c.table}`))?.n ?? 0);
    } else if (!(await first(env.DB, `SELECT 1 FROM ${c.table} WHERE ${c.key} = ?`, key))) {
      if (c.key !== "path") throw notFound();
    }
    const cols = Object.keys(data);
    const updates = cols.filter((k) => k !== "slug").map((k) => `${k} = excluded.${k}`).join(", ");
    await run(env.DB, `INSERT INTO ${c.table} (${c.key}, ${cols.join(", ")}) VALUES (?${", ?".repeat(cols.length)})
      ON CONFLICT(${c.key}) DO UPDATE SET ${updates}`, key, ...cols.map((k) => data[k]));
    await audit(env.DB, actor, `${creating ? "Added" : "Updated"} ${c.noun}`, String(data.name ?? data.title ?? data.question ?? data.caption ?? key));
    return key!;
  },

  async remove(env: Env, actor: SessionUser, name: string, key: string) {
    const c = collectionFor(name);
    if (c.key === "path") throw badRequest("Pages cannot be removed. Clear the fields instead.");
    if (c.inUse && (await first(env.DB, c.inUse, key))) throw conflict(`This ${c.noun} is in use. Hide it instead so past bookings keep their details.`);
    const r = await run(env.DB, `DELETE FROM ${c.table} WHERE ${c.key} = ?`, key).catch(() => null);
    if (!r) throw conflict(`This ${c.noun} is in use and cannot be removed.`);
    if (r.meta.changes === 0) throw notFound();
    await audit(env.DB, actor, `Removed ${c.noun}`, key);
  },
};
