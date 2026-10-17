#!/usr/bin/env bash
# Build the cw2 Haskell compiler used by the backend.
# The source is cloned from GitHub (the same thing the Dockerfile does).
set -euo pipefail
cd "$(dirname "$0")"

REPO="${COMPILER_REPO:-https://github.com/Leowbattle/compilers-labs.git}"
REF="${COMPILER_REF:-cw2}"
SRC=".compiler-src"
BUILD=".compiler-build"

if [ ! -d "$SRC/.git" ]; then
  git clone "$REPO" "$SRC"
fi
git -C "$SRC" fetch origin "$REF"
git -C "$SRC" checkout "$REF"

mkdir -p "$BUILD"
ghc -i"$SRC" -O2 -outputdir "$BUILD" -o compiler "$SRC/Main.hs"
echo "built $(pwd)/compiler"
