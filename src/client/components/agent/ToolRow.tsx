import { useState } from "react";
import { toolLabel, type AgentTable, type ToolResult } from "../../lib/agent";

const ONCE = new Set(["catalog_list", "enquiries_list", "payments_outstanding", "reports_overview"]);

function headline(summary: string): string {
  const line = summary.split(/\n/)[0]?.trim() ?? "";
  return line.length > 90 ? `${line.slice(0, 87)}…` : line;
}

function commandOf(t: ToolResult): string {
  const args = t.data?.args;
  if (!args) return t.tool;
  const bits = Object.entries(args)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
  return bits.length ? `${t.tool} ${bits.join(" ")}` : t.tool;
}

export function uniqueTools(list: ToolResult[]): ToolResult[] {
  const out: ToolResult[] = [];
  const seenOnce = new Set<string>();
  for (const t of list) {
    if (ONCE.has(t.tool)) {
      if (seenOnce.has(t.tool)) continue;
      seenOnce.add(t.tool);
    }
    const last = out[out.length - 1];
    if (last && last.tool === t.tool && last.summary === t.summary) continue;
    out.push(t);
  }
  return out;
}

export function tablesOf(list: ToolResult[] | undefined): AgentTable[] {
  if (!list?.length) return [];
  const out: AgentTable[] = [];
  for (const t of uniqueTools(list)) {
    const table = t.data?.table;
    if (table?.columns?.length && table.rows) out.push(table);
  }
  return out;
}

export function ResultTable({ table }: { table: AgentTable }) {
  return (
    <div className="agent-tablewrap">
      <table className="agent-table">
        <thead>
          <tr>{table.columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>{row.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ToolRow({ t }: { t: ToolResult }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const err = t.status === "error";
  const short = headline(t.summary);
  const cmd = commandOf(t);
  return (
    <div className={`agent-trow ${err ? "err" : ""} ${open ? "on" : ""}`}>
      <button type="button" className="agent-trow-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="agent-tdot" />
        <span className="agent-tname">{toolLabel(t.tool)}</span>
        <span className="agent-tsum">{short}</span>
        <span className="agent-tstat">{err ? "error" : "done"}</span>
      </button>
      {open && (
        <div className="agent-tbody">
          <div className="agent-tcmd"><span className="agent-tdollar">$ </span>{cmd}</div>
          <div className={`agent-tout ${showAll ? "all" : ""}`}>{t.summary}</div>
          <div className="agent-tfoot">
            <button type="button" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show less" : "Show all"}</button>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(t.summary).catch(() => undefined); }}>Copy</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ActivityBlock({ tools, running }: { tools?: ToolResult[]; running?: boolean }) {
  const [open, setOpen] = useState(true);
  const list = uniqueTools(tools ?? []);
  const count = running && list.length === 0 ? 1 : list.length;
  if (!count) return null;
  const steps = `${count} step${count === 1 ? "" : "s"}`;
  const names = [...new Set(list.map((t) => toolLabel(t.tool)))].join(", ");
  return (
    <div className="agent-activity">
      <button type="button" className="agent-activity-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`agent-tdot ${running ? "run" : ""}`} />
        <span>{open ? steps : `${steps} · ${names || "Working"}`}</span>
        <span className={`agent-chev ${open ? "on" : ""}`} />
      </button>
      {open && (
        <div className="agent-activity-list">
          {running && list.length === 0 && (
            <div className="agent-trow">
              <div className="agent-trow-btn">
                <span className="agent-tdot run" />
                <span className="agent-tname">Working</span>
                <span className="agent-tsum">Looking that up…</span>
                <span className="agent-tstat">running</span>
              </div>
            </div>
          )}
          {list.map((t, i) => <ToolRow key={`${t.tool}-${i}`} t={t} />)}
        </div>
      )}
    </div>
  );
}
