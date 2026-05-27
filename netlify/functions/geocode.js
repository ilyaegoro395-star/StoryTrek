const https = require('https');

/* Яндекс GeoSuggest — специальный API для автодополнения адресов */
const SUGGEST_KEY = '241cb848-e9da-444b-a34b-a510cdf2204a';
/* Яндекс HTTP Геокодер — fallback для получения координат */
const GEOCODER_KEY = 'e221b30c-502f-43db-9bcd-5fb61ec12839';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  const q = (event.queryStringParameters || {}).q || '';
  if (q.length < 2) return { statusCode: 200, headers: cors(), body: '[]' };

  try {
    /* ── 1. Яндекс GeoSuggest — автодополнение по частичному тексту ── */
    const sugUrl =
      `https://suggest-maps.yandex.ru/v1/suggest` +
      `?apikey=${SUGGEST_KEY}` +
      `&text=${encodeURIComponent(q)}` +
      `&lang=ru_RU&results=8&types=geo&print_address=1`;

    const sugRaw  = await get(sugUrl);
    const sugData = JSON.parse(sugRaw);

    if (sugData.results && sugData.results.length > 0) {
      const items = sugData.results
        .filter(r => r.uri)
        .map(r => {
          /* координаты в URI: ymapsbm1://geo?ll=37.41%2C55.64&... */
          const m   = r.uri.match(/ll=([0-9.]+)%2C([0-9.]+)/);
          const lng = m ? parseFloat(m[1]) : null;
          const lat = m ? parseFloat(m[2]) : null;
          const name = r.title?.text || '';
          const sub  = r.subtitle?.text || '';
          return { text: sub ? `${name}, ${sub}` : name, lat, lng };
        })
        .filter(r => r.lat && r.lng);

      if (items.length > 0) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', ...cors() },
          body: JSON.stringify(items)
        };
      }
    }

    /* ── 2. Fallback: HTTP Геокодер ── */
    const geoUrl =
      `https://geocode-maps.yandex.ru/1.x/?apikey=${GEOCODER_KEY}` +
      `&geocode=${encodeURIComponent(q)}&format=json&results=5&lang=ru_RU`;

    const geoRaw  = await get(geoUrl);
    const geoData = JSON.parse(geoRaw);
    const members = geoData.response?.GeoObjectCollection?.featureMember || [];

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
    console.error('geocode error:', e.message);
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
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
