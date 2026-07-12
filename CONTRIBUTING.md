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
