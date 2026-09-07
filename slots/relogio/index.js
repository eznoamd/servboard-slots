/**
 * Slot "relogio" — hora, dia (número), dia da semana, mês/ano e semana do ano.
 *
 * O relógio "anda" no cliente (view.js). O refresh só carrega o fuso/idioma,
 * então pode rodar bem espaçado.
 *
 * settings:
 *   timezone : IANA tz (ex.: "America/Sao_Paulo"). Default: o timezone da config.
 *   locale   : BCP-47 (ex.: "pt-BR"). Default "pt-BR".
 *   showSeconds : bool. Default true.
 */
export async function refresh(ctx) {
  return {
    timezone: ctx.settings?.timezone || ctx.config?.timezone || 'America/Sao_Paulo',
    locale: ctx.settings?.locale || 'pt-BR',
    showSeconds: ctx.settings?.showSeconds !== false,
    serverTime: ctx.now.toISOString(),
  };
}
