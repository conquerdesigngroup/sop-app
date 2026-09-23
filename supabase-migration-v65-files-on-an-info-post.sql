-- =============================================================================
-- v65 -- files on an info post
--
-- WHAT CHANGES
--
-- portal_documents gains update_id. A row with one set is an ATTACHMENT: it
-- belongs to an info post, is listed under that post, and is not a standalone
-- file. Every existing row has update_id NULL and is unaffected.
--
-- WHY THE DOCUMENTS TABLE AND NOT A NEW ONE
--
-- Everything a file on a post needs already exists here and is proven: the
-- private bucket and its signed-URL reads, the 250 MB ceiling (v39), the
-- Cloudflare Stream path for video (v40, v41), the download log (v43), and the
-- renderer that decides per file whether it is a picture, a player or a
-- download row. A second table would have to grow all of that again, and the
-- second copy is the one that ends up missing the iOS download fix.
--
-- WHY program_id BECOMES NULLABLE
--
-- v55 made an info post able to reach BOTH sections by giving it no section at
-- all -- program_id NULL, which is what portal_is_allstars() reads as "not
-- All-Star content, show it to everyone". A file hung on such a post has the
-- same audience and so needs the same value, and the only honest value is the
-- one the post carries. Filing it under a section it does not belong to would
-- put the wrong answer into the two places that ask.
--
-- It stays NOT NULL in spirit for a standalone file: the CHECK below refuses a
-- section-less row that is not an attachment, because nothing lists such a row
-- and it would be invisible in the manager forever.
--
-- WHY THE READ POLICY ASKS THE POST
--
-- An attachment's audience is not its own. It is whatever its post's is, and
-- the post already has three policies deciding that (published, All-Star,
-- and v36's one-family notes). Copying that reasoning onto the file row is how
-- the two drift apart -- one All-Star post filed under the wrong section and
-- the file is out. So the policy defers instead: the subquery runs as the
-- caller, portal_updates' own policies apply to it, and a file is readable
-- exactly when the post it hangs on is readable. Nothing to keep in step.
--
-- WHY THE PUSH TRIGGER SKIPS THESE ROWS
--
-- v42 buzzes a phone when a document is published. An info post buzzes too. A
-- post published with three files attached would buzz four times for one
-- announcement, and three of those would say "new file" about a file that is
-- only reachable through the announcement.
-- =============================================================================

BEGIN;

-- 1. The column ---------------------------------------------------------------
--
-- ON DELETE CASCADE: an attachment cannot outlive its post -- nothing lists it
-- and nothing could reach it. Note this leaves the stored OBJECT behind, the
-- same trap portal_classes has had since v9. deleteUpdate() in
-- PortalAdminContext removes the objects first for that reason; the cascade is
-- the backstop for every other route, and an orphaned object is recoverable
-- from the Supabase dashboard while a dangling row is not.

alter table public.portal_documents
  add column if not exists update_id uuid
    references public.portal_updates(id) on delete cascade;

comment on column public.portal_documents.update_id is
  'The info post this file is attached to (v65). NULL = a standalone file, listed under Files.';

-- 2. A file for everyone has no section ---------------------------------------

alter table public.portal_documents
  alter column program_id drop not null;

comment on column public.portal_documents.program_id is
  'The section this file belongs to. NULL only on an attachment to an info post that goes to everyone (v55, v65).';

alter table public.portal_documents
  drop constraint if exists portal_documents_section_or_attachment;
alter table public.portal_documents
  add constraint portal_documents_section_or_attachment
  check (program_id is not null or update_id is not null);

-- 3. The index the post's file list reads on ----------------------------------
--
-- Partial: every row written before today has update_id NULL, and an index over
-- those would be the whole table answering a question nobody asks of them.

create index if not exists idx_portal_documents_update
  on public.portal_documents (update_id)
  where update_id is not null;

-- 4. Reading ------------------------------------------------------------------
--
-- Unchanged for a standalone file -- same expression v55 left. The attachment
-- branch is the new half, and is deliberately a plain EXISTS rather than a
-- SECURITY DEFINER helper: the whole point is that portal_updates' policies
-- apply to it as the caller, which a definer function would switch off.

drop policy if exists "portal_documents_read" on public.portal_documents;
create policy "portal_documents_read" on public.portal_documents
  for select to authenticated
  using (
    is_published
    and case
      when update_id is null then
        (select public.can_see_allstars()) or not public.portal_is_allstars(program_id, class_id)
      else
        -- Qualified: portal_updates has no update_id today, but an unqualified
        -- name in a policy resolves against the subquery's table first, and a
        -- column added there later would silently rewire this test.
        exists (select 1 from public.portal_updates u where u.id = portal_documents.update_id)
    end
  );

-- portal_documents_read_staff is untouched: it ORs with this one, and staff
-- pass the standalone branch already.

-- 5. One buzz per announcement -------------------------------------------------
--
-- In the trigger's WHEN clause rather than inside portal_push_enqueue(): the
-- function is shared with portal_updates, which has no update_id, and a guard
-- written in there would have to name the table it is running on to avoid
-- asking a portal_updates row for a column it does not have. WHEN is evaluated
-- against this table's row only, so there is nothing to get wrong.
--
-- `of is_published` is kept: the trigger still only fires when that column is
-- written, and WHEN narrows it further to standalone files.

drop trigger if exists trg_portal_documents_push on public.portal_documents;
create trigger trg_portal_documents_push
  after insert or update of is_published on public.portal_documents
  for each row
  when (NEW.update_id is null)
  execute function public.portal_push_enqueue('document');

COMMIT;
