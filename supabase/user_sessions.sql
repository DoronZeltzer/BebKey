-- Single-session enforcement
-- Each user can only have one active session at a time.
-- When a new login occurs, the token is overwritten, which kicks out the previous session.

CREATE TABLE IF NOT EXISTS public.user_sessions (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can read and write their own session row
CREATE POLICY "Users can manage own session"
  ON public.user_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
