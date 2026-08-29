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

- Service name: `api`
- Source: `rbfcdog/brasilia-dog` GitHub repository, root directory `api`
- Build: Dockerfile detected automatically inside `api/`
- Health check: `GET /health` with a 30 second timeout
- Environment variables: preserved on Railway, not written into Git

## Variable handling

All environment variables use `preserve()`, which keeps existing values stored in Railway. Never paste secret values into `railway.ts`, Git, or chat. Manage secret values through the Railway dashboard or CLI variable commands.
