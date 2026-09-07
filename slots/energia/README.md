# Slot `energia`

Mostra a potência do servidor agora (W), o consumo acumulado do dia (kWh), o de
ontem, e a projeção de kWh/custo do mês. O kWh do dia é integrado entre os
refreshes e guardado em `data/state/energia.json` da base.

## Fontes de medição (o slot usa a melhor disponível, nesta ordem)

| Fonte | Precisão | Requisito |
|---|---|---|
| **Tomada inteligente** | máquina inteira, real | uma tomada Tasmota/Shelly na rede |
| **IPMI / DCMI** | máquina inteira, real | servidor com BMC + `ipmitool` |
| **RAPL** | só a CPU (marcado com `*`) | CPU Intel/AMD + leitura liberada (abaixo) |
| **Estimativa** | aproximada | nada — sempre funciona; calibre `idleWatts`/`maxWatts` |

Force uma fonte específica com `settings.method` (`"smartplug"`, `"rapl"`,
`"ipmi"`, `"estimate"`); o default é `"auto"`.

## settings

```jsonc
{
  "id": "energia",
  "enabled": true,
  "settings": {
    "method": "auto",
    "idleWatts": 18,          // potência em repouso (estimativa) — meça com um wattímetro
    "maxWatts": 55,           // potência sob carga total (estimativa)
    "pricePerKwh": 0.92,      // R$/kWh da sua conta de luz
    "currency": "R$",

    "smartPlug": {
      "type": "tasmota",      // "tasmota" | "shelly" (gen2/plus) | "shelly1" (gen1) | "generic"
      "host": "192.168.1.50",
      "auth": "admin:senha",  // opcional (Shelly com senha)
      "url": "http://.../status",   // só para type "generic"
      "jsonPath": "meter.power"     // só para type "generic": caminho até os watts
    }
  }
}
```

## Liberar o RAPL para leitura

Desde 2020 o kernel deixa `energy_uj` legível só pelo root. Para o usuário da
dashboard conseguir ler, crie uma regra udev:

```bash
sudo tee /etc/udev/rules.d/99-rapl-readable.rules >/dev/null <<'EOF'
SUBSYSTEM=="powercap", ACTION=="add", RUN+="/bin/sh -c 'chmod -R a+r /sys/class/powercap/intel-rapl'"
EOF
sudo udevadm control --reload
sudo udevadm trigger --subsystem-match=powercap
# confere:
cat /sys/class/powercap/intel-rapl:0/energy_uj
```

Sem isso, o slot cai para a estimativa automaticamente.

## Calibrar a estimativa

1. Meça a máquina com um wattímetro de tomada (Kill-A-Watt, ou uma tomada inteligente).
2. Anote os watts com o servidor **ocioso** → `idleWatts`.
3. Rode carga (`stress-ng --cpu $(nproc)` ou uma compilação) e anote o pico → `maxWatts`.
4. Ponha os dois em `settings` e `servboard refresh --slot energia`.
