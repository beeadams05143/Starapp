import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const modules = html => Array.from(html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g), match => match[1]);
const authScript = modules(read('auth.html'))[0].replace(/^\s*import\b[\s\S]*?;\n/gm, '');
const event = { preventDefault() {} };
const token = aal => 'header.' + Buffer.from(JSON.stringify({ aal })).toString('base64url') + '.signature';
const user = { id: 'user-one' };
const enrolled = { ...user, factors: [{ id: 'factor-one', factor_type: 'totp', status: 'verified' }] };
const session = (user, aal) => ({ access_token: token(aal), refresh_token: 'refresh-' + aal, expires_in: 3600, user });

function signInHarness(responses, initialSession = null) {
  const elements = new Map();
  const node = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', checked: true, hidden: id === 'mfaForm', disabled: false,
      classList: { toggle() {} },
      focus() {},
      addEventListener(name, callback) { this[name] = callback; },
    });
    return elements.get(id);
  };
  const requests = [];
  const state = { saved: initialSession, routed: [] };
  runInNewContext(authScript, {
    atob,
    console: { error() {} },
    document: { getElementById: node },
    SUPABASE_URL: 'https://auth.example.test',
    SUPABASE_ANON_KEY: 'public-key',
    saveSession: value => { state.saved = value; },
    getSessionFromStorage: () => state.saved,
    clearSavedSession: () => { state.saved = null; },
    localStorage: { setItem() {}, removeItem() {} },
    loadAndRunRouter: () => state.routed.push(state.saved),
    fetch: async (url, options) => {
      requests.push({ url, options });
      const [status, payload] = responses.shift();
      return { ok: status === 200, status, text: async () => JSON.stringify(payload) };
    },
  });
  node('email').value = 'user@example.test';
  node('password').value = 'password123';
  return { node, requests, state };
}

test('password sign-in works with the existing router when no verified factor is enrolled', async () => {
  const h = signInHarness([[200, session(user, 'aal1')]]);
  await h.node('authForm').submit(event);
  assert.equal(h.state.routed.length, 1);
  assert.equal(h.state.routed[0].user.id, user.id);
  assert.equal(h.node('mfaForm').hidden, true);
});

test('authenticator verification keeps the password-only session out of storage and uses the upgraded session', async () => {
  const elevated = session(enrolled, 'aal2');
  const h = signInHarness([
    [200, session(enrolled, 'aal1')], [200, { id: 'challenge-one' }],
    [422, { message: 'Invalid code' }], [200, { id: 'challenge-two' }], [200, elevated],
  ]);
  await h.node('authForm').submit(event);
  assert.equal(h.node('mfaForm').hidden, false);
  assert.equal(h.state.saved, null);
  assert.equal(h.state.routed.length, 0);
  h.node('mfaCode').value = '123456';
  await h.node('mfaForm').submit(event);
  assert.equal(h.state.saved, null);
  assert.equal(h.node('message').textContent, 'Invalid code');
  h.node('mfaCode').value = '654321';
  await h.node('mfaForm').submit(event);
  assert.equal(h.state.saved.access_token, elevated.access_token);
  assert.equal(h.state.saved.refresh_token, elevated.refresh_token);
  assert.equal(h.state.routed.length, 1);
  assert.equal(h.requests[3].options.headers.Authorization, 'Bearer ' + token('aal1'));
  assert.deepEqual(JSON.parse(h.requests[4].options.body), { code: '654321', challenge_id: 'challenge-two' });
});

test('authenticator sign-in rejects an unverified session and can be canceled', async () => {
  const h = signInHarness([[200, { id: 'challenge' }], [200, session(enrolled, 'aal1')]], session(enrolled, 'aal1'));
  assert.equal(h.state.saved, null);
  h.node('mfaCode').value = '123456';
  await h.node('mfaForm').submit(event);
  assert.equal(h.state.routed.length, 0);
  assert.equal(h.state.saved, null);
  h.node('cancelMfaBtn').click();
  assert.equal(h.node('mfaForm').hidden, true);
  assert.equal(h.node('authForm').hidden, false);
  assert.equal(h.state.saved, null);
});

test('saved meeting minutes use the database document ID immediately', async () => {
  const source = read('documents/documents.js').match(/export async function saveMinutesRich[\s\S]*?(?=\nfunction filterDocsByCategory)/)[0];
  const docsStore = { documents: [] };
  const saveMinutes = runInNewContext(source.replace('export ', '') + '\nsaveMinutesRich;', {
    getSessionFromStorage: () => ({ user }),
    ensureDocsStore: async () => {},
    normalizeAttachmentResult: input => input,
    normalizeDoc: row => row,
    docsStore,
    GROUP_ID: 'team-one',
    crypto: { randomUUID: () => 'document-one' },
    rest: async (path, options) => {
      assert.equal(path, 'documents');
      assert.equal(options.headers.Prefer, 'return=representation');
      const [row] = JSON.parse(options.body);
      assert.equal(row.id, 'document-one');
      return [{ ...row, created_at: '2026-11-19T18:00:00Z' }];
    },
  });
  const saved = await saveMinutes({ title: 'Test meeting' });
  assert.equal(saved.id, 'document-one');
  assert.equal(saved.created_at, '2026-11-19T18:00:00Z');
  assert.equal(docsStore.documents[0].id, saved.id);
});

test('caregiver detail and printable reports share the sleep formatter module scope', () => {
  const main = modules(read('caregiver-report.html')).find(script => script.includes('function buildPrintRecord'));
  assert.match(main, /import \{ sleepDisplayPayload \} from/);
  assert.match(main, /function openViewDrawer\(/);
});
