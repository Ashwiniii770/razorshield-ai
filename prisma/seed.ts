import {
  evaluatePayment,
  type PaymentInput,
  type RiskRuleInput,
  type TransactionHistory,
} from "../src/lib/risk-engine";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ruleFixtures = [
  {
    code: "VEL_BURST",
    name: "Velocity burst",
    category: "Velocity",
    thresholdValue: 4,
    weight: 28,
    description: "Escalates when a customer submits four or more payments in one hour.",
  },
  {
    code: "GEO_MISMATCH",
    name: "Geographic mismatch",
    category: "Geo & IP Mismatch",
    thresholdValue: 1,
    weight: 26,
    description: "Flags transactions where the IP country differs from the card BIN country.",
  },
  {
    code: "PROXY_ASN",
    name: "Proxy or anonymizing IP",
    category: "Device Trust",
    thresholdValue: 1,
    weight: 22,
    description: "Raises risk when the originating IP is identified as a proxy or anonymizer.",
  },
  {
    code: "HIGH_VAL_NEW_DEV",
    name: "High value from new device",
    category: "Amount Anomaly",
    thresholdValue: 250_000,
    weight: 25,
    description: "Flags a new device submitting a payment worth at least INR 250,000.",
  },
  {
    code: "RETRY_ESCALATION",
    name: "Repeated payment attempts",
    category: "Velocity",
    thresholdValue: 3,
    weight: 16,
    description: "Escalates three or more similarly sized payments from one customer in 24 hours.",
  },
  {
    code: "TRUSTED_REPEAT",
    name: "Trusted repeat customer",
    category: "Velocity",
    thresholdValue: 3,
    weight: -10,
    description: "Reduces velocity risk for a returning customer with several recent payments.",
  },
] as const;

const customers = [
  "anika.shah@example.test",
  "rohan.mehta@example.test",
  "priya.iyer@example.test",
  "kabir.khan@example.test",
  "maya.nair@example.test",
  "arjun.reddy@example.test",
  "zoe.carter@example.test",
  "liam.brooks@example.test",
  "sana.kapoor@example.test",
  "noah.miller@example.test",
  "tara.desai@example.test",
  "dev.patel@example.test",
];
const merchants = [
  "Northstar Market",
  "Blue Lotus Travel",
  "Cedar & Stone",
  "Orbit Electronics",
  "Harborline Books",
  "Mosaic Home",
  "Summit Fitness",
  "Juniper Digital",
];
const methods: PaymentInput["paymentMethod"][] = ["Card", "UPI", "NetBanking", "Wallet"];
const cardBins = ["411111", "522222", "401288", "543210"];

type SeedPayment = PaymentInput & { createdAt: Date };

function paymentFixture(index: number, createdAt: Date): SeedPayment {
  const method = methods[index % methods.length];
  const currency: PaymentInput["currency"] = index % 5 === 0 || index % 7 === 0 ? "USD" : "INR";
  const amountInCurrency =
    currency === "USD"
      ? [18.5, 72.9, 149, 480, 1_250, 3_900][index % 6]
      : [850, 3_600, 12_500, 48_000, 125_000, 325_000, 680_000][index % 7];
  const suspiciousCluster = index % 13 === 0 || index % 13 === 1;
  const ipCountry = suspiciousCluster ? (currency === "INR" ? "US" : "IN") : currency === "INR" ? "IN" : "US";
  const customerIndex = index < 5 ? 0 : (index * 7) % customers.length;
  const hoursAgo = index < 5 ? index / 12 : ((index - 5) * 23.1) / 55;
  const minuteJitter = index % 4;

  return {
    externalRef: `seed-txn-${String(index + 1).padStart(3, "0")}`,
    merchantName: merchants[(index * 3) % merchants.length],
    customerEmail: customers[customerIndex],
    amount: amountInCurrency,
    currency,
    paymentMethod: method,
    cardBin: method === "Card" ? cardBins[index % cardBins.length] : null,
    cardLast4: method === "Card" ? String(1000 + ((index * 173) % 9000)) : null,
    ipAddress: currency === "INR" ? `103.21.${(index * 11) % 255}.${(index * 17) % 255}` : `198.51.${(index * 7) % 255}.${(index * 19) % 255}`,
    ipCountry,
    binCountry: method === "Card" ? (suspiciousCluster ? (ipCountry === "IN" ? "US" : "IN") : currency === "INR" ? "IN" : "US") : null,
    deviceFingerprint: `device-${String((index * 11) % 17).padStart(2, "0")}`,
    isProxy: index % 11 === 0,
    createdAt: new Date(createdAt.getTime() - hoursAgo * 60 * 60 * 1000 - minuteJitter * 60 * 1000),
  };
}

async function main() {
  for (const rule of ruleFixtures) {
    await prisma.riskRule.upsert({
      where: { code: rule.code },
      update: rule,
      create: rule,
    });
  }

  const rules: RiskRuleInput[] = ruleFixtures.map((rule) => ({
    code: rule.code,
    name: rule.name,
    thresholdValue: rule.thresholdValue,
    weight: rule.weight,
    enabled: true,
  }));
  const seedTime = new Date();
  const payments = Array.from({ length: 60 }, (_, index) =>
    paymentFixture(index, seedTime),
  ).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const history: TransactionHistory[] = [];

  for (const payment of payments) {
    const evaluation = evaluatePayment(payment, rules, history);
    await prisma.transaction.upsert({
      where: { externalRef: payment.externalRef },
      update: {
        ...payment,
        riskScore: evaluation.riskScore,
        decision: evaluation.decision,
        analystOverride: null,
        triggeredRules: JSON.stringify(evaluation.triggeredRules),
        featureContributions: JSON.stringify(evaluation.featureContributions),
        aiExplanation: evaluation.aiExplanation,
        createdAt: payment.createdAt,
      },
      create: {
        ...payment,
        riskScore: evaluation.riskScore,
        decision: evaluation.decision,
        triggeredRules: JSON.stringify(evaluation.triggeredRules),
        featureContributions: JSON.stringify(evaluation.featureContributions),
        aiExplanation: evaluation.aiExplanation,
        createdAt: payment.createdAt,
      },
    });
    history.push({
      customerEmail: payment.customerEmail,
      amount: payment.amount,
      currency: payment.currency,
      paymentMethod: payment.paymentMethod,
      ipAddress: payment.ipAddress,
      deviceFingerprint: payment.deviceFingerprint,
      createdAt: payment.createdAt,
    });
  }
  console.log(`Seeded ${payments.length} transactions and ${ruleFixtures.length} active risk rules.`);
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
