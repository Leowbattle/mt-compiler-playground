#!/usr/bin/env bash
# Build the Lean compiler used by the backend.
# This branch uses the Lean port; main uses the cw2 Haskell compiler.
# The source is cloned from GitHub (the same thing the Dockerfile does).
set -euo pipefail
cd "$(dirname "$0")"

REPO="${COMPILER_REPO:-https://github.com/Leowbattle/compilers-labs.git}"
# Pinned compiler commit (lean branch: Haskell layout + Lean port).
REF="${COMPILER_REF:-154f84746adced00690ca1dc74bba74b48533708}"
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
