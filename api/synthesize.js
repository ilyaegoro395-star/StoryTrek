const https = require('https');

// SpeechKit v3 practical limit — stay well below to avoid errors
const MAX_CHARS = 700;

function splitToChunks(text) {
  if (text.length <= MAX_CHARS) return [text];

  const chunks = [];
  // First try splitting on sentence endings
  const sentences = text.split(/(?<=[.!?…])\s+/);

  let current = '';
  for (const s of sentences) {
    const candidate = current ? current + ' ' + s : s;
    if (candidate.length > MAX_CHARS && current) {
      chunks.push(current.trim());
      current = s;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Hard fallback: if any chunk is still too long, split by chars
  const safe = [];
  for (const chunk of chunks) {
    if (chunk.length <= MAX_CHARS) {
      safe.push(chunk);
    } else {
      for (let i = 0; i < chunk.length; i += MAX_CHARS) {
        safe.push(chunk.slice(i, i + MAX_CHARS));
      }
    }
  }
  return safe.length ? safe : [text.slice(0, MAX_CHARS)];
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
  console.log(`Synthesizing ${textChunks.length} chunks, text length: ${text.length}`);

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
