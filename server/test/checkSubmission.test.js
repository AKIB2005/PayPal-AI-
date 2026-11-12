import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSubmissionCheck } from '../src/checkSubmission.js';

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), 'nudge-sub-'));
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(join(root, f, '..'), { recursive: true });
    writeFileSync(join(root, f), text);
  }
  return root;
}
const FAKE_ANTHROPIC = ['sk', 'ant', 'abcdefghijklmnopqrstuvwxyz123456'].join('-');
const FAKE_ASSIGN = (name) => `${name}=` + 'abcd1234efgh5678';
const GOOD = { 'README.md': '# Nudge', 'LICENSE': 'MIT License\n\nPermission is hereby granted', 'docs/DEVPOST_SUBMISSION.md': 'All filled in.', 'server/.env.example': 'ANTHROPIC_API_KEY=\nPAYPAL_CLIENT_SECRET=\n' };
const by = (r, name) => r.checks.find((c) => c.name === name);

test('a clean repo passes', () => {
  const r = runSubmissionCheck({ root: repo(GOOD), gitFiles: ['README.md', 'LICENSE'] });
  assert.equal(r.ok, true);
});

test('unfilled [[markers]] fail and name the line', () => {
  const r = runSubmissionCheck({ root: repo({ ...GOOD, 'docs/DEVPOST_SUBMISSION.md': 'ok\nRepo: [[URL]]\n' }), gitFiles: [] });
  assert.equal(r.ok, false);
  assert.match(by(r, 'Text: docs/DEVPOST_SUBMISSION.md').detail, /line\(s\) 2/);
});

test('a missing or non-license LICENSE fails', () => {
  assert.equal(by(runSubmissionCheck({ root: repo({ ...GOOD, LICENSE: 'all rights reserved' }), gitFiles: [] }), 'Open-source license').status, 'fail');
});

test('API keys left in a file are caught, but the blank .env.example is fine', () => {
  const leaked = runSubmissionCheck({ root: repo({ ...GOOD, 'server/notes.txt': `key ${FAKE_ANTHROPIC}` }), gitFiles: [] });
  assert.equal(by(leaked, 'Secrets in files').status, 'fail');
  assert.equal(by(runSubmissionCheck({ root: repo(GOOD), gitFiles: [] }), 'Secrets in files').status, 'pass');
  const assigned = runSubmissionCheck({ root: repo({ ...GOOD, 'docs/setup.md': FAKE_ASSIGN('GEMINI_API_KEY') }), gitFiles: [] });
  assert.equal(by(assigned, 'Secrets in files').status, 'fail');
});

test('a local .env is ignored by the scan but fails if git tracks it', () => {
  const root = repo({ ...GOOD, 'server/.env': FAKE_ASSIGN('ANTHROPIC_API_KEY') });
  assert.equal(by(runSubmissionCheck({ root, gitFiles: ['README.md'] }), 'Secrets in files').status, 'pass');
  const tracked = runSubmissionCheck({ root, gitFiles: ['README.md', 'server/.env'] });
  assert.equal(by(tracked, '.env not committed').status, 'fail');
  assert.equal(tracked.ok, false);
});

test('without git the tracking check is skipped, not failed', () => {
  assert.equal(by(runSubmissionCheck({ root: repo(GOOD), gitFiles: null }), '.env not committed').status, 'skip');
});
