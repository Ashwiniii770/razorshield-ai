import { NextResponse } from "next/server";
import {
  badRequest,
  isPrismaNotFound,
  isRecord,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest("Request body must contain valid JSON.");
  }
  if (!isRecord(payload)) return badRequest("Request body must be a JSON object.");

  const data: { enabled?: boolean; weight?: number; thresholdValue?: number } = {};
  if (payload.enabled !== undefined) {
    if (typeof payload.enabled !== "boolean") return badRequest("enabled must be a boolean.");
    data.enabled = payload.enabled;
  }
  for (const field of ["weight", "thresholdValue"] as const) {
    if (payload[field] === undefined) continue;
    if (typeof payload[field] !== "number" || !Number.isFinite(payload[field])) {
      return badRequest(`${field} must be a finite number.`);
    }
    if (field === "weight" && (payload.weight as number) < -100) {
      return badRequest("weight must be at least -100.");
    }
    if (field === "weight" && (payload.weight as number) > 100) {
      return badRequest("weight must be at most 100.");
    }
    if (field === "thresholdValue" && (payload.thresholdValue as number) < 0) {
      return badRequest("thresholdValue must be non-negative.");
    }
    data[field] = payload[field] as number;
  }
  if (Object.keys(data).length === 0) {
    return badRequest("Provide at least one of enabled, weight, or thresholdValue.");
  }

  const { id } = await context.params;
  try {
    const rule = await prisma.riskRule.update({ where: { id }, data });
    return NextResponse.json({ rule });
  } catch (error) {
    if (isPrismaNotFound(error)) {
      return NextResponse.json({ error: "Risk rule not found." }, { status: 404 });
    }
    console.error("Risk rule update failed:", error);
    return NextResponse.json({ error: "The risk rule could not be updated." }, { status: 500 });
  }
}
