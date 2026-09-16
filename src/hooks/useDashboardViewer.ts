import { useAuth } from '../contexts/AuthContext';
import { usePortalAdmin } from '../contexts/PortalAdminContext';
import { WidgetViewer } from '../contexts/DashboardSettingsContext';

/**
 * Who is looking at the dashboard, in the terms its sections are offered by.
 *
 * Shared by the dashboard and the Customize Dashboard modal so the two cannot
 * disagree: the modal must offer exactly the sections the page can draw for
 * this person, and a switch for a section they never see is one that appears
 * to do nothing.
 *
 * `holdsClasses` is the same test ClassesToday draws itself on — a class
 * grant that is not paused — so "Your Classes Today" is offered to exactly the
 * people who get the card.
 */
export const useDashboardViewer = (): WidgetViewer => {
  const { isAdmin, isSuperAdmin } = useAuth();
  const { checking, editableClassIds } = usePortalAdmin();
  return {
    isAdmin,
    isSuperAdmin,
    holdsClasses: !checking && editableClassIds.length > 0,
  };
};
