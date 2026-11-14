#!/usr/bin/env bash
# Remove old releases on dolfinid: keep the one `current` points at and the KEEP newest others
# (rollback targets). Only directories named like a commit are touched.
#
#   deploy/prune.sh [--dry-run]        CPLATES_KEEP (default 2), CPLATES_HOST (default dolfinid)
#
# deploy.sh runs it after a passing smoke check, so the rollback target is never the one deleted.
set -euo pipefail
HOST=${CPLATES_HOST:-dolfinid}
KEEP=${CPLATES_KEEP:-2}
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1
case "$KEEP" in ''|*[!0-9]*) echo "CPLATES_KEEP must be a number" >&2; exit 1;; esac

ssh "$HOST" "set -euo pipefail
  cd /srv/cplates/releases
  current=\$(basename \"\$(readlink /srv/cplates/current)\")
  [ -n \"\$current\" ] && [ -d \"\$current\" ] || { echo 'no current release; nothing removed' >&2; exit 1; }
  # Newest first; only commit-named directories, never the current one.
  old=\$(ls -1t | grep -E '^[0-9a-f]{7,40}\$' | grep -vx \"\$current\" | tail -n +$((KEEP + 1)) || true)
  # || true: with no older release grep finds nothing and exits 1, which pipefail would turn
  # into a silent stop here (as on line 'old=' above).
  kept=\$(ls -1t | grep -E '^[0-9a-f]{7,40}\$' | grep -vx \"\$current\" | head -n $KEEP | tr '\n' ' ' || true)
  echo \"current \$current; keeping \${kept:-none}; removing \$(echo \${old:-none})\"
  [ $DRY = 1 ] && exit 0
  for r in \$old; do
    rm -rf -- \"/srv/cplates/releases/\$r\"
    echo \"\$(date -u +%FT%TZ) pruned \$r (current \$current)\" >> /srv/cplates/deploys.log
  done
  df -h /srv | tail -1"
