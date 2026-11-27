import type { RiskDimension, TriggeredRiskRule } from "@/lib/risk-engine";

export type Decision = "APPROVE" | "REVIEW" | "BLOCK";

export interface UiAuditLog {
  id: string;
  transactionId: string;
  actor: string;
  action: string;
  notes: string | null;
  createdAt: string;
}

export interface UiTransaction {
  id: string;
  externalRef: string;
  merchantName: string;
  customerEmail: string;
  amount: number;
  currency: "INR" | "USD";
  paymentMethod: "Card" | "UPI" | "NetBanking" | "Wallet";
  cardBin: string | null;
  cardLast4: string | null;
  ipAddress: string | null;
  ipCountry: string | null;
  binCountry: string | null;
  deviceFingerprint: string | null;
  isProxy: boolean;
  riskScore: number;
  decision: Decision;
  analystOverride: Decision | null;
  triggeredRules: TriggeredRiskRule[];
  featureContributions: Record<RiskDimension, number>;
  aiExplanation: string;
  createdAt: string;
  auditLogs: UiAuditLog[];
}

export interface TransactionListResponse {
  transactions: UiTransaction[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface RuleRecord {
  id: string;
  code: string;
  name: string;
  category: string;
  thresholdValue: number;
  weight: number;
  enabled: boolean;
  description: string;
  updatedAt: string;
}

export const riskDimensionLabels: RiskDimension[] = [
  "Velocity",
  "Geo & IP Mismatch",
  "Device Trust",
  "Amount Anomaly",
  "Payment Method / BIN",
];
