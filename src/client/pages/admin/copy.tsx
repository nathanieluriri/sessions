import { useMemo, useState } from "react";
import { Btn, Field, Loading } from "../../components/ui";
import { api } from "../../lib/api";
import { loadCatalog, loadSite } from "../../lib/catalog";
import { act, useApi } from "./kit";

type Kind = "content" | "service" | "package" | "extra" | "faq" | "policy" | "page";
type Hit = { kind: Kind; id: string; field: string; where: string; label: string; value: string };

const HIDDEN = new Set(["analytics_cf", "analytics_ga", "gsc_verification", "seo_indexing", "service_card_art"]);
const LABELS: Record<string, string> = {
  hero_badge: "Home badge", hero_title: "Home headline", hero_accent: "Home second line", hero_subtitle: "Home intro", hero_image: "Home photo",
  about_title: "About headline", about_intro: "About background", about_vision: "Vision", about_mission: "Mission", about_philosophy: "Creative philosophy", about_points: "Why work with us", about_image: "About photo",
  studio_title: "Studio headline", studio_intro: "Studio intro", tour_url: "Virtual tour link",
  services_intro: "Services page intro", pricing_intro: "Pricing page intro",
  business_name: "Business name", legal_name: "Legal name", footer_blurb: "Footer description", contact_phone: "Phone number", contact_email: "Studio email",
  whatsapp: "WhatsApp number", studio_address: "Address", map_query: "Map location", hours_note: "Opening hours note",
  social_instagram: "Instagram", social_tiktok: "TikTok", social_youtube: "YouTube", social_x: "X",
  seo_title: "Site title", seo_description: "Site description", seo_image: "Share image",
};
const DEFAULTS: Record<string, string> = {
  services_intro: "Book a recording session, a beat, a mix or full production. Video, podcast and photography are priced by quote.",
  pricing_intro: "Prices are locked when you book. Recording runs as four sessions a day, and you can book more than one at once. Video, podcast and photography are priced by quote.",
};

const clip = (v: string) => v.replace(/\s+/g, " ").trim();

export function CopySearch() {
  const [q, setQ] = useState("");
  const [content, loadContent] = useApi<any>("/admin/content");
  const [cat, loadCat] = useApi<any>("/admin/catalog");
  const [faqs, loadFaqs] = useApi<any[]>("/admin/collections/faqs");
  const [edit, setEdit] = useState<Hit | null>(null);
  const [draft, setDraft] = useState("");
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2 || !content) return [];
    const out: Hit[] = [];
    const add = (hit: Hit) => { if (`${hit.where} ${hit.label} ${hit.value}`.toLowerCase().includes(needle)) out.push(hit); };
    const bag = { ...DEFAULTS, ...content.content };
    for (const [key, value] of Object.entries(bag)) {
      if (HIDDEN.has(key) || typeof value !== "string") continue;
      add({ kind: "content", id: key, field: "value", where: "Website", label: LABELS[key] ?? key.replaceAll("_", " "), value });
    }
    for (const p of content.policies ?? []) {
      add({ kind: "policy", id: p.slug, field: "title", where: "Policy", label: `${p.title} title`, value: p.title });
      add({ kind: "policy", id: p.slug, field: "body", where: "Policy", label: p.title, value: p.body });
    }
    for (const p of content.pages ?? []) {
      add({ kind: "page", id: p.path, field: "title", where: "Page", label: `${p.path} title`, value: p.title ?? "" });
      add({ kind: "page", id: p.path, field: "description", where: "Page", label: `${p.path} description`, value: p.description ?? "" });
    }
    for (const s of cat?.services ?? []) {
      add({ kind: "service", id: s.id, field: "name", where: "Service", label: "Name", value: s.name });
      add({ kind: "service", id: s.id, field: "description", where: "Service", label: s.name, value: s.description ?? "" });
      add({ kind: "service", id: s.id, field: "details", where: "Service", label: `${s.name} details`, value: s.details ?? "" });
      add({ kind: "service", id: s.id, field: "price_label", where: "Service", label: `${s.name} price label`, value: s.price_label ?? "" });
      add({ kind: "service", id: s.id, field: "duration_label", where: "Service", label: `${s.name} duration`, value: s.duration_label ?? "" });
    }
    for (const p of cat?.packages ?? []) add({ kind: "package", id: p.id, field: "description", where: "Package", label: p.name, value: p.description ?? "" });
    for (const e of cat?.extras ?? []) {
      add({ kind: "extra", id: e.id, field: "name", where: "Add-on", label: "Name", value: e.name });
      add({ kind: "extra", id: e.id, field: "description", where: "Add-on", label: e.name, value: e.description ?? "" });
    }
    for (const f of faqs ?? []) {
      add({ kind: "faq", id: f.id, field: "question", where: "FAQ", label: "Question", value: f.question });
      add({ kind: "faq", id: f.id, field: "answer", where: "FAQ", label: f.question, value: f.answer });
    }
    return out.slice(0, 40);
  }, [q, content, cat, faqs]);
  const save = () => {
    if (!edit) return;
    act(() => api("/admin/copy", { method: "PUT", body: { kind: edit.kind, id: edit.id, field: edit.field, value: draft } }), "Saved on the website", () => {
      setEdit(null); loadContent(); loadCat(); loadFaqs(); loadSite(true); loadCatalog(true);
    });
  };
  if (!content) return <Loading />;
  return <div className="stack gap16">
    <div className="card stack gap8">
      <h3 className="h4">Find any words on the site</h3>
      <span className="small muted">Search the homepage, services, packages, add-ons, FAQs, policies, page descriptions and the studio email. Saving updates the live site.</span>
      <Field label="Search" name="copyq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try email, podcast, or a sentence" />
    </div>
    {q.trim().length < 2 ? <span className="small muted">Type at least two letters.</span> : hits.length === 0 ? <span className="small muted">Nothing matches that.</span> : hits.map((h) => {
      const open = edit?.kind === h.kind && edit.id === h.id && edit.field === h.field;
      return <div key={`${h.kind}-${h.id}-${h.field}`} className="card stack gap8">
        <div className="row between gap12 wrapflex"><div><span className="mono faint">{h.where}</span><div><b>{h.label}</b></div></div>{!open && <button className="link small" onClick={() => { setEdit(h); setDraft(h.value); }}>Edit</button>}</div>
        {open ? <>
          <textarea className="textarea" rows={Math.min(12, Math.max(3, draft.split("\n").length + 1))} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="row gap8"><Btn size="sm" onClick={save}>Save</Btn><Btn size="sm" kind="neutral" onClick={() => setEdit(null)}>Cancel</Btn></div>
        </> : <p className="small muted" style={{ margin: 0 }}>{clip(h.value).slice(0, 280) || "Empty"}</p>}
      </div>;
    })}
  </div>;
}
