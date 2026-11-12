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
set -euo pipefail
HOST=${CPLATES_HOST:-dolfinid}
cd "$(dirname "$0")/.."
COMMIT=$(git rev-parse --short=7 "${1:-HEAD}")

# The site must be exactly the commit's, and the data must be built.
git diff --quiet "$COMMIT" -- site || { echo "site/ differs from $COMMIT; commit or check out first" >&2; exit 1; }
for f in site/data/muller2022/model.json site/data/cambrian/meta.json; do
  [ -f "$f" ] || { echo "missing $f: run make frames cambrian" >&2; exit 1; }
done

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
git archive "$COMMIT" site | tar -x -C "$STAGE"
cp -a site/data "$STAGE/site/data"
printf '{"commit":"%s","built":"%s"}\n' "$(git rev-parse "$COMMIT")" "$(date -u +%FT%TZ)" > "$STAGE/site/version.json"
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
