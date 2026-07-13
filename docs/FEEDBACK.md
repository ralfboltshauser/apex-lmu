# Feedback service

Apex remains local-first: telemetry capture, analysis, strategy, recordings, and settings do not require an account or cloud runtime. Feedback is a separate, explicit user action. Nothing leaves the computer until the user selects an interface element, reviews the privacy notice, writes a comment, and presses **Send feedback**.

## Data flow and privacy boundary

1. `src/feedback/FeedbackProvider.tsx` records bounded UI metadata for the selected element and asks Electron for a selected-area and full-window screenshot.
2. Elements marked `data-feedback-redact` are covered before capture. While measured LMU data is live, the entire workspace content is covered. Measured analysis, feedback conversations, local paths, driver/server identifiers, and telemetry are never intentionally included.
3. `electron/feedback-service.cjs` writes the report to a private, versioned local outbox before attempting a network request. A temporary outage therefore cannot lose the user's text.
4. `electron/feedback-client.cjs` registers an anonymous installation credential, then sends only explicit feedback payloads to the versioned API. The credential is stored with Electron safe storage when available and the cache file is mode `0600`.
5. The API validates strict schemas and quotas, decodes every screenshot with a pixel limit, strips metadata, and re-encodes it as JPEG before storing it. Installation credentials can read only their own threads and attachments. The admin API requires a separate secret.

Raw LMU shared memory, `.apexrec` recordings, normalized telemetry frames, Steam IDs, server details, setup contents, diagnostics, and local files are not feedback attachments.

## Components

- Desktop queue and synchronization: `electron/feedback-store.cjs`, `electron/feedback-service.cjs`, `electron/feedback-client.cjs`
- Renderer selection, composer, inbox, and privacy masks: `src/feedback/`
- Versioned HTTP API and PostgreSQL schema: `apps/feedback-api/`
- Agent/operator CLI: `scripts/apex-feedback.mjs`
- Operator workflow skill: `.agents/skills/apex-feedback/`

The production API is `https://apex-lmu-feedback.vercel.app/api/v1`. It runs in Vercel's Frankfurt region beside a dedicated Neon PostgreSQL database. The Vercel project is connected to this repository with `apps/feedback-api` as its root directory.

## Local validation

```bash
npm ci
npm run lint
npm run test:feedback-api
npm run build:feedback-api
node --test electron/feedback-store.node-test.cjs electron/feedback-service.node-test.cjs
```

Generate and apply schema migrations from the repository root:

```bash
npm run feedback:db:generate
npm run feedback:db:migrate
```

The ignored `apps/feedback-api/.env.local` is populated with `vercel env pull`. Never commit database URLs, installation tokens, admin credentials, downloaded screenshots, or feedback exports.

## Production verification and operations

`npm run feedback:smoke` exercises the real public lifecycle: health, anonymous installation registration, sanitized screenshot submission, agent question, installation event polling, user answer, resolution, and authenticated attachment retrieval. It creates a clearly named resolved report so production evidence remains auditable.

Use the `apex-feedback` skill for day-to-day triage. Its CLI keeps stdout machine-readable and uses optimistic revisions so two operators cannot silently overwrite each other. Download screenshots only into the ignored `.tmp/apex-feedback/` directory and remove them after inspection.

Database migrations are an explicit pre-deploy step. Apply migrations before deploying API code that depends on them, then run the production smoke test after the deployment becomes ready.
