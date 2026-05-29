const https = require('https');
const querystring = require('querystring');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { res.status(405).end(); return; }

  const { text, voice = 'alena', speed = '1.0' } = req.body || {};
  if (!text) { res.status(400).json({ error: 'text required' }); return; }

  const API_KEY  = process.env.YANDEX_SPEECHKIT_KEY;
  const postData = querystring.stringify({
    text: text.slice(0, 5000), lang: 'ru-RU', voice, speed, format: 'mp3', sampleRateHertz: '48000'
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'tts.api.cloud.yandex.net',
      path: '/speech/v1/tts:synthesize',
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req2 = https.request(options, (r) => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (r.statusCode !== 200) {
          res.status(r.statusCode).json({ error: buf.toString().slice(0, 300) });
        } else {
          res.setHeader('Content-Type', 'audio/mpeg');
          res.send(buf);
        }
        resolve();
      });
    });

    req2.on('error', e => { res.status(500).json({ error: e.message }); resolve(); });
    req2.write(postData);
    req2.end();
  });
};
