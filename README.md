# Kolvra releases

This repository is the public download and update origin for accepted Kolvra
desktop releases. Product source and backend deployment records remain private.

An artifact appears here only after signing and artifact integrity verification,
with installation, update, retained-data and recovery acceptance evidence. A
maintainer may explicitly reuse completed acceptance and focused checks for a
follow-up release; the source workflow records that decision and its baseline.

Each release will include:

- accepted packages for the supported desktop platforms;
- Electron update metadata and differential-download blockmaps;
- `SHA256SUMS` and per-target candidate manifests;
- bundled licence and third-party notices.
- a separate, optional Windows Subsystem for Linux runtime when applicable.

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
`mafazsyed/kolvra-app` repository. Production candidates normally require a
successful manual CI run on the exact source commit. Explicit verification
reuse requires a successful ancestor candidate and maintainer authorization
with the completed checks recorded in the source workflow summary. Signing,
artifact integrity and protected publication are always required.

The signed desktop updater and website download button use the accepted assets
in this repository. The website links directly to the versioned installer asset,
whose attachment header starts the download without visiting a GitHub page.

Linux releases can be built, accepted, signed, and published entirely on a local
desktop, without GitHub Actions. Maintainers should follow
[the local Linux release procedure](docs/linux-release.md). Customers can use
[the Linux installation and signature guide](docs/linux-download.md).

Do not download Kolvra from an unofficial mirror. Security reports should be
sent privately to [contact@kolvra.com](mailto:contact@kolvra.com).
