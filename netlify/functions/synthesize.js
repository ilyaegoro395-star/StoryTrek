const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders() };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, body: 'Method Not Allowed' };

  const { text, voice = 'alena', speed = '0.9' } = JSON.parse(event.body || '{}');
  if (!text) return { statusCode: 400, body: JSON.stringify({ error: 'text required' }) };

  const API_KEY   = process.env.YANDEX_SPEECHKIT_KEY;
  const FOLDER_ID = process.env.YANDEX_FOLDER_ID;

  const body = JSON.stringify({
    text: text.slice(0, 5000),
    outputAudioSpec: { containerAudio: { containerAudioType: 'MP3' } },
    hints: [
      { voice },
      { role: 'good' },
      { speed: parseFloat(speed) }
    ],
    folderId: FOLDER_ID
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'tts.api.cloud.yandex.net',
      path: '/tts/v3/utteranceSynthesis',
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (res.statusCode !== 200) {
          resolve({ statusCode: res.statusCode, headers: corsHeaders(), body: raw.slice(0, 300) });
          return;
        }
        const audioParts = [];
        for (const line of raw.split('\n')) {
          const t = line.trim();
          if (!t) continue;
          try {
            const obj  = JSON.parse(t);
            const data = obj.result && obj.result.audioChunk && obj.result.audioChunk.data;
            if (data) audioParts.push(Buffer.from(data, 'base64'));
          } catch { }
        }
        if (!audioParts.length) {
          resolve({ statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'No audio', raw: raw.slice(0, 200) }) });
          return;
        }
        resolve({
          statusCode: 200,
          headers: { 'Content-Type': 'audio/mpeg', ...corsHeaders() },
          body: Buffer.concat(audioParts).toString('base64'),
          isBase64Encoded: true
        });
      });
    });

    req.on('error', e => resolve({ statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) }));
    req.write(body);
    req.end();
  });
};

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
