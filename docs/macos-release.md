# Local macOS releases

Build on a Mac using the private app repository's pinned dependencies, Xcode
command-line tools, and a clean accepted source commit. Use the same version
and commit as the Windows and Linux release. Keep credentials and acceptance
profiles outside every repository. This procedure does not use GitHub Actions.

## Signing setup

Direct downloads use a **Developer ID Application** certificate, with its
private key available in the signing Keychain. This is not a Mac App Store
distribution certificate. Confirm the intended company and team with
`security find-identity -v -p codesigning`; export an encrypted backup of the
identity and keep its password separately in a password manager.

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
updater feed. Run its configuration validator, then build into separate fresh
directories so architecture manifests cannot overwrite each other:

```sh
vp run dist:desktop:dmg:arm64 --signed --build-version VERSION --output-dir /absolute/mac-arm64
vp run dist:desktop:dmg:x64 --signed --build-version VERSION --output-dir /absolute/mac-x64
```

These commands emit DMG installers and ZIP updater packages with publishing
disabled. The build must complete both signing and notarization. Retain Apple's
successful submission evidence. An unsigned internal build is not publishable.

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

Upload accepted assets to one draft GitHub release alongside Windows and Linux
metadata and all referenced files. Download and verify the uploaded bytes before
publishing; never use `--clobber` or mutate a published artifact. A new stable
release must retain usable updater metadata for every supported platform. If
one platform keeps its previous version, carry its original files and metadata
forward unchanged. Update the website's Mac download links after publication.
