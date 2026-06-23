const https = require('https');

function callGPT(systemText, userText, apiKey, folderId, maxTokens = '8000') {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      modelUri: `gpt://${folderId}/yandexgpt`,
      completionOptions: { stream: false, temperature: 0.5, maxTokens },
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { res.status(405).end(); return; }

  const { routeDescription, routeDistance = 2000, transportMode = 'foot', storyPoints = [] } = req.body || {};
  if (!routeDescription) { res.status(400).json({ error: 'routeDescription required' }); return; }

  const API_KEY   = process.env.YANDEX_GPT_KEY;
  const FOLDER_ID = process.env.YANDEX_FOLDER_ID;

  const isBike  = transportMode === 'bike';
  const modeLbl = isBike ? 'велосипед' : 'пешком';

  // Real objects found along the route (from Wikipedia geosearch on the client) —
  // these are the factual backbone of the guide.
  const pts = Array.isArray(storyPoints)
    ? storyPoints.filter(p => p && p.name).map(p => ({ name: p.name, facts: (p.facts || '').trim() }))
    : [];

  const ACCURACY = `
ДОСТОВЕРНОСТЬ — СТРОГО:
— Опирайся ТОЛЬКО на справки из открытых источников, приведённые ниже, и на общеизвестные исторические факты о городе
— НЕЛЬЗЯ выдумывать объекты, памятники, здания, которых нет в списке точек
— Если между точками нет данных — расскажи об общем характере застройки и эпохе, или о связанном с городом известном человеке
— Легенды только с оговоркой "по преданию"
— Если объекта уже нет (снесён, утрачен) — это самое интересное: расскажи, что здесь было раньше и что с ним стало, опираясь на справку
— Лучше честно описать характер места, чем придумать несуществующий объект`;

  const STYLE = `Стиль: живой устный рассказ экскурсовода, тёплый и увлекательный, как в izi.travel. Обращайся к слушателю на «вы».
Оформление: абзацы через пустую строку, 3-5 предложений. Только чистый текст — никакого markdown, звёздочек, решёток, списков.`;

  let text = '';

  if (pts.length >= 2) {
    // ───── GUIDE GROUNDED IN REAL OBJECTS ─────
    const half = Math.ceil(pts.length / 2);
    const fmt = (arr, offset) => arr.map((p, i) =>
      `${offset + i + 1}. ${p.name}${p.facts ? `\nСправка: ${p.facts}` : ''}`).join('\n\n');

    const firstList  = fmt(pts.slice(0, half), 0);
    const secondList = fmt(pts.slice(half), half);

    const SYS1 = `Ты аудиогид StoryTrek для прогулок ${modeLbl} по городам России.
Маршрут реально построен по карте и проходит МИМО перечисленных ниже реальных объектов, расположенных СТРОГО в порядке движения. Длина маршрута ~${routeDistance} м.
${ACCURACY}

ЗАДАЧА — ПЕРВАЯ ЧАСТЬ аудиогида:
1. Краткое вступление о городе (2 абзаца) — основание, роль в истории, характер. Только достоверное.
2. Затем веди слушателя по маршруту от объекта к объекту СТРОГО по порядку. О КАЖДОМ объекте — отдельный фрагмент рассказа, опираясь на справку: что это, чем интересно, его история. Связывай объекты переходами ("пройдя дальше...", "впереди показывается...").

${STYLE}`;

    const SYS2 = `Ты аудиогид StoryTrek для прогулок ${modeLbl} по городам России. Это ВТОРАЯ ЧАСТЬ — продолжение прогулки. Не повторяй вступление о городе.
Маршрут проходит мимо перечисленных реальных объектов СТРОГО в порядке движения.
${ACCURACY}

ЗАДАЧА: продолжи вести слушателя по маршруту от объекта к объекту по порядку. О КАЖДОМ — отдельный фрагмент, опираясь на справку. Последний объект — кульминация прогулки.

${STYLE}`;

    const user1 = `Маршрут:\n${routeDescription}\n\nОбъекты на маршруте (по порядку движения):\n\n${firstList}`;
    const user2 = `Маршрут:\n${routeDescription}\n\nОбъекты на маршруте (по порядку движения):\n\n${secondList}`;

    const [part1, part2] = await Promise.all([
      callGPT(SYS1, user1, API_KEY, FOLDER_ID),
      secondList ? callGPT(SYS2, user2, API_KEY, FOLDER_ID) : Promise.resolve('')
    ]);
    text = [part1, part2].filter(Boolean).join('\n\n');

  } else {
    // ───── FALLBACK: no objects found on route — describe city + route generally ─────
    const SYS = `Ты аудиогид StoryTrek для прогулок ${modeLbl} по городам России. Длина маршрута ~${routeDistance} м.
${ACCURACY}

Вдоль этого маршрута не найдено известных объектов в открытых источниках. Поэтому:
1. Расскажи о городе (основание, история, характер) — достоверно.
2. Опиши общий характер района и застройки по ходу маршрута, эпохи, и при возможности — известных людей города.
Не выдумывай конкретные памятники и здания.

${STYLE}`;
    text = await callGPT(SYS, `Маршрут:\n${routeDescription}`, API_KEY, FOLDER_ID);
  }

  if (!text) {
    res.status(500).json({ error: 'GPT returned empty' });
    return;
  }

  res.status(200).json({ text });
};
