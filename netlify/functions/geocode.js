const https = require('https');

// Публичный ключ — он же используется в HTML, не секрет
const MAPS_KEY = 'e221b30c-502f-43db-9bcd-5fb61ec12839';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors() };

  const q = (event.queryStringParameters || {}).q || '';
  if (q.length < 2) return { statusCode: 200, headers: cors(), body: '[]' };

  try {
    const url =
      `https://geocode-maps.yandex.ru/1.x/?apikey=${MAPS_KEY}` +
      `&geocode=${encodeURIComponent(q)}&format=json&results=5&lang=ru_RU`;

    const raw  = await get(url);
    const data = JSON.parse(raw);
    const members = data.response?.GeoObjectCollection?.featureMember || [];

    const results = members.map(f => {
      const obj = f.GeoObject;
      const pos = obj.Point.pos.split(' ').map(Number); // "lng lat"
      return {
        text: obj.metaDataProperty.GeocoderMetaData.text,
        lat:  pos[1],
        lng:  pos[0]
      };
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...cors() },
      body: JSON.stringify(results)
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
