-- Player 02 joins through an invite link / QR. Null once the team is full.
alter table teams add column if not exists invite_code text;
create unique index if not exists teams_invite_code_key on teams (invite_code) where invite_code is not null;
