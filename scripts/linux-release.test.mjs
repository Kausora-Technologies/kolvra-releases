import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { prepareLinuxRelease, validateLinuxRelease, validateUpdater } from './linux-release.mjs';

test('shared Linux updater validates each package and preserves old feeds', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'kolvra-linux-feed-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const payloads = [Buffer.from('AppImage bytes'), Buffer.from('different Debian bytes')];
  const artifacts = [{ name: 'Kolvra-0.3.13-x86_64.AppImage', bytes: payloads[0].length }, { name: 'Kolvra-0.3.13-amd64.deb', bytes: payloads[1].length }];
  const hashes = payloads.map(bytes => createHash('sha512').update(bytes).digest('base64'));
  for (const [index, artifact] of artifacts.entries()) await writeFile(path.join(root, artifact.name), payloads[index]);
  const entry = index => `  - url: ${artifacts[index].name}\n    sha512: ${hashes[index]}\n    size: ${artifacts[index].bytes}\n`;
  const feed = indices => `version: 0.3.13\nfiles:\n${indices.map(entry).join('')}path: ${artifacts[0].name}\nsha512: ${hashes[0]}\nreleaseDate: '2026-10-10T00:00:00Z'\n`;
  const check = async (text, version = '0.3.13') => {
    await writeFile(path.join(root, 'latest-linux.yml'), text);
    return validateUpdater(root, version, ...artifacts);
  };
  await t.test('accepts both package orders', async () => { await check(feed([0, 1])); await check(feed([1, 0])); });
  await t.test('rejects omitted Debian package', () => assert.rejects(() => check(feed([0])), /each accepted package/));
  await t.test('rejects duplicate package', () => assert.rejects(() => check(feed([0, 1, 1])), /each accepted package/));
  await t.test('rejects wrong Debian digest', () => assert.rejects(() => check(feed([0, 1]).replace(hashes[1], hashes[0])), /digest must match/));
  await t.test('rejects wrong Debian size', () => assert.rejects(() => check(feed([0, 1]).replace(`size: ${artifacts[1].bytes}`, 'size: 1')), /size must match/));
  await t.test('rejects external URL', () => assert.rejects(() => check(feed([0, 1]).replace(`url: ${artifacts[1].name}`, 'url: https://example.test/package.deb')), /each accepted package/));
  await t.test('rejects duplicate YAML field', () => assert.rejects(() => check(feed([0, 1]) + 'path: other.AppImage\n'), /Duplicate updater field/));
  await t.test('rejects aliases and unexpected mapping', () => assert.rejects(() => check(feed([0, 1]) + '<<: *other\n'), /Unsupported updater metadata/));
  await t.test('preserves the legacy AppImage fallback', () => assert.rejects(() => check(feed([0, 1]).replace(`path: ${artifacts[0].name}`, `path: ${artifacts[1].name}`)), /Legacy updater path/));
  await t.test('accepts published older AppImage-only feed', () => check(feed([0]).replace('version: 0.3.13', 'version: 0.3.11'), '0.3.11'));
});

for (const withDebian of [false, true]) test(`Linux release ${withDebian ? 'with Debian' : 'AppImage only'} verifies signer, bytes, metadata and acceptance`, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'kolvra-linux-release-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const keyHome = path.join(root, 'keys');
  await mkdir(keyHome, { mode: 0o700 });
  const gpg = args => execFileSync('gpg', ['--batch', '--homedir', keyHome, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  gpg(['--pinentry-mode', 'loopback', '--passphrase', '', '--quick-generate-key', 'Release Test <release@example.test>', 'ed25519', 'sign', '1d']);
  const fingerprint = gpg(['--with-colons', '--list-secret-keys']).split('\n').find(line => line.startsWith('fpr:')).split(':')[9];
  const trustedPublicKey = path.join(root, 'trusted.asc');
  await writeFile(trustedPublicKey, gpg(['--armor', '--export', fingerprint]));
  const payload = Buffer.from('fixture artifact bytes');
  const sha256 = createHash('sha256').update(payload).digest('hex');
  const sha512 = createHash('sha512').update(payload).digest('base64');
  const directory = path.join(root, 'release');
  await mkdir(directory);
  const artifact = path.join(directory, 'Kolvra-1.2.3-x86_64.AppImage');
  await writeFile(artifact, payload);
  await writeFile(path.join(directory, 'latest-linux.yml'), `version: 1.2.3\nfiles:\n  - url: Kolvra-1.2.3-x86_64.AppImage\n    sha512: ${sha512}\n    size: ${payload.length}\npath: Kolvra-1.2.3-x86_64.AppImage\nsha512: ${sha512}\n`);
  const evidencePath = path.join(root, 'evidence.json');
  const evidence = { artifactSha256: sha256, checks: Object.fromEntries(['packagedStartup', 'assistantGateway', 'terminal', 'localInference', 'restartPersistence', 'updater'].map(check => [check, 'passed'])) };
  await writeFile(evidencePath, JSON.stringify(evidence));
  let debianPath;
  let debianPayload;
  if (withDebian) {
    const packageRoot = path.join(root, 'deb');
    await mkdir(path.join(packageRoot, 'DEBIAN'), { recursive: true });
    await writeFile(path.join(packageRoot, 'DEBIAN/control'), 'Package: kolvra\nVersion: 1.2.3\nArchitecture: amd64\nMaintainer: Release Test <release@example.test>\nDescription: Release verification fixture\n');
    debianPath = path.join(directory, 'Kolvra-1.2.3-amd64.deb');
    execFileSync('dpkg-deb', ['--build', '--root-owner-group', packageRoot, debianPath], { stdio: 'ignore' });
    debianPayload = await readFile(debianPath);
    const debianSha512 = createHash('sha512').update(debianPayload).digest('base64');
    const updaterPath = path.join(directory, 'latest-linux.yml');
    const updater = await readFile(updaterPath, 'utf8');
    await writeFile(updaterPath, updater.replace('\npath:', `\n  - url: Kolvra-1.2.3-amd64.deb\n    sha512: ${debianSha512}\n    size: ${debianPayload.length}\npath:`));
    evidence.debian = { artifactSha256: createHash('sha256').update(debianPayload).digest('hex'), checks: Object.fromEntries(['installation', 'startup', 'terminal', 'localInference', 'upgrade', 'uninstall', 'persistence'].map(check => [check, 'passed'])) };
    await writeFile(evidencePath, JSON.stringify(evidence));
  }
  const prepare = () => prepareLinuxRelease({ directory, version: '1.2.3', commit: 'a'.repeat(40), keyHome, fingerprint, evidencePath });
  const verify = () => validateLinuxRelease({ directory, fingerprint, trustedPublicKey });
  await t.test('requires acceptance for the exact artifact', async () => {
    await writeFile(evidencePath, JSON.stringify({ ...evidence, artifactSha256: '0'.repeat(64) }));
    await assert.rejects(prepare, /Acceptance must describe these exact bytes/);
    await writeFile(evidencePath, JSON.stringify(evidence));
  });
  if (withDebian) await t.test('requires Debian acceptance for the exact package', async () => {
    await writeFile(evidencePath, JSON.stringify({ ...evidence, debian: { ...evidence.debian, artifactSha256: '0'.repeat(64) } }));
    await assert.rejects(prepare, /Debian acceptance must describe these exact bytes/);
    await writeFile(evidencePath, JSON.stringify(evidence));
  });
  await prepare();
  await t.test('accepts an independently verified release', async () => {
    assert.equal((await verify()).candidate_version, '1.2.3');
  });
  await t.test('rejects the wrong expected signer', async () => {
    await assert.rejects(() => validateLinuxRelease({ directory, fingerprint: 'B'.repeat(40), trustedPublicKey }), /Unexpected signing key/);
  });
  await t.test('rejects a modified artifact', async () => {
    await writeFile(artifact, 'modified bytes');
    await assert.rejects(verify, /Digest mismatch/);
    await writeFile(artifact, payload);
  });
  if (withDebian) await t.test('rejects a modified Debian package', async () => {
    await writeFile(debianPath, 'modified package');
    await assert.rejects(verify, /Digest mismatch/);
    await writeFile(debianPath, debianPayload);
  });
  await t.test('rejects modified updater metadata', async () => {
    const updater = path.join(directory, 'latest-linux.yml');
    const original = await readFile(updater);
    await writeFile(updater, 'version: 99.0.0\n');
    await assert.rejects(verify, /Digest mismatch/);
    await writeFile(updater, original);
  });
  await t.test('rejects extra files', async () => {
    const extra = path.join(directory, 'unexpected.txt');
    await writeFile(extra, 'unexpected');
    await assert.rejects(verify, /Release file set differs/);
    await rm(extra);
  });
  await t.test('rejects a modified checksum manifest before trusting its names', async () => {
    const checksum = path.join(directory, 'SHA256SUMS-linux-x64');
    await writeFile(checksum, '0'.repeat(64) + '  ../outside\n');
    await assert.rejects(verify);
  });
});
