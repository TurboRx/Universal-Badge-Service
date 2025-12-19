#!/usr/bin/env bash
set -euo pipefail

# Functions
log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"; }

fetch_github_data() {
  local url=$1
  curl -s "${GITHUB_API_URL:-https://api.github.com}${url}"
}

create_badge() {
  local label=$1 message=$2 color=$3 file=$4
  if [[ -z "$message" ]]; then
    log "  • Skipping ${file}.svg (no valid data)"
    return 0
  fi
  curl -s "https://img.shields.io/static/v1?label=${label}&message=${message}&color=${color}&style=flat" > "docs/${file}.svg"
  log "  • ${file}.svg created"
}

# Parse colors
IFS=',' read -r COL1 COL2 COL3 COL4 <<< "${COLORS}"

# Fetch contributor stats
log "Fetching contributor stats for ${REPO}..."
CONTRIBUTOR_DATA=$(fetch_github_data "/repos/${REPO}/stats/contributors")

if [[ -n "$CONTRIBUTOR_DATA" ]] && jq -e 'type=="array"' >/dev/null 2>&1 <<<"$CONTRIBUTOR_DATA"; then
  TOTAL=$(jq length <<< "$CONTRIBUTOR_DATA")

  INDEX=$(jq -r 'map(.author.login) | index("'"${GITHUB_USER}"'")' <<< "$CONTRIBUTOR_DATA")

  if [[ "$INDEX" != "null" ]]; then
    COMMITS=$(jq ".[$INDEX].total" <<< "$CONTRIBUTOR_DATA")
    RANK=$((TOTAL - INDEX))
  else
    log "  • GITHUB_USER not found in contributors"
    COMMITS=""
    RANK=""
  fi
else
  log "  • Contributor stats not ready yet"
  COMMITS=""
  RANK=""
fi


# Fetch open PR count
log "Fetching open pull requests for ${GITHUB_USER}..."
PRS_DATA=$(fetch_github_data "/search/issues?q=repo:${REPO}+is:pr+is:open+draft:false+author:${GITHUB_USER}")
if [[ -n "$PRS_DATA" ]]; then
  OPEN_PRS=$(jq '.total_count' <<< "$PRS_DATA")
fi

# Fetch latest commit info
log "Fetching latest commit for ${GITHUB_USER}..."
COMMITS_DATA=$(fetch_github_data "/repos/${REPO}/commits?author=${GITHUB_USER}&per_page=1")

if [[ -n "$COMMITS_DATA" ]] && jq -e 'type=="array" and length>0' >/dev/null 2>&1 <<<"$COMMITS_DATA"; then
  LAST_COMMIT=$(jq '.[0]' <<< "$COMMITS_DATA")

  TIMESTAMP=$(jq -r '.commit.committer.date // empty' <<< "$LAST_COMMIT")
  RAW_MSG=$(jq -r '.commit.message // empty' <<< "$LAST_COMMIT" | head -n1 | sed 's/"/\\"/g')
  LAST_SHA=$(jq -r '.sha // empty' <<< "$LAST_COMMIT")

  if [[ -n "$TIMESTAMP" ]]; then
    UNIX_TS=$(date -d "$TIMESTAMP" +%s)
    REL_TIME=$(curl -s "https://img.shields.io/date/${UNIX_TS}.json" | jq -r '.value // empty')

    MSG=$(echo "$RAW_MSG" | sed 's/(#[0-9]\+)//g' | tr -d '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    COMBINED_ESC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "${REL_TIME} | ${MSG}")
  else
    log "  • No valid commit timestamp"
    COMBINED_ESC=""
    LAST_SHA=""
  fi
else
  log "  • No commits found for GITHUB_USER"
  COMBINED_ESC=""
  LAST_SHA=""
fi

# Prepare badges
log "Generating badges..."
mkdir -p docs

create_badge "contributor" "%23${RANK}" "$COL1" "contributor"
create_badge "commits" "${COMMITS}" "$COL2" "commits"
create_badge "open%20pull%20requests" "${OPEN_PRS}" "$COL3" "open-pull-requests"
create_badge "last%20commit" "${COMBINED_ESC}" "$COL4" "last-commit"

# Create latest commit redirect
cat > docs/latest-commit.html <<EOF
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Latest commit for ${GITHUB_USER}</title>
  <meta http-equiv="refresh" content="0;url=https://github.com/${REPO}/commit/${LAST_SHA}">
  <link rel="canonical" href="https://github.com/${REPO}/commit/${LAST_SHA}">
</head>
<body>
  <p>Redirecting to the latest commit… <a href="https://github.com/${REPO}/commit/${LAST_SHA}">click here</a>.</p>
</body>
</html>
EOF

touch docs/.nojekyll