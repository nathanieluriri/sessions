import type { CSSProperties } from "react";
import { Barcode, ScrambleText, Ticket, TicketPattern } from "./kitchen";
import { hrs } from "../lib/format";

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function BookingTicket({ kind, date, start, duration, artist, people, reference, paper = "#65f87c", ink = "#102200", className, style }: {
  kind: string; date: string; start: number; duration: number; artist?: string; people?: number; reference: string; paper?: string; ink?: string; className?: string; style?: CSSProperties;
}) {
  return (
    <Ticket className={className} style={style} paper={paper} ink={ink} stubHeight="23%" label={`${kind} session ticket, ${reference}`}
      body={
        <div className="tkt-body">
          <div className="tkt-micro"><span>Sessions · Studio A</span><span>Lagos · NG</span></div>
          <div className="tkt-art"><TicketPattern /></div>
          <div>
            <h3 className="tkt-title">{kind}<br />Session</h3>
            <p className="tkt-copy">{artist ? `${artist}. ` : ""}{hrs(duration)} with an engineer at 14 Admiralty Way, Lekki.</p>
          </div>
          <dl className="tkt-dl">
            <div><dt>Date</dt><dd>{date.slice(8)}.{date.slice(5, 7)}</dd></div>
            <div><dt>Start</dt><dd>{hhmm(start)}</dd></div>
          </dl>
        </div>
      }
      stub={
        <div className="tkt-stub">
          <div className="row">
            <div><span className="lbl">Admit</span><strong>{people && people > 1 ? people : "One"}</strong></div>
            <div style={{ textAlign: "right" }}><span className="lbl">Reference</span><strong className="ref"><ScrambleText>{reference}</ScrambleText></strong></div>
          </div>
          <Barcode />
        </div>
      }
    />
  );
}
