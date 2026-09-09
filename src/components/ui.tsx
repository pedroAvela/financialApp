import type { ReactNode } from "react";
import { Icon } from "@/components/icon";

export function Brand() {
  return <span className="brand"><span className="brand-mark"><Icon name="wallet" size={23} /></span><span>App <strong>Finanças</strong><small>Seu dinheiro, com clareza.</small></span></span>;
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div>{action}</div>;
}

export function Progress({ value, label, warning = false }: { value: number; label: string; warning?: boolean }) {
  return <div className={`progress ${warning ? "warning" : ""}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, Math.round(value)))}><span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}
