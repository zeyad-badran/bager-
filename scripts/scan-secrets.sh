#!/usr/bin/env bash
# =============================================================================
# Scans the repository for things that look like secrets.
#
# Serves:  CLAUDE.md hard rule 2 (no production credentials, service-role keys or POS
#          credentials in the repo), blueprint §14.1.
#
# What it scans: every tracked file plus untracked files that are not git-ignored, so a
#                secret is caught BEFORE it is committed.
# What it is:    a tripwire with a short list of well-known shapes (private keys, cloud and
#                GitHub tokens, JWTs, database URLs with a password for a non-local host).
#                It cannot find every secret; it is a safety net, not a guarantee.
# Local database URLs (127.0.0.1 / localhost) are allowed: they carry throwaway passwords.
#
# Exit status: 0 = nothing found, 1 = something suspicious (lines printed, values masked).
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

# This script and its pattern list would match themselves.
SELF="scripts/scan-secrets.sh"

# name|extended-regex   (grep -P, so negative lookahead is available)
PATTERNS=(
  'private key|-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'AWS access key id|AKIA[0-9A-Z]{16}'
  'GitHub token|(ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}'
  'Stripe-style secret key|sk_(live|test)_[A-Za-z0-9]{16,}'
  'Supabase secret or access token|sb_secret_[A-Za-z0-9_-]{10,}|sbp_[a-f0-9]{30,}'
  'JWT (service-role / anon keys look like this)|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
  'database URL with password on a non-local host|postgres(ql)?://[^:/@\s]+:[^@\s]+@(?!127\.0\.0\.1|localhost|\$|<|\{)[A-Za-z0-9.-]+'
)

found=0
while IFS= read -r -d '' file; do
  [[ "$file" == "$SELF" ]] && continue
  [[ -f "$file" ]] || continue
  for entry in "${PATTERNS[@]}"; do
    name="${entry%%|*}"
    regex="${entry#*|}"
    # -I skips binary files; -o prints only the match so we can mask it.
    while IFS= read -r hit; do
      line="${hit%%:*}"
      value="${hit#*:}"
      printf 'SECRET?  %s:%s  [%s]  %s…\n' "$file" "$line" "$name" "${value:0:6}"
      found=1
    done < <(grep -InoP -- "$regex" "$file" || true)
  done
done < <(git ls-files -z --cached --others --exclude-standard)

if [[ "$found" -ne 0 ]]; then
  echo
  echo "Possible secret(s) found. Remove them, rotate the credential if it was real," >&2
  echo "and keep real values in the host's secret store (CLAUDE.md rule 2)." >&2
  exit 1
fi
echo "Secret scan: nothing suspicious found."
