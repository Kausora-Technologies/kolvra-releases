# Kolvra for Linux

Choose the x64 AppImage for the main Linux download, or the `.deb` package for
convenient Ubuntu / Debian installation. Download from the official
[Kolvra releases](https://github.com/Kausora-Technologies/kolvra-releases/releases).
Allow the downloaded file to execute as a program in its file properties, then
open it. The equivalent terminal commands for version 0.3.7 are:

```sh
chmod +x Kolvra-0.3.7-x86_64.AppImage
./Kolvra-0.3.7-x86_64.AppImage
```

Keep the AppImage in a writable, permanent folder so in-app updates can replace
it. Your conversations, settings, and local models are stored separately under
`~/.kolvra`, and replacing the AppImage preserves that data. Removing the
AppImage does not delete your conversations or downloaded models.

When upgrading from 0.3.3, saved chats remain visible. Local chats created with
the retired engine need a new conversation using Light or Full to continue.
Your downloaded models and settings remain available.

If the launcher reports missing FUSE support, install the FUSE 2 compatibility
package using your system's package manager (`libfuse2t64` on newer Ubuntu / Debian,
`libfuse2` on older versions, or `fuse-libs` on Fedora). Minimal systems also
need the mount utility (`fuse3` on Ubuntu / Debian or `fuse` on Fedora), as described in the
[AppImage FUSE guide](https://docs.appimage.org/user-guide/troubleshooting/fuse.html).
Do not disable Electron's
sandbox to work around a launch problem. Report the error and your distribution
through [Kolvra support](https://kolvra.com/support/).

## Ubuntu / Debian package

Open the `.deb` in your system's software installer, or run:

```sh
sudo apt install ./Kolvra-0.3.7-amd64.deb
```

Then open Kolvra from the application menu. Install a newer `.deb` the same way
to update; this package does not use the AppImage's in-app updater. The package
manager installs required system libraries. Removing the package leaves your
conversations, settings, and models in your home directory.

Linux downloads are for x64 Intel / AMD computers. ARM computers need a separate
build. AppImage supports multiple distributions, but no single package guarantees
every Linux version and desktop. See the release's `acceptance-linux-x64.json`
for the distributions, sessions, hardware and features actually tested.

## Verify the download

Download the matching `.AppImage.asc` or `.deb.asc` signature and `kolvra-linux-signing-key.asc`
from the same release. The trusted release-key fingerprint is:

```text
5380 DC9C 0DAB 5287 D169 FE26 67DC 7D3C 2D3F 457B
```

Check it before importing the key:

```sh
gpg --show-keys --with-fingerprint kolvra-linux-signing-key.asc
gpg --import kolvra-linux-signing-key.asc
gpg --verify Kolvra-0.3.7-x86_64.AppImage.asc Kolvra-0.3.7-x86_64.AppImage
```

For the Debian package, substitute `Kolvra-0.3.7-amd64.deb.asc` and
`Kolvra-0.3.7-amd64.deb` in the verification command.

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
