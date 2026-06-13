UPDATE battles
SET
	status = 'finished',
	ended_at = COALESCE(ended_at, started_at, unixepoch() * 1000)
WHERE winner IS NOT NULL
  AND status NOT IN ('finished', 'aborted');
