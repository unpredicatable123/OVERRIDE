-- OVERRIDE — Technical Game Arena schema.
-- All game writes happen server-side with the service-role key (bypasses RLS).
-- Browsers only ever read `arena_snapshot`, which holds exactly what the visibility
-- rules allow (boss XP only during the boss fight, totals only after FINALIZE).

create table if not exists event_state (
  id int primary key default 1 check (id = 1),
  version bigint not null default 0,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists protocols (
  id text primary key,
  idx int not null,
  code text not null,
  name text not null,
  title text not null,
  tagline text not null default '',
  story text not null default '',
  dossier jsonb not null default '[]',
  flow text not null check (flow in ('grid', 'free', 'sequence')),
  duration_sec int not null check (duration_sec > 0),
  line_bonus int not null default 0
);

create table if not exists challenges (
  id text primary key,
  protocol text not null references protocols (id) on delete cascade,
  ord int not null,
  title text not null,
  tag text not null default '',
  kind text not null check (kind in ('text', 'choice')),
  prompt text not null,
  blocks jsonb not null default '[]',
  options jsonb not null default '[]',
  answers jsonb not null default '[]',
  base_xp int not null check (base_xp >= 0),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard', 'boss')),
  time_limit_sec int check (time_limit_sec is null or time_limit_sec > 0),
  hard_timeout boolean not null default false,
  max_attempts int not null default 3 check (max_attempts > 0),
  reveal text,
  hint text,
  active boolean not null default true
);
create index if not exists challenges_protocol_idx on challenges (protocol, ord);

create table if not exists teams (
  id text primary key,
  name text not null,
  players jsonb not null,
  access_key text not null,
  disabled boolean not null default false,
  joined_at bigint,
  created_at bigint not null
);
create unique index if not exists teams_name_key on teams (lower(name));

create table if not exists attempts (
  team_id text not null references teams (id) on delete cascade,
  challenge_id text not null references challenges (id) on delete cascade,
  protocol text not null,
  started_at bigint not null,
  pause_clock_at_start bigint not null default 0,
  tries int not null default 0,
  status text not null default 'open' check (status in ('open', 'solved', 'failed')),
  xp int not null default 0 check (xp >= 0),
  closed_at bigint,
  primary key (team_id, challenge_id)
);

create table if not exists submissions (
  id bigserial primary key,
  team_id text not null references teams (id) on delete cascade,
  challenge_id text not null,
  protocol text not null,
  answer text not null,
  correct boolean not null,
  xp int not null,
  try_no int not null,
  elapsed_ms int not null,
  at bigint not null
);
create index if not exists submissions_team_idx on submissions (team_id);

create table if not exists arena_snapshot (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Lock everything down; only the snapshot is readable by browsers.
alter table event_state enable row level security;
alter table protocols enable row level security;
alter table challenges enable row level security;
alter table teams enable row level security;
alter table attempts enable row level security;
alter table submissions enable row level security;
alter table arena_snapshot enable row level security;

drop policy if exists "arena snapshot is public" on arena_snapshot;
create policy "arena snapshot is public" on arena_snapshot for select to anon, authenticated using (true);

-- Realtime: clients subscribe to UPDATEs of the single snapshot row.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'arena_snapshot'
  ) then
    alter publication supabase_realtime add table arena_snapshot;
  end if;
end $$;
