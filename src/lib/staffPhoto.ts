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

/** A viewable URL for a stored key, or null. Never throws — a broken picture
 *  must not take down the profile page it sits on. */
export const signStaffPhoto = async (path: string | null | undefined): Promise<string | null> => {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage
      .from(STAFF_PHOTO_BUCKET)
      .createSignedUrl(path, STAFF_PHOTO_TTL_SECONDS);
    return error ? null : data?.signedUrl ?? null;
  } catch {
    return null;
  }
};

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
