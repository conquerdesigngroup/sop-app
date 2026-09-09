import { supabase } from './supabase';

/**
 * A member of staff's own photograph.
 *
 * DELIBERATELY NOT PART OF THE AVATAR SYSTEM
 *
 * lib/avatarPalette.ts says, and still says, that there are no photo uploads on
 * that surface — initials and icons only, which removes moderation, storage
 * cost and the question of hosting photographs of children in one decision.
 * None of that reasoning is weakened here, because none of it applies:
 *
 *   These are adults, and staff. Consent is the act of uploading it: nobody
 *   else can put a picture on your profile, not even an admin.
 *
 *   It never reaches a parent. The bucket is readable only by
 *   public.is_active_staff(). Parents have accounts too, so `authenticated`
 *   would have been the wrong test and the portal keeps its coloured marks —
 *   see TeacherAvatar, which is unchanged.
 *
 * A PATH, NOT A URL
 *
 * profiles.avatar_path holds the object key. The bucket is private, so what a
 * browser needs is a SIGNED url, and a signed url expires — storing one would
 * mean every profile picture in the studio going quietly broken an hour later.
 * The app signs on read. `profiles.avatar_url` is left alone: it is unused on
 * every row, and calling a storage key a "url" is a lie the next reader has to
 * find out the hard way.
 *
 * THE OBJECT NAME MUST START WITH THE UPLOADER'S OWN UID
 *
 * That is not a convention, it is the storage policy: staff_photos_write_own
 * compares (storage.foldername(name))[1] against auth.uid(). Build a key any
 * other way and the upload is refused.
 */

export const STAFF_PHOTO_BUCKET = 'staff-photos';

/** What the bucket and the UI both accept. Checked before upload, not after. */
export const STAFF_PHOTO_MIME: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

export const MAX_STAFF_PHOTO_MB = 6;
export const MAX_STAFF_PHOTO_BYTES = MAX_STAFF_PHOTO_MB * 1024 * 1024;

/** An hour, matching the document signer. Long enough for a session. */
export const STAFF_PHOTO_TTL_SECONDS = 60 * 60;

const extensionFor = (file: File): string => {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
};

/**
 * A fresh key each time, rather than a stable one per person.
 *
 * A stable key would need `upsert: true`, and would then be cached by the
 * browser and the CDN under the same name — so replacing your photo would show
 * you the old one until the cache expired, which reads as "the upload did not
 * work" and gets tried again. The old object is deleted after the new row is
 * written, in that order, so a failure part-way leaves a stale file rather than
 * a profile pointing at nothing.
 */
export const buildStaffPhotoPath = (uid: string, file: File): string =>
  `${uid}/${Date.now()}.${extensionFor(file)}`;

/** Human-readable refusal, or null when the file is fine. */
export const describePhotoProblem = (file: File): string | null => {
  if (!STAFF_PHOTO_MIME.includes(file.type)) {
    return 'That has to be a JPEG, PNG or WebP image.';
  }
  if (file.size > MAX_STAFF_PHOTO_BYTES) {
    return `That picture is ${(file.size / 1024 / 1024).toFixed(1)} MB. Keep it under ${MAX_STAFF_PHOTO_MB} MB.`;
  }
  return null;
};

/**
 * Signing, cached and batched.
 *
 * WHY THIS IS NOT ONE REQUEST PER AVATAR
 *
 * The photo shows on the team list, the assignee pickers and the header, so a
 * screen can easily ask for forty at once. One createSignedUrl each is forty
 * round trips to render one list, on a page that already had its data.
 *
 * So a miss joins a queue that is flushed on the next tick through
 * createSignedUrls — every avatar mounted in the same render batches into a
 * single request — and the answer is cached by path. Paths are immutable
 * (uploadStaffPhoto mints a new key every time) so a cached URL can never be
 * stale for the wrong picture; it only expires, which the TTL outlives for any
 * realistic session.
 *
 * A failure caches `null` rather than retrying forever: a broken picture must
 * fall back to initials, not spin.
 */
const cache = new Map<string, string | null>();
let queue = new Set<string>();
let flushing: Promise<void> | null = null;
const waiters = new Set<() => void>();

const flush = async (): Promise<void> => {
  const paths = Array.from(queue);
  queue = new Set();
  if (paths.length) {
    try {
      const { data, error } = await supabase.storage
        .from(STAFF_PHOTO_BUCKET)
        .createSignedUrls(paths, STAFF_PHOTO_TTL_SECONDS);
      if (error || !data) {
        paths.forEach(p => cache.set(p, null));
      } else {
        // The response is per-path and each entry carries its own error, so a
        // single missing object cannot blank out everybody else's picture.
        data.forEach((row: any) => {
          if (row?.path) cache.set(row.path, row.error ? null : row.signedUrl ?? null);
        });
        paths.forEach(p => { if (!cache.has(p)) cache.set(p, null); });
      }
    } catch {
      paths.forEach(p => cache.set(p, null));
    }
  }
  flushing = null;
  const listeners = Array.from(waiters);
  waiters.clear();
  listeners.forEach(fn => fn());
};

const request = (path: string): Promise<void> => {
  queue.add(path);
  if (!flushing) flushing = new Promise<void>(resolve => {
    setTimeout(() => { void flush().then(resolve); }, 0);
  });
  return flushing;
};

/**
 * A viewable URL for a stored key, or null.
 *
 * Never throws — a broken picture must not take down the page it sits on.
 */
export const signStaffPhoto = async (path: string | null | undefined): Promise<string | null> => {
  if (!path) return null;
  if (cache.has(path)) return cache.get(path) ?? null;

  await new Promise<void>(resolve => { waiters.add(resolve); void request(path); });
  return cache.get(path) ?? null;
};

/** Synchronous peek, for a first paint that already has the answer. */
export const cachedStaffPhoto = (path: string | null | undefined): string | null | undefined =>
  path ? cache.get(path) : null;

export const uploadStaffPhoto = async (uid: string, file: File): Promise<string> => {
  const path = buildStaffPhotoPath(uid, file);
  const { error } = await supabase.storage
    .from(STAFF_PHOTO_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
};

/** Best effort. A leftover object is untidy; a failed delete that blocks the
 *  save would leave the profile pointing at a picture the person replaced. */
export const removeStaffPhoto = async (path: string | null | undefined): Promise<void> => {
  if (!path) return;
  try {
    await supabase.storage.from(STAFF_PHOTO_BUCKET).remove([path]);
  } catch {
    /* ignored on purpose — see above */
  }
};
