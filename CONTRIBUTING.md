# Contributing

Run `npm run build`, `npm test`, `go test ./...` in `bridge`, and the Windows
cross-build before opening a change.

Please keep these invariants:

- include units in domain property names;
- never silently clamp invalid source data into a believable result;
- add a deterministic fixture for every integration regression;
- keep advice linked to evidence and confidence;
- do not introduce telemetry, analytics, accounts or remote assets;
- do not include commercial setup/reference data;
- preserve reduced-motion behavior and keyboard access;
- show the expected trade-off of a setup recommendation.

Compatibility reports should include the LMU version, relevant header hash,
adapter diagnostic output and a short recording that reproduces the issue.

## Pre-push release gate

`npm install` configures the repository-owned `.githooks` directory. Before a push containing desktop application, bridge, packaging, or root dependency changes, the hook:

1. Refuses to reuse the version from the remote comparison commit.
2. Runs the complete renderer, native desktop, and Go bridge test suites.
3. Builds the Windows installer, portable ZIP, and SHA-256 manifest.
4. Blocks the push if any check or artifact fails.

Website-only and documentation-only pushes skip desktop packaging. A successful build is cached by commit and version under `.git`, so retrying the same push does not rebuild it. The hook produces local release artifacts; publishing the GitHub Release remains an explicit post-push operation because a pre-push hook runs before the commit exists on GitHub.
