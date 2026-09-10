const TIPO_ICON = {
  prova: '📝',
  trabalho: '📄',
  teste: '✍️',
  apresentacao: '🎤',
  seminario: '🎤',
  lista: '📋',
  outro: '📌',
};

function fmtWhen(p) {
  if (p.days == null) return { badge: '—', rel: 'sem data', cls: 'nodate' };
  const d = new Date(p.when);
  const dm = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (p.days < 0) return { badge: dm, rel: `há ${-p.days}d`, cls: 'atra' };
  if (p.days === 0) return { badge: 'hoje', rel: 'hoje', cls: 'hoje' };
  if (p.days === 1) return { badge: dm, rel: 'amanhã', cls: 'soon' };
  if (p.days <= 7) return { badge: dm, rel: `em ${p.days}d`, cls: 'soon' };
  return { badge: dm, rel: `em ${p.days}d`, cls: '' };
}

export function render(el, data) {
  const items = data?.items || [];
  const c = data?.counts || {};

  if (!items.length) {
    el.innerHTML = `
      <div class="pv pv--empty">
        <div class="pv-empty-msg">nenhuma prova ou trabalho cadastrado</div>
        <code class="pv-empty-hint">POST /provas · Bearer &lt;token&gt;</code>
      </div>`;
    return;
  }

  const rows = items
    .slice(0, 9)
    .map((p) => {
      const w = fmtWhen(p);
      const sub = [p.materia, p.tipo && p.tipo !== 'prova' ? p.tipo : null].filter(Boolean).join(' · ');
      return `
        <li class="pv-item pv-${w.cls || 'far'}">
          <span class="pv-date">${w.badge}</span>
          <span class="pv-main">
            <span class="pv-titulo">${TIPO_ICON[p.tipo] || '📌'} ${esc(p.titulo)}</span>
            ${sub ? `<span class="pv-sub">${esc(sub)}</span>` : ''}
          </span>
          <span class="pv-rel">${w.rel}</span>
        </li>`;
    })
    .join('');

  el.innerHTML = `
    <div class="pv">
      <div class="pv-head">
        ${c.atrasadas ? `<span class="pv-tag pv-tag--atra">${c.atrasadas} atrasada${c.atrasadas > 1 ? 's' : ''}</span>` : ''}
        <span class="pv-tag">${c.semana || 0} nesta semana</span>
        <span class="pv-tag pv-tag--mut">${c.total} no total</span>
      </div>
      <ul class="pv-list">${rows}</ul>
      ${items.length > 9 ? `<div class="pv-more">+${items.length - 9} depois</div>` : ''}
    </div>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
