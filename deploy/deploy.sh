#!/usr/bin/env bash
#
# Deploys the latest main on a server that runs Peerly under pm2
# (see ecosystem.config.cjs). Run it from anywhere:
#
#   bash /var/www/peerly/deploy/deploy.sh
#
# Why it exists: "npm run build" replaces the built files while the running
# web process still serves pages that point at the old ones. Until that process
# is restarted every page loads without its scripts and styles - the site is
# blank. Building and restarting as one step, then checking the result, keeps
# that window to seconds and says so if it did not close.
#
# It stops at the first failure and changes nothing it has not reached.

set -euo pipefail

cd "$(dirname "$0")/.."
echo "== Peerly deploy in $(pwd)"

echo "== 1/6 Fetching main"
git pull --ff-only
echo "   now at $(git log --oneline -1)"

echo "== 2/6 Installing dependencies"
npm ci --no-audit --no-fund
(cd server && npm ci --omit=dev --no-audit --no-fund)

echo "== 3/6 Applying database migrations"
# Take a backup first when a release adds one (technical handover section 6).
(cd server && node --experimental-strip-types src/db/migrate.ts up)

echo "== 4/6 Building the web app (low priority, so other sites come first)"
nice -n 19 npm run build

echo "== 5/6 Restarting Peerly"
pm2 reload ecosystem.config.cjs
sleep 4

echo "== 6/6 Checking"
web_port=$(node -e 'const a = require("./ecosystem.config.cjs").apps.find((x) => x.name === "peerly-web"); console.log(a.env.PORT)')
api_port=$(grep -E '^\s*PORT=' server/.env | tail -1 | cut -d= -f2 | tr -d ' ')

curl -fsS "http://127.0.0.1:${api_port}/health" >/dev/null || {
  echo "!! The API is not healthy. See: pm2 logs peerly-api"
  exit 1
}

failed=0
for asset in $(curl -fsS "http://127.0.0.1:${web_port}/" | grep -oE '/assets/[^"]+\.(js|css)' | sort -u); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${web_port}${asset}")
  if [ "$code" != "200" ]; then
    echo "!! ${asset} answered ${code}"
    failed=1
  fi
done
if [ "$failed" != "0" ]; then
  echo "!! The web app is serving pages whose files it cannot load. Run: pm2 restart peerly-web"
  exit 1
fi

echo "== Deployed $(git log --oneline -1). API healthy, every page asset loads."
