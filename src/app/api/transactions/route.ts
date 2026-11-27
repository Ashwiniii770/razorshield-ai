import { NextResponse } from "next/server";
import { decisions } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();
  const decision = url.searchParams.get("decision");
  const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
  const requestedOffset = Number(url.searchParams.get("offset") ?? 0);

  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
    return NextResponse.json({ error: "limit must be an integer between 1 and 100." }, { status: 400 });
  }
  if (!Number.isInteger(requestedOffset) || requestedOffset < 0) {
    return NextResponse.json({ error: "offset must be a non-negative integer." }, { status: 400 });
  }
  if (decision && !decisions.includes(decision as (typeof decisions)[number])) {
    return NextResponse.json({ error: "decision must be APPROVE, REVIEW, or BLOCK." }, { status: 400 });
  }

  const where = {
    ...(decision ? { decision: decision as (typeof decisions)[number] } : {}),
    ...(search
      ? {
          OR: [
            { externalRef: { contains: search } },
            { merchantName: { contains: search } },
            { customerEmail: { contains: search } },
            { ipAddress: { contains: search } },
          ],
        }
      : {}),
  };

  try {
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: requestedOffset,
        take: requestedLimit,
        include: { auditLogs: { orderBy: { createdAt: "desc" } } },
      }),
      prisma.transaction.count({ where }),
    ]);

    return NextResponse.json({
      transactions: transactions.map((transaction) => ({
        ...transaction,
        triggeredRules: JSON.parse(transaction.triggeredRules),
        featureContributions: JSON.parse(transaction.featureContributions),
      })),
      total,
      limit: requestedLimit,
      offset: requestedOffset,
      hasMore: requestedOffset + transactions.length < total,
    });
  } catch (error) {
    console.error("Transaction search failed:", error);
    return NextResponse.json({ error: "Transactions could not be loaded." }, { status: 500 });
  }
}
