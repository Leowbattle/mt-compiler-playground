# syntax=docker/dockerfile:1

# ---------- Stage 1: build the Lean compiler ----------
# This branch uses the Lean port from compilers-labs, pinned to a commit.
# The Haskell/cw2 build lives on main.
FROM debian:bookworm-slim AS compiler

ARG COMPILER_REPO=https://github.com/Leowbattle/compilers-labs.git
# Pinned compiler commit (lean branch: Haskell layout + Lean port).
ARG COMPILER_REF=154f84746adced00690ca1dc74bba74b48533708

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git \
      ca-certificates \
      curl \
      xz-utils \
      libgmp10 \
      libstdc++6 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone "$COMPILER_REPO" . \
 && git checkout "$COMPILER_REF"

# elan installs the toolchain pinned by lean/lean-toolchain (4.36.0).
RUN curl -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh \
      | sh -s -- -y --default-toolchain none
ENV PATH="/root/.elan/bin:${PATH}"

RUN cd lean && lake build

RUN mkdir -p /out \
 && cp lean/.lake/build/bin/mtc /out/compiler \
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
