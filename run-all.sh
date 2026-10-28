#!/bin/sh
# Run every repro and refresh evidence/*/output.txt.
set -u
cd "$(dirname "$0")" || exit 1
fail=0
for dir in evidence/*/; do
  name=$(basename "$dir")
  printf '%-34s ' "$name"
  if node "${dir}repro.mjs" > "${dir}output.txt" 2>&1; then
    echo "reproduced"
  else
    echo "DID NOT REPRODUCE"
    fail=$((fail + 1))
  fi
done
exit $fail
