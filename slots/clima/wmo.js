// Códigos de tempo WMO (Open-Meteo `weather_code`) -> rótulo pt-BR + emoji.
// https://open-meteo.com/en/docs  (tabela WMO Weather interpretation codes)
const TABLE = {
  0: ['Céu limpo', '☀️'],
  1: ['Predomínio de sol', '🌤️'],
  2: ['Parcialmente nublado', '⛅'],
  3: ['Nublado', '☁️'],
  45: ['Névoa', '🌫️'],
  48: ['Névoa com geada', '🌫️'],
  51: ['Garoa fraca', '🌦️'],
  53: ['Garoa', '🌦️'],
  55: ['Garoa forte', '🌧️'],
  56: ['Garoa congelante', '🌧️'],
  57: ['Garoa congelante forte', '🌧️'],
  61: ['Chuva fraca', '🌦️'],
  63: ['Chuva', '🌧️'],
  65: ['Chuva forte', '🌧️'],
  66: ['Chuva congelante', '🌧️'],
  67: ['Chuva congelante forte', '🌧️'],
  71: ['Neve fraca', '🌨️'],
  73: ['Neve', '🌨️'],
  75: ['Neve forte', '❄️'],
  77: ['Grãos de neve', '🌨️'],
  80: ['Pancadas fracas', '🌦️'],
  81: ['Pancadas de chuva', '🌧️'],
  82: ['Pancadas fortes', '⛈️'],
  85: ['Pancadas de neve', '🌨️'],
  86: ['Pancadas de neve fortes', '❄️'],
  95: ['Trovoada', '⛈️'],
  96: ['Trovoada com granizo', '⛈️'],
  99: ['Trovoada com granizo forte', '⛈️'],
};

export function describeWeather(code) {
  const [label, emoji] = TABLE[code] ?? ['—', '❓'];
  return { code, label, emoji };
}
