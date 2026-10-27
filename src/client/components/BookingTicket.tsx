import type { CSSProperties } from "react";
import { Mark } from "./brand";
import { Barcode, ScrambleText, Ticket, TicketPattern } from "./kitchen";
import { hrs } from "../lib/format";
import { windowLabel } from "../lib/booking";

const hhmm = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function BookingTicket({ kind, scheduling, date, start, end, duration, slotLabel, dueDate, artist, people, reference, room = "Studio A", paper = "#65f87c", ink = "#0a0a0a", className, style }: {
  kind: string; scheduling?: string; date: string; start: number; end?: number; duration: number; slotLabel?: string; dueDate?: string | null; artist?: string; people?: number; reference: string; room?: string; paper?: string; ink?: string; className?: string; style?: CSSProperties;
}) {
  const remote = scheduling === "project", stay = scheduling === "day";
  const dm = (d: string) => `${d.slice(8)}.${d.slice(5, 7)}`;
  const copy = remote ? `${artist ? `${artist}. ` : ""}Finished work is delivered in your portal.`
    : stay ? `${artist ? `${artist}. ` : ""}Starts ${dm(date)}, with accommodation and unlimited sessions.`
    : `${artist ? `${artist}. ` : ""}${slotLabel ? `${slotLabel}, ` : ""}${end != null ? windowLabel(date, start, end) : hrs(duration)} in ${room}.`;
  return (
    <Ticket className={className} style={style} paper={paper} ink={ink} stubHeight="23%" label={`${kind} ${remote ? "order" : "session"} ticket, ${reference}`}
      body={
        <div className="tkt-body">
          <div className="tkt-micro"><span className="tkt-brand"><Mark tone="ink" size={24} /><span>Psych Studios{remote ? "" : ` · ${room}`}</span></span><span>Awka · NG</span></div>
          <div className="tkt-art"><TicketPattern /></div>
          <div>
            <h3 className="tkt-title">{kind}<br />{remote ? "Order" : stay ? "Request" : "Session"}</h3>
            <p className="tkt-copy">{copy}</p>
          </div>
          <dl className="tkt-dl">
            <div><dt>{remote ? "Ordered" : "Date"}</dt><dd>{dm(date)}</dd></div>
            {remote ? <div><dt>Due</dt><dd>{dueDate ? dm(dueDate) : "Portal"}</dd></div> : <div><dt>Start</dt><dd>{hhmm(start)}</dd></div>}
          </dl>
        </div>
      }
      stub={
        <div className="tkt-stub">
          <div className="row">
            <div><span className="lbl">{remote ? "Delivery" : "Admit"}</span><strong>{remote ? "Portal" : people && people > 1 ? people : "One"}</strong></div>
            <div style={{ textAlign: "right" }}><span className="lbl">Reference</span><strong className="ref"><ScrambleText>{reference}</ScrambleText></strong></div>
          </div>
          <Barcode />
        </div>
      }
    />
  );
}
