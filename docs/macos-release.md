# Local macOS releases

Build on a Mac using the private app repository's pinned dependencies, Xcode
command-line tools, and a clean accepted source commit. Record the source commit
and version for each platform. When only macOS advances, preserve the previously
released Windows and Linux files and updater manifests unchanged. Keep credentials
and acceptance profiles outside every repository. Build, sign and upload locally;
the access preflight below is a separate read-only Actions check.

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

## Signing setup

Direct downloads use a **Developer ID Application** certificate, with its
private key available in the signing Keychain. This is not a Mac App Store
distribution certificate. Confirm the intended company and team with
`security find-identity -v -p codesigning`; export an encrypted backup of the
identity and keep its password separately in a password manager.
If selecting an identity with `CSC_NAME`, use the company-and-team portion
(for example, `Company Name (TEAMID)`), without the `Developer ID Application:`
prefix; electron-builder chooses that certificate type itself.

Configure Apple notarization using a dedicated App Store Connect team API key
with the App Manager role recommended by [Electron's notarization guide](https://github.com/electron/notarize#usage-with-app-store-connect-api-key),
or an Apple ID app-specific password. Prefer storing the
credentials in a named Keychain profile with `xcrun notarytool store-credentials`
and setting `APPLE_KEYCHAIN_PROFILE` to that profile. Keep credentials out of
command history and build logs. The builder also supports `APPLE_API_KEY`
(the private `.p8` file path), `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`.
Check the active team's API access before creating a key.

The current desktop does not enable native passkeys. Associated Domains and
its provisioning profile are not prerequisites for this release. Signing does
not enable passkeys or publish an App Store listing.

## Build and accept

Set the production public configuration documented in the private app's
`docs/operations/release.md`, including the public release repository as the
updater feed. Run its configuration validator and temporarily align the build
checkout's package versions, then build into separate fresh directories so
architecture manifests cannot overwrite each other:

```sh
vp exec node scripts/update-release-package-versions.ts VERSION
vp run dist:desktop:dmg:arm64 --signed --build-version VERSION --output-dir /absolute/mac-arm64 --keep-stage
vp run dist:desktop:dmg:x64 --signed --build-version VERSION --output-dir /absolute/mac-x64 --keep-stage
```

These commands emit DMG installers and ZIP updater packages with publishing
disabled. The build must complete both signing and notarization. Retain Apple's
successful submission evidence. An unsigned internal build is not publishable.
Restore the saved package manifests after the build; do not commit the temporary
version edits. Confirm that Settings, the backend, and the native app all report
the intended release version.

Retain each stage, build log and receipt outside the repository, including
source commit, version, public configuration, dependency inputs, native hashes,
artifact hashes and signing/notarization results. Use `--skip-build` only when
the existing compiled outputs match all those inputs; it skips compilation, not
staging or packaging. Run focused tests for changed paths. Record any authorized
acceptance reuse with its baseline hashes, scope and limits, without describing
inherited checks as freshly executed.

As soon as the unpacked app exists, run the private app repository's PDF/DOCX
smoke through its actual Electron executable, before further interactive acceptance:

```sh
ELECTRON_RUN_AS_NODE=1 "/absolute/Kolvra.app/Contents/MacOS/Kolvra" \
  scripts/verify-bundled-documents.mjs \
  "/absolute/Kolvra.app/Contents/Resources/app.asar.unpacked/apps/server/dist/bin.mjs"
```

Retain the result with the payload hashes. This smoke does not cover scanned-PDF
OCR; record that affected-runtime check separately when document or OCR
dependencies change. It does not replace installation or signed-app acceptance.

Mount each DMG and separately extract its ZIP. Verify the app from both:

```sh
codesign --verify --deep --strict "/absolute/Kolvra.app"
codesign -dv --verbose=4 "/absolute/Kolvra.app"
xcrun stapler validate "/absolute/Kolvra.app"
spctl --assess --type execute --verbose=4 "/absolute/Kolvra.app"
```

Confirm the Developer ID team, `com.kausora.kolvra` bundle identifier, hardened
runtime, and embedded native helpers. On the target architecture, test clean
installation, startup, Assistant readiness, Code, local inference, terminal,
Google sign-in and browser return, quit/relaunch, retained data, and permissions.
If Computer Use is offered, verify the bundled Cua Driver and actual capture and
control under Kolvra's permissions. Test offline launch with the notarization
ticket present. Record the tested macOS versions and hardware accurately.

If a read-only DMG attach fails once, retain the failure and stop repeated attach
attempts. Use these offline checks on disposable extraction paths:

- Verify the original DMG hash and complete archive integrity/CRC with a verified
  archive reader; retain the tool version and result.
- Extract faithfully, retaining the archive's original signing metadata. If the
  reader requires metadata restoration, use the archive's own metadata; do not
  re-sign the extracted app. Record an unresolved check if faithful extraction
  cannot be established.
- Compare the complete app payload with the accepted matching ZIP, including
  regular-file hashes, file types, executable bits and symlink targets, then run the signature and
  stapled-ticket checks above on the faithfully extracted app. Retain the ZIP's
  separate Gatekeeper result.

Record this as offline integrity, payload parity and signature/ticket evidence.
Mounted-DMG installation acceptance remains a separate unperformed check until
an actual mount and installation succeed on a supported test machine.

For the first signed Mac release, use a private lower-version build signed with
the same identity to test update download, install/restart, data retention, and
interruption recovery into the final artifact. Do not claim an unsigned older
build establishes signed updater compatibility. Use the private app's loopback
update configuration and isolated data paths; keep the final public feed intact.

## Assemble and publish

Preserve both architectures' DMGs, ZIPs, and blockmaps. From the private app
repository, merge the updater files into a separate staging directory:

```sh
vp exec node scripts/merge-update-manifests.ts --platform mac \
  /absolute/mac-arm64/latest-mac.yml /absolute/mac-x64/latest-mac.yml \
  /absolute/release/latest-mac.yml
```

Check that every file named in the merged metadata exists and that its size and
SHA-512 match. Generate per-architecture candidate JSON with the existing
`scripts/create-release-candidate-manifest.ts`; record the exact source commit,
version, public updater feed, signing status and final artifact hashes. Rename
the per-directory checksum files to unique architecture-specific names when
collecting them, and generate checksums for the final merged metadata too.
Keep detailed acceptance logs private; upload only sanitized evidence.

If access, publication or evidence/metadata validation fails, preserve accepted
artifacts and receipts, repair that phase and revalidate the same bytes. Rebuild
only when the payload or its build inputs need to change.

Upload accepted assets to one draft GitHub release alongside Windows and Linux
metadata and all referenced files. Download and verify the uploaded bytes before
publishing; never use `--clobber` or mutate a published artifact. A new stable
release must retain usable updater metadata for every supported platform. If
one platform keeps its previous version, carry its original files and metadata
forward unchanged. Update the website's Mac download links after publication.
