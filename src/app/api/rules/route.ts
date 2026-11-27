import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rules = await prisma.riskRule.findMany({ orderBy: { code: "asc" } });
    return NextResponse.json({ rules });
  } catch (error) {
    console.error("Risk rules could not be loaded:", error);
    return NextResponse.json({ error: "Risk rules could not be loaded." }, { status: 500 });
  }
}
