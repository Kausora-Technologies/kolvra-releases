import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const checksumName = 'SHA256SUMS-linux-x64';
const manifestName = 'candidate-linux-x64.json';
const evidenceName = 'acceptance-linux-x64.json';
const publicKeyName = 'kolvra-linux-signing-key.asc';
const trustedKey = fileURLToPath(new URL('../keys/kolvra-linux-signing-key.asc', import.meta.url));
const requiredChecks = ['packagedStartup', 'assistantGateway', 'terminal', 'localInference', 'restartPersistence', 'updater'];

export async function digest(file, algorithm = 'sha256', encoding = 'hex') {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest(encoding);
}

function gpg(args, options = {}) {
  return execFileSync('gpg', ['--batch', '--no-tty', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

function validateIdentity(version, commit, fingerprint) {
  assert.match(version, /^\d+\.\d+\.\d+(?:-rc\.[1-9]\d*)?$/);
  assert.match(commit, /^[a-f0-9]{40}$/);
  assert.match(fingerprint, /^[A-F0-9]{40}$/);
}

async function validateUpdater(directory, version, artifact) {
  const updater = await readFile(path.join(directory, 'latest-linux.yml'), 'utf8');
  const values = key => [...updater.matchAll(new RegExp(`^\\s*(?:- )?${key}: ([^\\r\\n]+)$`, 'gm'))].map(match => match[1].trim().replace(/^['"]|['"]$/g, ''));
  assert.deepEqual(values('version'), [version], 'Updater version must match the artifact.');
  assert.deepEqual(values('url'), [artifact.name], 'Updater must contain one relative AppImage URL.');
  assert.deepEqual(values('path'), [artifact.name], 'Updater path must match the artifact.');
  assert.deepEqual(values('size'), [String(artifact.bytes)], 'Updater size must match the artifact.');
  const expected = await digest(path.join(directory, artifact.name), 'sha512', 'base64');
  assert.deepEqual(values('sha512'), [expected, expected], 'Both updater digests must match the artifact.');
}

export async function prepareLinuxRelease({ directory, version, commit, keyHome, fingerprint, evidencePath }) {
  validateIdentity(version, commit, fingerprint);
  assert.deepEqual((await readdir(directory)).sort(), [`Kolvra-${version}-x86_64.AppImage`, 'latest-linux.yml'].sort(), 'Prepare a fresh directory containing only the AppImage and updater metadata.');
  const artifacts = [];
  for (const name of await readdir(directory)) {
    const file = path.join(directory, name);
    const metadata = await lstat(file);
    assert(metadata.isFile() && !metadata.isSymbolicLink());
    artifacts.push({ name, bytes: metadata.size, sha256: await digest(file) });
  }
  artifacts.sort((a, b) => a.name.localeCompare(b.name));
  const artifact = artifacts.find(file => file.name.endsWith('.AppImage'));
  await validateUpdater(directory, version, artifact);
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  assert.equal(evidence.artifactSha256, artifact.sha256, 'Acceptance must describe these exact bytes.');
  for (const check of requiredChecks) assert.equal(evidence.checks?.[check], 'passed', `Missing acceptance: ${check}`);
  const manifest = { schema_version: 1, candidate_version: version, source: { repository: 'mafazsyed/kolvra-app', commit }, target: { platform: 'linux', architecture: 'x64', signing: 'openpgp-detached', signing_fingerprint: fingerprint }, build_environment: 'local', update_feed: 'github:Kausora-Technologies/kolvra-releases', artifacts };
  await writeFile(path.join(directory, manifestName), JSON.stringify(manifest, null, 2) + '\n');
  await copyFile(evidencePath, path.join(directory, evidenceName));
  await writeFile(path.join(directory, publicKeyName), gpg(['--homedir', keyHome, '--armor', '--export', fingerprint]));
  gpg(['--homedir', keyHome, '--local-user', fingerprint, '--armor', '--detach-sign', '--output', path.join(directory, artifact.name + '.asc'), path.join(directory, artifact.name)]);
  const checksums = [];
  for (const name of (await readdir(directory)).sort()) checksums.push(`${await digest(path.join(directory, name))}  ${name}`);
  await writeFile(path.join(directory, checksumName), checksums.join('\n') + '\n');
  gpg(['--homedir', keyHome, '--local-user', fingerprint, '--armor', '--detach-sign', '--output', path.join(directory, checksumName + '.asc'), path.join(directory, checksumName)]);
  return manifest;
}

export async function validateLinuxRelease({ directory, fingerprint, trustedPublicKey = trustedKey }) {
  assert.match(fingerprint, /^[A-F0-9]{40}$/);
  const keyHome = await mkdtemp(path.join(tmpdir(), 'kolvra-linux-verification-'));
  try {
    // Trust comes from the reviewed repository key, never from the downloaded bundle.
    gpg(['--homedir', keyHome, '--import', trustedPublicKey]);
    const verify = (signature, file) => {
      const status = gpg(['--homedir', keyHome, '--status-fd', '1', '--verify', path.join(directory, signature), path.join(directory, file)]);
      assert(status.split('\n').some(line => line.startsWith(`[GNUPG:] VALIDSIG ${fingerprint} `)), 'Unexpected signing key.');
    };
    verify(checksumName + '.asc', checksumName);
    const lines = (await readFile(path.join(directory, checksumName), 'utf8')).trim().split('\n');
    const entries = new Map();
    for (const line of lines) {
      const match = /^([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(line);
      assert(match && !entries.has(match[2]), 'Unsafe or duplicate checksum entry.');
      entries.set(match[2], match[1]);
    }
    assert.deepEqual((await readdir(directory)).sort(), [...entries.keys(), checksumName, checksumName + '.asc'].sort(), 'Release file set differs from signed checksums.');
    for (const [name, expected] of entries) {
      const metadata = await lstat(path.join(directory, name));
      assert(metadata.isFile() && !metadata.isSymbolicLink(), 'Release assets must be regular files.');
      assert.equal(await digest(path.join(directory, name)), expected, `Digest mismatch: ${name}`);
    }
    assert.equal(await digest(path.join(directory, publicKeyName)), await digest(trustedPublicKey), 'Bundled public key differs from the trusted key.');
    const manifest = JSON.parse(await readFile(path.join(directory, manifestName), 'utf8'));
    validateIdentity(manifest.candidate_version, manifest.source?.commit, fingerprint);
    assert.equal(manifest.schema_version, 1);
    assert.equal(manifest.source.repository, 'mafazsyed/kolvra-app');
    assert.equal(manifest.build_environment, 'local');
    assert.equal(manifest.update_feed, 'github:Kausora-Technologies/kolvra-releases');
    assert.deepEqual(manifest.target, { platform: 'linux', architecture: 'x64', signing: 'openpgp-detached', signing_fingerprint: fingerprint });
    const artifactName = `Kolvra-${manifest.candidate_version}-x86_64.AppImage`;
    assert.deepEqual(manifest.artifacts.map(item => item.name).sort(), [artifactName, 'latest-linux.yml'].sort());
    for (const artifact of manifest.artifacts) {
      assert.equal(artifact.sha256, entries.get(artifact.name));
      assert.equal(artifact.bytes, (await lstat(path.join(directory, artifact.name))).size);
    }
    const artifact = manifest.artifacts.find(item => item.name === artifactName);
    await validateUpdater(directory, manifest.candidate_version, artifact);
    verify(artifactName + '.asc', artifactName);
    const evidence = JSON.parse(await readFile(path.join(directory, evidenceName), 'utf8'));
    assert.equal(evidence.artifactSha256, artifact.sha256);
    for (const check of requiredChecks) assert.equal(evidence.checks?.[check], 'passed', `Missing acceptance: ${check}`);
    return manifest;
  } finally {
    await rm(keyHome, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, directory, ...args] = process.argv.slice(2);
  if (command === 'prepare') {
    const [version, commit, keyHome, fingerprint, evidencePath] = args;
    console.log(JSON.stringify(await prepareLinuxRelease({ directory, version, commit, keyHome, fingerprint, evidencePath }), null, 2));
  } else if (command === 'verify') {
    console.log(JSON.stringify(await validateLinuxRelease({ directory, fingerprint: args[0] }), null, 2));
  } else throw new Error('Usage: linux-release.mjs prepare DIR VERSION COMMIT GNUPG_HOME FINGERPRINT EVIDENCE_JSON | verify DIR FINGERPRINT');
}
