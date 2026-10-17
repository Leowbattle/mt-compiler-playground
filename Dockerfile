# syntax=docker/dockerfile:1

# ---------- Stage 1: build the Haskell compiler ----------
# cw2 is cloned from GitHub at build time; nothing from the compiler is vendored.
FROM haskell:9.10.3-slim-bookworm AS compiler

ARG COMPILER_REPO=https://github.com/Leowbattle/compilers-labs.git
ARG COMPILER_REF=cw2

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone "$COMPILER_REPO" . \
 && git checkout "$COMPILER_REF"

RUN ghc -O2 -o /out/compiler Main.hs \
 && ldd /out/compiler

# ---------- Stage 2: runtime ----------
FROM node:20-bookworm-slim AS runtime

# rlwrap: readline (history, arrow keys) around the interpreter.
# libgmp10: required by the GHC runtime.
# python3/make/g++: build node-pty's native addon if no prebuild is available.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      rlwrap \
      libgmp10 \
      python3 \
      make \
      g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend/ ./
COPY --from=compiler /out/compiler /usr/local/bin/compiler

ENV PORT=8080 \
    COMPILER_BIN=/usr/local/bin/compiler \
    NODE_ENV=production

USER node
EXPOSE 8080
CMD ["node", "server.js"]
