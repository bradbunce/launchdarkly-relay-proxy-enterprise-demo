# syntax=docker/dockerfile:1
#
# Based on launchdarkly/ld-relay v8 with FIPS via Microsoft Go systemcrypto (OpenSSL):
# https://github.com/launchdarkly/ld-relay/blob/v8/Dockerfile
# https://github.com/microsoft/go/blob/microsoft/main/eng/doc/fips/README.md

ARG LD_RELAY_VERSION=8.16.4
ARG MS_GO_IMAGE=mcr.microsoft.com/oss/go/microsoft/golang:1.26-bookworm

FROM ${MS_GO_IMAGE} AS builder

ARG LD_RELAY_VERSION
ARG SRC_DIR=/go/ld-relay

RUN mkdir -p $SRC_DIR

WORKDIR $SRC_DIR

ADD https://github.com/launchdarkly/ld-relay/archive/refs/tags/v${LD_RELAY_VERSION}.tar.gz /tmp/ld-relay.tar.gz
RUN tar -xzf /tmp/ld-relay.tar.gz -C $SRC_DIR --strip-components=1 \
    && rm /tmp/ld-relay.tar.gz

ENV CGO_ENABLED=1
ENV GOOS=linux
# systemcrypto is default in Microsoft Go 1.25+; set explicitly for clarity
ENV GOEXPERIMENT=systemcrypto

RUN go build -a -o ldr .

FROM debian:bookworm-slim

RUN groupadd --gid 1000 ldr-user && \
    useradd --uid 1000 --gid ldr-user --create-home --shell /usr/sbin/nologin ldr-user && \
    mkdir /ldr && \
    chown ldr-user:ldr-user /ldr

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /go/ld-relay/ldr /usr/bin/ldr

USER 1000

EXPOSE 8030
ENV PORT=8030
ENTRYPOINT ["/usr/bin/ldr", "--config", "/ldr/ld-relay.conf", "--allow-missing-file", "--from-env"]
