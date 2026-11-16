const STARTERS = ["Create a booking", "Send a quote", "Change site copy", "What's on today?"];

/** Chips under the last answer. Empty when the form or a preview is already the next step. */
export function nextSteps(
  userText: string,
  tools: string[],
  pending?: { tool: string } | null,
  form?: string | null,
): string[] {
  if (pending) return pending.tool === "content_set" ? ["Find another place this appears"] : [];
  if (form) return [];
  const q = userText.toLowerCase();
  if (tools.includes("catalog_set_price")) return [];
  if (tools.includes("catalog_list")) {
    return ["Send a quote to a client", "Put a naira price on one of these", "What's on today?"];
  }
  if (tools.includes("quotes_send") || tools.includes("quotes_form")) {
    return ["Record a payment", "What's on today?"];
  }
  if (tools.includes("content_find") || tools.includes("content_set")) {
    return ["Change another field", "What's on today?"];
  }
  if (tools.includes("bookings_create") || tools.includes("bookings_list") || tools.includes("bookings_get")) {
    return ["Record a payment", "Send a quote"];
  }
  if (tools.includes("payments_outstanding") || tools.includes("reports_overview") || tools.includes("payments_record")) {
    return ["Record a payment", "What's on today?"];
  }
  if (tools.includes("enquiries_list")) {
    return ["Send a quote to a client", "What's on today?"];
  }
  if (tools.length === 0 && (/^(hi|hello|hey|help)\b/.test(q) || q.length < 16)) return STARTERS;
  return [];
}

export { STARTERS };
