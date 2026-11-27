"use client";

import {
  Activity,
  ArrowUpRight,
  Ban,
  Check,
  ChevronDown,
  Clock3,
  CreditCard,
  Globe2,
  Laptop2,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DecisionBadge,
  EmptyState,
  formatDate,
  formatMoney,
  MetricCard,
  PageHeading,
  PanelHeading,
  RiskBadge,
} from "@/components/ui";
import type { Decision, TransactionListResponse, UiTransaction } from "@/lib/ui-types";
import { riskDimensionLabels } from "@/lib/ui-types";

const filters: Array<{ label: string; value: "ALL" | Decision }> = [
  { label: "All activity", value: "ALL" },
  { label: "Approved", value: "APPROVE" },
  { label: "Review queue", value: "REVIEW" },
  { label: "Blocked", value: "BLOCK" },
];

function inrAmount(amount: number, currency: string) {
  return currency === "USD" ? amount * 83 : amount;
}

function makeVolumeSeries(transactions: UiTransaction[]) {
  const now = Date.now();
  return Array.from({ length: 8 }, (_, index) => {
    const bucketStart = now - (7 - index) * 3 * 60 * 60 * 1000;
    const bucketEnd = bucketStart + 3 * 60 * 60 * 1000;
    const items = transactions.filter((transaction) => {
      const time = new Date(transaction.createdAt).getTime();
      return time >= bucketStart && time < bucketEnd;
    });
    const label = new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: true }).format(
      new Date(bucketStart),
    );
    return {
      time: label,
      approved: items
        .filter((transaction) => transaction.decision === "APPROVE")
        .reduce((sum, transaction) => sum + inrAmount(transaction.amount, transaction.currency), 0),
      flagged: items
        .filter((transaction) => transaction.decision !== "APPROVE")
        .reduce((sum, transaction) => sum + inrAmount(transaction.amount, transaction.currency), 0),
    };
  });
}

function makeRiskDistribution(transactions: UiTransaction[]) {
  const ranges = [
    { label: "0–19", min: 0, max: 19 },
    { label: "20–39", min: 20, max: 39 },
    { label: "40–59", min: 40, max: 59 },
    { label: "60–74", min: 60, max: 74 },
    { label: "75–100", min: 75, max: 100 },
  ];
  return ranges.map((range) => ({
    range: range.label,
    count: transactions.filter(
      (transaction) => transaction.riskScore >= range.min && transaction.riskScore <= range.max,
    ).length,
  }));
}

function TransactionDrawer({
  transaction,
  onClose,
  onAction,
  busy,
  actionError,
}: {
  transaction: UiTransaction;
  onClose: () => void;
  onAction: (action: "APPROVE" | "BLOCK" | "REQUEST_3DS") => void;
  busy: boolean;
  actionError: string | null;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="drawer-layer" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="risk-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-header">
          <div>
            <div className="drawer-kicker"><span className="eyebrow-line" />TRANSACTION REVIEW</div>
            <h2 id="drawer-title">Risk assessment</h2>
            <span className="mono-text">{transaction.externalRef}</span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close risk drawer"><X size={18} /></button>
        </div>
        <div className="drawer-scroll">
          <div className="drawer-summary">
            <div>
              <span className="detail-label">PAYMENT AMOUNT</span>
              <strong>{formatMoney(transaction.amount, transaction.currency)}</strong>
              <span>{transaction.merchantName}</span>
            </div>
            <div className="drawer-score"><RiskBadge score={transaction.riskScore} /><DecisionBadge decision={transaction.decision} /></div>
          </div>

          <section className="drawer-section">
            <div className="drawer-section-title"><span>PAYMENT & CUSTOMER</span><span>{formatDate(transaction.createdAt)}</span></div>
            <div className="detail-grid">
              <div><span className="detail-label">CUSTOMER</span><b>{transaction.customerEmail}</b></div>
              <div><span className="detail-label">PAYMENT METHOD</span><b><CreditCard size={13} />{transaction.paymentMethod}{transaction.cardLast4 ? ` ···· ${transaction.cardLast4}` : ""}</b></div>
            </div>
          </section>

          <section className="drawer-section">
            <div className="drawer-section-title"><span>NETWORK & DEVICE SIGNALS</span><span className={transaction.isProxy ? "text-danger" : "text-mint"}>{transaction.isProxy ? "PROXY DETECTED" : "NO PROXY SIGNAL"}</span></div>
            <div className="signal-list">
              <div className="signal-row"><span><Globe2 size={14} />Origin IP</span><b className="mono-text">{transaction.ipAddress ?? "Not supplied"} <small>{transaction.ipCountry ?? "—"}</small></b></div>
              <div className="signal-row"><span><CreditCard size={14} />Card BIN</span><b className="mono-text">{transaction.cardBin ?? "Not supplied"} <small>{transaction.binCountry ?? "—"}</small></b></div>
              <div className="signal-row"><span><Laptop2 size={14} />Device fingerprint</span><b className="mono-text signal-fingerprint">{transaction.deviceFingerprint ?? "Not supplied"}</b></div>
              <div className="signal-row"><span><Activity size={14} />IP / BIN country</span><b className={transaction.ipCountry && transaction.binCountry && transaction.ipCountry !== transaction.binCountry ? "text-danger" : ""}>{transaction.ipCountry ?? "—"} <span className="muted-text">/</span> {transaction.binCountry ?? "—"}</b></div>
            </div>
          </section>

          <section className="drawer-section">
            <div className="drawer-section-title"><span>RISK FACTOR CONTRIBUTIONS</span><span>POINTS</span></div>
            <div className="factor-list">
              {riskDimensionLabels.map((dimension) => {
                const value = transaction.featureContributions[dimension] ?? 0;
                const tone = value >= 25 ? "danger" : value >= 12 ? "warning" : "mint";
                return (
                  <div className="factor-item" key={dimension}>
                    <div className="factor-copy"><span>{dimension}</span><b>{value}</b></div>
                    <div className="factor-track"><span className={`factor-fill factor-${tone}`} style={{ width: `${Math.min(value, 100)}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="analyst-brief">
            <div className="brief-heading"><span className="brief-sparkle"><Sparkles size={14} /></span><b>AI ANALYST BRIEF</b><span>RISK ENGINE</span></div>
            <p>{transaction.aiExplanation}</p>
            {transaction.triggeredRules.length > 0 && (
              <div className="trigger-list">
                {transaction.triggeredRules.map((rule) => <span key={rule.code}>{rule.code}</span>)}
              </div>
            )}
          </section>

          <section className="drawer-section audit-section">
            <div className="drawer-section-title"><span>ANALYST AUDIT TRAIL</span><span>{transaction.auditLogs.length} EVENTS</span></div>
            {transaction.auditLogs.length > 0 ? (
              <div className="audit-list">
                {transaction.auditLogs.map((log) => (
                  <div className="audit-item" key={log.id}>
                    <span className="audit-dot" />
                    <div><b>{log.action.replaceAll("_", " ")}</b><span>{log.notes ?? "No notes recorded."}</span><small>{log.actor} · {formatDate(log.createdAt)}</small></div>
                  </div>
                ))}
              </div>
            ) : <div className="audit-empty"><Clock3 size={14} />No analyst actions have been recorded.</div>}
          </section>
        </div>
        <div className="drawer-actions">
          {actionError && <div className="inline-error">{actionError}</div>}
          <button className="button button-quiet" onClick={() => onAction("REQUEST_3DS")} disabled={busy}>
            {busy ? <LoaderCircle size={15} className="spin" /> : <ShieldCheck size={15} />}Request 3DS
          </button>
          <button className="button button-approve" onClick={() => onAction("APPROVE")} disabled={busy}>
            {busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}Approve payment
          </button>
          <button className="button button-block" onClick={() => onAction("BLOCK")} disabled={busy}>
            {busy ? <LoaderCircle size={15} className="spin" /> : <Ban size={15} />}Confirm fraud block
          </button>
        </div>
      </aside>
    </div>
  );
}

export default function Home() {
  const [transactions, setTransactions] = useState<UiTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | Decision>("ALL");
  const [activePage, setActivePage] = useState(0);
  const [selected, setSelected] = useState<UiTransaction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const pageSize = 10;

  const loadTransactions = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const all: UiTransaction[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore && offset < 10_000) {
        const response = await fetch(`/api/transactions?limit=100&offset=${offset}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Transaction request failed (${response.status}).`);
        const data = (await response.json()) as TransactionListResponse;
        all.push(...data.transactions);
        offset += data.transactions.length;
        hasMore = data.hasMore;
        if (data.transactions.length === 0) break;
      }
      setTransactions(all);
      setLoadError(null);
      setSelected((previous) => previous ? all.find((item) => item.id === previous.id) ?? null : null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Transactions could not be loaded.");
      console.error("Could not load dashboard transactions:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadTransactions();
    const timer = window.setInterval(() => void loadTransactions(true), 45_000);
    return () => window.clearInterval(timer);
  }, [loadTransactions]);

  const visibleTransactions = useMemo(() => {
    const term = query.trim().toLowerCase();
    return transactions.filter((transaction) => {
      const matchesFilter = filter === "ALL" || transaction.decision === filter;
      const matchesQuery =
        !term ||
        [
          transaction.externalRef,
          transaction.merchantName,
          transaction.customerEmail,
          transaction.ipAddress ?? "",
        ].some((value) => value.toLowerCase().includes(term));
      return matchesFilter && matchesQuery;
    });
  }, [filter, query, transactions]);
  const pageCount = Math.max(1, Math.ceil(visibleTransactions.length / pageSize));
  const currentPage = Math.min(activePage, pageCount - 1);
  const pageTransactions = visibleTransactions.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const volumeSeries = useMemo(() => makeVolumeSeries(transactions), [transactions]);
  const distribution = useMemo(() => makeRiskDistribution(transactions), [transactions]);
  const grossVolume = transactions.reduce(
    (sum, transaction) => sum + inrAmount(transaction.amount, transaction.currency),
    0,
  );
  const preventedVolume = transactions
    .filter((transaction) => transaction.decision === "BLOCK")
    .reduce((sum, transaction) => sum + inrAmount(transaction.amount, transaction.currency), 0);
  const approvalRate = transactions.length
    ? (transactions.filter((transaction) => transaction.decision === "APPROVE").length / transactions.length) * 100
    : 0;
  const averageRisk = transactions.length
    ? transactions.reduce((sum, transaction) => sum + transaction.riskScore, 0) / transactions.length
    : 0;
  const reviewCount = transactions.filter((transaction) => transaction.decision === "REVIEW").length;

  useEffect(() => setActivePage(0), [filter, query]);

  const performAction = async (action: "APPROVE" | "BLOCK" | "REQUEST_3DS") => {
    if (!selected) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/transactions/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          action === "REQUEST_3DS"
            ? { action, actor: "Alex Morgan" }
            : {
                decision: action,
                actor: "Alex Morgan",
                notes: action === "APPROVE" ? "Approved by analyst from the risk drawer." : "Fraud block confirmed by analyst.",
              },
        ),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? `Analyst action failed (${response.status}).`);
      await loadTransactions(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The analyst action could not be saved.");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="PAYMENT RISK MONITORING · LIVE"
        title="Risk command center"
        description="A real-time view of your payment risk posture, decisions, and analyst queue."
        action={
          <button className="button button-outline" onClick={() => void loadTransactions(true)} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? "spin" : ""} />Refresh data
          </button>
        }
      />

      {loadError && <div className="error-banner"><ShieldAlert size={16} /><span>{loadError}</span><button onClick={() => void loadTransactions()}>Retry</button></div>}

      <section className="metric-grid" aria-label="Key risk metrics">
        <MetricCard label="Gross volume processed" value={formatMoney(grossVolume, "INR")} detail={`${transactions.length} transactions · 24h window`} icon={<CreditCard size={17} />} tone="blue" change={{ value: "12.8%", positive: true }} />
        <MetricCard label="Fraud prevented" value={formatMoney(preventedVolume, "INR")} detail={`${transactions.filter((item) => item.decision === "BLOCK").length} payments blocked`} icon={<ShieldCheck size={17} />} tone="mint" change={{ value: "8.4%", positive: true }} />
        <MetricCard label="Auto-approval rate" value={`${approvalRate.toFixed(1)}%`} detail="Of evaluated payments" icon={<ArrowUpRight size={17} />} tone="purple" />
        <MetricCard label="Average risk score" value={averageRisk.toFixed(1)} detail="Across all evaluated payments" icon={<Activity size={17} />} tone="orange" />
        <MetricCard label="Active review queue" value={String(reviewCount)} detail="Awaiting analyst decision" icon={<Clock3 size={17} />} tone="red" />
      </section>

      <section className="analytics-grid">
        <article className="panel volume-panel">
          <PanelHeading title="Payment volume" note="Approved vs. flagged value · last 24 hours" action={<span className="chart-period"><i className="live-dot" />LIVE <ChevronDown size={13} /></span>} />
          <div className="chart-legend"><span><i className="legend-dot legend-approved" />Approved volume</span><span><i className="legend-dot legend-flagged" />Flagged / blocked</span><span className="legend-currency">INR EQUIVALENT</span></div>
          <div className="volume-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={volumeSeries} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="approvedGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#28d5a0" stopOpacity={0.28} /><stop offset="95%" stopColor="#28d5a0" stopOpacity={0.01} /></linearGradient>
                  <linearGradient id="flaggedGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff6871" stopOpacity={0.22} /><stop offset="95%" stopColor="#ff6871" stopOpacity={0.01} /></linearGradient>
                </defs>
                <CartesianGrid stroke="#1b2935" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: "#718193", fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#718193", fontSize: 10 }} tickFormatter={(value: number) => value >= 100000 ? `${Math.round(value / 1000)}k` : String(value)} />
                <Tooltip formatter={(value) => formatMoney(Number(value), "INR")} contentStyle={{ background: "#111a24", border: "1px solid #263541", borderRadius: 9, color: "#e5edf3", fontSize: 12 }} />
                <Area type="monotone" dataKey="approved" name="Approved" stroke="#27d5a0" strokeWidth={2} fill="url(#approvedGradient)" />
                <Area type="monotone" dataKey="flagged" name="Flagged / blocked" stroke="#ff6871" strokeWidth={2} fill="url(#flaggedGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel distribution-panel">
          <PanelHeading title="Risk distribution" note="Score bands · all transactions" />
          <div className="risk-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribution} margin={{ top: 12, right: 4, left: -25, bottom: 0 }}>
                <CartesianGrid stroke="#1b2935" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fill: "#718193", fontSize: 10 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#718193", fontSize: 10 }} />
                <Tooltip cursor={{ fill: "#18232e" }} contentStyle={{ background: "#111a24", border: "1px solid #263541", borderRadius: 9, color: "#e5edf3", fontSize: 12 }} />
                <Bar dataKey="count" name="Transactions" radius={[4, 4, 0, 0]} fill="#4a8dff" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="distribution-foot"><span><i className="risk-legend risk-low" />LOW <b>{distribution.slice(0, 2).reduce((sum, item) => sum + item.count, 0)}</b></span><span><i className="risk-legend risk-mid" />ELEVATED <b>{distribution[2].count + distribution[3].count}</b></span><span><i className="risk-legend risk-high" />CRITICAL <b>{distribution[4].count}</b></span></div>
        </article>
      </section>

      <section className="panel transaction-panel">
        <PanelHeading
          title="Live transaction feed"
          note={`${visibleTransactions.length.toLocaleString()} matching records`}
          action={<span className="feed-live"><i className="live-dot" />STREAMING</span>}
        />
        <div className="feed-toolbar">
          <label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference, merchant, customer..." /><kbd>⌘ K</kbd></label>
          <div className="filter-tabs" role="tablist" aria-label="Filter by transaction decision">
            {filters.map((item) => <button key={item.value} role="tab" aria-selected={filter === item.value} className={filter === item.value ? "filter-active" : ""} onClick={() => setFilter(item.value)}>{item.label}{item.value === "REVIEW" && reviewCount > 0 && <span>{reviewCount}</span>}</button>)}
          </div>
        </div>

        <div className="table-scroll">
          <table className="transaction-table">
            <thead><tr><th>TRANSACTION</th><th>CUSTOMER</th><th>AMOUNT</th><th>METHOD</th><th>RISK SCORE</th><th>DECISION</th><th>TIME</th><th /></tr></thead>
            <tbody>
              {pageTransactions.map((transaction) => (
                <tr key={transaction.id} onClick={() => { setSelected(transaction); setActionError(null); }}>
                  <td><span className="merchant-name">{transaction.merchantName}</span><span className="table-sub mono-text">{transaction.externalRef}</span></td>
                  <td><span className="customer-name">{transaction.customerEmail}</span><span className="table-sub">{transaction.ipCountry ?? "Unknown region"}{transaction.ipAddress ? ` · ${transaction.ipAddress}` : ""}</span></td>
                  <td><span className="amount-primary">{formatMoney(transaction.amount, transaction.currency)}</span><span className="table-sub">{transaction.currency}</span></td>
                  <td><span className="method-chip"><CreditCard size={13} />{transaction.paymentMethod}</span></td>
                  <td><RiskBadge score={transaction.riskScore} /></td>
                  <td><DecisionBadge decision={transaction.decision} small /></td>
                  <td><span className="time-cell">{formatDate(transaction.createdAt)}</span></td>
                  <td><button className="row-open" aria-label={`Review ${transaction.externalRef}`}><ArrowUpRight size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && pageTransactions.length === 0 && <EmptyState title="No matching transactions" detail="Try another search term or change the decision filter." />}
          {loading && <div className="table-loading"><LoaderCircle size={17} className="spin" />Loading transaction activity…</div>}
          {!loading && loadError && transactions.length === 0 && <div className="table-loading table-error">The transaction feed is unavailable. Use Refresh data to retry.</div>}
        </div>

        <div className="table-footer"><span>Showing <b>{visibleTransactions.length ? currentPage * pageSize + 1 : 0}–{Math.min((currentPage + 1) * pageSize, visibleTransactions.length)}</b> of <b>{visibleTransactions.length}</b></span><div className="pagination"><button disabled={currentPage === 0} onClick={() => setActivePage((page) => Math.max(0, page - 1))}>Previous</button><span>{currentPage + 1} / {pageCount}</span><button disabled={currentPage + 1 >= pageCount} onClick={() => setActivePage((page) => Math.min(pageCount - 1, page + 1))}>Next <ArrowUpRight size={12} /></button></div></div>
      </section>

      <footer className="page-footer"><span><ShieldCheck size={13} />PCI-DSS aligned controls</span><span>Last synced just now <span className="footer-separator">·</span> Risk engine v1.0</span></footer>

      {selected && <TransactionDrawer transaction={selected} onClose={() => setSelected(null)} onAction={(action) => void performAction(action)} busy={actionBusy} actionError={actionError} />}
    </>
  );
}
