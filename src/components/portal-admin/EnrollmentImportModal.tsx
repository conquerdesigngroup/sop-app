import React, { useCallback, useEffect, useRef, useState } from 'react';
import { theme } from '../../theme';
import { Button, Modal } from '../ui';
import { CustomCheckbox } from '../CustomCheckbox';
import { useRefreshable } from '../../contexts/RefreshContext';
import { dayName, formatTime } from '../../lib/portal';
import {
  contactsCsvToImport, runEnrollmentImport, changeCount, memoryChangeCount,
  ContactsCsvParse, EnrollmentImportResult, EnrollmentImportMode,
  EnrollmentUnassigned, EnrollmentConflict, EnrollmentBlock, EnrollmentHeldDrop, NotImportedReason,
} from '../../lib/enrollmentImport';

/**
 * Sync class rosters from the Enrolio contacts export: choose the file, read
 * every change, apply it — or nothing.
 *
 * The rules live in admin_enrollment_import (v67, corrected by v68 and v69)
 * and the preview is the database's own answer, not a guess made here. This screen's
 * job is to make that answer readable on a phone and to make applying it hard
 * to do by accident: nothing is written until Apply, Apply sends the hash of
 * exactly the preview on screen, and the database refuses if anything moved
 * since. A large drop, a large addition and an export older than the last
 * sync each have to be confirmed in words first.
 *
 * SLOW TAPS (CLAUDE.md)
 *
 * Previewing and applying are one round trip each and take a few seconds. Both
 * disable the control and guard it with a ref as well — a second tap can land
 * before the re-render that disables the button — replace the body with a
 * striped bar and a sentence saying what is happening, and end on a screen
 * that says what happened. A preview can be abandoned, so it has Cancel. An
 * apply cannot — the database either takes all of it or none of it — so it
 * says that instead of offering a Cancel that would only hide the answer. An
 * answer slow in coming is said to be, and after a while the dialog may close:
 * the activity log then says whether the sync went through.
 *
 * REFRESH
 *
 * The preview registers with useRefreshable, so the header button, a pull or
 * coming back to the app re-checks it against the rosters. That is silent, as
 * the rule asks — but a confirm-then-apply screen must not change under
 * somebody's thumb unannounced, so when the answer differs the screen says so
 * and any confirmation has to be given again.
 */

type Phase = 'choose' | 'previewing' | 'preview' | 'applying' | 'applied' | 'recording' | 'recorded';

interface ChosenFile {
  name: string;
  parse: ContactsCsvParse;
}

// ---------------------------------------------------------------- wording

type ClassLike = { class_name: string | null; day_of_week: number | null; start_time: string | null };

/** "Mini Jazz 1 · Mon 4:00 PM" — several classes share a name, never a slot. */
export const classLabel = (c: ClassLike): string => {
  const when = [dayName(c.day_of_week)?.slice(0, 3), formatTime(c.start_time)].filter(Boolean).join(' ');
  return [c.class_name ?? 'a class', when].filter(Boolean).join(' · ');
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "2026-09-23" -> "Wed 23 Sep". A calendar date with no timezone, spelled out
 * by hand: toLocaleDateString gives "Sep" in one browser and "Sept" in the
 * next, depending on its copy of the locale data.
 */
export const shortDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d || m > 12) return iso;
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
};

/** The calendar day after an ISO date, as an ISO date. */
const dayAfter = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** First-seen families with class tags to check. One with none has nothing to decide. */
const firstSeenToCheck = (r: EnrollmentImportResult) => r.first_seen_families.filter(f => f.tags > 0);

/** Everything listed for a person, counted the same way on the preview and on the end screen. */
const forAPerson = (r: EnrollmentImportResult): number =>
  r.counts.unassigned + r.counts.conflicts + (r.counts.held_drops ?? 0) + r.counts.email_conflicts +
  firstSeenToCheck(r).length;

const ageRange = (u: EnrollmentUnassigned): string | null =>
  u.age_min !== null && u.age_max !== null ? `aged ${u.age_min}–${u.age_max}`
    : u.age_min !== null ? `aged ${u.age_min} or over`
    : u.age_max !== null ? `aged ${u.age_max} or under`
    : null;

// There is no enrolment editor in the app yet, so "by hand" is the honest
// word for anything the sync will not decide; what resolves itself says so.
const PICK_BY_HAND =
  'The app cannot choose for you: correct the tag in Enrolio, or have the place added by hand.';

export const unassignedText = (u: EnrollmentUnassigned): string => {
  const dancers = u.dancers.map(d => (d.age === null ? d.name : `${d.name} (${d.age})`)).join(', ');
  const range = ageRange(u);
  switch (u.reason) {
    case 'no_dancers':
      return 'This family has no dancers in the app yet. Add them with the roster import; the next sync then places this tag.';
    case 'export_names_unknown_dancer':
    case 'export_names_inactive_dancer': {
      // Names are never guessed at: a first name spelled differently is named
      // with the student it perhaps is, and either way there is a next step.
      const inactive = u.inactive_names ?? [];
      const likely = u.unknown_names.filter(n => n.likely);
      const strangers = u.unknown_names.filter(n => !n.likely);
      return [
        inactive.length > 0 &&
          `Enrolio lists ${inactive.map(n => (n.name === n.dancer ? n.name : `${n.name} (in the app as ${n.dancer})`))
            .join(', ')}, marked inactive in the app — probably back. If so, have them set active by hand, and ` +
          'the next sync places this tag.',
        likely.length > 0 &&
          `Enrolio lists ${likely.map(n => `${n.name} — perhaps ${n.likely}, spelled differently`).join('; ')}. ` +
          'If so, the two spellings need to match — in Enrolio, or in the app by hand — and the next sync places ' +
          'this tag. If not, add them with the roster import (with a birthday).',
        strangers.length > 0 &&
          `Enrolio lists ${strangers.map(n => n.name).join(', ')}, who ${strangers.length === 1 ? 'is' : 'are'} not ` +
          'in the app. If new, add them with the roster import (with a birthday), and the next sync places this tag.',
      ].filter(Boolean).join(' ');
    }
    case 'only_dancer_outside_age_range':
      return `${dancers || 'The dancer'} is the family’s only dancer, and this class is for dancers ` +
        `${range ?? 'of another age'} — 3 or more years off. The tag may be for a child the app does not have ` +
        `yet: add them with the roster import and the next sync places it. ${PICK_BY_HAND}`;
    case 'missing_birthday':
      return `${dancers || 'A dancer'} — no birthday on file yet, so the age range cannot pick one. The roster ` +
        'import fills birthdays in; the next sync then places this tag.';
    case 'no_sibling_in_age_range':
      return `${dancers} — none is ${range ?? 'in the age range'}. ${PICK_BY_HAND}`;
    case 'several_siblings_in_age_range':
      return range
        ? `${dancers} — more than one is ${range}. ${PICK_BY_HAND}`
        : `${dancers} — the class has no age range, so it could be any of them. ${PICK_BY_HAND}`;
    default:
      return dancers;
  }
};

export const conflictText = (c: EnrollmentConflict): string => {
  switch (c.conflict) {
    case 'already_dropped':
      return `left this class on ${shortDate(c.on)} and is tagged for it again. Adding a place today would ` +
        'clash with the old one, and reopening it would put them back on every roster since — so the place ' +
        'has to be reopened by hand.';
    case 'already_completed':
      return 'has finished this class this season. If they are back, the place has to be reopened by hand.';
    case 'already_active':
      return 'already holds a place in this class.';
    case 'class_has_no_season':
      return 'the class has no season set. Set it on the class, then sync again.';
    case 'class_off_schedule':
      return 'the class is switched off in the app. If it is running, turn on "Show on the schedule", then sync again.';
    case 'marked_before_start':
      return `has attendance marks in this class from ${shortDate(c.on)}, before a place starting today would ` +
        `begin. Add the place by hand, starting on or before ${shortDate(c.on)}.`;
    default:
      return '';
  }
};

/** What stops the whole file. Anything about one place is held instead, and listed for a person. */
export const blockText = (b: EnrollmentBlock): string => {
  switch (b.reason) {
    case 'no_class_tags':
      return 'This file has no class tags at all — it looks like a different or damaged export. Download ' +
        'Export Contacts → Current Families again, with the Tags column.';
    case 'duplicate_class_title':
      return `More than one class has the Enrolio title "${b.detail}", so its tag cannot be told apart. Keep ` +
        'exactly one of them switched on in the app, or rename one in Enrolio and import classes again.';
    default:
      return 'Something in this file blocks the sync.';
  }
};

/** A place whose tag is gone but which cannot be ended safely yet. */
export const heldDropText = (h: EnrollmentHeldDrop): string => {
  switch (h.reason) {
    case 'several_active_places':
      return 'holds more than one active place in this class, so which one ends is unclear. End the extra ' +
        'place by hand; the next sync then drops the other.';
    case 'starts_after_drop_day':
      return `the place starts ${shortDate(h.on)}, but the tag is gone from Enrolio. If they are not coming, the ` +
        'place has to be ended by hand' +
        (h.on ? `; left alone, a sync from ${shortDate(dayAfter(h.on))} drops it.` : '.');
    case 'marked_after_drop_day':
      return `was marked in this class on ${shortDate(h.on)}, after the tag went from Enrolio. If they have ` +
        'left, sync again tomorrow and the place is dropped; if not, put the tag back in Enrolio.';
    default:
      return '';
  }
};

const NOT_IMPORTED: Record<NotImportedReason, string> = {
  invalid_email: 'no usable email address',
  email_on_two_families: 'this email belongs to two families in the app, so it cannot say which',
  duplicate_contact: 'two contacts share this email and neither is in the app — merge them in Enrolio',
  no_dancer_name: 'no dancer named in All Students',
  dancer_name_needs_surname: 'a dancer’s name has no surname to file them under',
};

/** How long an apply may take before the screen says it is slow, and lets the dialog close. */
const SLOW_ANSWER_MS = 45_000;
const SLOW_ANSWER = 'Still no answer — the connection may have dropped. You can close this now: the sync either ' +
  'went through completely or changed nothing. Preview the file again to see which — one that went through ' +
  'leaves nothing to apply.';

/** Failures that mean the request never reached the database. */
const NETWORK = /failed to fetch|networkerror|load failed|network request failed/i;

export const describeFailure = (e: unknown, fallback: string): string => {
  const message = String((e as any)?.message || '').trim();
  if (!message) return `${fallback} Check your connection and try again.`;
  if (NETWORK.test(message)) return 'Couldn’t reach the database. Check your connection and try again.';
  // The database's own sentences are shown as written.
  return /[.!?]$/.test(message) ? message : `${message}.`;
};

// ------------------------------------------------------------- small parts

const text = (size: 'body' | 'bodySmall' | 'caption' | 'captionSmall', color: string): React.CSSProperties => ({
  ...theme.typography[size],
  fontFamily: theme.fonts.primary,
  color,
  margin: 0,
  minWidth: 0,
  overflowWrap: 'anywhere',
});

const Section: React.FC<{
  label: string;
  count?: number;
  tone?: 'normal' | 'warning' | 'error';
  children: React.ReactNode;
}> = ({ label, count, tone = 'normal', children }) => {
  const accent = tone === 'error' ? theme.colors.status.error
    : tone === 'warning' ? theme.colors.status.warning
    : theme.colors.bdr.primary;
  // Amber carries the rule, not the words: amber text on the light-mode dialog
  // is 2.2:1, well under what small type needs.
  const labelColor = tone === 'error' ? accent
    : tone === 'warning' ? theme.colors.txt.primary
    : theme.colors.txt.tertiary;
  return (
    <section
      aria-label={label}
      style={{
        borderLeft: `2px solid ${accent}`,
        paddingLeft: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        minWidth: 0,
      }}
    >
      <p style={{
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.mono,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: labelColor,
        margin: 0,
      }}>
        {label}{count !== undefined ? ` · ${count}` : ''}
      </p>
      {children}
    </section>
  );
};

const Rows: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
    {children}
  </ul>
);

const Row: React.FC<{ title: React.ReactNode; detail?: React.ReactNode }> = ({ title, detail }) => (
  <li style={{ minWidth: 0 }}>
    <p style={text('bodySmall', theme.colors.txt.primary)}>{title}</p>
    {detail && <p style={text('captionSmall', theme.colors.txt.tertiary)}>{detail}</p>}
  </li>
);

/** Informational lists: there to be checked, not read every time. */
const Fold: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <details style={{ minWidth: 0 }}>
    <summary style={{
      ...text('caption', theme.colors.txt.secondary),
      cursor: 'pointer',
      padding: '4px 0',
    }}>
      {label}
    </summary>
    <div style={{ paddingTop: '8px' }}>{children}</div>
  </details>
);

/** A confirmation in words, which Apply waits for. */
const Confirm: React.FC<{ checked: boolean; onChange: (on: boolean) => void; label: string }> = (
  { checked, onChange, label },
) => (
  <CustomCheckbox checked={checked} onChange={onChange} label={label} style={{ alignItems: 'flex-start' }} />
);

const readText = (f: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(f);
  });

/**
 * The Modal footer is a right-aligned row that does not wrap, and "Record as
 * starting point" beside Cancel is wider than a 320px phone leaves it. Right
 * alignment splits overflow the same way centring does — off the left edge,
 * where nothing can scroll to it — so the buttons get a row that wraps, and
 * may shrink and wrap their own text rather than overflow.
 */
const FooterRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '12px', width: '100%', minWidth: 0 }}>
    {children}
  </div>
);
const footerButton: React.CSSProperties = { flex: '0 1 auto', maxWidth: '100%', minWidth: 0 };

/** Striped, indeterminate: one round trip has no progress to report. */
const Working: React.FC<{ label: string; message: string; note?: string }> = ({ label, message, note }) => (
  <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
    <div
      role="progressbar"
      aria-label={label}
      style={{
        height: '6px',
        borderRadius: '3px',
        backgroundColor: theme.colors.bg.tertiary,
        overflow: 'hidden',
      }}
    >
      {/* index.css freezes the stripes under prefers-reduced-motion; the
          sentence below says the same thing without them. */}
      <div className="progress-striped" style={{ height: '100%', width: '100%', backgroundColor: theme.colors.primary }} />
    </div>
    <p style={text('bodySmall', theme.colors.txt.primary)}>{message}</p>
    {note && <p style={text('captionSmall', theme.colors.txt.tertiary)}>{note}</p>}
  </div>
);

// ------------------------------------------------------------- the preview

/** The lists worth a glance but not a decision, folded. */
const Informational: React.FC<{ r: EnrollmentImportResult; file: ChosenFile }> = ({ r, file }) => {
  const classTags = r.unmatched_tags.filter(t => t.looks_like_class);
  const seenBlank = r.first_seen_families.filter(f => f.tags === 0);
  const anything = r.missing_families.length + r.merged_contacts.length + classTags.length +
    file.parse.skipped.length + r.tagged_unheld.length + r.held_untagged.length +
    r.spelling_matches.length + seenBlank.length;
  if (anything === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {r.spelling_matches.length > 0 && (
        <Fold label={`${plural(r.spelling_matches.length, 'name')} in Enrolio spelled differently from the app — taken as the same dancer`}>
          <p style={{ ...text('captionSmall', theme.colors.txt.tertiary), marginBottom: '8px' }}>
            Same first name, and a surname a middle name, a second surname or a letter or two away. If one of
            these is really a different child, add them with the roster import.
          </p>
          <Rows>
            {r.spelling_matches.map((m, i) => (
              <Row key={i} title={`${m.export_name} → ${m.dancer}`} detail={m.family ?? undefined} />
            ))}
          </Rows>
        </Fold>
      )}
      {seenBlank.length > 0 && (
        <Fold label={`${plural(seenBlank.length, 'family', 'families')} in a sync for the first time, with no class tags — nothing to check`}>
          <Rows>
            {seenBlank.map(f => <Row key={f.household_id} title={f.family ?? f.email} detail={f.email} />)}
          </Rows>
        </Fold>
      )}
      {r.missing_families.length > 0 && (
        <Fold label={`${plural(r.missing_families.length, 'family', 'families')} in the app but not in this file — left as they are`}>
          <Rows>
            {r.missing_families.map(m => (
              <Row
                key={m.household_id}
                title={m.family ?? m.email}
                detail={`${m.email} · ${plural(m.active_enrollments, 'active class', 'active classes')}`}
              />
            ))}
          </Rows>
        </Fold>
      )}
      {r.merged_contacts.length > 0 && (
        <Fold label={`${plural(r.merged_contacts.length, 'family', 'families')} with two contact records — tags combined`}>
          <Rows>
            {r.merged_contacts.map(m => (
              <Row key={m.household_id} title={m.family ?? m.email} detail={`${m.email} · ${m.contacts} contacts`} />
            ))}
          </Rows>
        </Fold>
      )}
      {r.held_untagged.length > 0 && (
        <Fold label={`${plural(r.held_untagged.length, 'place')} with no tag on the family — the sync can never drop these`}>
          <p style={{ ...text('captionSmall', theme.colors.txt.tertiary), marginBottom: '8px' }}>
            If one of these dancers has left, the place has to be ended by hand — or tag the family in Enrolio
            and a later sync will drop it when the tag goes.
          </p>
          <Rows>
            {r.held_untagged.map((h, i) => (
              <Row key={i} title={`${h.student_name} · ${classLabel(h)}`} detail={`since ${shortDate(h.enrolled_on)}`} />
            ))}
          </Rows>
        </Fold>
      )}
      {r.tagged_unheld.length > 0 && (
        <Fold label={`${plural(r.tagged_unheld.length, 'tag')} for classes nobody in the family takes — ignored`}>
          <p style={{ ...text('captionSmall', theme.colors.txt.tertiary), marginBottom: '8px' }}>
            Usually left in Enrolio after a class change. Removing them there keeps this list short.
          </p>
          <Rows>
            {r.tagged_unheld.map((t, i) => <Row key={i} title={`${t.family ?? t.email} · ${classLabel(t)}`} />)}
          </Rows>
        </Fold>
      )}
      {classTags.length > 0 && (
        <Fold label={`${plural(classTags.length, 'class tag')} matching no class in the app — ignored`}>
          <p style={{ ...text('captionSmall', theme.colors.txt.tertiary), marginBottom: '8px' }}>
            Usually titles from older schedules. A new class shows up here until Import classes has added it.
          </p>
          <Rows>
            {classTags.map(t => (
              <Row key={t.tag} title={t.tag} detail={plural(t.families, 'family', 'families')} />
            ))}
          </Rows>
        </Fold>
      )}
      {file.parse.skipped.length > 0 && (
        <Fold label={`${plural(file.parse.skipped.length, 'row')} skipped while reading the file`}>
          <Rows>
            {file.parse.skipped.map(s => <Row key={s.row} title={`Row ${s.row}`} detail={s.reason} />)}
          </Rows>
        </Fold>
      )}
    </div>
  );
};

const NotImported: React.FC<{ r: EnrollmentImportResult }> = ({ r }) =>
  r.not_imported.length === 0 ? null : (
    <Section label="Not imported" count={r.not_imported.length}>
      <Rows>
        {r.not_imported.map((n, i) => (
          <Row
            key={i}
            title={`Row ${n.row ?? '?'} · ${n.contact_name || n.email || n.contact_id || 'a contact'}`}
            detail={NOT_IMPORTED[n.reason] ?? n.reason}
          />
        ))}
      </Rows>
    </Section>
  );

const Blocked: React.FC<{ r: EnrollmentImportResult }> = ({ r }) =>
  r.blocked.length === 0 ? null : (
    <Section label="Can’t apply yet" count={r.blocked.length} tone="error">
      <Rows>
        {r.blocked.map((b, i) => <Row key={i} title={blockText(b)} />)}
      </Rows>
      <p style={text('captionSmall', theme.colors.txt.tertiary)}>Nothing is changed until all of these clear.</p>
    </Section>
  );

const FirstRun: React.FC<{ r: EnrollmentImportResult; file: ChosenFile }> = ({ r, file }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', minWidth: 0 }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <p style={{ ...text('body', theme.colors.txt.primary), fontWeight: 600 }}>
        First sync — nothing will change on the rosters
      </p>
      <p style={text('captionSmall', theme.colors.txt.tertiary)}>
        {file.name} · {plural(r.counts.contacts, 'contact')} · {plural(r.counts.families, 'family', 'families')} matched
      </p>
    </div>
    <Section label="Starting point" tone="warning">
      <p style={text('bodySmall', theme.colors.txt.primary)}>
        This records the {plural(r.baseline_counts.tags, 'class tag')} in this file, and the{' '}
        {plural(r.baseline_counts.families, 'family', 'families')} it lists, as where things stand. From the next
        export on, only what changed since is applied.
      </p>
      <p style={text('bodySmall', theme.colors.txt.primary)}>
        Use the export the rosters were last brought up to date with. Enrolio does not always remove a tag when a
        family leaves a class, so without this the app could not tell a class a family has just joined from a tag
        that has sat on their record for weeks.
      </p>
    </Section>
    <Blocked r={r} />
    {r.new_families.length > 0 && (
      <p style={text('bodySmall', theme.colors.txt.secondary)}>
        {plural(r.new_families.length, 'contact')} in this file {r.new_families.length === 1 ? 'is' : 'are'} not in
        the app yet. The first sync after this one adds {r.new_families.length === 1 ? 'it' : 'them'}.
      </p>
    )}
    <NotImported r={r} />
    <Informational r={r} file={file} />
  </div>
);

const Preview: React.FC<{
  r: EnrollmentImportResult;
  file: ChosenFile;
  stale: boolean;
  confirmStale: boolean;
  onConfirmStale: (on: boolean) => void;
  confirmDrops: boolean;
  onConfirmDrops: (on: boolean) => void;
  confirmAdds: boolean;
  onConfirmAdds: (on: boolean) => void;
}> = ({ r, file, stale, confirmStale, onConfirmStale, confirmDrops, onConfirmDrops, confirmAdds, onConfirmAdds }) => {
  const changes = changeCount(r);
  const person = forAPerson(r);
  const seenToCheck = firstSeenToCheck(r);
  // A first-seen family's tags are all "added"; they are said as its own, not
  // as tags that changed in Enrolio.
  const firstSeenTags = r.first_seen_families.reduce((n, f) => n + f.tags, 0);
  const tagChanges = Math.max(r.memory_changes.added - firstSeenTags, 0) + r.memory_changes.removed;
  const summary = [
    r.counts.adds > 0 && `${r.counts.adds} to add`,
    r.counts.drops > 0 && `${r.counts.drops} to drop`,
    r.counts.new_families > 0 && plural(r.counts.new_families, 'new family', 'new families'),
    person > 0 && `${person} for a person to decide`,
  ].filter(Boolean).join(' · ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <p style={{ ...text('body', theme.colors.txt.primary), fontWeight: 600 }}>
          {summary || 'No roster changes in this file'}
        </p>
        <p style={text('captionSmall', theme.colors.txt.tertiary)}>
          {file.name} · {plural(r.counts.contacts, 'contact')} · {plural(r.counts.families, 'family', 'families')} matched
          {r.last_sync_on ? ` · last synced ${shortDate(r.last_sync_on)}` : ''}
        </p>
        {changes > 0 && (
          <p style={text('captionSmall', theme.colors.txt.tertiary)}>
            New places start {shortDate(r.as_of)}. A dancer who leaves is on the roster up to and
            including {shortDate(r.drop_day)}. Past rosters and attendance do not change.
          </p>
        )}
      </div>

      {stale && (
        <Section label="Older than the last sync" tone="warning">
          <p style={text('bodySmall', theme.colors.txt.primary)}>
            The newest activity in this file is from {shortDate(file.parse.exportedOn)}, but the rosters were
            last synced on {shortDate(r.last_sync_on)}. Applying an older export undoes everything since —
            check this is the newest file in your Downloads.
          </p>
          <Confirm
            checked={confirmStale}
            onChange={onConfirmStale}
            label="I have checked — this is the export I mean to apply."
          />
        </Section>
      )}

      <Blocked r={r} />

      {r.whole_class_drops.length > 0 && (
        <Section label="Tag gone from a whole class" count={r.whole_class_drops.length} tone="warning">
          <Rows>
            {r.whole_class_drops.map((w, i) => (
              <Row
                key={i}
                title={`${classLabel(w)} — the tag is gone from every family in this file tagged for it`}
                detail={[
                  `${plural(w.dropping, 'dancer')} to drop`,
                  w.held > 0 && `${w.held} held`,
                  plural(w.families, 'family', 'families'),
                ].filter(Boolean).join(' · ')}
              />
            ))}
          </Rows>
          <p style={text('captionSmall', theme.colors.txt.secondary)}>
            If this class was renamed in Enrolio, run Import classes first — a renamed class looks like
            every family left it.
          </p>
        </Section>
      )}

      {r.adds.length > 0 && (
        <Section label="To add" count={r.adds.length}>
          <Rows>
            {r.adds.map((a, i) => (
              <Row
                key={i}
                title={<><strong>{a.student_name}</strong> → {classLabel(a)}</>}
                detail={[
                  a.reason === 'only_dancer' ? 'only dancer in the family' : 'only sibling in the age range',
                  a.new_dancer ? 'new to the app' : null,
                ].filter(Boolean).join(' · ')}
              />
            ))}
          </Rows>
        </Section>
      )}

      {r.drops.length > 0 && (
        <Section label="To drop" count={r.drops.length} tone={r.confirm_drops ? 'warning' : 'normal'}>
          <Rows>
            {r.drops.map(d => (
              <Row
                key={d.enrollment_id}
                title={<><strong>{d.student_name}</strong> leaves {classLabel(d)}</>}
                detail={`in it since ${shortDate(d.enrolled_on)} · last on the roster ${shortDate(d.last_day)} · the tag is gone from the family`}
              />
            ))}
          </Rows>
          {r.confirm_drops && (
            <Confirm
              checked={confirmDrops}
              onChange={onConfirmDrops}
              label={r.drops.length === 1
                ? 'Yes — this dancer really left this class.'
                : `Yes — all ${r.drops.length} of these dancers really left these classes.`}
            />
          )}
        </Section>
      )}

      {r.new_families.length > 0 && (
        <Section label="New families" count={r.new_families.length}>
          <Rows>
            {r.new_families.map((f, i) => (
              <Row
                key={i}
                title={<><strong>{f.family ?? f.email}</strong> · {f.dancers.join(', ')}</>}
                detail={`${f.email} · no birthday on file yet — the roster import adds it to the same dancer`}
              />
            ))}
          </Rows>
        </Section>
      )}

      {r.confirm_adds && (
        <Section label="A large addition" tone="warning">
          <p style={text('bodySmall', theme.colors.txt.primary)}>
            This adds {plural(r.counts.adds, 'place')}
            {r.counts.new_families > 0 ? ` and ${plural(r.counts.new_families, 'new family', 'new families')}` : ''} at
            once — more than a usual week. The wrong export (every contact instead of Current Families) looks like
            this.
          </p>
          <Confirm
            checked={confirmAdds}
            onChange={onConfirmAdds}
            label="Yes — these places and families are right."
          />
        </Section>
      )}

      {person > 0 && (
        <Section label="For a person to decide" count={person} tone="warning">
          <Rows>
            {seenToCheck.map(f => (
              <Row
                key={`f${f.household_id}`}
                title={<><strong>{f.family ?? f.email}</strong> — first time in a sync</>}
                detail={`This family was not in the export the sync started from, so its ${plural(f.tags, 'class tag')} ` +
                  'could be old. They are recorded and nothing is applied; check its classes by hand. From the ' +
                  'next sync on it is compared like any other family.'}
              />
            ))}
            {r.email_conflicts.map(x => (
              <Row
                key={`e${x.email}`}
                title={<><strong>{x.email}</strong> is on two families in the app</>}
                detail={`${x.families.join(' and ')} — each is synced on its own. If they are one family, they need merging by hand.`}
              />
            ))}
            {r.unassigned.map((u, i) => (
              <Row
                key={`u${i}`}
                title={<><strong>{u.family ?? u.email}</strong> is tagged for {classLabel(u)}</>}
                detail={unassignedText(u)}
              />
            ))}
            {r.conflicts.map((c, i) => (
              <Row
                key={`c${i}`}
                title={<><strong>{c.student_name}</strong> · {classLabel(c)}</>}
                detail={conflictText(c)}
              />
            ))}
            {r.held_drops.map((h, i) => (
              <Row
                key={`h${i}`}
                title={<><strong>{h.student_name}</strong> · {classLabel(h)} — not dropped</>}
                detail={heldDropText(h)}
              />
            ))}
          </Rows>
          <p style={text('captionSmall', theme.colors.txt.tertiary)}>
            None of these is applied. Each comes back every sync until what it says is done
            {seenToCheck.length > 0 ? ' — except a family seen for the first time, which is compared like any other from the next sync' : ''}.
          </p>
        </Section>
      )}

      <NotImported r={r} />

      {changes === 0 && memoryChangeCount(r) > 0 && (
        <p style={text('bodySmall', theme.colors.txt.secondary)}>
          No roster changes, but {[
            tagChanges > 0 &&
              `${plural(tagChanges, 'tag')} changed in Enrolio for classes a dancer already holds or nobody takes`,
            r.memory_changes.families_seen > 0 &&
              `${plural(r.memory_changes.families_seen, 'family', 'families')} ${r.memory_changes.families_seen === 1 ? 'is' : 'are'} in a sync for the first time` +
              (firstSeenTags > 0 ? `, with ${plural(firstSeenTags, 'class tag')} to record` : ''),
          ].filter(Boolean).join(', and ')}. Saving keeps the next sync right — unsaved, a later drop can be missed,
          or a family’s next class taken for an old tag.
        </p>
      )}

      <Informational r={r} file={file} />
    </div>
  );
};

// ------------------------------------------------------------------ modal

const EnrollmentImportModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  /** After an apply or a starting point, so the class list can reload. */
  onApplied?: () => void;
}> = ({ isOpen, onClose, onApplied }) => {
  const [phase, setPhase] = useState<Phase>('choose');
  const [file, setFile] = useState<ChosenFile | null>(null);
  const [result, setResult] = useState<EnrollmentImportResult | null>(null);
  const [outcome, setOutcome] = useState<EnrollmentImportResult | null>(null);
  const [error, setError] = useState('');
  const [confirmStale, setConfirmStale] = useState(false);
  const [confirmDrops, setConfirmDrops] = useState(false);
  const [confirmAdds, setConfirmAdds] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  // An apply that has not answered in a while: say so, and let the dialog close.
  const [waitedLong, setWaitedLong] = useState(false);
  // Only while an apply is still out: a later preview starts with Cancel again.
  const slow = waitedLong && (phase === 'applying' || phase === 'recording');
  // The tap can land between a render and the state update it caused, so the
  // guard against a second request is a ref, not `phase`.
  const busyRef = useRef(false);
  // Only the newest preview may land: an abandoned one, or one overtaken by a
  // refresh, resolves into nothing.
  const requestRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showPreview = (r: EnrollmentImportResult) => {
    setResult(r);
    setConfirmStale(false);
    setConfirmDrops(false);
    setConfirmAdds(false);
  };

  const close = () => {
    // An apply cannot be abandoned; closing mid-way would only hide its answer —
    // unless it has gone quiet, when hiding it is all that is left to do.
    if ((phase === 'applying' || phase === 'recording') && !slow) return;
    requestRef.current += 1;
    busyRef.current = false;
    setPhase('choose');
    setFile(null);
    setResult(null);
    setOutcome(null);
    setError('');
    setRefreshed(false);
    onClose();
  };

  const startPreview = async (chosen: ChosenFile) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const request = ++requestRef.current;
    setPhase('previewing');
    setError('');
    setRefreshed(false);
    try {
      const r = await runEnrollmentImport('preview', chosen.parse.contacts, null, chosen.name);
      if (request !== requestRef.current) return;
      showPreview(r);
      setPhase('preview');
    } catch (e) {
      if (request !== requestRef.current) return;
      setError(describeFailure(e, 'Couldn’t compare the file with the rosters.'));
      setPhase('choose');
    } finally {
      if (request === requestRef.current) busyRef.current = false;
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f || busyRef.current) return;
    setError('');
    let raw = '';
    try {
      raw = await readText(f);
    } catch {
      setError('That file could not be read. Choose it again.');
      return;
    }
    const parse = contactsCsvToImport(raw);
    if (parse.error) { setError(parse.error); return; }
    if (parse.contacts.length === 0) { setError('No contacts could be read from that file.'); return; }
    const chosen = { name: f.name, parse };
    setFile(chosen);
    await startPreview(chosen);
  };

  const cancelPreview = () => {
    requestRef.current += 1;
    busyRef.current = false;
    setPhase('choose');
    setFile(null);
  };

  /**
   * The preview is the data on screen, so the header refresh and a pull
   * re-check it against the rosters. Silent — the diff is replaced when the
   * answer arrives — and it throws, so the refresh control can say it failed.
   * A different answer is announced, and its confirmations asked for again.
   */
  const refreshPreview = useCallback(async () => {
    if (!file || busyRef.current) return;
    const request = ++requestRef.current;
    const r = await runEnrollmentImport('preview', file.parse.contacts, null, file.name);
    if (request !== requestRef.current) return;
    if (result && (result.plan_hash !== r.plan_hash || result.baseline_hash !== r.baseline_hash)) {
      setRefreshed(true);
      setConfirmStale(false);
      setConfirmDrops(false);
      setConfirmAdds(false);
    }
    setResult(r);
  }, [file, result]);
  useRefreshable(refreshPreview, isOpen && phase === 'preview');

  useEffect(() => {
    if (phase !== 'applying' && phase !== 'recording') return undefined;
    const timer = window.setTimeout(() => setWaitedLong(true), SLOW_ANSWER_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const commit = async (mode: Exclude<EnrollmentImportMode, 'preview'>) => {
    if (busyRef.current || !file || !result) return;
    busyRef.current = true;
    const request = ++requestRef.current;
    setError('');
    setWaitedLong(false);
    setPhase(mode === 'apply' ? 'applying' : 'recording');
    // Only what the preview asked for, and only once it is all ticked.
    const confirmed = (!result.confirm_drops || confirmDrops) && (!result.confirm_adds || confirmAdds);
    try {
      const r = await runEnrollmentImport(
        mode, file.parse.contacts, mode === 'apply' ? result.plan_hash : result.baseline_hash, file.name,
        mode === 'apply' && (result.confirm_drops || result.confirm_adds) && confirmed);
      if (request !== requestRef.current) return;
      setOutcome(r);
      setPhase(mode === 'apply' ? 'applied' : 'recorded');
      onApplied?.();
    } catch (e) {
      if (request !== requestRef.current) return;
      // The database's messages say what happened and that nothing changed;
      // they are shown as written. The preview may be stale now, so the only
      // way forward offered is to take it again.
      setError(describeFailure(e, 'The sync failed. Nothing was changed.'));
      setPhase('preview');
    } finally {
      if (request === requestRef.current) busyRef.current = false;
    }
  };

  const changes = result ? changeCount(result) : 0;
  const memory = result ? memoryChangeCount(result) : 0;
  const stale = !!(result && file?.parse.exportedOn && result.last_sync_on
    && file.parse.exportedOn < result.last_sync_on);
  const busy = phase === 'previewing' || phase === 'applying' || phase === 'recording';

  let buttons: React.ReactNode = null;
  if (phase === 'choose') {
    buttons = <Button variant="secondary" onClick={close} style={footerButton}>Cancel</Button>;
  } else if (phase === 'previewing') {
    buttons = <Button variant="secondary" onClick={cancelPreview} style={footerButton}>Cancel</Button>;
  } else if (phase === 'applied' || phase === 'recorded') {
    buttons = <Button variant="primary" onClick={close} style={footerButton}>Done</Button>;
  } else if (result) {
    const waitingFor = (stale && !confirmStale) || (result.confirm_drops && !confirmDrops)
      || (result.confirm_adds && !confirmAdds);
    const primary = error
      ? (
        <Button variant="primary" onClick={() => file && startPreview(file)} disabled={busy} style={footerButton}>
          Preview again
        </Button>
      )
      : result.first_import
        ? (
          <Button
            variant="primary" onClick={() => commit('baseline')} loading={phase === 'recording'}
            disabled={busy || result.blocked.length > 0} style={footerButton}
          >
            {phase === 'recording' ? 'Recording…' : 'Record as starting point'}
          </Button>
        )
        : result.blocked.length > 0
          ? <Button variant="primary" disabled style={footerButton}>Can’t apply yet</Button>
          : changes + memory === 0
            ? null
            : (
              <Button
                variant="primary" onClick={() => commit('apply')} loading={phase === 'applying'}
                disabled={busy || waitingFor} style={footerButton}
              >
                {phase === 'applying' ? 'Applying…'
                  : changes > 0 ? `Apply ${plural(changes, 'change')}`
                  : 'Save for the next sync'}
              </Button>
            );
    buttons = (
      <>
        <Button variant="secondary" onClick={close} disabled={busy && !slow} style={footerButton}>
          {primary && !slow ? 'Cancel' : 'Close'}
        </Button>
        {primary}
      </>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Sync class rosters"
      size="lg"
      footer={buttons && <FooterRow>{buttons}</FooterRow>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
        {phase === 'choose' && (
          <>
            <p style={text('bodySmall', theme.colors.txt.secondary)}>
              Enrolio’s <strong>Export Contacts → Current Families</strong> CSV. You will see every change
              before anything is saved, and attendance is never touched.
            </p>
            <p style={text('captionSmall', theme.colors.txt.tertiary)}>
              Best done in the morning, before the day’s classes. If a class is new or was renamed in
              Enrolio, run Import classes first.
            </p>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                aria-label="Contacts CSV file"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  onFile(f);
                }}
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>Choose CSV file</Button>
            </div>
            {error && (
              <p role="status" aria-live="polite" style={text('bodySmall', theme.colors.status.error)}>{error}</p>
            )}
          </>
        )}

        {phase === 'previewing' && file && (
          <Working
            label="Comparing with the rosters"
            message={`Comparing ${plural(file.parse.contacts.length, 'contact')} with the class rosters — this takes a few seconds. Keep this page open.`}
            note="Nothing is saved yet."
          />
        )}

        {phase === 'applying' && result && (
          <Working
            label="Applying the roster changes"
            message={slow ? SLOW_ANSWER
              : changes > 0
                ? `Applying ${plural(changes, 'change')} — this takes a few seconds. Keep this page open.`
                : 'Saving for the next sync — a few seconds. Keep this page open.'}
            note="It cannot be stopped part-way: either every change goes through or none does."
          />
        )}

        {phase === 'recording' && (
          <Working
            label="Recording the starting point"
            message={slow ? SLOW_ANSWER
              : 'Recording this export as the starting point — a few seconds. Keep this page open.'}
            note="Nothing on the rosters changes."
          />
        )}

        {phase === 'preview' && result && file && (
          <>
            {error && (
              <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <p style={text('bodySmall', theme.colors.status.error)}>{error}</p>
                <p style={text('captionSmall', theme.colors.txt.tertiary)}>
                  Tap Preview again to see the rosters as they are now.
                </p>
              </div>
            )}
            {refreshed && !error && (
              <p role="status" aria-live="polite" style={{ ...text('bodySmall', theme.colors.txt.primary), fontWeight: 600 }}>
                Updated just now — the rosters changed while this was open. Read it again before applying.
              </p>
            )}
            {result.first_import
              ? <FirstRun r={result} file={file} />
              : (
                <Preview
                  r={result}
                  file={file}
                  stale={stale}
                  confirmStale={confirmStale}
                  onConfirmStale={setConfirmStale}
                  confirmDrops={confirmDrops}
                  onConfirmDrops={setConfirmDrops}
                  confirmAdds={confirmAdds}
                  onConfirmAdds={setConfirmAdds}
                />
              )}
          </>
        )}

        {phase === 'applied' && outcome && (
          <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ ...text('body', theme.colors.txt.primary), fontWeight: 600 }}>
              {changeCount(outcome) > 0
                ? `Done — ${[
                  `${plural(outcome.counts.adds, 'dancer')} added`,
                  `${outcome.counts.drops} dropped`,
                  outcome.counts.new_families > 0 && plural(outcome.counts.new_families, 'new family', 'new families'),
                ].filter(Boolean).join(', ')}.`
                : 'Saved for the next sync — no roster changes.'}
            </p>
            <p style={text('bodySmall', theme.colors.txt.secondary)}>
              Rosters from {shortDate(outcome.as_of)} show any change. Attendance is unchanged
              ({plural(outcome.fingerprint?.after.attendance.rows ?? 0, 'mark')} before and after), and so is
              every roster before today.
            </p>
            {forAPerson(outcome) > 0 && (
              <p style={{ ...text('bodySmall', theme.colors.txt.primary), fontWeight: 600 }}>
                {plural(forAPerson(outcome), 'item')} still {forAPerson(outcome) === 1 ? 'needs' : 'need'} a person
                to decide.{' '}
                {firstSeenToCheck(outcome).length > 0
                  ? 'Tags and places come back every sync until dealt with; a family seen for the first time is ' +
                    'compared like any other from now on.'
                  : 'Each comes back every sync until dealt with.'}
              </p>
            )}
          </div>
        )}

        {phase === 'recorded' && outcome && (
          <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ ...text('body', theme.colors.txt.primary), fontWeight: 600 }}>
              Starting point recorded — {plural(outcome.tags_recorded ?? 0, 'class tag')} across{' '}
              {plural(outcome.counts.families, 'family', 'families')}.
            </p>
            <p style={text('bodySmall', theme.colors.txt.secondary)}>
              Nothing on the rosters changed. From the next export on, a sync applies only what changed since.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default EnrollmentImportModal;
