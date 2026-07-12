# Security

Please report security issues through GitHub's private **Security → Report a
vulnerability** form. Do not open a public issue for an unpatched
vulnerability.

The renderer is sandboxed and has no direct filesystem or process access. IPC
handlers validate extensions and paths. Setup installation only accepts `.svm`
files and refuses target directories outside `UserData/player/Settings`.
DuckDB recordings are opened read-only. The native bridge reads an official
mapping from a separate unprivileged process and never enters LMU's process.

Do not add process-memory scanning, administrator requirements, credential
storage or automatic uploads.
