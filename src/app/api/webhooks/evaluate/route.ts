import { NextResponse } from "next/server";
import {
  badRequest,
  currencies,
  isPrismaUniqueViolation,
  isRecord,
  paymentMethods,
  parseOptionalString,
  serverError,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { evaluatePayment, type PaymentInput } from "@/lib/risk-engine";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest("Request body must contain valid JSON.");
  }
  if (!isRecord(payload)) return badRequest("Request body must be a JSON object.");

  const requiredStrings = ["externalRef", "merchantName", "customerEmail"] as const;
  for (const field of requiredStrings) {
    if (
      typeof payload[field] !== "string" ||
      payload[field].trim().length === 0 ||
      payload[field].length > 255
    ) {
      return badRequest(`${field} must be a non-empty string of at most 255 characters.`);
    }
  }
  if (
    typeof payload.customerEmail !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.customerEmail)
  ) {
    return badRequest("customerEmail must be a valid email address.");
  }
  if (typeof payload.amount !== "number" || !Number.isFinite(payload.amount) || payload.amount <= 0) {
    return badRequest("amount must be a positive finite number.");
  }
  if (!currencies.includes(payload.currency as (typeof currencies)[number])) {
    return badRequest("currency must be INR or USD.");
  }
  if (!paymentMethods.includes(payload.paymentMethod as (typeof paymentMethods)[number])) {
    return badRequest("paymentMethod must be Card, UPI, NetBanking, or Wallet.");
  }
  if (payload.isProxy !== undefined && typeof payload.isProxy !== "boolean") {
    return badRequest("isProxy must be a boolean.");
  }

  const optionalFields = {
    cardBin: parseOptionalString(payload.cardBin, "cardBin", 8),
    cardLast4: parseOptionalString(payload.cardLast4, "cardLast4", 4),
    ipAddress: parseOptionalString(payload.ipAddress, "ipAddress", 45),
    ipCountry: parseOptionalString(payload.ipCountry, "ipCountry", 3),
    binCountry: parseOptionalString(payload.binCountry, "binCountry", 3),
    deviceFingerprint: parseOptionalString(payload.deviceFingerprint, "deviceFingerprint", 255),
  };
  const invalidOptional = Object.values(optionalFields).find((field) => field.error);
  if (invalidOptional?.error) return badRequest(invalidOptional.error);

  const payment: PaymentInput = {
    externalRef: (payload.externalRef as string).trim(),
    merchantName: (payload.merchantName as string).trim(),
    customerEmail: (payload.customerEmail as string).trim().toLowerCase(),
    amount: payload.amount,
    currency: payload.currency as PaymentInput["currency"],
    paymentMethod: payload.paymentMethod as PaymentInput["paymentMethod"],
    cardBin: optionalFields.cardBin.value,
    cardLast4: optionalFields.cardLast4.value,
    ipAddress: optionalFields.ipAddress.value,
    ipCountry: optionalFields.ipCountry.value,
    binCountry: optionalFields.binCountry.value,
    deviceFingerprint: optionalFields.deviceFingerprint.value,
    isProxy: payload.isProxy === true,
  };

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [rules, history] = await Promise.all([
      prisma.riskRule.findMany({ where: { enabled: true } }),
      prisma.transaction.findMany({
        where: {
          createdAt: { gte: since },
          OR: [
            { customerEmail: payment.customerEmail },
            ...(payment.deviceFingerprint
              ? [{ deviceFingerprint: payment.deviceFingerprint }]
              : []),
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
    ]);
    const evaluation = evaluatePayment(payment, rules, history);
    const transaction = await prisma.transaction.create({
      data: {
        ...payment,
        riskScore: evaluation.riskScore,
        decision: evaluation.decision,
        triggeredRules: JSON.stringify(evaluation.triggeredRules),
        featureContributions: JSON.stringify(evaluation.featureContributions),
        aiExplanation: evaluation.aiExplanation,
      },
    });

    return NextResponse.json(
      {
        transactionId: transaction.id,
        externalRef: transaction.externalRef,
        riskScore: evaluation.riskScore,
        decision: evaluation.decision,
        confidence: evaluation.confidence,
        triggeredRules: evaluation.triggeredRules,
        featureContributions: evaluation.featureContributions,
        aiExplanation: evaluation.aiExplanation,
      },
      { status: 201 },
    );
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      return NextResponse.json(
        { error: "A transaction with this externalRef already exists." },
        { status: 409 },
      );
    }
    console.error("Payment evaluation failed:", error);
    return serverError();
  }
}
