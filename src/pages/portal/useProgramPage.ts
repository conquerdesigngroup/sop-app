import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePortal } from '../../contexts/PortalContext';
import { useRefreshable } from '../../contexts/RefreshContext';
import { PortalProgram } from '../../types';
import { ProgramSlug } from '../../lib/portal';

/**
 * Shared plumbing for every page under /portal/:program.
 *
 * The slug is already validated by ProgramGate, which is the layout route these
 * pages render inside, so it can be asserted here rather than re-checked.
 */
export const useProgramPage = (): { slug: ProgramSlug; program: PortalProgram | undefined } => {
  const { program: slug } = useParams<{ program: string }>();
  const { getProgramBySlug } = usePortal();
  return { slug: slug as ProgramSlug, program: getProgramBySlug(slug ?? '') };
};

/**
 * Run a fetch when the program id becomes known.
 *
 * Portal reads are one-shot rather than subscribed: this content changes when a
 * teacher posts, not continuously, and a parent on a phone should not hold a
 * realtime socket open for it. The refresh button, pull-to-refresh and coming
 * back to the app are the refresh mechanism — and for a long time that
 * sentence was aspirational: nothing in the portal implemented any of them, so
 * a post made after the parent opened the app stayed invisible until iOS
 * happened to evict the page. Every query here now registers with
 * RefreshContext, which is what makes all three of those actually re-run it.
 *
 * The refresh path is silent: it swaps the data in when it arrives and never
 * touches `loading`, so the page stays put instead of flashing a skeleton.
 */
export function useProgramQuery<T>(
  programId: string | undefined,
  run: (programId: string) => Promise<T>,
  fallback: T
): { data: T; loading: boolean; error: string | null } {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!programId) return;

    let cancelled = false;
    setLoading(true);

    run(programId)
      .then(result => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch(e => {
        if (cancelled) return;
        console.error('Portal query failed:', e);
        setError('Could not load this yet. Pull down to try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      // Guards against a slow response for a previous program landing after the
      // parent has already switched sections.
      cancelled = true;
    };
    // `run` comes from PortalContext and is useCallback-stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId]);

  // The same query again, for the app-wide refresh. Read through refs so the
  // registration is stable, and checked against the CURRENT program id after
  // the await so a slow response for a section the parent has left cannot
  // land on the one they are now looking at.
  const runRef = useRef(run);
  runRef.current = run;
  const currentId = useRef(programId);
  currentId.current = programId;

  const refetch = useCallback(async () => {
    const id = currentId.current;
    if (!id) return;
    const result = await runRef.current(id);
    if (currentId.current !== id) return;
    setData(result);
    setError(null);
  }, []);
  useRefreshable(refetch, !!programId);

  return { data, loading, error };
}
