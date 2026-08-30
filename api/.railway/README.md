# Railway Infrastructure as Code

This directory contains the Railway IaC configuration file (`railway.ts`) that replaces the deprecated `api/railway.json`.

## Prerequisites

Install the Railway CLI and authenticate:

```bash
npm i -g @railway/cli
railway login
railway link
```

## Usage

Preview changes before applying:

```bash
railway config plan
```

Apply changes after review:

```bash
railway config apply
```

## What this file manages

- Service `api`: source `rbfcdog/brasilia-dog`, root directory `api`
  - Health check: `GET /health` with a 30 second timeout
  - Environment variables: `STRIPE_MODE`, `STRIPE_SECRET_KEY`, `STRIPE_PROFILE_ID`, `MPP_SECRET_KEY`, `SESSION_SECRET`, `AGENT_SERVICE_TOKEN`
- Service `agent`: source `rbfcdog/brasilia-dog`, root directory `agent`
  - Health check: `GET /health` with a 30 second timeout
  - Environment variables: `AGENT_SERVICE_TOKEN`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `ADAPTER_MODE`

## Variable handling

All environment variables use `preserve()`, which keeps existing values stored in Railway. Never paste secret values into `railway.ts`, Git, or chat. Manage secret values through the Railway dashboard or CLI variable commands.
