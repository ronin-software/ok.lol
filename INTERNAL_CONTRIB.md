# Internal Contributor Guide

## Infrastructure

| Component | Provider | Dashboard |
|---|---|---|
| Origin (Next.js) | Vercel | [vercel.com](https://vercel.com/danscan-ronindevscos-projects/ok.lol) |
| Ledger service | Fly.io | `fly dash -a oklol-ledger-staging` |
| TigerBeetle | Fly.io | `fly dash -a oklol-tb-staging` |
| Tunnel (sish) | Fly.io | `fly dash -a oklol-tunnel` |
| Domain registrar | Porkbun | [porkbun.com](https://porkbun.com) |
| DNS (nameservers) | Vercel | `vercel dns ls ok.lol --scope danscan-ronindevscos-projects` |
| Email (prod) | Resend | Separate org per environment |
| Email (staging) | Resend | Separate org per environment |
| Payments | Stripe | Test mode for staging, live for production |
| Database | Planetscale Postgres | [Planetscale](https://app.planetscale.com/danscan/ok-lol-staging) |

## Environments

| Environment | Origin URL | Branch | Email domain |
|---|---|---|---|
| Development | `http://localhost:3001` | any | `danscan.dev.www.ok.lol` |
| Staging | `https://staging.www.ok.lol` | `staging` | `staging.www.ok.lol` |
| Production | `https://ok.lol` | `main` | `ok.lol` |

Environment-specific secrets live in Vercel (per-environment env vars) and
Fly.io (`fly secrets`). See `.env.example` for the full schema.

## Local development

Prerequisites: Bun, Docker, Stripe CLI.

```sh
bun install
bun run dev
```

`bun run dev` starts the full local stack:

| Service | Port | Source |
|---|---|---|
| Postgres 17 | 5432 | Docker (`infra/dev/compose.yml`) |
| TigerBeetle | 3000 | Docker (`infra/dev/compose.yml`) |
| Ledger | 4000 | `services/ledger/src/index.ts` (connects to local TigerBeetle) |
| Stripe webhook listener | — | `stripe listen --forward-to localhost:3001/...` |
| Next.js dev server | 3001 | `next dev` with HMR |

Docker services are started first (`dev:infra`), then the ledger, Stripe
listener, and Next.js server run concurrently.

### Environment

Populate `.env` from the example and fill in secrets:

```sh
cp .env.example .env
```

Or pull staging env vars from Vercel:

```sh
vercel env pull --scope danscan-ronindevscos-projects
```

### Database

```sh
bun run db:push      # apply schema to local Postgres
bun run db:generate  # generate migration files
bun run db:studio    # open Drizzle Studio
```

## Deploying

### Origin (Vercel)

Push to `staging` or `main`. Vercel deploys automatically per environment.

### Fly.io services

Deploy via `bun run deploy:fly <service>`. Defaults to staging.

```sh
bun run deploy:fly ledger           # staging
bun run deploy:fly tb               # staging
bun run deploy:fly tunnel           # staging (shared across envs)
ENV=production bun run deploy:fly ledger   # production
```

App naming convention: `oklol-{service}` (production) or
`oklol-{service}-{env}` (other environments).

Fly secrets are managed per-app:

```sh
fly secrets set KEY=value -a oklol-ledger-staging
```

## DNS

Nameservers for `ok.lol` point to Vercel (`ns1.vercel-dns.com`,
`ns2.vercel-dns.com`). Porkbun remains the registrar.

Manage records via CLI:

```sh
vercel dns ls ok.lol --scope danscan-ronindevscos-projects
vercel dns add ok.lol <name> <type> <value> --scope danscan-ronindevscos-projects
vercel dns rm <record-id> --scope danscan-ronindevscos-projects
```

### Record inventory

| Name | Type | Purpose |
|---|---|---|
| `@` | ALIAS | Vercel project (root) |
| `@` | MX | Resend inbound email |
| `@` | CAA | SSL cert issuance |
| `*` | ALIAS | Vercel project (wildcard) |
| `staging.www` | ALIAS | Vercel project (staging) |
| `staging.www` | MX | Resend inbound email (staging) |
| `w` | A | Fly tunnel (bare) |
| `*.w` | A | Fly tunnel (wildcard) |
| `_acme-challenge.w` | CNAME | Fly tunnel SSL challenge |
| `send` | MX | Resend outbound SPF |
| `send` | TXT | Resend outbound SPF |
| `send.staging.www` | MX | Resend outbound SPF (staging) |
| `send.staging.www` | TXT | Resend outbound SPF (staging) |
| `_dmarc` | TXT | DMARC policy |
| `resend._domainkey` | TXT | Resend DKIM |
| `resend._domainkey.staging.www` | TXT | Resend DKIM (staging) |

## Email (Resend)

Each environment uses a separate Resend org with its own API key and webhook
secret. This is required because Resend fires webhooks for all domains in an
org — environment isolation demands separate orgs.

The webhook handler (`src/app/api/resend/webhook/route.ts`) includes a domain
guard that drops emails not matching the current `EMAIL_DOMAIN`.

## Project structure

```
src/                  Next.js app (origin)
services/
  ledger/             Ledger service (Fly.io)
  tunnel/             sish tunnel relay (Fly.io)
infra/
  dev/                Docker Compose for local Postgres + TigerBeetle
  tigerbeetle/        TigerBeetle Dockerfile + fly.toml (Fly.io)
  deploy.ts           Parameterized Fly deploy script
packages/
  astral/             Astral workspace package
  capability/         Capability system
  skill/              Skill package
  worker/             Worker binary (released via GitHub Actions)
drizzle/              Database migrations
```
