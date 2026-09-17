-- =============================================================================
-- v56 -- a calendar subscription link for each account
-- =============================================================================
--
-- WHAT CHANGES
--
--   1. can_see_allstars_for(account) -- v55's rule for an account named by id,
--      which a calendar app needs because it has no session. can_see_allstars()
--      now calls it, so the rule is still written down once.
--   2. portal_calendar_tokens -- one random link token per account.
--   3. portal_calendar_token() -- the signed-in account's token, created the
--      first time it is asked for.
--   4. portal_calendar_feed(token, section, from, to) -- the events a link may
--      serve, and nothing else.
--
-- WHY
--
-- portal-calendar-feed has served empty calendars since v30. It reads with the
-- anon key, and v30 closed every anon read on portal_events, so since
-- 2026-09-07 the function has found no events to send. Nobody was told:
-- measured on 2026-09-17, iPhone Calendar and Google Calendar on several
-- devices were still polling the All-Star feed a few hundred times a day, and
-- every answer was a valid calendar with nothing in it.
--
-- It cannot be fixed by reading with the service role. The old link is
-- `?program=allstars` -- no account, nothing secret -- and since v55 the
-- All-Star calendar belongs to All-Star families. A feed that served it again
-- would publish it at a URL anyone can guess.
--
-- HOW
--
-- The link carries a 64-hex-character random token in its path, one per
-- account, created the first time that account opens Subscribe. A calendar app
-- presents nothing else, so the token IS the credential: whoever holds the link
-- sees that account's calendar. portal_calendar_feed resolves the account and
-- applies the same rule the portal pages do -- an Academy/TNT family's link to
-- the All-Star section serves nothing.
--
-- The feed function is anon-callable for the same reason the edge function is
-- deployed without JWT verification: calendar apps cannot sign in. Guessing a
-- token is 256 bits of work.
--
-- CONSEQUENCES WORTH KNOWING
--
--   * Every existing subscription is to the old link and must be made again
--     once. The edge function answers the old link with a single all-day
--     notice saying so, instead of the silent empty calendar it served.
--   * An account that stops being an All-Star family keeps its link, and the
--     All-Star calendar behind it empties on the phone's next refresh -- an
--     empty calendar rather than an error, so the old dates are removed rather
--     than left cached.
--   * A deactivated account's links empty the same way.
--   * No policies on portal_calendar_tokens, deliberately: nothing reads or
--     writes it except the two functions below. RLS enabled with no policy is
--     the lock, as on portal_roster and portal_access_codes, not an oversight.
--
-- ROLLBACK
--
-- Drop the two portal_calendar_* functions and the table, restore v55's
-- can_see_allstars() body, and redeploy the previous portal-calendar-feed.
-- =============================================================================

-- 1. v55's rule, for any account -----------------------------------------------

create or replace function public.can_see_allstars_for(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           -- Staff: is_active_staff(), for an account named by id.
           select 1 from public.profiles
            where id = p_profile_id
              and is_active is not false
              and role in ('super_admin', 'admin', 'team')
         )
      or exists (
        select 1
          from public.portal_household_members m
          join public.portal_students s    on s.household_id = m.household_id
          join public.portal_enrollments e on e.student_id = s.id
          join public.portal_classes c     on c.id = e.class_id
         where m.profile_id = p_profile_id
           and (m.member_type = 'guardian' or s.id = m.student_id)
           and s.status = 'active'
           and e.status = 'active'
           and c.is_active
           and c.category = 'allstars'
      );
$$;

-- It takes an account id, so anyone who could call it could ask about anyone.
-- The functions that need it are SECURITY DEFINER and run as its owner.
revoke all on function public.can_see_allstars_for(uuid) from public, anon, authenticated;
grant execute on function public.can_see_allstars_for(uuid) to service_role;

create or replace function public.can_see_allstars()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_see_allstars_for(auth.uid());
$$;

-- 2. The links -----------------------------------------------------------------

create table if not exists public.portal_calendar_tokens (
  profile_id      uuid primary key references public.profiles(id) on delete cascade,
  token           text not null unique check (token ~ '^[0-9a-f]{64}$'),
  created_at      timestamptz not null default now(),
  last_fetched_at timestamptz
);

comment on table public.portal_calendar_tokens is
  'One calendar subscription link per account (v56). The token is the whole credential a calendar app presents. No policies: read and written only by portal_calendar_token() and portal_calendar_feed().';

comment on column public.portal_calendar_tokens.last_fetched_at is
  'When a calendar app last fetched this link. Null = handed out, never subscribed.';

alter table public.portal_calendar_tokens enable row level security;

-- 3. The signed-in account's own link ------------------------------------------

create or replace function public.portal_calendar_token()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_uid   uuid := auth.uid();
  v_token text;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles where id = v_uid and is_active is not false
  ) then
    raise exception 'Sign in to subscribe to the calendar.' using errcode = '42501';
  end if;

  -- One per account, kept: a second visit must hand back the link the phone
  -- already subscribed to, or every visit would quietly orphan a calendar.
  insert into public.portal_calendar_tokens (profile_id, token)
  values (v_uid, encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (profile_id) do nothing;

  select token into v_token from public.portal_calendar_tokens where profile_id = v_uid;
  return v_token;
end;
$$;

revoke all on function public.portal_calendar_token() from public, anon;
grant execute on function public.portal_calendar_token() to authenticated;

-- 4. What a link may serve -----------------------------------------------------

create or replace function public.portal_calendar_feed(
  p_token text,
  p_slug  text,
  p_from  timestamptz,
  p_to    timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_profile uuid;
  v_active  boolean;
  v_program record;
  v_events  jsonb := '[]'::jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false);
  end if;

  select t.profile_id, (p.is_active is not false)
    into v_profile, v_active
    from public.portal_calendar_tokens t
    join public.profiles p on p.id = t.profile_id
   where t.token = p_token;
  if not found then
    return jsonb_build_object('ok', false);
  end if;

  select id, slug, name, blurb
    into v_program
    from public.portal_programs
   where slug = p_slug and is_active;
  if not found then
    return jsonb_build_object('ok', false);
  end if;

  update public.portal_calendar_tokens
     set last_fetched_at = now()
   where profile_id = v_profile;

  -- A known link to a section this account may not see is answered with an
  -- EMPTY calendar, not a refusal: a phone keeps the last good copy of a feed
  -- that errors, and the point is for those dates to leave the phone.
  if v_active and (v_program.slug <> 'allstars' or public.can_see_allstars_for(v_profile)) then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id',          e.id,
             'title',       e.title,
             'description', e.description,
             'starts_at',   e.starts_at,
             'ends_at',     e.ends_at,
             'is_all_day',  e.is_all_day,
             'location',    e.location,
             'updated_at',  e.updated_at
           ) order by e.starts_at), '[]'::jsonb)
      into v_events
      from public.portal_events e
     where e.program_id = v_program.id
       and e.is_published
       and e.starts_at >= p_from
       and e.starts_at <= p_to
       -- v55's row rule, for an event on an All-Star class filed elsewhere.
       and (not public.portal_is_allstars(e.program_id, e.class_id)
            or public.can_see_allstars_for(v_profile));
  end if;

  return jsonb_build_object(
    'ok',     true,
    'name',   v_program.name,
    'blurb',  coalesce(v_program.blurb, ''),
    'events', v_events
  );
end;
$$;

revoke all on function public.portal_calendar_feed(text, text, timestamptz, timestamptz) from public;
grant execute on function public.portal_calendar_feed(text, text, timestamptz, timestamptz) to anon, authenticated;
