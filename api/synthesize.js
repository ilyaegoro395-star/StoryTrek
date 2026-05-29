const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { res.status(405).end(); return; }

  const { text, voice = 'alena', speed = '0.9' } = req.body || {};
  if (!text) { res.status(400).json({ error: 'text required' }); return; }

  const API_KEY   = process.env.YANDEX_SPEECHKIT_KEY;
  const FOLDER_ID = process.env.YANDEX_FOLDER_ID;

  /* SpeechKit v3 — нейросетевой синтез, заметно лучше v1 */
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

    const req2 = https.request(options, (r) => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        const raw = Buffer.concat(chunks).toString();

        if (r.statusCode !== 200) {
          console.error('SpeechKit v3 error:', r.statusCode, raw.slice(0, 300));
          res.status(r.statusCode).json({ error: raw.slice(0, 300) });
          resolve(); return;
        }

        /* v3 отдаёт стриминг: каждая строка — отдельный JSON с audioChunk.data (base64) */
        const audioParts = [];
        for (const line of raw.split('\n')) {
          const t = line.trim();
          if (!t) continue;
          try {
            const obj  = JSON.parse(t);
            const data = obj.result && obj.result.audioChunk && obj.result.audioChunk.data;
            if (data) audioParts.push(Buffer.from(data, 'base64'));
          } catch { /* пропускаем невалидные строки */ }
        }

        if (!audioParts.length) {
          console.error('SpeechKit v3 no audio chunks, raw:', raw.slice(0, 300));
          res.status(500).json({ error: 'No audio data', raw: raw.slice(0, 300) });
          resolve(); return;
        }

        res.setHeader('Content-Type', 'audio/mpeg');
        res.send(Buffer.concat(audioParts));
        resolve();
      });
    });

    req2.on('error', e => { res.status(500).json({ error: e.message }); resolve(); });
    req2.write(body);
    req2.end();
  });
};
