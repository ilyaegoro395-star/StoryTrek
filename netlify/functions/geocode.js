const https = require('https');

const SUGGEST_KEY  = '241cb848-e9da-444b-a34b-a510cdf2204a';
const GEOCODER_KEY = 'e221b30c-502f-43db-9bcd-5fb61ec12839';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  const q = (event.queryStringParameters || {}).q || '';
  if (q.length < 2) return { statusCode: 200, headers: cors(), body: '[]' };

  /* ── 1. Яндекс GeoSuggest ── */
  try {
    const sugUrl =
      `https://suggest-maps.yandex.ru/v1/suggest` +
      `?apikey=${SUGGEST_KEY}&text=${encodeURIComponent(q)}` +
      `&lang=ru_RU&results=8&types=geo&print_address=1`;

    const { status, body: raw } = await fetch2(sugUrl);
    console.log('GeoSuggest status:', status, 'preview:', raw.slice(0, 120));

    if (status === 200) {
      const data  = JSON.parse(raw);
      const items = (data.results || [])
        .filter(r => r && r.uri)
        .map(r => {
          const m   = r.uri.match(/ll=([0-9.]+)%2C([0-9.]+)/);
          const lng = m ? parseFloat(m[1]) : null;
          const lat = m ? parseFloat(m[2]) : null;
          const name = (r.title && r.title.text)    || '';
          const sub  = (r.subtitle && r.subtitle.text) || '';
          return { text: sub ? `${name}, ${sub}` : name, lat, lng };
        })
        .filter(r => r.lat && r.lng);

      if (items.length > 0)
        return ok(items);
    }
  } catch (e) {
    console.error('GeoSuggest failed:', e.message);
  }

  /* ── 2. Яндекс HTTP Геокодер ── */
  try {
    const geoUrl =
      `https://geocode-maps.yandex.ru/1.x/?apikey=${GEOCODER_KEY}` +
      `&geocode=${encodeURIComponent(q)}&format=json&results=5&lang=ru_RU`;

    const { status, body: raw } = await fetch2(geoUrl);
    console.log('Geocoder status:', status);

    if (status === 200) {
      const data    = JSON.parse(raw);
      const members = (data.response &&
        data.response.GeoObjectCollection &&
        data.response.GeoObjectCollection.featureMember) || [];

      const items = members.map(f => {
        const obj = f.GeoObject;
        const pos = obj.Point.pos.split(' ').map(Number);
        return { text: obj.metaDataProperty.GeocoderMetaData.text, lat: pos[1], lng: pos[0] };
      });

      if (items.length > 0)
        return ok(items);
    }
  } catch (e) {
    console.error('Geocoder failed:', e.message);
  }

  /* ── 3. Nominatim fallback ── */
  try {
    const nomUrl =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(q)}&format=json&limit=6` +
      `&addressdetails=0&accept-language=ru&countrycodes=ru`;

    const { body: raw } = await fetch2(nomUrl, { 'User-Agent': 'StoryTrek/1.0' });
    const data  = JSON.parse(raw);
    const items = data.map(d => ({
      text: d.display_name,
      lat:  parseFloat(d.lat),
      lng:  parseFloat(d.lon)
    }));

    if (items.length > 0)
      return ok(items);
  } catch (e) {
    console.error('Nominatim failed:', e.message);
  }

  return { statusCode: 200, headers: cors(), body: '[]' };
};

/* ─── helpers ─── */
function ok(items) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...cors() },
    body: JSON.stringify(items)
  };
}

function fetch2(url, headers = {}) {
  return new Promise((res, rej) => {
    https.get(url, { headers }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res({ status: r.statusCode, body: d }));
    }).on('error', rej);
  });
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
