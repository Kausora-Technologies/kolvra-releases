import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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

async function fixture(updateFeed = `github:${releaseRepository}`, acceptance) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kolvra-windows-release-"));
  const files = new Map([
    [`Kolvra-${version}-x64.exe`, Buffer.from("signed-installer")],
    [`Kolvra-${version}-x64.exe.blockmap`, Buffer.from("blockmap")],
    ["latest.yml", Buffer.from(`version: ${version}\npath: Kolvra-${version}-x64.exe\n`)],
  ]);
  if (acceptance !== undefined) {
    files.set("acceptance-windows-x64.json", Buffer.from(JSON.stringify(acceptance)));
  }
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

test("accepts checksums written with Windows CRLF line endings", async () => {
  const directory = await fixture();
  const checksums = path.join(directory, "SHA256SUMS");
  await writeFile(checksums, (await readFile(checksums, "utf8")).replaceAll("\n", "\r\n"));
  const result = await validateWindowsRelease({
    directory, version, sourceRepository, sourceCommit, releaseRepository,
  });
  assert.equal(result.installer, `Kolvra-${version}-x64.exe`);
});

test("rejects an artifact changed after the candidate manifest was created", async () => {
  const directory = await fixture();
  await writeFile(path.join(directory, `Kolvra-${version}-x64.exe`), "replacement");
  await assert.rejects(
    validateWindowsRelease({ directory, version, sourceRepository, sourceCommit, releaseRepository }),
    /Size mismatch|Digest mismatch/,
  );
});

const freshAcceptance = {
  sourceCommit,
  artifactSha256: sha256("signed-installer"),
  checks: {
    install: "passed",
    startup: "passed",
    update: "passed",
    retainedData: "passed",
    recovery: "passed",
    uninstall: "passed",
  },
};

const series = {
  version: "0.8.6",
  buildId: "kolvra-native2-adf88b8e7c2fc024",
  seriesSha256: "adf88b8e7c2fc024a25af7473be421adcf4cc74fb3ca478f6a86dcba51984374",
};

async function validateLocalCandidate(acceptance, nativeSeries = series) {
  const directory = await fixture(undefined, acceptance);
  const seriesDirectory = await mkdtemp(path.join(os.tmpdir(), "kolvra-native-series-"));
  const localSeriesPath = path.join(seriesDirectory, "series.json");
  await writeFile(localSeriesPath, JSON.stringify(nativeSeries));
  return validateWindowsRelease({
    directory, version, sourceRepository, sourceCommit, releaseRepository, localSeriesPath,
  });
}

test("binds fresh acceptance to the exact installer and the native pin to the source series", async () => {
  const result = await validateLocalCandidate(freshAcceptance);
  assert.deepEqual(result.acceptance, { mode: "fresh" });
  assert.equal(result.nativeVersion, "zeroclaw 0.8.6 (kolvra-native2-adf88b8e7c2fc024)");
});

test("recognizes existing, explicitly authorized acceptance reuse", async () => {
  const baselineSource = "b".repeat(40);
  const result = await validateLocalCandidate({
    sourceCommit,
    verificationReuse: { ownerAuthorized: true, baselineSource },
  });
  assert.deepEqual(result.acceptance, { mode: "reuse", baselineSource });
});

test("rejects unverified or mismatched fresh acceptance", async () => {
  await assert.rejects(validateLocalCandidate(), /acceptance must be in the candidate manifest/);
  await assert.rejects(validateLocalCandidate({
    ...freshAcceptance, artifactSha256: "c".repeat(64),
  }), /must match the exact installer/);
  await assert.rejects(validateLocalCandidate({
    ...freshAcceptance, checks: { ...freshAcceptance.checks, update: "not-repeated" },
  }), /check failed: update/);
  await assert.rejects(validateLocalCandidate({
    ...freshAcceptance, checks: { startup: "passed" },
  }), /Missing Windows acceptance check: install/);
  await assert.rejects(validateLocalCandidate({
    ...freshAcceptance, sourceCommit: "c".repeat(40),
  }), /source commit does not match/);
});

test("rejects invalid reuse even when fresh checks pass", async () => {
  await assert.rejects(validateLocalCandidate({
    ...freshAcceptance,
    verificationReuse: { ownerAuthorized: "false", baselineSource: "c".repeat(40) },
  }), /requires explicit owner authorization/);
  await assert.rejects(validateLocalCandidate({
    ...freshAcceptance, verificationReuse: null,
  }), /requires explicit owner authorization/);
});

test("rejects a build identity that differs from the source series digest", async () => {
  await assert.rejects(validateLocalCandidate(freshAcceptance, {
    ...series, buildId: "kolvra-native2-ffc2f4f3cae5693a",
  }), /invalid version or build identity/);
});
