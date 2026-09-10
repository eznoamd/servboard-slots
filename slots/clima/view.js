/**
 * Slot "clima" — visual inspirado no app Tempo do iPhone:
 *   • agora + máx/mín + sensação
 *   • gráfico de temperatura das próximas 24 h (com título e marcadores)
 *   • gráfico de probabilidade de precipitação por hora
 *   • previsão dos próximos dias com faixa de temperatura
 *
 * Painel largo (span 2): topo + próximos dias lado a lado, e os dois gráficos
 * lado a lado na linha de baixo. Em painel estreito o grid quebra em 1 coluna.
 */

function round(v, suffix = '') {
  return v == null || Number.isNaN(v) ? '—' : Math.round(v) + suffix;
}

/* ---------- gráfico de temperatura (linha) --------------------------------- */
function tempChart(hourly, unit) {
  const pts = hourly.filter((h) => typeof h.temp === 'number');
  if (pts.length < 2) return '<div class="clima-chart-empty">sem série horária</div>';

  const W = 600;
  const H = 200;
  const padX = 24;
  const padT = 34;
  const padB = 30;
  const base = H - padB;
  const temps = pts.map((p) => p.temp);
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const span = hi - lo || 1;
  const last = pts.length - 1;
  const x = (i) => padX + (i * (W - 2 * padX)) / last;
  const y = (t) => padT + (base - padT) * (1 - (t - lo) / span);
  const anchor = (i) => (i === 0 ? 'start' : i === last ? 'end' : 'middle');

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.temp).toFixed(1)}`).join(' ');
  const area = `${line} L${x(last).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`;

  const iHi = temps.indexOf(hi);
  const iLo = temps.lastIndexOf(lo);
  const marker = (i, cls, label) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(pts[i].temp).toFixed(1)}" r="3.6" class="${cls}"/>` +
    `<text x="${x(i).toFixed(1)}" y="${(y(pts[i].temp) - 10).toFixed(1)}" text-anchor="${anchor(i)}" class="clima-c-vlabel">${label}</text>`;

  // marcador "agora" (primeira amostra da janela)
  const nowX = x(0).toFixed(1);
  const nowMark =
    `<line x1="${nowX}" y1="${padT - 8}" x2="${nowX}" y2="${base}" class="clima-c-nowline"/>` +
    (iHi === 0 || iLo === 0
      ? ''
      : `<circle cx="${nowX}" cy="${y(pts[0].temp).toFixed(1)}" r="4" class="clima-c-now"/>` +
        `<text x="${nowX}" y="${(y(pts[0].temp) - 10).toFixed(1)}" text-anchor="start" class="clima-c-vlabel">${round(pts[0].temp)}°</text>`);

  // eixo x: "agora" + rótulos de hora a cada 3 h
  const ticks = pts
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => i === 0 || p.hour % 3 === 0)
    .map(({ p, i }) => {
      const lbl = i === 0 ? 'agora' : String(p.hour).padStart(2, '0') + 'h';
      return `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="${anchor(i)}" class="clima-c-tick">${lbl}</text>`;
    })
    .join('');

  return `
    <svg class="clima-chart clima-chart--temp" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
         role="img" aria-label="temperatura nas próximas 24 horas em ${unit}">
      <defs>
        <linearGradient id="clima-temp-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" class="clima-c-stop0"/>
          <stop offset="100%" class="clima-c-stop1"/>
        </linearGradient>
      </defs>
      <line x1="${padX}" y1="${base}" x2="${W - padX}" y2="${base}" class="clima-c-axis"/>
      <path d="${area}" class="clima-c-area"/>
      <path d="${line}" class="clima-c-line"/>
      ${nowMark}
      ${marker(iHi, 'clima-c-hi', 'máx ' + round(hi) + '°')}
      ${marker(iLo, 'clima-c-lo', 'mín ' + round(lo) + '°')}
      ${ticks}
    </svg>`;
}

/* ---------- gráfico de precipitação (barras) ------------------------------- */
function precipChart(hourly) {
  const pts = hourly.filter((h) => typeof h.pop === 'number');
  if (!pts.length) return '<div class="clima-chart-empty">sem previsão de precipitação</div>';
  const maxPop = Math.max(...pts.map((p) => p.pop));
  if (maxPop < 5) {
    return `<div class="clima-chart-empty">sem chuva prevista nas próximas 24 h</div>`;
  }

  const W = 600;
  const H = 140;
  const padX = 44;
  const padT = 28;
  const padB = 26;
  const base = H - padB;
  const n = pts.length;
  const last = n - 1;
  const bw = ((W - 2 * padX) / n) * 0.62;
  const x = (i) => padX + (i * (W - 2 * padX)) / last;
  const y = (p) => base - (base - padT) * (p / 100);
  const anchor = (i) => (i === 0 ? 'start' : i === last ? 'end' : 'middle');

  const bars = pts
    .map((p, i) => {
      const top = y(p.pop);
      return `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(base - top, 0.8).toFixed(1)}" rx="1.4" class="clima-p-bar"/>`;
    })
    .join('');

  const grid = [100, 50]
    .map(
      (p) =>
        `<line x1="${padX}" y1="${y(p).toFixed(1)}" x2="${W - padX}" y2="${y(p).toFixed(1)}" class="clima-p-grid"/>` +
        `<text x="6" y="${(y(p) + 3).toFixed(1)}" text-anchor="start" class="clima-c-tick">${p}%</text>`,
    )
    .join('');

  const ticks = pts
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => i === 0 || p.hour % 6 === 0)
    .map(({ p, i }) => {
      const lbl = i === 0 ? 'agora' : String(p.hour).padStart(2, '0') + 'h';
      return `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${anchor(i)}" class="clima-c-tick">${lbl}</text>`;
    })
    .join('');

  return `
    <svg class="clima-chart clima-chart--precip" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
         role="img" aria-label="probabilidade de precipitação nas próximas 24 horas">
      <line x1="${padX}" y1="${base}" x2="${W - padX}" y2="${base}" class="clima-c-axis"/>
      ${grid}
      ${bars}
      ${ticks}
    </svg>`;
}

/* ---------- próximos dias ------------------------------------------------- */
function daysList(daily) {
  const days = daily.filter((d) => typeof d.max === 'number' && typeof d.min === 'number');
  if (days.length < 2) return '<div class="clima-chart-empty">sem previsão estendida</div>';
  const weekMin = Math.min(...days.map((d) => d.min));
  const weekMax = Math.max(...days.map((d) => d.max));
  const span = weekMax - weekMin || 1;
  const fmtDow = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });

  const rows = days
    .slice(0, 6)
    .map((d, idx) => {
      const dow = idx === 0 ? 'Hoje' : cap(fmtDow.format(new Date(`${d.date}T12:00`)).replace('.', ''));
      const l = ((d.min - weekMin) / span) * 100;
      const r = ((weekMax - d.max) / span) * 100;
      const pop = d.pop != null && d.pop >= 20 ? `💧${Math.round(d.pop)}%` : '';
      return `
        <div class="clima-day">
          <span class="clima-day-dow">${dow}</span>
          <span class="clima-day-ico" title="${escapeHtml(d.label)}">${d.emoji}</span>
          <span class="clima-day-pop">${pop}</span>
          <span class="clima-day-min">${round(d.min, '°')}</span>
          <span class="clima-day-track">
            <span class="clima-day-fill" style="left:${l.toFixed(1)}%;right:${r.toFixed(1)}%"></span>
          </span>
          <span class="clima-day-max">${round(d.max, '°')}</span>
        </div>`;
    })
    .join('');

  return `<div class="clima-days">${rows}</div>`;
}

/* ---------- render ------------------------------------------------------- */
export function render(el, data) {
  if (!data?.now) {
    el.innerHTML = `<div class="clima-empty">sem dados de clima ainda</div>`;
    return;
  }
  const u = data.units?.temp || '°C';
  const n = data.now;
  const t = data.today || {};
  const hourly = data.hourly || [];
  const daily = data.daily || [];
  const dir = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.round((n.windDir % 360) / 45) % 8];
  const hhmm = (iso) => (iso ? iso.slice(11, 16) : '—');

  el.innerHTML = `
    <div class="clima">
      <div class="clima-row">
        <div class="clima-top">
          <div class="clima-emoji">${n.emoji}</div>
          <div class="clima-main">
            <div class="clima-temp">${round(n.temp)}<span>${u}</span></div>
            <div class="clima-cond">${escapeHtml(n.label)}</div>
            <div class="clima-loc">${escapeHtml(data.location?.label || '—')}</div>
          </div>
          <div class="clima-side">
            <div>máx <b>${round(t.max, '°')}</b></div>
            <div>mín <b>${round(t.min, '°')}</b></div>
            <div>sens. <b>${round(n.feels, '°')}</b></div>
          </div>
        </div>

        <div class="clima-col">
          <div class="clima-section-title">
            <span>Próximos dias</span><span class="clima-section-sub">mín · máx</span>
          </div>
          ${daysList(daily)}
        </div>
      </div>

      <div class="clima-row">
        <div class="clima-col">
          <div class="clima-section-title">
            <span>Temperatura</span><span class="clima-section-sub">próximas 24 h · ${u}</span>
          </div>
          ${tempChart(hourly, u)}
        </div>

        <div class="clima-col">
          <div class="clima-section-title">
            <span>Precipitação</span><span class="clima-section-sub">chance de chuva por hora</span>
          </div>
          ${precipChart(hourly)}
        </div>
      </div>

      <div class="clima-meta">
        <span>💧 umidade ${round(n.humidity, '%')}</span>
        <span>🌬️ ${round(n.wind)} ${data.units?.wind || 'km/h'} ${dir}</span>
        <span>🌧️ hoje ${round(t.rainChance, '%')}</span>
        <span>🌅 ${hhmm(t.sunrise)}</span>
        <span>🌇 ${hhmm(t.sunset)}</span>
      </div>
    </div>`;
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
