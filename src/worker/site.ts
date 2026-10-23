import type { Env } from "./env";
import { contentRepo, settingsRepo } from "./repositories/settings";
import { catalogRepo } from "./repositories/catalog";

const PUBLIC_PATHS = ["/", "/services", "/studio", "/portfolio", "/packages", "/about", "/contact", "/faq", "/quote", "/book", "/privacy", "/terms"];
const PRIVATE_PREFIXES = ["/admin", "/account", "/pay", "/book/", "/login", "/register", "/staff", "/forgot-password", "/reset-password", "/verify-email"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const indexing = async (env: Env) => (await contentRepo.content(env.DB)).seo_indexing === "1";

export async function robots(env: Env, origin: string) {
  const body = (await indexing(env))
    ? `User-agent: *\nDisallow: /admin\nDisallow: /account\nDisallow: /api/\nDisallow: /pay/\nDisallow: /book/verify\n\nSitemap: ${origin}/sitemap.xml\n`
    : "User-agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}

export async function sitemap(env: Env, origin: string) {
  const services = await catalogRepo.services(env.DB);
  const urls = [...PUBLIC_PATHS, ...services.map((s) => `/services/${s.slug}`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${origin}${u}</loc></url>`).join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}

/** Admin image uploads are the only public objects. Portal files share the bucket but are served only by the gated download routes. */
const PUBLIC_KEY = /^\d{4}-\d{2}\/[0-9a-f-]{36}\.(?:jpg|png|webp|gif)$/;

export async function media(env: Env, path: string) {
  let key = "";
  try { key = decodeURIComponent(path); } catch { /* a malformed escape matches nothing */ }
  const obj = env.MEDIA && PUBLIC_KEY.test(key) ? await env.MEDIA.get(key) : null;
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(obj.body, { headers });
}

/** Serves the single-page app with the right title, description, social tags, structured data and analytics for each URL. */
export async function page(request: Request, env: Env) {
  const res = await env.ASSETS.fetch(request);
  if (!(res.headers.get("content-type") ?? "").includes("text/html")) return res;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const [content, pages, hours] = await Promise.all([contentRepo.content(env.DB), contentRepo.pageMeta(env.DB), settingsRepo.hours(env.DB)]);
  const name = content.business_name || env.STUDIO_NAME;
  const meta = pages.find((p) => p.path === path);
  let title = meta?.title ? `${meta.title} | ${name}` : content.seo_title || name;
  let description = meta?.description || content.seo_description || "";
  let image = meta?.image_url || content.seo_image || content.hero_image || "";
  const service = path.match(/^\/services\/([a-z0-9-]+)$/);
  if (service) {
    const s = await catalogRepo.serviceBySlug(env.DB, service[1]);
    if (s) { title = `${s.name} | ${name}`; description = s.description; image = s.image_url; }
  }
  const brandImage = !image;
  if (brandImage) image = "/brand/og.png";
  if (image.startsWith("/")) image = url.origin + image;
  const hidden = content.seo_indexing !== "1" || PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`));
  const social = [content.social_instagram, content.social_tiktok, content.social_youtube, content.social_x].filter((s) => s && !/^https?:\/\/(www\.)?[a-z]+\.com\/?$/.test(s));
  const business = {
    "@context": "https://schema.org", "@type": "LocalBusiness", name, url: url.origin, description: content.seo_description || undefined,
    telephone: content.contact_phone || undefined, email: content.contact_email || undefined, image, logo: `${url.origin}/icon-512.png`,
    address: content.studio_address ? { "@type": "PostalAddress", streetAddress: content.studio_address, addressCountry: "NG" } : undefined,
    openingHoursSpecification: hours.filter((h) => h.is_open).map((h) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: DAYS[h.weekday], opens: hhmm(h.open_min), closes: hhmm(h.close_min) })),
    sameAs: social.length ? social : undefined,
  };
  const head = [
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(url.origin + path)}">`,
    `<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(name)}"><meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url.origin + path)}">`,
    `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">`,
    brandImage ? `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(name)}">` : "",
    hidden ? `<meta name="robots" content="noindex, nofollow">` : "",
    content.gsc_verification ? `<meta name="google-site-verification" content="${esc(content.gsc_verification)}">` : "",
    path === "/" || path === "/contact" ? `<script type="application/ld+json">${JSON.stringify(business).replace(/</g, "\\u003c")}</script>` : "",
    content.analytics_cf ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${esc(JSON.stringify({ token: content.analytics_cf }))}'></script>` : "",
    /^G-[A-Z0-9]+$/.test(content.analytics_ga ?? "")
      ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${content.analytics_ga}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${content.analytics_ga}")</script>`
      : "",
  ].filter(Boolean).join("");

  const out = new HTMLRewriter()
    .on("title", { element: (el) => { el.setInnerContent(title); } })
    .on('meta[name="description"]', { element: (el) => { el.remove(); } })
    .on("head", { element: (el) => { el.append(head, { html: true }); } })
    .transform(res);
  const headers = new Headers(out.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Cache-Control", "no-cache");
  return new Response(out.body, { status: out.status, headers });
}
