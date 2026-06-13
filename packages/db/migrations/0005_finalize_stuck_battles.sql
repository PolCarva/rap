-- Ninguna batalla con veredicto debe quedar "en curso": las cerramos.
-- (Reaplica la idea de 0004 por si quedaron filas de versiones anteriores
--  del worker que escribían el ganador sin marcar status = 'finished'.)
UPDATE battles
SET
	status = 'finished',
	ended_at = COALESCE(ended_at, started_at, unixepoch() * 1000)
WHERE winner IS NOT NULL
  AND status NOT IN ('finished', 'aborted');

-- Batallas 'active' viejas y sin veredicto (sala abandonada o persistencia
-- caída): se marcan abortadas para que no queden eternamente "en curso".
-- El umbral (1h) es muy superior a la duración máxima de cualquier batalla,
-- así que no toca ninguna en juego.
UPDATE battles
SET
	status = 'aborted',
	ended_at = COALESCE(ended_at, started_at, unixepoch() * 1000)
WHERE status = 'active'
  AND winner IS NULL
  AND COALESCE(started_at, 0) < (unixepoch() * 1000) - 3600000;
