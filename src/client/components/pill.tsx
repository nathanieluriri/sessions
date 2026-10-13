import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./brand";

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`pbadge ${className ?? ""}`}><i aria-hidden />{children}</span>;
}

export type PillKind = "dark" | "light" | "gray";

export function Pill({ to, href, kind = "dark", arrow, onClick, className, children }: {
  to?: string; href?: string; kind?: PillKind; arrow?: boolean; onClick?: () => void; className?: string; children: ReactNode;
}) {
  const cls = `pill ${kind} ${className ?? ""}`;
  const body = <>{children}{arrow && <Icon name="northeast" size={16} />}</>;
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  if (href) return <a href={href} className={cls} target="_blank" rel="noreferrer">{body}</a>;
  return <button type="button" className={cls} onClick={onClick}>{body}</button>;
}

/** The gradient outline that wraps the main calls to action. */
export function Ring({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`ring ${className ?? ""}`}>{children}</span>;
}
