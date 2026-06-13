# Rapear Online

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

> En dev, `apps/web` (via `initOpenNextCloudflareForDev`) y `apps/realtime`
> (via `wrangler dev --persist-to`) comparten la MISMA D1 local en
> `.wrangler-shared/state`. Para aplicar migraciones locales:
> `cd apps/realtime && npx wrangler d1 migrations apply rap-db --local --persist-to ../../.wrangler-shared/state`

`apps/realtime/.dev.vars`:

```bash
DEEPGRAM_API_KEY=
OPENROUTER_API_KEY=
OPENROUTER_JUDGE_MODEL=openai/gpt-4o
JWT_SECRET=   # MISMO valor que en apps/web (verificación de identidad rankeada)
```

`apps/web/.dev.vars`:

```bash
NEXTJS_ENV=development
OPENROUTER_API_KEY=
OPENROUTER_STT_MODEL=openai/gpt-4o-mini-transcribe
JWT_SECRET=   # firma cookies de sesión y tokens realtime
BACKOFFICE_PASSWORD=
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

## Deploy a producción

```bash
# Secrets del worker realtime (una vez)
cd apps/realtime
npx wrangler secret put DEEPGRAM_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put JWT_SECRET        # mismo valor en ambos workers

# Secrets de la web
cd ../web
npx wrangler secret put JWT_SECRET
npx wrangler secret put BACKOFFICE_PASSWORD

# Storage para beats subidos desde /backoffice
npx wrangler r2 bucket create rap-beat-uploads
```

### Subir cambios

Desde la raíz, **un solo comando** hace todo:

```bash
npm run deploy
```

Esto corre, en orden:

1. `deploy:db` — aplica las migraciones D1 pendientes en remoto
   (`wrangler d1 migrations apply rap-db --remote`). Idempotente: si no hay
   nada pendiente, no hace nada.
2. `deploy:web` — build + deploy del worker web.
3. `deploy:realtime` — deploy del worker realtime.

Las migraciones corren **antes** del código a propósito: así el schema siempre
está listo cuando el nuevo código lo usa. (Olvidar este paso fue lo que rompió
el login en prod: el código consultaba `avatar_config` antes de que la columna
existiera en la base → `D1_ERROR: no such column`.)

Si necesitás una pieza suelta: `npm run deploy:db`, `npm run deploy:web` o
`npm run deploy:realtime`.

> ⚠️ El orden migrar-primero es correcto para cambios **aditivos** (agregar
> tablas/columnas). Para una migración **destructiva** (borrar/renombrar algo
> que el código viejo todavía usa), aplicala a mano *después* del deploy de
> código.

`NEXT_PUBLIC_REALTIME_URL` se inyecta en build-time del cliente (ya viene fijado
en el script `deploy` de `apps/web` apuntando al worker realtime, esquema
`wss://`).

## Notas de V1

- Identidad híbrida: login simple local o invitado + alias. El modo rankeado
  exige un token HMAC efímero (`/api/auth/realtime-token`) verificado por el
  worker realtime: sin token válido la batalla no mueve ELO.
- Audio/video remoto: WebRTC peer-to-peer con señalización por Battle Room.
- Beats: 6 pistas sintetizadas con WebAudio (siempre disponibles, BPM exacto)
  + beats por URL, links de SoundCloud o MP3 subido a R2 desde el backoffice
  (`/backoffice`, con detección de BPM para URLs de audio directas).
- Reconexión: la batalla activa se retoma tras un refresh (sessionStorage +
  re-hello con el mismo sessionId); desconexiones tienen 45s de gracia.
- Persistencia: usuarios, batallas (incl. abortadas), turnos, veredictos,
  ELO con K-factor variable, rachas y stats por modalidad en D1.
- Juez: OpenRouter si hay key (con métricas objetivas de rima del motor
  fonético local como ancla); fallback heurístico si falta o falla.
