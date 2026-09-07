/**
 * Slot "energia" — gasto de energia do servidor.
 *
 * Mede a potência (W) pela melhor fonte disponível e acumula kWh do dia entre
 * refreshes (state persistente do slot). Projeta consumo e custo do mês.
 *
 * settings (todos opcionais):
 *   method       : "auto" (default) | "smartplug" | "rapl" | "ipmi" | "estimate"
 *   idleWatts    : potência em repouso p/ estimativa (default 20) — calibre!
 *   maxWatts     : potência máx. p/ estimativa (default 65) — calibre!
 *   pricePerKwh  : preço do kWh (default 0.92)
 *   currency     : símbolo (default "R$")
 *   smartPlug    : { type: "tasmota"|"shelly"|"shelly1"|"generic",
 *                    host: "192.168.x.y", auth: "user:pass",
 *                    url, jsonPath, channel }
 *
 * Precisão: tomada inteligente e IPMI medem a máquina inteira. RAPL mede só a
 * CPU (marcado como parcial). Estimativa depende de idleWatts/maxWatts.
 */
import { measure } from './sources.js';

const MAX_GAP_H = 0.2; // ignora buracos > 12 min ao integrar (servidor desligado)
const EMA_ALPHA = 0.1; // suavização da média de watts

function dayKey(d, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d); // "2026-09-07"
}

function daysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export async function refresh(ctx) {
  const s = ctx.settings || {};
  const tz = ctx.config?.timezone || 'America/Sao_Paulo';
  const price = Number(s.pricePerKwh ?? 0.92);
  const currency = s.currency || 'R$';

  const m = await measure(s, ctx.logger);
  const watts = Math.max(0, Math.round(m.watts * 10) / 10);
  const now = ctx.now.getTime();
  const today = dayKey(ctx.now, tz);

  const prev = (await ctx.readState()) || {};
  let { kwhToday = 0, kwhYesterday = 0, day = today, lastTs = null, emaWatts = watts, firstTsToday = now } = prev;

  if (day !== today) {
    kwhYesterday = kwhToday;
    kwhToday = 0;
    firstTsToday = now;
    day = today;
  }

  if (lastTs) {
    const dtH = Math.min((now - lastTs) / 3_600_000, MAX_GAP_H);
    if (dtH > 0) kwhToday += (watts / 1000) * dtH;
  }
  emaWatts = EMA_ALPHA * watts + (1 - EMA_ALPHA) * emaWatts;

  await ctx.writeState({ kwhToday, kwhYesterday, day, lastTs: now, emaWatts, firstTsToday });

  // projeção do mês: usa a média (EMA) rodando 24 h
  const kwhMonth = (emaWatts / 1000) * 24 * daysInMonth(ctx.now);
  const hoursToday = Math.max((now - firstTsToday) / 3_600_000, 1 / 60);
  const kwhDayProjected = (kwhToday / hoursToday) * 24;

  return {
    watts,
    method: m.method,
    methodDetail: m.detail,
    partial: Boolean(m.partial),
    util: m.util ?? null,
    avgWatts: Math.round(emaWatts * 10) / 10,
    kwhToday: round3(kwhToday),
    kwhYesterday: round3(kwhYesterday),
    kwhDayProjected: round3(kwhDayProjected),
    kwhMonthProjected: round1(kwhMonth),
    costToday: round2(kwhToday * price),
    costMonthProjected: round2(kwhMonth * price),
    pricePerKwh: price,
    currency,
    measuredAt: ctx.now.toISOString(),
  };
}

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;
