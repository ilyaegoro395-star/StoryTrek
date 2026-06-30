# Перенос StoryTrek на Яндекс Cloud

Цель: сайт открывается в России без VPN + автодеплой при `git push`.

Архитектура:

```
GitHub push → GitHub Actions ┬─→ Cloud Functions  (4 функции = логика api/*)
                             ├─→ Object Storage    (index.html + vendor/)
                             └─→ API Gateway        (роутинг + прокси Supabase)
                                      │
                       /api/*  → функции
                       /sb/*   → Supabase (прокси, чтобы вход работал из РФ)
                       /*      → статика из бакета
```

---

## Шаг 1. Установить и залогинить `yc` CLI (один раз, локально)

```bash
curl -sSL https://storage.yandexcloud.net/yandexcloud-yc/install.sh | bash
exec -l $SHELL
yc init        # выбрать аккаунт, облако и каталог (folder)
```

> Нужен также `python3` и `aws` CLI (для загрузки статики) — обычно уже стоят.

## Шаг 2. Создать все ресурсы одной командой

В корне проекта:

```bash
bash yc-setup.sh
```

Скрипт создаст: сервисный аккаунт, роли, ключи, бакет, 4 функции и API Gateway.
В конце он **распечатает список секретов** — оставь это окно открытым.

## Шаг 3. Добавить секреты в GitHub

GitHub → репозиторий → **Settings → Secrets and variables → Actions → New repository secret**.

Добавь всё, что распечатал скрипт:

| Секрет | Откуда |
|---|---|
| `YC_SA_JSON_CREDENTIALS` | **всё содержимое** файла `sa-key.json` |
| `YC_SA_ID` | из вывода скрипта |
| `YC_BUCKET` | из вывода скрипта |
| `YC_STORAGE_KEY_ID` | из вывода скрипта |
| `YC_STORAGE_SECRET` | из вывода скрипта |
| `YC_GATEWAY_ID` | из вывода скрипта |
| `FN_GEOCODE_ID` | из вывода скрипта |
| `FN_GUIDE_ID` | из вывода скрипта |
| `FN_SYNTH_ID` | из вывода скрипта |
| `FN_ROUTE_ID` | из вывода скрипта |
| `YANDEX_GPT_KEY` | твой ключ YandexGPT |
| `YANDEX_SPEECHKIT_KEY` | твой ключ SpeechKit |
| `YANDEX_FOLDER_ID` | из вывода скрипта |

## Шаг 4. Запустить деплой

```bash
git push        # на ветку main/master
```

Открой вкладку **Actions** в GitHub — workflow «Deploy to Yandex Cloud» соберёт
и выложит всё. После успеха сайт доступен по адресу из вывода скрипта:

```
https://<gateway-id>.apigw.yandexcloud.net
```

Проверь без VPN — должно открываться.

## Шаг 5. Привязать домен storytrek.ru

В API Gateway можно подключить свой домен:

1. Консоль Яндекс Cloud → **API Gateway → storytrek-gw → Custom domains**
2. Добавить `storytrek.ru`, привязать сертификат (Certificate Manager выпустит
   бесплатный Let's Encrypt после подтверждения владения доменом).
3. В Cloudflare/DNS добавить CNAME на домен шлюза.
   **Важно:** записи держать в режиме **DNS only** (серое облако), чтобы трафик
   шёл напрямую на Яндекс, а не через блокируемый в РФ Cloudflare.

---

## Как обновлять сайт дальше

Просто `git push`. GitHub Actions сам пересоберёт функции и перезальёт статику.
Ничего вручную трогать не нужно.

## Если что-то не так

- **Functions падают с 500** → проверь, что добавил секреты `YANDEX_GPT_KEY`,
  `YANDEX_SPEECHKIT_KEY`, `YANDEX_FOLDER_ID`.
- **Статика 404** → проверь, что бакет публичный (`--public-read`) и в нём лежит
  `index.html` (вкладка Actions → шаг Upload static files).
- **Вход в аккаунт не работает** → открой DevTools → Network, посмотри запросы на
  `/sb/auth/...`; если 4xx — проверь маршрут `/sb/{path+}` в `api-gateway.yaml`.
- Логи функций: Консоль → Cloud Functions → функция → вкладка **Логи**.
