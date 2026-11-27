export const riskDimensions = [
  "Velocity",
  "Geo & IP Mismatch",
  "Device Trust",
  "Amount Anomaly",
  "Payment Method / BIN",
] as const;

export type RiskDimension = (typeof riskDimensions)[number];
export type RiskDecision = "APPROVE" | "REVIEW" | "BLOCK";
export type SupportedCurrency = "INR" | "USD";
export type SupportedPaymentMethod = "Card" | "UPI" | "NetBanking" | "Wallet";

export interface PaymentInput {
  externalRef: string;
  merchantName: string;
  customerEmail: string;
  amount: number;
  currency: SupportedCurrency;
  paymentMethod: SupportedPaymentMethod;
  cardBin?: string | null;
  cardLast4?: string | null;
  ipAddress?: string | null;
  ipCountry?: string | null;
  binCountry?: string | null;
  deviceFingerprint?: string | null;
  isProxy?: boolean;
}

export interface RiskRuleInput {
  code: string;
  name: string;
  thresholdValue: number;
  weight: number;
  enabled: boolean;
}

export interface TransactionHistory {
  customerEmail: string;
  amount: number;
  currency: SupportedCurrency;
  paymentMethod: SupportedPaymentMethod;
  ipAddress?: string | null;
  deviceFingerprint?: string | null;
  createdAt: Date;
}

export interface TriggeredRiskRule {
  code: string;
  name: string;
  weight: number;
  reason: string;
}

export interface RiskEvaluation {
  riskScore: number;
  decision: RiskDecision;
  confidence: number;
  triggeredRules: TriggeredRiskRule[];
  featureContributions: Record<RiskDimension, number>;
  aiExplanation: string;
}

const toInr = (amount: number, currency: SupportedCurrency) =>
  currency === "USD" ? amount * 83 : amount;

const normalizeCountry = (country?: string | null) =>
  country?.trim().toUpperCase() ?? "";

function decide(score: number): RiskDecision {
  if (score >= 75) return "BLOCK";
  if (score >= 40) return "REVIEW";
  return "APPROVE";
}

export function evaluatePayment(
  payment: PaymentInput,
  rules: RiskRuleInput[],
  history: TransactionHistory[] = [],
): RiskEvaluation {
  const now = new Date();
  const recent = history.filter(
    (transaction) => now.getTime() - transaction.createdAt.getTime() <= 24 * 60 * 60 * 1000,
  );
  const lastHour = recent.filter(
    (transaction) => now.getTime() - transaction.createdAt.getTime() <= 60 * 60 * 1000,
  );
  const sameCustomerHour = lastHour.filter(
    (transaction) => transaction.customerEmail.toLowerCase() === payment.customerEmail.toLowerCase(),
  );
  const sameAmountRecent = recent.filter(
    (transaction) =>
      transaction.customerEmail.toLowerCase() === payment.customerEmail.toLowerCase() &&
      Math.abs(toInr(transaction.amount, transaction.currency) - toInr(payment.amount, payment.currency)) <=
        Math.max(100, toInr(payment.amount, payment.currency) * 0.02),
  );
  const repeatDevice = recent.some(
    (transaction) =>
      Boolean(payment.deviceFingerprint) &&
      transaction.deviceFingerprint === payment.deviceFingerprint,
  );
  const countryMismatch =
    Boolean(payment.ipCountry && payment.binCountry) &&
    normalizeCountry(payment.ipCountry) !== normalizeCountry(payment.binCountry);

  const contributions: Record<RiskDimension, number> = {
    Velocity: sameCustomerHour.length >= 2 ? 10 : 4,
    "Geo & IP Mismatch": payment.ipCountry && payment.binCountry ? 0 : 5,
    "Device Trust": payment.isProxy ? 18 : payment.deviceFingerprint ? 0 : 8,
    "Amount Anomaly":
      toInr(payment.amount, payment.currency) >= 500_000
        ? 22
        : toInr(payment.amount, payment.currency) >= 100_000
          ? 12
          : 4,
    "Payment Method / BIN":
      payment.paymentMethod === "Card" && !payment.cardBin ? 12 : 4,
  };
  const triggeredRules: TriggeredRiskRule[] = [];

  const dimensionsByCode: Record<string, RiskDimension> = {
    VEL_BURST: "Velocity",
    GEO_MISMATCH: "Geo & IP Mismatch",
    PROXY_ASN: "Device Trust",
    HIGH_VAL_NEW_DEV: "Amount Anomaly",
    RETRY_ESCALATION: "Velocity",
    TRUSTED_REPEAT: "Velocity",
  };

  for (const rule of rules) {
    if (!rule.enabled) continue;

    let reason: string | undefined;
    switch (rule.code) {
      case "VEL_BURST":
        if (sameCustomerHour.length + 1 >= rule.thresholdValue) {
          reason = `${sameCustomerHour.length + 1} payments from this customer in the last hour.`;
        }
        break;
      case "GEO_MISMATCH":
        if (countryMismatch) {
          reason = `IP country ${payment.ipCountry} differs from card BIN country ${payment.binCountry}.`;
        }
        break;
      case "PROXY_ASN":
        if (payment.isProxy) reason = "The payment IP is identified as a proxy or anonymizing network.";
        break;
      case "HIGH_VAL_NEW_DEV":
        if (
          toInr(payment.amount, payment.currency) >= rule.thresholdValue &&
          !repeatDevice
        ) {
          reason = `A new device is submitting a high-value payment (approximately INR ${Math.round(toInr(payment.amount, payment.currency)).toLocaleString("en-IN")}).`;
        }
        break;
      case "RETRY_ESCALATION":
        if (sameAmountRecent.length + 1 >= rule.thresholdValue) {
          reason = `${sameAmountRecent.length + 1} similarly sized payments from this customer were seen in the last 24 hours.`;
        }
        break;
      case "TRUSTED_REPEAT":
        if (sameCustomerHour.length >= rule.thresholdValue) {
          reason = `Returning customer has ${sameCustomerHour.length} recent payments in the last hour.`;
        }
        break;
    }

    if (!reason) continue;
    triggeredRules.push({
      code: rule.code,
      name: rule.name,
      weight: rule.weight,
      reason,
    });
    const dimension = dimensionsByCode[rule.code];
    if (dimension) contributions[dimension] += rule.weight;
  }

  for (const dimension of riskDimensions) {
    contributions[dimension] = Math.max(0, Math.min(100, contributions[dimension]));
  }
  const riskScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(riskDimensions.reduce((total, dimension) => total + contributions[dimension], 0)),
    ),
  );
  const decision = decide(riskScore);
  const positiveFactors = riskDimensions
    .map((dimension) => ({ dimension, score: contributions[dimension] }))
    .filter((factor) => factor.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const missingSignals = [
    !payment.ipCountry && "IP country",
    !payment.binCountry && payment.paymentMethod === "Card" && "card BIN country",
    !payment.deviceFingerprint && "device fingerprint",
    payment.paymentMethod === "Card" && !payment.cardBin && "card BIN",
  ].filter(Boolean);
  const confidence = Math.min(
    0.98,
    Number(
      (
        0.62 +
        (payment.ipAddress ? 0.04 : 0) +
        (payment.deviceFingerprint ? 0.07 : 0) +
        (payment.ipCountry ? 0.04 : 0) +
        (payment.binCountry ? 0.04 : 0) +
        (payment.cardBin ? 0.04 : 0) +
        Math.min(rules.filter((rule) => rule.enabled).length, 6) * 0.015
      ).toFixed(2),
    ),
  );
  const reasons = triggeredRules.length
    ? triggeredRules.map((rule) => `${rule.name}: ${rule.reason}`).join(" ")
    : "No configured high-risk rule was triggered.";
  const factorSummary = positiveFactors
    .map((factor) => `${factor.dimension} (${factor.score} points)`)
    .join(", ");
  const signalNote = missingSignals.length
    ? ` Assessment confidence is limited because ${missingSignals.join(", ")} ${missingSignals.length === 1 ? "is" : "are"} unavailable.`
    : " The submitted payment includes the core device and geographic signals used by this assessment.";
  const aiExplanation =
    `${decision} recommendation: risk score ${riskScore}/100 with ${(confidence * 100).toFixed(0)}% signal confidence. ` +
    `${payment.currency} ${payment.amount.toLocaleString("en-US")} payment to ${payment.merchantName} ` +
    `using ${payment.paymentMethod} for ${payment.customerEmail}. ` +
    `Highest contributing dimensions: ${factorSummary || "none"}. ${reasons}${signalNote} ` +
    `This is a risk recommendation, not a finding of fraud; review the triggered evidence and transaction context before taking manual action.`;

  return {
    riskScore,
    decision,
    confidence,
    triggeredRules,
    featureContributions: contributions,
    aiExplanation,
  };
}
