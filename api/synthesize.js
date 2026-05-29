const https = require('https');

const VOICE_ID = 'BE01v3e9mZOvL75SsISY'; // Наталья Вершинина

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { res.status(405).end(); return; }

  const { text } = req.body || {};
  if (!text) { res.status(400).json({ error: 'text required' }); return; }

  const API_KEY = process.env.ELEVENLABS_API_KEY;

  const body = JSON.stringify({
    text: text.slice(0, 5000),
    model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true }
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${VOICE_ID}`,
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req2 = https.request(options, (r) => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (r.statusCode !== 200) {
          console.error('ElevenLabs error:', r.statusCode, buf.toString().slice(0, 300));
          res.status(r.statusCode).json({ error: buf.toString().slice(0, 300) });
        } else {
          res.setHeader('Content-Type', 'audio/mpeg');
          res.send(buf);
        }
        resolve();
      });
    });

    req2.on('error', e => { res.status(500).json({ error: e.message }); resolve(); });
    req2.write(body);
    req2.end();
  });
};
