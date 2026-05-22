const https = require('https');
const querystring = require('querystring');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders() };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { text, voice = 'alena', speed = '1.0' } = JSON.parse(event.body || '{}');
  if (!text) return { statusCode: 400, body: JSON.stringify({ error: 'text required' }) };

  const API_KEY = process.env.YANDEX_SPEECHKIT_KEY;

  const postData = querystring.stringify({
    text: text.slice(0, 5000),
    lang: 'ru-RU',
    voice,
    speed,
    format: 'mp3',
    sampleRateHertz: '48000'
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

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode !== 200) {
          resolve({
            statusCode: res.statusCode,
            headers: corsHeaders(),
            body: JSON.stringify({ error: buf.toString().slice(0, 300) })
          });
          return;
        }
        resolve({
          statusCode: 200,
          headers: { 'Content-Type': 'audio/mpeg', ...corsHeaders() },
          body: buf.toString('base64'),
          isBase64Encoded: true
        });
      });
    });

    req.on('error', e => resolve({
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: e.message })
    }));

    req.write(postData);
    req.end();
  });
};

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
