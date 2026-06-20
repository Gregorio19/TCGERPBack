#!/usr/bin/env bash
# Genera node_modules de producción para Linux (Prisma) y un zip para subir a Bluehost.
# Requiere Docker Desktop en tu Mac.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/bluehost-deploy"
ARCHIVE="$ROOT/bluehost-node_modules-linux.zip"

rm -rf "$OUT"
mkdir -p "$OUT"

echo ">> Build dist en Mac..."
cd "$ROOT"
npm ci
npm run bluehost-build

cp -R dist prisma api-spec package.json package-lock.json bluehost-entry.mjs "$OUT/"

echo ">> node_modules Linux (Docker)..."
docker run --rm --platform linux/amd64 \
  -v "$ROOT:/app" -w /app \
  -e SKIP_PRISMA_GENERATE=0 \
  node:20-bookworm-slim \
  bash -lc "npm ci --omit=dev && npx prisma generate"

echo ">> Empaquetando node_modules..."
rm -f "$ARCHIVE"
(cd "$ROOT" && zip -rq "$ARCHIVE" node_modules -x 'node_modules/.cache/*')

cp "$ARCHIVE" "$OUT/"
echo ""
echo "Listo. Sube por FTP el contenido de:"
echo "  $OUT"
echo ""
echo "Y descomprime bluehost-node_modules-linux.zip dentro de:"
echo "  /home/pandigee/nodevenv/public_html/apierp.pandigeektcg.cl/20/lib/"
echo "(o donde apunte el enlace node_modules de tu app)"
