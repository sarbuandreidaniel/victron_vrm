#!/usr/bin/env bash
# Release victron_vrm: bump the version, run the checks, commit, push main and wait for the GitHub release.
#
#   scripts/release.sh 0.10.2 "fix: tidier settings layout" [--dry-run]
#
# - Sets the version in manifest.json and VERSION in the card (they must always match; Setări shows it).
# - Runs node --check on the card and scripts/test_*.py with the parent repo's .venv_ha (or $PYTHON).
# - --dry-run stops after the checks and shows what would be committed; the bump stays in the
#   working tree, and running again without --dry-run continues from there.
# - Otherwise commits every change in this repository with the given message (add trailers such as
#   Co-Authored-By inside the message), pushes main, and waits until the Release workflow has
#   published v<version>. Installing it in Home Assistant is a separate step (HACS, then a restart).
set -euo pipefail

usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
[ $# -ge 2 ] || usage
NEW="$1"; MSG="$2"; DRY="${3:-}"
[[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must look like 1.2.3, got '$NEW'"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
MANIFEST=custom_components/victron_vrm/manifest.json
CARD=custom_components/victron_vrm/frontend/victron-vrm-card.js
PY="${PYTHON:-$ROOT/../../.venv_ha/bin/python}"
[ -x "$PY" ] || PY=python3

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = main ] || { echo "on branch '$BRANCH'; releases are cut from main"; exit 1; }
OLD="$(python3 -c "import json;print(json.load(open('$MANIFEST'))['version'])")"
if [ "$OLD" = "$NEW" ]; then
  # already bumped by a --dry-run: carry on if the card agrees
  grep -q "^const VERSION = '$NEW';" "$CARD" || { echo "manifest is at $NEW but the card VERSION is not"; exit 1; }
  BUMP=0
else
  BUMP=1
fi
if git ls-remote --tags origin "refs/tags/v$NEW" | grep -q .; then echo "tag v$NEW already exists on GitHub"; exit 1; fi

# 1. versions
[ "$BUMP" = 1 ] && python3 - "$MANIFEST" "$CARD" "$OLD" "$NEW" <<'EOF'
import sys
from pathlib import Path
manifest, card, old, new = sys.argv[1:]
for path, a, b in ((manifest, f'"version": "{old}"', f'"version": "{new}"'),
                   (card, f"const VERSION = '{old}';", f"const VERSION = '{new}';")):
    p = Path(path); s = p.read_text()
    if s.count(a) != 1:
        sys.exit(f"{path}: expected exactly one {a!r}; is the card VERSION in step with the manifest?")
    p.write_text(s.replace(a, b))
print(f"version {old} → {new}")
EOF

# 2. checks
node --check "$CARD"
for t in scripts/test_summary.py scripts/test_history.py scripts/test_frontend.py; do
  "$PY" "$t" > /dev/null && echo "ok $t"
done

if [ "$DRY" = "--dry-run" ]; then
  git status --short
  echo "dry run: nothing committed (the version bump stays in the working tree)"
  exit 0
fi

# 3. commit + push
git add -A
# after a --dry-run followed by a manual commit there may be nothing left to commit
if git diff --cached --quiet; then echo "nothing new to commit; pushing what is on main"; else git commit -q -m "$MSG"; fi
git push -q origin main
echo "pushed $(git rev-parse --short HEAD)"

# 4. wait for the Release workflow (public API; gh may not be logged in)
for _ in $(seq 1 40); do
  TAG="$(curl -s "https://api.github.com/repos/sarbuandreidaniel/victron_vrm/releases?per_page=1" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['tag_name'] if isinstance(d,list) and d else '')" 2>/dev/null || true)"
  [ "$TAG" = "v$NEW" ] && { echo "release v$NEW is published"; exit 0; }
  python3 -c "import time; time.sleep(10)"
done
echo "v$NEW not visible after ~7 minutes; check the Actions tab on GitHub"; exit 1
