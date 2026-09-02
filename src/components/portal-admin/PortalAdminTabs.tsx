import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TabRow } from './shared';

/**
 * The two halves of the portal's staff side, as one tab row.
 *
 * WHY TABS THAT ARE ACTUALLY ROUTES
 *
 * Editor and Viewer are one area to the person using them and two pages to the
 * code. Keeping them as separate routes means the Viewer's several hundred rows
 * of list and detail stay in their own lazy chunk — a teacher who only ever
 * edits a class never downloads it — and a link to a family survives being
 * pasted into a message. Rendering them as a tab row is what makes that
 * invisible: it looks like one screen because it is one screen.
 *
 * The Viewer tab is omitted, not disabled, for anyone below super admin. A
 * disabled tab advertises a room you cannot enter; its absence says nothing at
 * all, which is the truth they need.
 */
const PortalAdminTabs: React.FC<{
  active: 'editor' | 'viewer';
  canViewEveryone: boolean;
}> = ({ active, canViewEveryone }) => {
  const navigate = useNavigate();

  // One tab is not a choice — it is a decoration that costs vertical space on
  // the phone this is mostly used on.
  if (!canViewEveryone) return null;

  return (
    <TabRow
      emphasis
      groupLabel="Portal area"
      options={[
        { key: 'editor', label: 'Portal editor' },
        { key: 'viewer', label: 'Portal viewer' },
      ]}
      active={active}
      onSelect={key => {
        if (key === active) return;
        navigate(key === 'viewer' ? '/portal-admin/viewer' : '/portal-admin');
      }}
    />
  );
};

export default PortalAdminTabs;
