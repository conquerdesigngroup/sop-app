import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePortal } from '../../contexts/PortalContext';
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
 * realtime socket open for it. Pull-to-refresh and reopening the app are the
 * refresh mechanism.
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

  return { data, loading, error };
}
