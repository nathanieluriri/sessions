/** Skills are always loaded. The model must use tools instead of claiming it cannot. */

const GOLDEN = `Skill — house style (always on):
A good answer is short and specific. Use a markdown table when listing more than two items.
Never say you lack access, cannot see the catalogue, cannot create a booking, cannot quote, or cannot send a receipt. Those tools exist. Call them.
If a field is missing for a write, call the matching *_form tool (bookings_form, quotes_form, payments_form, catalog_price_form) so the staff get a form. Do not dump a bullet list of "please send me…".`;

const COMPLETE = `Skill — finish the job (always on):
- If they asked for several things, do every one in this same turn.
- After tools run, the work is already done. Start with what happened. Name refs, amounts, emails.
- Never say "I'll create" or "I can't with my current tools" after a tool exists for it.
- If several bookings or clients could match, ask "Which one?" instead of guessing.`;

const CATALOG = `Skill — catalogue (always on):
To answer anything about services, packages, prices, or "request a quote", call catalog_list first.
A service whose price_label is "Request a quote" (or a package with pricing "quote") is quoted by staff — we set the price and email the client with quotes_form / quotes_send.
To put a naira price on the website instead of Request a quote, call catalog_set_price (or catalog_price_form if they have not named the amount). That flips the package to a fixed price and updates the service card. To switch it back, call catalog_set_price with quote: true.
Bookable packages have a naira price and can be reserved with bookings_form / bookings_create.`;

const BOOK = `Skill — book for a client (always on):
Staff book on behalf of a client (phone, WhatsApp, walk-in).
If they want to create a booking or "help the customer book", call bookings_form immediately so they get the form (service, package, date, client, notify).
If they already gave every field, call bookings_create.
Always email the client when notify is true (default).`;

const QUOTE = `Skill — we quote (always on):
Psych Studios writes the quote. The client does not name a price.
When they want to quote video/podcast/photography or any "request a quote" service, call quotes_form.
quotes_send emails the quote and, by default, creates an approved booking at that price with a payment link.`;

const PAY = `Skill — money (always on):
payments_record adds a payment (never deletes). It emails a receipt when the booking has an email.
receipts_send resends the receipt link. payments_link emails a Paystack link for the balance.
If they want to record a payment and you do not have ref + amount + method, call payments_form.`;

export function selectSkills(_message: string): string {
  return [GOLDEN, COMPLETE, CATALOG, BOOK, QUOTE, PAY].join("\n\n");
}

export const ALWAYS_ON_SKILLS = 6;
