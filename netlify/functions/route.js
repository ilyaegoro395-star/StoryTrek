const https = require('https');

// OSRM — бесплатный публичный роутер, не нужен ключ
const OSRM = 'https://router.project-osrm.org';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors() };
  if (event.httpMethod !== 'POST')    return { statusCode: 405 };

  const { waypoints } = JSON.parse(event.body || '{}');
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Need 2+ waypoints' }) };
  }

  // OSRM принимает lng,lat
  const pts = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
  const url = `${OSRM}/route/v1/foot/${pts}?overview=full&geometries=geojson`;

  try {
    const raw  = await get(url);
    const data = JSON.parse(raw);

    if (data.code !== 'Ok') {
      return { statusCode: 422, headers: cors(), body: JSON.stringify({ error: data.message || data.code }) };
    }

    const route  = data.routes[0];
    const distM  = Math.round(route.distance);
    const durSec = Math.round(route.duration);

    // OSRM отдаёт [lng, lat] — меняем на [lat, lng] для Яндекс Карт
    const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);

    const distText = distM >= 1000
      ? `${(distM / 1000).toFixed(1)} км`
      : `${distM} м`;

    const durMin  = Math.round(durSec / 60);
    const durText = durMin >= 60
      ? `${Math.floor(durMin / 60)} ч ${durMin % 60} мин`
      : `${durMin} мин`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...cors() },
      body: JSON.stringify({ coords, distText, durText })
    };
  } catch (e) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
};

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(d));
    }).on('error', rej);
  });
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
