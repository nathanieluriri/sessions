import { useEffect, useMemo, useState } from "react";
import { agentCatalog, type AgentCatalog, type AgentFormKind } from "../../lib/agent";

export function AgentForm({ kind, busy, onSubmit }: { kind: AgentFormKind; busy?: boolean; onSubmit: (values: Record<string, unknown>, label: string) => void }) {
  const [cat, setCat] = useState<AgentCatalog | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { agentCatalog().then(setCat).catch(() => setErr("Could not load the catalogue.")); }, []);
  if (err) return <p className="muted small">{err}</p>;
  if (!cat) return <p className="muted small">Loading the form…</p>;
  if (kind === "booking") return <BookingFields cat={cat} busy={busy} onSubmit={onSubmit} />;
  if (kind === "quote") return <QuoteFields cat={cat} busy={busy} onSubmit={onSubmit} />;
  if (kind === "price") return <PriceFields cat={cat} busy={busy} onSubmit={onSubmit} />;
  return <PaymentFields busy={busy} onSubmit={onSubmit} />;
}

function BookingFields({ cat, busy, onSubmit }: { cat: AgentCatalog; busy?: boolean; onSubmit: (values: Record<string, unknown>, label: string) => void }) {
  const [service, setService] = useState("");
  const [pkgId, setPkgId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [artist, setArtist] = useState("");
  const [status, setStatus] = useState("confirmed");
  const [notify, setNotify] = useState(true);
  const [amount, setAmount] = useState("");
  const pkgs = useMemo(() => {
    const svc = cat.services.find((s) => s.slug === service);
    return cat.packages.filter((p) => !svc || (p.service_slug ? p.service_slug === svc.slug : p.service_category === svc.category));
  }, [cat, service]);
  const pkg = pkgs.find((p) => p.id === pkgId);
  const remote = pkg?.scheduling === "project";
  const quote = pkg?.pricing === "quote";
  return (
    <form className="agent-form" onSubmit={(e) => {
      e.preventDefault();
      if (!service || !pkgId || !name || !phone || (quote && !amount) || (!remote && (!date || !time))) return;
      onSubmit({
        service, package: pkgId, contact_name: name, contact_phone: phone, contact_email: email || undefined,
        artist_name: artist || name, date: remote ? date || undefined : date, time: remote ? undefined : time,
        status, notify, amount_ngn: quote ? Number(amount) : undefined,
      }, `Book ${name} · ${pkg?.name}`);
    }}>
      <b className="small">New booking</b>
      <label>Service
        <select value={service} onChange={(e) => { setService(e.target.value); setPkgId(""); }} required>
          <option value="">Choose…</option>
          {cat.services.map((s) => <option key={s.slug} value={s.slug}>{s.name}{s.price_label ? ` · ${s.price_label}` : ""}</option>)}
        </select>
      </label>
      <label>Package
        <select value={pkgId} onChange={(e) => setPkgId(e.target.value)} required disabled={!service}>
          <option value="">Choose…</option>
          {pkgs.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.price_label}</option>)}
        </select>
      </label>
      {!remote && <div className="agent-form-row">
        <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
        <label>Start<input type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></label>
      </div>}
      {remote && <label>Start date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>}
      {quote && <label>Quoted total (₦)<input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>}
      <div className="agent-form-row">
        <label>Client name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} required /></label>
      </div>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Needed to email them" /></label>
      <label>Artist / project<input value={artist} onChange={(e) => setArtist(e.target.value)} /></label>
      <label>Status
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="confirmed">Confirmed</option>
          <option value="approved">Approved — they still need to pay</option>
        </select>
      </label>
      <label className="agent-check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email the client</label>
      <button type="submit" className="agent-form-go" disabled={busy}>{busy ? "Saving…" : "Create booking"}</button>
    </form>
  );
}

function QuoteFields({ cat, busy, onSubmit }: { cat: AgentCatalog; busy?: boolean; onSubmit: (values: Record<string, unknown>, label: string) => void }) {
  const [service, setService] = useState("");
  const [pkgId, setPkgId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState("");
  const [create, setCreate] = useState(true);
  const pkgs = useMemo(() => {
    const svc = cat.services.find((s) => s.slug === service);
    return cat.packages.filter((p) => !svc || (p.service_slug ? p.service_slug === svc.slug : p.service_category === svc.category));
  }, [cat, service]);
  return (
    <form className="agent-form" onSubmit={(e) => {
      e.preventDefault();
      if (!service || !name || !email || !amount) return;
      onSubmit({
        name, email, phone: phone || undefined, service, package: pkgId || undefined,
        amount_ngn: Number(amount), details: details || undefined, create_booking: create,
      }, `Quote ₦${Number(amount).toLocaleString("en-NG")} for ${name}`);
    }}>
      <b className="small">Send a quote</b>
      <p className="muted small">You set the price. We email the client when you submit.</p>
      <label>Service
        <select value={service} onChange={(e) => { setService(e.target.value); setPkgId(""); }} required>
          <option value="">Choose…</option>
          {cat.services.map((s) => <option key={s.slug} value={s.slug}>{s.name}{s.price_label ? ` · ${s.price_label}` : ""}</option>)}
        </select>
      </label>
      <label>Package (optional)
        <select value={pkgId} onChange={(e) => setPkgId(e.target.value)} disabled={!service}>
          <option value="">Any / none</option>
          {pkgs.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.price_label}</option>)}
        </select>
      </label>
      <label>Quoted total (₦)<input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
      <label>What's included<textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Deliverables, timeline, revisions…" /></label>
      <div className="agent-form-row">
        <label>Client name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      </div>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label className="agent-check"><input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} /> Create an approved booking at this price so they can pay</label>
      <button type="submit" className="agent-form-go" disabled={busy}>{busy ? "Sending…" : "Email quote"}</button>
    </form>
  );
}

function PaymentFields({ busy, onSubmit }: { busy?: boolean; onSubmit: (values: Record<string, unknown>, label: string) => void }) {
  const [ref, setRef] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("transfer");
  const [note, setNote] = useState("");
  return (
    <form className="agent-form" onSubmit={(e) => {
      e.preventDefault();
      if (!ref || !amount) return;
      onSubmit({ ref: ref.trim(), amount_ngn: Number(amount), method, note: note || undefined }, `Record ₦${Number(amount).toLocaleString("en-NG")} on ${ref.trim()}`);
    }}>
      <b className="small">Record a payment</b>
      <label>Booking reference<input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="PR-…" required /></label>
      <div className="agent-form-row">
        <label>Amount (₦)<input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
        <label>Method
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="transfer">Transfer</option>
            <option value="cash">Cash</option>
            <option value="pos">POS</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <label>Note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bank reference (optional)" /></label>
      <button type="submit" className="agent-form-go" disabled={busy}>{busy ? "Saving…" : "Record payment"}</button>
    </form>
  );
}

function PriceFields({ cat, busy, onSubmit }: { cat: AgentCatalog; busy?: boolean; onSubmit: (values: Record<string, unknown>, label: string) => void }) {
  const [service, setService] = useState("");
  const [pkgId, setPkgId] = useState("");
  const [mode, setMode] = useState<"fixed" | "quote">("fixed");
  const [amount, setAmount] = useState("");
  const pkgs = useMemo(() => {
    const svc = cat.services.find((s) => s.slug === service);
    return cat.packages.filter((p) => !svc || (p.service_slug ? p.service_slug === svc.slug : p.service_category === svc.category));
  }, [cat, service]);
  return (
    <form className="agent-form" onSubmit={(e) => {
      e.preventDefault();
      if (!service || (mode === "fixed" && !amount)) return;
      const svc = cat.services.find((s) => s.slug === service);
      onSubmit({
        service, package: pkgId || undefined, amount_ngn: mode === "fixed" ? Number(amount) : undefined, quote: mode === "quote",
      }, mode === "quote" ? `Request a quote for ${svc?.name ?? service}` : `Price ${svc?.name ?? service} at ₦${Number(amount).toLocaleString("en-NG")}`);
    }}>
      <b className="small">Set a website price</b>
      <p className="muted small">Switch a service off Request a quote and onto a naira price. Past bookings keep what they paid.</p>
      <label>Service
        <select value={service} onChange={(e) => { setService(e.target.value); setPkgId(""); }} required>
          <option value="">Choose…</option>
          {cat.services.map((s) => <option key={s.slug} value={s.slug}>{s.name} · {s.price_label || "no label"}</option>)}
        </select>
      </label>
      <label>Package (optional)
        <select value={pkgId} onChange={(e) => setPkgId(e.target.value)} disabled={!service}>
          <option value="">Every package on this service</option>
          {pkgs.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.price_label}</option>)}
        </select>
      </label>
      <label>What to show
        <select value={mode} onChange={(e) => setMode(e.target.value as "fixed" | "quote")}>
          <option value="fixed">Fixed price on the website</option>
          <option value="quote">Request a quote</option>
        </select>
      </label>
      {mode === "fixed" && <label>Price (₦)<input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>}
      <button type="submit" className="agent-form-go" disabled={busy}>{busy ? "Saving…" : mode === "quote" ? "Switch to quote" : "Save price"}</button>
    </form>
  );
}
