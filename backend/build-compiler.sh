#!/usr/bin/env bash
# Build the Lean compiler used by the backend.
# This branch uses the Lean port; main uses the cw2 Haskell compiler.
# The source is cloned from GitHub (the same thing the Dockerfile does).
set -euo pipefail
cd "$(dirname "$0")"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${COMPILER_REPO:-https://github.com/Leowbattle/compilers-labs.git}"
# The compiler commit is defined only in the Dockerfile.
REF="$(sed -n 's/^ARG COMPILER_REF=//p' "$ROOT/Dockerfile" | head -n 1)"
if [ -z "$REF" ]; then
  echo "ARG COMPILER_REF not found in Dockerfile" >&2
  exit 1
fi
SRC=".compiler-src"

if [ ! -d "$SRC/.git" ]; then
  git clone "$REPO" "$SRC"
fi
git -C "$SRC" fetch origin
git -C "$SRC" checkout "$REF"

if ! command -v lake >/dev/null 2>&1; then
  echo "lake not found; install Lean/elan first (see https://lean-lang.org/lean4/doc/setup.html)" >&2
  exit 1
fi

(cd "$SRC/lean" && lake build)
cp "$SRC/lean/.lake/build/bin/mtc" compiler
echo "built $(pwd)/compiler (Lean, $REF)"
