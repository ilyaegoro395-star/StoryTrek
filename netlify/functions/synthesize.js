const https = require('https');

// SpeechKit v1: documented 5000-byte limit per request
// Russian char = 2 UTF-8 bytes → safe limit is ~2000 chars
const MAX_CHARS = 1500;

function splitToChunks(text) {
  if (text.length <= MAX_CHARS) return [text];

  const chunks = [];
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

  // Hard fallback: slice any chunk still over the limit
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

function synthesizeChunk(text, voice, speed, lang, apiKey, folderId) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      text,
      lang,
      voice,
      format:   'mp3',
      speed:    String(speed),
      folderId
    });
    const body = params.toString();

    const options = {
      hostname: 'tts.api.cloud.yandex.net',
      path:     '/speech/v1/tts:synthesize',
      method:   'POST',
      headers:  {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type':  'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (r) => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        if (r.statusCode !== 200) {
          const raw = Buffer.concat(chunks).toString();
          console.error('SpeechKit v1 error:', r.statusCode, raw.slice(0, 300));
          resolve({ error: `${r.statusCode}: ${raw.slice(0, 200)}` });
          return;
        }
        resolve({ audio: Buffer.concat(chunks) });
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

  const { text, voice = 'ermil', speed = '0.88', lang = 'ru-RU' } = req.body || {};
  if (!text) { res.status(400).json({ error: 'text required' }); return; }

  const API_KEY   = process.env.YANDEX_SPEECHKIT_KEY;
  const FOLDER_ID = process.env.YANDEX_FOLDER_ID;

  const textChunks = splitToChunks(text);
  console.log(`TTS v1: ${textChunks.length} chunks, total ${text.length} chars, lang ${lang}`);

  const results = await Promise.all(
    textChunks.map(chunk => synthesizeChunk(chunk, voice, speed, lang, API_KEY, FOLDER_ID))
  );

  const allAudio = [];
  for (const r of results) {
    if (r.error) { res.status(400).json({ error: r.error }); return; }
    allAudio.push(r.audio);
  }

  if (!allAudio.length) { res.status(500).json({ error: 'No audio data' }); return; }

  res.setHeader('Content-Type', 'audio/mpeg');
  res.send(Buffer.concat(allAudio));
};
