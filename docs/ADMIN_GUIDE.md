# Admin guide

How to run Psych Records Entertainment day to day. Staff sign in at `/staff/login`. The CEO and COO see everything; other staff see only the areas they are granted in Staff.

## Daily routine

1. Open **Overview**. Check sessions today, booking requests waiting for approval and client reschedule or cancellation requests.
2. Decide every request before it expires. Undecided requests release their slot automatically (48 hours by default) and the client is told.
3. Check **Payments, Outstanding balances** (view payments) or the **Balance due** filter in Bookings, and chase balances before sessions.
4. After each session, mark it **Completed** or **No-show** from the booking. Sessions still marked confirmed are completed automatically the next day.

## Bookings

Open any booking from Bookings, Calendar, Clients or Overview. What you can do depends on its status:

| Status | Meaning | Actions |
| --- | --- | --- |
| Awaiting approval | A client sent a request. Nothing is charged and the slot is held. | Approve (sends a payment link), Decline, Confirm without payment |
| Awaiting payment | Approved. The client has a payment window (24 hours by default). | Email or copy the payment link, Record payment, Confirm without payment, Decline |
| Confirmed | Paid, part paid or confirmed by staff. | Record payment, payment link for the balance, Edit details, Reschedule, Cancel |
| Completed or No-show | The session has happened. | Record payment, switch between Completed and No-show |
| Cancelled or Declined | Closed. The time is free again. | None |

- **Approve**: add an optional note. The client gets an email with a secure link to pay the deposit or the full amount.
- **Confirm without payment**: only when studio policy allows it, for example pay on arrival or a label account. The amount stays as a balance.
- **Record payment**: for cash, bank transfer or POS. Enter the amount actually received. A receipt is emailed. Recording a payment on a request or approval confirms it.
- **Payment link**: emails a secure link for whatever is due. Copy link lets you send it by WhatsApp.
- **Cancel**: the refund follows the cancellation policy on what the client paid (100% at 72 hours or more, 50% from 24 to 72 hours, nothing under 24 hours), or tick full refund for studio-initiated cancellations. Online payments are refunded through Paystack automatically. Cash and transfer payments are flagged so you can return them by hand.
- **Reschedule**: pick an open time in the same room. The client is emailed.

### Bookings by phone, WhatsApp or walk-in

Bookings, **New booking**: choose the service and package, pick an open slot (or enter a time manually to go outside opening hours), add the client's name and phone, and optionally an email. Choose **Confirmed**, or **Awaiting payment** to hold the slot and send a payment link. Tick **Record a payment now** if they already paid. The system still refuses times that clash in that room.

## Calendar and availability

- **Calendar** shows each week with bookings, live checkout holds, requests and blocked time. Filter by room. Click a booking to open it.
- **Availability** sets opening hours, the changeover buffer between sessions, the checkout hold length, minimum notice and how far ahead clients can book. **Block time** closes one room or every room for maintenance or private events. You cannot block time that already has a booking; move or cancel it first.

## Services and pricing

- **Packages**: price, duration, room, category, what is included, deposit and whether the studio must approve it. Choose **Priced by quote** for work like music videos; those show a Request a quote button instead of a price. Price changes only apply to new bookings.
- **Services**: each service has its own page with a summary, full description, deliverables, duration, price label, image and gallery. A service shows the packages from its category.
- **Rooms**: name, type, description, photo, capacity, extra hour rate and features. Every room has its own calendar.
- **Categories**: group services and packages (Music and audio, Video production and so on). Add a category to introduce a new line of work without a redesign.
- **Extras**: add-ons clients can tick at checkout, optionally only for one category.
- **Deposits and approvals**: the default deposit percentage, whether every booking needs approval, how long requests and approvals wait, reminder timing and the default extra hour rate.

## Website content

Website (needs the edit content permission):

- **Pages**: home hero badge, headline and intro text (the last word of the second line shows in green), the How it works photo (shown as a pixel mosaic behind the app preview), About us (background, vision, mission, philosophy, why work with us, photo), Studio intro and the virtual tour link. A live announcement replaces the hero badge while it runs.
- **Business and contact**: name, legal name, phone, email (also the reply-to address on emails), WhatsApp number, address, map location and social links.
- **Portfolio**: projects with a cover image and an optional YouTube, Vimeo, Spotify or SoundCloud link. Featured projects show on the home page.
- **Team**, **Equipment and gallery**, **Testimonials**, **FAQs**: add, edit, reorder (lower order numbers show first), hide or remove.
- **Announcements**: the newest live one shows as a bar across the site. Set start and end dates for offers.
- **Policies and legal**: booking policies (accepted at checkout and versioned) and the Privacy and Terms pages. Use blank lines for paragraphs, `## ` for headings and `- ` for bullet points.
- **SEO and analytics**: site title and description, share image, page titles and descriptions, Cloudflare Web Analytics or Google Analytics, Search Console verification and the search indexing switch.

Images: click **Upload** next to any image field. Photos are resized in the browser before upload so pages stay fast. Use the caption field on gallery photos; it is also the description screen readers and search engines read.

## Enquiries and quotes

Contact form messages and quote requests arrive in **Enquiries** and by email to staff with the assist clients permission. Reply by email from the dashboard, open WhatsApp, and close them when done. The client gets an automatic acknowledgement.

## Clients

**Clients** lists everyone who has booked or registered, with bookings, booked value, paid and outstanding balance. Open a client to see their full history and contact them on WhatsApp.

## Verify payment (verify payments)

When a client shows a payment reference code (it starts with `PR`), open **Verify payment** and look it up. You see the amount, client, booking and method.

- **Validate payment** marks a paid reference as checked by you, with the time.
- If the online payment is still pending, the button first asks the payment provider. The booking is confirmed only when the provider says it was paid in full for the right amount. If it was not, the page says so and the payment must not be accepted.

## Online booking (turn booking categories on or off)

**Online booking** lists the categories. A closed category stays on the website with a quote button, but clients cannot book it online. Staff can still add bookings for it by hand. Music and audio is open; video, podcast and photography are closed.

## Payments and reports (view payments, view reports)

- **Payments**: every online and recorded payment with its type (deposit, full, balance, recorded), method and refunds, and the list of outstanding balances.
- **Reports**: booked value, collected, outstanding, utilisation, repeat clients, value by week, popular packages, revenue by category and use of each room. **Export CSV** downloads every booking in the range with paid and balance columns.

## Staff and permissions (manage staff)

Create staff accounts here; there is no public staff sign up. The new staff member gets a temporary password by email. Pick a role to fill in its usual permissions, then adjust them.

| Role | Usual permissions |
| --- | --- |
| CEO, COO | Everything |
| Accountant | View calendar, record payments, verify payments, view payments, view reports |
| Receptionist | View calendar, manage bookings, update booking details, verify payments, assist clients |
| Developer | Edit content, turn booking categories on or off, view audit log, manage staff |

| Permission | Allows |
| --- | --- |
| View calendar | Calendar, bookings, holds, blocked time and client history |
| Manage bookings | Create, approve, decline, reschedule, cancel and complete bookings, decide client requests |
| Update booking details | Edit people, notes, project and contact phone |
| Record payments | Record cash or transfer payments and send payment links |
| Verify payments | Look up payment reference codes and validate them |
| View payments | Every payment and outstanding balance |
| View reports | Financial reports and CSV export |
| Assist clients | Enquiries and quote requests |
| Edit availability | Opening hours, buffers and blocked time |
| Edit packages | Services, packages, rooms, categories, extras, deposits and approval rules |
| Turn booking categories on or off | Choose which categories clients can book online |
| Edit content | Website pages, portfolio, team, FAQs, policies, SEO and analytics |
| View audit log | Audit log and email outbox |
| Manage staff | Add staff and change their access |

Rules: nobody can change their own access. Only the CEO or COO can create or change a COO, or give out manage staff. Nobody can change the CEO account here. Anyone else with manage staff can only give permissions they have themselves. Every sensitive action is recorded in the **Audit log**, and every email the system sends is in the **Email outbox**.
