# Apex for LMU v0.1.0 — first public alpha

Apex is a free, GPL-licensed, local-first race engineering companion for Le
Mans Ultimate. This first alpha packages the complete desktop experience, the
out-of-process Windows reader and a deliberately honest boundary between
measured data and generated examples.

## Highlights

- Measured live pit wall backed by LMU's shared-memory data model
- Transparent, always-on-top, click-through overlay
- Read-only DuckDB telemetry inspection
- Deterministic strategy, comparison, coaching and setup engines
- Reversible `.svm` installation with backups and rollback
- Guided onboarding and seeded multiclass demo
- Per-user Windows installer and portable ZIP
- No account, cloud, analytics, telemetry upload or administrator requirement

## Validation

The release passed 45 React/domain tests, 6 Electron service tests, the Go
bridge suites, a complete Win32 test binary under Wine, 19 packaged Windows
renderer/integration assertions, 17 lifecycle assertions and 28 NSIS
install/uninstall assertions. The Windows test VM used Secure Boot, TPM 2.0 and
non-elevated application tokens.

## Important alpha boundary

The external Windows fixture validates mapping mechanics and Apex's chosen
packed contract, but the project has not yet been run against a current LMU
installation. Real-game header, lifecycle, Easy Anti-Cheat, fullscreen and
multi-hour soak validation remain required before compatibility is claimed.

The installer is not code-signed. Windows SmartScreen may warn; verify the
attached `SHA256SUMS.txt` before running it.
