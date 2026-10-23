# Requirements coverage

How this build meets the Website Requirements Document for Psych Records Entertainment Limited, and draft answers to the questions in its section 18. Items marked **To confirm** are commercial terms for the developer and the studio to agree.

## Coverage

| Section | Requirement | Status |
| --- | --- | --- |
| 3 | Premium, cinematic, responsive design with clear calls to action | Done. Black and green brand set in Reddit Sans, photo-led pages, Book a Session, Explore Our Services and Contact on every page, staggered motion that respects reduced-motion settings. |
| 4.1 | Home: hero, overview, featured categories, facilities preview, selected projects, testimonials, booking section, footer details | Done. The hero plays the booking flow on a phone in front of an animated glass swirl; sections cover why book here, how it works, services, rooms, testimonials, work, packages and FAQs. |
| 4.2 | About: background, vision, mission, philosophy, team, photos, reasons to work with the studio | Done, all editable. |
| 4.3 | Services: music, video, podcast, photography and content, room for new categories; description, images, optional pricing, duration, deliverables, booking or enquiry per service | Done. Every service has its own page; new categories are added from the dashboard. |
| 4.4 | Studio and facilities: rooms, equipment, personnel, gallery, virtual tour | Done. The tour accepts a YouTube or Vimeo link (played on the page) or any tour link. |
| 4.5 | Portfolio with categories, images, video embeds, external links and admin tools | Done. YouTube, Vimeo, Spotify and SoundCloud links play inline. |
| 4.6 | Pricing: hourly, half-day, full-day, packages, quotations, configurable terms | Done. Quote-priced packages show Request a quote. |
| 4.7 | Contact: phone, email, address, map, WhatsApp, socials, form with service of interest, confirmation, email and dashboard record | Done. |
| 5.1 | Booking: service, room or package, live dates and times, duration, details including attendees, project, requirements and reference links, review with rate, total, deposit and policies, payment, confirmation email with reference and status | Done. |
| 5.2 | Calendar, hours, durations, rates per service, room and length, buffers, no double booking per room, statuses, deposits, approvals, change requests, emails, records, staff bookings | Done. Rescheduled bookings carry a Rescheduled tag. |
| 6 | Cards, transfer and local methods, references, automatic verified status, receipts, balances, failed and pending handling, no stored card data | Done with Paystack (card, bank transfer, USSD). Verified on the server and by signed webhook. |
| 7 | Customer accounts and booking history | Done in this version. |
| 8 | Dashboard for bookings, services and pricing, website content, payments and reports, with access control | Done. Eight permissions plus CEO-only finance, staff and audit. |
| 9 | Emails for requests, confirmations, rejections, payments, cancellations, rescheduling and reminders; staff alerts; WhatsApp contact | Done. Automatic WhatsApp notifications are optional and not built (see exclusions). |
| 10 | FAQs and policies | Done. The FAQ covers every topic listed. Policy, privacy and terms texts are drafts for the studio to approve. |
| 11 | SEO: URLs, editable titles and descriptions, image optimisation and alt text, sitemap, indexing controls, analytics, Search Console, social sharing | Done. Indexing stays off until launch. |
| 12 | Responsive, HTTPS, secure admin, permissions, protection against common attacks, backups, optimised media, spam protection, privacy | Done. Hashed passwords, HttpOnly SameSite cookies, login rate limits, parameterised SQL, server-side permission checks, honeypot and timing checks on forms, documented backups. |
| 13 | Payments, maps, email, WhatsApp, analytics, video embeds, calendar | Done. Clients can add sessions to their own calendar; two-way calendar sync is a later option. |
| 15 | Phase 1 core site, Phase 2 booking and payments, Phase 3 accounts and reports | Phases 1 and 2 done; Phase 3 accounts and reports done. Product sales and other future features are not included. |
| 16 | Deliverables | Design (Figma), build, categories, booking, payments, content management, forms, SEO, testing, admin handover and guides are done. Deployment to the studio's own domain waits on the domain. |

## Before launch

1. Replace sample content: team, equipment, portfolio, testimonials, photos and contact details.
2. Approve or edit the booking policies, privacy policy and terms.
3. Add the Paystack live key and the Resend key, and connect the domain ([operations guide](OPERATIONS.md)).
4. Turn on analytics and search indexing.

The dashboard's launch checklist tracks these.

## Answers to section 18

**What technology stack do you recommend, and why?**
Cloudflare Workers, D1 and R2 with a React front end and a custom admin dashboard. Pages load from Cloudflare's network close to visitors, the booking logic and payments run on the server, there is no plugin stack to patch, and hosting costs stay between nothing and about $5 a month. The admin is built for the studio's workflow rather than adapted from a blog CMS.

**Will the booking calendar display real-time availability?**
Yes. Times come straight from the database, with opening hours, blocked time, buffers, holds and existing bookings applied per room. A slot is held on the server while a client checks out, so two people cannot take the same room at the same time.

**Can the system manage different rooms, services, prices and session durations?**
Yes. Each room has its own calendar, capacity and hourly rate. Packages set the room, duration, price, deposit and approval rule, and services are grouped into categories that can grow.

**Will bookings be automatically confirmed or manually approved?**
Both, chosen per package or for every booking. Automatic bookings confirm only after Paystack confirms the payment. Approval bookings are held as requests until staff approve them, then the client pays to confirm. Unpaid or unapproved requests are never treated as confirmed unless staff confirm them under studio policy.

**Which payment gateway do you recommend, and what are its costs?**
Paystack: card, bank transfer and USSD for Nigerian customers, and international cards. In Nigeria it charges 1.5% + ₦100 per local transaction (the ₦100 is waived under ₦2,500, capped at ₦2,000) and 3.9% + ₦100 for international cards, with no monthly fee.

**Will customers be able to pay deposits rather than the full amount?**
Yes. A default deposit (50%) with per-package overrides, balances paid online later or recorded by staff, and refunds calculated on what was actually paid.

**Is the administrative dashboard included?**
Yes. It covers bookings, approvals, payments, rooms, pricing, content, portfolio, SEO, reports and staff permissions.

**Are customer accounts included?**
Yes, in this version: booking history, payment status, receipts, payments of balances, and reschedule or cancellation requests.

**What hosting, domain, storage and maintenance costs will apply?**
See the cost table in the [operations guide](OPERATIONS.md). Hosting is $0 to $5 a month, plus Paystack fees per payment, the domain, and email only above 3,000 messages a month. Maintenance: **To confirm**.

**What is the estimated development timeline?**
The platform is built and running. Remaining time depends on supplying real content, keys and the domain. **To confirm.**

**How many design revisions are included?** **To confirm.**

**What warranty or post-launch bug-fixing period is included?** **To confirm.**

**Who will own the source code, design files, domain access and website content after final payment?**
**To confirm.** Technically everything can be handed over: the Git repository, the Figma files, the Cloudflare account (Worker, database, storage), the Paystack and Resend accounts and the domain should sit in the studio's own accounts at handover.

**Will the website be easy to expand with new services and features?**
Yes. New categories, services, rooms, packages and content are added from the dashboard. The code is layered (routes, services, repositories) so features such as beat sales or downloads can be added without a rebuild.

**Which features are excluded or attract additional charges?**
Not included: online sales of beats, products or merchandise, digital downloads and licensing, memberships, artist and producer profiles, automatic WhatsApp notifications (Meta charges per conversation), two-way external calendar sync, and content production such as copywriting and photography. Third-party fees (Paystack, domain, email above the free plan) are paid by the studio.
