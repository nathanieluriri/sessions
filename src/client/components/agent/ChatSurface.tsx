import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { chat, formOf, getConversation, pendingOf, toolLabel, type AgentFormKind, type ChatResponse, type Message, type ToolResult } from "../../lib/agent";
import { Icon } from "../brand";
import { AgentForm } from "./AgentForm";
import { PreviewCard } from "./PreviewCard";
import { renderMarkdown } from "./markdown";

function ToolLine({ t }: { t: ToolResult }) {
  return (
    <div className={`agent-tool ${t.status === "error" ? "err" : ""}`}>
      <Icon name={t.status === "error" ? "lock" : "check"} size={13} />
      <span className="agent-tool-name">{toolLabel(t.tool)}</span>
      <span className="agent-tool-sum">{t.summary}</span>
    </div>
  );
}

async function readImage(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that picture.");
  ctx.drawImage(bmp, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.72);
}

export function ChatSurface({ conversationId, onConversationId, layout = "page" }: { conversationId?: string; onConversationId?: (id: string) => void; layout?: "panel" | "page" }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pics, setPics] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cid, setCid] = useState(conversationId);
  const prev = useRef<string | undefined>(undefined);
  const bottom = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => { setCid(conversationId); }, [conversationId]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  useEffect(() => {
    if (!cid) {
      setMessages([]);
      setError("");
      setLoading(false);
      prev.current = undefined;
      return;
    }
    const switching = Boolean(prev.current && prev.current !== cid);
    prev.current = cid;
    let alive = true;
    if (switching) setMessages([]);
    setLoading(true);
    getConversation(cid)
      .then((c) => { if (alive) { setMessages(c.messages); setError(""); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Could not open this chat."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [cid]);

  const adopt = (id: string) => {
    if (id && id !== cid) {
      prev.current = id;
      setCid(id);
      onConversationId?.(id);
    }
  };

  const asReply = (r: ChatResponse): Message => ({
    id: `local-${Date.now()}-a`,
    role: "assistant",
    text: r.text,
    steps: r.steps.map((s) => s.label),
    tool_results: r.toolResults,
    suggestions: r.suggestions,
    form: r.form,
    created_at: new Date().toISOString(),
  });

  const addPic = async (blob: Blob) => {
    try {
      const data = await readImage(blob instanceof File ? blob : new File([blob], "paste.jpg", { type: blob.type || "image/jpeg" }));
      setPics((p) => [...p, data].slice(0, 2));
    } catch { setError("Could not read that picture."); }
  };

  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.items].filter((i) => i.type.startsWith("image/")).map((i) => i.getAsFile()).filter(Boolean) as File[];
    if (!files.length) return;
    e.preventDefault();
    files.slice(0, 2).forEach((f) => { addPic(f); });
  };

  const post = async (label: string, body: Parameters<typeof chat>[0]) => {
    setBusy(true);
    setError("");
    const mine: Message = { id: `local-${Date.now()}`, role: "user", text: label, steps: [], tool_results: [], suggestions: [], created_at: new Date().toISOString() };
    setMessages((m) => [...m, mine]);
    try {
      const r = await chat({ ...body, conversationId: cid });
      setMessages((m) => [...m, asReply(r)]);
      adopt(r.conversationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "It did not work.");
    } finally {
      setBusy(false);
    }
  };

  const send = async (text: string) => {
    const value = text.trim();
    if ((!value && !pics.length) || busy) return;
    setInput("");
    const images = pics;
    setPics([]);
    await post(value || "Read this picture.", { message: value, images: images.length ? images : undefined });
  };

  const submitForm = (kind: AgentFormKind, values: Record<string, unknown>, label: string) => {
    if (busy) return;
    post(label, { form: { kind, values } });
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const openForm = lastAssistant ? formOf(lastAssistant) : undefined;
  const pending = lastAssistant ? pendingOf(lastAssistant) : undefined;
  const empty = messages.length === 0 && !busy && !loading;

  return (
    <div className={`agent-surface ${layout}`} onPaste={onPaste}>
      <div className="agent-scroll">
        {loading && empty && <p className="muted small" style={{ textAlign: "center", padding: 24 }}>Opening chat…</p>}
        {empty && !loading && !cid && (
          <div className="agent-empty">
            <span className="agent-mark"><Icon name="chat" size={22} /></span>
            <p><b>Studio assistant</b></p>
            <p className="muted">Create a booking, change site copy, or attach a screenshot. Edits show a preview first — Accept to save.</p>
          </div>
        )}
        {empty && !loading && cid && (
          <div className="agent-empty">
            <p className="muted">This chat has no saved messages yet. Send one below and it will stay here.</p>
          </div>
        )}
        {messages.map((m) => {
          const showForm = m.role === "assistant" && lastAssistant?.id === m.id && openForm;
          const showPreview = m.role === "assistant" && lastAssistant?.id === m.id && pending;
          return (
            <div key={m.id} className={`agent-msg ${m.role}`}>
              {m.role === "assistant" && <span className="agent-avatar"><Icon name="chat" size={15} /></span>}
              <div className="agent-bubble">
                {m.tool_results?.length > 0 && <div className="agent-tools">{m.tool_results.map((t, i) => <ToolLine key={i} t={t} />)}</div>}
                <div className="agent-text">{renderMarkdown(m.text)}</div>
                {showPreview && pending && (
                  <PreviewCard
                    pending={pending}
                    busy={busy}
                    onAccept={() => post("Accept the preview.", { confirm: { tool: pending.tool, args: pending.args } })}
                    onDecline={() => post("Decline the preview.", { decline: true })}
                    onOther={() => send("Find another place this appears.")}
                  />
                )}
                {showForm && openForm && <AgentForm kind={openForm} busy={busy} onSubmit={(values, label) => submitForm(openForm, values, label)} />}
                {m.suggestions?.length > 0 && (
                  <div className="agent-suggs">{m.suggestions.map((s, i) => <button key={i} type="button" className="chip" onClick={() => send(s)} disabled={busy}>{s}</button>)}</div>
                )}
              </div>
            </div>
          );
        })}
        {busy && <div className="agent-msg assistant"><span className="agent-avatar"><Icon name="chat" size={15} /></span><div className="agent-bubble"><span className="agent-dots">…</span></div></div>}
        {error && <div className="agent-msg error"><div className="agent-bubble">{error}</div></div>}
        <div ref={bottom} />
      </div>
      {pics.length > 0 && (
        <div className="agent-thumbs">
          {pics.map((src, i) => (
            <button key={i} type="button" className="agent-thumb" onClick={() => setPics((p) => p.filter((_, j) => j !== i))} aria-label="Remove picture">
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      )}
      <div className="agent-composer" onPaste={onPaste}>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) addPic(f);
        }} />
        <button type="button" className="agent-attach" onClick={() => file.current?.click()} disabled={busy} aria-label="Attach a picture">
          <Icon name="image" size={16} />
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask, paste a screenshot, or attach one…"
          rows={1}
          disabled={busy}
        />
        <button type="button" className="agent-send" onClick={() => send(input)} disabled={busy || (!input.trim() && !pics.length)} aria-label="Send">
          <Icon name="arrow" size={16} />
        </button>
      </div>
    </div>
  );
}
