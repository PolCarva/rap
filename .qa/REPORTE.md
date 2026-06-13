# Reporte de QA — RAP ARENA

Fecha: 2026-06-13 · Método: Playwright (Chromium headless) contra el server local (`:3000` + realtime `:8787`), cámara/mic sintéticos inyectados, rival **Bot dev**. Capturas en `.qa/shots/`.

## Alcance probado (real, no inventado)
- **Páginas estáticas:** Home (hero 3D + 4 actos), Arena/Setup, Ranking, Batallas/Historial, Backoffice.
- **Flujo de batalla completo (4x4):** setup → searching → VS splash → cuenta atrás → turno propio → turno rival → jurado deliberando → resultado (suspense/votos/final).
- **Turno por modalidad:** 4x4, minuto-libre, palabras, hard, deconceptos (layout de prompts/controles).
- **Mobile (390×844):** palabras (cuenta atrás + turno).
- **Consola:** capturada en todos los flujos.

## Veredicto general
Experiencia **sólida y cohesiva**, identidad visual fuerte, animaciones cuidadas y **cero errores JS** en toda la travesía (solo warnings de WebGL propios del headless). Los 3 arreglos pedidos están **verificados funcionando**. Hay **1 bug de fairness importante** en el juicio y varios puntos menores + trabajo de **mobile**.

---

## ✅ Los 3 arreglos pedidos — verificados
1. **Cuenta atrás empieza en 3** — A 150 BPM antes parpadeaba "4"; ahora muestra 3 directo (desktop y mobile). ✔
2. **Prompt ya no tapa "TERMINAR TURNO"** — En palabras / hard / deconceptos el cartel queda centrado abajo y el botón en la esquina inferior izquierda, sin solaparse. El timer de segundos pasó a la esquina exterior (ya no choca con el banner central). ✔
3. **Jurado no tapa textos en el resultado** — El kicker "EL JURADO DELIBERA" / "2-1" y las etiquetas de voto quedan por encima del canvas. ✔

---

## 🐞 Bugs

### B1 — ALTA · El MC que NO participó ganó la batalla
- **Evidencia:** `4x4__result_final.png`. Resultado "GANASTE" para QA-TESTER con total **40**, pero sus criterios son todos **1** y el comentario dice *"No participaste en la batalla, lo que te dejó sin puntaje en todos los criterios"*. El rival (MC BOT) rapeó (criterios 5/5/4/2) y **perdió** 2-1.
- **Por qué importa:** un MC en silencio/sin verso no debería poder ganar. Además la barra de criterios (todas en 1) **contradice visualmente** el total (40) y el "GANASTE".
- **Reproducción:** lado humano envía versos vacíos vs Bot dev. (Confirmar si pasa también en batalla real 1v1.)

### B2 — MEDIA · Estado "EN CURSO" con ganador y score final
- **Evidencia:** `batallas.png`, primera tarjeta: badge **EN CURSO** pero ya muestra "GANÓ ROCOTONGOMC" y 74/57. Estado inconsistente (debería ser FINALIZADA o no mostrar ganador).

### B3 — BAJA · Typo en nombre de beat
- **Evidencia:** VS splash → "BEAT — **DRANATIC** WEST COAST SOUL SAMPLE BEAT". Debería ser "DRAMATIC".

### B4 — BAJA · Glifos faltantes (tofu)
- "ESTOY LISTO **⚔**" y "REVANCHA ⚔" renderizan la espada como "×" (la fuente display no tiene U+2694).
- Placeholders de voto en suspense muestran **□ □ □** en vez de "…" (la mono no tiene U+2026). Evidencia: `4x4__result_suspense.png`.

### B5 — BAJA · Timer de "minuto libre" arranca en 61s
- `minuto-libre__turn_mine.png`: el reloj abre en "61s" para un turno de 60s (faltaría un clamp tipo el de la cuenta atrás).

---

## 📱 Mobile (390px) — necesita trabajo (MEDIA)
Evidencia: `palabras__turn_mine_m.png`, `palabras__countdown_m.png`.
- **M1 — HUD superior amontonado:** en los paneles apilados (50vh) el banner de turno, el botón ABANDONAR y la placa de nombre se **superponen** arriba.
- **M2 — Prompt multi-palabra se corta:** "ADVERSARIO · BARRIO · ESCENARIO · DICCIONARIO" se recorta a los lados ("VERSARIO…") porque la palabra no envuelve dentro del 94vw.
- **M3 — Control sobre el VS:** "TERMINAR TURNO" (centrado a media altura) pisa el badge VS central.

> Nota: estos problemas son del layout mobile preexistente; mis cambios no los introdujeron, pero conviene resolverlos.

---

## 🎨 Estética / UX (BAJA)
- **Backoffice:** el checkbox "ACTIVO" es el azul nativo del browser (rompe el tema rojo/hueso) y el botón "AGREGAR" tiene contraste muy bajo (casi ilegible). Evidencia: `backoffice.png`.
- **Cuenta atrás:** ambos paneles muestran a la vez "MIC CERRADO — TURNO DEL RIVAL" y "SILENCIADO — TU TURNO" (ninguno activo aún); leve ruido visual.
- **Ranking / Batallas:** se ven vacíos con pocos datos (depende de data, no es bug).

## 👍 Lo que está muy bien
- Sin errores JS en ningún flujo. Hero 3D, jurado 3D y transiciones con buen acabado.
- Loop de batalla completo y estable contra el bot.
- Identidad visual consistente (tipografía, rojo/hueso, grano/scanlines).

---

## 🗺️ Plan de acción (priorizado)
1. **B1 (ALTA):** En el juez, penalizar verso vacío / no-participación: un MC sin verso pierde por default (o réplica si ambos vacíos). Revisar que el "total" y las barras de criterio sean coherentes con el veredicto. Confirmar en 1v1 real.
2. **M1–M3 + B2 (MEDIA):** Rediseñar el HUD mobile del turno (banner/abandonar/placa sin solape; prompt con wrap; controles fuera del VS). Corregir el estado de batalla para que "EN CURSO" no muestre ganador.
3. **B5 + B4 + B3 (BAJA):** Clamp del timer a la duración real; reemplazar ⚔/… por glifos seguros o SVG; corregir "Dranatic"→"Dramatic".
4. **Estética (BAJA):** Estilar el checkbox y el botón del backoffice acorde al tema.

---
### Artefactos de testing
`.qa/arena_flow.py`, `.qa/static_pages.py`, capturas en `.qa/shots/`, venv en `.qa-venv/`. Son auxiliares de QA (no de la app); se pueden borrar o agregar a `.gitignore`.
