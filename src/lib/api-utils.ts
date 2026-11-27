import { NextResponse } from "next/server";
import type { RiskDecision, SupportedCurrency, SupportedPaymentMethod } from "@/lib/risk-engine";

export const decisions: RiskDecision[] = ["APPROVE", "REVIEW", "BLOCK"];
export const currencies: SupportedCurrency[] = ["INR", "USD"];
export const paymentMethods: SupportedPaymentMethod[] = [
  "Card",
  "UPI",
  "NetBanking",
  "Wallet",
];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function serverError(message = "The request could not be completed.") {
  return NextResponse.json({ error: message }, { status: 500 });
}

export function isPrismaNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2025"
  );
}

export function isPrismaUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export function parseOptionalString(
  value: unknown,
  field: string,
  maxLength = 255,
): { value: string | null; error?: string } {
  if (value === undefined || value === null || value === "") return { value: null };
  if (typeof value !== "string" || value.length > maxLength) {
    return { value: null, error: `${field} must be a string of at most ${maxLength} characters.` };
  }
  return { value: value.trim() };
}
