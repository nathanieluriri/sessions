import { Fragment, type ReactNode } from "react";

function cells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function isSep(line: string): boolean {
  const parts = cells(line);
  return parts.length > 0 && parts.every((c) => /^:?-{3,}:?$/.test(c) || /^-+$/.test(c));
}

export function isRow(line: string): boolean {
  const t = line.trim();
  if (!t.includes("|")) return false;
  if (isSep(t)) return true;
  const c = cells(t);
  if (c.length >= 2 && c.some(Boolean)) return true;
  return /^\|/.test(t) && c.some((x) => x.length > 0);
}

/** Drop markdown tables when the UI already painted the same list from tool data. */
export function stripMdTables(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (let n = 0; n < lines.length; n++) {
    if (isRow(lines[n])) {
      while (n + 1 < lines.length && isRow(lines[n + 1])) n++;
      continue;
    }
    out.push(lines[n]);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Small, safe markdown renderer for the assistant. No raw HTML. */
export function renderMarkdown(text: string): ReactNode[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  let listKind: "ul" | "ol" | null = null;
  let i = 0;

  const flushList = () => {
    if (list.length === 0) return;
    const items = list;
    list = [];
    if (listKind === "ol") out.push(<ol key={`ol-${i++}`}>{items}</ol>);
    else out.push(<ul key={`ul-${i++}`}>{items}</ul>);
    listKind = null;
  };

  const inline = (s: string, key: string) => {
    const parts: ReactNode[] = [];
    const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = re.exec(s))) {
      if (m.index > last) parts.push(s.slice(last, m.index));
      const t = m[0];
      if (t.startsWith("**")) parts.push(<strong key={`${key}-${k++}`}>{t.slice(2, -2)}</strong>);
      else if (t.startsWith("`")) parts.push(<code key={`${key}-${k++}`}>{t.slice(1, -1)}</code>);
      else parts.push(<em key={`${key}-${k++}`}>{t.slice(1, -1)}</em>);
      last = m.index + t.length;
    }
    if (last < s.length) parts.push(s.slice(last));
    return <Fragment key={key}>{parts}</Fragment>;
  };

  for (let n = 0; n < lines.length; n++) {
    const trimmed = lines[n].trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    if (isRow(trimmed)) {
      flushList();
      const block = [trimmed];
      while (n + 1 < lines.length && isRow(lines[n + 1].trim())) {
        n++;
        block.push(lines[n].trim());
      }
      const body = block.filter((l) => !isSep(l));
      if (body.length && (body.length > 1 || cells(body[0]).length >= 2)) {
        const head = cells(body[0]);
        const rows = body.slice(1);
        out.push(
          <div key={`tb-${i++}`} className="agent-tablewrap">
            <table className="agent-table">
              <thead><tr>{head.map((c, ci) => <th key={ci}>{inline(c, `th-${i}-${ci}`)}</th>)}</tr></thead>
              {rows.length > 0 && (
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri}>{cells(row).map((c, ci) => <td key={ci}>{inline(c, `td-${i}-${ri}-${ci}`)}</td>)}</tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>,
        );
      } else {
        for (const line of body) out.push(<p key={`p-${i++}`}>{inline(line.replace(/^\|+\s*|\s*\|+$/g, ""), `p-${i}`)}</p>);
      }
      continue;
    }
    const ul = /^[-*•]\s+/.exec(trimmed);
    const ol = /^\d+[.)]\s+/.exec(trimmed);
    const heading = /^(#{1,4})\s+/.exec(trimmed);
    if (ul) {
      if (listKind !== "ul") { flushList(); listKind = "ul"; }
      list.push(<li key={`li-${i++}`}>{inline(trimmed.slice(ul[0].length), `t-${i}`)}</li>);
      continue;
    }
    if (ol) {
      if (listKind !== "ol") { flushList(); listKind = "ol"; }
      list.push(<li key={`li-${i++}`}>{inline(trimmed.slice(ol[0].length), `t-${i}`)}</li>);
      continue;
    }
    flushList();
    if (heading) {
      const level = heading[1].length;
      const content = inline(trimmed.slice(heading[0].length), `h-${i}`);
      out.push(level <= 2 ? <h4 key={`h-${i++}`}>{content}</h4> : <h5 key={`h-${i++}`}>{content}</h5>);
      continue;
    }
    out.push(<p key={`p-${i++}`}>{inline(trimmed, `p-${i}`)}</p>);
  }
  flushList();
  return out;
}
