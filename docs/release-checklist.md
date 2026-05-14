# Datanaut Release Checklist

Datanaut desktop releases are created from GitHub Actions with a version input. The workflow updates every release version file, commits that release bump, creates or reuses `app-vX.Y.Z` at the release commit, builds platform bundles, and uploads artifacts to a draft GitHub Release.

## Before Running Release

- Choose the next semantic version, for example `0.1.1` or `0.2.0-beta.1`.
- Optionally preview the version bump locally with `npm run release:bump -- <version>` on a throwaway branch.
- Run `npm run release:test`.
- Run `npm run check:all`.
- Confirm CI is green on the branch you will release from.
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
3. Wait for the workflow to commit `chore: release v<version>` and create `app-v<version>`.
4. Wait for all platform builds to finish.
5. Open the draft GitHub Release named `Datanaut v<version>`.
6. Confirm release assets exist for Windows, Linux, macOS Intel, and macOS Apple Silicon where each platform build succeeded.
7. Download representative installers and smoke-test launch.
8. Publish the draft release only after smoke tests pass.

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
- The release workflow may commit version bumps, but the tag must point at source files with the release version.
- Add in-app updater configuration and updater UI in a later pass.
- Add Windows code signing before broad public distribution.
- Treat missing signing/notarization secrets as a release blocker for production channels, even if unsigned local testing artifacts can still be useful.
