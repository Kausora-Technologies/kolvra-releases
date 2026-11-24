import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-rc\.[1-9]\d*)?$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const LOCAL_ACCEPTANCE_NAME = "acceptance-windows-x64.json";
const FRESH_ACCEPTANCE_CHECKS = [
  "install", "startup", "update", "retainedData", "recovery", "uninstall",
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function digest(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function parseChecksums(text) {
  const entries = new Map();
  for (const line of text.trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})  ([^/\\]+)$/.exec(line);
    invariant(match, `Invalid SHA256SUMS entry: ${line}`);
    invariant(!entries.has(match[2]), `Duplicate SHA256SUMS entry: ${match[2]}`);
    entries.set(match[2], match[1]);
  }
  return entries;
}

function validateLocalAcceptance(acceptance, { sourceCommit, installerSha256 }) {
  invariant(acceptance?.sourceCommit === sourceCommit, "Acceptance source commit does not match.");
  if (Object.hasOwn(acceptance, "verificationReuse")) {
    const reuse = acceptance.verificationReuse;
    invariant(reuse?.ownerAuthorized === true, "Acceptance reuse requires explicit owner authorization.");
    invariant(
      typeof reuse.baselineSource === "string" &&
        reuse.baselineSource.length === 40 &&
        COMMIT_PATTERN.test(reuse.baselineSource),
      "Invalid acceptance baseline.",
    );
    return { mode: "reuse", baselineSource: reuse.baselineSource };
  }

  invariant(acceptance.artifactSha256 === installerSha256, "Fresh acceptance must match the exact installer.");
  const checks = acceptance.checks;
  invariant(checks && typeof checks === "object" && !Array.isArray(checks), "Fresh acceptance checks are missing.");
  for (const name of FRESH_ACCEPTANCE_CHECKS) {
    invariant(Object.hasOwn(checks, name), `Missing Windows acceptance check: ${name}.`);
  }
  for (const [name, status] of Object.entries(checks)) {
    invariant(status === "passed", `Windows acceptance check failed: ${name}.`);
  }
  return { mode: "fresh" };
}

function nativeVersionFromSeries(series) {
  invariant(
    typeof series?.seriesSha256 === "string" &&
      series.seriesSha256.length === 64 &&
      /^[a-f0-9]{64}$/.test(series.seriesSha256) &&
      series.buildId === `kolvra-native2-${series.seriesSha256.slice(0, 16)}` &&
      typeof series.version === "string" &&
      series.version.trim() === series.version &&
      VERSION_PATTERN.test(series.version),
    "The exact-source native series has an invalid version or build identity.",
  );
  return `zeroclaw ${series.version} (${series.buildId})`;
}

export async function validateWindowsRelease({
  directory,
  version,
  sourceRepository,
  sourceCommit,
  releaseRepository,
  localSeriesPath,
}) {
  invariant(VERSION_PATTERN.test(version), "Version must match X.Y.Z or X.Y.Z-rc.N.");
  invariant(COMMIT_PATTERN.test(sourceCommit), "Source commit must be a lowercase 40-character SHA.");
  invariant(sourceRepository.includes("/"), "Source repository must be owner/name.");
  invariant(releaseRepository.includes("/"), "Release repository must be owner/name.");

  const root = path.resolve(directory);
  const manifestName = "candidate-win-x64.json";
  const checksumName = "SHA256SUMS";
  const manifest = JSON.parse(await readFile(path.join(root, manifestName), "utf8"));

  invariant(manifest.schema_version === 1, "Candidate manifest schema must be version 1.");
  invariant(manifest.candidate_version === version, "Candidate version does not match the requested release.");
  invariant(manifest.source?.repository === sourceRepository, "Candidate source repository does not match.");
  invariant(manifest.source?.commit === sourceCommit, "Candidate source commit does not match.");
  invariant(manifest.target?.platform === "win", "Candidate platform must be Windows.");
  invariant(manifest.target?.architecture === "x64", "Candidate architecture must be x64.");
  invariant(
    manifest.target?.signing === "azure-artifact-signing",
    "Windows candidate must use Azure Artifact Signing.",
  );
  invariant(
    manifest.update_feed === `github:${releaseRepository}`,
    "Candidate does not embed the public Kolvra update feed.",
  );

  invariant(Array.isArray(manifest.artifacts), "Candidate manifest artifacts are missing.");
  const artifacts = [...manifest.artifacts].sort((left, right) => left.name.localeCompare(right.name));
  const artifactNames = artifacts.map((artifact) => artifact.name);
  invariant(artifactNames.filter((name) => name.endsWith(".exe")).length === 1, "Expected one Windows installer.");
  invariant(
    artifactNames.filter((name) => name.endsWith(".exe.blockmap")).length === 1,
    "Expected one Windows differential blockmap.",
  );
  invariant(artifactNames.filter((name) => name === "latest.yml").length === 1, "Expected latest.yml.");

  const actualNames = (await readdir(root)).sort();
  const expectedNames = [...artifactNames, manifestName, checksumName].sort();
  invariant(
    JSON.stringify(actualNames) === JSON.stringify(expectedNames),
    `Release file set differs from the candidate manifest: ${actualNames.join(", ")}`,
  );

  const checksums = parseChecksums(await readFile(path.join(root, checksumName), "utf8"));
  invariant(checksums.size === artifacts.length, "SHA256SUMS must cover every candidate artifact exactly once.");

  for (const artifact of artifacts) {
    invariant(typeof artifact.name === "string" && path.basename(artifact.name) === artifact.name, "Unsafe artifact name.");
    invariant(Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0, `Invalid size for ${artifact.name}.`);
    invariant(/^[a-f0-9]{64}$/.test(artifact.sha256), `Invalid digest for ${artifact.name}.`);
    const target = path.join(root, artifact.name);
    const metadata = await stat(target);
    invariant(metadata.isFile(), `${artifact.name} is not a file.`);
    invariant(metadata.size === artifact.bytes, `Size mismatch for ${artifact.name}.`);
    const actualDigest = await digest(target);
    invariant(actualDigest === artifact.sha256, `Digest mismatch for ${artifact.name}.`);
    invariant(checksums.get(artifact.name) === actualDigest, `SHA256SUMS mismatch for ${artifact.name}.`);
  }

  const installer = artifactNames.find((name) => name.endsWith(".exe"));
  const updater = await readFile(path.join(root, "latest.yml"), "utf8");
  invariant(!/localhost|127\.0\.0\.1|generic:/i.test(updater), "Updater metadata contains a local or generic feed.");
  invariant(updater.includes(`version: ${version}`), "Updater metadata version does not match.");
  invariant(updater.includes(installer), "Updater metadata does not reference the accepted installer.");

  const candidate = { version, sourceRepository, sourceCommit, installer, artifactNames };
  if (localSeriesPath === undefined) return candidate;

  invariant(artifactNames.includes(LOCAL_ACCEPTANCE_NAME), "Windows acceptance must be in the candidate manifest.");
  const evidence = JSON.parse(await readFile(path.join(root, LOCAL_ACCEPTANCE_NAME), "utf8"));
  const acceptance = validateLocalAcceptance(evidence, {
    sourceCommit,
    installerSha256: checksums.get(installer),
  });
  const nativeVersion = nativeVersionFromSeries(
    JSON.parse(await readFile(localSeriesPath, "utf8")),
  );
  return { ...candidate, acceptance, nativeVersion };
}

async function main(argv) {
  const [directory, version, sourceRepository, sourceCommit, releaseRepository, flag, localSeriesPath, ...rest] = argv;
  invariant(
    releaseRepository && (flag === undefined || (flag === "--local-acceptance" && localSeriesPath && rest.length === 0)),
    "Usage: validate-windows-release DIRECTORY VERSION SOURCE_REPOSITORY SOURCE_COMMIT RELEASE_REPOSITORY [--local-acceptance SERIES_FILE]",
  );
  const result = await validateWindowsRelease({
    directory,
    version,
    sourceRepository,
    sourceCommit,
    releaseRepository,
    localSeriesPath,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
