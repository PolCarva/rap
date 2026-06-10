# Rap Arena

Web de batallas 1v1 de freestyle: matchmaking en tiempo real, sala autoritativa con Durable Objects, transcripción, análisis local de rimas, juez IA, perfiles/ranking e historial persistido en D1.

## Stack

- `apps/web`: Next 16 + React 19 + OpenNext Cloudflare.
- `apps/realtime`: Cloudflare Worker con Durable Objects para matchmaking, batalla y señalización WebRTC.
- `packages/shared`: modalidades, protocolo, juez/ranking DTOs y análisis de rimas.
- `packages/db`: schema, migración D1 y helpers SQL.

## Desarrollo local

```bash
npm install
cp apps/web/.dev.vars.example apps/web/.dev.vars
cp apps/realtime/.dev.vars.example apps/realtime/.dev.vars
npm run dev
```

- Web: http://localhost:3000
- Realtime Worker: http://localhost:8787
- Arena directa: http://localhost:3000/arena
- Ranking: http://localhost:3000/ranking
- Historial: http://localhost:3000/batallas

## Secrets

`apps/realtime/.dev.vars`:

```bash
DEEPGRAM_API_KEY=
OPENROUTER_API_KEY=
OPENROUTER_JUDGE_MODEL=openai/gpt-4o
```

`apps/web/.dev.vars`:

```bash
NEXTJS_ENV=development
OPENROUTER_API_KEY=
OPENROUTER_STT_MODEL=openai/gpt-4o-mini-transcribe
```

## D1

Los `wrangler.jsonc` incluyen un binding `DB` con `database_id` placeholder. Para producción:

```bash
npx wrangler d1 create rap-db
```

Reemplazá el `database_id` en `apps/web/wrangler.jsonc` y `apps/realtime/wrangler.jsonc`, y aplicá migraciones:

```bash
npm run db:migrate:local --workspace @rap/db
npm run db:migrate --workspace @rap/db
```

Si `DB` no existe o las tablas aún no están aplicadas, la app sigue funcionando y las pantallas de ranking/historial muestran estado vacío.

## Checks

```bash
npm run typecheck
npm run lint
npm run build:web
npm run test:rhyme
```

Con `npm run dev:realtime` levantado:

```bash
npm run smoke:battle
npm run smoke:suite
node scripts/smoke-transcribe.mjs
```

## Notas de V1

- Identidad híbrida: login simple local o invitado + alias.
- Audio/video remoto: WebRTC peer-to-peer con señalización por Battle Room.
- Persistencia: usuarios, batallas, turnos, veredictos y ranking en D1.
- Juez: OpenRouter si hay key; fallback heurístico si falta o falla.
