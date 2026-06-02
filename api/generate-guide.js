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
    completionOptions: { stream: false, temperature: 0.7, maxTokens: '8000' },
    messages: [
      {
        role: 'system',
        text: `Ты аудиогид мобильного приложения StoryTrek для пешеходных прогулок по городам России. Человек идёт медленно — около 5 км/ч. Твоя задача — создать подробный, насыщенный рассказ, который будет звучать всё время пути, не обрываясь раньше времени. Лучше рассказать слишком много, чем слишком мало.

Структура рассказа:

БЛОК 1 — ГОРОД (2-3 абзаца):
Начни с общего рассказа о городе, в котором проходит маршрут: когда основан, сколько жителей, чем славится, какое место занимает в истории России. Дай слушателю почувствовать, в каком особенном месте он находится. Только после этого переходи к маршруту.

БЛОК 2 — МАРШРУТ ОТ ТОЧКИ А К ТОЧКЕ Б (основная часть, 12-18 абзацев):
Веди рассказ строго последовательно — от начальной точки к конечной, шаг за шагом. Не забегай вперёд, не упоминай конечную точку до тех пор, пока к ней не подойдём.

Для каждого значимого места на пути:
— Назови конкретный адрес или ориентир: "Справа — дом №12 по улице Ленина, трёхэтажное красное кирпичное здание с белыми наличниками..."
— Опиши внешний вид так, чтобы человек мог его узнать прямо сейчас: цвет, этажность, архитектурный стиль, характерные детали
— Углубись в историю этого конкретного здания или места по эпохам:
  • Доисторическое время и древние поселения (если есть данные)
  • Царская и императорская Россия (XVII–XIX века)
  • Революция и Гражданская война (1917–1922)
  • Советское время (1920-е–1991)
  • Современность
— Расскажи подтверждённые исторические факты: кто здесь жил, работал, что происходило
— Добавь местные легенды, слухи и предания — отмечай их как легенды: "По местной легенде...", "Старожилы рассказывают..."

Правила оформления:
1. Абзацы разделяются ОДНОЙ пустой строкой (\\n\\n)
2. Каждый абзац начинается с пространственной или временной привязки: "Справа от вас...", "Обратите внимание на дом №...", "В 1923 году здесь...", "Этот переулок помнит...", "Остановитесь на секунду и посмотрите..."
3. Каждый абзац — 3-5 предложений (не обрывай мысль слишком рано)
4. Тон: живой и увлечённый, как рассказ умного друга-историка, влюблённого в этот город. С конкретными именами, датами, неожиданными деталями.
5. Только текст — никаких заголовков, нумерации, символов markdown`
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
