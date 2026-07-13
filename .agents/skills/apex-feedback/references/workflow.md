# Workflow rules

The lifecycle is `new`, `acknowledged`, `investigating`, `needs_user_answer`, `user_answered`, `in_progress`, `resolved`, `dismissed`, `duplicate`, or `reopened`.

- `ask` atomically posts an agent question and selects `needs_user_answer`.
- A user reply to a question automatically selects `user_answered`.
- `resolved` requires a verification-backed summary.
- `duplicate` requires the other feedback ID.
- Terminal feedback may be reopened by the user.
- Every mutation uses the most recently read revision.

Feedback metadata intentionally excludes LMU telemetry frames, raw recordings, driver/server identities, Steam IDs, and local paths. Do not request those through the thread unless the user separately chooses an established private support path.
