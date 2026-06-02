const https = require('https');

// SpeechKit v3 limit is ~4000 UTF-8 bytes; Russian chars = 2 bytes each → ~2000 chars safe limit
const MAX_BYTES = 3800;

function splitToChunks(text) {
  if (Buffer.byteLength(text, 'utf8') <= MAX_BYTES) return [text];
  // Split on sentence boundaries
  const parts = text.split(/(?<=[.!?…])\s+/);
  const chunks = [];
  let current = '';
  for (const part of parts) {
    const candidate = current ? current + ' ' + part : part;
    if (Buffer.byteLength(candidate, 'utf8') > MAX_BYTES && current) {
      chunks.push(current.trim());
      current = part;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text.slice(0, 1800)];
}

function synthesizeChunk(text, hints, apiKey, folderId) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      text,
      outputAudioSpec: { containerAudio: { containerAudioType: 'MP3' } },
      hints,
      folderId
    });

    const options = {
      hostname: 'tts.api.cloud.yandex.net',
      path: '/tts/v3/utteranceSynthesis',
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (r) => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (r.statusCode !== 200) {
          console.error('SpeechKit error:', r.statusCode, raw.slice(0, 300));
          resolve({ error: `${r.statusCode}: ${raw.slice(0, 200)}` });
          return;
        }
        const audioParts = [];
        for (const line of raw.split('\n')) {
          const t = line.trim();
          if (!t) continue;
          try {
            const obj = JSON.parse(t);
            const data = obj.result && obj.result.audioChunk && obj.result.audioChunk.data;
            if (data) audioParts.push(Buffer.from(data, 'base64'));
          } catch { }
        }
        resolve({ audio: audioParts });
      });
    });

    req.on('error', e => resolve({ error: e.message }));
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { res.status(405).end(); return; }

  const { text, voice = 'ermil', speed = '0.88' } = req.body || {};
  if (!text) { res.status(400).json({ error: 'text required' }); return; }

  const API_KEY   = process.env.YANDEX_SPEECHKIT_KEY;
  const FOLDER_ID = process.env.YANDEX_FOLDER_ID;

  const roleByVoice = { alena: 'good', zahar: 'good', ermil: 'good',
                        jane: 'good', masha: 'good', marina: 'friendly' };
  const role = roleByVoice[voice];
  const hints = [
    { voice },
    ...(role ? [{ role }] : []),
    { speed: parseFloat(speed) }
  ];

  const textChunks = splitToChunks(text);
  const results = await Promise.all(textChunks.map(chunk => synthesizeChunk(chunk, hints, API_KEY, FOLDER_ID)));

  const allAudio = [];
  for (const r of results) {
    if (r.error) { res.status(400).json({ error: r.error }); return; }
    allAudio.push(...r.audio);
  }

  if (!allAudio.length) { res.status(500).json({ error: 'No audio data' }); return; }

  res.setHeader('Content-Type', 'audio/mpeg');
  res.send(Buffer.concat(allAudio));
};
