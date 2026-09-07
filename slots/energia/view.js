const METHOD_LABEL = {
  smartplug: 'tomada',
  rapl: 'RAPL (CPU)',
  ipmi: 'IPMI',
  estimate: 'estimativa',
};

export function render(el, data) {
  if (!data || typeof data.watts !== 'number') {
    el.innerHTML = `<div class="egy-empty">sem leitura de energia ainda</div>`;
    return;
  }
  const cur = data.currency || 'R$';
  const money = (v) => `${cur} ${Number(v).toFixed(2).replace('.', ',')}`;

  // barra: 0..max estimado (usa maxWatts implícito de ~1.6x a média, mínimo 80)
  const scale = Math.max(80, Math.ceil((data.avgWatts || data.watts) * 1.8 / 10) * 10);
  const pct = Math.min(100, (data.watts / scale) * 100);

  el.innerHTML = `
    <div class="egy">
      <div class="egy-now">
        <span class="egy-w">${data.watts.toFixed(data.watts < 100 ? 1 : 0)}</span><span class="egy-u">W</span>
        <span class="egy-tag${data.partial ? ' warn' : ''}" title="${escapeHtml(data.methodDetail || '')}">
          ${METHOD_LABEL[data.method] || data.method}${data.partial ? ' *' : ''}
        </span>
      </div>

      <div class="egy-bar"><div class="egy-bar-fill" style="width:${pct.toFixed(0)}%"></div></div>
      <div class="egy-bar-cap"><span>0</span><span>média ${Math.round(data.avgWatts)} W</span><span>${scale} W</span></div>

      <div class="egy-grid">
        <div><label>hoje</label><b>${fmtKwh(data.kwhToday)}</b><small>${money(data.costToday)}</small></div>
        <div><label>ontem</label><b>${fmtKwh(data.kwhYesterday)}</b><small>&nbsp;</small></div>
        <div><label>mês (projeção)</label><b>${fmtKwh(data.kwhMonthProjected)}</b><small>${money(data.costMonthProjected)}</small></div>
      </div>

      ${data.partial ? `<div class="egy-note">* só a CPU — o consumo real da máquina é maior</div>` : ''}
    </div>`;
}

function fmtKwh(v) {
  const n = Number(v) || 0;
  return n < 1 ? `${Math.round(n * 1000)} Wh` : `${n.toFixed(2).replace('.', ',')} kWh`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
