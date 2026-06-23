const https = require('https');

function callGPT(systemText, userText, apiKey, folderId, maxTokens = '8000') {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      modelUri: `gpt://${folderId}/yandexgpt`,
      completionOptions: { stream: false, temperature: 0.6, maxTokens },
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

  const { routeDescription, routeDistance = 2000, transportMode = 'foot' } = req.body || {};
  if (!routeDescription) { res.status(400).json({ error: 'routeDescription required' }); return; }

  const API_KEY   = process.env.YANDEX_GPT_KEY;
  const FOLDER_ID = process.env.YANDEX_FOLDER_ID;

  const isBike  = transportMode === 'bike';
  const segDist = isBike ? 1000 : 150;
  const numSegs = Math.min(Math.max(Math.round(routeDistance / segDist), 4), 22);
  const half    = Math.ceil(numSegs / 2);
  const modeLbl = isBike ? 'велосипед' : 'пешком';

  const ACCURACY = `
ДОСТОВЕРНОСТЬ — АБСОЛЮТНЫЙ ЗАПРЕТ НА ВЫДУМКУ:
— НЕЛЬЗЯ называть конкретные памятники, кафе, магазины, спортобъекты, здания — если ты не знаешь точно, что они существуют на этом маршруте
— НЕЛЬЗЯ описывать обычный жилой дом как исторический, культурный или коммерческий объект без проверенных данных
— НЕЛЬЗЯ называть улицы, которых нет в данном маршруте
— Если нет достоверных данных о конкретном здании — расскажи: 1) что было здесь ДО строительства (деревня, поле, завод, дорога), 2) к какому архитектурному стилю и эпохе относится застройка вокруг
— Для идентификации здания: назови его цвет, этажность, архитектурный стиль (хрущёвка, сталинский ампир, дореволюционный купеческий дом, типовая панелька 70-х)
— Легенды и предания ТОЛЬКО с оговоркой: "по преданию", "рассказывают, что"
— Используй только факты из открытых источников: Википедия, краеведческие данные, исторические карты
— Лучше честно сказать "здесь типовой советский квартал" чем придумать несуществующий объект`;

  const PEOPLE = `
ИЗВЕСТНЫЕ ЛЮДИ ГОРОДА И РЕГИОНА:
— Упоминай реальных людей, связанных с этим городом или краем: художников, учёных, предпринимателей, политиков, военных деятелей
— Рассказывай их истории кратко и живо — где родились, чем прославились, как связаны с этим местом
— Только реально существовавших людей, о которых есть достоверные данные
— Привязывай рассказ к конкретным местам на маршруте если возможно, иначе — к общей истории города`;

  const SYSP_POINTS = `Ты аудиогид StoryTrek. Для данного маршрута найди 8–12 реально существующих исторических объектов для отображения на карте.

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
— Только объекты с историческим, архитектурным или культурным значением: памятники, монументы, церкви, соборы, храмы, монастыри, усадьбы, исторические здания дореволюционной постройки, объекты из реестра культурного наследия
— СТРОГО ЗАПРЕЩЕНО включать: торговые центры, современные офисные здания, обычные жилые дома, рестораны, магазины, развлекательные заведения
— Только объекты, расположенные на маршруте или в радиусе 100 метров от него
— Только реально существующие объекты, о которых есть данные в Википедии или краеведческих источниках
— Расположи точки в порядке от начала к концу маршрута

Для поля wiki: укажи точное название статьи в русской Википедии (ru.wikipedia.org) — это будет использовано для получения фото. Если статьи нет — оставь пустую строку.

Верни ТОЛЬКО валидный JSON массив — никакого текста до и после:
[{"name":"Название объекта","address":"Полный адрес: улица + номер или название + город","story":"1–2 предложения — самый интересный исторический факт","wiki":"Точное название статьи в русской Википедии или пустая строка"}]

ТОЛЬКО JSON, никакого другого текста.`;

  const userMsg = `Составь аудиогид для маршрута:\n${routeDescription}`;

  // Step 1: generate story points first
  const pointsRaw = await callGPT(SYSP_POINTS, userMsg, API_KEY, FOLDER_ID, '3000');

  let storyPoints = [];
  try {
    const raw = (pointsRaw || '').trim()
      .replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
      .replace(/^[^\[]*(\[[\s\S]*\])[^\]]*$/, '$1');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) storyPoints = parsed.slice(0, 12);
  } catch (e) {
    console.error('story points parse error:', e.message, (pointsRaw || '').slice(0, 200));
  }

  // Build a compact list of story points for guide context
  const pointsList = storyPoints.length
    ? '\n\nОТМЕЧЕННЫЕ ТОЧКИ НА КАРТЕ (упомяни каждую в аудиогиде):\n' +
      storyPoints.map((p, i) => `${i+1}. ${p.name} — ${p.story}`).join('\n')
    : '';

  const SYSP1 = `Ты аудиогид StoryTrek для прогулок по городам России.
Режим: ${modeLbl}. Длина маршрута: ${routeDistance} м. Один сегмент = ~${segDist} м. Первая часть: ${half} сегментов.
${ACCURACY}
${PEOPLE}

ПЕРВАЯ ЧАСТЬ аудиогида:

1. ГОРОД (2-3 абзаца) — основание, роль в истории России, характерные особенности. Только достоверные факты.

2. СЕГМЕНТЫ 1–${half} — от точки отправления строго по порядку:
Для каждого сегмента:
— Открывай с расстояния: "Первые ${segDist} метров...", "От ${segDist} до ${segDist*2} метров..."
— Визуальная идентификация: цвет, этажность, архитектурный стиль — чтобы слушатель узнал место прямо сейчас
— История места: только достоверное. Если нет данных — что было здесь ДО, или стиль и эпоха застройки
— Известные люди города/края — уместно вплети рассказ об одном-двух на протяжении маршрута
— Когда маршрут проходит мимо отмеченных точек на карте — обязательно упомяни их по имени

Не упоминай конечную точку. Заверши на ~${half * segDist} м от старта.

Оформление: абзацы через пустую строку, 3-5 предложений. Только чистый текст — никакого markdown, звёздочек, решёток, списков.`;

  const SYSP2 = `Ты аудиогид StoryTrek для прогулок по городам России.
ВТОРАЯ ЧАСТЬ — продолжение с ~${half * segDist} м до конца маршрута. Не повторяй вступление о городе.
${ACCURACY}
${PEOPLE}

СЕГМЕНТЫ ${half+1}–${numSegs}:
— Открывай с расстояния: "На отметке ${half * segDist} метров...", "Следующие ${segDist} метров..."
— Визуальная идентификация: цвет, этажность, стиль
— История только достоверная; иначе — что было ДО, стиль эпохи
— Можно упомянуть ещё одного известного человека города, если не был упомянут в первой части
— Финальный сегмент — история конечной точки как кульминация прогулки
— Когда маршрут проходит мимо отмеченных точек на карте — обязательно упомяни их по имени

Оформление: абзацы через пустую строку, 3-5 предложений. Только чистый текст — никакого markdown, звёздочек, решёток, списков.`;

  // Step 2: generate both guide parts with story points context
  const userMsgWithPoints = userMsg + pointsList;

  const [part1, part2] = await Promise.all([
    callGPT(SYSP1, userMsgWithPoints, API_KEY, FOLDER_ID),
    callGPT(SYSP2, userMsgWithPoints, API_KEY, FOLDER_ID)
  ]);

  const text = [part1, part2].filter(Boolean).join('\n\n');
  if (!text) {
    res.status(500).json({ error: 'Both GPT calls returned empty' });
    return;
  }

  res.status(200).json({ text, storyPoints });
};
