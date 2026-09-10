/**
 * Slot "clima" — visual inspirado no app Tempo do iPhone:
 *   • agora + máx/mín + sensação
 *   • gráfico de temperatura das próximas 24 h (com título e marcadores)
 *   • gráfico de probabilidade de precipitação por hora
 *   • previsão dos próximos dias com faixa de temperatura
 */

function round(v, suffix = '') {
  return v == null || Number.isNaN(v) ? '—' : Math.round(v) + suffix;
}

/* ---------- gráfico de temperatura (linha) --------------------------------- */
function tempChart(hourly, unit) {
  const pts = hourly.filter((h) => typeof h.temp === 'number');
  if (pts.length < 2) return '<div class="clima-chart-empty">sem série horária</div>';

  const W = 600;
  const H = 116;
  const padX = 16;
  const padT = 22;
  const padB = 20;
  const temps = pts.map((p) => p.temp);
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const span = hi - lo || 1;
  const x = (i) => padX + (i * (W - 2 * padX)) / (pts.length - 1);
  const y = (t) => padT + (H - padT - padB) * (1 - (t - lo) / span);

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.temp).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;

  const iHi = temps.indexOf(hi);
  const iLo = temps.indexOf(lo);
  const dot = (i, cls, label) => {
    const cx = x(i).toFixed(1);
    const cy = y(pts[i].temp).toFixed(1);
    const above = pts[i].temp !== lo;
    return (
      `<circle cx="${cx}" cy="${cy}" r="2.6" class="${cls}"/>` +
      `<text x="${cx}" y="${above ? Number(cy) - 6 : Number(cy) + 12}" class="clima-c-vlabel">${label}</text>`
    );
  };

  // eixo x: rótulos de hora a cada 3 h
  const ticks = pts
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => i === 0 || p.hour % 3 === 0)
    .map(({ p, i }) => {
      const lbl = i === 0 ? 'agora' : String(p.hour).padStart(2, '0');
      return `<text x="${x(i).toFixed(1)}" y="${H - 5}" class="clima-c-tick">${lbl}</text>`;
    })
    .join('');

  // marcador "agora" (primeira amostra da janela)
  const nowX = x(0).toFixed(1);
  const nowY = y(pts[0].temp).toFixed(1);
  const nowDup = iHi === 0 || iLo === 0;
  const nowMark =
    `<line x1="${nowX}" y1="${padT - 4}" x2="${nowX}" y2="${H - padB}" class="clima-c-nowline"/>` +
    (nowDup ? '' :
      `<circle cx="${nowX}" cy="${nowY}" r="3" class="clima-c-now"/>` +
      `<text x="${nowX}" y="${Number(nowY) - 7}" class="clima-c-vlabel">${round(pts[0].temp)}°</text>`);

  return `
    <svg class="clima-chart" viewBox="0 0 ${W} ${H}"
         role="img" aria-label="temperatura nas próximas 24 horas em ${unit}">
      <defs>
        <linearGradient id="clima-temp-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent, #5ac8fa)" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="var(--accent, #5ac8fa)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" class="clima-c-area"/>
      <path d="${line}" class="clima-c-line"/>
      ${nowMark}
      ${dot(iHi, 'clima-c-hi', round(hi) + '°')}
      ${dot(iLo, 'clima-c-lo', round(lo) + '°')}
      ${ticks}
    </svg>`;
}

/* ---------- gráfico de precipitação (barras) ------------------------------- */
function precipChart(hourly) {
  const pts = hourly.filter((h) => typeof h.pop === 'number');
  if (!pts.length) return '';
  const maxPop = Math.max(...pts.map((p) => p.pop));
  if (maxPop < 5) {
    return `<div class="clima-chart-empty">sem chuva prevista nas próximas 24 h</div>`;
  }

  const W = 600;
  const H = 76;
  const padX = 16;
  const padT = 8;
  const padB = 18;
  const n = pts.length;
  const bw = ((W - 2 * padX) / n) * 0.62;
  const x = (i) => padX + (i * (W - 2 * padX)) / (n - 1);
  const h = (p) => (H - padT - padB) * (p / 100);

  const bars = pts
    .map((p, i) => {
      const bh = h(p.pop);
      return `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${(H - padB - bh).toFixed(1)}"
        width="${bw.toFixed(1)}" height="${Math.max(bh, 0.6).toFixed(1)}" rx="1.2" class="clima-p-bar"/>`;
    })
    .join('');

  const mid = (H - padB - h(50)).toFixed(1);
  const grid = `<line x1="${padX}" y1="${mid}" x2="${W - padX}" y2="${mid}" class="clima-p-grid"/>
    <text x="${W - padX}" y="${Number(mid) - 2}" class="clima-c-tick" text-anchor="end">50%</text>`;

  const ticks = pts
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => i === 0 || p.hour % 6 === 0)
    .map(({ p, i }) => {
      const lbl = i === 0 ? 'agora' : String(p.hour).padStart(2, '0');
      return `<text x="${x(i).toFixed(1)}" y="${H - 4}" class="clima-c-tick">${lbl}</text>`;
    })
    .join('');

  return `
    <svg class="clima-chart" viewBox="0 0 ${W} ${H}"
         role="img" aria-label="probabilidade de precipitação nas próximas 24 horas">
      ${grid}
      ${bars}
      ${ticks}
    </svg>`;
}

/* ---------- próximos dias ------------------------------------------------- */
function daysList(daily) {
  const days = daily.filter((d) => typeof d.max === 'number' && typeof d.min === 'number');
  if (days.length < 2) return '';
  const weekMin = Math.min(...days.map((d) => d.min));
  const weekMax = Math.max(...days.map((d) => d.max));
  const span = weekMax - weekMin || 1;
  const fmtDow = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });

  const rows = days
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

      <div class="clima-section">
        <div class="clima-section-title">
          <span>Temperatura</span><span class="clima-section-sub">próximas 24 h · ${u}</span>
        </div>
        ${tempChart(hourly, u)}
      </div>

      <div class="clima-section">
        <div class="clima-section-title">
          <span>Precipitação</span><span class="clima-section-sub">chance de chuva por hora</span>
        </div>
        ${precipChart(hourly)}
      </div>

      <div class="clima-section">
        <div class="clima-section-title">
          <span>Próximos dias</span><span class="clima-section-sub">mín · máx</span>
        </div>
        ${daysList(daily)}
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
