import { useEffect, useState } from "react";
import { Area, Btn, Field, Loading, Modal, Tag } from "../../components/ui";
import { api } from "../../lib/api";
import { loadSite, useCatalog } from "../../lib/catalog";
import { dateTime } from "../../lib/format";
import { act, CollectionEditor, FormFields, Tabs, useApi, type FieldDef } from "./kit";

type Tab = "pages" | "business" | "portfolio" | "team" | "studio" | "testimonials" | "faqs" | "announcements" | "policies" | "seo";

const PAGE_GROUPS: [string, FieldDef[]][] = [
  ["Home page hero", [
    { key: "hero_badge", label: "Badge above the headline", hint: "A short line. A live announcement takes its place while it runs." },
    { key: "hero_title", label: "Headline" }, { key: "hero_accent", label: "Second line", hint: "Its last word is shown in green." }, { key: "hero_subtitle", label: "Intro text", type: "textarea", rows: 2 },
    { key: "hero_image", label: "How it works photo", type: "image", hint: "Shown as a colourful pixel mosaic behind the app preview in the How it works section." },
  ]],
  ["About us", [
    { key: "about_title", label: "Headline" }, { key: "about_intro", label: "Background", type: "textarea", rows: 4 }, { key: "about_vision", label: "Vision", type: "textarea", rows: 2 },
    { key: "about_mission", label: "Mission", type: "textarea", rows: 2 }, { key: "about_philosophy", label: "Creative philosophy and standards", type: "textarea", rows: 2 },
    { key: "about_points", label: "Why work with us", type: "textarea", rows: 5, hint: "One per line, written as Title: text" }, { key: "about_image", label: "Photo", type: "image" },
  ]],
  ["Studio and facilities", [
    { key: "studio_title", label: "Headline" }, { key: "studio_intro", label: "Intro text", type: "textarea", rows: 2 },
    { key: "tour_url", label: "Virtual tour link", hint: "A YouTube or Vimeo link plays on the page. Any other link opens in a new tab." },
  ]],
];

const BUSINESS: FieldDef[] = [
  { key: "business_name", label: "Business name" }, { key: "legal_name", label: "Legal name", hint: "Shown in the footer and legal pages." },
  { key: "footer_blurb", label: "Footer description", type: "textarea", rows: 2 }, { key: "contact_phone", label: "Phone number" }, { key: "contact_email", label: "Email address", hint: "Also used as the reply-to address on booking emails." },
  { key: "whatsapp", label: "WhatsApp number", hint: "International format without +, for example 2348012345678." }, { key: "studio_address", label: "Address" },
  { key: "map_query", label: "Map location", hint: "The address or place name to show on the Contact page map." }, { key: "hours_note", label: "Note under opening hours" },
  { key: "social_instagram", label: "Instagram link" }, { key: "social_tiktok", label: "TikTok link" }, { key: "social_youtube", label: "YouTube link" }, { key: "social_x", label: "X link" },
];

const SEO: FieldDef[] = [
  { key: "seo_title", label: "Site title", hint: "Shown in search results and browser tabs for the home page." }, { key: "seo_description", label: "Site description", type: "textarea", rows: 2 },
  { key: "seo_image", label: "Default share image", type: "image", hint: "Used when a page is shared on WhatsApp, X or Facebook." },
  { key: "analytics_cf", label: "Cloudflare Web Analytics token", hint: "Free and cookie-free. Copy the token from Cloudflare, Web Analytics." },
  { key: "analytics_ga", label: "Google Analytics 4 measurement ID", hint: "Looks like G-XXXXXXXXXX. Leave empty to turn it off." },
  { key: "gsc_verification", label: "Google Search Console verification code", hint: "The content value of the HTML tag verification method." },
];

function ContentForm({ groups, d, reload }: { groups: [string, FieldDef[]][]; d: any; reload: () => void }) {
  const [c, setC] = useState<Record<string, string>>(d.content);
  useEffect(() => setC(d.content), [d]);
  const keys = groups.flatMap(([, f]) => f.map((x) => x.key));
  const save = () => act(() => api("/admin/content", { method: "PUT", body: Object.fromEntries(keys.map((k) => [k, String(c[k] ?? "")])) }), "Website updated", () => { reload(); loadSite(true); });
  return <>
    {groups.map(([title, fields]) => <div key={title} className="card stack gap12"><h3 className="h4">{title}</h3><FormFields fields={fields} value={c} onChange={setC} /></div>)}
    <div><Btn onClick={save}>Publish changes</Btn></div>
  </>;
}

export function Website() {
  const [tab, setTab] = useState<Tab>("pages");
  const [d, load] = useApi<any>("/admin/content");
  const cat = useCatalog();
  const [pol, setPol] = useState<any>(null);
  const [page, setPage] = useState<any>(null);
  if (!d) return <Loading />;
  const catOptions: [string, string][] = cat?.categories.map((c) => [c.slug, c.name]) ?? [];
  const roomOptions: [string, string][] = [["", "No specific room"], ...(cat?.rooms.map((r) => [r.id, r.name] as [string, string]) ?? [])];
  return <>
    <Tabs value={tab} onChange={setTab} tabs={[["pages", "Pages"], ["business", "Business and contact"], ["portfolio", "Portfolio"], ["team", "Team"], ["studio", "Equipment and gallery"], ["testimonials", "Testimonials"], ["faqs", "FAQs"], ["announcements", "Announcements"], ["policies", "Policies and legal"], ["seo", "SEO and analytics"]]} />
    {tab === "pages" && <ContentForm groups={PAGE_GROUPS} d={d} reload={load} />}
    {tab === "business" && <ContentForm groups={[["Business and contact details", BUSINESS]]} d={d} reload={load} />}
    {tab === "portfolio" && <CollectionEditor name="portfolio" noun="project" intro={<span className="small muted">Paste a YouTube, Vimeo, Spotify or SoundCloud link to embed a player. Featured projects show on the home page.</span>}
      blank={{ title: "", category: catOptions[0]?.[0] ?? "music", client: "", description: "", image_url: "", embed_url: "", link_url: "", year: String(new Date().getFullYear()), featured: 0, published: 1 }}
      fields={[
        { key: "title", label: "Title" }, { key: "category", label: "Category", type: "select", options: catOptions }, { key: "client", label: "Client or artist" }, { key: "year", label: "Year" },
        { key: "description", label: "Description", type: "textarea" }, { key: "image_url", label: "Cover image", type: "image" },
        { key: "embed_url", label: "Video or audio link", hint: "YouTube, Vimeo, Spotify or SoundCloud" }, { key: "link_url", label: "External link (optional)" },
        { key: "featured", label: "Feature on the home page", type: "bool" }, { key: "published", label: "Published", type: "bool" },
      ]}
      row={(w) => <div className="row gap12"><span className="rowthumb" style={{ backgroundImage: `url(${w.image_url})` }} /><div><b>{w.title}</b> {w.featured ? <Tag tone="brand">Featured</Tag> : null}<div className="caption">{cat?.categories.find((c) => c.slug === w.category)?.name} · {w.client} · {w.year}{w.embed_url ? " · has player" : ""}</div></div></div>} />}
    {tab === "team" && <CollectionEditor name="team" noun="team member" intro={<span className="small muted">Shown on the About page. Without a photo, initials are shown.</span>}
      blank={{ name: "", role: "", bio: "", image_url: "", published: 1 }}
      fields={[{ key: "name", label: "Name" }, { key: "role", label: "Role" }, { key: "bio", label: "Short bio", type: "textarea" }, { key: "image_url", label: "Photo", type: "image" }, { key: "published", label: "Published", type: "bool" }]}
      row={(m) => <div><b>{m.name}</b><div className="caption">{m.role}</div></div>} />}
    {tab === "studio" && <div className="grid cols-2" style={{ alignItems: "start" }}>
      <div className="stack gap12"><h3 className="h4">Equipment</h3><CollectionEditor name="equipment" noun="item" intro={<span className="small muted">Only list what is really in the studio.</span>}
        blank={{ category: "Microphones", name: "", detail: "", room_id: null }}
        fields={[{ key: "category", label: "Group", hint: "For example: Microphones, Cameras, Lighting" }, { key: "name", label: "Name" }, { key: "detail", label: "Detail" }, { key: "room_id", label: "Room", type: "select", options: roomOptions }]}
        row={(e) => <div><b className="small">{e.name}</b><div className="caption">{e.category}{e.room_id ? ` · ${cat?.rooms.find((r) => r.id === e.room_id)?.name}` : ""}</div></div>} /></div>
      <div className="stack gap12"><h3 className="h4">Gallery</h3><CollectionEditor name="gallery" noun="photo"
        blank={{ image_url: "", caption: "", room_id: null }}
        fields={[{ key: "image_url", label: "Photo", type: "image" }, { key: "caption", label: "Caption", hint: "Also used as the image description for screen readers and search." }, { key: "room_id", label: "Room", type: "select", options: roomOptions }]}
        row={(g) => <div className="row gap12"><span className="rowthumb" style={{ backgroundImage: `url(${g.image_url})` }} /><span className="small">{g.caption || "No caption"}</span></div>} /></div>
    </div>}
    {tab === "testimonials" && <CollectionEditor name="testimonials" noun="testimonial" intro={<span className="small muted">Only publish real client quotes, with their permission. The featured one shows on the home page.</span>}
      blank={{ quote: "", name: "", role: "", featured: 0, published: 1 }}
      fields={[{ key: "quote", label: "Quote", type: "textarea" }, { key: "name", label: "Name" }, { key: "role", label: "Role, for example Singer" }, { key: "featured", label: "Feature on the home page", type: "bool" }, { key: "published", label: "Published", type: "bool" }]}
      row={(t) => <div><b className="small">“{t.quote.slice(0, 90)}{t.quote.length > 90 ? "…" : ""}”</b> {t.featured ? <Tag tone="brand">Featured</Tag> : null}<div className="caption">{t.name} · {t.role}</div></div>} />}
    {tab === "faqs" && <CollectionEditor name="faqs" noun="question" blank={{ question: "", answer: "", published: 1 }}
      fields={[{ key: "question", label: "Question" }, { key: "answer", label: "Answer", type: "textarea", rows: 4 }, { key: "published", label: "Published", type: "bool" }]}
      row={(q) => <div><b className="small">{q.question}</b><div className="caption">{q.answer.slice(0, 120)}…</div></div>} />}
    {tab === "announcements" && <CollectionEditor name="announcements" noun="announcement" sortable={false} intro={<span className="small muted">The newest live announcement shows as a bar at the top of the website.</span>}
      blank={{ title: "", body: "", link_label: "", link_url: "", starts_on: null, ends_on: null, published: 1 }}
      fields={[{ key: "title", label: "Title" }, { key: "body", label: "Text", type: "textarea", rows: 2 }, { key: "link_label", label: "Link label" }, { key: "link_url", label: "Link", hint: "A page on this site such as /packages, or a full https:// link" },
        { key: "starts_on", label: "Show from", type: "date" }, { key: "ends_on", label: "Show until", type: "date" }, { key: "published", label: "Published", type: "bool" }]}
      row={(a) => <div><b>{a.title}</b><div className="caption">{a.starts_on || a.ends_on ? `${a.starts_on ?? "now"} to ${a.ends_on ?? "no end date"}` : "No dates"}</div></div>} />}
    {tab === "policies" && <div className="card stack gap8">
      <span className="small muted">Booking policies are shown on the Pricing page and accepted at checkout. Publishing one creates a new policy version; existing bookings keep the version they accepted. Privacy and terms have their own pages. Use blank lines for paragraphs, ## for headings and - for bullet points.</span>
      {d.policies.map((p: any) => <div key={p.slug} className="row between gap12" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}><div><b className="small">{p.title}</b> <Tag>{p.kind === "legal" ? "Page" : "Booking policy"}</Tag><div className="caption">Updated {dateTime(p.updated_at)} · {p.body.slice(0, 100)}…</div></div><button className="link small" onClick={() => setPol({ ...p })}>Edit</button></div>)}
    </div>}
    {tab === "seo" && <>
      <ContentForm groups={[["Search and analytics", SEO]]} d={d} reload={load} />
      <div className="card stack gap12">
        <div className="row between wrapflex gap12"><h3 className="h4">Search engine indexing</h3><Tag tone={d.content.seo_indexing === "1" ? "success" : "warning"}>{d.content.seo_indexing === "1" ? "Visible to search engines" : "Hidden from search engines"}</Tag></div>
        <span className="small muted">Keep this off until real content, contact details and the custom domain are in place. Turning it on publishes robots.txt and the sitemap at /sitemap.xml.</span>
        <div><Btn kind={d.content.seo_indexing === "1" ? "neutral" : ""} onClick={() => act(() => api("/admin/content", { method: "PUT", body: { seo_indexing: d.content.seo_indexing === "1" ? "0" : "1" } }), "Indexing updated", load)}>{d.content.seo_indexing === "1" ? "Hide from search engines" : "Allow search engines"}</Btn></div>
      </div>
      <div className="card stack gap8">
        <h3 className="h4">Page titles and descriptions</h3>
        <span className="small muted">Each service page uses the service name and summary automatically.</span>
        {d.pages.map((p: any) => <div key={p.path} className="row between gap12" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}><div><b className="small mono">{p.path}</b><div className="caption">{p.title || "Site title"} · {p.description ? `${p.description.slice(0, 80)}…` : "Site description"}</div></div><button className="link small" onClick={() => setPage({ ...p })}>Edit</button></div>)}
      </div>
    </>}
    {pol && <Modal title={`Edit ${pol.title}`} onClose={() => setPol(null)}>
      <Field label="Title" name="ptitle" value={pol.title} onChange={(e) => setPol({ ...pol, title: e.target.value })} />
      <Area label="Text" name="pbody" rows={pol.kind === "legal" ? 16 : 7} value={pol.body} onChange={(e) => setPol({ ...pol, body: e.target.value })} />
      <Btn onClick={() => act(() => api(`/admin/policies/${pol.slug}`, { method: "PUT", body: { title: pol.title, body: pol.body } }), "Published", () => { setPol(null); load(); loadSite(true); })}>Publish</Btn>
    </Modal>}
    {page && <Modal title={`SEO for ${page.path}`} onClose={() => setPage(null)}>
      <FormFields fields={[{ key: "title", label: "Page title", hint: "The business name is added automatically." }, { key: "description", label: "Meta description", type: "textarea", rows: 3, hint: "About 150 characters works best." }, { key: "image_url", label: "Share image", type: "image" }]} value={page} onChange={setPage} />
      <Btn onClick={() => act(() => api(`/admin/collections/page_meta/${encodeURIComponent(page.path)}`, { method: "PUT", body: { title: page.title, description: page.description, image_url: page.image_url } }), "Page SEO saved", () => { setPage(null); load(); })}>Save</Btn>
    </Modal>}
  </>;
}
