# 🔒 GateForge

> **Programmable Multi-Tenant API Traffic Control System**  
> High-performance API Gateway, Control Plane, Observability Inspector & Traffic Playground.

---

## 1. Overview & Architecture

GateForge is a high-throughput, programmable API Gateway and Control Plane built in a clean monorepo architecture. It provides robust multi-tenant API key authentication, atomic rate limiting, monthly quota enforcement, SSRF protection, dynamic reverse proxying, and transactional usage accounting.

```
                      ADMINISTRATOR (Control API / Dashboard UI)
                                        │
             1. Register Upstream: Orders Service (http://mock-orders:5001)
             2. Register Route:    /api/v1/orders/*  → Orders Service
             3. Assign Policy:     Pro Plan (100 req/min, 50,000 req/month)
             4. Issue API Key:     gf_live_... → Acme Corporation
                                        │
                                        ▼
CLIENT (or Playground) ──►  GATEFORGE DATA PLANE (:4000)  ──►  MOCK ORDERS (:5001)
  GET /api/v1/orders/123       - UUID v4 Request ID             GET /orders/123
  X-API-Key: gf_live_...       - SHA-256 Auth & Redis Cache     Returns: 200 OK
                               - Longest-Prefix Route Match     [{"id":1,"item":"golf ball"}]
                               - Effective Policy Resolver
                               - Atomic Sliding Rate (Lua)
                               - Atomic Monthly Quota (Lua)
                               - SSRF Guardrails
                               - Dynamic Upstream Proxy
                               - Transactional Usage Flush
```

### 🧠 Core Engineering Principles
1. **Monorepo Cohesion**: Control Plane, Data Plane, Mock Upstreams, Database models, and Dashboard UI are maintained together with shared domain schemas and types.
2. **Zero Artificial Microservices**: Avoid multi-hop network latency overhead for in-process middleware steps. The request execution pipeline is direct, predictable, and memory-efficient:
   $$\text{request} \longrightarrow \text{auth} \longrightarrow \text{route} \longrightarrow \text{policy} \longrightarrow \text{rate} \longrightarrow \text{quota} \longrightarrow \text{ssrf} \longrightarrow \text{proxy}$$
3. **No Premature Abstraction**: Direct concrete implementations first. Abstractions are introduced only at genuine system boundaries.

---

## 2. Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Runtime & Language** | Node.js / TypeScript | Node 24 LTS / TS ^5.7 | ESM-native type-safe backend & data plane |
| **Backend Gateway** | Express | 5.x | High-throughput HTTP pipeline |
| **Proxy Engine** | `http-proxy-middleware` | 4.2.x | Dynamic upstream dispatch & timeout control |
| **Database & ORM** | PostgreSQL 16 / Prisma | 7.6.0 | Relational tenant, key, plan, route & usage storage |
| **Atomic Cache & Rate**| Redis 7 / `ioredis` | ^5.10 | Atomic Lua sliding-window rate limit & monthly quota |
| **SSRF Guard** | `ipaddr.js` + `dns` | ^2.2 | RFC 1918, loopback & cloud metadata IP protection |
| **Frontend UI** | Next.js 14 / Tailwind CSS | React 18.3 / Tailwind 3.4 | App Router Dashboard, Playground & Inspector |
| **Containerization** | Docker & Docker Compose | Compose v2 | 6-container local orchestration |

---

## 3. Monorepo Structure

```
gateforge/
├── apps/
│   ├── gateway/                  ← Data Plane (:4000)
│   │   └── src/
│   │       ├── lib/              ← Pooled DB client, Redis singleton, SSRF guard, Usage aggregator
│   │       ├── lua/              ← Atomic sliding window & monthly quota Lua scripts
│   │       ├── middleware/       ← Request ID, API Key Auth, Route Matcher, Policy, Rate & Quota
│   │       └── proxy/            ← Dynamic Upstream Reverse Proxy
│   │
│   ├── control-api/              ← Control Plane CRUD & Admin API (:4001) [Milestone 3]
│   │
│   ├── dashboard/                ← Next.js Control UI, Traffic Playground & Inspector (:3000) [Milestone 4/5]
│   │
│   ├── mock-orders/              ← Upstream Microservice A (:5001)
│   │   └── src/server.ts         ← /orders, /slow (5s delay), /error (500 throw), /health
│   │
│   └── mock-payments/            ← Upstream Microservice B (:5002)
│       └── src/server.ts         ← /payments/:id, POST /payments, /health
│
├── packages/
│   └── db/                       ← Shared Prisma Schema, Migrations & Seeds
│       └── prisma/
│           ├── schema.prisma     ← Organization, Plan, ApiKey, Route, Upstream, UsageHourly, AuditEvent
│           └── seed.ts           ← Initial plans, Acme Corp, routes, and test keys
│
├── docker-compose.yml            ← Multi-container local environment
├── package.json
└── tsconfig.json
```

---

## 4. Failure Modes & Status Code Semantics

| Scenario | Trigger / Condition | Gateway Status | Response / Headers |
|---|---|---|---|
| **Normal Traffic** | Valid key, within rate limit & quota | `200 OK` | Proxied JSON payload + `X-RateLimit-*` & `X-Quota-*` |
| **Missing Key** | Request without `X-API-Key` | `401 Unauthorized` | `{"error": "Missing API key"}` |
| **Invalid Key** | Unknown key hash | `401 Unauthorized` | `{"error": "Invalid API key"}` |
| **Revoked Key** | Status is `REVOKED` or `EXPIRED` | `403 Forbidden` | `{"error": "API key revoked or expired"}` |
| **Unmatched Route** | URL prefix not mapped to any active route | `404 Not Found` | `{"error": "no matching route"}` |
| **Rate Limit Breach** | Request count exceeds per-minute window | `429 Too Many Requests` | `{"error": "rate limit exceeded"}` (`X-RateLimit-Remaining: 0`) |
| **Quota Exhausted** | Calendar month quota exceeded | `429 Too Many Requests` | `{"error": "quota exceeded"}` |
| **Upstream Error** | Upstream throws 5xx | `500 Internal Error` | Passthrough error from upstream |
| **Upstream Timeout** | Upstream response exceeds `timeoutMs` | `504 Gateway Timeout` | `{"error": "gateway timeout"}` |
| **SSRF Attempt** | Upstream targets private/metadata IP | `400 Bad Request` | `{"error": "invalid upstream target"}` |

---

## 5. Quickstart & Local Setup

### Prerequisites
- **Node.js 24 LTS**
- **Docker Desktop** (with Compose v2)

### 1. Clone & Bootstrap
```bash
git clone https://github.com/ManasBhardwaj07/GateForge.git
cd GateForge
npm install
```

### 2. Start Local Docker Stack
```bash
docker-compose up --build -d
```
This boots up:
- `PostgreSQL 16` (`:5433` on host, `:5432` in container network)
- `Redis 7` (`:6379`)
- `Mock Orders Service` (`:5001`)
- `Mock Payments Service` (`:5002`)
- `GateForge Gateway Data Plane` (`:4000`)

### 3. Seed Database
```bash
cd packages/db
npx tsx prisma/seed.ts
```

### 4. Verify Health & Pipeline
```bash
# Health Check
curl http://localhost:4000/health

# Smoke Test (Valid API Key)
curl -i -H "X-API-Key: gf_test_123" http://localhost:4000/api/v1/orders

# Test Rate Limiter (Burst 105 requests)
# Exactly 100 will return 200 OK; requests 101-105 will return 429 Too Many Requests
```

---

## 6. Implementation Roadmap & Milestones

- [x] **Milestone 1: Minimal Proxy Pipeline**
  - [x] Monorepo & strict TypeScript `NodeNext` setup
  - [x] PostgreSQL schema + Prisma client + seed data
  - [x] Redis connection singleton + Lua sliding window & quota loaders
  - [x] Mock Orders (`:5001`) & Mock Payments (`:5002`) services
  - [x] Gateway Pipeline: `requestId` → `apiKeyAuth` → `routeMatcher` → `policyResolver` → `rateLimiter` → `quotaEnforcer` → `proxyHandler`
- [x] **Milestone 2: Full Data Plane Enforcement & Usage Accounting**
  - [x] Save-time and connection-time SSRF validation via `ipaddr.js` + `dns`
  - [x] In-memory hourly traffic aggregation with 5-minute transactional PostgreSQL flush to `"UsageHourly"`
  - [x] Verified rate limit thresholds (`429`), upstream error passthrough (`500`), and route mismatches (`404`)
- [ ] **Milestone 3: Dynamic Control Plane API (`:4001`)**
  - [ ] CRUD Endpoints for Organizations, Plans, Routes, Upstreams, and API Keys
  - [ ] Instant API Key Revocation with Redis cache invalidation (`DEL key_auth:<hash>`)
  - [ ] Audit Event Logger Service (`AuditEvent` table)
- [ ] **Milestone 4: Next.js Control Dashboard (`:3000`)**
  - [ ] Next.js 14 App Router + Tailwind 3.4 + Radix/shadcn UI
  - [ ] System Overview, KPI Cards & Health monitoring
  - [ ] Tenant & Route Configuration management with one-time API Key creation modal
- [ ] **Milestone 5: Traffic Playground & Request Decision Inspector**
  - [ ] Live HTTP burst traffic generator UI (10, 50, 150 req bursts)
  - [ ] Interactive Request Decision Inspector drawer (latency, route matched, rate limit headers)
- [ ] **Milestone 6: Verification, Concurrency Benchmarks & Portfolio Evaluation**
  - [ ] Vitest integration & concurrency test suite
  - [ ] `autocannon` load benchmarks (p50/p95/p99 throughput & latency)
  - [ ] Complete 6-container Docker compose orchestration

---

## 7. License
MIT
