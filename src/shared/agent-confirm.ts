export type PendingLike = {
  tool: string;
  args: Record<string, unknown>;
  preview?: {
    title?: string;
    where?: string;
    before?: string;
    after?: string;
    note?: string;
    available?: boolean;
  };
};

export type ToolLike = {
  tool: string;
  status: string;
  data?: { pending?: PendingLike };
};

const ACCEPT = /^(accept|accepted|yes|yep|yeah|ok|okay|confirm|confirmed|save|apply|do it|go ahead|ship it|looks good|approved)(\s+(it|that|this|the preview|the change))?$/;
const DECLINE = /^(decline|no|nope|cancel|never mind|nevermind|don't|dont|stop|reject|discard)(\s+(it|that|this|the preview|the change))?$/;

function norm(text: string): string {
  return text.trim().toLowerCase().replace(/[.!]+$/g, "").replace(/\s+/g, " ").replace(/^please\s+/, "").replace(/\s+please$/, "");
}

export function isAccept(text: string): boolean {
  const q = norm(text);
  return ACCEPT.test(q) || q === "accept the preview";
}

export function isDecline(text: string): boolean {
  const q = norm(text);
  return DECLINE.test(q) || q === "decline the preview";
}

export function parseNaira(raw: string): number | null {
  const t = raw.toLowerCase().replace(/[₦,\s]/g, "");
  const k = /^(\d+(?:\.\d+)?)k$/.exec(t);
  if (k) {
    const n = Number(k[1]) * 1000;
    return Number.isFinite(n) && n >= 1000 ? Math.round(n) : null;
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n < 1000 || n > 100_000_000) return null;
  return Math.round(n);
}

/** Pull a "set Music videos to ₦190,000" style request out of staff chat. */
export function priceChangeOf(text: string): { service: string; amount_ngn: number } | null {
  const q = text.replace(/\s+/g, " ").trim();
  const set = /(?:set|change|update|make|price)\s+(?:the\s+)?(?:price\s+(?:of|for)\s+)?(.+?)\s+(?:to|at|as)\s+(₦?[\d,.\s]+k?)/i.exec(q);
  if (set) {
    const amount = parseNaira(set[2]);
    const service = set[1].replace(/\bprice\b/gi, "").trim();
    if (amount && service.length >= 3) return { service, amount_ngn: amount };
  }
  const put = /(?:put|set)\s+(₦?[\d,.\s]+k?)\s+(?:on|for)\s+(.+)/i.exec(q);
  if (put) {
    const amount = parseNaira(put[1]);
    const service = put[2].replace(/[.?!]$/, "").trim();
    if (amount && service.length >= 3) return { service, amount_ngn: amount };
  }
  return null;
}

export function lastOpenPending(messages: { role: string; tool_results?: ToolLike[] }[]): PendingLike | undefined {
  let open: PendingLike | undefined;
  for (const m of messages) {
    if (m.role !== "assistant" || !m.tool_results) continue;
    for (const r of m.tool_results) {
      if (r.data?.pending?.tool) open = r.data.pending;
      else if (open && r.tool === open.tool && r.status === "ok") open = undefined;
    }
  }
  return open;
}

/** Last real staff request that looks like a price change (skips Accept / Decline lines). */
export function lastPriceRequest(messages: { role: string; text: string }[]): { service: string; amount_ngn: number } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (isAccept(m.text) || isDecline(m.text)) continue;
    return priceChangeOf(m.text);
  }
  return null;
}

export function pendingGist(p: PendingLike): string {
  const a = p.args ?? {};
  if (p.tool === "catalog_set_price") {
    const after = a.quote ? "Request a quote" : typeof a.amount_ngn === "number" ? `₦${Number(a.amount_ngn).toLocaleString("en-NG")}` : "a new price";
    return `${String(a.service || "This service")} → ${after}`;
  }
  if (p.tool === "content_set") return `${String(a.target || "Copy")} → ${String(a.value ?? "")}`;
  if (p.tool === "bookings_reschedule") return `${String(a.ref || "Booking")} → ${a.date ?? ""} ${a.time ?? ""}`.trim();
  if (p.tool === "bookings_cancel") return `Cancel ${String(a.ref || "booking")}`;
  return p.preview?.title || p.tool;
}
