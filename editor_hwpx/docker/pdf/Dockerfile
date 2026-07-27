# syntax=docker/dockerfile:1.7
FROM rust:1.93.1-bookworm AS builder

WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY examples ./examples
COPY saved ./saved
COPY samples/hwpx/ref/ref_empty.hwpx ./samples/hwpx/ref/ref_empty.hwpx

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --locked --release --bin rhwp \
    && cp /src/target/release/rhwp /tmp/rhwp

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        fontconfig \
        fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /tmp/rhwp /usr/local/bin/rhwp

USER 65532:65532
ENTRYPOINT ["/usr/local/bin/rhwp"]
