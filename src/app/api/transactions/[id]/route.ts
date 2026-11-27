import { NextResponse } from "next/server";
import {
  badRequest,
  decisions,
  isPrismaNotFound,
  isRecord,
  parseOptionalString,
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
  const request3ds = payload.action === "REQUEST_3DS";
  if (!request3ds && !decisions.includes(payload.decision as (typeof decisions)[number])) {
    return badRequest("decision must be APPROVE, REVIEW, or BLOCK.");
  }
  if (payload.action !== undefined && !request3ds) {
    return badRequest("action must be REQUEST_3DS.");
  }

  const actor = parseOptionalString(payload.actor, "actor", 100);
  const notes = parseOptionalString(payload.notes, "notes", 1000);
  if (actor.error) return badRequest(actor.error);
  if (notes.error) return badRequest(notes.error);

  const { id } = await context.params;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.transaction.findUniqueOrThrow({ where: { id } });
      const updated = request3ds
        ? current
        : await tx.transaction.update({
            where: { id },
            data: {
              decision: payload.decision as (typeof decisions)[number],
              analystOverride: payload.decision as (typeof decisions)[number],
            },
          });
      const auditLog = await tx.auditLog.create({
        data: {
          transactionId: id,
          actor: actor.value || "Analyst",
          action: request3ds ? "REQUEST_3DS" : "DECISION_OVERRIDE",
          notes:
            notes.value ||
            (request3ds
              ? "A 3DS challenge was requested by the analyst."
              : `Decision changed from ${current.decision} to ${payload.decision as string}.`),
        },
      });
      return { transaction: updated, auditLog };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (isPrismaNotFound(error)) {
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    }
    console.error("Analyst override failed:", error);
    return NextResponse.json({ error: "The analyst override could not be saved." }, { status: 500 });
  }
}
