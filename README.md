# RazorShieldAI — Intelligent Payment Risk Manager

RazorShieldAI is a Next.js 15 App Router service for payment risk evaluation, analyst decisions, and risk-rule management. It uses Prisma with a local SQLite database.

## Getting started

```bash
npm install
npx prisma db push
npm run db:seed
npm run dev
```

The local database URL is configured in `.env` as `DATABASE_URL="file:./dev.db"`. The seed command is safe to rerun: seeded transactions are upserted by their external reference.

## API

- `POST /api/webhooks/evaluate` — validate and score a payment, then persist its verdict.
- `GET /api/transactions?search=...&decision=REVIEW&limit=50&offset=0` — search and filter transactions.
- `PATCH /api/transactions/:id` — set an analyst decision override. The request accepts `decision` (`APPROVE`, `REVIEW`, or `BLOCK`) and optional `actor` and `notes`; the change is recorded in `AuditLog`.
- `GET /api/rules` — list scoring rules.
- `PATCH /api/rules/:id` — update a rule's `enabled`, `weight`, or `thresholdValue`.
- `POST /api/rules/simulate` — preview historical impact for a proposed rule change without persisting it. Provide `ruleCode` and any proposed `enabled`, `weight`, or `thresholdValue` values.

The evaluator returns a score from 0 to 100, a recommendation (`APPROVE` below 40, `REVIEW` from 40 through 74, and `BLOCK` at 75 or above), confidence, triggered rules, five feature-dimension contributions, and an analyst-oriented explanation.
<img width="2880" height="1704" alt="Screenshot 2026-11-27 215708" src="https://github.com/user-attachments/assets/1c600e4c-1f56-46d5-948c-e0bdb5812f11" /> 
