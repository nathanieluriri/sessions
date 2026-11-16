import { all } from "../../repositories/db";
import { contentRepo } from "../../repositories/settings";
import { catalogRepo } from "../../repositories/catalog";
import { contentService } from "../admin";
import type { Env, SessionUser } from "../../env";

export type CopyKind = "content" | "service" | "package" | "extra" | "faq" | "policy" | "page";

export interface CopyHit {
  kind: CopyKind;
  id: string;
  field: string;
  where: string;
  label: string;
  value: string;
}

const HIDDEN = new Set(["analytics_cf", "analytics_ga", "gsc_verification", "seo_indexing", "service_card_art"]);

export const COPY_LABELS: Record<string, string> = {
  hero_badge: "Home badge", hero_title: "Home headline", hero_accent: "Home second line", hero_subtitle: "Home intro", hero_image: "Home photo",
  about_title: "About headline", about_intro: "About background", about_vision: "Vision", about_mission: "Mission", about_philosophy: "Creative philosophy", about_points: "Why work with us", about_image: "About photo",
  studio_title: "Studio headline", studio_intro: "Studio intro", tour_url: "Virtual tour link",
  services_intro: "Services page intro", pricing_intro: "Pricing page intro",
  business_name: "Business name", legal_name: "Legal name", footer_blurb: "Footer description", contact_phone: "Phone number", contact_email: "Studio email",
  whatsapp: "WhatsApp number", studio_address: "Address", map_query: "Map location", hours_note: "Opening hours note",
  social_instagram: "Instagram", social_tiktok: "TikTok", social_youtube: "YouTube", social_x: "X",
  seo_title: "Site title", seo_description: "Site description", seo_image: "Share image",
};

const ALIAS: Record<string, string> = {
  email: "contact_email", "studio email": "contact_email", "contact email": "contact_email", mail: "contact_email",
  phone: "contact_phone", "phone number": "contact_phone", telephone: "contact_phone",
  whatsapp: "whatsapp", address: "studio_address", "studio address": "studio_address",
  "business name": "business_name", "site title": "seo_title", headline: "hero_title", "home headline": "hero_title",
};

export function aliasKey(raw: string): string | undefined {
  const q = raw.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (COPY_LABELS[raw.trim()]) return raw.trim();
  if (COPY_LABELS[q.replace(/ /g, "_")]) return q.replace(/ /g, "_");
  return ALIAS[q];
}

export async function listCopy(env: Env): Promise<CopyHit[]> {
  const [bag, policies, pages, services, packages, extras, faqs] = await Promise.all([
    contentRepo.content(env.DB),
    contentRepo.policies(env.DB),
    contentRepo.pageMeta(env.DB),
    catalogRepo.services(env.DB, true),
    catalogRepo.packages(env.DB, true),
    catalogRepo.extras(env.DB, true),
    all<{ id: string; question: string; answer: string }>(env.DB, "SELECT id, question, answer FROM faqs"),
  ]);
  const out: CopyHit[] = [];
  for (const [key, value] of Object.entries(bag)) {
    if (HIDDEN.has(key) || typeof value !== "string") continue;
    out.push({ kind: "content", id: key, field: "value", where: "Website", label: COPY_LABELS[key] ?? key.replaceAll("_", " "), value });
  }
  for (const p of policies) {
    out.push({ kind: "policy", id: p.slug, field: "title", where: "Policy", label: `${p.title} title`, value: p.title });
    out.push({ kind: "policy", id: p.slug, field: "body", where: "Policy", label: p.title, value: p.body });
  }
  for (const p of pages) {
    out.push({ kind: "page", id: p.path, field: "title", where: "Page", label: `${p.path} title`, value: p.title ?? "" });
    out.push({ kind: "page", id: p.path, field: "description", where: "Page", label: `${p.path} description`, value: p.description ?? "" });
  }
  for (const s of services) {
    out.push({ kind: "service", id: s.id, field: "name", where: "Service", label: "Name", value: s.name });
    out.push({ kind: "service", id: s.id, field: "description", where: "Service", label: s.name, value: s.description ?? "" });
    out.push({ kind: "service", id: s.id, field: "details", where: "Service", label: `${s.name} details`, value: s.details ?? "" });
    out.push({ kind: "service", id: s.id, field: "price_label", where: "Service", label: `${s.name} price label`, value: s.price_label ?? "" });
  }
  for (const p of packages) out.push({ kind: "package", id: p.id, field: "description", where: "Package", label: p.name, value: p.description ?? "" });
  for (const e of extras) {
    out.push({ kind: "extra", id: e.id, field: "name", where: "Add-on", label: "Name", value: e.name });
    out.push({ kind: "extra", id: e.id, field: "description", where: "Add-on", label: e.name, value: e.description ?? "" });
  }
  for (const f of faqs) {
    out.push({ kind: "faq", id: f.id, field: "question", where: "FAQ", label: "Question", value: f.question });
    out.push({ kind: "faq", id: f.id, field: "answer", where: "FAQ", label: f.question, value: f.answer });
  }
  return out;
}

export async function searchCopy(env: Env, query: string): Promise<CopyHit[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const keyed = aliasKey(query);
  const allHits = await listCopy(env);
  const ranked = allHits.filter((h) =>
    (keyed && h.kind === "content" && h.id === keyed)
    || `${h.where} ${h.label} ${h.value} ${h.id}`.toLowerCase().includes(needle),
  );
  ranked.sort((a, b) => Number(!!(keyed && b.id === keyed)) - Number(!!(keyed && a.id === keyed)));
  return ranked.slice(0, 12);
}

export async function getCopy(env: Env, kind: CopyKind, id: string, field: string): Promise<CopyHit | null> {
  const hits = await listCopy(env);
  return hits.find((h) => h.kind === kind && h.id === id && h.field === field)
    ?? hits.find((h) => h.kind === kind && h.id === id)
    ?? null;
}

export async function applyCopy(env: Env, user: SessionUser, hit: { kind: CopyKind; id: string; field: string; value: string }) {
  if (hit.kind === "content" && HIDDEN.has(hit.id)) throw new Error("That setting cannot be changed here.");
  await contentService.saveCopy(env, user, hit);
}

export async function resolveCopyTarget(env: Env, target: string): Promise<CopyHit | CopyHit[] | null> {
  const key = aliasKey(target);
  if (key) {
    const bag = await contentRepo.content(env.DB);
    if (bag[key] != null || COPY_LABELS[key]) {
      return { kind: "content", id: key, field: "value", where: "Website", label: COPY_LABELS[key] ?? key, value: bag[key] ?? "" };
    }
  }
  const hits = await searchCopy(env, target);
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return hits;
  return null;
}


