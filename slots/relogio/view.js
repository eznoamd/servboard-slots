function isoWeek(d) {
  // semana ISO-8601: semana 1 é a que contém a primeira quinta-feira
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}

export function render(el, data, ctx) {
  const tz = data?.timezone || ctx.timezone || undefined;
  const locale = data?.locale || 'pt-BR';
  const withSeconds = data?.showSeconds !== false;

  el.innerHTML = `
    <div class="rlg">
      <div class="rlg-time" data-role="time">--:--</div>
      <div class="rlg-dow" data-role="dow">—</div>
      <div class="rlg-daynum"><span data-role="daynum">–</span></div>
      <div class="rlg-md" data-role="md">—</div>
      <div class="rlg-meta" data-role="meta"></div>
    </div>`;

  const $ = (r) => el.querySelector(`[data-role=${r}]`);

  const fmtTime = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hourCycle: 'h23',
    timeZone: tz,
  });
  const fmtDow = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: tz });
  const fmtDay = new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: tz });
  const fmtMd = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: tz });

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const tick = () => {
    // "agora" no fuso alvo, para semana/dia-do-ano corretos
    const now = new Date();
    const localish = new Date(now.toLocaleString('en-US', { timeZone: tz }));

    $('time').textContent = fmtTime.format(now);
    $('dow').textContent = cap(fmtDow.format(now));
    $('daynum').textContent = fmtDay.format(now);
    $('md').textContent = cap(fmtMd.format(now));
    $('meta').textContent = `semana ${isoWeek(localish)} · ${dayOfYear(localish)}º dia do ano`;
  };

  tick();
  const id = setInterval(tick, withSeconds ? 1000 : 15000);
  return () => clearInterval(id);
}
