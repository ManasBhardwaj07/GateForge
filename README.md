# GateForge

> Programmable multi-tenant API traffic control system — gateway data plane, isolated control plane, real-time observability dashboard, and interactive traffic playground.

[![Live Demo](https://img.shields.io/badge/Live-gateforgeapp.duckdns.org-0ea5e9?style=flat-square&logo=microsoft-azure&logoColor=white)](https://gateforgeapp.duckdns.org/)
[![Tests](https://img.shields.io/badge/tests-108%2F108-brightgreen?style=flat-square)](https://github.com/ManasBhardwaj07/GateForge)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-purple?style=flat-square)](LICENSE)

**Live deployment:** [https://gateforgeapp.duckdns.org](https://gateforgeapp.duckdns.org/) — hosted on Azure (Ubuntu VM, Caddy 2 TLS, Docker Compose)

---

## Overview

GateForge is an API gateway and traffic-control platform built from first principles. It solves the same class of distributed systems problems addressed by Kong, Cloudflare, and AWS API Gateway: multi-tenant credential management, atomic rate limiting, monthly quota enforcement, SSRF protection, dynamic route dispatch, and request telemetry.

The system is split into three planes:

- **Data Plane** (`:4000`) — authenticates API keys via SHA-256 + Redis cache, enforces per-minute sliding-window rate limits using atomic Redis Lua scripts, resolves the longest-prefix route match, validates upstream targets against SSRF rules, and proxies requests with injected tracing headers.
- **Control Plane** (`:4001`) — internal-only admin API for managing tenants, plans, API keys, routes, and upstreams. Protected by constant-time bearer token validation and never exposed to public traffic.
- **Dashboard** (`:3000`) — Next.js observability UI with real-time metrics, a traffic playground for sending test bursts, and a Decision Inspector drawer that shows exactly how the gateway evaluated each request.

---

## Architecture

```
                    ADMINISTRATOR / CONTROL PLANE (:4001) / DASHBOARD (:3000)
                                               │
                 1. Define Plan:       Pro Tier (100 req/min, 50,000 req/month)
                 2. Create Tenant:     Acme Corp (assigned to Pro Plan)
                 3. Connect Upstream:  Orders Service (http://mock-orders:5001)
                 4. Map Route:         /api/v1/orders/*  → Orders Upstream
                 5. Issue API Key:     gf_live_... (SHA-256 stored; secret revealed once)
                                               │
                                               ▼
CLIENT ──►  GATEFORGE DATA PLANE (:4000)  ──►  UPSTREAM MICROSERVICES
  GET /api/v1/orders/123     1. Auth (SHA-256 + Redis)        GET /orders/123 (:5001)
  X-API-Key: gf_live_...     2. Tenant Resolution             Returns: 200 OK
                             3. Rate & Quota (Lua)             [{"id":1,"item":"widget"}]
                             4. Longest-Prefix Route Match
                             5. SSRF Filter & IP Pinning
                             6. Reverse Proxy + Telemetry
```

### Request Pipeline

Every request goes through a deterministic evaluation sequence:

1. **Authentication** — SHA-256 hashes the `X-API-Key`, looks it up in Redis (falls back to Postgres on cache miss), rejects revoked/inactive keys.
2. **Tenant Resolution** — resolves the key's organization and verifies it is active.
3. **Policy Enforcement** — an atomic Redis Lua script checks the sliding-window counter and monthly quota in a single roundtrip. Returns `429` if either limit is breached.
4. **Route Matching** — longest-prefix match against registered route prefixes to select the target upstream.
5. **Proxy Dispatch** — validates the upstream IP against SSRF rules (RFC 1918, link-local, cloud metadata, DNS rebinding), injects `X-Request-Id`, and forwards the request with a configurable timeout.

---

## Screenshots

| Overview Dashboard | Traffic Playground |
|---|---|
| ![Overview](docs/screenshots/overview.png) | ![Playground](docs/screenshots/traffic-playground.png) |

| Tenants & Plans | Routes & Upstreams | API Keys |
|---|---|---|
| ![Tenants](docs/screenshots/tenants-plans.png) | ![Routes](docs/screenshots/routes-upstreams.png) | ![Keys](docs/screenshots/api-keys.png) |

---

## Tech Stack

| Component | Technology | Purpose |
|---|---|---|
| Data Plane | Node.js, Express 5, `http-proxy-middleware` | HTTP proxy pipeline and dynamic upstream forwarding |
| Rate Limiting | Redis 7, `ioredis`, custom Lua scripts | Atomic sliding-window counters and instant key revocation |
| Database | PostgreSQL 16, Prisma ORM | Multi-tenant schema, usage rollups, audit log |
| SSRF Defense | `ipaddr.js` + DNS resolution | Two-phase validation: save-time + connection-time IP pinning |
| Dashboard | Next.js 14, Tailwind CSS | App Router UI, Decision Inspector, Traffic Playground |
| Edge Proxy | Caddy 2 | Auto-renewing TLS, single-domain reverse proxy |
| Orchestration | Docker Compose v2 | 6-container local stack, 7-container production with Caddy |

---

## Project Structure

```
GateForge/
├── apps/
│   ├── gateway/               Data Plane (:4000) & Control API (:4001)
│   │   └── src/
│   │       ├── lib/           DB pool, Redis client, SSRF guard, usage aggregator
│   │       ├── lua/           Atomic Redis Lua rate-limit scripts
│   │       ├── middleware/    Auth, route matcher, policy, rate & quota enforcers
│   │       ├── proxy/         Dynamic reverse proxy with IP pinning
│   │       └── controlPlane.ts
│   ├── dashboard/             Next.js 14 observability UI (:3000)
│   ├── mock-orders/           Test upstream A (:5001)
│   └── mock-payments/         Test upstream B (:5002)
├── packages/
│   └── db/                    Shared Prisma schema, migrations & seed
├── deploy/                    Caddyfile and production compose overlay
├── tests/                     108 Vitest tests across 11 suites
├── docker-compose.yml
└── vitest.config.mts
```

---

## Getting Started

**Prerequisites:** Node.js 24 LTS, Docker Desktop

```bash
git clone https://github.com/ManasBhardwaj07/GateForge.git
cd GateForge
npm install
cp .env.example .env
docker compose up --build -d
```

This starts PostgreSQL, Redis, two mock upstream services, the gateway, a DB migration/seed container, and the dashboard. Once healthy:

- **Dashboard:** http://localhost:3000
- **Gateway Data Plane:** http://localhost:4000
- **Control Plane (internal):** http://localhost:4001

### Try it

```bash
# Successful proxied request
curl -i -H "X-API-Key: gf_test_123" http://localhost:4000/api/v1/orders

# Invalid key → 401
curl -i -H "X-API-Key: bad_key" http://localhost:4000/api/v1/orders

# No matching route → 404
curl -i -H "X-API-Key: gf_test_123" http://localhost:4000/api/v1/nonexistent
```

---

## Production Deployment

GateForge ships with a Caddy reverse proxy overlay for production use. The live demo runs on an Azure B-series VM (Ubuntu 24.04) with automated Let's Encrypt TLS.

```
PUBLIC INTERNET
       │
   HTTPS :443
       ▼
┌──────────────────────────────────────────────────┐
│  CADDY 2 (auto TLS)                             │
│  /api/*, /health → gateway:4000                  │
│  /*              → dashboard:3000                │
├──────────────────────────────────────────────────┤
│  Gateway :4000    Dashboard :3000                │
│  Control :4001 (internal only, never exposed)    │
│  PostgreSQL :5432   Redis :6379                  │
│  mock-orders :5001  mock-payments :5002          │
└──────────────────────────────────────────────────┘
```

To deploy with the Caddy overlay:

```bash
cp .env.example .env   # configure DOMAIN, DATABASE_URL, CONTROL_PLANE_TOKEN, etc.
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d --build
```

The Control Plane API (`:4001`) is bound to the internal Docker network and is never exposed through Caddy or host port mappings.

---

## Testing

```bash
npm test          # 108 tests across 11 suites
npm run typecheck # strict TypeScript compilation
npm run build     # production Next.js build validation
```

Test coverage includes:
- All 5 gateway pipeline middlewares (auth, routing, policy, rate limiting, quota)
- Upstream credential sanitization (`X-API-Key` stripped before proxy dispatch)
- Concurrent sliding-window rate limiting under burst load
- SSRF filter evasion attempts (private IPs, decimal-encoded, DNS rebinding)
- Upstream failure modes (504 timeout, 500 propagation)
- Control Plane authorization, IP throttling, and audit logging

---

## License

MIT
