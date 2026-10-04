#!/bin/bash
set -euo pipefail

image=house-app:20261004-pdfpaged-static-overlay
previous=house-app-before-pdf-20261004
backup=/opt/house-backups/house-data-20261004-before-pdf-single-worker.tar.gz
asset=/_next/static/chunks/house-DC9JakCJ.js

test -f /opt/house-secrets/house-miniapi.env
test -d /opt/house-data
docker image inspect "$image" >/dev/null
docker inspect house-app >/dev/null
if docker inspect "$previous" >/dev/null 2>&1; then
  echo 'Previous release container name exists; inspect before retrying' >&2
  exit 1
fi
docker run --rm --entrypoint sh "$image" -c \
  'test -s /app/dist/server/index.js && test -s /app/dist/client/_next/static/chunks/house-DC9JakCJ.js && test ! -e /app/dist/server/.dev.vars'

mkdir -p /opt/house-backups
tar -czf "$backup" -C /opt/house-data .

restore_previous() {
  docker rm -f house-app >/dev/null 2>&1 || true
  docker rename "$previous" house-app
  docker start house-app >/dev/null
  echo 'New release failed health check; previous container restored' >&2
}

docker stop house-app >/dev/null
trap 'restore_previous' ERR
docker rename house-app "$previous"
if ! docker run -d --name house-app --network house-internal \
  --env-file /opt/house-secrets/house-miniapi.env \
  --volumes-from "$previous" --restart unless-stopped "$image" >/dev/null; then
  restore_previous
  exit 1
fi

production_ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' house-app)
ready=0
for attempt in $(seq 1 45); do
  if curl --max-time 2 -fsS -o /dev/null "http://$production_ip:3000/" && \
     curl --max-time 2 -fsS -o /dev/null "http://$production_ip:3000$asset"; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  docker logs --tail 25 house-app >&2 || true
  restore_previous
  exit 1
fi

docker exec house-app sh -c 'test -s /app/dist/server/.dev.vars && test "$(stat -c %a /app/dist/server/.dev.vars)" = 600'
test "$(curl --max-time 3 -sS -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{}' "http://$production_ip:3000/api/miniprogram/ocr")" = 401
trap - ERR
echo "DEPLOY_OK image=$image previous=$previous backup=$backup"
