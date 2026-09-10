/**
 * Slot "todos" — tarefas que o dono cadastrou via inbox para lembrar.
 * Fonte: data/todos.json (escrito pelo serviço inbox/). Só leitura aqui.
 */
import { read } from '../../lib/store.js';

const PRIO_RANK = { alta: 0, media: 1, baixa: 2 };

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function refresh(ctx) {
  const raw = await read('todos');
  const today = startOfDay(ctx.now);

  const items = raw.map((t) => {
    const when = t.prazo
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(t.prazo) ? `${t.prazo}T00:00:00` : t.prazo)
      : null;
    const days = when && !Number.isNaN(+when)
      ? Math.round((startOfDay(when) - today) / 86_400_000)
      : null;
    return {
      id: t.id,
      texto: t.texto,
      prioridade: t.prioridade ?? null,
      feito: t.feito === true,
      feitoEm: t.feitoEm ?? null,
      prazo: t.prazo ?? null,
      when: when && !Number.isNaN(+when) ? when.toISOString() : null,
      days,
    };
  });

  const rank = (t) => (t.days == null ? 9999 : t.days) * 10 + (PRIO_RANK[t.prioridade] ?? 1);
  const pending = items.filter((t) => !t.feito).sort((a, b) => rank(a) - rank(b));
  const done = items
    .filter((t) => t.feito)
    .sort((a, b) => String(b.feitoEm || '').localeCompare(String(a.feitoEm || '')));

  return {
    pending,
    done,
    counts: {
      pending: pending.length,
      done: done.length,
      atrasadas: pending.filter((t) => t.days != null && t.days < 0).length,
    },
    generatedAt: ctx.now.toISOString(),
  };
}
