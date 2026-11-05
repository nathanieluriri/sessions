import { useEffect, useState } from "react";
import { SlotPicker } from "../../components/Dash";
import { Area, Btn, ErrorBox, Field, Loading, Seg, Tag, toast } from "../../components/ui";
import { ReceiptCard, type ReceiptData } from "../../components/receipt";
import { api } from "../../lib/api";
import { can, useAuth } from "../../lib/auth";
import { useCatalog } from "../../lib/catalog";
import { hrs, lagosToday, naira } from "../../lib/format";

const SOURCE: Record<string, string> = { walk_in: "Walk-in", phone: "Phone", whatsapp: "WhatsApp", email: "Email", instagram: "Instagram", other: "Other" };
const toMin = (v: string) => { const [h, m] = v.split(":").map(Number); return h * 60 + (m || 0); };

/** One screen for the front desk: reserve the session, take the money, hand over a receipt. */
export function WalkIn() {
  const cat = useCatalog();
  const { user } = useAuth();
  const [f, setF] = useState({ serviceSlug: "", packageId: "", extraHours: 0, people: 1, artistName: "", contactName: "", contactEmail: "", contactPhone: "", project: "", notes: "", links: "", source: "walk_in", status: "confirmed" as "confirmed" | "approved", notify: false });
  const [slot, setSlot] = useState<{ date: string; start: number } | null>(null);
  const [manual, setManual] = useState(false);
  const [mt, setMt] = useState({ date: lagosToday(), time: "10:00" });
  const [pay, setPay] = useState({ on: true, amount: 0, method: "cash", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ booking: any; receipt: string | null; data: ReceiptData | null } | null>(null);
  const svc = cat?.services.find((s) => s.slug === f.serviceSlug);
  const pkgs = cat?.packages.filter((p) => p.service_category === svc?.category && p.pricing === "fixed") ?? [];
  const pkg = pkgs.find((p) => p.id === f.packageId);
  useEffect(() => { if (pkg) setPay((p) => ({ ...p, amount: p.amount || pkg.price_kobo })); }, [pkg]);
  if (!cat) return <Loading />;
  const room = cat.rooms.find((r) => r.id === pkg?.room_id);
  const duration = (pkg?.duration_min ?? 0) + f.extraHours * 60;
  const total = (pkg?.price_kobo ?? 0) + f.extraHours * (room?.hourly_kobo || cat.rules.extraHourKobo);
  const when = manual ? { date: mt.date, start: toMin(mt.time) } : slot;
  const canRecord = can(user, "record_payments");
  const reset = () => { setDone(null); setF({ ...f, artistName: "", contactName: "", contactEmail: "", contactPhone: "", project: "", notes: "", links: "" }); setSlot(null); setPay({ on: true, amount: 0, method: "cash", note: "" }); };
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api("/admin/bookings", { body: { ...f, extras: [], date: when?.date, start: when?.start, ignoreHours: manual, payment: pay.on && pay.amount > 0 ? { amount: pay.amount, method: pay.method, note: pay.note } : null } });
      const detail = await api(`/admin/bookings/${r.id}`);
      const receipt = pay.on && pay.amount > 0 ? (detail.receipts?.[0]?.url ?? null) : null;
      let data: ReceiptData | null = null;
      if (receipt) data = await api<ReceiptData>(`/receipts/${receipt.split("/").pop()}`);
      setDone({ booking: detail.booking, receipt, data });
      toast(`Booking ${r.ref} created`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  if (done) return (
    <div className="stack gap16" style={{ maxWidth: 560 }}>
      <div className="row gap8 wrapflex">
        <Tag tone="success">Reserved · {done.booking.ref}</Tag>
        {done.receipt && <Tag tone="success">Payment recorded</Tag>}
      </div>
      {done.data ? <ReceiptCard d={done.data} /> : <div className="panel small">No payment was recorded, so there is no receipt yet. Record a payment on the booking to print one.</div>}
      <div className="row gap8 wrapflex noprint">
        {done.data && <Btn kind="neutral" onClick={() => window.print()}>Print receipt</Btn>}
        {done.receipt && <Btn kind="neutral" onClick={async () => { await navigator.clipboard?.writeText(done.receipt!).catch(() => {}); toast("Receipt link copied"); }}>Copy receipt link</Btn>}
        <Btn onClick={reset}>New walk-in</Btn>
      </div>
    </div>
  );
  return (
    <div className="stack gap16" style={{ maxWidth: 640 }}>
      <span className="small muted">For a client standing at the desk: reserve the session, record what they paid, print or share the receipt. Clash checks still apply.</span>
      <div className="field"><label>Service</label>
        <select className="select" value={f.serviceSlug} onChange={(e) => setF({ ...f, serviceSlug: e.target.value, packageId: "" })}>
          <option value="">Choose a service</option>
          {cat.categories.map((c) => <optgroup key={c.slug} label={c.name}>{cat.services.filter((s) => s.category === c.slug).map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}</optgroup>)}
        </select>
      </div>
      {svc && <div className="field"><label>Package</label>
        <select className="select" value={f.packageId} onChange={(e) => { setF({ ...f, packageId: e.target.value }); setSlot(null); }}>
          <option value="">Choose a package</option>
          {pkgs.map((p) => <option key={p.id} value={p.id}>{p.name} · {cat.rooms.find((r) => r.id === p.room_id)?.name} · {naira(p.price_kobo)}</option>)}
        </select>
      </div>}
      {pkg && <>
        <div className="field"><label>Duration</label><Seg value={String(f.extraHours)} onChange={(v) => { setF({ ...f, extraHours: Number(v) }); setSlot(null); }} options={[0, 1, 2, 3].map((x) => [String(x), hrs(pkg.duration_min + x * 60)] as [string, string])} /></div>
        <label className="row gap8 small"><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /> Enter a time manually (allows times outside opening hours)</label>
        {manual
          ? <div className="grid cols-2" style={{ gap: 12 }}><Field label="Date" name="wdate" type="date" value={mt.date} onChange={(e) => setMt({ ...mt, date: e.target.value })} /><Field label="Start time" name="wtime" type="time" value={mt.time} onChange={(e) => setMt({ ...mt, time: e.target.value })} /></div>
          : <SlotPicker duration={duration} room={pkg.room_id} value={slot} onChange={setSlot} days={30} from={lagosToday()} />}
        <div className="grid cols-2" style={{ gap: 12 }}>
          <Field label="Client name" name="wname" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} />
          <Field label="Phone" name="wphone" value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} />
          <Field label="Email (optional)" name="wemail" type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} hint="Needed to email the receipt and any payment links." />
          <Field label="Artist or project" name="wartist" value={f.artistName} onChange={(e) => setF({ ...f, artistName: e.target.value })} />
          <Field label="People" name="wpeople" type="number" value={f.people} onChange={(e) => setF({ ...f, people: Number(e.target.value) })} />
          <div className="field"><label>Source</label><select className="select" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{Object.entries(SOURCE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        </div>
        <Area label="Project and requirements" name="wproject" rows={2} value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })} />
        <div className="field"><label>Status</label><Seg value={f.status} onChange={(v) => setF({ ...f, status: v as "confirmed" | "approved" })} options={[["confirmed", "Confirmed"], ["approved", "Awaiting payment"]]} /><span className="hint">{f.status === "approved" ? "Holds the slot and emails a payment link. It is released if not paid in time." : "Confirmed now. Any unpaid amount shows as a balance."}</span></div>
        {canRecord && <>
          <label className="row gap8 small"><input type="checkbox" checked={pay.on} onChange={(e) => setPay({ ...pay, on: e.target.checked })} /> Record a payment now</label>
          {pay.on && <div className="grid cols-2" style={{ gap: 12 }}>
            <Field label="Amount (₦)" name="wamount" type="number" value={pay.amount / 100} onChange={(e) => setPay({ ...pay, amount: Math.round(Number(e.target.value) * 100) })} />
            <div className="field"><label>Method</label><Seg value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} options={[["cash", "Cash"], ["transfer", "Transfer"], ["pos", "POS"]]} /></div>
            <Field label="Note (optional)" name="wnote" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} placeholder="Bank reference or receipt number" />
          </div>}
        </>}
        <label className="row gap8 small"><input type="checkbox" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} /> Email the client a confirmation</label>
        <div className="panel small row between"><span>{room?.name} · {hrs(duration)}</span><b>{naira(total)}</b></div>
      </>}
      <ErrorBox error={error} />
      <Btn disabled={busy || !pkg || !when || !f.contactName || !f.contactPhone || !f.artistName} onClick={submit}>{busy ? "Saving…" : "Reserve and finish"}</Btn>
    </div>
  );
}

/** Print any receipt from the admin dashboard. */
export function ReceiptLookup() {
  const [ref, setRef] = useState("");
  const [d, setD] = useState<{ data: ReceiptData; link: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const find = async () => {
    setBusy(true); setError(""); setD(null);
    try {
      const data = await api<ReceiptData>(`/admin/receipts?reference=${encodeURIComponent(ref.trim())}`);
      const token = (data.payment as any).receipt_token;
      setD({ data, link: token ? `${location.origin}/receipt/${token}` : "" });
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="stack gap16">
      <span className="small muted">Look up any paid reference (online or recorded at the studio) to print its receipt, or copy the link to send by WhatsApp.</span>
      <form className="row gap12 wrapflex" style={{ alignItems: "flex-end" }} onSubmit={(e) => { e.preventDefault(); find(); }}>
        <Field label="Payment reference" name="ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="PR… or PRM…" />
        <Btn type="submit" disabled={busy || !ref.trim()}>Look up</Btn>
      </form>
      {error && <div className="panel small">{error}</div>}
      {d && (
        <div className="stack gap16">
          <ReceiptCard d={d.data} />
          <div className="row gap8 wrapflex noprint">
            <Btn kind="neutral" onClick={() => window.print()}>Print</Btn>
            {d.link && <Btn kind="neutral" onClick={async () => { await navigator.clipboard?.writeText(d.link).catch(() => {}); toast("Receipt link copied"); }}>Copy receipt link</Btn>}
          </div>
        </div>
      )}
    </div>
  );
}
