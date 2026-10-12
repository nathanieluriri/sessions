import { useEffect, useState } from "react";
import { api } from "./api";

export interface Service {
  id: string; slug: string; name: string; description: string; price_label: string; image_url: string; active: number; sort: number;
  category: string; details: string; deliverables: string[]; duration_label: string; gallery: string[];
}
export interface Package {
  id: string; slug: string; name: string; description: string; category: "session" | "post"; duration_min: number; price_kobo: number; includes: string[];
  featured: number; active: number; service_category: string; room_id: string | null; pricing: "fixed" | "quote"; deposit_percent: number | null; requires_approval: number; price_note: string;
}
export interface Room { id: string; slug: string; name: string; kind: string; description: string; image_url: string; capacity: number; hourly_kobo: number; features: string[]; active: number }
export interface Category { slug: string; name: string; blurb: string; sort: number }
export interface Extra { slug: string; name: string; price_kobo: number; category: string }
export interface Catalog {
  services: Service[]; packages: Package[]; rooms: Room[]; categories: Category[]; extras: Extra[];
  rules: { holdMin: number; extraHourKobo: number; maxPeople: number; buffer: number; depositPercent: number; requireApproval: boolean; paymentWindowHours: number };
  hours: { weekday: number; is_open: number; open_min: number; close_min: number }[];
}
export interface Policy { slug: string; title: string; body: string; kind: "booking" | "legal"; updated_at: string }
export interface Work { id: string; title: string; category: string; client: string; description: string; image_url: string; embed_url: string; link_url: string; year: string; featured: number }
export interface Site {
  policies: Policy[]; content: Record<string, string>; portfolio: Work[];
  team: { id: string; name: string; role: string; bio: string; image_url: string }[];
  equipment: { id: string; category: string; name: string; detail: string; room_id: string | null }[];
  gallery: { id: string; image_url: string; caption: string; room_id: string | null }[];
  testimonials: { id: string; quote: string; name: string; role: string; featured: number }[];
  faqs: { id: string; question: string; answer: string }[];
  announcements: { id: string; title: string; body: string; link_label: string; link_url: string }[];
}

let catalog: Promise<Catalog> | null = null;
let site: Promise<Site> | null = null;
export const loadCatalog = (fresh = false) => (catalog && !fresh ? catalog : (catalog = api<Catalog>("/catalog")));
export const loadSite = (fresh = false) => (site && !fresh ? site : (site = api<Site>("/content")));

export function useCatalog() {
  const [c, setC] = useState<Catalog | null>(null);
  useEffect(() => { loadCatalog().then(setC); }, []);
  return c;
}

export function useContent() {
  const [c, setC] = useState<Site | null>(null);
  useEffect(() => { loadSite().then(setC); }, []);
  return c;
}

/** Packages that can be booked for a service: same category, fixed price, linked to a room. */
export const packagesFor = (cat: Catalog, category: string) => cat.packages.filter((p) => p.service_category === category);
export const roomOf = (cat: Catalog, p?: Package) => cat.rooms.find((r) => r.id === p?.room_id);
export const depositOf = (cat: Catalog, p: Package, total: number) => {
  const pct = p.deposit_percent ?? cat.rules.depositPercent;
  return pct > 0 && pct < 100 ? Math.round((total * pct) / 1_000_000) * 10_000 : total;
};
export const needsApproval = (cat: Catalog, p?: Package) => !!p && (!!p.requires_approval || cat.rules.requireApproval);

export const HERO_PHOTO = "https://images.unsplash.com/photo-1647881602319-f3e5964bae06?w=1800&q=72&auto=format&fit=crop";
export const PHOTOS = {
  singer: "https://images.unsplash.com/photo-1617745546548-9324da9e2b7c?w=1400&q=70&auto=format&fit=crop",
  performer: "https://images.unsplash.com/photo-1537344845089-c7f47b3210ab?w=1400&q=70&auto=format&fit=crop",
  control: "https://images.unsplash.com/photo-1714140674991-f12cf2bb4d4a?w=1400&q=70&auto=format&fit=crop",
  producer: "https://images.unsplash.com/photo-1648522168784-067e98df88c0?w=1400&q=70&auto=format&fit=crop",
  editing: "https://images.unsplash.com/photo-1632800237110-f9c87acc2222?w=1400&q=70&auto=format&fit=crop",
  voiceover: "https://images.unsplash.com/photo-1593697820980-a9d1a839aff7?w=1400&q=70&auto=format&fit=crop",
  stage: "https://images.unsplash.com/photo-1612544409025-e1f6a56c1152?w=1400&q=70&auto=format&fit=crop",
};
