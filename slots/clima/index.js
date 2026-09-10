/**
 * Slot "clima" — local + temperatura agora e ao longo do dia.
 * Fonte: Open-Meteo (grátis, sem chave). Geocoding e geoloc por IP também Open-Meteo/ipwho.
 *
 * settings (todos opcionais):
 *   latitude, longitude : coordenadas explícitas (têm prioridade)
 *   city                : nome da cidade para geocodificar (ex.: "Campinas")
 *   label               : rótulo a exibir (senão usa o nome resolvido)
 *   country             : filtra o geocoding (ex.: "BR")
 * Sem nada disso, tenta localizar pelo IP do servidor (cacheado por 12 h).
 */
import { describeWeather } from './wmo.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const IP_URLS = ['https://ipwho.is/', 'https://ipapi.co/json/'];
const IP_TTL_MS = 12 * 60 * 60 * 1000;

async function getJson(url, ms = 8000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url.split('?')[0]} respondeu ${res.status}`);
  return res.json();
}

async function geocodeCity(city, country) {
  const q = new URLSearchParams({ name: city, count: '5', language: 'pt', format: 'json' });
  const { results } = await getJson(`${GEOCODE_URL}?${q}`);
  if (!results?.length) throw new Error(`cidade não encontrada: "${city}"`);
  const pick = country
    ? results.find((r) => r.country_code?.toUpperCase() === country.toUpperCase()) ?? results[0]
    : results[0];
  return {
    latitude: pick.latitude,
    longitude: pick.longitude,
    name: pick.name,
    admin: pick.admin1 || null,
    country: pick.country || pick.country_code || null,
    source: 'geocoding',
  };
}

async function geolocateByIp() {
  for (const url of IP_URLS) {
    try {
      const j = await getJson(url);
      const lat = j.latitude ?? j.lat;
      const lon = j.longitude ?? j.lon;
      if (typeof lat === 'number' && typeof lon === 'number') {
        return {
          latitude: lat,
          longitude: lon,
          name: j.city || j.region || 'local',
          admin: j.region || j.region_name || null,
          country: j.country || j.country_name || j.country_code || null,
          source: 'ip',
        };
      }
    } catch {
      /* tenta o próximo provedor */
    }
  }
  throw new Error('não foi possível localizar pelo IP — configure latitude/longitude ou city');
}

async function resolveLocation(settings, ctx) {
  const s = settings ?? {};
  if (typeof s.latitude === 'number' && typeof s.longitude === 'number') {
    return {
      latitude: s.latitude,
      longitude: s.longitude,
      name: s.label || s.city || 'local',
      admin: null,
      country: s.country || null,
      source: 'config',
    };
  }
  if (s.city) {
    return geocodeCity(s.city, s.country);
  }
  // geoloc por IP com cache
  const state = (await ctx.readState()) || {};
  if (state.ipLoc && Date.now() - (state.ipLocAt || 0) < IP_TTL_MS) {
    return { ...state.ipLoc, source: 'ip (cache)' };
  }
  const loc = await geolocateByIp();
  await ctx.writeState({ ...state, ipLoc: loc, ipLocAt: Date.now() });
  return loc;
}

export async function refresh(ctx) {
  const loc = await resolveLocation(ctx.settings, ctx);

  const q = new URLSearchParams({
    latitude: String(loc.latitude),
    longitude: String(loc.longitude),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m,wind_direction_10m,precipitation',
    hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset,precipitation_probability_max,precipitation_sum',
    timezone: 'auto',
    forecast_days: '7',
  });
  const fc = await getJson(`${FORECAST_URL}?${q}`);

  const cur = fc.current;

  // janela de 24 h a partir da hora atual (local do fuso resolvido)
  const times = fc.hourly?.time || [];
  const curKey = (cur?.time || '').slice(0, 13); // "YYYY-MM-DDTHH"
  let start = times.findIndex((t) => t.slice(0, 13) === curKey);
  if (start < 0) start = 0;
  const at = (arr, i) => (Array.isArray(arr) ? arr[start + i] : undefined);
  const hourly = [];
  for (let i = 0; i < 24 && start + i < times.length; i++) {
    const t = times[start + i];
    hourly.push({
      time: t,
      hour: Number(t.slice(11, 13)),
      temp: at(fc.hourly.temperature_2m, i) ?? null,
      pop: at(fc.hourly.precipitation_probability, i) ?? null,
      precip: at(fc.hourly.precipitation, i) ?? null,
      ...describeWeather(at(fc.hourly.weather_code, i)),
    });
  }

  const d = fc.daily || {};
  const daily = (d.time || []).map((date, i) => ({
    date,
    max: d.temperature_2m_max?.[i] ?? null,
    min: d.temperature_2m_min?.[i] ?? null,
    pop: d.precipitation_probability_max?.[i] ?? null,
    precipSum: d.precipitation_sum?.[i] ?? null,
    ...describeWeather(d.weather_code?.[i]),
  }));

  const label = ctx.settings?.label
    || [loc.name, loc.admin].filter(Boolean).join(', ')
    || loc.name;

  return {
    location: {
      label,
      name: loc.name,
      admin: loc.admin,
      country: loc.country,
      latitude: Number(loc.latitude.toFixed?.(3) ?? loc.latitude),
      longitude: Number(loc.longitude.toFixed?.(3) ?? loc.longitude),
      source: loc.source,
    },
    units: {
      temp: fc.current_units?.temperature_2m || '°C',
      wind: fc.current_units?.wind_speed_10m || 'km/h',
      precip: fc.hourly_units?.precipitation || 'mm',
    },
    now: {
      temp: cur.temperature_2m,
      feels: cur.apparent_temperature,
      humidity: cur.relative_humidity_2m,
      wind: cur.wind_speed_10m,
      windDir: cur.wind_direction_10m,
      isDay: cur.is_day === 1,
      ...describeWeather(cur.weather_code),
    },
    today: {
      max: d.temperature_2m_max?.[0] ?? null,
      min: d.temperature_2m_min?.[0] ?? null,
      rainChance: d.precipitation_probability_max?.[0] ?? null,
      sunrise: d.sunrise?.[0] ?? null,
      sunset: d.sunset?.[0] ?? null,
      ...describeWeather(d.weather_code?.[0]),
    },
    hourly,
    daily,
    fetchedAt: ctx.now.toISOString(),
  };
}
