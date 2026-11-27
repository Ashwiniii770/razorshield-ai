"use client";

import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Clock3,
  Fingerprint,
  Globe2,
  LoaderCircle,
  Network,
  RotateCcw,
  Save,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeading } from "@/components/ui";
import type { RuleRecord } from "@/lib/ui-types";

type RuleDraft = Pick<RuleRecord, "enabled" | "weight" | "thresholdValue">;
type Simulation = {
  ruleCode: string;
  proposed: RuleDraft;
  impact: {
    evaluated: number;
    changedDecision: number;
    decisionsBefore: Record<"APPROVE" | "REVIEW" | "BLOCK", number>;
    decisionsAfter: Record<"APPROVE" | "REVIEW" | "BLOCK", number>;
    averageScoreBefore: number;
    averageScoreAfter: number;
  };
  persisted: false;
};

const ruleIcons: Record<string, typeof Activity> = {
  VEL_BURST: Activity,
  GEO_MISMATCH: Globe2,
  PROXY_ASN: Network,
  HIGH_VAL_NEW_DEV: Fingerprint,
  RETRY_ESCALATION: RotateCcw,
  TRUSTED_REPEAT: Shield,
};

function thresholdUnit(code: string) {
  if (code === "HIGH_VAL_NEW_DEV") return "INR minimum amount";
  if (code === "GEO_MISMATCH" || code === "PROXY_ASN") return "Signal match";
  return "Payments in time window";
}

export default function RulesPage() {
  const [rules, setRules] = useState<RuleRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({});
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyRule, setBusyRule] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/rules", { cache: "no-store" });
      const data = (await response.json()) as { rules?: RuleRecord[]; error?: string };
      if (!response.ok || !data.rules) throw new Error(data.error ?? "Risk rules could not be loaded.");
      setRules(data.rules);
      setDrafts(Object.fromEntries(data.rules.map((rule) => [rule.id, {
        enabled: rule.enabled,
        weight: rule.weight,
        thresholdValue: rule.thresholdValue,
      }])));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Risk rules could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadRules(); }, [loadRules]);

  const updateDraft = (ruleId: string, patch: Partial<RuleDraft>) => {
    setDrafts((current) => ({ ...current, [ruleId]: { ...current[ruleId], ...patch } }));
    setSimulation(null);
    setSavedMessage(null);
  };

  const simulate = async (rule: RuleRecord) => {
    setBusyRule(rule.id);
    setSimulation(null);
    setError(null);
    setSavedMessage(null);
    try {
      const response = await fetch("/api/rules/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ruleCode: rule.code, ...drafts[rule.id] }),
      });
      const data = (await response.json()) as Simulation & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Historical impact preview failed.");
      setSimulation(data);
    } catch (simulationError) {
      setError(simulationError instanceof Error ? simulationError.message : "Historical impact preview failed.");
    } finally {
      setBusyRule(null);
    }
  };

  const saveChanges = async () => {
    if (!simulation) return;
    const rule = rules.find((item) => item.code === simulation.ruleCode);
    if (!rule) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/rules/${rule.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(simulation.proposed),
      });
      const data = (await response.json()) as { rule?: RuleRecord; error?: string };
      if (!response.ok || !data.rule) throw new Error(data.error ?? "The risk rule could not be saved.");
      setRules((current) => current.map((item) => item.id === rule.id ? data.rule! : item));
      setDrafts((current) => ({ ...current, [rule.id]: simulation.proposed }));
      setSavedMessage(`${rule.name} changes saved. New evaluations will use the updated rule.`);
      setSimulation(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The risk rule could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const activeCount = Object.values(drafts).filter((draft) => draft.enabled).length;
  const dirtyCount = rules.filter((rule) => {
    const draft = drafts[rule.id];
    return draft && (
      draft.enabled !== rule.enabled ||
      draft.weight !== rule.weight ||
      draft.thresholdValue !== rule.thresholdValue
    );
  }).length;

  return (
    <>
      <PageHeading
        eyebrow="POLICY CONFIGURATION · RISK ENGINE"
        title="Rule & threshold studio"
        description="Tune active risk signals, preview historical impact, and publish policy changes with confidence."
        action={<button className="button button-outline" onClick={() => void loadRules()} disabled={loading}><RotateCcw size={14} />Reload rules</button>}
      />

      <div className="rules-summary-strip">
        <div className="rules-summary-item"><span className="live-dot" /><b>{activeCount}</b> of {rules.length || 6} rules active</div>
        <div className="rules-summary-item"><Activity size={14} /><span>Impact window</span><b>Last 24 hours</b></div>
        <div className="rules-summary-item"><Clock3 size={14} /><span>Unsaved changes</span><b>{dirtyCount}</b></div>
        <div className="rules-summary-item" style={{ marginLeft: "auto" }}><span className="mono-text">RISK POLICY</span><b className="mono-text">RS-01</b></div>
      </div>

      {error && <div className="error-banner rules-error"><AlertCircle size={15} /><span>{error}</span><button onClick={() => setError(null)}>Dismiss</button></div>}
      {savedMessage && <div className="success-banner"><Check size={15} /><span>{savedMessage}</span><button onClick={() => setSavedMessage(null)}>Dismiss</button></div>}

      {simulation && (
        <section className="simulation-banner" aria-live="polite">
          <div className="simulation-copy">
            <div className="simulation-icon"><Sparkles size={16} /></div>
            <div>
              <h3>Historical impact preview · {simulation.ruleCode}</h3>
              <p>Simulated against {simulation.impact.evaluated.toLocaleString()} recent transactions. No rule or transaction data has been changed.</p>
            </div>
          </div>
          <div className="simulation-stats">
            <div className="simulation-stat"><b>{simulation.impact.changedDecision}</b><span>Verdicts changed</span></div>
            <div className="simulation-stat"><b>{simulation.impact.averageScoreBefore} → {simulation.impact.averageScoreAfter}</b><span>Average risk score</span></div>
            <div className="simulation-stat"><b>{simulation.impact.decisionsAfter.BLOCK}</b><span>Would block</span></div>
          </div>
          <div className="simulation-actions">
            <span className="rule-state-note">Preview only until saved</span>
            <button className="button button-outline" onClick={() => setSimulation(null)} disabled={saving}>Keep editing</button>
            <button className="button button-primary" onClick={() => void saveChanges()} disabled={saving}>
              {saving ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />}Save rule changes
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="table-loading"><LoaderCircle size={17} className="spin" />Loading risk rules…</div>
      ) : (
        <section className="rules-grid" aria-label="Risk rule settings">
          {rules.map((rule) => {
            const draft = drafts[rule.id] ?? {
              enabled: rule.enabled,
              weight: rule.weight,
              thresholdValue: rule.thresholdValue,
            };
            const Icon = ruleIcons[rule.code] ?? SlidersHorizontal;
            const changed = draft.enabled !== rule.enabled || draft.weight !== rule.weight || draft.thresholdValue !== rule.thresholdValue;
            return (
              <article className={`rule-card ${draft.enabled ? "" : "rule-disabled"}`} key={rule.id}>
                <div className="rule-card-header">
                  <div className="rule-code-icon"><Icon size={16} /></div>
                  <div className="rule-title-block"><h2>{rule.name}</h2><span>{rule.code}</span></div>
                  <label className="rule-switch">
                    <span>{draft.enabled ? "Active" : "Paused"}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={draft.enabled}
                      aria-label={`${draft.enabled ? "Disable" : "Enable"} ${rule.name}`}
                      className={`switch-track ${draft.enabled ? "switch-on" : ""}`}
                      onClick={() => updateDraft(rule.id, { enabled: !draft.enabled })}
                    />
                  </label>
                </div>
                <p className="rule-description">{rule.description}</p>
                <div className="rule-controls">
                  <div>
                    <label className="control-label" htmlFor={`weight-${rule.id}`}>RISK WEIGHT <b>{draft.weight > 0 ? "+" : ""}{draft.weight} pts</b></label>
                    <input
                      id={`weight-${rule.id}`}
                      className="weight-range"
                      aria-label={`${rule.name} risk weight`}
                      type="range"
                      min="-40"
                      max="100"
                      step="1"
                      value={draft.weight}
                      onChange={(event) => updateDraft(rule.id, { weight: Number(event.target.value) })}
                    />
                    <div className="range-ends"><span>-40 pts</span><span>+100 pts</span></div>
                  </div>
                  <div>
                    <label className="control-label" htmlFor={`threshold-${rule.id}`}>THRESHOLD</label>
                    <input
                      id={`threshold-${rule.id}`}
                      className="threshold-input"
                      aria-label={`${rule.name} threshold`}
                      type="number"
                      min="0"
                      step={rule.code === "HIGH_VAL_NEW_DEV" ? "5000" : "1"}
                      value={draft.thresholdValue}
                      onChange={(event) => updateDraft(rule.id, { thresholdValue: Math.max(0, Number(event.target.value)) })}
                    />
                    <div className="threshold-unit">{thresholdUnit(rule.code)}</div>
                  </div>
                </div>
                <div className="rule-card-footer">
                  <span className="rule-category">{rule.category}</span>
                  <button
                    className={`button ${changed ? "button-primary" : "button-outline"}`}
                    onClick={() => void simulate(rule)}
                    disabled={busyRule !== null || saving}
                  >
                    {busyRule === rule.id ? <LoaderCircle size={13} className="spin" /> : <Zap size={13} />}
                    Simulate impact {changed ? "· changed" : ""}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <div className="studio-footer">
        <span><Shield size={12} /> Changes are evaluated against historical activity before publication.</span>
        <span>{dirtyCount > 0 ? <><ArrowDownRight size={11} /> {dirtyCount} draft {dirtyCount === 1 ? "change" : "changes"} pending preview</> : <><ArrowUpRight size={11} /> All rules match the published policy</>}</span>
      </div>
    </>
  );
}
