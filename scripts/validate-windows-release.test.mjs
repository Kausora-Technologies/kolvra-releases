import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { validateWindowsRelease } from "./validate-windows-release.mjs";

const version = "0.1.0-rc.7";
const sourceRepository = "mafazsyed/kolvra-app";
const sourceCommit = "a".repeat(40);
const releaseRepository = "Kausora-Technologies/kolvra-releases";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function fixture(updateFeed = `github:${releaseRepository}`) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kolvra-windows-release-"));
  const files = new Map([
    [`Kolvra-${version}-x64.exe`, Buffer.from("signed-installer")],
    [`Kolvra-${version}-x64.exe.blockmap`, Buffer.from("blockmap")],
    ["latest.yml", Buffer.from(`version: ${version}\npath: Kolvra-${version}-x64.exe\n`)],
  ]);
  const artifacts = [];
  for (const [name, bytes] of files) {
    await writeFile(path.join(directory, name), bytes);
    artifacts.push({ name, bytes: bytes.length, sha256: sha256(bytes) });
  }
  await writeFile(
    path.join(directory, "SHA256SUMS"),
    `${artifacts.map((artifact) => `${artifact.sha256}  ${artifact.name}`).join("\n")}\n`,
  );
  await writeFile(
    path.join(directory, "candidate-win-x64.json"),
    `${JSON.stringify({
      schema_version: 1,
      candidate_version: version,
      source: { repository: sourceRepository, commit: sourceCommit },
      target: { platform: "win", architecture: "x64", signing: "azure-artifact-signing" },
      update_feed: updateFeed,
      artifacts,
    })}\n`,
  );
  return directory;
}

test("accepts an exact signed Windows candidate with the public update feed", async () => {
  const result = await validateWindowsRelease({
    directory: await fixture(),
    version,
    sourceRepository,
    sourceCommit,
    releaseRepository,
  });
  assert.equal(result.installer, `Kolvra-${version}-x64.exe`);
});

test("rejects a candidate built for a local updater", async () => {
  await assert.rejects(
    validateWindowsRelease({
      directory: await fixture("generic:http://localhost:4141"),
      version,
      sourceRepository,
      sourceCommit,
      releaseRepository,
    }),
    /public Kolvra update feed/,
  );
});

test("rejects an artifact changed after the candidate manifest was created", async () => {
  const directory = await fixture();
  await writeFile(path.join(directory, `Kolvra-${version}-x64.exe`), "replacement");
  await assert.rejects(
    validateWindowsRelease({ directory, version, sourceRepository, sourceCommit, releaseRepository }),
    /Size mismatch|Digest mismatch/,
  );
});
