/**
 * Armazenamento simples em arquivo JSON, compartilhado entre o serviço `inbox`
 * (que escreve) e os slots `provas` / `todos` (que só leem).
 *
 * Cada "lista" é um array em data/<lista>.json. Escrita é atômica
 * (grava .tmp + rename) para o slot nunca ler um arquivo pela metade.
 *
 * Local dos dados: $SERVBOARD_DATA_DIR ou <repo>/data
 */
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export const dataDir = process.env.SERVBOARD_DATA_DIR
  ? process.env.SERVBOARD_DATA_DIR
  : join(REPO_ROOT, 'data');

export const LISTS = ['provas', 'todos'];

function fileFor(name) {
  if (!LISTS.includes(name)) throw new Error(`lista desconhecida: "${name}"`);
  return join(dataDir, `${name}.json`);
}

/** Lê a lista; devolve [] se o arquivo não existe ou está corrompido. */
export async function read(name) {
  const file = fileFor(name);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function write(name, items) {
  const file = fileFor(name);
  await mkdir(dataDir, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(items, null, 2) + '\n', 'utf8');
  await rename(tmp, file);
}

/** Adiciona um item (id + criadoEm são gerados aqui, não dá para forjar). */
export async function add(name, fields) {
  const items = await read(name);
  const item = { ...fields, id: randomUUID().slice(0, 8), criadoEm: new Date().toISOString() };
  items.push(item);
  await write(name, items);
  return item;
}

/** Mescla campos num item existente. Devolve o item ou null se não achou. */
export async function patch(name, id, fields) {
  const items = await read(name);
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return null;
  items[i] = { ...items[i], ...fields, id: items[i].id, atualizadoEm: new Date().toISOString() };
  await write(name, items);
  return items[i];
}

/** Remove um item. Devolve true se removeu, false se o id não existia. */
export async function remove(name, id) {
  const items = await read(name);
  const next = items.filter((x) => x.id !== id);
  if (next.length === items.length) return false;
  await write(name, next);
  return true;
}
