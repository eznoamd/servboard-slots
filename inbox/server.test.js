import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('./server.js', import.meta.url));
const TOKEN = 'tok-de-teste-abcdef';
const PORT = 4899;
const BASE = `http://127.0.0.1:${PORT}`;
const auth = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };

let child;
let dir;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'inbox-test-'));
  child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      SERVBOARD_DATA_DIR: dir,
      SERVBOARD_INBOX_TOKEN: TOKEN,
      SERVBOARD_INBOX_PORT: String(PORT),
      SERVBOARD_INBOX_HOST: '127.0.0.1',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('inbox não subiu a tempo');
});

after(async () => {
  child?.kill();
  await rm(dir, { recursive: true, force: true });
});

test('/health não exige token', async () => {
  const r = await fetch(`${BASE}/health`);
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).lists, ['provas', 'todos']);
});

test('sem token → 401', async () => {
  assert.equal((await fetch(`${BASE}/provas`)).status, 401);
});

test('token errado → 401', async () => {
  const r = await fetch(`${BASE}/provas`, { headers: { authorization: 'Bearer nope' } });
  assert.equal(r.status, 401);
});

test('rota desconhecida → 404', async () => {
  assert.equal((await fetch(`${BASE}/outra`, { headers: auth })).status, 404);
});

test('provas: cria, lista, edita e remove', async () => {
  let r = await fetch(`${BASE}/provas`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ titulo: 'P1 Cálculo', materia: 'Cálculo I', tipo: 'prova', data: '2026-09-20' }),
  });
  assert.equal(r.status, 201);
  const { item } = await r.json();
  assert.ok(item.id);
  assert.equal(item.titulo, 'P1 Cálculo');
  assert.equal(item.tipo, 'prova');

  r = await fetch(`${BASE}/provas`, { headers: auth });
  assert.equal((await r.json()).items.length, 1);

  r = await fetch(`${BASE}/provas/${item.id}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ tipo: 'trabalho', data: '2026-10-01' }),
  });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).item.tipo, 'trabalho');

  r = await fetch(`${BASE}/provas/${item.id}`, { method: 'DELETE', headers: auth });
  assert.equal(r.status, 200);

  r = await fetch(`${BASE}/provas`, { headers: auth });
  assert.equal((await r.json()).items.length, 0);
});

test('provas: título é obrigatório', async () => {
  const r = await fetch(`${BASE}/provas`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ materia: 'sem titulo' }),
  });
  assert.equal(r.status, 400);
});

test('provas: tipo inválido → 400', async () => {
  const r = await fetch(`${BASE}/provas`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ titulo: 'x', tipo: 'churrasco' }),
  });
  assert.equal(r.status, 400);
});

test('provas: data inválida → 400', async () => {
  const r = await fetch(`${BASE}/provas`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ titulo: 'x', data: '30 de fevereiro' }),
  });
  assert.equal(r.status, 400);
});

test('todos: cria e marca como feito', async () => {
  let r = await fetch(`${BASE}/todos`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ texto: 'comprar caderno', prioridade: 'alta' }),
  });
  assert.equal(r.status, 201);
  const { item } = await r.json();
  assert.equal(item.feito, false);
  assert.equal(item.prioridade, 'alta');

  r = await fetch(`${BASE}/todos/${item.id}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ feito: true }),
  });
  assert.equal(r.status, 200);
  const patched = (await r.json()).item;
  assert.equal(patched.feito, true);
  assert.ok(patched.feitoEm);

  r = await fetch(`${BASE}/todos/${item.id}`, { method: 'DELETE', headers: auth });
  assert.equal(r.status, 200);
});

test('DELETE de id inexistente → 404', async () => {
  const r = await fetch(`${BASE}/provas/naoexiste`, { method: 'DELETE', headers: auth });
  assert.equal(r.status, 404);
});

test('id/criadoEm não podem ser forjados', async () => {
  const r = await fetch(`${BASE}/todos`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ texto: 'x', id: 'forjado', criadoEm: '1999-01-01' }),
  });
  const { item } = await r.json();
  assert.notEqual(item.id, 'forjado');
  assert.notEqual(item.criadoEm, '1999-01-01');
});
