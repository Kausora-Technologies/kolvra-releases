# Local Linux releases

Build, test, sign, and upload on a Linux desktop. The access preflight below is a
separate read-only Actions check. Keep the build checkout and acceptance profiles separate from
real Kolvra data. Build x64 on x64; qualify other architectures separately.

## Before building

```sh
gh workflow run release-access-preflight.yml --repo Kausora-Technologies/kolvra-releases --ref main
```

Open the new **Release access preflight** run in Actions and approve its
`production-release` environment request if required. Wait for that exact run
to succeed (`gh run watch RUN_ID --repo Kausora-Technologies/kolvra-releases --exit-status`)
before candidate builds, and retain its URL. It checks the publication token's
private repository, Contents-read and Actions-read access without building or
publishing. Secret presence is not proof of validity. Resolve any access failure
and repeat this check before spending time on builds.

## Build

Use the private app repository's pinned Vite+, Node, Electron, and dependencies.
Install the native build prerequisites (Rust, pkg-config, libsecret development
headers, and ImageMagick) and run `vp install --frozen-lockfile`. An isolated
toolchain is supported when the host cannot install system packages.

Export the production `KOLVRA_GATEWAY_URL`, `KOLVRA_CLERK_PUBLISHABLE_KEY`, and
`KOLVRA_DESKTOP_UPDATE_REPOSITORY=Kausora-Technologies/kolvra-releases`.
These are public build configuration, not service credentials. Verify with:

```sh
vp exec node scripts/verify-production-desktop-public-config.ts
vp run dist:desktop:linux:packages \
  --build-version VERSION --output-dir /absolute/artifacts --keep-stage
```

Commit the source change before packaging so the embedded commit matches the
release manifest. Retain build and verification logs outside the repository.
Run the appropriate local checks; unit tests should not inherit production
public configuration when their fixtures supply their own configuration.

Retain the stage from `--keep-stage`, build logs and receipts outside the
repository, including source commit, version, public configuration, dependency
inputs, native hashes and artifact hashes. Use `--skip-build` only when the
existing compiled outputs match all those inputs; it skips compilation, not
staging or packaging. Run focused tests for the changed paths. Record any
authorized acceptance reuse with its baseline hashes, scope and limits, without
describing inherited checks as freshly executed.

As soon as an unpacked payload exists, run the private app repository's smoke
through its actual Electron executable, before further interactive acceptance:

```sh
ELECTRON_RUN_AS_NODE=1 /absolute/linux-unpacked/kolvra \
  scripts/verify-bundled-documents.mjs \
  /absolute/linux-unpacked/resources/app.asar.unpacked/apps/server/dist/bin.mjs
```

Retain the PDF/DOCX result with the payload hashes. This smoke does not cover
scanned-PDF OCR; record that affected-runtime check separately when document or
OCR dependencies change. It does not replace installed-package acceptance.

## Accept the exact artifact

Launch the AppImage on a real desktop with the Electron sandbox enabled and
an isolated `KOLVRA_HOME`, `XDG_CONFIG_HOME`, and `XDG_DATA_HOME`. Do not pass
build-only library paths or use the installed user's profile. Test:

- first launch, onboarding, and ready Assistant Gateway;
- a working terminal command using the bundled native PTY;
- installation/import, loading, and real inference with a Device Local model;
- graceful close/relaunch with retained conversation, settings, and model data;
- update discovery, download, installation, and restart from an older private
  AppImage into the exact final artifact, with retained state;
- application menu registration, protocol handling, and secure-storage status.

Use `KOLVRA_DESKTOP_MOCK_UPDATES=1`,
`KOLVRA_DESKTOP_MOCK_UPDATE_SERVER_PORT=4141`, and a loopback feed on that port for private
updater acceptance. Keep the final artifact's embedded feed pointed at the public
release repository. Do not publish a private baseline used for this test.

Write a sanitized evidence JSON outside the repository. Record OS, architecture,
desktop session, engine/model, limitations, measured outcomes, and the AppImage's
SHA-256. The validator requires this shape; record `passed` only after observing
the corresponding behavior:

```json
{
  "artifactSha256": "EXACT_APPIMAGE_SHA256",
  "checks": {
    "packagedStartup": "passed",
    "assistantGateway": "passed",
    "terminal": "passed",
    "localInference": "passed",
    "restartPersistence": "passed",
    "updater": "passed"
  }
}
```

For a Debian package, also record `debian.artifactSha256` and
`debian.checks` with `installation`, `startup`, `terminal`, `localInference`,
`upgrade`, `uninstall`, and `persistence`. Each must be `passed` after testing.
Use a private lower-version package for the first Debian upgrade test and label
that baseline clearly. Test dependency resolution on both Ubuntu and Debian.
From 0.3.13, official `.deb` packages also support in-app updates through the
system package installer, which may request administrator authentication.
`latest-linux.yml` must list both packages with their own sizes and SHA-512
digests. Keep the legacy top-level `path` and `sha512` pointing to the AppImage.
The validator still accepts older published AppImage-only feeds for carry-forward.

Run representative distributions in local KVM virtual machines using verified
official images. Record the image checksums, guest versions, memory, display
server, model and inference backend. A minimal X11 guest validates those paths;
it does not establish Wayland, stock desktop, or physical GPU compatibility.
Retain the detailed version matrix in release evidence rather than presenting
one Ubuntu version as the whole Linux download.

## Sign and verify

The trusted Linux signing fingerprint is
`5380DC9C0DAB5287D169FE2667DC7D3C2D3F457B`.
The public key is tracked in `keys/kolvra-linux-signing-key.asc`. Keep its private
key and revocation certificate outside every repository and release directory;
back them up securely. This key expires on 2028-09-11. Review and publish a key
rotation before expiry, rather than silently trusting a key from a downloaded
bundle.

Prepare a fresh directory containing only the final
`Kolvra-VERSION-x86_64.AppImage`, `Kolvra-VERSION-amd64.deb`, and `latest-linux.yml`, then run from this repository:

```sh
node --test scripts/linux-release.test.mjs scripts/validate-windows-release.test.mjs
node scripts/linux-release.mjs prepare /absolute/release VERSION SOURCE_COMMIT \
  /absolute/private-gnupg-home 5380DC9C0DAB5287D169FE2667DC7D3C2D3F457B \
  /absolute/acceptance.json
node scripts/linux-release.mjs verify /absolute/release \
  5380DC9C0DAB5287D169FE2667DC7D3C2D3F457B
```

The signed Linux checksum file is separate from Windows `SHA256SUMS`. Preserve
existing Windows artifacts, metadata, and signatures when adding Linux to a
release. Detached signatures authenticate manual downloads; Electron's updater
uses its configured HTTPS origin and SHA-512 metadata, not OpenPGP verification.

## Publish without Actions

Use authenticated `gh release upload` from this desktop after verification. Never
use `--clobber`; published bytes are immutable. For a new version, create a draft,
upload every supported platform and its update metadata, verify the downloaded
assets, then publish it. A maintainer-authorized first Linux release may append
new Linux-only assets to an existing stable version without changing Windows
bytes. Record the exact Linux source commit separately in the release notes.

If access, publication or evidence/metadata validation fails, preserve the
accepted packages and receipts, repair that phase and revalidate the same bytes.
Rebuild only when the payload or its build inputs need to change.

Upload the AppImage and Debian package, their `.asc` signatures, `latest-linux.yml`, `candidate-linux-x64.json`,
`acceptance-linux-x64.json`, public key, `SHA256SUMS-linux-x64`, and its `.asc`.
Do not upload builder debug logs or private profiles. Download those exact assets
into a fresh directory and run the validator again. Check update discovery
against the public feed and verify the website's versioned download link.

For website pushes that normally trigger Actions, include `[skip ci]` in the
commit message. Verify locally first. Apart from the access preflight above, do
not invoke a build or publication workflow or create a PR as part of this path.

Every future stable release must preserve a usable `latest-linux.yml` and its
referenced artifact alongside Windows update metadata. A later Windows-only
release without Linux metadata can strand Linux update discovery at the latest
GitHub release; coordinate platform publication before advancing that release.

If only one platform changes version, carry the other platform's existing
artifacts and update metadata into the new stable release unchanged. Keep their
original filenames and versions and explain this in the release notes. The
updater resolves filenames against the latest release tag, so leaving the old
platform's files solely on an earlier tag is insufficient. Verify copied bytes
against the original release checksums before publishing.
