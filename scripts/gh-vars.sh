#!/usr/bin/env bash
# Pushes every VITE_* line of web/.env to the GitHub repository variables used by .github/workflows/deploy.yml.
# Usage: scripts/gh-vars.sh [owner/repo]
set -euo pipefail
repo="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
while IFS='=' read -r key value; do
  [[ "$key" =~ ^VITE_ ]] || continue
  [[ -z "$value" ]] && { echo "skip $key (empty)"; continue; }
  gh variable set "$key" --repo "$repo" --body "$value" && echo "set $key"
done < web/.env
