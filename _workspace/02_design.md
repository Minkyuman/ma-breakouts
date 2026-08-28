# Harness design record

## Chosen structure

- Root `AGENTS.md` for concise repository-wide invariants and commands.
- `.codex/notes/paper-trading.md` as the durable product/architecture source of truth.
- `.agents/skills/paper-trading-builder/` as the repeatable workflow for future milestones.
- `_workspace/` for context, design rationale, and verification evidence.

## Decisions

- Use a season-based game with equal KRW starting capital.
- Use Google `sub` as identity and nickname as public identity.
- Use an immutable cash ledger and execution history as canonical records.
- Value Korean and US portfolios in KRW; retain native USD and FX snapshots.
- Use Supabase Free Postgres for transactional integrity and a later realtime leaderboard, connected to Vercel through its transaction pooler.
- Keep the first season private and non-prize because quote feeds are not exchange-grade real time.

## Rejected for now

- Extending the D1 starter directly: mismatched with current Vercel production.
- Firebase/Firestore: transactions exist, but relational ledger reconciliation and leaderboard queries require more duplicated projections.
- Neon: technically suitable, but Supabase was selected for its Postgres dashboard and future Realtime support.
- Client-side portfolio calculations as truth: replay and tampering risk.
- Ranking by absolute profit: return percentage is fairer and clearer.
- Exposing account email on the leaderboard: unnecessary privacy leak.
- Custom multi-agent orchestration: milestones share transaction/schema context; one agent is safer until independent workstreams exist.
- Plugin packaging: this workflow is repository-specific; a project-local skill is sufficient.
