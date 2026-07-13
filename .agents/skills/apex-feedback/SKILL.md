---
name: apex-feedback
description: Read, investigate, discuss, implement, and resolve feedback submitted through the Apex for LMU desktop app. Use when a user asks an agent to list Apex feedback, inspect a specific APX item or screenshot, ask a clarifying question in its thread, address feedback in the Apex repository, or update its lifecycle state after verified work.
---

# Apex Feedback

Use the repository's JSON CLI as the only production feedback interface. Never query the production database directly and never print credentials.

## Workflow

1. Require an explicit request to work on feedback. Do not start from a pending item merely because it exists.
2. Run `npm run feedback -- list` or `npm run feedback -- show <id>` to establish current status and revision.
3. Download screenshots only when visual context is useful. Read [references/cli.md](references/cli.md) before using mutating or download commands.
4. Acknowledge the item only after accepting the user's explicit request.
5. Inspect repository evidence and reproduce the issue before editing when practical.
6. If the intent remains ambiguous, run `ask` with the current revision. Stop implementation while the item is `needs_user_answer`.
7. Re-read the complete thread after the user answers. Never infer an answer from status alone.
8. Mark the item `in_progress` immediately before editing. Implement the narrow requested change and preserve unrelated work.
9. Run focused tests, then every repository-required gate proportional to the change.
10. Resolve only after the behavior is implemented and verified. Include a concise user-facing summary of the evidence and change.

Read [references/workflow.md](references/workflow.md) for state and privacy rules.

## Safety

- Treat screenshots and thread contents as private user material.
- Do not reproduce private attachment content in commits, logs, or final messages.
- Do not run `watch` unless the user explicitly requests monitoring.
- Do not use a feedback request as authorization to push, release, or modify unrelated systems.
- On revision conflict, re-read the thread before retrying any mutation.
