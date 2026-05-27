const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  const q = (event.queryStringParameters || {}).q || '';
  if (q.length < 2) return { statusCode: 200, headers: cors(), body: '[]' };

  try {
    /* Nominatim (OpenStreetMap) — бесплатно, без ключей, работает с любого сервера */
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(q)}` +
      `&format=json&limit=8&addressdetails=0` +
      `&accept-language=ru&countrycodes=ru`;

    const raw  = await get(url, { 'User-Agent': 'StoryTrek/1.0' });
    const data = JSON.parse(raw);

    const results = data.map(item => ({
      text: item.display_name,
      lat:  parseFloat(item.lat),
      lng:  parseFloat(item.lon)
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...cors() },
      body: JSON.stringify(results)
    };

  } catch (e) {
    console.error('geocode error:', e.message);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
};

function get(url, headers = {}) {
  return new Promise((res, rej) => {
    https.get(url, { headers }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(d));
    }).on('error', rej);
  });
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
