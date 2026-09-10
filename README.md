# servboard-slots

Slots pessoais para a [dashboard servBoard](https://github.com/eznoamd/servBoard).
Mantidos fora do repo da base — atualizar a base nunca conflita com estes.

```
slots/
  relogio/   hora, dia, dia da semana, mês/ano, semana do ano   (span 1)
  clima/     agora + gráfico de temperatura 24 h, precipitação e próximos dias  (span 2)  — Open-Meteo
  energia/   consumo de energia do servidor (W, kWh, custo)      (span 1)  — tomada / RAPL / IPMI / estimativa
  provas/    provas/trabalhos que eu cadastrei                   (span 1)  — inbox/
  todos/     tarefas que eu cadastrei                            (span 1)  — inbox/

inbox/       serviço HTTP que recebe provas/todos do notebook (Node puro, porta 4871)
lib/store.js armazenamento JSON compartilhado (inbox escreve, slots leem)
data/        provas.json, todos.json, inbox-token   (git-ignored)
```

## Como a base enxerga estes slots

No `config/servboard.json` da base:

```jsonc
{
  "slotPaths": ["../servboard-slots/slots"],   // este repo clonado ao lado do servBoard
  "slots": [
    { "id": "relogio", "enabled": true },
    { "id": "clima",   "enabled": true, "settings": { "city": "Campinas", "country": "BR" } },
    { "id": "energia", "enabled": true, "settings": { "idleWatts": 18, "maxWatts": 55, "pricePerKwh": 0.92 } },
    { "id": "provas",  "enabled": true },
    { "id": "todos",   "enabled": true }
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

### provas / todos
Sem `settings`. Só leem `data/provas.json` / `data/todos.json`, que são escritos
pelo serviço **inbox** (abaixo). `refreshInterval` é `1m`, então uma prova/tarefa
nova aparece no painel em até ~1 min.

## Serviço `inbox` — cadastrar provas/todos do notebook

Servidor HTTP pequeno (Node puro, sem dependências) que recebe os POSTs e grava
nos JSON. **Só o dono cadastra**: todo request (menos `/health`) exige
`Authorization: Bearer <token>`.

```bash
npm run inbox            # sobe em 0.0.0.0:4871 (acessível pela LAN)
npm run inbox:token      # mostra o token (gerado em data/inbox-token na 1ª vez)
npm test                 # testa o inbox
```

Ambiente (todos opcionais):

| var | default | o quê |
|---|---|---|
| `SERVBOARD_INBOX_TOKEN` | lê/gera `data/inbox-token` | token Bearer |
| `SERVBOARD_INBOX_HOST`  | `0.0.0.0` | interface de bind |
| `SERVBOARD_INBOX_PORT`  | `4871` | porta |
| `SERVBOARD_INBOX_ALLOW` | (vazio = todos) | IPs/prefixos permitidos, ex. `192.168.1.,127.0.0.1` |
| `SERVBOARD_DATA_DIR`    | `<repo>/data` | onde ficam os JSON |

Rodar como serviço: `deploy/servboard-inbox.service` (systemd user).

### Rotas

```
GET    /health                       sem auth
GET    /provas   | /todos             lista tudo
POST   /provas   | /todos             cria
PATCH  /provas/:id | /todos/:id       edita campos
DELETE /provas/:id | /todos/:id       remove
```

**provas** — `titulo` obrigatório; `materia`, `tipo`
(`prova|trabalho|teste|apresentacao|seminario|lista|outro`), `data`
(`YYYY-MM-DD`), `peso`, `obs` opcionais.

**todos** — `texto` obrigatório; `prazo` (`YYYY-MM-DD`),
`prioridade` (`alta|media|baixa`), `feito` opcionais.

`id` e `criadoEm` são gerados no servidor (não dá para forjar).

### Exemplos

```bash
TOKEN=$(npm run --silent inbox:token)
IP=192.168.1.50            # IP do servidor na LAN

# cadastrar uma prova
curl -sX POST http://$IP:4871/provas \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"titulo":"P1 Cálculo","materia":"Cálculo I","tipo":"prova","data":"2026-09-20"}'

# cadastrar um todo
curl -sX POST http://$IP:4871/todos \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"texto":"Falar com orientador","prioridade":"alta","prazo":"2026-09-12"}'

# listar / marcar feito / remover
curl -s http://$IP:4871/todos -H "Authorization: Bearer $TOKEN"
curl -sX PATCH  http://$IP:4871/todos/<id> -H "Authorization: Bearer $TOKEN" -d '{"feito":true}'
curl -sX DELETE http://$IP:4871/provas/<id> -H "Authorization: Bearer $TOKEN"
```

Um alias no `.bashrc` do notebook deixa isso rápido:

```bash
prova() { curl -sX POST http://192.168.1.50:4871/provas -H "Authorization: Bearer $SBTOKEN" \
  -H 'Content-Type: application/json' -d "$1" | jq; }
```
