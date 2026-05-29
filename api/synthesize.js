const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { res.status(405).end(); return; }

  const { text, voice = 'ermil', speed = '0.88' } = req.body || {};
  if (!text) { res.status(400).json({ error: 'text required' }); return; }

  const API_KEY   = process.env.YANDEX_SPEECHKIT_KEY;
  const FOLDER_ID = process.env.YANDEX_FOLDER_ID;

  /* роли поддерживаются не всеми голосами */
  const roleByVoice = { alena: 'good', zahar: 'good', ermil: 'good',
                        jane: 'good', masha: 'good', marina: 'friendly' };
  const role = roleByVoice[voice];

  const hints = [
    { voice },
    ...(role ? [{ role }] : []),
    { speed: parseFloat(speed) }
  ];

  const body = JSON.stringify({
    text: text.slice(0, 5000),
    outputAudioSpec: { containerAudio: { containerAudioType: 'MP3' } },
    hints,
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
          res.status(500).json({ error: 'No audio data', raw: raw.slice(0, 200) });
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
