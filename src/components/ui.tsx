import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import type { Decision } from "@/lib/ui-types";

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow"><span className="eyebrow-line" />{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  );
}

export function DecisionBadge({
  decision,
  small = false,
}: {
  decision: Decision | string;
  small?: boolean;
}) {
  return (
    <span className={`decision-badge decision-${decision.toLowerCase()} ${small ? "badge-small" : ""}`}>
      <i />
      {decision}
    </span>
  );
}

export function RiskBadge({ score }: { score: number }) {
  const color = score >= 75 ? "danger" : score >= 40 ? "warning" : "safe";
  return <span className={`risk-badge risk-${color}`}>{score}<small>/100</small></span>;
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = "mint",
  change,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone?: "mint" | "blue" | "orange" | "red" | "purple";
  change?: { value: string; positive?: boolean };
}) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        <span className={`metric-icon metric-icon-${tone}`}>{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-bottom">
        {change && (
          <span className={`metric-change ${change.positive ? "change-up" : "change-down"}`}>
            {change.positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {change.value}
          </span>
        )}
        <span>{detail}</span>
      </div>
      <div className={`metric-accent metric-accent-${tone}`} />
    </article>
  );
}

export function PanelHeading({
  title,
  note,
  action,
}: {
  title: string;
  note?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div><h2>{title}</h2>{note && <span>{note}</span>}</div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon"><ShieldCheck size={19} /></div>
      <b>{title}</b>
      <span>{detail}</span>
      <ChevronRight size={15} className="empty-chevron" />
    </div>
  );
}

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(date));
}
