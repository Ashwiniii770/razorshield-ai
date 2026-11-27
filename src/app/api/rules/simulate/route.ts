import { NextResponse } from "next/server";
import {
  badRequest,
  isRecord,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  evaluatePayment,
  type PaymentInput,
  type RiskRuleInput,
  type TransactionHistory,
} from "@/lib/risk-engine";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest("Request body must contain valid JSON.");
  }
  if (!isRecord(payload)) return badRequest("Request body must be a JSON object.");
  if (typeof payload.ruleCode !== "string" || payload.ruleCode.trim().length === 0) {
    return badRequest("ruleCode is required.");
  }
  if (payload.enabled !== undefined && typeof payload.enabled !== "boolean") {
    return badRequest("enabled must be a boolean.");
  }
  if (
    payload.weight !== undefined &&
    (typeof payload.weight !== "number" ||
      !Number.isFinite(payload.weight) ||
      payload.weight < -100 ||
      payload.weight > 100)
  ) {
    return badRequest("weight must be a finite number between -100 and 100.");
  }
  if (
    payload.thresholdValue !== undefined &&
    (typeof payload.thresholdValue !== "number" ||
      !Number.isFinite(payload.thresholdValue) ||
      payload.thresholdValue < 0)
  ) {
    return badRequest("thresholdValue must be a non-negative finite number.");
  }
  const proposedEnabled = typeof payload.enabled === "boolean" ? payload.enabled : undefined;
  const proposedWeight = typeof payload.weight === "number" ? payload.weight : undefined;
  const proposedThreshold =
    typeof payload.thresholdValue === "number" ? payload.thresholdValue : undefined;

  try {
    const [rules, transactions] = await Promise.all([
      prisma.riskRule.findMany({ orderBy: { code: "asc" } }),
      prisma.transaction.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        orderBy: { createdAt: "asc" },
        take: 1000,
      }),
    ]);
    const targetIndex = rules.findIndex((rule) => rule.code === payload.ruleCode);
    if (targetIndex === -1) return NextResponse.json({ error: "Risk rule not found." }, { status: 404 });

    const rulesBefore: RiskRuleInput[] = rules;
    const rulesAfter = rules.map((rule, index) =>
      index === targetIndex
        ? {
            ...rule,
            ...(proposedEnabled !== undefined ? { enabled: proposedEnabled } : {}),
            ...(proposedWeight !== undefined ? { weight: proposedWeight } : {}),
            ...(proposedThreshold !== undefined
              ? { thresholdValue: proposedThreshold }
              : {}),
          }
        : rule,
    );
    const history: TransactionHistory[] = transactions.map((transaction) => ({
      customerEmail: transaction.customerEmail,
      amount: transaction.amount,
      currency: transaction.currency,
      paymentMethod: transaction.paymentMethod,
      ipAddress: transaction.ipAddress,
      deviceFingerprint: transaction.deviceFingerprint,
      createdAt: transaction.createdAt,
    }));

    const impact = {
      evaluated: 0,
      changedDecision: 0,
      decisionsBefore: { APPROVE: 0, REVIEW: 0, BLOCK: 0 },
      decisionsAfter: { APPROVE: 0, REVIEW: 0, BLOCK: 0 },
      averageScoreBefore: 0,
      averageScoreAfter: 0,
      examples: [] as Array<{
        externalRef: string;
        before: { riskScore: number; decision: string };
        after: { riskScore: number; decision: string };
      }>,
    };
    let scoreBeforeTotal = 0;
    let scoreAfterTotal = 0;

    for (let index = 0; index < transactions.length; index += 1) {
      const transaction = transactions[index];
      const payment: PaymentInput = {
        externalRef: transaction.externalRef,
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
      };
      const previousHistory = history
        .slice(0, index)
        .filter((record) => record.createdAt < transaction.createdAt);
      const before = evaluatePayment(payment, rulesBefore, previousHistory);
      const after = evaluatePayment(payment, rulesAfter, previousHistory);

      impact.evaluated += 1;
      impact.decisionsBefore[before.decision] += 1;
      impact.decisionsAfter[after.decision] += 1;
      scoreBeforeTotal += before.riskScore;
      scoreAfterTotal += after.riskScore;
      if (before.decision !== after.decision) {
        impact.changedDecision += 1;
        if (impact.examples.length < 10) {
          impact.examples.push({
            externalRef: transaction.externalRef,
            before: { riskScore: before.riskScore, decision: before.decision },
            after: { riskScore: after.riskScore, decision: after.decision },
          });
        }
      }
    }

    if (impact.evaluated > 0) {
      impact.averageScoreBefore = Number((scoreBeforeTotal / impact.evaluated).toFixed(2));
      impact.averageScoreAfter = Number((scoreAfterTotal / impact.evaluated).toFixed(2));
    }
    return NextResponse.json({
      ruleCode: payload.ruleCode,
      proposed: {
        enabled: rulesAfter[targetIndex].enabled,
        weight: rulesAfter[targetIndex].weight,
        thresholdValue: rulesAfter[targetIndex].thresholdValue,
      },
      impact,
      persisted: false,
    });
  } catch (error) {
    console.error("Risk simulation failed:", error);
    return NextResponse.json({ error: "Historical risk simulation failed." }, { status: 500 });
  }
}
