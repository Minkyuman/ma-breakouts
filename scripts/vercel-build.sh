#!/usr/bin/env bash
set -euo pipefail

if [[ "${RUN_DB_MIGRATIONS:-}" == "true" ]]; then
  npm run db:migrate
  npm run db:verify-research
fi

if [[ "${RUN_CLASSIFICATION_CACHE_WARM:-}" == "true" ]]; then
  tsx scripts/warm-market-ranking-classifications.ts
fi

if [[ "${RUN_US_MONTHLY_HISTORY_WARM:-}" == "true" ]]; then
  tsx scripts/warm-us-monthly-history.ts --stocks="${US_MONTHLY_HISTORY_WARM_STOCKS:-100}"
fi

NITRO_PRESET=vercel npm run build
