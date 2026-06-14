#!/usr/bin/env bash
# Resetea el entorno de dev: mata todo y lo vuelve a levantar limpio.
# Recarga las keys desde apps/*/.dev.vars (se leen solo al arrancar).
set -e
cd "$(dirname "$0")/.."

echo "🔪 Deteniendo procesos…"
bash scripts/kill.sh
sleep 1

# Wrangler necesita Node 22+. Si hay nvm, usar la versión correcta.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
	# shellcheck disable=SC1091
	. "$NVM_DIR/nvm.sh"
	nvm use 22 >/dev/null 2>&1 || nvm use >/dev/null 2>&1 || true
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 22 ]; then
	echo "⚠️  Node $(node -v 2>/dev/null) — wrangler necesita Node 22+. Corré: nvm use 22"
fi

echo "🚀 Levantando web (:3000) + realtime worker (:8788)…"
echo "   Ctrl+C corta ambos."
exec npm run dev
