import React, { useState } from 'react';
import { theme } from '../../theme';
import { Badge, Button, ChevronLeftIcon } from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalAdmin } from '../../contexts/PortalAdminContext';
import { PortalClass, PortalProgram } from '../../types';
import { TabRow, classSummary } from './shared';
import UpdatesSection from './UpdatesSection';
import DocumentsSection from './DocumentsSection';
import EventsSection from './EventsSection';

/**
 * One class, and the content that belongs to it.
 *
 * WHY THIS EXISTS
 *
 * The manager used to be five flat lists — Updates, Files, Calendar, Classes,
 * Access — where a row's class was a dropdown on the row. That works, but it
 * asks the wrong question first. A teacher does not think "I will post an
 * update, and it happens to be for Junior Elite Hip Hop"; they think "I need to
 * tell my class something". So the class comes first and its content lives
 * inside it.
 *
 * Nothing new is enforced here. UpdatesSection and DocumentsSection already
 * carried an optional class on every row and already refused a studio-wide save
 * from anyone who is not an admin — that was built with the per-class grants and
 * then only ever surfaced as a dropdown. This screen is the missing presentation
 * for machinery that already worked.
 *
 * Updates lead rather than files, matching the parent-facing class page, whose
 * own note says the updates are the substance and the schedule is the header.
 * Calendar came last and for the same reason it is here at all: a class's
 * events were only ever reachable from the program-wide Calendar section, via a
 * dropdown, which meant the one screen named after a class could not answer
 * "when is their recital". Nothing new is enforced — EventsSection already
 * carried an optional class on every row and already refused a studio-wide save
 * from a non-admin.
 *
 * The open class lives in the query string, so a refresh or a pasted link lands
 * back on it. The Updates/Files choice is deliberately local state instead: it
 * is a glance, not a destination, and putting it in the URL would mean every
 * switch pushed a history entry for the back button to walk through.
 */

type Tab = 'updates' | 'files' | 'calendar';

/**
 * Calendar is admin-only as of v44.
 *
 * The grant used to carry all three, because v9 had no reason to separate
 * them. Switching the grants on for the whole studio was that reason: an info
 * post and a file are a teacher talking to their own families, while an event
 * lands in the portal calendar, syncs to Google and reaches subscribed phones
 * that are not in the class — a mistake that deleting the row does not undo.
 *
 * portal_events_insert/update/delete are now is_admin() alone, so this is a
 * mirror of a policy and not the thing enforcing it. It is hidden rather than
 * disabled for the same reason the Info tab on the program screen is: a button
 * whose every save comes back refused is worse than no button.
 */
const TABS: { key: Tab; label: string; adminOnly?: boolean }[] = [
  { key: 'updates', label: 'Info' },
  { key: 'files', label: 'Files' },
  { key: 'calendar', label: 'Calendar', adminOnly: true },
];

const ClassWorkspace: React.FC<{
  program: PortalProgram;
  klass: PortalClass;
  classes: PortalClass[];
  onBack: () => void;
}> = ({ program, klass, classes, onBack }) => {
  const [tab, setTab] = useState<Tab>('updates');
  const { isAdmin } = useAuth();
  const { editableClassIds } = usePortalAdmin();

  const scope = { classId: klass.id };
  const isMine = editableClassIds.includes(klass.id);
  const tabs = TABS.filter(t => isAdmin || !t.adminOnly);
  // A teacher who had the Calendar open when their access narrowed, or who
  // arrives with it in local state, falls back rather than rendering a tab that
  // is no longer in the row above it.
  const activeTab: Tab = tabs.some(t => t.key === tab) ? tab : 'updates';

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<ChevronLeftIcon size={16} />}
        onClick={onBack}
        style={{ paddingLeft: 0, marginBottom: theme.spacing.md }}
      >
        All classes
      </Button>

      <div style={{ marginBottom: theme.spacing.lg }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
          {!klass.isActive && <Badge variant="default" size="sm">Hidden from parents</Badge>}
          {isMine && !isAdmin && <Badge variant="info" size="sm">Yours</Badge>}
        </div>

        <h2
          style={{
            ...theme.typography.h2,
            color: theme.colors.txt.primary,
            margin: '0 0 6px',
            wordBreak: 'break-word',
          }}
        >
          {klass.name}
        </h2>

        <p
          style={{
            ...theme.typography.bodySmall,
            fontFamily: theme.fonts.mono,
            color: theme.colors.txt.tertiary,
            margin: 0,
          }}
        >
          {classSummary(klass)}
          {klass.location && ` · ${klass.location}`}
          {klass.instructorName && ` · ${klass.instructorName}`}
        </p>
      </div>

      <TabRow
        panelId="class-workspace-panel"
        groupLabel={`${klass.name} content`}
        options={tabs}
        active={activeTab}
        onSelect={key => setTab(key as Tab)}
      />

      <div id="class-workspace-panel" role="tabpanel">
        {activeTab === 'updates' && (
          <UpdatesSection program={program} classes={classes} scope={scope} />
        )}
        {activeTab === 'files' && (
          <DocumentsSection program={program} classes={classes} scope={scope} />
        )}
        {activeTab === 'calendar' && isAdmin && (
          <EventsSection program={program} classes={classes} scope={scope} />
        )}
      </div>
    </>
  );
};

export default ClassWorkspace;
