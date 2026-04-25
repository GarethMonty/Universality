# Universality Release Checklist

Universality desktop releases are created manually from GitHub Actions with a version input. The workflow validates that the requested version already exists in every source-of-truth version file, creates or reuses `app-vX.Y.Z`, builds platform bundles, and uploads artifacts to a draft GitHub Release.

## Before Running Release

- Confirm `package.json`, `apps/desktop/package.json`, `apps/desktop/src-tauri/Cargo.toml`, and `apps/desktop/src-tauri/tauri.conf.json` all contain the same version.
- Run `npm run release:validate -- <version>`.
- Run `npm run release:test`.
- Run `npm run check:all`.
- Confirm CI is green for the commit that will be released.
- Confirm there is no existing published release for `app-v<version>`.

## Required GitHub Secrets

Updater artifact signing:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

macOS code signing and notarization:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

Windows Authenticode signing is not configured yet. Before a public stable Windows release, add certificate-backed signing so installers build trust with Windows SmartScreen.

## Manual Release Steps

1. Open the GitHub Actions `Release` workflow.
2. Run the workflow manually with the exact semantic version, for example `0.1.0` or `0.2.0-beta.1`.
3. Wait for all platform builds to finish.
4. Open the draft GitHub Release named `Universality v<version>`.
5. Confirm release assets exist for Windows, Linux, macOS Intel, and macOS Apple Silicon where each platform build succeeded.
6. Download representative installers and smoke-test launch.
7. Publish the draft release only after smoke tests pass.

## Smoke Tests

- Install or run the downloaded artifact.
- Confirm the app opens without a blank window.
- Confirm the app version shown by diagnostics matches the release version.
- Create or open a SQLite connection.
- Run a known read query against the seeded SQLite fixture if available.
- Open connection details, explorer, query, and diagnostics surfaces.
- Confirm no secrets, local absolute paths, or debug-only fixture credentials appear in release notes.

## Production Readiness Notes

- Releases are draft-first until install and launch checks are consistently reliable.
- CI-only version patching is intentionally forbidden; the tag must point at source files with the release version.
- Add in-app updater configuration and updater UI in a later pass.
- Add Windows code signing before broad public distribution.
- Treat missing signing/notarization secrets as a release blocker for production channels, even if unsigned local testing artifacts can still be useful.
