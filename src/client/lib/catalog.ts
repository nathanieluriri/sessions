import { useEffect, useState } from "react";
import { api } from "./api";

export interface Service { id: string; slug: string; name: string; description: string; price_label: string; image_url: string; active: number }
export interface Package { id: string; slug: string; name: string; description: string; category: "session" | "post"; duration_min: number; price_kobo: number; includes: string[]; featured: number; active: number }
export interface Catalog {
  services: Service[]; packages: Package[]; extras: { slug: string; name: string; price_kobo: number }[];
  rules: { holdMin: number; extraHourKobo: number; maxPeople: number; buffer: number };
  hours: { weekday: number; is_open: number; open_min: number; close_min: number }[];
}

let cache: Promise<Catalog> | null = null;
export const loadCatalog = (fresh = false) => (cache && !fresh ? cache : (cache = api<Catalog>("/catalog")));

export function useCatalog() {
  const [c, setC] = useState<Catalog | null>(null);
  useEffect(() => { loadCatalog().then(setC); }, []);
  return c;
}

export function useContent() {
  const [c, setC] = useState<{ policies: { slug: string; title: string; body: string; updated_at: string }[]; content: Record<string, string> } | null>(null);
  useEffect(() => { api("/content").then(setC); }, []);
  return c;
}

export const HERO_PHOTO = "https://images.unsplash.com/photo-1647881602319-f3e5964bae06?w=1800&q=72&auto=format&fit=crop";
export const PHOTOS = {
  singer: "https://images.unsplash.com/photo-1617745546548-9324da9e2b7c?w=1400&q=70&auto=format&fit=crop",
  performer: "https://images.unsplash.com/photo-1537344845089-c7f47b3210ab?w=1400&q=70&auto=format&fit=crop",
  control: "https://images.unsplash.com/photo-1714140674991-f12cf2bb4d4a?w=1400&q=70&auto=format&fit=crop",
  producer: "https://images.unsplash.com/photo-1648522168784-067e98df88c0?w=1400&q=70&auto=format&fit=crop",
  editing: "https://images.unsplash.com/photo-1632800237110-f9c87acc2222?w=1400&q=70&auto=format&fit=crop",
  voiceover: "https://images.unsplash.com/photo-1593697820980-a9d1a839aff7?w=1400&q=70&auto=format&fit=crop",
};
