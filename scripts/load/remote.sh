#!/usr/bin/env bash
# Runs the k6 scenarios from Google Cloud Shell (europe-west1, ~15 MB/s up, 170 MB/s down): a laptop on a
# Conakry hotspot cannot push 50 uploads a second. Needs a fresh `gcloud auth login` (Cloud Shell is per user).
#
#   node scripts/load/prepare.mjs --users=600        # first, on the laptop (tokens last one hour)
#   scripts/load/remote.sh submissions               # 50/s for 60 s
#   scripts/load/remote.sh viewers                   # 2 000 viewers for 4 min
#   scripts/load/remote.sh both                      # viewers, then submissions on top after 75 s
#   scripts/load/remote.sh signup 300                # more users, from Cloud Shell's IP, merged into users.json
#   RATE=20 DURATION=30s scripts/load/remote.sh submissions
#
# Results: scripts/out/load/results/<scenario>-<timestamp>.txt (k6 summary) and .json (--summary-export).
set -euo pipefail
cd "$(dirname "$0")/../.."
what="${1:-both}"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p scripts/out/load/results
# Transport: gcloud by default; CS_HOST + CS_KEY (a key registered with the Cloud Shell API) use plain ssh instead.
if [ -n "${CS_HOST:-}" ]; then
  SSH_OPTS=(-i "$CS_KEY" -p 6000 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR)
  cs_ssh() { ssh "${SSH_OPTS[@]}" "ousmane@$CS_HOST" "$1"; }
  cs_scp() { scp "${SSH_OPTS[@]/-p/-P}" "$1" "ousmane@$CS_HOST:$2"; }
else
  cs_ssh() { gcloud cloud-shell ssh --authorize-session --quiet --command="$1"; }
  cs_scp() { gcloud cloud-shell scp "localhost:$1" "cloudshell:$2"; }
fi

echo "» syncing scripts and the user pool to Cloud Shell"
tar czf /tmp/mur-load.tgz scripts/load/*.js scripts/out/load/users.json scripts/out/load/images
cs_scp /tmp/mur-load.tgz '~/mur-load.tgz'
cs_ssh 'mkdir -p ~/mur && tar xzf ~/mur-load.tgz -C ~/mur && ([ -x ~/k6 ] || (curl -sL https://github.com/grafana/k6/releases/download/v2.2.0/k6-v2.2.0-linux-amd64.tar.gz | tar xz --strip-components=1 -C ~ k6-v2.2.0-linux-amd64/k6)) && ~/k6 version'

run() { # scenario, extra env
  local name=$1; shift
  local envs=""
  for kv in "$@"; do envs+="-e $kv "; done
  echo "» k6 $name $envs"
  cs_ssh "cd ~/mur/scripts/load && ~/k6 run $envs --summary-export=/tmp/$name.json $name.js; cat /tmp/$name.json" \
    | tee "scripts/out/load/results/$name-$stamp.txt" >/dev/null
  # the JSON summary is the tail of the transcript, after the last k6 line
  awk 'f{print} /^\{/{f=1;print}' "scripts/out/load/results/$name-$stamp.txt" > "scripts/out/load/results/$name-$stamp.json" || true
  grep -E "✓|✗|http_req_failed|_ms\.|participant|rate_limited|checks" "scripts/out/load/results/$name-$stamp.txt" | head -40
}

# signup N: create N anonymous users from Cloud Shell's IP (Identity Toolkit throttles ~100 rapid sign-ups per IP)
# and merge them into scripts/out/load/users.json. Needs the web API key from web/.env (public by design).
if [ "$what" = signup ]; then
  n="${2:-200}"
  key=$(grep '^VITE_FIREBASE_API_KEY=' web/.env | cut -d= -f2)
  echo "» $n anonymous sign-ups from Cloud Shell"
  cs_ssh "ok=0; : > /tmp/users.jsonl; wait=5; i=0; while [ \$ok -lt $n ]; do r=\$(curl -s -X POST 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$key' -H 'Content-Type: application/json' -d '{\"returnSecureToken\":true}'); if echo \"\$r\" | grep -q localId; then echo \"\$r\" | tr -d '\n' >> /tmp/users.jsonl; echo >> /tmp/users.jsonl; ok=\$((ok+1)); wait=5; sleep 0.3; else echo \"throttled at \$ok, waiting \$wait s\"; sleep \$wait; wait=\$((wait*2)); [ \$wait -gt 120 ] && wait=120; fi; done; echo \"\$ok users created\"; cat /tmp/users.jsonl" \
    | awk '/^\{/' > /tmp/mur-signups.jsonl
  node -e '
    const fs = require("fs"); const f = "scripts/out/load/users.json";
    const pool = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : { createdAt: new Date().toISOString(), appCheck: null, users: [] };
    const seen = new Set(pool.users.map((u) => u.uid)); let added = 0;
    for (const line of fs.readFileSync("/tmp/mur-signups.jsonl", "utf8").split("\n")) { if (!line.trim()) continue; const j = JSON.parse(line); if (seen.has(j.localId)) continue; pool.users.push({ uid: j.localId, idToken: j.idToken, refreshToken: j.refreshToken }); added++; }
    fs.writeFileSync(f, JSON.stringify(pool)); console.log(`${added} users merged · pool = ${pool.users.length} users · ${pool.users.length * 5} submissions`);'
  exit 0
fi

case "$what" in
  submissions) run submissions "RATE=${RATE:-50}" "DURATION=${DURATION:-60s}" ;;
  viewers) run viewers "VIEWERS=${VIEWERS:-2000}" "HOLD=${HOLD:-4m}" ;;
  both)
    run viewers "VIEWERS=${VIEWERS:-2000}" "HOLD=${HOLD:-4m}" &
    sleep 75
    run submissions "RATE=${RATE:-50}" "DURATION=${DURATION:-60s}"
    wait ;;
  *) echo "usage: $0 submissions|viewers|both|signup N"; exit 1 ;;
esac
echo "» results in scripts/out/load/results/*-$stamp.*"
