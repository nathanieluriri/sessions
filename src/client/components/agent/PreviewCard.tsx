import type { PendingChange } from "../../lib/agent";

export function PreviewCard({ pending, busy, onAccept, onDecline, onOther }: {
  pending: PendingChange;
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onOther: () => void;
}) {
  const p = pending.preview;
  return (
    <div className="agent-preview">
      <b className="small">{p.available ? p.title : "Preview"}</b>
      {p.where && <span className="caption">{p.where}</span>}
      {p.available ? (
        <div className="agent-preview-diff">
          {p.before != null && <div><span className="mono faint">Now</span><p>{p.before}</p></div>}
          {p.after != null && <div className="after"><span className="mono faint">After Accept</span><p>{p.after}</p></div>}
        </div>
      ) : (
        <p className="small">{p.note || "I tried to show a preview for this change but it wasn't available at this moment."}</p>
      )}
      {p.note && p.available && <p className="caption">{p.note}</p>}
      <div className="agent-preview-actions">
        <button type="button" className="agent-form-go" disabled={busy} onClick={onAccept}>{busy ? "Saving…" : "Accept"}</button>
        <button type="button" className="chip" disabled={busy} onClick={onDecline}>Decline</button>
        <button type="button" className="chip" disabled={busy} onClick={onOther}>Find another</button>
      </div>
    </div>
  );
}
