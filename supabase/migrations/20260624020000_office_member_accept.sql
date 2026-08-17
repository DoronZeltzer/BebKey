-- Let an invited agent find + accept their own office invite (matched by email),
-- so team membership becomes active when they sign in. Owners still manage rows.

drop policy if exists "office_members read" on public.office_members;
create policy "office_members read" on public.office_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or (auth.jwt() ->> 'email') = email
    or office_id in (select id from public.offices where owner_user_id = auth.uid())
  );

drop policy if exists "office_members self accept" on public.office_members;
create policy "office_members self accept" on public.office_members
  for update to authenticated
  using ((auth.jwt() ->> 'email') = email)
  with check ((auth.jwt() ->> 'email') = email);
