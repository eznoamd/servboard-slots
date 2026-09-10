function prazoLabel(t) {
  if (t.days == null) return '';
  if (t.days < 0) return `atrasado ${-t.days}d`;
  if (t.days === 0) return 'hoje';
  if (t.days === 1) return 'amanhã';
  if (t.days <= 7) return `em ${t.days}d`;
  const d = new Date(t.when);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function render(el, data) {
  const pending = data?.pending || [];
  const done = data?.done || [];
  const c = data?.counts || {};

  if (!pending.length && !done.length) {
    el.innerHTML = `
      <div class="td td--empty">
        <div class="td-empty-msg">nada na lista</div>
        <code class="td-empty-hint">POST /todos · Bearer &lt;token&gt;</code>
      </div>`;
    return;
  }

  const row = (t, isDone) => {
    const prazo = prazoLabel(t);
    const late = !isDone && t.days != null && t.days < 0;
    return `
      <li class="td-item${isDone ? ' td-done' : ''}${late ? ' td-late' : ''}">
        <span class="td-box">${isDone ? '☑' : '☐'}</span>
        <span class="td-txt">${t.prioridade ? `<span class="td-dot td-${t.prioridade}"></span>` : ''}${esc(t.texto)}</span>
        ${prazo ? `<span class="td-prazo">${prazo}</span>` : ''}
      </li>`;
  };

  const pendingRows = pending.slice(0, 10).map((t) => row(t, false)).join('');
  const doneRows = done.slice(0, 3).map((t) => row(t, true)).join('');

  el.innerHTML = `
    <div class="td">
      <div class="td-head">
        <span class="td-tag${c.atrasadas ? ' td-tag--atra' : ''}">${c.pending} a fazer</span>
        ${c.done ? `<span class="td-tag td-tag--mut">${c.done} feita${c.done > 1 ? 's' : ''}</span>` : ''}
      </div>
      <ul class="td-list">
        ${pendingRows}
        ${doneRows}
      </ul>
      ${pending.length > 10 ? `<div class="td-more">+${pending.length - 10} pendentes</div>` : ''}
    </div>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
