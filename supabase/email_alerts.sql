-- ─────────────────────────────────────────────────────────────────────────────
-- BebKey - Email alert triggers via pg_net
-- Run ONCE in the Supabase SQL Editor.
--
-- What this does:
--   1. Enables pg_net extension (already enabled on most Supabase projects)
--   2. Rewrites match_listing_to_clients() to also fire match-alert emails
--      via the send-email edge function when a notification row is created
--   3. Adds notify_saved_searches() trigger so buyers get emails when a new
--      listing matches their saved search filter
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Enable pg_net (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Store connection settings so the key isn't repeated in every function body
ALTER DATABASE postgres
  SET "app.edge_base_url" = 'https://fzuadufzqazrvwarnely.supabase.co/functions/v1';

ALTER DATABASE postgres
  SET "app.service_role_key" = '<REDACTED_SERVICE_ROLE_KEY>';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rewrite match_listing_to_clients to also send agent email alerts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_listing_to_clients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  client_row   agent_clients%ROWTYPE;
  agent_email  text;
  agent_name   text;
  matched      text[];
  edge_url     text := current_setting('app.edge_base_url', true);
  svc_key      text := current_setting('app.service_role_key', true);
BEGIN
  FOR client_row IN
    SELECT *
    FROM agent_clients
    WHERE is_active = true
      AND (
        preferred_cities IS NULL
        OR cardinality(preferred_cities) = 0
        OR NEW.city = ANY(preferred_cities)
      )
      AND (budget_min IS NULL OR NEW.price >= budget_min)
      AND (budget_max IS NULL OR NEW.price <= budget_max)
      AND (min_rooms IS NULL OR NEW.rooms >= min_rooms)
      AND (min_size_m2 IS NULL OR NEW.size_m2 >= min_size_m2)
      AND (
        property_types IS NULL
        OR cardinality(property_types) = 0
        OR NEW.property_type = ANY(property_types)
      )
  LOOP
    -- Build matched-fields array
    matched := ARRAY[]::text[];
    IF NEW.city = ANY(COALESCE(client_row.preferred_cities, ARRAY[]::text[])) THEN
      matched := array_append(matched, 'city');
    END IF;
    IF NEW.price BETWEEN COALESCE(client_row.budget_min, 0) AND COALESCE(client_row.budget_max, 999999999) THEN
      matched := array_append(matched, 'price');
    END IF;
    IF client_row.min_rooms IS NOT NULL AND NEW.rooms >= client_row.min_rooms THEN
      matched := array_append(matched, 'rooms');
    END IF;
    IF client_row.min_size_m2 IS NOT NULL AND NEW.size_m2 >= client_row.min_size_m2 THEN
      matched := array_append(matched, 'size');
    END IF;
    IF NEW.property_type = ANY(COALESCE(client_row.property_types, ARRAY[]::text[])) THEN
      matched := array_append(matched, 'property_type');
    END IF;

    -- Insert in-app notification
    INSERT INTO notifications (agent_id, listing_id, client_id, matched_fields)
    VALUES (client_row.agent_id, NEW.id, client_row.id, matched);

    -- Look up agent email + display name
    SELECT
      au.email,
      COALESCE(au.raw_user_meta_data->>'full_name', au.email)
    INTO agent_email, agent_name
    FROM agents a
    JOIN auth.users au ON au.id = a.user_id
    WHERE a.id = client_row.agent_id
    LIMIT 1;

    -- Fire email (async, non-blocking)
    IF agent_email IS NOT NULL AND edge_url IS NOT NULL AND svc_key IS NOT NULL THEN
      PERFORM net.http_post(
        url     := edge_url || '/send-email',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || svc_key
        ),
        body    := jsonb_build_object(
          'type', 'match_alert',
          'data', jsonb_build_object(
            'agentEmail',   agent_email,
            'agentName',    agent_name,
            'clientName',   client_row.client_name,
            'listingCity',  NEW.city,
            'listingPrice', NEW.price,
            'listingRooms', NEW.rooms,
            'listingSize',  NEW.size_m2,
            'listingId',    NEW.id::text
          )
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Re-attach the trigger (in case it was dropped or needs updating)
DROP TRIGGER IF EXISTS trigger_match_listing ON listings;
CREATE TRIGGER trigger_match_listing
  AFTER INSERT ON listings
  FOR EACH ROW
  EXECUTE FUNCTION match_listing_to_clients();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Saved-search alert: email buyers when a new listing matches their filter
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_saved_searches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  filter_row  filters%ROWTYPE;
  user_email  text;
  user_name   text;
  edge_url    text := current_setting('app.edge_base_url', true);
  svc_key     text := current_setting('app.service_role_key', true);
BEGIN
  FOR filter_row IN
    SELECT *
    FROM filters
    WHERE is_active = true
      -- City: no preference or matches
      AND (city IS NULL OR NEW.city ILIKE city)
      -- Price window (both ends optional)
      AND (price_min IS NULL OR NEW.price >= price_min)
      AND (price_max IS NULL OR NEW.price <= price_max)
      -- Rooms minimum
      AND (rooms_min IS NULL OR NEW.rooms >= rooms_min)
      -- Size minimum
      AND (size_min IS NULL OR NEW.size_m2 >= size_min)
      -- Property type
      AND (property_type IS NULL OR NEW.property_type = property_type)
  LOOP
    -- Get the buyer's email
    SELECT
      au.email,
      COALESCE(au.raw_user_meta_data->>'full_name', au.email)
    INTO user_email, user_name
    FROM auth.users au
    WHERE au.id = filter_row.user_id
    LIMIT 1;

    IF user_email IS NOT NULL AND edge_url IS NOT NULL AND svc_key IS NOT NULL THEN
      PERFORM net.http_post(
        url     := edge_url || '/send-email',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || svc_key
        ),
        body    := jsonb_build_object(
          'type', 'saved_search_alert',
          'data', jsonb_build_object(
            'userEmail',    user_email,
            'userName',     user_name,
            'filterName',   COALESCE(filter_row.name, filter_row.city, 'Your search'),
            'listingCity',  NEW.city,
            'listingPrice', NEW.price,
            'listingRooms', NEW.rooms,
            'listingSize',  NEW.size_m2,
            'listingId',    NEW.id::text
          )
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_saved_searches ON listings;
CREATE TRIGGER trigger_notify_saved_searches
  AFTER INSERT ON listings
  FOR EACH ROW
  EXECUTE FUNCTION notify_saved_searches();
