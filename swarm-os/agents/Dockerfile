# ── Stage 1: dependency cache ─────────────────────────────────────────────────
# Copy only manifests first so Docker layer-caches compiled deps separately
# from application source.  A source-only change skips the slow dep compile.
FROM rust:1.80-slim AS deps
WORKDIR /app

COPY Cargo.toml Cargo.lock* ./
COPY tashi-vertex-stub/Cargo.toml ./tashi-vertex-stub/

# Stub source files — enough for Cargo to compile every dependency.
RUN mkdir -p src tashi-vertex-stub/src \
 && echo 'fn main(){}' > src/main.rs \
 && touch src/types.rs src/auction.rs \
 && echo ''             > tashi-vertex-stub/src/lib.rs \
 && cargo build --release 2>&1 \
 # Remove the stub artefacts so the real source rebuild links correctly.
 && rm -rf target/release/.fingerprint/swarm-agent-* \
           target/release/.fingerprint/tashi-vertex-* \
           target/release/deps/swarm_agent* \
           target/release/deps/libtashi_vertex* \
           target/release/swarm-agent

# ── Stage 2: application build ────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY src                      ./src
COPY tashi-vertex-stub/src    ./tashi-vertex-stub/src
# Touch forces Cargo to recompile even if Docker mtime tricks it.
RUN touch src/main.rs src/types.rs src/auction.rs tashi-vertex-stub/src/lib.rs \
 && cargo build --release

# ── Stage 3: minimal runtime image ───────────────────────────────────────────
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates libssl3 \
 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/swarm-agent /usr/local/bin/swarm-agent
CMD ["swarm-agent"]
