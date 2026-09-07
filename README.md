# servboard-slots

Slots pessoais para a [dashboard servBoard](https://github.com/eznoamd/servBoard).
Mantidos fora do repo da base — atualizar a base nunca conflita com estes.

```
slots/
  relogio/   hora, dia, dia da semana, mês/ano, semana do ano   (span 1)
  clima/     local + temperatura agora e ao longo do dia         (span 2)  — Open-Meteo
  energia/   consumo de energia do servidor (W, kWh, custo)      (span 1)  — tomada / RAPL / IPMI / estimativa
```

## Como a base enxerga estes slots

No `config/servboard.json` da base:

```jsonc
{
  "slotPaths": ["../servboard-slots/slots"],   // este repo clonado ao lado do servBoard
  "slots": [
    { "id": "relogio", "enabled": true },
    { "id": "clima",   "enabled": true, "settings": { "city": "Campinas", "country": "BR" } },
    { "id": "energia", "enabled": true, "settings": { "idleWatts": 18, "maxWatts": 55, "pricePerKwh": 0.92 } }
  ]
}
```

Depois de editar horários/slots: `servboard install` (regenera os timers).

## Desenvolver um slot

```bash
cd ../servBoard
servboard new-slot meuslot --path ../servboard-slots/slots
servboard serve            # http://127.0.0.1:4870
servboard refresh --slot meuslot
```

Contrato: `slot.json` + `index.js` (`export async function refresh(ctx)`) +
`view.js` (`export function render(el, data, ctx)`) + `view.css` opcional.
`ctx` = `{ settings, config:{timezone}, now, logger, readState(), writeState(obj) }`.

## Configuração de cada slot

### relogio
`settings`: `timezone`, `locale` (default `pt-BR`), `showSeconds` (default `true`).

### clima
`settings` (tudo opcional): `latitude`+`longitude`, ou `city` (+`country` p/ desempate),
`label`. Sem nada, localiza pelo IP do servidor (cache de 12 h). Fonte: Open-Meteo,
sem chave de API.

### energia
Ver [`slots/energia/README.md`](slots/energia/README.md) — fontes de medição,
regra udev para o RAPL e como ligar uma tomada inteligente.
