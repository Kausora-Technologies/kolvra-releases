# Kolvra for Linux

The x64 AppImage is qualified on Ubuntu 24.04. Download it from the official
[Kolvra releases](https://github.com/Kausora-Technologies/kolvra-releases/releases).
Allow the downloaded file to execute as a program in its file properties, then
open it. The equivalent terminal commands for version 0.3.2 are:

```sh
chmod +x Kolvra-0.3.2-x86_64.AppImage
./Kolvra-0.3.2-x86_64.AppImage
```

Keep the AppImage in a writable, permanent folder so in-app updates can replace
it. Your conversations, settings, and local models are stored separately under
`~/.kolvra`, and replacing the AppImage preserves that data. Removing the
AppImage does not delete your conversations or downloaded models.

If the launcher reports missing FUSE support on Ubuntu 24.04, install
`libfuse2t64` using your system's package manager, as described in the
[AppImage FUSE guide](https://docs.appimage.org/user-guide/troubleshooting/fuse.html).
Do not disable Electron's
sandbox to work around a launch problem. Report the error and your distribution
through [Kolvra support](https://kolvra.com/support/).

## Verify the download

Download the matching `.AppImage.asc` signature and `kolvra-linux-signing-key.asc`
from the same release. The trusted release-key fingerprint is:

```text
5380 DC9C 0DAB 5287 D169 FE26 67DC 7D3C 2D3F 457B
```

Check it before importing the key:

```sh
gpg --show-keys --with-fingerprint kolvra-linux-signing-key.asc
gpg --import kolvra-linux-signing-key.asc
gpg --verify Kolvra-0.3.2-x86_64.AppImage.asc Kolvra-0.3.2-x86_64.AppImage
```

Require a good signature from that exact fingerprint. GPG may also say the key
has no personal trust certification; the fingerprint comparison above is how
you establish the expected release identity. A bad signature or different
fingerprint means you should not run the file.

`SHA256SUMS-linux-x64` and its signature cover the Linux artifact, updater
metadata, and release evidence. Download all Linux release files to check them:

```sh
gpg --verify SHA256SUMS-linux-x64.asc SHA256SUMS-linux-x64
sha256sum --check SHA256SUMS-linux-x64
```

Device Local does not require a Kolvra account. Model downloads and managed
services need a network connection; managed services require sign-in. Model
speed and acceleration depend on your hardware and installed drivers.
