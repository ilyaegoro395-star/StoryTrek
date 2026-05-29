const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { res.status(405).end(); return; }

  const { routeDescription } = req.body || {};
  if (!routeDescription) { res.status(400).json({ error: 'routeDescription required' }); return; }

  const API_KEY   = process.env.YANDEX_GPT_KEY;
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
      { role: 'user', text: `Составь аудиогид для маршрута:\n${routeDescription}` }
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

    const req2 = https.request(options, (r) => {
      let data = '';
      r.on('data', c => data += c);
      r.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed.result?.alternatives?.[0]?.message?.text || '';
          if (!text) console.error('YandexGPT empty:', JSON.stringify(parsed));
          res.status(200).json({ text });
        } catch (e) {
          res.status(500).json({ error: 'Parse error', raw: data.slice(0, 300) });
        }
        resolve();
      });
    });

    req2.on('error', e => { res.status(500).json({ error: e.message }); resolve(); });
    req2.write(body);
    req2.end();
  });
};
