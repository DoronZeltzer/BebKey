-- BebKey - RPC to refresh the neighborhood_stats materialised view.
-- Called from scrapers/refresh_neighborhood_stats.py at the end of every
-- scraper run.

CREATE OR REPLACE FUNCTION public.refresh_neighborhood_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.neighborhood_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_neighborhood_stats TO service_role;
