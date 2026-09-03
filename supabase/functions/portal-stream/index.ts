// =============================================================================
// portal-stream — class videos in Cloudflare Stream
// =============================================================================
//
// WHY THIS EXISTS
//
// A class video is 1–3 GB off a phone. The bucket would keep every byte and
// send every byte to every parent; Cloudflare Stream re-encodes once and
// streams whatever size each viewer's connection can carry. Stream needs an
// API token to open an upload, and that token must never reach a browser, so
// this function is the only thing that holds it. The phone talks to Cloudflare
// directly for the bytes themselves — nothing large passes through here.
//
// THREE ACTIONS
//
//   create   Mint a one-time resumable (tus) upload URL for one video. The
//            caller must be allowed to edit the class it is for — the same
//            can_edit_portal_class() the row insert will be checked against,
//            asked first so nobody uploads a video they cannot then attach.
//            Returns the uid, the upload URL, and the playback base URL.
//
//   status   Ask Cloudflare where a video is and write the answer onto its
//            portal_documents row (stream_status, duration_seconds). Any
//            portal author may ask; the answer is a fact, not a permission.
//
//   delete   Remove the video from Cloudflare, then its row. Video first for
//            the same reason the bucket path deletes the object first: a row
//            that outlives its video is visible and retryable, a video that
//            outlives its row is billed and unreachable.
//
// SECRETS (set on this function, never in the repo)
//
//   CF_ACCOUNT_ID    the Cloudflare account, from the dashboard URL
//   CF_STREAM_TOKEN  an API token with "Stream: Edit" on that account and
//                    nothing else — it cannot touch the drop-list R2 buckets
//   STREAM_ALLOWED_ORIGINS   optional, comma-separated; defaults below
//   STREAM_MAX_DURATION_SECONDS   optional; defaults to three hours
//
// TWO CLIENTS (the admin-users pattern)
//
// `caller` carries the requester's JWT: authorisation RPCs run as the real
// person and the row delete goes through RLS. `admin` holds the service role
// for the one thing RLS should not decide — writing Cloudflare's status onto
// a row that a teacher who did not upload it may be the one asking about.
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

// Stream's own ceiling is 30 GB; the client stops at 20 and this is the backstop.
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024 * 1024;
const DEFAULT_MAX_DURATION_SECONDS = 3 * 60 * 60;
// Where the player is allowed to run. Preview deployments are not listed, so
// a video will not play on a random *.vercel.app preview URL — by design.
const DEFAULT_ALLOWED_ORIGINS = [
  'didc.app',
  'www.didc.app',
  'sop-app-tony-zs-projects.vercel.app',
  'sop-app-zeta.vercel.app',
  'localhost:3000',
];
const UID_RE = /^[a-f0-9]{32}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TITLE = 200;

/** tus Upload-Metadata values are base64 of UTF-8, and btoa alone is Latin-1. */
const b64 = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

type StreamStatus = 'pending' | 'ready' | 'error';

interface CfVideo {
  uid: string;
  readyToStream?: boolean;
  status?: { state?: string; errorReasonCode?: string; errorReasonText?: string };
  duration?: number;
  preview?: string;
  allowedOrigins?: string[];
  creator?: string | null;
}

interface CfReply {
  ok: boolean;
  status: number;
  result?: CfVideo;
  errors?: { code?: number; message?: string }[];
}

interface Body {
  action?: 'create' | 'status' | 'delete';
  classId?: string | null;
  title?: string;
  fileName?: string;
  sizeBytes?: number;
  uid?: string;
}

const toStatus = (v: CfVideo): StreamStatus => {
  const state = v.status?.state ?? '';
  if (state === 'error') return 'error';
  if (v.readyToStream || state === 'ready') return 'ready';
  return 'pending';
};

/** "https://customer-x.cloudflarestream.com/<uid>/watch" → the part before /watch. */
const playbackBase = (preview: string | undefined): string | null =>
  preview ? preview.replace(/\/watch\/?$/, '') : null;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Missing Authorization header' });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) {
    return json(500, { error: 'Function is missing Supabase environment configuration' });
  }

  const account = Deno.env.get('CF_ACCOUNT_ID');
  const cfToken = Deno.env.get('CF_STREAM_TOKEN');
  if (!account || !cfToken) {
    return json(500, {
      error: 'Video uploads are not switched on yet: CF_ACCOUNT_ID and CF_STREAM_TOKEN must be set on the portal-stream function.',
    });
  }

  const maxDuration =
    Number(Deno.env.get('STREAM_MAX_DURATION_SECONDS')) || DEFAULT_MAX_DURATION_SECONDS;
  const configuredOrigins = (Deno.env.get('STREAM_ALLOWED_ORIGINS') ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const allowedOrigins = configuredOrigins.length ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS;

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'Invalid or expired session' });
  const callerId = userData.user.id;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Body must be JSON' });
  }

  // ------------------------------------------------------------- helpers

  const cf = (path: string, init: RequestInit = {}) =>
    fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/stream${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${cfToken}`, ...(init.headers ?? {}) },
    });

  const cfJson = async (path: string, init: RequestInit = {}): Promise<CfReply> => {
    const r = await cf(path, init);
    let parsed: { success?: boolean; result?: CfVideo; errors?: CfReply['errors'] } | null = null;
    try { parsed = await r.json(); } catch { /* non-JSON body: treated as no detail */ }
    return {
      ok: r.ok && parsed?.success !== false,
      status: r.status,
      result: parsed?.result,
      errors: parsed?.errors,
    };
  };

  const cfError = (what: string, r: CfReply) =>
    `Cloudflare Stream ${what} failed (${r.status}): ${
      r.errors?.map((e) => e.message).filter(Boolean).join('; ') || 'no detail'
    }`;

  const setVideoProps = (uid: string, props: Record<string, unknown>) =>
    cfJson(`/${uid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(props),
    });

  // Through `caller`: log_activity takes identity from the JWT.
  const log = async (
    action: string,
    entityId: string | null,
    entityTitle: string | null,
    details: Record<string, unknown>,
    result: 'success' | 'failure' = 'success',
  ) => {
    const { error } = await caller.rpc('log_activity', {
      p_action: action,
      p_entity_type: 'document',
      p_entity_id: entityId,
      p_entity_title: entityTitle,
      p_details: details,
      p_result: result,
    });
    if (error) console.error('portal-stream could not write log:', error.message);
  };

  const mayEditClass = async (classId: string | null) => {
    const { data, error } = await caller.rpc('can_edit_portal_class', { target_class: classId });
    return !error && data === true;
  };
  const mayEditPortal = async () => {
    const { data, error } = await caller.rpc('can_edit_portal');
    return !error && data === true;
  };

  // ------------------------------------------------------------- actions

  switch (body.action) {
    case 'create': {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const fileName = typeof body.fileName === 'string' ? body.fileName.slice(0, 255) : '';
      const sizeBytes = body.sizeBytes;
      const classId = body.classId ?? null;

      if (!title || title.length > MAX_TITLE) return json(400, { error: 'title is required' });
      if (!Number.isInteger(sizeBytes) || (sizeBytes as number) <= 0) {
        return json(400, { error: 'sizeBytes must be a positive integer' });
      }
      if ((sizeBytes as number) > MAX_UPLOAD_BYTES) {
        return json(400, { error: 'That video is over the 30 GB Cloudflare Stream limit.' });
      }
      if (classId !== null && !UUID_RE.test(classId)) return json(400, { error: 'classId is not a uuid' });

      if (!(await mayEditClass(classId))) {
        await log('portal_stream_denied', null, title, { attemptedAction: 'create', classId }, 'failure');
        return json(403, { error: 'You can only post videos to your own classes.' });
      }

      // The upload URL dies after a day; a 3 GB file on studio wifi is an hour.
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const metadata = [
        `maxDurationSeconds ${b64(String(maxDuration))}`,
        `name ${b64(title)}`,
        `expiry ${b64(expiry)}`,
      ].join(',');

      const opened = await cf('?direct_user=true', {
        method: 'POST',
        headers: {
          'Tus-Resumable': '1.0.0',
          'Upload-Length': String(sizeBytes),
          'Upload-Metadata': metadata,
        },
      });
      const uploadUrl = opened.headers.get('Location');
      const uid = opened.headers.get('stream-media-id');

      if (!opened.ok || !uploadUrl || !uid) {
        const text = (await opened.text().catch(() => '')).slice(0, 300);
        await log('stream_upload_created', null, title, { status: opened.status, reason: text }, 'failure');
        return json(502, {
          error: `Cloudflare Stream would not open an upload (${opened.status}). ${text}`.trim(),
        });
      }

      // Non-fatal: the video works without these. They pin playback to our
      // domains and record who posted it, which `delete` relies on for a
      // video whose row was never written.
      const props = await setVideoProps(uid, {
        allowedOrigins,
        creator: callerId,
        meta: { name: title, fileName, classId: classId ?? '', uploadedBy: callerId },
      });
      if (!props.ok) console.error(cfError('property update', props));

      const details = await cfJson(`/${uid}`);
      const playbackUrl = playbackBase(details.result?.preview);
      if (!playbackUrl) {
        // Without the playback base the row cannot be written (v40 CHECK), so
        // do not leave a reserved upload behind.
        await cf(`/${uid}`, { method: 'DELETE' }).catch(() => undefined);
        return json(502, { error: cfError('lookup', details) });
      }

      await log('stream_upload_created', null, title, { uid, classId, fileName, sizeBytes });
      return json(200, { uid, uploadUrl, playbackUrl, expiresAt: expiry });
    }

    case 'status': {
      const uid = body.uid ?? '';
      if (!UID_RE.test(uid)) return json(400, { error: 'uid is required' });
      if (!(await mayEditPortal())) return json(403, { error: 'Portal access required' });

      const r = await cfJson(`/${uid}`);
      if (!r.ok || !r.result) {
        return json(r.status === 404 ? 404 : 502, { error: cfError('lookup', r) });
      }
      const v = r.result;
      const status = toStatus(v);
      const durationSeconds = v.duration && v.duration > 0 ? Math.round(v.duration) : null;
      const playbackUrl = playbackBase(v.preview);

      const patch: Record<string, unknown> = { stream_status: status };
      if (durationSeconds !== null) patch.duration_seconds = durationSeconds;
      if (playbackUrl) patch.stream_playback_url = playbackUrl;
      const { error: rowErr } = await admin
        .from('portal_documents')
        .update(patch)
        .eq('stream_uid', uid);
      if (rowErr) console.error('portal-stream could not record status:', rowErr.message);

      // Belt and braces: if the property update at create time failed, the
      // first status check after it is ready sets the origins.
      if (status === 'ready' && !(v.allowedOrigins?.length)) {
        const fix = await setVideoProps(uid, { allowedOrigins });
        if (!fix.ok) console.error(cfError('origin update', fix));
      }

      return json(200, {
        status,
        state: v.status?.state ?? null,
        durationSeconds,
        errorText: v.status?.errorReasonText || null,
        playbackUrl,
      });
    }

    case 'delete': {
      const uid = body.uid ?? '';
      if (!UID_RE.test(uid)) return json(400, { error: 'uid is required' });

      const { data: row } = await admin
        .from('portal_documents')
        .select('id, class_id, title, file_name')
        .eq('stream_uid', uid)
        .maybeSingle();

      let allowed = false;
      if (row) {
        allowed = await mayEditClass(row.class_id);
      } else if (await mayEditPortal()) {
        // No row: an upload whose insert failed or was cancelled. Only the
        // person who opened it may clean it up — that is what `creator` is
        // for. A video Cloudflare no longer has is nobody's to refuse.
        const v = await cfJson(`/${uid}`);
        allowed = v.status === 404 || v.result?.creator === callerId;
      }
      if (!allowed) {
        await log('portal_stream_denied', row?.id ?? null, row?.title ?? null,
          { attemptedAction: 'delete', uid }, 'failure');
        return json(403, { error: 'You can only delete videos on your own classes.' });
      }

      const del = await cf(`/${uid}`, { method: 'DELETE' });
      if (!del.ok && del.status !== 404) {
        const text = (await del.text().catch(() => '')).slice(0, 200);
        return json(502, {
          error: `Cloudflare Stream would not delete the video (${del.status}). Nothing was removed. ${text}`.trim(),
        });
      }

      if (row) {
        const { error } = await caller.from('portal_documents').delete().eq('id', row.id);
        if (error) {
          return json(500, {
            error: `The video is gone from Cloudflare but its entry could not be removed (${error.message}). Delete it again to clear the entry.`,
          });
        }
      }
      return json(200, { deleted: true, hadRow: Boolean(row) });
    }

    default:
      return json(400, { error: 'Unknown action' });
  }
});
