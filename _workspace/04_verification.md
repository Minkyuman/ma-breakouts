# Harness verification

Run from the repository root:

```bash
.agents/skills/paper-trading-builder/scripts/validate_harness.sh
python3 /Users/minkyuman/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/paper-trading-builder
```

Before implementing a milestone, verify:

- acceptance criteria come from `.codex/notes/paper-trading.md`;
- production DB, migration, reset, and deployment require explicit authorization;
- schema/order work includes concurrency, idempotency, reconciliation, auth, and privacy tests;
- UI changes preserve the existing screener and mobile interactions.

Implementation verification later adds `npm run lint` and `npm test`.

