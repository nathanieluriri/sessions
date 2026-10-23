import { all, first, run } from "./db";

export interface ServiceRow {
  id: string; slug: string; name: string; description: string; price_label: string; image_url: string; sort: number; active: number;
  category: string; details: string; deliverables: string; duration_label: string; gallery: string;
}
export interface PackageRow {
  id: string; slug: string; name: string; description: string; category: "session" | "post"; duration_min: number; price_kobo: number; includes: string;
  featured: number; active: number; sort: number; service_category: string; room_id: string | null; pricing: "fixed" | "quote";
  deposit_percent: number | null; requires_approval: number; price_note: string;
  service_slug: string; scheduling: "flex" | "slot" | "day" | "project"; slot_kind: "day" | "night"; unit: string; compare_at_kobo: number | null;
  turnaround_days: number | null; revision_limit: number; tracks: number | null;
}
export interface ExtraRow { id: string; slug: string; name: string; price_kobo: number; active: number; category: string; service_slug: string; pricing: "fixed" | "quote"; description: string }
export interface SessionSlotRow { id: string; kind: "day" | "night"; label: string; weekday: number | null; start_min: number; end_min: number; sort: number; active: number }
export interface RoomRow { id: string; slug: string; name: string; kind: string; description: string; image_url: string; capacity: number; hourly_kobo: number; features: string; sort: number; active: number }
export interface CategoryRow { slug: string; name: string; blurb: string; sort: number; bookable: number }

const active = (includeInactive: boolean) => (includeInactive ? "" : "WHERE active = 1");

export const catalogRepo = {
  services: (db: D1Database, includeInactive = false) => all<ServiceRow>(db, `SELECT * FROM services ${active(includeInactive)} ORDER BY sort, name`),
  serviceBySlug: (db: D1Database, slug: string) => first<ServiceRow>(db, "SELECT * FROM services WHERE slug = ? AND active = 1", slug),
  packages: (db: D1Database, includeInactive = false) => all<PackageRow>(db, `SELECT * FROM packages ${active(includeInactive)} ORDER BY sort, name`),
  packageById: (db: D1Database, id: string) => first<PackageRow>(db, "SELECT * FROM packages WHERE id = ?", id),
  extras: (db: D1Database, includeInactive = false) => all<ExtraRow>(db, `SELECT * FROM extras ${active(includeInactive)} ORDER BY category, price_kobo`),
  rooms: (db: D1Database, includeInactive = false) => all<RoomRow>(db, `SELECT * FROM rooms ${active(includeInactive)} ORDER BY sort, name`),
  roomById: (db: D1Database, id: string) => first<RoomRow>(db, "SELECT * FROM rooms WHERE id = ?", id),
  sessionSlots: (db: D1Database, includeInactive = false) => all<SessionSlotRow>(db, `SELECT * FROM session_slots ${active(includeInactive)} ORDER BY kind, sort, start_min`),
  categories: (db: D1Database) => all<CategoryRow>(db, "SELECT * FROM categories ORDER BY sort, name"),
  categoryBySlug: (db: D1Database, slug: string) => first<CategoryRow>(db, "SELECT * FROM categories WHERE slug = ?", slug),
  setBookable: (db: D1Database, slug: string, on: boolean) => run(db, "UPDATE categories SET bookable = ? WHERE slug = ?", on ? 1 : 0, slug),
  upsertPackage: (db: D1Database, p: Omit<PackageRow, "sort" | "includes" | "featured" | "active"> & { includes: string[]; featured: boolean; active: boolean }) =>
    run(db, `INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, service_category, room_id, pricing,
        deposit_percent, requires_approval, price_note, service_slug, scheduling, slot_kind, unit, compare_at_kobo, turnaround_days, revision_limit, tracks, sort)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM packages))
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, category = excluded.category,
        duration_min = excluded.duration_min, price_kobo = excluded.price_kobo, includes = excluded.includes, featured = excluded.featured,
        active = excluded.active, service_category = excluded.service_category, room_id = excluded.room_id, pricing = excluded.pricing,
        deposit_percent = excluded.deposit_percent, requires_approval = excluded.requires_approval, price_note = excluded.price_note,
        service_slug = excluded.service_slug, scheduling = excluded.scheduling, slot_kind = excluded.slot_kind, unit = excluded.unit,
        compare_at_kobo = excluded.compare_at_kobo, turnaround_days = excluded.turnaround_days, revision_limit = excluded.revision_limit, tracks = excluded.tracks,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      p.id, p.slug, p.name, p.description, p.category, p.duration_min, p.price_kobo, JSON.stringify(p.includes), p.featured ? 1 : 0, p.active ? 1 : 0,
      p.service_category, p.room_id, p.pricing, p.deposit_percent, p.requires_approval, p.price_note,
      p.service_slug, p.scheduling, p.slot_kind, p.unit, p.compare_at_kobo, p.turnaround_days, p.revision_limit, p.tracks),
  deletePackage: (db: D1Database, id: string) => run(db, "DELETE FROM packages WHERE id = ? AND NOT EXISTS (SELECT 1 FROM bookings WHERE package_id = ?)", id, id),
};
