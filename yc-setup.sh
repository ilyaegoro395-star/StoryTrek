#!/usr/bin/env bash
#
# One-time bootstrap of the Yandex Cloud resources StoryTrek needs.
# Run locally once (requires the `yc` CLI, already logged in: `yc init`).
#
#   bash yc-setup.sh
#
# At the end it prints every value you must add to GitHub → Settings →
# Secrets and variables → Actions. After that, every `git push` to main
# auto-deploys via .github/workflows/deploy-yc.yml.

set -euo pipefail

# ── EDIT THESE TWO IF YOU LIKE ────────────────────────────────────────────────
BUCKET="storytrek-site-$(yc config get cloud-id | tr -d '\n' | tail -c 6)"  # globally-unique bucket name
SA_NAME="storytrek-deployer"
# ──────────────────────────────────────────────────────────────────────────────

FOLDER_ID="$(yc config get folder-id)"
echo "Folder: $FOLDER_ID"

echo "▸ Service account…"
yc iam service-account create --name "$SA_NAME" 2>/dev/null || echo "  (already exists)"
SA_ID="$(yc iam service-account get --name "$SA_NAME" --format json | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')"
echo "  SA_ID=$SA_ID"

echo "▸ Roles…"
for ROLE in functions.admin api-gateway.admin storage.editor storage.viewer; do
  yc resource-manager folder add-access-binding "$FOLDER_ID" \
    --role "$ROLE" --subject "serviceAccount:$SA_ID" >/dev/null 2>&1 || true
done

echo "▸ Authorized key (YC_SA_JSON_CREDENTIALS)…"
yc iam key create --service-account-id "$SA_ID" --output sa-key.json
echo "  written → sa-key.json"

echo "▸ Static access key (for S3 upload)…"
yc iam access-key create --service-account-id "$SA_ID" --format json > access-key.json
STORAGE_KEY_ID="$(python3 -c 'import json;print(json.load(open("access-key.json"))["access_key"]["key_id"])')"
STORAGE_SECRET="$(python3 -c 'import json;print(json.load(open("access-key.json"))["secret"])')"

echo "▸ Bucket $BUCKET…"
yc storage bucket create --name "$BUCKET" --default-storage-class standard \
  --public-read 2>/dev/null || echo "  (already exists)"

echo "▸ Functions…"
declare -A FN_IDS
for FN in storytrek-geocode storytrek-guide storytrek-synth storytrek-route; do
  yc serverless function create --name "$FN" 2>/dev/null || echo "  $FN exists"
  FN_IDS[$FN]="$(yc serverless function get --name "$FN" --format json | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')"
  # let the gateway SA invoke it
  yc serverless function add-access-binding --name "$FN" \
    --role functions.functionInvoker --subject "serviceAccount:$SA_ID" >/dev/null 2>&1 || true
done

echo "▸ API Gateway…"
# minimal placeholder spec; the real routing is pushed by CI
cat > /tmp/gw-init.yaml <<'YAML'
openapi: 3.0.0
info: { title: storytrek, version: 1.0.0 }
paths:
  /ping:
    get:
      x-yc-apigateway-integration:
        type: dummy
        http_code: 200
        http_headers: { Content-Type: text/plain }
        content: { text/plain: ok }
YAML
yc serverless api-gateway create --name storytrek-gw --spec=/tmp/gw-init.yaml 2>/dev/null \
  || echo "  gateway exists"
GW_ID="$(yc serverless api-gateway get --name storytrek-gw --format json | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')"
GW_DOMAIN="$(yc serverless api-gateway get --name storytrek-gw --format json | python3 -c 'import sys,json;print(json.load(sys.stdin)["domain"])')"

cat <<EOF

════════════════════════════════════════════════════════════════════
  ГОТОВО. Добавь эти секреты в GitHub:
  Settings → Secrets and variables → Actions → New repository secret
════════════════════════════════════════════════════════════════════

  YC_SA_JSON_CREDENTIALS  = <всё содержимое файла sa-key.json>
  YC_SA_ID                = $SA_ID
  YC_BUCKET               = $BUCKET
  YC_STORAGE_KEY_ID       = $STORAGE_KEY_ID
  YC_STORAGE_SECRET       = $STORAGE_SECRET
  YC_GATEWAY_ID           = $GW_ID
  FN_GEOCODE_ID           = ${FN_IDS[storytrek-geocode]}
  FN_GUIDE_ID             = ${FN_IDS[storytrek-guide]}
  FN_SYNTH_ID             = ${FN_IDS[storytrek-synth]}
  FN_ROUTE_ID             = ${FN_IDS[storytrek-route]}

  И секреты для самих функций (твои существующие ключи Yandex):
  YANDEX_GPT_KEY          = <ключ YandexGPT>
  YANDEX_SPEECHKIT_KEY    = <ключ SpeechKit>
  YANDEX_FOLDER_ID        = $FOLDER_ID

  Адрес сайта после первого деплоя:
  https://$GW_DOMAIN
════════════════════════════════════════════════════════════════════
EOF
