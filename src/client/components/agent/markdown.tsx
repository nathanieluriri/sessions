import { Fragment, type ReactNode } from "react";

/** Small, safe markdown renderer for the assistant's plain-text answers. No raw HTML. */
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
    // bold, italic, inline code
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

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
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
