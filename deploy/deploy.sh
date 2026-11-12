#!/usr/bin/env bash
# Deploy the static site to dolfinid: site/ as committed at <commit>, plus the built data.
#
#   deploy/deploy.sh [commit]        default: HEAD
#
# Layout on the host (no container; nginx serves the files):
#   /srv/cplates/releases/<commit>/   one directory per release
#   /srv/cplates/current -> releases/<commit>   swapped atomically; rollback = point it back
#   /srv/cplates/acme/                certbot webroot
#   /srv/cplates/deploys.log          one line per deploy
#
# Order (devdocs guides/web/deployment.md §10–11):
#   1. the commit must already be on GitHub main (fetch + merge-base), else stop;
#   2. build the release, upload, swap `current`;
#   3. smoke check over https (pages 200, version.json = this commit); on failure stop, no pruning;
#   4. prune old releases: keep current + 2 (deploy/prune.sh). CPLATES_PRUNE=0 skips it.
set -euo pipefail
HOST=${CPLATES_HOST:-dolfinid}
URL=${CPLATES_URL:-https://cplates.nopeoplestime.info}
cd "$(dirname "$0")/.."
COMMIT=$(git rev-parse --short=7 "${1:-HEAD}")
FULL=$(git rev-parse "$COMMIT")

# 1. Only what is already on the remote main is deployed.
git fetch -q origin
git merge-base --is-ancestor "$COMMIT" origin/main || {
  echo "$COMMIT is not on origin/main: push it first (deploy only what GitHub main has)" >&2; exit 1; }

# The site must be exactly the commit's, and the data must be built.
git diff --quiet "$COMMIT" -- site || { echo "site/ differs from $COMMIT; commit or check out first" >&2; exit 1; }
for f in site/data/merdith2021/model.json site/data/muller2022/model.json site/data/cambrian/meta.json site/data/phanerozoic/meta.json site/data/section/meta.json; do
  [ -f "$f" ] || { echo "missing $f: run make frames cambrian phanerozoic section" >&2; exit 1; }
done

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
git archive "$COMMIT" site | tar -x -C "$STAGE"
cp -a site/data "$STAGE/site/data"
printf '{"commit":"%s","built":"%s"}\n' "$FULL" "$(date -u +%FT%TZ)" > "$STAGE/site/version.json"
echo "release $COMMIT: $(du -sh "$STAGE/site" | cut -f1)"

tar -czf - -C "$STAGE/site" . | ssh "$HOST" "set -e
  mkdir -p /srv/cplates/releases/$COMMIT.tmp /srv/cplates/acme
  tar -xzf - -C /srv/cplates/releases/$COMMIT.tmp
  chmod -R a+rX /srv/cplates/releases/$COMMIT.tmp
  rm -rf /srv/cplates/releases/$COMMIT
  mv /srv/cplates/releases/$COMMIT.tmp /srv/cplates/releases/$COMMIT
  previous=\$(readlink /srv/cplates/current 2>/dev/null || echo none)
  ln -sfn releases/$COMMIT /srv/cplates/current.new
  mv -T /srv/cplates/current.new /srv/cplates/current
  echo \"\$(date -u +%FT%TZ) $COMMIT (previous: \$previous)\" >> /srv/cplates/deploys.log
  echo \"current -> \$(readlink /srv/cplates/current) (previous: \$previous)\""

# 3. Smoke: the pages answer and the site says it is this commit.
for path in / /section/ /cambrian/ /phanerozoic/ /data/section/meta.json; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$URL$path")
  [ "$code" = 200 ] || { echo "smoke: $path → $code; not pruning. Roll back with the previous release (deploys.log)." >&2; exit 1; }
done
served=$(curl -s "$URL/version.json" | sed -n 's/.*"commit":"\([0-9a-f]*\)".*/\1/p')
[ "$served" = "$FULL" ] || { echo "smoke: version.json says '$served', not $FULL; not pruning" >&2; exit 1; }
echo "smoke: pages 200, version.json $COMMIT"

# 4. Old releases: keep current + 2.
if [ "${CPLATES_PRUNE:-1}" != 0 ]; then deploy/prune.sh; fi
