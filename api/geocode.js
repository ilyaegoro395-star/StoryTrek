const https = require('https');

const SUGGEST_KEY  = '241cb848-e9da-444b-a34b-a510cdf2204a';
const GEOCODER_KEY = 'e221b30c-502f-43db-9bcd-5fb61ec12839';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const q = (req.query && req.query.q) || '';
  if (q.length < 2) { res.status(200).json([]); return; }

  try {
    const sugUrl =
      `https://suggest-maps.yandex.ru/v1/suggest` +
      `?apikey=${SUGGEST_KEY}&text=${encodeURIComponent(q)}` +
      `&lang=ru_RU&results=8&types=geo&print_address=1`;

    const { status, body: raw } = await fetch2(sugUrl);
    if (status === 200) {
      const data  = JSON.parse(raw);
      const items = (data.results || [])
        .filter(r => r && r.uri)
        .map(r => {
          const m   = r.uri.match(/ll=([0-9.]+)%2C([0-9.]+)/);
          const lng = m ? parseFloat(m[1]) : null;
          const lat = m ? parseFloat(m[2]) : null;
          const name = (r.title && r.title.text) || '';
          const sub  = (r.subtitle && r.subtitle.text) || '';
          return { text: sub ? `${name}, ${sub}` : name, lat, lng };
        })
        .filter(r => r.lat && r.lng);
      if (items.length > 0) { res.status(200).json(items); return; }
    }
  } catch (e) { console.error('GeoSuggest failed:', e.message); }

  try {
    const geoUrl =
      `https://geocode-maps.yandex.ru/1.x/?apikey=${GEOCODER_KEY}` +
      `&geocode=${encodeURIComponent(q)}&format=json&results=5&lang=ru_RU`;
    const { status, body: raw } = await fetch2(geoUrl);
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
      if (items.length > 0) { res.status(200).json(items); return; }
    }
  } catch (e) { console.error('Geocoder failed:', e.message); }

  try {
    const nomUrl =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(q)}&format=json&limit=6` +
      `&addressdetails=0&accept-language=ru&countrycodes=ru`;
    const { body: raw } = await fetch2(nomUrl, { 'User-Agent': 'StoryTrek/1.0' });
    const data  = JSON.parse(raw);
    const items = data.map(d => ({ text: d.display_name, lat: parseFloat(d.lat), lng: parseFloat(d.lon) }));
    if (items.length > 0) { res.status(200).json(items); return; }
  } catch (e) { console.error('Nominatim failed:', e.message); }

  res.status(200).json([]);
};

function fetch2(url, headers = {}) {
  return new Promise((res, rej) => {
    https.get(url, { headers }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res({ status: r.statusCode, body: d }));
    }).on('error', rej);
  });
}
