/**
 * Slot "provas" — lista provas/trabalhos que o dono cadastrou via inbox.
 * Fonte: data/provas.json (escrito pelo serviço inbox/). Só leitura aqui.
 */
import { read } from '../../lib/store.js';

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function refresh(ctx) {
  const raw = await read('provas');
  const today = startOfDay(ctx.now);

  const items = raw.map((p) => {
    const when = p.data
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(p.data) ? `${p.data}T00:00:00` : p.data)
      : null;
    const days = when && !Number.isNaN(+when)
      ? Math.round((startOfDay(when) - today) / 86_400_000)
      : null;
    return {
      id: p.id,
      titulo: p.titulo,
      materia: p.materia ?? null,
      tipo: p.tipo ?? 'prova',
      peso: p.peso ?? null,
      obs: p.obs ?? null,
      data: p.data ?? null,
      when: when && !Number.isNaN(+when) ? when.toISOString() : null,
      days,
    };
  });

  items.sort((a, b) => {
    if (a.days == null && b.days == null) return a.titulo.localeCompare(b.titulo);
    if (a.days == null) return 1;
    if (b.days == null) return -1;
    return a.days - b.days;
  });

  return {
    items,
    counts: {
      total: items.length,
      atrasadas: items.filter((p) => p.days != null && p.days < 0).length,
      semana: items.filter((p) => p.days != null && p.days >= 0 && p.days <= 7).length,
    },
    generatedAt: ctx.now.toISOString(),
  };
}
