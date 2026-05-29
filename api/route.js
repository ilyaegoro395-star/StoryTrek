const https = require('https');

const OSRM = 'https://router.project-osrm.org';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { res.status(405).end(); return; }

  const { waypoints } = req.body || {};
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    res.status(400).json({ error: 'Need 2+ waypoints' }); return;
  }

  const pts = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
  const url = `${OSRM}/route/v1/foot/${pts}?overview=full&geometries=geojson`;

  try {
    const raw  = await get(url);
    const data = JSON.parse(raw);
    if (data.code !== 'Ok') { res.status(422).json({ error: data.message || data.code }); return; }

    const route  = data.routes[0];
    const distM  = Math.round(route.distance);
    const durSec = Math.round(route.duration);
    const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);

    const distText = distM >= 1000 ? `${(distM/1000).toFixed(1)} км` : `${distM} м`;
    const durMin   = Math.round(durSec / 60);
    const durText  = durMin >= 60
      ? `${Math.floor(durMin/60)} ч ${durMin%60} мин`
      : `${durMin} мин`;

    res.status(200).json({ coords, distText, durText });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
