#!/usr/bin/env bash
# Empaqueta solo Prisma Client (con engines Linux) para subir a Bluehost tras npm install en cPanel.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/bluehost-prisma-client.zip"

cd "$ROOT"
echo ">> prisma generate (incluye binarios Linux)..."
npx prisma generate

rm -f "$OUT"
zip -rq "$OUT" node_modules/@prisma node_modules/.prisma

echo ""
echo "Listo: $OUT"
echo ""
echo "Pasos en Bluehost:"
echo "  1. Variable SKIP_PRISMA_GENERATE=1 en Node.js App"
echo "  2. Ejecutar NPM Install"
echo "  3. Subir y descomprimir este zip en:"
echo "     /home/pandigee/nodevenv/public_html/apierp.pandigeektcg.cl/20/lib/"
echo "     (debe quedar node_modules/@prisma y node_modules/.prisma ahí)"
