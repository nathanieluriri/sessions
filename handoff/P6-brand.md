# P6. Brand: Psych Records logo everywhere

Read first: `.gauntlet/BRIEF.md` (R17), `.gauntlet/ARCHITECTURE.md` (house rules only).

## Goal

The placeholder mark (three green shapes copied from a Figma file, the `MARK` path data in `src/client/components/brand.tsx` and `src/client/public/favicon.svg`) is gone. The real Psych Records logo shows in every place the placeholder did, and a few new ones, crisp on every screen density, correct on dark and light surfaces, light on the wire.

## The two supplied files (read-only originals, never commit them as they are)

- `/root/.claude/uploads/e4158143-0612-583f-a6cc-25c7b8ce3d86/8c88601c-psych_records_tiger_head.svg` (1.3 MB): an SVG wrapper around one base64 PNG, 1345 by 1169, RGB (no alpha), a metallic gold tiger head on pure black. The PNG also carries a C2PA metadata box which must not ship. Extract it with a script (Python with PIL and ImageMagick `convert` are available; no new npm dependencies). Make a transparent version (black to alpha, keeping the soft gold edge: derive alpha from luminance and un-premultiply the colour, then check it on `#0a0a0a`, `#000` and white) and optimized WebP derivatives for small, medium and large use (an `srcset`-friendly set, 2x of the largest displayed size).
- `/root/.claude/uploads/e4158143-0612-583f-a6cc-25c7b8ce3d86/7dcab11a-psych_records_entertainment_vector.svg` (450 KB): the full lockup "PSYCH Records Entertainment" with the tiger, an auto-traced vector on a black rect. It is posterized and its RECORDS and ENTERTAINMENT words are outlines of black letters on black. Render it to look before deciding how to use it (Chromium at `/opt/pw-browsers/chromium`, Playwright is installed, set `CHROME_PATH`). It suits the footer, the About hero or loader at moderate sizes and the share image. Judge honestly where it looks good and where it does not, and do not stretch it huge.

## Bar

Match or beat the logo treatment on an established record label website: the mark is crisp at every size and pixel density, sits correctly on light and dark surfaces, nothing of the old placeholder remains, and the favicon, touch icon and social share image are real.

## Files you own

`src/client/components/brand.tsx` (`Mark`, `LogoLoader`, keep `Icon`, `Socials`, `Waveform` untouched), `Intro.tsx`, the logo parts of `Layout.tsx`, `Dash.tsx` (`brandmark`), `pages/auth.tsx` (`brandmark`), `PhoneDemo.tsx`, `BookingTicket.tsx` (only logo usage), `pages/about.tsx` (only the `Mark`), logo usage inside `pages/book.tsx` (`Mark`, receipt logo) and `pages/public.tsx` if any, logo related CSS in `src/client/styles.css` (`.nlogo`, `.flogo`, `.brandmark`, `.logoload`, `.ilogo`, receipt `.rc-logo`), `src/client/index.html`, `src/client/public/**`, `src/worker/site.ts` (fallback share image and structured data `logo`), `README.md` and `docs/*` lines that say the logo is a placeholder. Other builders are editing server booking code and server file code at the same time and a later builder owns the rest of the client: only touch the lines that concern the logo, never overwrite a whole existing file with Write (use Edit), and ignore type errors in files you do not own.

## Must do

1. Replace `Mark` with an `<img>` based component of the tiger emblem (keep the `tone` and `size` props working so all call sites keep compiling, but make the visual correct per surface: dark surfaces use the transparent emblem, light surfaces such as the light dashboard sidebar, receipts and the printed receipt paper use a black rounded tile behind it). Give it explicit width and height (no layout shift), `alt` for meaningful uses and empty alt when decorative, `decoding="async"`, and `srcset`/`sizes` for 1x and 2x. Nav pill, footer, mobile menu, intro, auth pages, both dashboards, phone demo, tickets, receipts, About "why us", booking done pages all show the emblem.
2. Replace `LogoLoader` (a traced stroke animation of the old paths) with the emblem plus a restrained animation (soft pulse or a light sweep) that honours `prefers-reduced-motion`.
3. Intro splash and footer: use the emblem, and use the full lockup where it looks good (footer brand column, About hero strip or intro). Do not distort aspect ratios.
4. Favicon set from the emblem: `favicon.ico` (16, 32, 48), `favicon-32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` on the black rounded tile, linked from `index.html`, plus `theme-color` stays. Remove the old `favicon.svg` and fix `wrangler.jsonc` `run_worker_first` if it references it (`"!/favicon.svg"`), making sure icons and `/brand/*` are served by the static assets and never by the Worker catch-all.
5. Social share image: `/brand/og.png` 1200 by 630 built from the lockup or emblem on black. `site.ts` uses it as the final fallback for `og:image`, and the LocalBusiness JSON-LD gets `logo`.
6. Weight budget: all logo images on first paint of the home page add no more than about 60 KB over the wire (WebP). Lazy load the lockup where it is below the fold. Keep derivative generation reproducible: add `scripts/make-brand.mjs` or a short `scripts/make-brand.py` that regenerates every asset from the two originals (originals themselves are not committed), and mention the command in `README.md`.
7. Grep proof: no remaining reference to the old `MARK` path data, `favicon.svg`, or the words "placeholder mark" or "official logo files" in code, docs or README. Update `docs/REQUIREMENTS.md` "Before launch" and the admin checklist copy (`pages/admin/index.tsx` Checklist item "Replace sample content ... and send the official logo") so they no longer ask for the logo.
8. Do not change the colour palette or restyle unrelated UI. The neon green accent stays.

## How it will be judged

A fresh critic builds, starts its own instance, and screenshots the home page (top, scrolled, mobile menu open, footer), login, register, `/admin` and `/account` shells, a booking confirmation, the receipt printer and the loader at 1x and 2x device scale at 390 px and 1440 px wide. It checks the emblem is never stretched, never has a black box on a non-black surface, never blurry, the favicon and share image resolve with the right content types, bytes over the wire, and greps for leftovers. It also compares against what a real label site does.
