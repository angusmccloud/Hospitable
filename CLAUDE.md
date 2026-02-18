# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hospitable is a property management aggregation platform that pulls guest and reservation data from the Hospitable.com API, stores it in DynamoDB, and surfaces it through a web portal and Chrome extension. It uses an event-driven architecture with SQS queues for webhook processing and guest linking.

## Repository Structure

- **backend/** — AWS SAM serverless backend (Node.js 20.x, TypeScript)
- **hospitable-portal/** — Next.js 15 web portal (React 19, TypeScript)
- **atc-extension/** — Chrome extension (Manifest V3, vanilla JS)

## Build & Deploy Commands

### Backend (SAM + TypeScript)
```bash
cd backend
npm run build          # tsc -p .
npm run sam:build      # sam build (compiles + packages for Lambda)
sam deploy             # deploy to AWS (uses samconfig.toml defaults)
sam local invoke <FunctionName> --event events/<event>.json  # test a single Lambda locally
sam local start-api    # run API Gateway locally on port 3000
sam logs -n <FunctionName> --stack-name hospitable --tail     # tail CloudWatch logs
```

### Frontend (Next.js)
```bash
cd hospitable-portal
npm install
npm run dev            # local dev server (Turbopack)
npm run build          # production build
npm run lint           # ESLint 9
```

## Architecture

### Data Flow
```
Hospitable.com Webhook → WebhookReceiverFn (HMAC verify) → SQS IngestQueue
    → WebhookProcessorFn (upsert DynamoDB) → SQS GuestLinkQueue
    → GuestLinkerFn (match by email/phone, link or create guest)
```

Nightly EventBridge schedules run SyncPropertiesFn, SyncReservationsFn, and GuestBackfillFn to keep data current.

### DynamoDB Single-Table Design
Table: `HospitableData` with `pk` (partition key) and `sk` (sort key).

| Entity | pk | sk | Notes |
|---|---|---|---|
| Guest | `GUEST#<id>` | `PROFILE` | emails[], phoneNumbers[], hostNotes, reservationIds[] |
| Reservation | `RES#<id>` | `PROFILE` | Also stored under guest: pk=`GUEST#<id>`, sk=`<resId>` |
| Reservation (unlinked) | `RES#UNKNOWN` | `<resId>` | Awaiting guest linking |
| Property | `PROP#<id>` | `PROFILE` | Property details |
| Conversation index | `RES#<id>` | `CONV#<convId>` | Lookup by conversation ID |

### Authentication
- AWS Cognito user pool with OAuth 2.0 (Authorization Code + PKCE)
- API Gateway endpoints use Cognito authorizer
- Frontend uses AWS Amplify v6 for auth flow
- Chrome extension uses `chrome.identity` for Cognito OAuth

### Key Backend Patterns
- Guest matching: `normalizeEmail()` and `normalizePhone()` (10-digit US) for dedup
- Webhook security: HMAC-SHA256 signature verification + WAF IP restriction (38.80.170.0/24)
- SQS: Batch sending (10/batch), `ReportBatchItemFailures` for partial failure handling
- DynamoDB: `scanAllRows()` utility for full table scans with pagination
- Paged API ingestion: `fetchPropertiesPaged()`, `fetchReservationsPaged()`

### Frontend Stack
- React 19 + Next.js 15 (Turbopack)
- MUI Material-UI + DataGrid Pro for UI
- TanStack React Query for data fetching (5min stale time)
- Path alias: `@/*` maps to `src/*`
- API calls authenticated with Cognito ID token (Bearer header)

## Deployment
- Region: `us-east-1`
- Stack name: `hospitable`
- SAM config: `backend/samconfig.toml`
- Secrets in SSM Parameter Store: API token (`/hospitable/api-token`), webhook secret (`/hospitable/webhook-secret`)
