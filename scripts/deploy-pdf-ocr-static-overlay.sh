#!/bin/bash
set -euo pipefail

release_dir=/opt/house-build/pdf-ocr-static-overlay-20261004
bundle_url=https://cdn.jsdelivr.net/gh/Gartss/house@73b4f49/scripts/pdf-ocr-static-overlay-20261004.tar.gz
bundle_sha=4bcfd88f8c95961390b2f6f0ff7fb4ce3fff2d109afa557a4eb1e73e54aab274
new_image=house-app:20261004-pdfpaged-static-overlay
canary=house-app-pdf-canary-1004b
previous=house-app-before-pdf-1004

mkdir -p "$release_dir" /opt/house-backups /opt/house-pdf-canary-data
cd "$release_dir"
test -f /opt/house-secrets/house-miniapi.env
test -d /opt/house-data
docker image inspect house-app:20260930-miniapi >/dev/null
docker inspect house-app >/dev/null
if docker inspect "$canary" >/dev/null 2>&1 || docker inspect "$previous" >/dev/null 2>&1; then
  echo 'A previous PDF release container name already exists; inspect it before retrying' >&2
  exit 1
fi

curl -fsSL --retry 3 --connect-timeout 15 --max-time 180 "$bundle_url" -o overlay.tar.gz
echo "$bundle_sha  overlay.tar.gz" | sha256sum -c -
tar -xzf overlay.tar.gz
test -s server/index.js
test -s server/BUILD_ID
test -d client/_next
test -s docker-entrypoint.sh
test ! -e server/.dev.vars

cat > Dockerfile <<'DOCKERFILE'
FROM house-app:20260930-miniapi
COPY server/ /app/dist/server/
COPY client/ /app/dist/client/
COPY docker-entrypoint.sh /usr/local/bin/house-entrypoint
RUN chmod +x /usr/local/bin/house-entrypoint
DOCKERFILE
docker build -t "$new_image" . > build.log 2>&1 || { tail -60 build.log; exit 1; }
docker run --rm --entrypoint sh "$new_image" -c 'test ! -e /app/dist/server/.dev.vars'

docker run -d --name "$canary" --network house-internal \
  --env-file /opt/house-secrets/house-miniapi.env \
  -v /opt/house-pdf-canary-data:/data "$new_image" >/dev/null
canary_ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$canary")
canary_ok=0
for attempt in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://$canary_ip:3000/"; then canary_ok=1; break; fi
  sleep 1
done
if [ "$canary_ok" -ne 1 ]; then docker logs --tail 40 "$canary"; exit 1; fi
docker exec "$canary" sh -c 'test -s /app/dist/server/.dev.vars && test "$(stat -c %a /app/dist/server/.dev.vars)" = 600'
canary_html=$(curl -fsS "http://$canary_ip:3000/")
while IFS= read -r asset; do
  [ -z "$asset" ] || curl -fsS -o /dev/null "http://$canary_ip:3000$asset"
done < <(printf '%s' "$canary_html" | grep -oE '(src|href)="/_next/[^" ]+' | cut -d '"' -f2 | sort -u)
docker rm -f "$canary" >/dev/null

backup=/opt/house-backups/house-data-20261004-before-pdf.tar.gz
tar -czf "$backup" -C /opt/house-data .
docker stop house-app >/dev/null
docker rename house-app "$previous"
if ! docker run -d --name house-app --network house-internal \
  --env-file /opt/house-secrets/house-miniapi.env \
  --volumes-from "$previous" --restart unless-stopped "$new_image" >/dev/null; then
  docker rename "$previous" house-app
  docker start house-app >/dev/null
  exit 1
fi
production_ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' house-app)
production_ok=0
for attempt in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://$production_ip:3000/"; then production_ok=1; break; fi
  sleep 1
done
if [ "$production_ok" -ne 1 ]; then
  docker rm -f house-app >/dev/null
  docker rename "$previous" house-app
  docker start house-app >/dev/null
  echo 'New container failed health check; old container restored' >&2
  exit 1
fi
echo "DEPLOY_OK image=$new_image backup=$backup"
