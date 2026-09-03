import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSOPs } from '../contexts/SOPContext';
import { useTask } from '../contexts/TaskContext';
import { usePortalAdmin } from '../contexts/PortalAdminContext';
import { useThemeColors } from '../contexts/ThemeContext';
import { useResponsive } from '../hooks/useResponsive';
import { theme } from '../theme';
import { PortalClass, PortalProgram } from '../types';

/**
 * One search over everything.
 *
 * WHY THIS EXISTS
 *
 * Five pages each had their own search box and none of them knew about the
 * others. Finding "the hip hop class" or "that opening-checklist task" on a
 * phone meant guessing the page first. This searches SOPs, job tasks,
 * templates, the team and the portal classes at once, and each hit lands on
 * its page with the thing already open — through the same `location.state`
 * deep links the Alerts page and the Activity Log use.
 *
 * All of it is client-side over data the contexts already hold; the only
 * fetch is the portal classes, loaded once per open because the portal
 * context keeps them per program rather than in state.
 */

interface Hit {
  key: string;
  group: 'Tasks' | 'SOPs' | 'Templates' | 'People' | 'Classes';
  title: string;
  subtitle?: string;
  go: () => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PER_GROUP = 5;

const matches = (haystack: (string | undefined | null)[], needle: string): boolean =>
  haystack.some(h => !!h && h.toLowerCase().includes(needle));

interface Props {
  open: boolean;
  onClose: () => void;
}

const GlobalSearch: React.FC<Props> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const colors = useThemeColors();
  const { isMobileOrTablet } = useResponsive();
  const { users, isAdmin } = useAuth();
  const { sops } = useSOPs();
  const { jobTasks, taskTemplates } = useTask();
  const { programs, fetchClasses, canEdit: canEditPortal } = usePortalAdmin();

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [classes, setClasses] = useState<{ program: PortalProgram; cls: PortalClass }[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fresh each time it opens.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  // Portal classes: fetched once per open, only for someone who can edit them.
  useEffect(() => {
    if (!open || !canEditPortal || classes !== null || programs.length === 0) return;
    let cancelled = false;
    Promise.all(programs.map(async program => {
      try {
        const list = await fetchClasses(program.id);
        return list.map(cls => ({ program, cls }));
      } catch {
        return [];
      }
    })).then(lists => { if (!cancelled) setClasses(lists.flat()); });
    return () => { cancelled = true; };
  }, [open, canEditPortal, classes, programs, fetchClasses]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const userName = (id: string) => {
    const u = users.find(x => x.id === id);
    return u ? `${u.firstName} ${u.lastName}` : '';
  };

  const hits = useMemo((): Hit[] => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: Hit[] = [];

    const go = (path: string, state?: Record<string, unknown>) => () => {
      onClose();
      navigate(path, state ? { state } : undefined);
    };

    jobTasks
      .filter(t => t.status !== 'archived')
      .filter(t => matches([t.title, t.description, t.category, t.department, ...t.assignedTo.map(userName)], q))
      .slice(0, PER_GROUP)
      .forEach(t => out.push({
        key: `task-${t.id}`,
        group: 'Tasks',
        title: t.title,
        subtitle: [t.scheduledDate, t.assignedTo.map(userName).filter(Boolean).join(', ') || 'Unassigned', t.status].join(' · '),
        go: go(isAdmin ? '/job-tasks' : '/my-tasks', isAdmin ? { openTaskId: t.id } : undefined),
      }));

    sops
      .filter(s => !s.isTemplate && s.status !== 'archived')
      .filter(s => matches([s.title, s.description, s.category, s.department, ...(s.tags || [])], q))
      .slice(0, PER_GROUP)
      .forEach(s => out.push({
        key: `sop-${s.id}`,
        group: 'SOPs',
        title: s.title,
        subtitle: [s.department, s.category, s.status].filter(Boolean).join(' · '),
        go: go('/sop', { openSopId: s.id }),
      }));

    if (isAdmin) {
      taskTemplates
        .filter(t => matches([t.title, t.description, t.category, t.department], q))
        .slice(0, PER_GROUP)
        .forEach(t => out.push({
          key: `tpl-${t.id}`,
          group: 'Templates',
          title: t.title,
          subtitle: [t.department, t.category, `${t.steps?.length ?? 0} steps`].filter(Boolean).join(' · '),
          go: go('/task-library'),
        }));

      users
        .filter(u => u.role !== 'client')
        .filter(u => matches([u.firstName, u.lastName, `${u.firstName} ${u.lastName}`, u.email, u.department], q))
        .slice(0, PER_GROUP)
        .forEach(u => out.push({
          key: `user-${u.id}`,
          group: 'People',
          title: `${u.firstName} ${u.lastName}`,
          subtitle: [u.department, u.email].filter(Boolean).join(' · '),
          go: go('/team', { searchTerm: `${u.firstName} ${u.lastName}` }),
        }));
    }

    (classes || [])
      .filter(({ cls }) => cls.isActive !== false)
      .filter(({ cls, program }) => matches([cls.name, cls.instructorName, cls.style, cls.ageGroup, cls.location, program.name], q))
      .slice(0, PER_GROUP)
      .forEach(({ cls, program }) => out.push({
        key: `class-${cls.id}`,
        group: 'Classes',
        title: cls.name,
        subtitle: [
          program.name,
          cls.dayOfWeek !== null && cls.dayOfWeek !== undefined ? DAY_NAMES[cls.dayOfWeek] : null,
          cls.startTime ? cls.startTime.slice(0, 5) : null,
          cls.instructorName,
        ].filter(Boolean).join(' · '),
        go: () => {
          onClose();
          navigate(`/portal-admin?program=${encodeURIComponent(program.slug)}&section=classes&class=${encodeURIComponent(cls.id)}`);
        },
      }));

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, jobTasks, sops, taskTemplates, users, classes, isAdmin]);

  useEffect(() => { setCursor(0); }, [query]);

  // Keep the highlighted row on screen while arrowing through a long list.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(hits.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
    else if (e.key === 'Enter' && hits[cursor]) { e.preventDefault(); hits[cursor].go(); }
  };

  let lastGroup: Hit['group'] | null = null;

  return (
    <>
      <div
        className="modal-backdrop backdrop-blur-sm"
        onClick={onClose}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: theme.colors.overlay,
          // Above the header (100) and the menu sheet: this replaces the page
          // for as long as it is open.
          zIndex: 1200,
        }}
      />
      <div
        role="dialog"
        aria-label="Search"
        className={isMobileOrTablet ? undefined : 'modal-content'}
        style={{
          position: 'fixed',
          zIndex: 1201,
          backgroundColor: colors.bg.secondary,
          border: `2px solid ${colors.bdr.secondary}`,
          display: 'flex',
          flexDirection: 'column',
          ...(isMobileOrTablet
            ? {
                top: 0, left: 0, right: 0, bottom: 0,
                borderRadius: 0,
                borderWidth: 0,
                paddingTop: 'env(safe-area-inset-top)',
                paddingBottom: 'env(safe-area-inset-bottom)',
              }
            : {
                top: '10vh', left: '50%', transform: 'translateX(-50%)',
                width: 'min(640px, calc(100vw - 32px))',
                maxHeight: '75vh',
                borderRadius: theme.borderRadius.lg,
                boxShadow: theme.shadows.lg,
              }),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: `1px solid ${colors.bdr.primary}` }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: colors.txt.tertiary, flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={isAdmin ? 'Search tasks, SOPs, people, classes…' : 'Search tasks and SOPs…'}
            aria-label="Search"
            autoComplete="off"
            enterKeyHint="go"
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: '17px',
              fontFamily: theme.fonts.primary,
              color: colors.txt.primary,
              background: 'transparent',
              border: 'none',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: colors.txt.tertiary, padding: '6px', display: 'flex',
            }}
          >
            {isMobileOrTablet ? (
              <span style={{ fontSize: '15px', fontWeight: 600 }}>Cancel</span>
            ) : (
              <kbd style={{ fontFamily: theme.fonts.mono, fontSize: '11px', padding: '2px 6px', border: `1px solid ${colors.bdr.secondary}`, borderRadius: '4px' }}>esc</kbd>
            )}
          </button>
        </div>

        <div ref={listRef} style={{ overflowY: 'auto', padding: '8px', flex: 1, minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
          {query.trim().length < 2 ? (
            <p style={{ margin: 0, padding: '20px 12px', color: colors.txt.tertiary, fontSize: '14px' }}>
              Type at least two letters.{!isMobileOrTablet && ' Press ⌘K or Ctrl+K from anywhere to open this.'}
            </p>
          ) : hits.length === 0 ? (
            <p style={{ margin: 0, padding: '20px 12px', color: colors.txt.tertiary, fontSize: '14px' }}>
              Nothing matches “{query.trim()}”.
              {canEditPortal && classes === null ? ' Portal classes are still loading.' : ''}
            </p>
          ) : (
            hits.map((hit, index) => {
              const showHeader = hit.group !== lastGroup;
              lastGroup = hit.group;
              const active = index === cursor;
              return (
                <React.Fragment key={hit.key}>
                  {showHeader && (
                    <div style={{
                      padding: '10px 12px 4px',
                      fontFamily: theme.fonts.mono,
                      fontSize: '11px',
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: colors.txt.tertiary,
                    }}>
                      {hit.group}
                    </div>
                  )}
                  <button
                    type="button"
                    data-index={index}
                    onClick={hit.go}
                    onMouseEnter={() => setCursor(index)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '2px',
                      width: '100%',
                      padding: '10px 12px',
                      border: 'none',
                      borderRadius: theme.borderRadius.md,
                      backgroundColor: active ? theme.colors.primary : 'transparent',
                      color: active ? '#FFFFFF' : colors.txt.primary,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: theme.fonts.primary,
                    }}
                  >
                    <span style={{ fontSize: '15px', fontWeight: 600, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hit.title}</span>
                    {hit.subtitle && (
                      <span style={{ fontSize: '12px', color: active ? 'rgba(255,255,255,0.85)' : colors.txt.tertiary, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {hit.subtitle}
                      </span>
                    )}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};

export default GlobalSearch;
