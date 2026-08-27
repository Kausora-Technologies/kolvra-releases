# Kolvra releases

This repository is the public download and update origin for accepted Kolvra
desktop releases. Product source and backend deployment records remain private.

An artifact appears here only after its exact candidate passes platform signing
or checksum verification, clean installation, automatic-update, retained-data,
and recovery acceptance.

Each release will include:

- accepted macOS, Windows, and Linux desktop packages;
- Electron update metadata and differential-download blockmaps;
- `SHA256SUMS` and per-target candidate manifests;
- bundled licence and third-party notices.

## Maintainer promotion

Windows publication is a two-stage, artifact-only promotion. The private app
repository first builds and signs an exact candidate using the `public-release`
updater feed. The manual `Publish accepted Windows release` workflow then:

- requires approval through the `production-release` GitHub environment;
- reads the private candidate using the scoped `KOLVRA_APP_READ_TOKEN` secret;
- verifies the source run and commit, Azure signing mode, public updater feed,
  complete file set, manifest sizes, and every SHA-256 digest;
- creates an immutable draft, prerelease, or stable GitHub release without
  copying application source into this repository.

Before first use, configure the environment with a required reviewer and add a
fine-grained token that has read-only Actions and Contents access to the private
`mafazsyed/kolvra-app` repository. A production release must be built from an
exact commit that already passed the app repository's manual CI workflow.

The signed desktop updater uses this repository directly. Customer-facing
website downloads use the same accepted installer bytes mirrored to the
versioned `https://downloads.kolvra.com/windows/` origin with an attachment
header, so clicking Download starts the installer download without visiting a
GitHub page.

Do not download Kolvra from an unofficial mirror. Security reports should be
sent privately to [contact@kolvra.com](mailto:contact@kolvra.com).
