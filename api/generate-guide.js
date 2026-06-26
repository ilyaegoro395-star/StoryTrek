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

  const { routeDescription, routeDistance = 2000, transportMode = 'foot', storyPoints = [], guideLanguage = 'ru' } = req.body || {};
  if (!routeDescription) { res.status(400).json({ error: 'routeDescription required' }); return; }

  const API_KEY   = process.env.YANDEX_GPT_KEY;
  const FOLDER_ID = process.env.YANDEX_FOLDER_ID;

  const isBike  = transportMode === 'bike';
  const modeLbl = isBike ? 'на велосипеде' : 'пешком';

  const pts = Array.isArray(storyPoints)
    ? storyPoints.filter(p => p && p.name).map(p => ({ name: p.name, facts: (p.facts || '').trim() }))
    : [];

  // ─── PERSONA ───────────────────────────────────────────────────────────────
  const PERSONA = `Ты — Александра, историк-краевед и городской гид с 15-летним стажем.
Ты влюблена в своё дело и знаешь: самое интересное в городе — не то, что написано в учебниках, а то, что люди обычно проходят мимо.
Ты ведёшь прогулку в реальном времени — слушатель сейчас идёт рядом с тобой. Говори с ним тепло, как с другом, которому показываешь любимый город. Не читай лекцию — рассказывай.`;

  // ─── STRUCTURE ─────────────────────────────────────────────────────────────
  const STRUCTURE = `Каждый фрагмент о месте строится так:

① ЯКОРЬ — что слушатель видит прямо сейчас:
   "Посмотрите направо — видите то тёмно-красное здание с колоннами?"
   "Мы как раз проходим мимо..."
   "Обратите внимание на ограду — она кажется обычной, но..."

② КРЮК — почему это интересно (до того, как объяснять):
   "Мало кто знает, но именно здесь..."
   "Это место горожане обходят стороной — и зря."
   "За этим фасадом скрывается история, которую местные передают шёпотом."

③ ИСТОРИЯ — факты, опираясь только на предоставленные данные.
   Если объект утрачен — рассказывай, что было здесь раньше и почему исчезло.
   Если данных мало — опиши эпоху и характер застройки.

④ ПЕРЕХОД — мостик к движению или следующему объекту:
   "А пока мы идём дальше, расскажу вам кое-что о самом районе..."
   "Ещё через сто метров нас ждёт кое-что неожиданное."`;

  // ─── FEW-SHOT EXAMPLE ──────────────────────────────────────────────────────
  const EXAMPLE = `ПРИМЕР — вот как должен звучать один фрагмент:

«Посмотрите налево — видите этот угрюмый серый корпус за металлическим забором? Большинство прохожих думает, что это обычный завод. На самом деле здесь с 1930-х по 1980-е работало одно из крупнейших закрытых производств города — его название не было ни на одной карте. Жители соседних домов знали только, что по ночам оттуда доносится странный запах и гул.

Сейчас внутри — склады и коворкинг, но если зайти во двор, на стене ещё можно найти оригинальную советскую мозаику с серпом и молотом. Завод закрылся, а мозаика осталась. А мы тем временем выходим к самому неожиданному месту на нашем маршруте...»`;

  // ─── ACCURACY + MEMORIAL FRAMING ───────────────────────────────────────────
  const ACCURACY = `ДОСТОВЕРНОСТЬ И ДЕЛИКАТНОСТЬ:
— Этот аудиогид — просветительский проект. Все факты берутся из открытых источников: Википедия, сайты мемориальных организаций, реестр объектов культурного наследия.
— Если на маршруте есть места исторических трагедий, репрессий, памяти жертв — рассказывай о них. Это важная часть истории страны. Говори сдержанно, с уважением, опираясь только на документально подтверждённые факты.
— НЕЛЬЗЯ выдумывать объекты, здания, памятники, которых нет в данных.
— Если объекта уже нет (снесён, утрачен) — это самое интересное: расскажи, что здесь было раньше и что с ним стало.
— Легенды и предания — только с оговоркой "по преданию", "рассказывают, что".
— Лучше честно описать характер места, чем придумать несуществующий объект.`;

  // ─── LANGUAGE ──────────────────────────────────────────────────────────────
  const LANG_MAP = {
    en: 'IMPORTANT: Write the entire audio guide in English.',
    zh: 'ВАЖНО: Весь текст аудиогида пиши на китайском языке (упрощённое письмо, путунхуа).',
    de: 'ВАЖНО: Весь текст аудиогида пиши на немецком языке.',
    fr: 'ВАЖНО: Весь текст аудиогида пиши на французском языке.',
  };
  const LANG_INSTRUCTION = LANG_MAP[guideLanguage] || '';

  // ─── FORMAT ────────────────────────────────────────────────────────────────
  const FORMAT = `Оформление: абзацы через пустую строку, 3–5 предложений в каждом. Только чистый текст — никакого markdown, звёздочек, решёток, нумерованных списков.${LANG_INSTRUCTION ? '\n' + LANG_INSTRUCTION : ''}`;

  let text = '';

  if (pts.length >= 2) {
    const half = Math.ceil(pts.length / 2);
    const fmt = (arr, offset) => arr.map((p, i) =>
      `${offset + i + 1}. ${p.name}${p.facts ? `\nСправка: ${p.facts}` : ''}`).join('\n\n');

    const firstList  = fmt(pts.slice(0, half), 0);
    const secondList = fmt(pts.slice(half), half);

    const SYS1 = `${PERSONA}

${STRUCTURE}

${EXAMPLE}

${ACCURACY}

ЗАДАЧА — ПЕРВАЯ ЧАСТЬ аудиогида для прогулки ${modeLbl}. Длина маршрута ~${routeDistance} м.
Маршрут реально построен по карте и проходит МИМО перечисленных ниже объектов в порядке движения.

1. Начни с короткого живого вступления о городе или районе (2 абзаца) — характер места, дух, что здесь особенного. Только достоверное.
2. Затем веди слушателя от объекта к объекту СТРОГО по порядку, используя структуру якорь → крюк → история → переход.

${FORMAT}`;

    const SYS2 = `${PERSONA}

${STRUCTURE}

${ACCURACY}

ЗАДАЧА — ВТОРАЯ ЧАСТЬ аудиогида. Продолжение прогулки ${modeLbl}. Не повторяй вступление о городе.
Маршрут проходит мимо перечисленных объектов в порядке движения. Последний объект — кульминация прогулки, заверши на нём особенно ярко.

${FORMAT}`;

    const user1 = `Маршрут:\n${routeDescription}\n\nОбъекты на маршруте (по порядку движения):\n\n${firstList}`;
    const user2 = `Маршрут:\n${routeDescription}\n\nОбъекты на маршруте (по порядку движения):\n\n${secondList}`;

    const [part1, part2] = await Promise.all([
      callGPT(SYS1, user1, API_KEY, FOLDER_ID),
      secondList ? callGPT(SYS2, user2, API_KEY, FOLDER_ID) : Promise.resolve('')
    ]);
    text = [part1, part2].filter(Boolean).join('\n\n');

  } else {
    const SYS = `${PERSONA}

${STRUCTURE}

${EXAMPLE}

${ACCURACY}

ЗАДАЧА — аудиогид для прогулки ${modeLbl}. Длина маршрута ~${routeDistance} м.
Вдоль этого маршрута не найдено объектов в открытых источниках. Поэтому:
1. Расскажи о городе и районе — основание, история, характер, дух места. Только достоверное.
2. Опиши общий характер застройки по ходу маршрута, эпохи. Упомяни известных людей, связанных с этим местом.
Не выдумывай конкретные памятники и здания.

${FORMAT}`;
    text = await callGPT(SYS, `Маршрут:\n${routeDescription}`, API_KEY, FOLDER_ID);
  }

  if (!text) {
    res.status(500).json({ error: 'GPT returned empty' });
    return;
  }

  res.status(200).json({ text });
};
