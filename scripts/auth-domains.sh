#!/usr/bin/env bash
# Adds guineen68.com (+ www) to Firebase Auth authorized domains on guinea68.
# Usage: bash scripts/auth-domains.sh
set -euo pipefail
TOKEN=$(gcloud auth application-default print-access-token)
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-user-project: guinea68" \
  -H "Content-Type: application/json" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/guinea68/config?updateMask=authorizedDomains" \
  -d '{"authorizedDomains":["localhost","guinea68.firebaseapp.com","guinea68.web.app","theblackdude.github.io","guineen68.com","www.guineen68.com"]}' \
  | python3 -c "import sys,json; c=json.load(sys.stdin); print(c.get('authorizedDomains') or c)"
