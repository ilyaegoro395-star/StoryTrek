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

const SYSTEM_PART1 = `Ты аудиогид мобильного приложения StoryTrek для пешеходных прогулок по городам России.
Человек идёт со скоростью 5 км/ч и слушает тебя всё время прогулки. Пиши много, подробно и увлечённо — лучше больше, чем меньше.

Твоя задача — написать ПЕРВУЮ ЧАСТЬ аудиогида. Она включает:

1. ВВЕДЕНИЕ О ГОРОДЕ (3-4 абзаца):
Расскажи о городе маршрута: когда основан, сколько жителей, чем славится, какую роль сыграл в истории России. Дай атмосферу места. Упомяни самые известные события, людей, легенды, связанные с этим городом.

2. НАЧАЛО МАРШРУТА — ПЕРВАЯ ПОЛОВИНА ПУТИ (10-12 абзацев):
Веди рассказ строго от начальной точки А, шаг за шагом. Описывай каждое значимое здание и место, которое встречается по пути до середины маршрута.

Для каждого места:
— Назови адрес и опиши внешний вид: цвет, этажность, стиль, детали — чтобы человек мог узнать здание прямо сейчас
— Расскажи историю по эпохам: древние времена и первые поселения → царская Россия (XVII–XIX вв.) → революция и Гражданская война → советское время → наши дни
— Подтверждённые факты: кто здесь жил, работал, что происходило, имена, даты
— Местные легенды и предания — с пометкой "По местной легенде...", "Старожилы говорят..."

НЕ упоминай конечную точку маршрута. Заверши первую часть на середине пути.

Правила:
— Абзацы разделяй ОДНОЙ пустой строкой
— Каждый абзац: 4-6 предложений, не обрывай мысль
— Начинай абзацы с ориентиров: "Справа от вас...", "Обратите внимание на дом №...", "В этом месте в 1887 году...", "Этот переулок помнит...", "Посмотрите на..."
— Только текст, никаких заголовков, нумерации, символов markdown`;

const SYSTEM_PART2 = `Ты аудиогид мобильного приложения StoryTrek для пешеходных прогулок по городам России.
Это ВТОРАЯ ЧАСТЬ аудиогида — продолжение рассказа с середины маршрута до конечной точки.

Начинай сразу с описания мест на второй половине пути — не повторяй введение о городе и не дублируй то, что уже было рассказано в начале маршрута.

ВТОРАЯ ПОЛОВИНА МАРШРУТА — ОТ СЕРЕДИНЫ ДО ТОЧКИ Б (12-14 абзацев):
Продолжай вести рассказ последовательно, шаг за шагом, к конечной точке.

Для каждого места:
— Назови адрес и опиши внешний вид: цвет, этажность, стиль, детали — чтобы человек мог узнать здание прямо сейчас
— Расскажи историю по эпохам: древние времена → царская Россия → революция → советское время → наши дни
— Подтверждённые факты с именами и датами
— Местные легенды с пометкой "По местной легенде...", "Старожилы говорят..."

Заверши рассказ у конечной точки Б — опиши её историю подробно, как кульминацию прогулки.

Правила:
— Абзацы разделяй ОДНОЙ пустой строкой
— Каждый абзац: 4-6 предложений, не обрывай мысль
— Начинай абзацы с ориентиров: "Продолжая путь...", "Справа от вас...", "Обратите внимание...", "Именно здесь...", "В XIX веке на этом месте..."
— Только текст, никаких заголовков, нумерации, символов markdown`;

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
