const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders() };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { routeDescription } = JSON.parse(event.body || '{}');
  if (!routeDescription) {
    return { statusCode: 400, body: JSON.stringify({ error: 'routeDescription required' }) };
  }

  const API_KEY = process.env.YANDEX_GPT_KEY;
  const FOLDER_ID = process.env.YANDEX_FOLDER_ID;

  const body = JSON.stringify({
    modelUri: `gpt://${FOLDER_ID}/yandexgpt`,
    completionOptions: { stream: false, temperature: 0.7, maxTokens: '3000' },
    messages: [
      {
        role: 'system',
        text: `Ты аудиогид мобильного приложения StoryTrek для пешеходных прогулок по городам России. Твоя задача — погрузить слушателя в историю места, сделать прогулку путешествием во времени.

Правила:
1. Раздели текст на 8-10 абзацев, разделённых ОДНОЙ пустой строкой (\\n\\n)
2. Первые 1-2 абзаца: кратко описываешь что окружает человека прямо сейчас — улицы, здания, атмосфера
3. Остальные абзацы: глубокое погружение в историю — что здесь было 100, 200, 500 лет назад, кто жил и ходил по этим местам, какие судьбоносные события здесь разворачивались, что было утрачено и что сохранилось
4. Каждый абзац начинается с пространственной ориентации или временного перехода: "Справа от вас...", "Двести лет назад на этом месте...", "В XIX веке здесь...", "Представьте себе...", "Этот переулок помнит...", "Именно здесь..."
5. Каждый абзац: 2-3 предложения, не более
6. Тон: увлекательный и живой, как рассказ умного друга-историка, влюблённого в этот город — с деталями, именами, неожиданными фактами
7. Только текст — никаких заголовков, нумерации, markdown-символов`
      },
      {
        role: 'user',
        text: `Составь аудиогид для маршрута:\n${routeDescription}`
      }
    ]
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'llm.api.cloud.yandex.net',
      path: '/foundationModels/v1/completion',
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          console.log('YandexGPT raw response:', data.slice(0, 500));
          const parsed = JSON.parse(data);
          const text = parsed.result?.alternatives?.[0]?.message?.text || '';
          if (!text) {
            console.error('YandexGPT empty text, full response:', JSON.stringify(parsed));
          }
          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders() },
            body: JSON.stringify({ text, _debug: text ? undefined : parsed })
          });
        } catch (e) {
          resolve({
            statusCode: 500,
            headers: corsHeaders(),
            body: JSON.stringify({ error: 'Parse error', raw: data.slice(0, 500) })
          });
        }
      });
    });

    req.on('error', e => resolve({
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: e.message })
    }));

    req.write(body);
    req.end();
  });
};

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
