-- Fixture previa a las suites: dos usuarios en auth.users.
-- Varias suites impersonan a "la dueña" con el primer usuario de auth.users, y la
-- aserción 5 de owner-push-notifications necesita un segundo usuario distinto.
-- Solo se usa en la base efímera de CI; el guion bajo evita confundirlo con una suite.
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner-a@ci.test', now() - interval '1 minute', now()),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner-b@ci.test', now(), now())
on conflict (id) do nothing;
