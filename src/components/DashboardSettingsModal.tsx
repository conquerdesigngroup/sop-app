import React, { useState } from 'react';
import { useDashboardSettings, DashboardWidget } from '../contexts/DashboardSettingsContext';
import { useThemeColors } from '../contexts/ThemeContext';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { Modal, Button } from './ui';

interface DashboardSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DashboardSettingsModal: React.FC<DashboardSettingsModalProps> = ({ isOpen, onClose }) => {
  const { widgets, toggleWidget, resetToDefaults } = useDashboardSettings();
  const colors = useThemeColors();
  const { isMobileOrTablet } = useResponsive();

  // Sort widgets by order
  const sortedWidgets = [...widgets].sort((a, b) => a.order - b.order);

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
          Choose which sections to show on your dashboard.
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
  return (
    <div
      style={{
        ...styles.widgetItem,
        backgroundColor: colors.bg.tertiary,
        borderColor: widget.enabled ? theme.colors.primary : colors.bdr.primary,
      }}
      onClick={onToggle}
    >
      <div style={styles.widgetInfo}>
        <span style={{ ...styles.widgetName, color: colors.txt.primary }}>
          {widget.name}
        </span>
        <span style={{ ...styles.widgetDescription, color: colors.txt.tertiary }}>
          {widget.description}
        </span>
      </div>

      <button
        style={{
          ...styles.toggleButton,
          backgroundColor: widget.enabled ? theme.colors.primary : colors.bg.secondary,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <span
          style={{
            ...styles.toggleKnob,
            left: widget.enabled ? '24px' : '4px',
          }}
        />
      </button>
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
  },
  widgetName: {
    fontSize: '15px',
    fontWeight: 600,
  },
  widgetDescription: {
    fontSize: '13px',
  },
  toggleButton: {
    width: '48px',
    height: '28px',
    borderRadius: '14px',
    border: 'none',
    position: 'relative',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
    flexShrink: 0,
    marginLeft: '16px',
  },
  toggleKnob: {
    position: 'absolute',
    top: '4px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: '#FFFFFF',
    transition: 'left 0.2s ease',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  },
};

export default DashboardSettingsModal;
