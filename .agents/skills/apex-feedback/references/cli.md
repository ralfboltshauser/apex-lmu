# CLI contract

Run commands from the Apex repository root. The CLI reads `APEX_FEEDBACK_API_URL` and `APEX_FEEDBACK_ADMIN_TOKEN` from the environment; `npm run feedback` also loads the ignored root `.env.local` file when present.

All successful stdout is JSON. Diagnostics and failures are JSON on stderr. Exit code `4` means the item changed and must be re-read.

```text
npm run feedback -- list [--status new] [--limit 50]
npm run feedback -- show <id>
npm run feedback -- download-attachments <id> [--dir .tmp/apex-feedback/<id>]
npm run feedback -- acknowledge <id> --revision <n>
npm run feedback -- investigate <id> --revision <n>
npm run feedback -- ask <id> --message "..." --revision <n>
npm run feedback -- reply <id> --message "..." --revision <n>
npm run feedback -- start <id> --revision <n>
npm run feedback -- resolve <id> --summary "..." --revision <n>
npm run feedback -- dismiss <id> --summary "..." --revision <n>
npm run feedback -- duplicate <id> --of <other-id> [--summary "..."] --revision <n>
npm run feedback -- reopen <id> --revision <n>
```

Use `download-attachments` only in the ignored `.tmp/apex-feedback` tree. Delete downloaded private artifacts after inspection.
