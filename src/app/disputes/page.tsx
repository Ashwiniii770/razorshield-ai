"use client";

import {
  AlertOctagon,
  AlertTriangle,
  BadgeCheck,
  Ban,
  CalendarClock,
  Check,
  Clipboard,
  Download,
  FileCheck2,
  Fingerprint,
  LoaderCircle,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DecisionBadge, EmptyState, formatDate, formatMoney, PageHeading, PanelHeading, RiskBadge } from "@/components/ui";
import type { TransactionListResponse, UiTransaction } from "@/lib/ui-types";

function isDisputeCandidate(transaction: UiTransaction) {
  return (
    transaction.decision === "BLOCK" ||
    transaction.analystOverride === "BLOCK" ||
    transaction.auditLogs.some((log) => log.action.toLowerCase().includes("dispute"))
  );
}

function buildEvidence(transaction: UiTransaction) {
  const generatedAt = new Date().toISOString();
  const evidence = {
    reportType: "Merchant Chargeback Evidence Report",
    generatedAt,
    transaction: {
      id: transaction.id,
      externalRef: transaction.externalRef,
      createdAt: transaction.createdAt,
      merchantName: transaction.merchantName,
      customerEmail: transaction.customerEmail,
      amount: transaction.amount,
      currency: transaction.currency,
      paymentMethod: transaction.paymentMethod,
      cardBin: transaction.cardBin,
      cardLast4: transaction.cardLast4,
      ipAddress: transaction.ipAddress,
      ipCountry: transaction.ipCountry,
      binCountry: transaction.binCountry,
      deviceFingerprint: transaction.deviceFingerprint,
      isProxy: transaction.isProxy,
    },
    riskAssessment: {
      riskScore: transaction.riskScore,
      modelDecision: transaction.decision,
      analystOverride: transaction.analystOverride,
      triggeredRules: transaction.triggeredRules,
      featureContributions: transaction.featureContributions,
      analystBrief: transaction.aiExplanation,
    },
    auditTrail: transaction.auditLogs.map((log) => ({
      actor: log.actor,
      action: log.action,
      notes: log.notes,
      createdAt: log.createdAt,
    })),
    disclaimer: "This report contains automated risk signals for merchant review and does not by itself establish fraud or cardholder intent.",
  };
  const markdown = [
    "# Merchant Chargeback Evidence Report",
    "",
    `**External reference:** ${transaction.externalRef}`,
    `**Merchant:** ${transaction.merchantName}`,
    `**Generated:** ${new Date(generatedAt).toLocaleString("en-IN")}`,
    "",
    "## Transaction",
    `- **Transaction ID:** ${transaction.id}`,
    `- **Created:** ${formatDate(transaction.createdAt)}`,
    `- **Amount:** ${formatMoney(transaction.amount, transaction.currency)}`,
    `- **Customer:** ${transaction.customerEmail}`,
    `- **Payment method:** ${transaction.paymentMethod}${transaction.cardLast4 ? ` (ending ${transaction.cardLast4})` : ""}`,
    `- **IP / country:** ${transaction.ipAddress ?? "Not supplied"} / ${transaction.ipCountry ?? "Unknown"}`,
    `- **BIN country:** ${transaction.binCountry ?? "Not supplied"}`,
    `- **Device fingerprint:** ${transaction.deviceFingerprint ?? "Not supplied"}`,
    `- **Proxy signal:** ${transaction.isProxy ? "Detected" : "Not detected"}`,
    "",
    "## Risk decision",
    `- **Risk score:** ${transaction.riskScore}/100`,
    `- **Model decision:** ${transaction.decision}`,
    `- **Analyst override:** ${transaction.analystOverride ?? "None"}`,
    "",
    "## Triggered controls",
    ...(transaction.triggeredRules.length
      ? transaction.triggeredRules.map((rule) => `- **${rule.name} (${rule.code}, ${rule.weight > 0 ? "+" : ""}${rule.weight} pts):** ${rule.reason}`)
      : ["- No configured rule was triggered."]),
    "",
    "## Feature contributions",
    ...Object.entries(transaction.featureContributions).map(([dimension, value]) => `- **${dimension}:** ${value} points`),
    "",
    "## Analyst brief",
    transaction.aiExplanation,
    "",
    "## Audit trail",
    ...(transaction.auditLogs.length
      ? transaction.auditLogs.map((log) => `- ${formatDate(log.createdAt)} · **${log.actor}** · ${log.action.replaceAll("_", " ")}${log.notes ? ` — ${log.notes}` : ""}`)
      : ["- No analyst actions recorded."]),
    "",
    `> ${evidence.disclaimer}`,
    "",
  ].join("\n");
  return { evidence, markdown };
}

export default function DisputesPage() {
  const [transactions, setTransactions] = useState<UiTransaction[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const all: UiTransaction[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore && offset < 10_000) {
        const response = await fetch(`/api/transactions?limit=100&offset=${offset}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Transaction request failed (${response.status}).`);
        const page = (await response.json()) as TransactionListResponse;
        all.push(...page.transactions);
        offset += page.transactions.length;
        hasMore = page.hasMore;
        if (page.transactions.length === 0) break;
      }
      const candidates = all.filter(isDisputeCandidate);
      setTransactions(candidates);
      setSelectedId((previous) => candidates.some((item) => item.id === previous) ? previous : candidates[0]?.id ?? null);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The dispute vault could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadTransactions(); }, [loadTransactions]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selected = useMemo(
    () => transactions.find((transaction) => transaction.id === selectedId) ?? null,
    [selectedId, transactions],
  );
  const report = selected ? buildEvidence(selected) : null;

  const copyMarkdown = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.markdown);
      setToast({ text: "Evidence report copied as Markdown." });
    } catch (copyError) {
      console.error("Could not copy evidence report:", copyError);
      setToast({ text: "Clipboard access was denied by the browser.", error: true });
    }
  };

  const downloadJson = () => {
    if (!report || !selected) return;
    const blob = new Blob([JSON.stringify(report.evidence, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `razorshield-evidence-${selected.externalRef}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setToast({ text: "Evidence JSON downloaded." });
  };

  return (
    <>
      <PageHeading
        eyebrow="MERCHANT OPERATIONS · EVIDENCE MANAGEMENT"
        title="Chargeback & dispute vault"
        description="Review blocked payment evidence and prepare a structured, auditable merchant response."
        action={<button className="button button-outline" onClick={() => void loadTransactions()} disabled={loading}><CalendarClock size={14} />Refresh vault</button>}
      />

      {error && <div className="error-banner"><AlertTriangle size={15} /><span>{error}</span><button onClick={() => void loadTransactions()}>Retry</button></div>}

      <div className="rules-summary-strip">
        <div className="rules-summary-item"><span className="live-dot" style={{ background: "var(--red)" }} /><b>{transactions.length}</b> blocked / disputed cases</div>
        <div className="rules-summary-item"><FileCheck2 size={14} /><span>Evidence reports</span><b>Ready to generate</b></div>
        <div className="rules-summary-item"><ShieldCheck size={14} /><span>All evidence</span><b>Linked to audit trail</b></div>
      </div>

      <section className="disputes-layout">
        <article className="panel dispute-list-panel">
          <PanelHeading title="Case queue" note={`${transactions.length} records`} action={<span className="dispute-count"><i className="live-dot" />LIVE</span>} />
          {loading ? (
            <div className="table-loading"><LoaderCircle size={16} className="spin" />Loading dispute records…</div>
          ) : transactions.length ? (
            <div className="dispute-row-list">
              {transactions.map((transaction) => (
                <button
                  type="button"
                  key={transaction.id}
                  className={`dispute-row ${transaction.id === selectedId ? "dispute-selected" : ""}`}
                  onClick={() => setSelectedId(transaction.id)}
                >
                  <span className="dispute-row-main">
                    <b>{transaction.merchantName}</b>
                    <span className="mono-text">{transaction.externalRef}</span>
                    <span>{formatDate(transaction.createdAt)} · {transaction.customerEmail}</span>
                  </span>
                  <span className="dispute-row-side">
                    <b>{formatMoney(transaction.amount, transaction.currency)}</b>
                    <RiskBadge score={transaction.riskScore} />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="No blocked cases" detail="Blocked payments and dispute activity will appear here." />
          )}
          <div className="dispute-notice"><AlertOctagon size={14} /><span>Evidence summaries contain automated risk signals only. Validate payment processor records before submitting a response.</span></div>
        </article>

        <article className="panel evidence-panel">
          <PanelHeading
            title="Merchant evidence report"
            note={selected ? selected.externalRef : "Select a case to prepare evidence"}
            action={selected && (
              <div className="evidence-actions">
                <button className="button button-outline" onClick={() => void copyMarkdown()}><Clipboard size={13} />Copy Markdown</button>
                <button className="button button-outline" onClick={downloadJson}><Download size={13} />Download JSON</button>
              </div>
            )}
          />
          {selected ? (
            <div className="evidence-document">
              <div className="evidence-cover">
                <span className="evidence-tag">BLOCKED PAYMENT</span>
                <div className="evidence-brand"><Shield size={13} />RAZORSHIELD INTELLIGENCE</div>
                <h2>Chargeback evidence report</h2>
                <p>Generated {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date())} · For merchant review</p>
              </div>
              <div className="evidence-body">
                <section className="evidence-section">
                  <div className="evidence-section-title"><BadgeCheck size={13} />TRANSACTION DETAILS</div>
                  <div className="evidence-facts">
                    <div className="evidence-fact"><span>MERCHANT</span><b>{selected.merchantName}</b></div>
                    <div className="evidence-fact"><span>AMOUNT</span><b>{formatMoney(selected.amount, selected.currency)}</b></div>
                    <div className="evidence-fact"><span>CUSTOMER</span><b>{selected.customerEmail}</b></div>
                    <div className="evidence-fact"><span>PAYMENT</span><b>{selected.paymentMethod}{selected.cardLast4 ? ` ···· ${selected.cardLast4}` : ""}</b></div>
                    <div className="evidence-fact"><span>IP / COUNTRY</span><b>{selected.ipAddress ?? "Not supplied"} · {selected.ipCountry ?? "Unknown"}</b></div>
                    <div className="evidence-fact"><span>BIN / COUNTRY</span><b>{selected.cardBin ?? "Not supplied"} · {selected.binCountry ?? "Unknown"}</b></div>
                    <div className="evidence-fact"><span>DEVICE</span><b>{selected.deviceFingerprint ?? "Not supplied"}</b></div>
                    <div className="evidence-fact"><span>CREATED</span><b>{formatDate(selected.createdAt)}</b></div>
                    <div className="evidence-fact"><span>REFERENCE</span><b className="mono-text">{selected.externalRef}</b></div>
                  </div>
                </section>

                <section className="evidence-section">
                  <div className="evidence-section-title"><ShieldAlert size={13} />RISK ASSESSMENT <RiskBadge score={selected.riskScore} /><DecisionBadge decision={selected.decision} small /></div>
                  {selected.triggeredRules.length ? (
                    <div className="evidence-rule-list">
                      {selected.triggeredRules.map((rule) => (
                        <div className="evidence-rule" key={rule.code}>
                          <Ban size={12} />
                          <div><b>{rule.name} · {rule.code}</b><span>{rule.reason}</span></div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="evidence-explanation">No configured risk rules triggered for this payment.</p>}
                </section>

                <section className="evidence-section">
                  <div className="evidence-section-title"><Fingerprint size={13} />RISK ENGINE SUMMARY</div>
                  <p className="evidence-explanation">{selected.aiExplanation}</p>
                </section>

                <section className="evidence-section">
                  <div className="evidence-section-title"><Clipboard size={13} />AUDIT TRAIL · {selected.auditLogs.length} EVENTS</div>
                  {selected.auditLogs.length ? (
                    <div className="evidence-rule-list">
                      {selected.auditLogs.map((log) => <div className="evidence-rule" key={log.id}><Check size={12} /><div><b>{log.action.replaceAll("_", " ")} · {log.actor}</b><span>{formatDate(log.createdAt)}{log.notes ? ` · ${log.notes}` : ""}</span></div></div>)}
                    </div>
                  ) : <p className="evidence-explanation">No analyst actions have been recorded for this payment.</p>}
                </section>
                <footer className="evidence-footer"><span>CONFIDENTIAL · MERCHANT REVIEW</span><span>{selected.id} · RISK POLICY RS-01</span></footer>
              </div>
            </div>
          ) : loading ? (
            <div className="table-loading evidence-empty"><LoaderCircle size={16} className="spin" />Preparing evidence report…</div>
          ) : (
            <EmptyState title="No case selected" detail="Choose a blocked transaction from the case queue." />
          )}
        </article>
      </section>
      {toast && <div className={`toast ${toast.error ? "toast-error" : ""}`}>{toast.error ? <AlertTriangle size={15} /> : <Check size={15} />}{toast.text}</div>}
    </>
  );
}
