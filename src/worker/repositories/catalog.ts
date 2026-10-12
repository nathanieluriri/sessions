import { all, first, run } from "./db";

export interface ServiceRow { id: string; slug: string; name: string; description: string; price_label: string; image_url: string; sort: number; active: number }
export interface PackageRow { id: string; slug: string; name: string; description: string; category: "session" | "post"; duration_min: number; price_kobo: number; includes: string; featured: number; active: number; sort: number }
export interface ExtraRow { id: string; slug: string; name: string; price_kobo: number; active: number }

export const catalogRepo = {
  services: (db: D1Database, includeInactive = false) => all<ServiceRow>(db, `SELECT * FROM services ${includeInactive ? "" : "WHERE active = 1"} ORDER BY sort`),
  serviceBySlug: (db: D1Database, slug: string) => first<ServiceRow>(db, "SELECT * FROM services WHERE slug = ? AND active = 1", slug),
  packages: (db: D1Database, includeInactive = false) => all<PackageRow>(db, `SELECT * FROM packages ${includeInactive ? "" : "WHERE active = 1"} ORDER BY sort`),
  packageById: (db: D1Database, id: string) => first<PackageRow>(db, "SELECT * FROM packages WHERE id = ?", id),
  extras: (db: D1Database) => all<ExtraRow>(db, "SELECT * FROM extras WHERE active = 1 ORDER BY price_kobo"),
  upsertPackage: (db: D1Database, p: Omit<PackageRow, "sort" | "includes" | "featured"> & { includes: string[]; featured: boolean }) =>
    run(db, `INSERT INTO packages (id, slug, name, description, category, duration_min, price_kobo, includes, featured, active, sort)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM packages))
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, category = excluded.category,
        duration_min = excluded.duration_min, price_kobo = excluded.price_kobo, includes = excluded.includes, featured = excluded.featured,
        active = excluded.active, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      p.id, p.slug, p.name, p.description, p.category, p.duration_min, p.price_kobo, JSON.stringify(p.includes), p.featured ? 1 : 0, p.active),
  deletePackage: (db: D1Database, id: string) => run(db, "DELETE FROM packages WHERE id = ? AND NOT EXISTS (SELECT 1 FROM bookings WHERE package_id = ?)", id, id),
  setServiceActive: (db: D1Database, id: string, active: boolean) => run(db, "UPDATE services SET active = ? WHERE id = ?", active ? 1 : 0, id),
  updateService: (db: D1Database, id: string, s: { name: string; description: string; price_label: string }) =>
    run(db, "UPDATE services SET name = ?, description = ?, price_label = ? WHERE id = ?", s.name, s.description, s.price_label, id),
};
