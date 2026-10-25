# ADR-0002: Upstash instead of Redis Cloud; no HMAC envelope

- Status: Accepted
- Date: 2026-10-24
- Deciders: owner, api-cache agent
- Related: D-02, GAP-CAC-01

## Context
Redis Cloud's free tier was deprecated/archived, and earlier prototypes used an HMAC envelope around cached payloads that consumed extra CPU, memory, and code complexity without threat model justification in a private Redis instance.

## Options Considered
1. **Redis Cloud with HMAC signing**: Requires paid tier or risk of unexpected instance archiving; HMAC signature verification adds per-request CPU overhead with zero security benefit behind TLS.
2. **Upstash Serverless Redis without HMAC**: Generous free tier (10,000 commands/day, 256 MB storage), native TLS (`rediss://`), simple JSON payload caching without cryptographic envelopes.

## Decision
Adopt Upstash Serverless Redis as the caching provider. Eliminate the HMAC signing and verification envelope across the publisher and consumer code, storing plain JSON string payloads in Redis under `jc:v1:*`.

## Consequences
- Upstash command budget (10k/day) requires double-buffered generational batching and in-process API LRU caching to avoid command exhaustion.
- Lower serialization/deserialization overhead and zero HMAC key management requirements.
- Guarded by tests in `tests/unit/Publisher.test.ts` and `tests/unit/RedisClient.test.ts`.
