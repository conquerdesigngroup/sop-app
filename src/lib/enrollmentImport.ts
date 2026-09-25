/**
 * Syncing class rosters from Enrolio's "Export Contacts — Current Families" CSV.
 *
 * This file reads the export and calls admin_enrollment_import (v67), which
 * holds every rule — see the migration header for them and for why "new" and
 * "gone" are measured against the last sync rather than against the rosters.
 * Nothing here decides who is enrolled in what; it only turns a spreadsheet
 * into clean lists, where it can be unit tested. The RPC validates everything
 * again and does not trust this file.
 *
 * WHAT LEAVES THE BROWSER
 *
 * Contact id, email, the contact's name, tags and the All Students names.
 * Phone numbers, notes and activity dates are in the export and are dropped
 * here — the sync has no use for them.
 *
 * THE MESSES IT CLEANS UP
 *
 *  - Tags are one comma-separated cell, lower-cased by Enrolio, and
 *    HTML-escaped: "turns &amp; jumps". Decoded here, so an escaped and a plain
 *    copy of the same class collapse into one tag.
 *  - All Students is separated by commas OR newlines (the cell is quoted and
 *    carries real line breaks), is sometimes incomplete and sometimes empty.
 *  - Enrolio occasionally grows a trailing asterisk on a dancer's name.
 */

import { parseCsvToObjects } from './csv';
import { parseExportDate } from './classImport';
import { supabase } from './supabase';

/**
 * Header names as the contacts export writes them. Anything else is dropped.
 * Last Activity is read only to date the file (see exportedOn) and is never
 * sent anywhere.
 */
export const CONTACT_HEADER_MAP: Record<string, string> = {
  'contact id': 'contact_id',
  'first name': 'first_name',
  'last name': 'last_name',
  email: 'email',
  tags: 'tags',
  'all students': 'students',
  'last activity': 'last_activity',
};

/** "Sep 24 2026 05:38 AM" -> "2026-09-24". The time is not needed. */
export const parseActivityDate = (raw: string): string | null =>
  parseExportDate((raw || '').trim().split(/\s+/).slice(0, 3).join(' ')) || null;

/**
 * The entities the export writes, plus numeric ones. `&amp;` goes last so that
 * "&amp;lt;" — an escaped "&lt;" — decodes once, to "&lt;", and not twice.
 */
export const decodeEntities = (raw: string): string =>
  (raw || '')
    .replace(/&#(\d{1,6});/g, (m, n) => {
      const code = Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(/&#x([0-9a-f]{1,6});/gi, (m, h) => {
      const code = parseInt(h, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** A tag the way the RPC compares it with a class title. */
export const normaliseTag = (raw: string): string => collapse(decodeEntities(raw)).toLowerCase();

const uniqueBy = <T>(items: T[], key: (item: T) => string): T[] => {
  const seen = new Set<string>();
  return items.filter(item => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Every tag, class or not. Which ones are classes is the database's call — it
 * has the class list — and a tag dropped here as "not a class" would look to
 * the sync like a class the family left.
 */
export const splitTags = (raw: string): string[] =>
  uniqueBy((raw || '').split(',').map(normaliseTag).filter(Boolean), t => t);

/** A dancer's name as written, minus the stray asterisk and extra spaces. */
export const cleanName = (raw: string): string =>
  collapse(decodeEntities(raw).replace(/\*+\s*$/, ''));

/** All Students: commas or newlines. "Mia Chen" and "mia chen" are one dancer. */
export const splitStudents = (raw: string): string[] =>
  uniqueBy((raw || '').split(/[,\r\n]+/).map(cleanName).filter(Boolean), n => n.toLowerCase());

/** One export row, as admin_enrollment_import takes it. */
export interface EnrollmentImportContact {
  /** 1-based, counting the header as row 1 — what a spreadsheet shows. */
  row: number;
  contact_id: string;
  email: string;
  first_name: string;
  last_name: string;
  tags: string[];
  students: string[];
}

export interface ContactsCsvParse {
  contacts: EnrollmentImportContact[];
  /** Rows dropped before the server saw them, with the reason. */
  skipped: { row: number; reason: string }[];
  /**
   * The newest Last Activity in the file, as a date. Enrolio has no "exported
   * at" field, but across four real exports the newest activity was always
   * from the same day as the download — close enough to notice somebody
   * picking last week's file out of Downloads.
   */
  exportedOn: string | null;
  error?: string;
}

export const contactsCsvToImport = (text: string): ContactsCsvParse => {
  const { rows: raw, headers } = parseCsvToObjects(text, CONTACT_HEADER_MAP);
  if (raw.length === 0) {
    return { contacts: [], skipped: [], exportedOn: null, error: 'Need a header row and at least one contact.' };
  }
  if (!['contact_id', 'email', 'tags', 'students'].every(h => headers.includes(h))) {
    return {
      contacts: [],
      skipped: [],
      exportedOn: null,
      error: 'The header row must include "Contact Id", "Email", "Tags" and "All Students" — ' +
        'this looks like a different export. Use Export Contacts → Current Families.',
    };
  }

  const contacts: EnrollmentImportContact[] = [];
  const skipped: ContactsCsvParse['skipped'] = [];
  let exportedOn: string | null = null;

  raw.forEach((r, i) => {
    const row = i + 2;
    const active = parseActivityDate(r.last_activity || '');
    if (active && (!exportedOn || active > exportedOn)) exportedOn = active;

    const contactId = (r.contact_id || '').trim();
    const email = (r.email || '').trim().toLowerCase();
    if (!contactId && !email) {
      skipped.push({ row, reason: 'no contact id or email' });
      return;
    }
    contacts.push({
      row,
      contact_id: contactId,
      email,
      first_name: (r.first_name || '').trim(),
      last_name: (r.last_name || '').trim(),
      tags: splitTags(r.tags || ''),
      students: splitStudents(r.students || ''),
    });
  });

  return { contacts, skipped, exportedOn };
};

// ---------------------------------------------------------------- the RPC

export type EnrollmentImportMode = 'preview' | 'apply' | 'baseline';

interface ClassRef {
  class_id?: string;
  class_name: string | null;
  day_of_week: number | null;
  start_time: string | null;
}

export interface EnrollmentAdd extends ClassRef {
  student_id: string | null;
  student_name: string;
  new_dancer: boolean;
  household_id: string | null;
  family: string | null;
  email: string | null;
  reason: 'only_dancer' | 'only_sibling_in_age_range';
}

export interface EnrollmentDrop extends ClassRef {
  enrollment_id: string;
  student_id: string;
  student_name: string;
  household_id: string;
  family: string | null;
  email: string;
  enrolled_on: string;
  /** The last day on the roster: the day before the sync, or an earlier end already on the place. */
  last_day: string;
}

export type UnassignedReason =
  | 'no_dancers'
  | 'export_names_unknown_dancer'
  /** A name in All Students is only a student marked inactive — probably back (v69). */
  | 'export_names_inactive_dancer'
  /** The family's one dancer is 3 or more years outside the class's age range (v69). */
  | 'only_dancer_outside_age_range'
  | 'missing_birthday'
  | 'no_sibling_in_age_range'
  | 'several_siblings_in_age_range';

export interface EnrollmentUnassigned extends ClassRef {
  household_id: string | null;
  family: string | null;
  email: string | null;
  age_min: number | null;
  age_max: number | null;
  reason: UnassignedReason;
  dancers: { name: string; age: number | null }[];
  export_names: string[];
  /** Names in All Students that are none of the family's students, each with the one it is perhaps a misspelling of. */
  unknown_names: { name: string; likely: string | null }[];
  /** Names in All Students that are only a student marked inactive. */
  inactive_names: { name: string; dancer: string }[];
}

export type ConflictReason =
  | 'already_dropped'
  | 'already_completed'
  | 'already_active'
  | 'class_has_no_season'
  | 'class_off_schedule'
  | 'marked_before_start';

export interface EnrollmentConflict extends ClassRef {
  student_id: string | null;
  student_name: string;
  family: string | null;
  conflict: ConflictReason;
  /** already_*: the old place's end; marked_before_start: the latest such mark. */
  on: string | null;
}

/** What still stops a whole file. Anything about one place is held instead (v69). */
export type BlockReason = 'no_class_tags' | 'duplicate_class_title';

export interface EnrollmentBlock extends ClassRef {
  kind: 'file' | 'class';
  reason: BlockReason;
  on: string | null;
  detail: string | null;
  student_name: string | null;
}

export type HeldDropReason =
  | 'several_active_places'
  | 'starts_after_drop_day'
  | 'marked_after_drop_day';

/** A place whose tag is gone but which cannot be ended safely yet: listed, left as it is, looked at again next sync. */
export interface EnrollmentHeldDrop extends ClassRef {
  student_id: string;
  student_name: string;
  family: string | null;
  reason: HeldDropReason;
  /** starts_after_drop_day: the place's start; marked_after_drop_day: the latest mark. */
  on: string | null;
}

export interface EnrollmentNewFamily {
  row: number | null;
  contact_id: string | null;
  email: string;
  contact_name: string;
  family: string | null;
  dancers: string[];
}

export type NotImportedReason =
  | 'invalid_email'
  | 'email_on_two_families'
  | 'duplicate_contact'
  | 'no_dancer_name'
  | 'dancer_name_needs_surname';

export interface EnrollmentNotImported {
  row: number | null;
  contact_id: string | null;
  email: string | null;
  contact_name: string;
  reason: NotImportedReason;
  names: string[];
}

export interface EnrollmentMissingFamily {
  household_id: string;
  family: string | null;
  email: string;
  dancers: number;
  active_enrollments: number;
}

export interface Fingerprint {
  attendance: { rows: number; md5: string };
  sessions: { rows: number; md5: string };
  history: { rows: number; md5: string };
  past_rosters: { rows: number; md5: string; before: string };
}

export interface EnrollmentImportResult {
  mode: EnrollmentImportMode;
  filename: string | null;
  as_of: string;
  drop_day: string;
  first_import: boolean;
  /** The as-of date of the last recorded or applied sync; null before the first. */
  last_sync_on: string | null;
  plan_hash: string;
  baseline_hash: string;
  /** Apply needs p_confirm: the drop is large enough to be a damaged export. */
  confirm_drops: boolean;
  /** Apply needs p_confirm: so many places or new families that it may be the wrong export (v69). */
  confirm_adds: boolean;
  counts: {
    contacts: number;
    families: number;
    adds: number;
    drops: number;
    held_drops: number;
    unassigned: number;
    conflicts: number;
    blocked: number;
    first_seen_families: number;
    new_families: number;
    new_dancers: number;
    not_imported: number;
    merged_contacts: number;
    email_conflicts: number;
    missing_families: number;
    held_untagged: number;
    tagged_unheld: number;
    spelling_matches: number;
    memory_changes: number;
    unmatched_class_tags: number;
  };
  adds: EnrollmentAdd[];
  drops: EnrollmentDrop[];
  held_drops: EnrollmentHeldDrop[];
  /** Every tagged family's tag for the class gone at once: dancers to drop, dancers held, families. */
  whole_class_drops: (ClassRef & { dropping: number; held: number; families: number })[];
  unassigned: EnrollmentUnassigned[];
  conflicts: EnrollmentConflict[];
  blocked: EnrollmentBlock[];
  /** Families the sync has never seen that existed at the starting point: recorded, not acted on. */
  first_seen_families: { household_id: string; family: string | null; email: string; tags: number; active_enrollments: number }[];
  new_families: EnrollmentNewFamily[];
  not_imported: EnrollmentNotImported[];
  merged_contacts: { household_id: string; family: string | null; email: string; contacts: number }[];
  email_conflicts: { email: string; families: string[] }[];
  missing_families: EnrollmentMissingFamily[];
  /** Places held in a class the family was never tagged for — the sync cannot drop these. */
  held_untagged: (ClassRef & { student_name: string; family: string | null; enrolled_on: string })[];
  /** Remembered tags nobody in the family holds — usually left behind in Enrolio. */
  tagged_unheld: (ClassRef & { family: string | null; email: string })[];
  unmatched_tags: { tag: string; families: number; looks_like_class: boolean }[];
  /** Names in All Students taken for a dancer the app spells differently: same first name, surname close. */
  spelling_matches: { family: string | null; export_name: string; dancer: string }[];
  /** Tags remembered and forgotten, and families marked seen for the first time. */
  memory_changes: { added: number; removed: number; families_seen: number };
  /** What a starting point would record. */
  baseline_counts: { families: number; tags: number };
  /** apply only */
  applied?: boolean;
  fingerprint?: { before: Fingerprint; after: Fingerprint };
  /** baseline only */
  recorded?: boolean;
  tags_recorded?: number;
}

/**
 * One call to the RPC. Its messages are written to be shown to a person as-is
 * ("… Nothing was changed — sync again tomorrow."), so they are thrown intact.
 */
export const runEnrollmentImport = async (
  mode: EnrollmentImportMode,
  contacts: EnrollmentImportContact[],
  expect: string | null,
  filename: string | null,
  confirm = false,
): Promise<EnrollmentImportResult> => {
  const { data, error } = await supabase.rpc('admin_enrollment_import', {
    p_contacts: contacts,
    p_mode: mode,
    p_expect: expect,
    p_filename: filename,
    p_confirm: confirm,
  });
  // PostgREST's "no such function": this screen deployed ahead of its migration.
  if (error?.code === 'PGRST202') {
    throw new Error('Roster sync is not set up in the database yet (migration v69). Nothing was changed.');
  }
  if (error) throw new Error(error.message || 'The roster sync failed');
  if (!data) throw new Error('The roster sync returned nothing');
  // v68 answers with the same signature but without what this screen reads.
  // Only a preview is refused for it: nothing is written by one, so "nothing
  // was changed" is true — and an apply only ever follows a v69 preview.
  if (mode === 'preview' && !Array.isArray((data as EnrollmentImportResult).held_drops)) {
    throw new Error('Roster sync needs the v69 database update first. Nothing was changed.');
  }
  return data as EnrollmentImportResult;
};

/** Roster changes applying this preview would make: places added, places ended, families created. */
export const changeCount = (r: EnrollmentImportResult): number =>
  r.counts.adds + r.counts.drops + r.counts.new_families;

/**
 * What the sync would remember for next time: tags remembered or forgotten, and
 * families seen for the first time. Worth applying on their own: left unsaved,
 * a later drop is missed, a later re-join hidden, or a family's next real class
 * taken for an old tag.
 */
export const memoryChangeCount = (r: EnrollmentImportResult): number =>
  r.memory_changes.added + r.memory_changes.removed + (r.memory_changes.families_seen ?? 0);
