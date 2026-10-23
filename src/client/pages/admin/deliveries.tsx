import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Empty } from "../../components/Dash";
import { Loading, Tag } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { dateTime, naira, shortDate } from "../../lib/format";
import { BookingDrawer } from "./bookings";
import { useApi } from "./kit";

type Tab = "todo" | "revisions" | "client" | "delivered";
const TABS: [Tab, string, string][] = [
  ["todo", "To deliver", "Paid orders and sessions waiting for finished files."],
  ["revisions", "Revision requests", "Artists who asked for changes. Deliver an updated version to close the request."],
  ["client", "Client uploads", "Files artists sent that nobody has downloaded yet."],
  ["delivered", "Delivered", "Finished work waiting for the artist's approval or the 7 day auto-complete."],
];
const EMPTY: Record<Tab, string> = {
  todo: "Nothing waiting. New paid orders show up here.",
  revisions: "No open revision requests.",
  client: "No new files from artists.",
  delivered: "Nothing is out for approval.",
};

function Row({ r, tab, onOpen }: { r: any; tab: Tab; onOpen: () => void }) {
  const remote = r.scheduling === "project";
  return (
    <button type="button" className="qrow" onClick={onOpen} aria-label={`Open ${r.ref} for ${r.artist_name}`}>
      <div className="qmain">
        <div className="row gap8 wrapflex"><b>{r.artist_name}</b><span className="mono faint">{r.ref}</span></div>
        <span className="small muted">{r.package_name}{remote ? "" : ` · ${shortDate(r.date)}`}</span>
        {tab === "revisions" && r.open_revision && <span className="small qnote">“{r.open_revision.note.length > 140 ? `${r.open_revision.note.slice(0, 140)}...` : r.open_revision.note}”</span>}
      </div>
      <div className="qdue">
        {r.due_date ? <span className="small">Due {shortDate(r.due_date)}</span> : <span className="small muted">{remote ? "No due date" : "Session"}</span>}
        {r.overdue && <Tag tone="danger">Overdue</Tag>}
      </div>
      <div className="qtags">
        {r.balance_kobo > 0 && <Tag tone="warning">{naira(r.balance_kobo)} due</Tag>}
        {r.open_revision && tab !== "revisions" && <Tag tone="warning">Revision open</Tag>}
        {r.open_revision && tab === "revisions" && <Tag tone="warning">{dateTime(r.open_revision.created_at)}</Tag>}
        {r.counts.staged > 0 && <Tag>{r.counts.staged} staged</Tag>}
        {r.counts.delivered > 0 && <Tag tone="success">{r.counts.delivered} delivered</Tag>}
        {r.counts.uploads > 0 && <Tag tone={r.counts.uploads_new > 0 ? "brand" : ""}>{r.counts.uploads} from artist{r.counts.uploads_new > 0 ? `, ${r.counts.uploads_new} new` : ""}</Tag>}
        {r.revision_limit > 0 && r.counts.delivered > 0 && <Tag>{r.revisions_used} of {r.revision_limit} revisions</Tag>}
      </div>
    </button>
  );
}

export function Deliveries() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "todo");
  const [d, load] = useApi<any>(`/admin/deliveries?tab=${tab}`);
  const [open, setOpen] = useState<string | null>(null);
  const pick = (t: Tab) => { setTab(t); setParams(t === "todo" ? {} : { tab: t }, { replace: true }); };
  const info = TABS.find((x) => x[0] === tab)!;
  return <>
    <div className="chips" role="tablist" aria-label="Production queue">
      {TABS.map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={tab === k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => pick(k)}>
          {l}<span className={`count ${d && d.counts[k] > 0 ? "has" : ""}`}>{d ? d.counts[k] : "-"}</span>
        </button>
      ))}
    </div>
    <span className="small muted">{info[2]}</span>
    {!d || d.tab !== tab ? <Loading /> : d.rows.length === 0 ? <Empty>{EMPTY[tab]}</Empty> : (
      <div className="stack gap8 queue" role="tabpanel">{d.rows.map((r: any) => <Row key={r.id} r={r} tab={tab} onOpen={() => setOpen(r.id)} />)}</div>
    )}
    {open && <BookingDrawer id={open} user={user} tab="files" onClose={() => setOpen(null)} onChange={load} />}
  </>;
}
