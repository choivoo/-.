#!/bin/bash
# Full EP01 production chain. Safe to re-run: finished cuts are skipped via the verified render cache.
cd "$(dirname "$0")/../.." || exit 1
export NODE_ENV=production
echo "[chain] pilot S01 $(date -Is)"; npm run -s production:render-scene -- --scene S01 || echo "[chain] pilot reported errors"
echo "[chain] render-all $(date -Is)"; npm run -s production:render-all || echo "[chain] render-all reported errors"
echo "[chain] assemble $(date -Is)"; npm run -s production:assemble || echo "[chain] assemble refused/failed"
echo "[chain] report $(date -Is)"; npm run -s production:report
echo "[chain] done $(date -Is)"
