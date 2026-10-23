// =============================================================================
// evaluation-email — "email me my dancers' evaluations", without an oracle
// =============================================================================
//
// WHY THIS EXISTS
//
// Most families read evaluations on the portal dashboard. The ones without an
// app account — still around 335 of them — type the email the studio has on
// file into a public page, and if it matches a household, every SUBMITTED
// evaluation for every dancer in that household comes to them as an HTML email
// with a PDF attached. Drafts and unsubmitted evaluations are never sent.
//
// THE ENUMERATION RULE — copied from portal-signup, read its header in full
//
// This endpoint must not behave differently for an address that is on file
// versus one that is not. Not in the body, not in the status, not in the
// timing. So NOTHING that depends on the database happens before the
// response: the handler validates the shape, waits out a fixed floor, answers
// { ok: true }, and the lookup / render / send runs afterwards in a background
// task (EdgeRuntime.waitUntil). The response cannot leak what the work
// decides because it is written before the work starts.
//
// A matched address with nothing submitted yet still gets an email saying so.
// Silence there would be its own tell to the one person entitled to know.
//
// WHO MATCHES
//
// The typed address, lowercased and trimmed, against portal_households.
// primary_email (every household has one; none is shared). NEVER a
// portal_roster row with member_type = 'student': a child's address must not
// trigger delivery of the whole household's evaluations. The roster is not
// consulted at all.
//
// RATE LIMIT
//
// portal_signup_attempts (v28) with kind = 'evaluation_lookup', by email and
// by IP, pruned to 24h. An over-limit request gets the identical { ok: true }
// and does nothing but log.
//
// THE PDF
//
// Written by hand below — a text-only PDF is a few hundred bytes of structure
// and needs no dependency, which matters in a Deno function that has never
// loaded one. Helvetica, WinAnsi; characters outside Latin-1 become '?'.
//
// SENDING
//
// Resend, from an address on didc.app (verified for sending). RESEND_API_KEY
// is a Supabase function secret, never committed. EVALUATION_EMAIL_FROM may
// override the sender. With no key the task logs a failure and sends nothing;
// the page still said "if that address is on file, it is on its way", which is
// the one sentence that is true in every case.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-application-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const OK_BODY = { ok: true };
const FLOOR_MS = 250;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DEFAULT_FROM = 'DIDC Evaluations <evaluations@didc.app>';

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => '\\' + m);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const defer = (p: Promise<unknown>): Promise<unknown> | void => {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) {
    rt.waitUntil(p.catch((e) => console.error('evaluation-email deferred task failed:', e)));
    return;
  }
  return p.catch((e) => console.error('evaluation-email deferred task failed:', e));
};

// ------------------------------------------------------------------ the data

interface EvalRow {
  id: string;
  student_id: string;
  class_id: string;
  season: string;
  round: string;
  performance: number;
  attendance: number;
  showmanship: number;
  comment: string;
  move_up: boolean;
  submitted_at: string;
}

interface Snapshot {
  firstName: string;
  lastName: string;
  className: string;
  instructorName: string | null;
  season: string;
  round: string;
  performance: number;
  attendance: number;
  showmanship: number;
  comment: string;
  moveUp: boolean;
  submittedAt: string;
}

const RATING_LABELS: Record<number, string> = {
  1: 'Needs work', 2: 'Developing', 3: 'Solid', 4: 'Strong', 5: 'Outstanding',
};
const CRITERIA: { key: 'performance' | 'attendance' | 'showmanship'; label: string }[] = [
  { key: 'performance', label: 'Performance' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'showmanship', label: 'Showmanship' },
];

const prettyDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
};

// ------------------------------------------------------------------ the PDF

/** Latin-1 bytes; anything wider becomes '?'. Lengths then equal byte counts. */
const latin1 = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    out[i] = c < 256 ? c : 63;
  }
  return out;
};

const pdfEscape = (s: string) =>
  s.replace(/[\\()]/g, (m) => '\\' + m).replace(/[\r\n\t]/g, ' ');

interface PdfLine { text: string; size?: number; bold?: boolean; gap?: number }

const wrap = (text: string, max: number): string[] => {
  const out: string[] = [];
  text.split(/\r?\n/).forEach((para) => {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) { out.push(''); return; }
    let line = '';
    words.forEach((w) => {
      const next = line ? `${line} ${w}` : w;
      if (next.length > max && line) { out.push(line); line = w; } else line = next;
    });
    out.push(line);
  });
  return out;
};

/**
 * A multi-page, text-only PDF. Letter, 54pt margins, Helvetica. Returns the
 * bytes; the caller base64s them for the attachment.
 */
const buildPdf = (lines: PdfLine[]): Uint8Array => {
  const W = 612, H = 792, M = 54, BOTTOM = H - M;
  const pages: string[] = [];
  let content = '';
  let y = M;

  const flush = () => { pages.push(content); content = ''; y = M; };

  lines.forEach((l) => {
    const size = l.size ?? 10;
    const lead = Math.round(size * 1.4);
    if (y + lead > BOTTOM) flush();
    if (l.gap) y += l.gap;
    y += lead;
    const font = l.bold ? '/F2' : '/F1';
    content += `BT ${font} ${size} Tf ${M} ${(H - y).toFixed(1)} Td (${pdfEscape(l.text)}) Tj ET\n`;
  });
  flush();

  // Objects: 1 catalog, 2 pages, 3 F1, 4 F2, then per page: page, stream.
  const objects: string[] = [];
  const pageIds: number[] = [];
  pages.forEach((_, i) => pageIds.push(5 + i * 2));
  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
  pages.forEach((stream, i) => {
    const streamId = pageIds[i] + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`);
    objects.push(`<< /Length ${latin1(stream).length} >>\nstream\n${stream}endstream`);
  });

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (s: string) => { const b = latin1(s); chunks.push(b); length += b.length; };

  push('%PDF-1.4\n%âãÏÓ\n');
  objects.forEach((obj, i) => {
    offsets.push(length);
    push(`${i + 1} 0 obj\n${obj}\nendobj\n`);
  });
  const xref = length;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.forEach((o) => push(`${String(o).padStart(10, '0')} 00000 n \n`));
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  chunks.forEach((c) => { out.set(c, at); at += c.length; });
  return out;
};

const snapshotLines = (s: Snapshot): PdfLine[] => [
  { text: 'CLASS EVALUATION', size: 8, bold: true, gap: 10 },
  { text: `${s.firstName} ${s.lastName}`, size: 20, bold: true },
  { text: `Class: ${s.className}${s.instructorName ? `   Teacher: ${s.instructorName}` : ''}`, size: 10, gap: 6 },
  { text: `Season: ${s.season}   Round: ${s.round}   Submitted: ${prettyDate(s.submittedAt)}`, size: 10 },
  ...CRITERIA.flatMap((c) => {
    const v = s[c.key];
    return [{ text: `${c.label}: ${'■'.repeat(v)}${'□'.repeat(5 - v)}  ${RATING_LABELS[v]} (${v} of 5)`.replace(/■/g, '#').replace(/□/g, '-'), size: 11, gap: 6 }];
  }),
  { text: "Teacher's comments", size: 11, bold: true, gap: 10 },
  ...wrap(s.comment.trim() || 'No comment left.', 92).map((text) => ({ text, size: 10 })),
  { text: s.moveUp ? 'Recommended to move up to the next class.' : 'Recommended to continue at this level.', size: 10, bold: true, gap: 8 },
];

const pdfFor = (household: string, snaps: Snapshot[]): Uint8Array => {
  const lines: PdfLine[] = [
    { text: 'DIDC - Class evaluations', size: 14, bold: true },
    { text: `${household}   -   ${snaps.length} ${snaps.length === 1 ? 'evaluation' : 'evaluations'}   -   generated ${prettyDate(new Date().toISOString())}`, size: 9 },
  ];
  snaps.forEach((s, i) => {
    lines.push({ text: '', size: 10, gap: i === 0 ? 10 : 24 });
    lines.push(...snapshotLines(s));
  });
  return buildPdf(lines);
};

const base64 = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
};

// ----------------------------------------------------------------- the email

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const htmlFor = (household: string, season: string | null, snaps: Snapshot[]): string => {
  const byStudent = new Map<string, Snapshot[]>();
  snaps.forEach((s) => {
    const k = `${s.firstName} ${s.lastName}`;
    byStudent.set(k, [...(byStudent.get(k) ?? []), s]);
  });

  const blocks = Array.from(byStudent.entries()).map(([name, list]) => `
    <h2 style="font:700 18px/1.3 Helvetica,Arial,sans-serif;margin:28px 0 8px;color:#111">${esc(name)}</h2>
    ${list.map((s) => `
      <div style="border:1px solid #ddd;border-radius:8px;padding:14px 16px;margin:0 0 12px">
        <div style="font:600 14px/1.4 Helvetica,Arial,sans-serif;color:#111">${esc(s.className)}${s.instructorName ? ` <span style="color:#666;font-weight:400">· ${esc(s.instructorName)}</span>` : ''}</div>
        <div style="font:12px/1.4 Helvetica,Arial,sans-serif;color:#666;margin-bottom:10px">${esc(s.season)} · ${esc(s.round)} · ${esc(prettyDate(s.submittedAt))}</div>
        <table cellpadding="0" cellspacing="0" style="font:13px/1.6 Helvetica,Arial,sans-serif;color:#111">
          ${CRITERIA.map((c) => {
            const v = s[c.key];
            return `<tr><td style="padding-right:14px;color:#444">${c.label}</td><td style="padding-right:10px;letter-spacing:2px">${'&#9632;'.repeat(v)}<span style="color:#bbb">${'&#9633;'.repeat(5 - v)}</span></td><td><strong>${esc(RATING_LABELS[v])}</strong> <span style="color:#666">· ${v}/5</span></td></tr>`;
          }).join('')}
        </table>
        <p style="font:13px/1.5 Helvetica,Arial,sans-serif;color:${s.comment.trim() ? '#111' : '#666'};margin:10px 0 0;white-space:pre-wrap">${esc(s.comment.trim() || 'No comment left.')}</p>
        ${s.moveUp ? `<p style="font:600 12px/1.4 Helvetica,Arial,sans-serif;color:#0a7a4b;margin:10px 0 0">Recommended to move up to the next class.</p>` : ''}
      </div>`).join('')}`).join('');

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f6">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:24px 24px 28px">
    <h1 style="font:800 22px/1.2 Helvetica,Arial,sans-serif;margin:0 0 6px;color:#111">Class evaluations</h1>
    <p style="font:14px/1.5 Helvetica,Arial,sans-serif;color:#444;margin:0">
      Hello ${esc(household)}. Here ${snaps.length === 1 ? 'is the evaluation' : `are the ${snaps.length} evaluations`} your dancers' teachers have submitted${season ? ` for ${esc(season)}` : ''}. The same evaluations are attached as a PDF.
    </p>
    ${blocks}
    <p style="font:12px/1.5 Helvetica,Arial,sans-serif;color:#666;margin:28px 0 0">
      You are receiving this because this address was entered on the DIDC evaluations page. If that was not you, there is nothing to do — nothing about your account has changed.
    </p>
  </div></body></html>`;
};

const nothingYetHtml = (household: string): string => `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f6">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">
    <h1 style="font:800 22px/1.2 Helvetica,Arial,sans-serif;margin:0 0 6px;color:#111">Class evaluations</h1>
    <p style="font:14px/1.5 Helvetica,Arial,sans-serif;color:#444;margin:0">
      Hello ${esc(household)}. No evaluations have been submitted for your dancers yet this season. Teachers fill them in a couple of times a season; ask again once the round is done, or make a portal account to see them the moment they are submitted.
    </p>
  </div></body></html>`;

// ------------------------------------------------------------------ handler

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    return json(500, { error: 'Function is missing Supabase environment configuration' });
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Body must be JSON' });
  }

  const started = Date.now();
  const respondOk = async () => {
    await sleep(Math.max(0, FLOOR_MS - (Date.now() - started)));
    return json(200, OK_BODY);
  };

  // Shape only — reflects what the CALLER typed, never what the database holds.
  const email = (body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json(400, { error: 'A valid email address is required' });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const log = async (action: string, result: 'success' | 'failure', details: Record<string, unknown>) => {
    const { error } = await admin.rpc('log_activity', {
      p_action: action,
      p_entity_type: 'portal_household',
      p_entity_id: (details.household_id as string | undefined) ?? null,
      p_entity_title: email,
      p_details: details,
      p_result: result,
      p_actor_kind: 'visitor',
      p_actor_id: null,
      p_actor_email: email,
      p_actor_name: null,
    });
    if (error) console.error('evaluation-email could not write log:', error.message);
  };

  const overLimit = async (perEmailHour: number, perIpHour: number) => {
    const kind = 'evaluation_lookup';
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await admin.from('portal_signup_attempts').delete().lt('created_at', dayAgo);
    const [byEmail, byIp] = await Promise.all([
      admin.from('portal_signup_attempts').select('id', { count: 'exact', head: true })
        .eq('kind', kind).ilike('email', escapeLike(email)).gte('created_at', hourAgo),
      admin.from('portal_signup_attempts').select('id', { count: 'exact', head: true })
        .eq('kind', kind).eq('ip', ip).gte('created_at', hourAgo),
    ]);
    await admin.from('portal_signup_attempts').insert({ kind, email, ip });
    return (byEmail.count ?? 0) >= perEmailHour || (byIp.count ?? 0) >= perIpHour;
  };

  defer((async () => {
    if (await overLimit(3, 20)) {
      await log('evaluation_email_requested', 'failure', { reason: 'rate_limited', ip });
      return;
    }

    // ---- the household. primary_email only; never the roster, never a student row.
    const { data: households, error: hhErr } = await admin
      .from('portal_households')
      .select('id, display_name, primary_email, status')
      .ilike('primary_email', escapeLike(email))
      .limit(1);
    if (hhErr) {
      await log('evaluation_email_requested', 'failure', { reason: 'lookup_failed', message: hhErr.message });
      return;
    }
    const household = households?.[0];
    if (!household || household.status !== 'active') {
      await log('evaluation_email_requested', 'failure', { reason: 'no_match', ip });
      return;
    }

    const { data: students } = await admin
      .from('portal_students')
      .select('id, first_name, last_name')
      .eq('household_id', household.id);
    const studentIds = (students ?? []).map((s) => s.id);

    let evals: EvalRow[] = [];
    if (studentIds.length > 0) {
      const { data } = await admin
        .from('portal_evaluations')
        .select('id, student_id, class_id, season, round, performance, attendance, showmanship, comment, move_up, submitted_at')
        .in('student_id', studentIds)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false });
      evals = (data ?? []) as EvalRow[];
    }

    // Current season only (open decision 3): the newest season that has anything.
    const season = evals.map((e) => e.season).sort().reverse()[0] ?? null;
    const current = season ? evals.filter((e) => e.season === season) : [];

    const classIds = Array.from(new Set(current.map((e) => e.class_id)));
    const classes = new Map<string, { name: string; instructor_name: string | null }>();
    if (classIds.length > 0) {
      const { data } = await admin.from('portal_classes').select('id, name, instructor_name').in('id', classIds);
      (data ?? []).forEach((c) => classes.set(c.id, { name: c.name, instructor_name: c.instructor_name ?? null }));
    }
    const studentById = new Map((students ?? []).map((s) => [s.id, s]));

    const snaps: Snapshot[] = current.map((e) => {
      const s = studentById.get(e.student_id);
      const c = classes.get(e.class_id);
      return {
        firstName: s?.first_name ?? '',
        lastName: s?.last_name ?? '',
        className: c?.name ?? 'Class',
        instructorName: c?.instructor_name ?? null,
        season: e.season,
        round: e.round,
        performance: e.performance,
        attendance: e.attendance,
        showmanship: e.showmanship,
        comment: e.comment ?? '',
        moveUp: Boolean(e.move_up),
        submittedAt: e.submitted_at,
      };
    }).sort((a, b) => a.firstName.localeCompare(b.firstName) || a.className.localeCompare(b.className));

    const who = household.display_name || 'there';
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      await log('evaluation_email_requested', 'failure', { reason: 'no_resend_key', household_id: household.id, evaluations: snaps.length });
      return;
    }

    const payload: Record<string, unknown> = {
      from: Deno.env.get('EVALUATION_EMAIL_FROM') || DEFAULT_FROM,
      to: [household.primary_email],
      subject: snaps.length === 0 ? 'DIDC: no evaluations submitted yet' : `DIDC class evaluations${season ? ` — ${season}` : ''}`,
      html: snaps.length === 0 ? nothingYetHtml(who) : htmlFor(who, season, snaps),
    };
    if (snaps.length > 0) {
      payload.attachments = [{
        filename: `didc-evaluations-${season ?? 'all'}.pdf`,
        content: base64(pdfFor(who, snaps)),
      }];
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      await log('evaluation_email_requested', 'failure', {
        reason: 'send_failed', status: res.status, message: text.slice(0, 300), household_id: household.id,
      });
      return;
    }
    await log('evaluation_email_sent', 'success', {
      household_id: household.id, season, evaluations: snaps.length, dancers: studentIds.length, ip,
    });
  })());

  return respondOk();
});
