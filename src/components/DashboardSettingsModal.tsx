import React from 'react';
import { useDashboardSettings, DashboardWidget, widgetShownTo } from '../contexts/DashboardSettingsContext';
import { useThemeColors } from '../contexts/ThemeContext';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { useDashboardViewer } from '../hooks/useDashboardViewer';
import { Modal, Button, Toggle } from './ui';

interface DashboardSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DashboardSettingsModal: React.FC<DashboardSettingsModalProps> = ({ isOpen, onClose }) => {
  const { widgets, toggleWidget, resetToDefaults } = useDashboardSettings();
  const colors = useThemeColors();
  const { isMobileOrTablet } = useResponsive();
  const viewer = useDashboardViewer();

  // Only the sections this person's dashboard draws. The list used to offer
  // everyone all eight — a team member switching off Departments or Work
  // Schedule, which only exist on the manager's dashboard, changed nothing
  // they could see.
  const sortedWidgets = widgets
    .filter(widget => widgetShownTo(widget, viewer))
    .sort((a, b) => a.order - b.order);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Customize Dashboard"
      size={isMobileOrTablet ? 'lg' : 'md'}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <Button variant="ghost" onClick={resetToDefaults}>
            Reset to Defaults
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div style={styles.content}>
        <p style={{ ...styles.description, color: colors.txt.secondary }}>
          {/* Saved in this browser's storage, not on the account, so a phone
              and a laptop are set up separately. Said here rather than
              discovered. */}
          Choose which sections to show on your dashboard. Saved on this device.
        </p>

        <div style={styles.widgetList}>
          {sortedWidgets.map((widget) => (
            <WidgetToggleItem
              key={widget.id}
              widget={widget}
              onToggle={() => toggleWidget(widget.id)}
              colors={colors}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
};

interface WidgetToggleItemProps {
  widget: DashboardWidget;
  onToggle: () => void;
  colors: ReturnType<typeof useThemeColors>;
}

const WidgetToggleItem: React.FC<WidgetToggleItemProps> = ({ widget, onToggle, colors }) => {
  const labelId = `dashboard-widget-${widget.id}-label`;
  const descId = `dashboard-widget-${widget.id}-desc`;
  return (
    <div
      style={{
        ...styles.widgetItem,
        backgroundColor: colors.bg.tertiary,
        borderColor: widget.enabled ? theme.colors.primary : colors.bdr.primary,
      }}
      // The whole row is the tap target on a phone. A tap that lands on the
      // switch is the switch's own, so it is not handled a second time here —
      // two flips would leave the section where it started.
      onClick={e => {
        if ((e.target as HTMLElement).closest('[role="switch"]')) return;
        onToggle();
      }}
    >
      <div style={styles.widgetInfo}>
        <span id={labelId} style={{ ...styles.widgetName, color: colors.txt.primary }}>
          {widget.name}
        </span>
        <span id={descId} style={{ ...styles.widgetDescription, color: colors.txt.tertiary }}>
          {widget.description}
        </span>
      </div>

      {/* The shared switch, as on the Settings page: a real role="switch"
          named by the row's own label. The hand-drawn one here had neither,
          so a screen reader announced an unnamed button. */}
      <Toggle checked={widget.enabled} onChange={onToggle} labelledBy={labelId} describedBy={descId} />
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  description: {
    fontSize: '14px',
    marginBottom: '8px',
  },
  widgetList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  widgetItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px',
    borderRadius: theme.borderRadius.md,
    border: '2px solid',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  widgetInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
    minWidth: 0,
    marginRight: '16px',
  },
  widgetName: {
    fontSize: '15px',
    fontWeight: 600,
    overflowWrap: 'anywhere',
  },
  widgetDescription: {
    fontSize: '13px',
    overflowWrap: 'anywhere',
  },
};

export default DashboardSettingsModal;
