function sparkline(hours, nowHour) {
  const pts = hours.filter((h) => typeof h.temp === 'number');
  if (pts.length < 2) return '';
  const W = 320;
  const H = 66;
  const pad = 8;
  const temps = pts.map((p) => p.temp);
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const span = hi - lo || 1;
  const x = (i) => pad + (i * (W - 2 * pad)) / (pts.length - 1);
  const y = (t) => pad + (H - 2 * pad) * (1 - (t - lo) / span);

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.temp).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;

  // marcador "agora"
  let marker = '';
  const ni = pts.findIndex((p) => p.hour === nowHour);
  if (ni >= 0) {
    const mx = x(ni).toFixed(1);
    marker =
      `<line x1="${mx}" y1="0" x2="${mx}" y2="${H - 10}" class="spark-nowline"/>` +
      `<circle cx="${mx}" cy="${y(pts[ni].temp).toFixed(1)}" r="3" class="spark-now"/>`;
  }

  // rótulos de hora a cada ~6h (pula 00h)
  const ticks = pts
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.hour % 6 === 0 && p.hour !== 0)
    .map(({ p, i }) => `<text x="${x(i).toFixed(1)}" y="${H - 1}" class="spark-tick">${String(p.hour).padStart(2, '0')}h</text>`)
    .join('');

  return `
    <svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="temperatura ao longo do dia">
      <path d="${area}" class="spark-area"/>
      <path d="${line}" class="spark-line"/>
      ${marker}
      ${ticks}
    </svg>`;
}

export function render(el, data) {
  if (!data?.now) {
    el.innerHTML = `<div class="clima-empty">sem dados de clima ainda</div>`;
    return;
  }
  const u = data.units?.temp || '°C';
  const n = data.now;
  const t = data.today;
  const nowHour = new Date().getHours();
  const dir = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.round((n.windDir % 360) / 45) % 8];

  const hhmm = (iso) => (iso ? iso.slice(11, 16) : '—');

  el.innerHTML = `
    <div class="clima">
      <div class="clima-top">
        <div class="clima-emoji">${n.emoji}</div>
        <div class="clima-main">
          <div class="clima-temp">${Math.round(n.temp)}<span>${u}</span></div>
          <div class="clima-cond">${n.label}</div>
          <div class="clima-loc">${escapeHtml(data.location?.label || '—')}</div>
        </div>
        <div class="clima-side">
          <div>máx <b>${t.max != null ? Math.round(t.max) + '°' : '—'}</b></div>
          <div>mín <b>${t.min != null ? Math.round(t.min) + '°' : '—'}</b></div>
          <div>sens. <b>${n.feels != null ? Math.round(n.feels) + '°' : '—'}</b></div>
        </div>
      </div>

      ${sparkline(t.hourly || [], nowHour)}

      <div class="clima-meta">
        <span>💧 ${n.humidity ?? '—'}%</span>
        <span>🌬️ ${Math.round(n.wind ?? 0)} ${data.units?.wind || 'km/h'} ${dir}</span>
        <span>🌧️ ${t.rainChance ?? 0}%</span>
        <span>🌅 ${hhmm(t.sunrise)}</span>
        <span>🌇 ${hhmm(t.sunset)}</span>
      </div>
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
