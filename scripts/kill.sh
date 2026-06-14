#!/usr/bin/env bash
# Mata todos los procesos de dev: web (:3000), opennext local (:8787), realtime (:8788) y sueltos.
set +e

for port in 3000 8787 8788; do
	pids=$(lsof -ti:"$port" 2>/dev/null)
	if [ -n "$pids" ]; then
		echo "  · puerto $port → matando $pids"
		kill -9 $pids 2>/dev/null
	fi
done

# Procesos que a veces quedan huérfanos
pkill -f "wrangler dev" 2>/dev/null
pkill -f "workerd" 2>/dev/null
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null

echo "✓ procesos detenidos"
