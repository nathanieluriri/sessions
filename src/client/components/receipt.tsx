import { Mark } from "./brand";
import { dateTime, naira, shortDate, timeRange } from "../lib/format";
import { useContent } from "../lib/catalog";

export interface ReceiptData {
  payment: { reference: string; amount_kobo: number; channel: string | null; provider: string; kind: string; paid_at: string | null; refunded_kobo: number; receipt_token?: string | null };
  booking: {
    ref: string; service_name: string; package_name: string; package_price_kobo: number; extras: { slug?: string; name: string; price: number }[];
    total_kobo: number; amount_paid_kobo: number; refunded_kobo: number; date: string; start_min: number; end_min: number;
    room_name: string; scheduling: string; slot_label: string; due_date: string | null; contact_name: string; policy_version: number; status: string;
  };
}

const METHOD: Record<string, string> = { cash: "Cash", transfer: "Bank transfer", pos: "POS", card: "Card", bank_transfer: "Bank transfer", ussd: "USSD" };

export function ReceiptCard({ d, studio }: { d: ReceiptData; studio?: string }) {
  const site = useContent();
  const c = site?.content ?? {};
  const name = studio ?? c.business_name ?? "Psych Studios";
  const { payment: p, booking: b } = d;
  const paidNet = b.amount_paid_kobo - b.refunded_kobo;
  const balance = Math.max(0, b.total_kobo - paidNet);
  const remote = b.scheduling === "project";
  const when = remote ? (b.due_date ? `Starts ${shortDate(b.date)} · due ${shortDate(b.due_date)}` : `Ordered ${shortDate(b.date)}`) : `${shortDate(b.date)} · ${timeRange(b.date, b.start_min, b.end_min)}`;
  return (
    <div className="receipt-card card stack gap12" style={{ maxWidth: 480 }}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div className="row gap12">
          <Mark tone="ink" size={36} />
          <div>
            <b style={{ fontSize: 18 }}>{name}</b>
            <div className="caption">{[c.studio_address, c.contact_phone].filter(Boolean).join(" · ") || "Official payment receipt"}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="mono faint" style={{ fontSize: 11 }}>RECEIPT</div>
          <b className="mono">{p.reference}</b>
        </div>
      </div>
      <div className="divider" />
      <div className="stack gap8 small">
        <div className="row between"><span className="muted">Booking</span><b>{b.ref}</b></div>
        <div className="row between"><span className="muted">Client</span><span>{b.contact_name}</span></div>
        <div className="row between"><span className="muted">Session</span><span style={{ textAlign: "right" }}>{b.service_name === b.package_name ? b.package_name : `${b.service_name} · ${b.package_name}`}{b.slot_label ? ` (${b.slot_label})` : ""}<br /><span className="caption">{when}{remote ? "" : ` · ${b.room_name}`}</span></span></div>
      </div>
      <div className="divider" />
      <div className="stack gap8 small">
        <div className="row between"><span className="muted">{b.package_name}</span><span>{naira(b.package_price_kobo)}</span></div>
        {b.extras.map((e) => <div key={e.slug ?? e.name} className="row between"><span className="muted">{e.name}</span><span>{naira(e.price)}</span></div>)}
        <div className="row between"><b>Total</b><b>{naira(b.total_kobo)}</b></div>
        <div className="row between"><span className="muted">Paid so far</span><span>{naira(paidNet)}</span></div>
        {balance > 0 && <div className="row between"><span className="muted">Balance due</span><b>{naira(balance)}</b></div>}
      </div>
      <div className="divider" />
      <div className="stack gap4 small">
        <div className="row between"><b>This payment</b><b style={{ fontSize: 18 }}>{naira(p.amount_kobo)}</b></div>
        <div className="row between"><span className="muted">Method</span><span>{p.provider === "manual" ? `${METHOD[p.channel ?? ""] ?? p.channel} (at the studio)` : `${p.provider === "demo" ? "Test payment" : "Paystack"}${p.channel ? ` · ${METHOD[p.channel] ?? p.channel}` : ""}`}</span></div>
        <div className="row between"><span className="muted">Date</span><span>{p.paid_at ? dateTime(p.paid_at) : ""}</span></div>
        {p.refunded_kobo > 0 && <div className="row between"><span className="muted">Refunded</span><span>{naira(p.refunded_kobo)}</span></div>}
      </div>
      <span className="caption" style={{ textAlign: "center" }}>Thank you for choosing {name}. Policy version {b.policy_version} applies.</span>
    </div>
  );
}
