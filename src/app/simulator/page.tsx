"use client";

import {
  ArrowUpRight,
  Bot,
  Check,
  CirclePlay,
  Code2,
  Globe2,
  LoaderCircle,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { DecisionBadge, PageHeading, PanelHeading, RiskBadge } from "@/components/ui";
import type { Decision } from "@/lib/ui-types";

type PaymentPayload = {
  externalRef: string;
  merchantName: string;
  customerEmail: string;
  amount: number;
  currency: "INR" | "USD";
  paymentMethod: "Card" | "UPI" | "NetBanking" | "Wallet";
  cardBin?: string;
  cardLast4?: string;
  ipAddress?: string;
  ipCountry?: string;
  binCountry?: string;
  deviceFingerprint?: string;
  isProxy?: boolean;
};

type EvaluationResult = {
  requestNumber: number;
  httpStatus: number;
  response: Record<string, unknown>;
};

const randomRef = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

const samplePayload: PaymentPayload = {
  externalRef: "manual-preview",
  merchantName: "Northstar Market",
  customerEmail: "customer@example.test",
  amount: 2499,
  currency: "INR",
  paymentMethod: "UPI",
  ipAddress: "103.21.88.14",
  ipCountry: "IN",
  deviceFingerprint: "device-demo-01",
  isProxy: false,
};

type ScenarioPreset = {
  id: string;
  title: string;
  subtitle: string;
  icon: typeof ShieldCheck;
  batch: boolean;
  makePayloads: () => PaymentPayload[];
};

function buildPresets(): ScenarioPreset[] {
  return [
    {
      id: "repeat",
      title: "Clean repeat buyer",
      subtitle: "₹2,499 UPI · Known device",
      icon: ShieldCheck,
      batch: false,
      makePayloads: () => [{
        ...samplePayload,
        externalRef: randomRef("repeat"),
        merchantName: "Northstar Market",
        customerEmail: "dev.patel@example.test",
        deviceFingerprint: "device-04",
      }],
    },
    {
      id: "bot",
      title: "Card testing bot burst",
      subtitle: "5 rapid ₹100 probes · same card & device",
      icon: Bot,
      batch: true,
      makePayloads: () => Array.from({ length: 5 }, (_, index) => ({
        ...samplePayload,
        externalRef: `${randomRef("probe")}-${index + 1}`,
        merchantName: "Orbit Electronics",
        customerEmail: "probe.bot@example.test",
        amount: 100,
        paymentMethod: "Card" as const,
        cardBin: "411111",
        cardLast4: "9001",
        ipAddress: "198.51.100.27",
        ipCountry: "IN",
        binCountry: "IN",
        deviceFingerprint: "device-bot-rapid-test",
        isProxy: false,
      })),
    },
    {
      id: "takeover",
      title: "Account takeover",
      subtitle: "₹92,500 Card · VPN + BIN mismatch",
      icon: ShieldAlert,
      batch: false,
      makePayloads: () => [{
        ...samplePayload,
        externalRef: randomRef("ato"),
        merchantName: "Orbit Electronics",
        customerEmail: "account.takeover@example.test",
        amount: 92_500,
        paymentMethod: "Card",
        cardBin: "543210",
        cardLast4: "4421",
        ipAddress: "198.51.100.72",
        ipCountry: "GB",
        binCountry: "IN",
        deviceFingerprint: "new-device-vpn-884",
        isProxy: true,
      }],
    },
    {
      id: "travel",
      title: "Cross-border travel",
      subtitle: "$480 Card · Overseas IP",
      icon: Globe2,
      batch: false,
      makePayloads: () => [{
        ...samplePayload,
        externalRef: randomRef("travel"),
        merchantName: "Blue Lotus Travel",
        customerEmail: "travel.customer@example.test",
        amount: 480,
        currency: "USD",
        paymentMethod: "Card",
        cardBin: "401288",
        cardLast4: "1834",
        ipAddress: "203.0.113.42",
        ipCountry: "SG",
        binCountry: "IN",
        deviceFingerprint: "travel-device-2026",
        isProxy: false,
      }],
    },
  ];
}

export default function SimulatorPage() {
  const [editor, setEditor] = useState(() => JSON.stringify(samplePayload, null, 2));
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchName, setBatchName] = useState<string | null>(null);
  const presets = buildPresets();

  useEffect(() => {
    setEditor(JSON.stringify({ ...samplePayload, externalRef: randomRef("manual") }, null, 2));
  }, []);

  const sendPayment = async (payload: PaymentPayload, requestNumber: number): Promise<EvaluationResult> => {
    const response = await fetch("/api/webhooks/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as Record<string, unknown>;
    return { requestNumber, httpStatus: response.status, response: data };
  };

  const runPayloads = async (payloads: PaymentPayload[], label: string) => {
    setIsRunning(true);
    setError(null);
    setResults([]);
    setBatchName(payloads.length > 1 ? label : null);
    try {
      const evaluated: EvaluationResult[] = [];
      for (let index = 0; index < payloads.length; index += 1) {
        evaluated.push(await sendPayment(payloads[index], index + 1));
        setResults([...evaluated]);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The evaluation request failed.");
    } finally {
      setIsRunning(false);
    }
  };

  const runEditor = async () => {
    let payload: unknown;
    try {
      payload = JSON.parse(editor);
    } catch (parseError) {
      setError(parseError instanceof Error ? `Invalid JSON: ${parseError.message}` : "The payload is not valid JSON.");
      return;
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      setError("The webhook body must be a JSON object.");
      return;
    }
    setError(null);
    await runPayloads([payload as PaymentPayload], "Manual evaluation");
  };

  const runPreset = async (id: string, title: string) => {
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    const payloads = preset.makePayloads();
    setEditor(JSON.stringify(payloads[0], null, 2));
    await runPayloads(payloads, title);
  };

  const hasFailedResult = results.some((result) => result.httpStatus < 200 || result.httpStatus >= 300);

  return (
    <>
      <PageHeading
        eyebrow="WEBHOOK LAB · SAFE TEST ENVIRONMENT"
        title="Live webhook simulator"
        description="Send realistic payment events through the production scoring pipeline and inspect each live verdict."
        action={<span className="environment-pill"><i className="live-dot" />PERSISTED TO LOCAL DB</span>}
      />

      <div className="simulator-layout">
        <section className="panel simulator-panel">
          <PanelHeading title="Webhook payload" note="POST /api/webhooks/evaluate" action={<span className="mono-text muted-text">application/json</span>} />
          <div className="payload-toolbar"><span>PAYMENT EVENT · JSON</span><button className="icon-button" aria-label="Reset payload" onClick={() => setEditor(JSON.stringify({ ...samplePayload, externalRef: randomRef("manual") }, null, 2))}><RotateCcw size={14} /></button></div>
          <textarea
            className="payload-editor"
            spellCheck={false}
            aria-label="Editable JSON payment payload"
            value={editor}
            onChange={(event) => setEditor(event.target.value)}
          />
          {error && <div className="sim-error">{error}</div>}
          <div className="sim-run-row">
            <span>Each evaluation creates a transaction in the local SQLite database.</span>
            <button className="button button-primary" onClick={() => void runEditor()} disabled={isRunning}>
              {isRunning ? <LoaderCircle size={14} className="spin" /> : <CirclePlay size={14} />}Evaluate payment
            </button>
          </div>

          <div className="preset-list">
            <div className="preset-list-title">SCENARIO PRESETS <span className="muted-text">· real API requests</span></div>
            {presets.map(({ id, title, subtitle, icon: Icon, batch }) => (
              <button className="preset-button" key={id} onClick={() => void runPreset(id, title)} disabled={isRunning}>
                <span className="preset-icon"><Icon size={14} /></span>
                <span className="preset-copy"><b>{title}</b><span>{subtitle}</span></span>
                {batch && <span className="preset-batch">×5</span>}
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
          <div className="preset-hint"><Zap size={13} />The card-testing scenario submits five sequential payments, allowing velocity and retry signals to build in the live history.</div>
        </section>

        <section className="panel verdict-panel">
          <PanelHeading
            title="Live verdict"
            note={results.length ? `${results.length} ${results.length === 1 ? "evaluation" : "evaluations"} returned` : "Awaiting a payment event"}
            action={results.length > 0 ? <button className="icon-button" aria-label="Clear results" onClick={() => { setResults([]); setBatchName(null); }}><Code2 size={14} /></button> : undefined}
          />
          {results.length === 0 ? (
            <div className="verdict-idle"><div><ShieldCheck size={23} /><b>Ready to evaluate</b><span>Choose a scenario preset or edit the webhook JSON and run an evaluation.</span></div></div>
          ) : (
            <>
              {batchName && <div className="sim-batch-note"><Bot size={14} />{batchName} · {results.length} of 5 payment probes evaluated{isRunning ? "…" : ""}</div>}
              <div className="verdict-list">
                {results.map((result) => {
                  const decision = typeof result.response.decision === "string" ? result.response.decision as Decision : null;
                  const riskScore = typeof result.response.riskScore === "number" ? result.response.riskScore : null;
                  return (
                    <article className="verdict-card" key={`${String(result.response.transactionId ?? result.requestNumber)}-${result.requestNumber}`}>
                      <div className="verdict-card-top">
                        <div>
                          {decision && riskScore !== null ? <><RiskBadge score={riskScore} /><DecisionBadge decision={decision} small /></> : <span className={`http-pill ${result.httpStatus < 300 ? "http-ok" : "http-fail"}`}>HTTP {result.httpStatus}</span>}
                          <span className="mono-text">{String(result.response.externalRef ?? result.response.error ?? `Request ${result.requestNumber}`)}</span>
                        </div>
                        {result.httpStatus >= 200 && result.httpStatus < 300 ? <Check size={14} className="text-mint" /> : <ShieldAlert size={14} className="text-danger" />}
                      </div>
                      <pre className="verdict-pre">{JSON.stringify(result.response, null, 2)}</pre>
                    </article>
                  );
                })}
              </div>
            </>
          )}
          {hasFailedResult && <div className="sim-error">One or more requests returned an API error. Inspect the response details above.</div>}
          <div className="simulator-safety"><ShieldCheck size={14} />All evaluations use the same risk engine and rules as incoming payment webhooks.</div>
        </section>
      </div>
    </>
  );
}
