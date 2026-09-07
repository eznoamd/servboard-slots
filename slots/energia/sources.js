/**
 * Backends de medição de potência do servidor, do mais real ao mais estimado.
 * Cada função devolve { watts, method, detail } ou lança.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 1. Tomada inteligente (mais preciso: mede a máquina inteira na parede)
// ---------------------------------------------------------------------------
function dig(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

export async function readSmartPlug(cfg) {
  if (!cfg || (!cfg.host && !cfg.url)) throw new Error('smartPlug sem host/url');
  const type = (cfg.type || 'generic').toLowerCase();
  const headers = { accept: 'application/json' };
  if (cfg.auth) headers.authorization = 'Basic ' + Buffer.from(cfg.auth).toString('base64');

  const presets = {
    tasmota: { url: `http://${cfg.host}/cm?cmnd=Status%2010`, path: 'StatusSNS.ENERGY.Power' },
    shelly1: { url: `http://${cfg.host}/meter/0`, path: 'power' },
    shelly: { url: `http://${cfg.host}/rpc/Switch.GetStatus?id=${cfg.channel ?? 0}`, path: 'apower' },
    generic: { url: cfg.url, path: cfg.jsonPath || 'power' },
  };
  const p = presets[type] || presets.generic;
  const url = cfg.url || p.url;
  const jsonPath = cfg.jsonPath || p.path;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`tomada respondeu ${res.status}`);
  const body = await res.json();
  const watts = Number(dig(body, jsonPath));
  if (!Number.isFinite(watts)) throw new Error(`campo "${jsonPath}" não é um número na resposta da tomada`);
  return { watts, method: 'smartplug', detail: `${type} @ ${cfg.host || url}` };
}

// ---------------------------------------------------------------------------
// 2. RAPL (Intel/AMD): energia do(s) pacote(s) de CPU via /sys/class/powercap
//    Precisa de leitura liberada — ver README do slot (regra udev).
// ---------------------------------------------------------------------------
async function raplPackages() {
  const base = '/sys/class/powercap';
  if (!existsSync(base)) return [];
  const names = (await readdir(base)).filter((n) => /^intel-rapl:\d+$/.test(n));
  const out = [];
  for (const n of names) {
    const dir = `${base}/${n}`;
    try {
      const max = Number((await readFile(`${dir}/max_energy_range_uj`, 'utf8')).trim());
      out.push({ dir, max: Number.isFinite(max) ? max : null });
    } catch {
      /* sem permissão / ausente */
    }
  }
  return out;
}

async function raplEnergySum(pkgs) {
  let sum = 0;
  for (const p of pkgs) {
    sum += Number((await readFile(`${p.dir}/energy_uj`, 'utf8')).trim());
  }
  return sum;
}

export async function readRapl(windowMs = 700) {
  const pkgs = await raplPackages();
  if (!pkgs.length) throw new Error('RAPL indisponível (sem powercap ou sem permissão de leitura)');
  const t0 = Date.now();
  const e0 = await raplEnergySum(pkgs);
  await sleep(windowMs);
  const e1 = await raplEnergySum(pkgs);
  const dt = (Date.now() - t0) / 1000;

  let dE = e1 - e0;
  if (dE < 0) {
    // contador estourou: soma o range de cada pacote uma vez
    dE += pkgs.reduce((s, p) => s + (p.max || 0), 0);
  }
  const watts = dE / 1e6 / dt; // µJ -> J -> W
  return {
    watts,
    method: 'rapl',
    detail: `${pkgs.length} pacote(s) de CPU (só processador)`,
    partial: true, // não inclui placa-mãe, discos, fontes
  };
}

// ---------------------------------------------------------------------------
// 3. IPMI / DCMI: leitura da fonte pelo BMC (máquina inteira). Precisa ipmitool.
// ---------------------------------------------------------------------------
export async function readIpmi() {
  try {
    const { stdout } = await execFileAsync('ipmitool', ['dcmi', 'power', 'reading'], { timeout: 6000 });
    const m = /Instantaneous power reading:\s*([\d.]+)\s*Watts/i.exec(stdout);
    if (m) return { watts: Number(m[1]), method: 'ipmi', detail: 'BMC / DCMI (máquina inteira)' };
    throw new Error('sem "Instantaneous power reading" na saída');
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('ipmitool não instalado');
    throw new Error(`ipmitool: ${(err.stderr || err.message || '').trim().split('\n')[0]}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Estimativa: uso de CPU (/proc/stat) entre idleWatts e maxWatts.
//    Sempre funciona. Calibre idleWatts/maxWatts com um wattímetro.
// ---------------------------------------------------------------------------
async function cpuTotals() {
  const line = (await readFile('/proc/stat', 'utf8')).split('\n')[0]; // "cpu  u n s i iow irq ..."
  const v = line.trim().split(/\s+/).slice(1).map(Number);
  const idle = v[3] + (v[4] || 0);
  const total = v.reduce((a, b) => a + b, 0);
  return { idle, total };
}

export async function readEstimate(settings, windowMs = 700) {
  const idleW = Number(settings?.idleWatts ?? 20);
  const maxW = Number(settings?.maxWatts ?? 65);
  const a = await cpuTotals();
  await sleep(windowMs);
  const b = await cpuTotals();
  const dTotal = b.total - a.total || 1;
  const dIdle = b.idle - a.idle;
  const util = Math.min(1, Math.max(0, 1 - dIdle / dTotal));
  const watts = idleW + (maxW - idleW) * util;
  return {
    watts,
    method: 'estimate',
    detail: `uso de CPU ${(util * 100).toFixed(0)}% · faixa ${idleW}–${maxW} W`,
    util,
    partial: false,
  };
}

// ---------------------------------------------------------------------------
// Orquestração: escolhe a melhor fonte disponível.
// ---------------------------------------------------------------------------
export async function measure(settings, logger) {
  const method = (settings?.method || 'auto').toLowerCase();
  const tries = {
    smartplug: () => readSmartPlug(settings?.smartPlug),
    rapl: () => readRapl(),
    ipmi: () => readIpmi(),
    estimate: () => readEstimate(settings),
  };

  if (method !== 'auto') {
    if (!tries[method]) throw new Error(`method desconhecido: "${method}"`);
    return tries[method]();
  }

  const order = ['smartplug', 'rapl', 'ipmi', 'estimate'];
  const notes = [];
  for (const name of order) {
    if (name === 'smartplug' && !settings?.smartPlug) continue;
    try {
      return await tries[name]();
    } catch (err) {
      notes.push(`${name}: ${err.message}`);
      logger?.debug?.(`fonte ${name} indisponível — ${err.message}`);
    }
  }
  throw new Error('nenhuma fonte de potência funcionou:\n  ' + notes.join('\n  '));
}
