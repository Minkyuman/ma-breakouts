#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

required_files=(
  "AGENTS.md"
  ".codex/notes/paper-trading.md"
  ".agents/skills/paper-trading-builder/SKILL.md"
  ".agents/skills/paper-trading-builder/agents/openai.yaml"
  ".agents/skills/paper-trading-builder/references/implementation-checklist.md"
  "_workspace/01_context.md"
  "_workspace/02_design.md"
  "_workspace/04_verification.md"
)

for relative_path in "${required_files[@]}"; do
  if [[ ! -s "$repo_root/$relative_path" ]]; then
    echo "missing or empty: $relative_path" >&2
    exit 1
  fi
done

required_rules=(
  "Google \`sub\`"
  "idempotency"
  "cash ledger"
  "quote timestamp"
  "FX snapshot"
  "do not expose participant email"
)

for rule in "${required_rules[@]}"; do
  if ! grep -Fqi "$rule" "$repo_root/AGENTS.md"; then
    echo "AGENTS.md is missing rule: $rule" >&2
    exit 1
  fi
done

echo "paper-trading harness: OK"

