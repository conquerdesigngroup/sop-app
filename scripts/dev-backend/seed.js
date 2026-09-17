/**
 * The fixture's data. Invented, entirely — no family, dancer or member of staff
 * here corresponds to a real one, and none of it is copied from production.
 *
 * WHAT IT IS FOR
 *
 * Seeing the screens. `npm run audit:mobile` skips every signed-in route unless
 * you hand it a real staff login, which is 20 of its 35 rows and, as CLAUDE.md
 * records, where all four bugs of the first full run were found. The portal's
 * section pages are worse off again: they read portal_programs before they
 * render anything, so with no backend they show an error card and an audit of
 * them measures that card.
 *
 * So this exists to be enough of a studio that every page has its real layout
 * to draw: several sections, a class list wide enough to make the filter row
 * wrap, updates long enough to clamp, events that span a month boundary, a
 * dancer with a middling attendance percentage.
 *
 * SHAPES COME FROM THE REAL SCHEMA, VALUES DO NOT
 *
 * Column names and types were read off production's information_schema so the
 * hand-written mappers in PortalContext and friends are exercised for real —
 * snake_case in, camelCase out. That is the half of these pages most likely to
 * break and the half a hand-written mock usually gets wrong.
 *
 * DATES ROLL
 *
 * Events are generated relative to today rather than pinned, because a calendar
 * fixture that was written in September is an empty calendar in November, and
 * an empty calendar passes every audit it is given.
 */

const DAY = 86400000;
const today = new Date();
const iso = (offsetDays, hour = 0, minute = 0) => {
  const d = new Date(today.getTime() + offsetDays * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
const dateOnly = (offsetDays) => new Date(today.getTime() + offsetDays * DAY).toISOString().slice(0, 10);

// --- identities -------------------------------------------------------------
// Stable ids, readable on sight, so a failing query names something you can
// find in this file rather than a random uuid.

const PROG_ALLSTARS = '00000000-0000-4000-a000-000000000001';
const PROG_ACADEMY = '00000000-0000-4000-a000-000000000002';

const STAFF = {
  owner: '00000000-0000-4000-b000-000000000001',
  admin: '00000000-0000-4000-b000-000000000002',
  teacherJess: '00000000-0000-4000-b000-000000000003',
  teacherDevon: '00000000-0000-4000-b000-000000000004',
  teacherPriya: '00000000-0000-4000-b000-000000000005',
  frontDesk: '00000000-0000-4000-b000-000000000006',
};

/**
 * The login the dev backend accepts. Any password works — it is a fixture, and
 * a password check here would protect nothing and only be something to forget.
 * super_admin because that is the widest view: a lesser role is redirected away
 * from the super-admin-only pages and the audit then measures the redirect and
 * calls the route clean.
 */
const LOGIN_EMAIL = 'dev@localhost';

const profiles = [
  { id: STAFF.owner, email: LOGIN_EMAIL, first_name: 'Dev', last_name: 'Owner', role: 'super_admin', department: 'Management', is_active: true, invited_by: null, avatar_url: null, avatar_path: null, notification_preferences: {}, created_at: iso(-400), updated_at: iso(-3) },
  { id: STAFF.admin, email: 'admin@localhost', first_name: 'Robin', last_name: 'Vance', role: 'admin', department: 'Management', is_active: true, invited_by: STAFF.owner, avatar_url: null, avatar_path: null, notification_preferences: {}, created_at: iso(-380), updated_at: iso(-20) },
  { id: STAFF.teacherJess, email: 'jess@localhost', first_name: 'Jess', last_name: 'Moreau', role: 'team', department: 'Faculty', is_active: true, invited_by: STAFF.owner, avatar_url: null, avatar_path: null, notification_preferences: {}, created_at: iso(-300), updated_at: iso(-30) },
  { id: STAFF.teacherDevon, email: 'devon@localhost', first_name: 'Devon', last_name: 'Clarke', role: 'team', department: 'Faculty', is_active: true, invited_by: STAFF.owner, avatar_url: null, avatar_path: null, notification_preferences: {}, created_at: iso(-290), updated_at: iso(-30) },
  { id: STAFF.teacherPriya, email: 'priya@localhost', first_name: 'Priya', last_name: 'Raman', role: 'team', department: 'Faculty', is_active: true, invited_by: STAFF.owner, avatar_url: null, avatar_path: null, notification_preferences: {}, created_at: iso(-280), updated_at: iso(-40) },
  // Deactivated on purpose: the team page renders these differently and the
  // difference has never been measured on a phone.
  { id: STAFF.frontDesk, email: 'sam@localhost', first_name: 'Sam', last_name: 'Ortega', role: 'team', department: 'Front Desk', is_active: false, invited_by: STAFF.admin, avatar_url: null, avatar_path: null, notification_preferences: {}, created_at: iso(-260), updated_at: iso(-60) },
];

const portal_programs = [
  { id: PROG_ALLSTARS, slug: 'allstars', name: 'All-Star Dancers', blurb: 'Competition teams, rehearsals and travel', requires_code: false, sort_order: 1, is_active: true, hero_path: null, hero_alt: '', created_at: iso(-400), updated_at: iso(-10) },
  { id: PROG_ACADEMY, slug: 'academy', name: 'Academy / TNT Dancers', blurb: 'Weekly classes for every level', requires_code: false, sort_order: 2, is_active: true, hero_path: null, hero_alt: '', created_at: iso(-400), updated_at: iso(-10) },
];

// --- classes ----------------------------------------------------------------
// Deliberately more than fits: the schedule's filter row is a nowrap flex row
// between 480 and ~660px (CLAUDE.md), and a three-class fixture never makes it
// reach for that width. Three categories, because the All-Star schedule lists
// all three and the Academy/TNT one lists two.

const CLASS_SPECS = [
  ['Senior Elite Jazz', 'allstars', 'Jazz', 2, '18:00', '19:30', 'Elite', 'Company'],
  ['Senior Elite Hip Hop', 'allstars', 'Hip Hop', 2, '19:30', '21:00', 'Elite', 'Company'],
  ['Junior Competition Lyrical', 'allstars', 'Lyrical', 3, '17:00', '18:15', 'Advanced', 'Junior / Teen'],
  ['Mini All-Stars', 'allstars', 'Jazz', 6, '09:00', '10:00', 'Beginner', 'Mini'],
  ['Teen Contemporary Crew', 'allstars', 'Contemporary', 4, '18:30', '20:00', 'Advanced', 'Junior / Teen'],
  ['Production Rehearsal', 'allstars', 'Production', 0, '13:00', '16:00', null, 'Company'],
  ['Turns & Jumps', 'academy', 'Turns & Jumps', 1, '17:30', '18:15', 'All levels', 'Junior / Teen'],
  ['Junior Ballet', 'academy', 'Ballet', 2, '16:30', '17:30', 'Level 2', 'Junior / Teen'],
  ['Adult Tap', 'academy', 'Tap', 4, '19:30', '20:30', 'Beginner', 'Adult'],
  ['Tiny Tots Creative Movement', 'academy', 'Creative', 6, '10:00', '10:45', 'Beginner', 'Tiny Tots'],
  ['Intermediate Ballet', 'academy', 'Ballet', 3, '17:30', '18:45', 'Level 4', 'Junior / Teen'],
  ['Musical Theatre', 'academy', 'Musical Theatre', 5, '16:00', '17:00', 'All levels', 'Junior / Teen'],
  ['Acro Foundations', 'academy', 'Acro', 1, '18:15', '19:00', 'Level 1', 'Mini'],
  ['Hip Hop Crew', 'tnt', 'Hip Hop', 4, '17:45', '18:45', 'Intermediate', 'Junior / Teen'],
  ['TNT Breaking', 'tnt', 'Breaking', 5, '18:00', '19:15', 'All levels', 'Junior / Teen'],
  ['TNT Street Jazz', 'tnt', 'Street Jazz', 3, '19:00', '20:00', 'Intermediate', 'Junior / Teen'],
  ['TNT Junior Crew', 'tnt', 'Hip Hop', 6, '11:00', '12:00', 'Beginner', 'Mini'],
];

const portal_classes = CLASS_SPECS.map(([name, category, style, day, start, end, level, age], i) => ({
  id: `00000000-0000-4000-c000-${String(i + 1).padStart(12, '0')}`,
  program_id: category === 'allstars' ? PROG_ALLSTARS : PROG_ACADEMY,
  category,
  name,
  style,
  day_of_week: day,
  start_time: `${start}:00`,
  end_time: `${end}:00`,
  level,
  age_group: age,
  location: i % 3 === 0 ? 'Studio A' : i % 3 === 1 ? 'Studio B' : 'Studio C',
  // One deliberately long description: the class page clamps it and the clamp
  // has to be looked at with something to clamp.
  description: i === 0
    ? 'Our senior elite jazz team trains for regional and national competition. Dancers are expected at every rehearsal in the eight weeks before a competition weekend, and should arrive warmed up and ready to begin on the hour. Choreography is set in the first month of the season and cleaned continuously after that.'
    : `${style} technique and choreography for the ${age.toLowerCase()} group.`,
  instructor_name: null,
  sort_order: i,
  is_active: true,
  source_title: null,
  age_min_years: age === 'Tiny Tots' ? 3 : age === 'Mini' ? 6 : age === 'Adult' ? 18 : 9,
  age_max_years: age === 'Tiny Tots' ? 5 : age === 'Mini' ? 8 : age === 'Adult' ? null : 18,
  capacity: 18,
  tuition_fee: category === 'allstars' ? 145 : 85,
  registration_fee: 35,
  costume_fee: category === 'allstars' ? 120 : 75,
  billing_cycle: 'monthly',
  billing_day: 1,
  season: 'Season 2026',
  season_start: dateOnly(-120),
  season_end: dateOnly(120),
  registration_opens: dateOnly(-180),
  external_class_id: `EXT-${1000 + i}`,
  superseded_by: null,
  what_to_bring: style === 'Ballet' ? ['Pink ballet shoes', 'Black leotard', 'Hair in a bun'] : ['Water bottle'],
  match_key: null,
  created_at: iso(-200),
  updated_at: iso(-5),
}));

const TEACHERS = [STAFF.teacherJess, STAFF.teacherDevon, STAFF.teacherPriya];
const portal_class_instructors = portal_classes.map((c, i) => ({
  class_id: c.id,
  profile_id: TEACHERS[i % TEACHERS.length],
  granted_by: STAFF.owner,
  is_paused: false,
  paused_at: null,
  paused_by: null,
  created_at: iso(-190),
}));

// --- updates ----------------------------------------------------------------

const update = (n, program_id, class_id, title, body, daysAgo, is_pinned = false, link = null) => ({
  id: `00000000-0000-4000-d000-${String(n).padStart(12, '0')}`,
  program_id,
  class_id,
  household_id: null,
  title,
  body,
  is_pinned,
  is_published: true,
  published_at: iso(-daysAgo, 9),
  author_id: STAFF.admin,
  link_url: link ? link.url : null,
  link_label: link ? link.label : null,
  created_at: iso(-daysAgo, 9),
  updated_at: iso(-daysAgo, 9),
});

const portal_updates = [
  update(1, PROG_ALLSTARS, null, 'Competition weekend schedule is up', 'Call times for Saturday and Sunday are posted in the calendar. Dancers should arrive in full hair and makeup, with both costumes and a spare pair of tights.\n\nParents travelling separately: the hotel block closes on Friday.', 2, true, { url: 'https://example.com/schedule', label: 'Full schedule' }),
  update(2, PROG_ACADEMY, null, 'Recital tickets on sale Monday', 'Tickets go on sale at 9am Monday through the parent portal. Each family may buy up to six in the first week, after which the limit lifts.', 4, true),
  // A long one, to give the dashboard card something to line-clamp.
  update(3, PROG_ACADEMY, null, 'New shoe supplier for Junior Ballet', 'We have moved to a new supplier for ballet shoes this season after several families reported sizing problems with the previous range. The new shoes run about half a size large, so please have your dancer fitted rather than ordering from last year\'s size. Fittings are available at the front desk on Tuesday and Thursday afternoons, and the studio holds stock in the most common sizes. If you have already bought shoes from the old supplier they are still perfectly fine for this season; nothing needs replacing mid-year.', 9),
  update(4, PROG_ALLSTARS, null, 'Crew showcase piece announced', 'The senior crew showcase piece has been set. Rehearsal footage is in the class files.', 14),
  update(5, PROG_ACADEMY, null, 'Studio closed for the holiday weekend', 'The studio will be closed Saturday through Monday. Makeup classes for anything missed are listed with your teacher.', 21),
];

// --- events -----------------------------------------------------------------
// Rolling, and deliberately awkward: one all-day today (the case that used to
// vanish before breakfast), one multi-day spanning a month boundary, one in the
// recent past because fetchEvents reaches a month back.

const event = (n, program_id, title, startOffset, endOffset, allDay, location) => ({
  id: `00000000-0000-4000-e000-${String(n).padStart(12, '0')}`,
  program_id,
  class_id: null,
  title,
  description: `${title} — details to follow.`,
  starts_at: allDay ? `${dateOnly(startOffset)}T00:00:00.000Z` : iso(startOffset, 18, 30),
  ends_at: allDay ? `${dateOnly(endOffset)}T00:00:00.000Z` : iso(endOffset, 20, 0),
  is_all_day: allDay,
  location,
  source: 'manual',
  google_calendar_id: null,
  google_event_id: null,
  is_published: true,
  created_at: iso(-30),
  updated_at: iso(-30),
});

const portal_events = [
  event(1, PROG_ALLSTARS, 'Team photo day', 0, 0, true, 'Studio A'),
  event(2, PROG_ALLSTARS, 'Regional competition', 12, 14, true, 'Civic Center, Riverside'),
  event(3, PROG_ACADEMY, 'Recital dress rehearsal', 5, 5, false, 'Main stage'),
  event(4, PROG_ACADEMY, 'Parent observation week', 20, 24, true, 'All studios'),
  event(5, PROG_ALLSTARS, 'Costume fitting', 3, 3, false, 'Studio C'),
  event(6, PROG_ACADEMY, 'Open house', -8, -8, true, 'Lobby'),
  event(7, PROG_ACADEMY, 'Picture day', 33, 33, true, 'Studio B'),
];

// --- documents --------------------------------------------------------------
// Including one Stream video, because the download-and-save-to-photos flow is
// the reference implementation for the slow-tap rules in CLAUDE.md and it has a
// progress bar that nothing else has.

const portal_documents = [
  { id: '00000000-0000-4000-f000-000000000001', program_id: PROG_ACADEMY, class_id: null, title: 'Family handbook 2026', description: 'Policies, term dates and dress code', category: 'Policies', storage_path: 'demo/handbook.pdf', file_name: 'handbook-2026.pdf', mime_type: 'application/pdf', size_bytes: 1_800_000, sort_order: 0, is_published: true, uploaded_by: STAFF.admin, stream_uid: null, stream_playback_url: null, stream_status: null, stream_download_url: null, duration_seconds: null, created_at: iso(-60), updated_at: iso(-60) },
  { id: '00000000-0000-4000-f000-000000000002', program_id: PROG_ACADEMY, class_id: portal_classes[7].id, title: 'Junior Ballet dress code', description: null, category: 'Dress code', storage_path: 'demo/dress-code.pdf', file_name: 'dress-code.pdf', mime_type: 'application/pdf', size_bytes: 402_000, sort_order: 1, is_published: true, uploaded_by: STAFF.teacherJess, stream_uid: null, stream_playback_url: null, stream_status: null, stream_download_url: null, duration_seconds: null, created_at: iso(-45), updated_at: iso(-45) },
  { id: '00000000-0000-4000-f000-000000000003', program_id: PROG_ALLSTARS, class_id: portal_classes[0].id, title: 'Showcase routine — rehearsal footage', description: 'Full run, front angle', category: 'Music', storage_path: 'demo/routine.mp4', file_name: 'routine.mp4', mime_type: 'video/mp4', size_bytes: 21_000_000, sort_order: 0, is_published: true, uploaded_by: STAFF.teacherDevon, stream_uid: 'demo-stream-uid', stream_playback_url: 'https://example.com/demo.m3u8', stream_status: 'ready', stream_download_url: 'https://example.com/demo.mp4', duration_seconds: 184, created_at: iso(-12), updated_at: iso(-12) },
];

// --- staff side -------------------------------------------------------------

const work_categories = ['Teaching', 'Admin', 'Choreography', 'Front desk', 'Cleaning', 'Events', 'Costumes']
  .map((name, i) => ({ id: `00000000-0000-4000-1000-${String(i + 1).padStart(12, '0')}`, name, sort_order: i, is_active: true, created_at: iso(-300), updated_at: iso(-300) }));

const SOP_SPECS = [
  ['Opening the studio', 'Operations', 'Daily', ['Unlock the front and back doors', 'Turn on the lobby and studio lights', 'Check the sound system in each room', 'Put the schedule board out']],
  ['Closing the studio', 'Operations', 'Daily', ['Sweep each studio floor', 'Check lost property into the bin', 'Set the alarm', 'Lock both doors']],
  ['Handling a late payment', 'Front desk', 'Billing', ['Check the withdrawal date in Enrollio', 'Confirm the 5-day grace period has passed', 'Apply the $25 late fee', 'Send the templated message']],
  ['New family enrollment', 'Front desk', 'Enrollment', ['Take contact details', 'Collect the $35 registration fee', 'Assign a trial class', 'Send the portal invitation']],
  ['Competition travel checklist', 'Faculty', 'Events', ['Confirm the hotel block', 'Print the call sheet', 'Pack the first-aid and sewing kit', 'Confirm the music with the sound desk']],
];

const sops = SOP_SPECS.map(([title, department, category, steps], i) => ({
  id: `00000000-0000-4000-2000-${String(i + 1).padStart(12, '0')}`,
  title,
  description: `How we do ${title.toLowerCase()}.`,
  department,
  category,
  icon: null,
  image_url: null,
  steps: steps.map((text, n) => ({ id: `s${n}`, order: n, title: text, description: '', duration: 5 })),
  tags: [category.toLowerCase()],
  status: i === SOP_SPECS.length - 1 ? 'draft' : 'published',
  is_template: false,
  created_by: STAFF.owner,
  created_at: iso(-120 + i),
  updated_at: iso(-10),
  published_at: i === SOP_SPECS.length - 1 ? null : iso(-100 + i),
  archived_at: null,
}));

const TASK_SPECS = [
  ['Restock the lobby water', 'Front desk', 'pending', 'high', 0],
  ['Deep clean Studio B mirrors', 'Operations', 'in_progress', 'medium', 0],
  ['Confirm recital venue insurance', 'Management', 'pending', 'high', 1],
  ['Update the class schedule board', 'Front desk', 'completed', 'low', -1],
  ['Order replacement tap boards', 'Operations', 'pending', 'medium', 3],
  ['Chase outstanding costume payments', 'Management', 'in_progress', 'high', 0],
  ['Check the first-aid kit', 'Operations', 'pending', 'low', 7],
];

const job_tasks = TASK_SPECS.map(([title, department, status, priority, dayOffset], i) => ({
  id: `00000000-0000-4000-3000-${String(i + 1).padStart(12, '0')}`,
  title,
  description: `${title} before the end of the day.`,
  template_id: null,
  assigned_to: [i % 2 === 0 ? STAFF.teacherJess : STAFF.frontDesk],
  assigned_by: STAFF.admin,
  department,
  category: 'Routine',
  scheduled_date: dateOnly(dayOffset),
  due_time: '17:00',
  estimated_duration: 30,
  status,
  priority,
  steps: [],
  completed_steps: [],
  progress_percentage: status === 'completed' ? 100 : status === 'in_progress' ? 45 : 0,
  sop_ids: [],
  started_at: status === 'pending' ? null : iso(dayOffset, 9),
  completed_at: status === 'completed' ? iso(dayOffset, 11) : null,
  completed_by: status === 'completed' ? STAFF.frontDesk : null,
  completion_notes: null,
  completion_photos: [],
  comments: [],
  attachments: [],
  is_recurring: false,
  recurrence_pattern: null,
  created_at: iso(-7),
  updated_at: iso(-1),
}));

const calendar_events = portal_events.slice(0, 5).map((e, i) => ({
  id: `00000000-0000-4000-4000-${String(i + 1).padStart(12, '0')}`,
  title: e.title,
  description: e.description,
  start_date: e.starts_at.slice(0, 10),
  start_time: e.is_all_day ? null : '18:30',
  end_date: e.ends_at.slice(0, 10),
  end_time: e.is_all_day ? null : '20:00',
  location: e.location,
  is_all_day: e.is_all_day,
  color: '#E2144F',
  attendees: [],
  reminders: [],
  is_recurring: false,
  recurrence_pattern: null,
  notes: null,
  tags: [],
  created_by: STAFF.admin,
  source: 'manual',
  google_calendar_id: null,
  google_event_id: null,
  google_api_event_id: null,
  created_at: iso(-30),
  updated_at: iso(-30),
}));

const employee_pay_rates = [STAFF.teacherJess, STAFF.teacherDevon, STAFF.teacherPriya].map((id, i) => ({
  id: `00000000-0000-4000-5000-${String(i + 1).padStart(12, '0')}`,
  profile_id: id,
  hourly_rate: 28 + i * 2,
  effective_from: dateOnly(-200),
  created_at: iso(-200),
  updated_at: iso(-200),
}));

const work_hours = Array.from({ length: 8 }, (_, i) => ({
  id: `00000000-0000-4000-6000-${String(i + 1).padStart(12, '0')}`,
  profile_id: i % 2 === 0 ? STAFF.teacherJess : STAFF.teacherDevon,
  week_start: dateOnly(-7 * (i + 1)),
  total_hours: 12 + (i % 5),
  status: i < 2 ? 'submitted' : 'approved',
  notes: null,
  created_at: iso(-7 * (i + 1)),
  updated_at: iso(-7 * i - 1),
}));

// --- the rest of the staff side --------------------------------------------
// Added because the dev backend logged each of these as "no seed -> []" while a
// page that should have had rows drew its empty state. That warning is the
// point of this fixture: it tells you which screen you have not actually seen.

const task_templates = SOP_SPECS.slice(0, 4).map(([title, department, category], i) => ({
  id: `00000000-0000-4000-7000-${String(i + 1).padStart(12, '0')}`,
  title: `${title} (template)`,
  description: `Reusable checklist for ${title.toLowerCase()}.`,
  category,
  department,
  estimated_duration: 20 + i * 10,
  priority: i === 0 ? 'high' : 'medium',
  sop_ids: [sops[i].id],
  steps: sops[i].steps,
  created_by: STAFF.owner,
  is_recurring: i % 2 === 0,
  recurrence_pattern: i % 2 === 0 ? { frequency: 'weekly', days: [1, 3, 5] } : null,
  created_at: iso(-90),
  updated_at: iso(-30),
}));

// Six weeks of rota across three people, so the schedule grid has a shape and
// the week navigation has somewhere to go in both directions.
const WORK_STATUSES = ['working', 'off', 'working', 'working', 'holiday', 'working', 'off'];
const work_days = [];
[STAFF.teacherJess, STAFF.teacherDevon, STAFF.frontDesk].forEach((employee_id, person) => {
  for (let d = -21; d < 21; d++) {
    work_days.push({
      id: `00000000-0000-4000-8000-${String(work_days.length + 1).padStart(12, '0')}`,
      employee_id,
      work_date: dateOnly(d),
      status: WORK_STATUSES[(d + 21 + person * 2) % WORK_STATUSES.length],
      notes: null,
      created_by: STAFF.admin,
      created_at: iso(-30),
      updated_at: iso(-30),
    });
  }
});

const work_hours_pay = work_hours.map((w) => ({
  work_hours_id: w.id,
  rate_snapshot: 28,
  pay_amount: Number((w.total_hours * 28).toFixed(2)),
  rate_missing: false,
  created_at: w.created_at,
}));

const calendar_sources = [
  { id: '00000000-0000-4000-9000-000000000001', google_calendar_id: 'studio@example.com', label: 'Studio', slug: 'studio', color: '#3B82F6', sort_order: 0, is_enabled: true, days_back: 30, days_ahead: 120, last_run_at: iso(0, 6), last_success_at: iso(0, 6), last_status: 'ok', last_message: null, last_upserted: 12, last_removed: 0, ics_url: null, time_zone: 'America/Los_Angeles', created_at: iso(-200), updated_at: iso(0, 6) },
  { id: '00000000-0000-4000-9000-000000000002', google_calendar_id: 'allstars@example.com', label: 'All-Stars', slug: 'allstars', color: '#E2144F', sort_order: 1, is_enabled: true, days_back: 30, days_ahead: 120, last_run_at: iso(0, 6), last_success_at: iso(0, 6), last_status: 'ok', last_message: null, last_upserted: 7, last_removed: 1, ics_url: null, time_zone: 'America/Los_Angeles', created_at: iso(-200), updated_at: iso(0, 6) },
  // One failing, because the Calendar page renders a connection problem
  // differently and that state is the reason the owner reconnected Google.
  { id: '00000000-0000-4000-9000-000000000003', google_calendar_id: 'competitions@example.com', label: 'Competitions', slug: 'competitions', color: '#F59E0B', sort_order: 2, is_enabled: true, days_back: 30, days_ahead: 120, last_run_at: iso(0, 6), last_success_at: iso(-4, 6), last_status: 'error', last_message: 'Calendar not found', last_upserted: 0, last_removed: 0, ics_url: null, time_zone: 'America/Los_Angeles', created_at: iso(-200), updated_at: iso(0, 6) },
];

const portal_instructor_looks = [
  { name_key: 'jess moreau', display_name: 'Jess Moreau', mode: 'initials', initials: 'JM', icon_key: null, palette_key: 'amber', shape: 'circle', pattern: null, ring: null, updated_by: STAFF.owner, updated_at: iso(-40) },
  { name_key: 'devon clarke', display_name: 'Devon Clarke', mode: 'initials', initials: 'DC', icon_key: null, palette_key: 'electric', shape: 'circle', pattern: null, ring: null, updated_by: STAFF.owner, updated_at: iso(-40) },
  { name_key: 'priya raman', display_name: 'Priya Raman', mode: 'initials', initials: 'PR', icon_key: null, palette_key: 'blue', shape: 'circle', pattern: null, ring: null, updated_by: STAFF.owner, updated_at: iso(-40) },
];

// Eleven of twelve weeks marked, same reasoning as the in-repo attendance
// fixture: nothing is imported for a class that has not met, so no session is
// in the future.
const portal_class_sessions = [];
portal_classes.slice(0, 6).forEach((c, ci) => {
  for (let w = 11; w >= 1; w--) {
    portal_class_sessions.push({
      id: `00000000-0000-4000-a100-${String(portal_class_sessions.length + 1).padStart(12, '0')}`,
      class_id: c.id,
      session_date: dateOnly(-7 * w),
      status: w === 4 && ci === 1 ? 'cancelled' : 'held',
      source: 'import',
      note: null,
      created_at: iso(-7 * w),
    });
  }
});

// The three super-admin-only viewer tabs. The audit calls this the widest
// filter row in the app and measures all three separately; with no rows it was
// measuring three empty states.
const FAMILY_NAMES = ['Alvarez', 'Boateng', 'Chen', 'Duval', 'Eriksen', 'Fontaine', 'Gupta', 'Haddad'];
const GIVEN_NAMES = ['Maya', 'Eli', 'Noor', 'Tomas', 'Ingrid', 'Rafa', 'Anika', 'Jonah', 'Lucia', 'Otis'];

const portal_admin_household_overview = FAMILY_NAMES.map((last, i) => ({
  id: `00000000-0000-4000-a200-${String(i + 1).padStart(12, '0')}`,
  external_account_id: `ACC-${2000 + i}`,
  primary_email: `${last.toLowerCase()}@localhost`,
  // A BARE SURNAME, because that is what production holds: the roster import
  // writes `coalesce(guardian_name, student_last_name)` and the Enrolio export
  // puts a surname in that column — 341 of the 349 real households have a
  // single-word display_name. A seed that wrote "Alvarez family" here would
  // have the app's own name-formatting code do nothing and prove nothing.
  // One family (i === 5) carries a written-out name, to cover the other branch.
  display_name: i === 5 ? `The ${last}s` : last,
  status: i === 7 ? 'inactive' : 'active',
  created_at: iso(-300 + i * 10),
  student_count: (i % 3) + 1,
  linked_logins: i % 4 === 0 ? 0 : 1,
  enrollment_count: (i % 3) + 2,
  categories: i % 2 === 0 ? ['academy', 'tnt'] : ['allstars', 'academy'],
  last_note_at: i % 5 === 0 ? iso(-12) : null,
  unlinked_accounts: i % 4 === 0 ? 1 : 0,
  // v57. The name on the account, which is what the family rows and the family
  // record now head themselves with. Null for the families nobody has signed up
  // for, so the audit sees both branches — and one deliberate case where the
  // parent's surname is NOT the family's, which is the only time the row
  // prints a second line.
  account_name: i % 4 === 0 ? null : `${['Dana', 'Marcus', 'Priya', 'Tom', 'Elin', 'Sam'][i % 6]} ${i === 3 ? 'Okafor' : last}`,
  account_email: i % 4 === 0 ? null : `${last.toLowerCase()}@localhost`,
}));

const portal_admin_student_overview = GIVEN_NAMES.map((first, i) => {
  const household = portal_admin_household_overview[i % portal_admin_household_overview.length];
  const surname = FAMILY_NAMES[i % FAMILY_NAMES.length];
  return {
    id: `00000000-0000-4000-a300-${String(i + 1).padStart(12, '0')}`,
    first_name: first,
    last_name: surname,
    // A real nickname, not the child's own name back again: what the studio
    // records here is "Bug", and the screens print it in quotes next to the
    // full name. Empty for most of them, which is the common case.
    display_name: i % 4 === 1 ? ['Bug', 'Tots', 'Junior', 'Pip'][Math.floor(i / 4) % 4] : null,
    date_of_birth: dateOnly(-365 * (7 + (i % 9))),
    status: 'active',
    external_student_id: `STU-${3000 + i}`,
    household_id: household.id,
    household_name: household.display_name,
    primary_email: household.primary_email,
    enrollment_count: (i % 3) + 1,
    categories: i % 3 === 0 ? ['allstars', 'academy', 'tnt'] : ['academy'],
    // v57. All three access states are represented, because the dancer list
    // badges and filters on them and an audit of one state proves nothing
    // about the row widths of the other two.
    own_logins: i % 5 === 0 ? 1 : 0,
    // A dancer's own login IS a household member row, so a child with one can
    // never sit in a family the view counts as having none. Deriving it keeps
    // the fixture from teaching a shape the database cannot produce.
    household_logins: Math.max(household.linked_logins, i % 5 === 0 ? 1 : 0),
    own_login_email: i % 5 === 0 ? `${first.toLowerCase()}@localhost` : null,
    household_account_name: household.account_name,
  };
});

const portal_admin_class_overview = portal_classes.map((c, i) => ({
  id: c.id,
  program_id: c.program_id,
  name: c.name,
  category: c.category,
  style: c.style,
  level: c.level,
  day_of_week: c.day_of_week,
  start_time: c.start_time,
  end_time: c.end_time,
  location: c.location,
  instructor_name: ['Jess Moreau', 'Devon Clarke', 'Priya Raman'][i % 3],
  season: c.season,
  is_active: true,
  external_class_id: c.external_class_id,
  active_enrollments: 4 + (i % 12),
}));

/**
 * The two base tables behind the overview views.
 *
 * The class roster reads portal_enrollments and embeds the student and their
 * household — the real tables, not the admin views — so without these it drew a
 * register of blank names. Derived from the views rather than written twice, so
 * a family cannot be called one thing on one screen and something else on
 * another.
 */
const portal_households = portal_admin_household_overview.map((h) => ({
  id: h.id,
  external_account_id: h.external_account_id,
  primary_email: h.primary_email,
  display_name: h.display_name,
  status: h.status,
  created_at: h.created_at,
}));

const portal_students = portal_admin_student_overview.map((s) => ({
  id: s.id,
  household_id: s.household_id,
  first_name: s.first_name,
  last_name: s.last_name,
  display_name: s.display_name,
  date_of_birth: s.date_of_birth,
  status: s.status,
  external_student_id: s.external_student_id,
}));

/**
 * Who is in which class, for the two screens that list a dancer's classes —
 * the family record and the dancer's own.
 *
 * Without these both screens only ever drew "Not enrolled in any class", so the
 * row layout they exist for (class name, day and time, a Dropped badge) was
 * never once measured by the audit. One dancer is deliberately given a dropped
 * enrollment: those stay on the screen because they explain an attendance
 * history, and the badge that says so is the widest thing on the row.
 */
const portal_enrollments = portal_admin_student_overview.flatMap((s, i) =>
  Array.from({ length: (i % 3) + 1 }, (_, n) => {
    const klass = portal_classes[(i * 2 + n) % portal_classes.length];
    const dropped = i % 4 === 2 && n === 0;
    return {
      id: `00000000-0000-4000-a400-${String(i * 4 + n + 1).padStart(12, '0')}`,
      student_id: s.id,
      class_id: klass.id,
      status: dropped ? 'dropped' : 'active',
      season: '2026',
      enrolled_on: dateOnly(-200),
      dropped_on: dropped ? dateOnly(-30) : null,
    };
  }),
);

const portal_attendance_gaps = portal_class_sessions.slice(0, 4).map((s) => ({
  class_id: s.class_id,
  session_id: s.id,
  session_date: s.session_date,
  expected: 12,
  marked: 9,
  missing: 3,
}));

/**
 * Everything the REST layer can serve, by table name.
 *
 * A table absent from here is served as [] rather than an error — see the
 * header of pgrest.js for why that is the honest answer.
 */
const tables = {
  profiles,
  portal_programs,
  portal_classes,
  portal_class_instructors,
  portal_updates,
  portal_events,
  portal_documents,
  work_categories,
  sops,
  job_tasks,
  calendar_events,
  employee_pay_rates,
  work_hours,
  work_hours_pay,
  work_days,
  task_templates,
  calendar_sources,
  portal_instructor_looks,
  portal_class_sessions,
  portal_admin_household_overview,
  portal_admin_student_overview,
  portal_admin_class_overview,
  portal_households,
  portal_students,
  portal_enrollments,
  portal_attendance_gaps,
};

module.exports = { tables, LOGIN_EMAIL, STAFF, PROG_ALLSTARS, PROG_ACADEMY };
