/**
 * servBoard inbox — recebe provas/trabalhos e todos cadastrados pelo dono,
 * do notebook, e grava em data/<lista>.json. Os slots `provas` e `todos` só
 * leem esses arquivos.
 *
 * Node puro, zero dependências.
 *
 * Rotas (JSON):
 *   GET    /health                 sem auth — status
 *   GET    /provas | /todos        lista
 *   POST   /provas | /todos        cria         { titulo|texto, ... }
 *   PATCH  /provas/:id | /todos/:id edita campos { ... }
 *   DELETE /provas/:id | /todos/:id remove
 *
 * Autenticação: header `Authorization: Bearer <token>` em tudo exceto /health.
 *
 * Ambiente:
 *   SERVBOARD_INBOX_TOKEN   token (senão: lê/gera data/inbox-token)
 *   SERVBOARD_INBOX_HOST    bind (default 0.0.0.0 — acessível pela LAN)
 *   SERVBOARD_INBOX_PORT    porta (default 4871)
 *   SERVBOARD_INBOX_ALLOW   lista opcional de IPs/prefixos permitidos
 *                           ex.: "192.168.1.,127.0.0.1"
 *   SERVBOARD_DATA_DIR      onde ficam os JSON (default <repo>/data)
 */
import http from 'node:http';
import { timingSafeEqual, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { read, add, patch, remove, dataDir } from '../lib/store.js';

const HOST = process.env.SERVBOARD_INBOX_HOST || '0.0.0.0';
const PORT = Number(process.env.SERVBOARD_INBOX_PORT || 4871);
const MAX_BODY = 64 * 1024;

const TIPOS = ['prova', 'trabalho', 'teste', 'apresentacao', 'seminario', 'lista', 'outro'];
const PRIORIDADES = ['alta', 'media', 'baixa'];

/* ---------- token -------------------------------------------------------- */
function loadToken() {
  const fromEnv = process.env.SERVBOARD_INBOX_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const file = join(dataDir, 'inbox-token');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  mkdirSync(dataDir, { recursive: true });
  const t = randomBytes(24).toString('base64url');
  writeFileSync(file, t + '\n', { mode: 0o600 });
  console.log(`[inbox] token novo gerado em ${file}`);
  return t;
}
const TOKEN = loadToken();

if (process.argv.includes('--print-token')) {
  console.log(TOKEN);
  process.exit(0);
}

function tokenOk(header) {
  const m = /^Bearer\s+(.+)$/i.exec((header || '').trim());
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------- IP allowlist (opcional) ------------------------------------- */
const ALLOW = (process.env.SERVBOARD_INBOX_ALLOW || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function ipOk(ip) {
  if (!ALLOW.length) return true;
  const norm = (ip || '').replace(/^::ffff:/, '');
  return ALLOW.some((r) => r === '*' || r === norm || (r.endsWith('.') && norm.startsWith(r)));
}

/* ---------- rate limit leve (por IP) ----------------------------------- */
const hits = new Map();
function rateOk(ip, limit = 120, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length <= limit;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) {
    const keep = v.filter((t) => now - t < 60_000);
    if (keep.length) hits.set(k, keep);
    else hits.delete(k);
  }
}, 120_000).unref();

/* ---------- helpers ---------------------------------------------------- */
class HttpError extends Error {
  constructor(code, msg) {
    super(msg);
    this.code = code;
  }
}

function send(res, code, obj) {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let over = false;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) over = true;
      else chunks.push(c);
    });
    req.on('end', () => {
      if (over) return reject(new HttpError(413, 'corpo muito grande'));
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, 'JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

function str(v, { max, name, required } = {}) {
  if (v == null || v === '') {
    if (required) throw new HttpError(400, `"${name}" é obrigatório`);
    return undefined;
  }
  if (typeof v !== 'string') throw new HttpError(400, `"${name}" deve ser texto`);
  const t = v.trim();
  if (!t) {
    if (required) throw new HttpError(400, `"${name}" é obrigatório`);
    return undefined;
  }
  if (max && t.length > max) throw new HttpError(400, `"${name}" passa de ${max} caracteres`);
  return t;
}

function dateStr(v, name) {
  if (v == null || v === '') return undefined;
  if (typeof v !== 'string') throw new HttpError(400, `"${name}" deve ser texto (YYYY-MM-DD)`);
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    if (Number.isNaN(Date.parse(`${t}T00:00:00`))) throw new HttpError(400, `"${name}" inválida`);
    return t;
  }
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) throw new HttpError(400, `"${name}" inválida — use YYYY-MM-DD`);
  return new Date(ms).toISOString();
}

function num(v, name) {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, `"${name}" deve ser número`);
  return n;
}

function tipoOk(v) {
  const t = String(v).toLowerCase();
  if (!TIPOS.includes(t)) throw new HttpError(400, `"tipo" deve ser um de: ${TIPOS.join(', ')}`);
  return t;
}

function prioridadeOk(v) {
  const p = String(v).toLowerCase();
  if (!PRIORIDADES.includes(p)) throw new HttpError(400, `"prioridade" deve ser: ${PRIORIDADES.join(', ')}`);
  return p;
}

/* ---------- construção / validação por lista -------------------------- */
function buildCreate(kind, b) {
  if (kind === 'provas') {
    return {
      titulo: str(b.titulo ?? b.title ?? b.nome, { max: 200, name: 'titulo', required: true }),
      materia: str(b.materia ?? b.disciplina ?? b.subject, { max: 120, name: 'materia' }),
      tipo: b.tipo ?? b.type ? tipoOk(b.tipo ?? b.type) : 'prova',
      data: dateStr(b.data ?? b.quando ?? b.date, 'data'),
      peso: num(b.peso ?? b.valor, 'peso'),
      obs: str(b.obs ?? b.notas ?? b.observacao, { max: 500, name: 'obs' }),
    };
  }
  return {
    texto: str(b.texto ?? b.title ?? b.tarefa ?? b.nome, { max: 300, name: 'texto', required: true }),
    prazo: dateStr(b.prazo ?? b.data ?? b.quando ?? b.date, 'prazo'),
    prioridade: b.prioridade ?? b.priority ? prioridadeOk(b.prioridade ?? b.priority) : undefined,
    feito: (b.feito ?? b.done) === true,
    feitoEm: (b.feito ?? b.done) === true ? new Date().toISOString() : undefined,
  };
}

function buildPatch(kind, b) {
  const out = {};
  if (kind === 'provas') {
    if ('titulo' in b) out.titulo = str(b.titulo, { max: 200, name: 'titulo', required: true });
    if ('materia' in b) out.materia = str(b.materia, { max: 120, name: 'materia' }) ?? null;
    if ('tipo' in b) out.tipo = tipoOk(b.tipo);
    if ('data' in b) out.data = dateStr(b.data, 'data') ?? null;
    if ('peso' in b) out.peso = num(b.peso, 'peso') ?? null;
    if ('obs' in b) out.obs = str(b.obs, { max: 500, name: 'obs' }) ?? null;
  } else {
    if ('texto' in b) out.texto = str(b.texto, { max: 300, name: 'texto', required: true });
    if ('prazo' in b) out.prazo = dateStr(b.prazo, 'prazo') ?? null;
    if ('prioridade' in b) out.prioridade = b.prioridade == null ? null : prioridadeOk(b.prioridade);
    if ('feito' in b || 'done' in b) {
      out.feito = (b.feito ?? b.done) === true;
      out.feitoEm = out.feito ? new Date().toISOString() : null;
    }
  }
  if (!Object.keys(out).length) throw new HttpError(400, 'nada para atualizar');
  return out;
}

/* ---------- servidor -------------------------------------------------- */
const server = http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress;
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {});

    const { pathname } = new URL(req.url, 'http://x');
    const parts = pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && parts[0] === 'health') {
      return send(res, 200, { ok: true, lists: ['provas', 'todos'] });
    }

    if (!ipOk(ip)) return send(res, 403, { error: 'IP não autorizado' });

    const kind = parts[0];
    if (kind !== 'provas' && kind !== 'todos') {
      return send(res, 404, { error: 'rota desconhecida' });
    }

    if (!tokenOk(req.headers.authorization)) {
      return send(res, 401, { error: 'token ausente ou inválido' });
    }
    if (!rateOk(ip)) return send(res, 429, { error: 'muitas requisições, aguarde' });

    const id = parts[1];

    if (req.method === 'GET' && !id) {
      return send(res, 200, { items: await read(kind) });
    }
    if (req.method === 'POST' && !id) {
      const item = await add(kind, clean(buildCreate(kind, await readBody(req))));
      return send(res, 201, { item });
    }
    if (req.method === 'PATCH' && id) {
      const item = await patch(kind, id, clean(buildPatch(kind, await readBody(req))));
      return item ? send(res, 200, { item }) : send(res, 404, { error: 'não encontrado' });
    }
    if (req.method === 'DELETE' && id) {
      const ok = await remove(kind, id);
      return ok ? send(res, 200, { removed: id }) : send(res, 404, { error: 'não encontrado' });
    }
    return send(res, 405, { error: 'método não suportado nessa rota' });
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.code, { error: err.message });
    console.error('[inbox] erro:', err);
    return send(res, 500, { error: 'erro interno' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[inbox] ouvindo em http://${HOST}:${PORT}  ·  listas: provas, todos`);
  console.log(`[inbox] dados em ${dataDir}`);
  if (ALLOW.length) console.log(`[inbox] IPs permitidos: ${ALLOW.join(', ')}`);
});
