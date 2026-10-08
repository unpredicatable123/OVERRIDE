-- Self-paced run + Gemini-generated, per-team question sets.

-- Each team's own round clock: { "<protocol>": { "startedAt": ms, "pauseClockAtStart": ms } }.
alter table teams add column if not exists rounds jsonb not null default '{}';

-- Generated challenges belong to one team; base content keeps team_id null.
-- Deleting a team (or its generated set) removes its attempts through the existing cascade.
alter table challenges add column if not exists team_id text references teams (id) on delete cascade;
create index if not exists challenges_team_idx on challenges (team_id, protocol) where team_id is not null;
