import type { ReactNode } from "react";

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`pbadge ${className ?? ""}`}><i aria-hidden />{children}</span>;
}
