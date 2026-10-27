# Owner's brief (source of truth)

Verbatim intent from the studio owner, split into numbered requirements. Critics check the work against these literally. Where two sources disagree, the assumption made is listed in the Decisions section of GAUNTLET.md.

## Their words (condensed, nothing added)

Traditional studios use email to send finished products but we want everything to go through our portal for transparency and payments, we do not want our producers to do back deals. The user section interface should be easy to operate, not complicated. After recording, the music is mixed and mastered, the final product is then uploaded from our end, the artist is notified that their song is ready, and then they download it from their own end. On our backend we should also be able to upload media and deliver it to the artist when they log into their own portal. On the user portal they should be able to upload files (media) which we can download from our backend.

We can put EP at 1.5m and Album at 2.5m. It will be a premium service that comes with accommodation for the period. It will be an unlimited studio session, provided the number of songs are recorded, mixed and mastered. We will offer a discount on this and add some extra packages like album art, independent distribution (optional), PR campaign etc. and other perks.

Exclusive offers: 1. Produce your EP (5 tracks) 2. Produce your LP/album (12 tracks).

Mixing and mastering has two options and different pricing: 1. Express (1 day) 2. Standard (7 days). This is for music only.

Prices: Session (2 hours) 80k. Beats 100k. Mixing and mastering 100k. A category called "Full Production" which includes beats, 6 hours session, mixing and mastering.

Saturday 11pm to 5am Sunday: call this "All night session", it is for Saturday only. Saturday night is for night session and it is 6 hours from 11pm to 5am.

Recording sessions: 10am to 12noon, 12:30pm to 2pm, 2:30pm to 4:30pm, 5pm to 7pm. There should be 4 recording sessions every day.

Song arrangements is part of the package you get when you book a recording session. But composition is out of it. Composition is a whole different business entirely. Audio editing and vocal comping are also under mixing, no need having it separately. Vocal recording, rap and voice are all under the same umbrella: RECORDING.

Their drafted PRICING image: Full Production (per track) 280,000. Mixing & Mastering 170,000. Beat Production 100,000. Song Covers 50,000. Recording Session 80,000. (The naira sign renders as a black square in their draft.)

Their drafted TERMS & CONDITIONS image, General Terms: Maximum of 3 revisions for mixing & mastering. No refunds after job completion. Once work is delivered in all agreed formats, no further adjustments. Any additional work after completion requires new payment or renegotiation.

Two logo files were supplied (tiger head emblem, and the full PSYCH Records Entertainment lockup). "Replace the sessions logo with the Psych Records logo."

A screenshot of the current live booking page (mobile) was supplied. It shows the old service list: Vocal & rap recording, Beat production, Song arrangement and composition, Mixing, Mastering, Audio editing and vocal comping, Voice-over recording, Artist development. Saved at /tmp/claude-0/-home-user-sessions/e4158143-0612-583f-a6cc-25c7b8ce3d86/images/2.webp . Note the fixed navigation pills overlapping the page heading on a phone.

Finally: run the gauntlet loop, solve it properly, and deploy once done.

## Requirements

- R1 Everything goes through the portal. No email attachments, no producer back deals. Delivery is transparent and tied to payment.
- R2 The client (artist) side of the portal is easy to operate and not complicated.
- R3 Flow: record, mix and master, staff upload the final product, the artist is notified their song is ready, the artist downloads it from their own portal.
- R4 Staff can upload media in the admin and deliver it to the artist's portal.
- R5 Artists can upload files (media) in their portal, and staff can download them in the admin.
- R6 Exclusive offer "Produce your EP" (5 tracks) at 1,500,000 naira. Exclusive offer "Produce your LP / album" (12 tracks) at 2,500,000 naira.
- R7 EP and album are premium: accommodation for the period, and unlimited studio sessions provided the number of songs are recorded, mixed and mastered.
- R8 A discount mechanism for the premium offers, and extra packages: album art, independent distribution (optional), PR campaign, plus room for other perks.
- R9 Mixing and mastering has Express (1 day) and Standard (7 days) at different prices. Music only.
- R10 Recording session: 2 hours, 80,000 naira. Beat production 100,000. Mixing and mastering 100,000 (Standard) and 170,000 (Express). Song covers 50,000. Full production 280,000 per track.
- R11 Full production is a category/product that includes a beat, a 6 hour session, and mixing and mastering.
- R12 All night session: Saturday only, 11pm to 5am Sunday, 6 hours.
- R13 Four recording sessions every day at exactly: 10:00am to 12:00noon, 12:30pm to 2:00pm, 2:30pm to 4:30pm, 5:00pm to 7:00pm.
- R14 Song arrangement is included in the recording session package. Composition is not offered at all.
- R15 Audio editing and vocal comping live under mixing. No separate service.
- R16 Vocal recording, rap and voice-over are a single service called Recording.
- R17 Psych Records logo replaces the placeholder everywhere (nav, footer, loaders, dashboards, receipts, tickets, favicon, share image).
- R18 Terms in force: max 3 revisions for mixing and mastering; no refunds after job completion; no further adjustments once work is delivered in all agreed formats; additional work after completion needs new payment or renegotiation.
- R19 Deployed to production on Cloudflare.
- R20 House rules: no AI attribution anywhere (commits, code, docs, copy), no em dashes anywhere, code comments only when truly necessary, cost-effective choices (no new paid services, no new dependencies unless they clearly pay for themselves).
