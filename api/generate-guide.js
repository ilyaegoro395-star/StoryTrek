const https = require('https');

function callGPT(systemText, userText, apiKey, folderId) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      modelUri: `gpt://${folderId}/yandexgpt`,
      completionOptions: { stream: false, temperature: 0.7, maxTokens: '8000' },
      messages: [
        { role: 'system', text: systemText },
        { role: 'user',   text: userText }
      ]
    });

    const options = {
      hostname: 'llm.api.cloud.yandex.net',
      path: '/foundationModels/v1/completion',
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed.result?.alternatives?.[0]?.message?.text || '';
          if (!text) console.error('GPT empty response:', data.slice(0, 400));
          resolve(text);
        } catch (e) {
          console.error('GPT parse error:', e.message, data.slice(0, 200));
          resolve('');
        }
      });
    });

    req.on('error', e => { console.error('GPT request error:', e.message); resolve(''); });
    req.write(body);
    req.end();
  });
}

const ACCURACY = `
ДОСТОВЕРНОСТЬ — ВАЖНЕЙШЕЕ ПРАВИЛО:
— Рассказывай только то, что достоверно известно об этих местах
— Никогда не придумывай имена, даты, события — если не уверен, не упоминай конкретику
— Если знаешь общий контекст эпохи, но не конкретное здание — говори об эпохе, без привязки
— Легенды и предания помечай: "По преданию...", "Согласно местной легенде...", "Рассказывают, что..."
— Достоверные факты называй уверенно; неизвестное — с оговоркой "предположительно", "возможно"
— Лучше меньше, но точно, чем много и неправда`;

const SYSTEM_PART1 = `Ты аудиогид StoryTrek для пешеходных прогулок по городам России.
Человек идёт ~5 км/ч. Пиши подробно и увлечённо — рассказ должен длиться всю прогулку.
${ACCURACY}

ПЕРВАЯ ЧАСТЬ аудиогида:

1. ГОРОД (3-4 абзаца) — основание, население, роль в истории России, известные факты и люди.

2. ПЕРВАЯ ПОЛОВИНА МАРШРУТА (10-12 абзацев) — от точки А строго шаг за шагом до середины пути.

Для каждого здания/места:
— Адрес и внешний вид: цвет, этажность, стиль, детали — чтобы человек узнал прямо сейчас
— История по эпохам (только достоверное): поселения → царская Россия → революция → СССР → наши дни
— Точные факты с именами и датами — только если уверен в их правильности
— Легенды — с обязательной пометкой

НЕ упоминай конечную точку. Заверши на середине пути.

Оформление: абзацы через пустую строку, 4-6 предложений в абзаце, начинай с пространственного ориентира, только текст без символов.`;

const SYSTEM_PART2 = `Ты аудиогид StoryTrek для пешеходных прогулок по городам России.
Это ВТОРАЯ ЧАСТЬ — продолжение с середины маршрута до конца. Не повторяй введение о городе.
${ACCURACY}

ВТОРАЯ ПОЛОВИНА МАРШРУТА (12-14 абзацев) — от середины до конечной точки, строго последовательно.

Для каждого здания/места:
— Адрес и внешний вид: цвет, этажность, стиль, детали
— История по эпохам (только достоверное)
— Точные факты — только если уверен
— Легенды — с обязательной пометкой

Заверши у конечной точки — её история как кульминация прогулки.

Оформление: абзацы через пустую строку, 4-6 предложений, начинай с пространственного ориентира, только текст без символов.`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { res.status(405).end(); return; }

  const { routeDescription } = req.body || {};
  if (!routeDescription) { res.status(400).json({ error: 'routeDescription required' }); return; }

  const API_KEY   = process.env.YANDEX_GPT_KEY;
  const FOLDER_ID = process.env.YANDEX_FOLDER_ID;

  const userMsg = `Составь аудиогид для маршрута:\n${routeDescription}`;

  const [part1, part2] = await Promise.all([
    callGPT(SYSTEM_PART1, userMsg, API_KEY, FOLDER_ID),
    callGPT(SYSTEM_PART2, userMsg, API_KEY, FOLDER_ID)
  ]);

  const text = [part1, part2].filter(Boolean).join('\n\n');
  if (!text) {
    res.status(500).json({ error: 'Both GPT calls returned empty' });
    return;
  }

  res.status(200).json({ text });
};
