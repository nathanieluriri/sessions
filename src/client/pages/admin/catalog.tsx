import { useEffect, useState } from "react";
import { Area, Btn, Field, Loading, Modal, Seg, Tag } from "../../components/ui";
import { HoldToConfirm } from "../../components/kitchen";
import { api } from "../../lib/api";
import { loadCatalog } from "../../lib/catalog";
import { hrs, naira } from "../../lib/format";
import { act, CollectionEditor, Tabs, useApi } from "./kit";

type Tab = "packages" | "services" | "rooms" | "categories" | "extras" | "rules";

export function Catalogue() {
  const [tab, setTab] = useState<Tab>("packages");
  const [d, load] = useApi<any>("/admin/catalog");
  const reload = () => { load(); loadCatalog(true); };
  if (!d) return <Loading />;
  const catOptions: [string, string][] = d.categories.map((c: any) => [c.slug, c.name]);
  return <>
    <Tabs value={tab} onChange={setTab} tabs={[["packages", "Packages"], ["services", "Services"], ["rooms", "Rooms"], ["categories", "Categories"], ["extras", "Extras"], ["rules", "Deposits and approvals"]]} />
    {tab === "packages" && <PackagesTab d={d} reload={reload} />}
    {tab === "services" && <CollectionEditor name="services" noun="service" intro={<span className="small muted">Each service gets its own page. Packages in the same category are shown on it.</span>}
      blank={{ name: "", category: catOptions[0]?.[0] ?? "music", description: "", details: "", deliverables: [], duration_label: "", price_label: "", image_url: "", gallery: [], active: 1 }}
      fields={[
        { key: "name", label: "Name" }, { key: "category", label: "Category", type: "select", options: catOptions },
        { key: "description", label: "Summary", type: "textarea", rows: 2 }, { key: "details", label: "Full description", type: "textarea", rows: 5 },
        { key: "deliverables", label: "Deliverables", type: "list" }, { key: "duration_label", label: "Estimated duration", hint: "For example: 2 to 3 working days" },
        { key: "price_label", label: "Price label", hint: "For example: From ₦40,000 / song, or Quote per project" },
        { key: "image_url", label: "Main image", type: "image" }, { key: "gallery", label: "Gallery image links", type: "list" }, { key: "active", label: "Live on the website", type: "bool" },
      ]}
      row={(s) => <div className="row gap12"><span className="rowthumb" style={{ backgroundImage: `url(${s.image_url})` }} /><div><b>{s.name}</b><div className="caption">{d.categories.find((c: any) => c.slug === s.category)?.name} · {s.price_label}</div></div></div>} />}
    {tab === "rooms" && <CollectionEditor name="rooms" noun="room" intro={<span className="small muted">Each room has its own calendar, so two rooms can be booked at the same time.</span>}
      blank={{ name: "", kind: "", description: "", image_url: "", capacity: 6, hourly_kobo: 2000000, features: [], active: 1 }}
      fields={[
        { key: "name", label: "Name" }, { key: "kind", label: "Type", hint: "For example: Recording room and control room" }, { key: "description", label: "Description", type: "textarea" },
        { key: "image_url", label: "Photo", type: "image" }, { key: "capacity", label: "Maximum people", type: "number" }, { key: "hourly_kobo", label: "Extra hour rate (₦)", type: "money" },
        { key: "features", label: "Features", type: "list" }, { key: "active", label: "Open for bookings", type: "bool" },
      ]}
      row={(r) => <div className="row gap12"><span className="rowthumb" style={{ backgroundImage: `url(${r.image_url})` }} /><div><b>{r.name}</b><div className="caption">{r.kind} · up to {r.capacity} · {naira(r.hourly_kobo)} per extra hour</div></div></div>} />}
    {tab === "categories" && <CollectionEditor name="categories" noun="category" intro={<span className="small muted">Categories group services on the website and decide which packages a service can book.</span>}
      blank={{ name: "", blurb: "" }} fields={[{ key: "name", label: "Name" }, { key: "blurb", label: "Short description", type: "textarea", rows: 2 }]}
      row={(c) => <div><b>{c.name}</b><div className="caption">{c.blurb}</div></div>} />}
    {tab === "extras" && <CollectionEditor name="extras" noun="extra" sortable={false} intro={<span className="small muted">Add-ons clients can tick at checkout. Leave the category empty to offer it everywhere.</span>}
      blank={{ name: "", price_kobo: 0, category: "", active: 1 }}
      fields={[{ key: "name", label: "Name" }, { key: "price_kobo", label: "Price (₦)", type: "money" }, { key: "category", label: "Category", type: "select", options: [["", "Every category"], ...catOptions] }, { key: "active", label: "Offered at checkout", type: "bool" }]}
      row={(e) => <div><b>{e.name}</b><div className="caption">{naira(e.price_kobo)} · {d.categories.find((c: any) => c.slug === e.category)?.name ?? "Every category"}</div></div>} />}
    {tab === "rules" && <Rules rules={d.rules} reload={reload} />}
  </>;
}

function PackagesTab({ d, reload }: { d: any; reload: () => void }) {
  const [edit, setEdit] = useState<any>(null);
  const blank = { name: "", description: "", category: "session", durationMin: 120, priceKobo: 0, includes: [], featured: false, active: true, serviceCategory: d.categories[0]?.slug ?? "music", roomId: d.rooms[0]?.id ?? null, pricing: "fixed", depositPercent: null, requiresApproval: false, priceNote: "" };
  const open = (p: any) => setEdit(p ? {
    id: p.id, name: p.name, description: p.description, category: p.category, durationMin: p.duration_min, priceKobo: p.price_kobo, includes: p.includes, featured: !!p.featured, active: !!p.active,
    serviceCategory: p.service_category, roomId: p.room_id, pricing: p.pricing, depositPercent: p.deposit_percent, requiresApproval: !!p.requires_approval, priceNote: p.price_note,
  } : blank);
  const depositMode = edit ? (edit.depositPercent === null ? "default" : edit.depositPercent === 0 ? "full" : "custom") : "default";
  return <>
    <div className="row between wrapflex gap12"><span className="small muted">Price changes apply to new bookings only. Past bookings keep the price they paid.</span><Btn size="sm" onClick={() => open(null)}>New package</Btn></div>
    {d.categories.map((c: any) => {
      const list = d.packages.filter((p: any) => p.service_category === c.slug);
      if (!list.length) return null;
      return (
        <div key={c.slug} className="stack gap8">
          <span className="mono faint">{c.name}</span>
          <div className="scrollx"><table className="table">
            <thead><tr><th>Package</th><th>Room</th><th>Duration</th><th>Price</th><th>Deposit</th><th>Confirmation</th><th>Status</th><th /></tr></thead>
            <tbody>{list.map((p: any) => (
              <tr key={p.id}>
                <td><b>{p.name}</b> {p.featured ? <Tag tone="brand">Featured</Tag> : null}<div className="caption">{p.description}</div></td>
                <td>{d.rooms.find((r: any) => r.id === p.room_id)?.name ?? "None"}</td><td>{p.pricing === "quote" ? "Varies" : hrs(p.duration_min)}</td>
                <td>{p.pricing === "quote" ? "Quote" : naira(p.price_kobo)}</td>
                <td>{p.pricing === "quote" ? "None" : p.deposit_percent === null ? `Default (${d.rules.depositPercent}%)` : p.deposit_percent === 0 ? "Pay in full" : `${p.deposit_percent}%`}</td>
                <td>{p.requires_approval || d.rules.requireApproval ? <Tag tone="warning">Approval</Tag> : <Tag tone="success">Automatic</Tag>}</td>
                <td><Tag tone={p.active ? "success" : ""}>{p.active ? "Live" : "Hidden"}</Tag></td>
                <td><button className="link small" onClick={() => open(p)}>Edit</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      );
    })}
    {edit && (
      <Modal title={edit.id ? "Edit package" : "New package"} onClose={() => setEdit(null)}>
        <Field label="Name" name="pname" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
        <Area label="Description" name="pdesc" rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
        <div className="grid cols-2" style={{ gap: 12 }}>
          <div className="field"><label>Category</label><select className="select" value={edit.serviceCategory} onChange={(e) => setEdit({ ...edit, serviceCategory: e.target.value })}>{d.categories.map((c: any) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></div>
          <div className="field"><label>Room</label><select className="select" value={edit.roomId ?? ""} onChange={(e) => setEdit({ ...edit, roomId: e.target.value || null })}><option value="">No room (quotes only)</option>{d.rooms.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        </div>
        <div className="field"><label>Pricing</label><Seg value={edit.pricing} onChange={(v) => setEdit({ ...edit, pricing: v })} options={[["fixed", "Fixed price, bookable online"], ["quote", "Priced by quote"]]} /></div>
        {edit.pricing === "fixed" ? <>
          <div className="grid cols-2" style={{ gap: 12 }}>
            <Field label="Price (₦)" name="price" type="number" value={edit.priceKobo / 100} onChange={(e) => setEdit({ ...edit, priceKobo: Math.round(Number(e.target.value) * 100) })} />
            <Field label="Duration (minutes)" name="dur" type="number" value={edit.durationMin} onChange={(e) => setEdit({ ...edit, durationMin: Number(e.target.value) })} />
          </div>
          <div className="field"><label>Deposit</label>
            <Seg value={depositMode} onChange={(v) => setEdit({ ...edit, depositPercent: v === "default" ? null : v === "full" ? 0 : edit.depositPercent || 50 })} options={[["default", `Default (${d.rules.depositPercent}%)`], ["full", "Pay in full"], ["custom", "Custom"]]} />
            {depositMode === "custom" && <Field label="Deposit percentage" name="dep" type="number" value={edit.depositPercent} onChange={(e) => setEdit({ ...edit, depositPercent: Math.min(100, Math.max(1, Number(e.target.value))) })} />}
          </div>
          <label className="row gap8 small"><input type="checkbox" checked={edit.requiresApproval} onChange={(e) => setEdit({ ...edit, requiresApproval: e.target.checked })} /> Needs studio approval before the client pays</label>
        </> : <Field label="Price note" name="pnote" value={edit.priceNote} onChange={(e) => setEdit({ ...edit, priceNote: e.target.value })} placeholder="Typically ₦800,000 to ₦3,000,000" />}
        <Area label="What is included (one per line)" name="inc" rows={3} value={edit.includes.join("\n")} onChange={(e) => setEdit({ ...edit, includes: e.target.value.split("\n").filter(Boolean).slice(0, 8) })} />
        <div className="field"><label>Type</label><Seg value={edit.category} onChange={(v) => setEdit({ ...edit, category: v })} options={[["session", "Session time"], ["post", "Session with post-production"]]} /></div>
        <label className="row gap8 small"><input type="checkbox" checked={edit.featured} onChange={(e) => setEdit({ ...edit, featured: e.target.checked })} /> Featured as most booked</label>
        <label className="row gap8 small"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Live on the website</label>
        <div className="row gap8 wrapflex">
          <Btn onClick={() => act(() => api("/admin/packages", { body: edit }), "Package saved", () => { setEdit(null); reload(); })}>Save package</Btn>
          {edit.id && <HoldToConfirm confirmed="Deleted" onConfirm={() => act(() => api(`/admin/packages/${edit.id}`, { method: "DELETE" }), "Package removed", () => { setEdit(null); reload(); })}>Hold to delete</HoldToConfirm>}
        </div>
      </Modal>
    )}
  </>;
}

function Rules({ rules, reload }: { rules: any; reload: () => void }) {
  const [f, setF] = useState(rules);
  useEffect(() => setF(rules), [rules]);
  return (
    <div className="grid cols-2" style={{ alignItems: "start" }}>
      <div className="card stack gap12">
        <h3 className="h4">Deposits</h3>
        <Field label="Default deposit (%)" name="dep" type="number" hint="Used by packages set to the default. 0 or 100 means pay in full." value={f.depositPercent} onChange={(e) => setF({ ...f, depositPercent: Number(e.target.value) })} />
        <Field label="Default extra hour rate (₦)" name="xh" type="number" hint="Rooms can set their own rate." value={f.extraHourKobo / 100} onChange={(e) => setF({ ...f, extraHourKobo: Math.round(Number(e.target.value) * 100) })} />
        <Field label="Session reminder (hours before)" name="rem" type="number" hint="Clients get a reminder email, with a payment link if a balance is due." value={f.reminderHours} onChange={(e) => setF({ ...f, reminderHours: Number(e.target.value) })} />
        <Field label="Default people limit" name="mp" type="number" hint="Rooms set their own limit; this applies when a room has none." value={f.maxPeople} onChange={(e) => setF({ ...f, maxPeople: Number(e.target.value) })} />
      </div>
      <div className="card stack gap12">
        <h3 className="h4">Approvals</h3>
        <div className="field"><label>How bookings are confirmed</label>
          {([[false, "Automatically after payment", "Packages marked as needing approval still wait for the studio."], [true, "Every booking needs approval", "Clients send requests and pay after you approve."]] as const).map(([v, t, d]) => (
            <button key={t} type="button" className={`opt ${f.requireApproval === v ? "on" : ""}`} onClick={() => setF({ ...f, requireApproval: v })}><span className="radio" /><span className="grow stack"><b className="small">{t}</b><span className="caption">{d}</span></span></button>
          ))}
        </div>
        <Field label="Requests expire after (hours)" name="rx" type="number" hint="If no one decides in time the slot is released and the client is told." value={f.requestExpiryHours} onChange={(e) => setF({ ...f, requestExpiryHours: Number(e.target.value) })} />
        <Field label="Time to pay after approval (hours)" name="pw" type="number" hint="Unpaid approvals are released after this." value={f.paymentWindowHours} onChange={(e) => setF({ ...f, paymentWindowHours: Number(e.target.value) })} />
        <span className="caption">An unpaid or unapproved request is never treated as confirmed. Staff can confirm without payment from the booking when policy allows.</span>
      </div>
      <div><Btn onClick={() => act(() => api("/admin/rules", { method: "PUT", body: f }), "Booking rules saved", reload)}>Save deposits and approvals</Btn></div>
    </div>
  );
}
