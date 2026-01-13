import React, { useState } from 'react';
import { TaskTemplate } from '../types';
import { theme } from '../theme';

interface TemplateSelectorProps {
  templates: TaskTemplate[];
  selectedTemplateId: string | null;
  onSelect: (template: TaskTemplate | null) => void;
  department?: string;  // Filter by department
  disabled?: boolean;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  templates,
  selectedTemplateId,
  onSelect,
  department,
  disabled = false,
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<TaskTemplate | null>(null);

  // Filter templates by department if provided
  const filteredTemplates = department
    ? templates.filter(t => t.department === department)
    : templates;

  const selectedTemplate = filteredTemplates.find(t => t.id === selectedTemplateId);

  const handleTemplateSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const templateId = e.target.value;
    if (templateId === '') {
      onSelect(null);
    } else {
      const template = templates.find(t => t.id === templateId);
      onSelect(template || null);
    }
  };

  const handleMouseEnter = (template: TaskTemplate) => {
    setPreviewTemplate(template);
    setShowPreview(true);
  };

  const handleMouseLeave = () => {
    setShowPreview(false);
    setPreviewTemplate(null);
  };

  return (
    <div style={styles.container}>
      <label style={styles.label}>
        Start from template (optional)
      </label>

      <select
        value={selectedTemplateId || ''}
        onChange={handleTemplateSelect}
        disabled={disabled}
        style={{
          ...styles.select,
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        onMouseEnter={() => {
          if (selectedTemplate) {
            handleMouseEnter(selectedTemplate);
          }
        }}
        onMouseLeave={handleMouseLeave}
      >
        <option value="">Start from scratch</option>
        {filteredTemplates.length === 0 && department && (
          <option value="" disabled>
            No templates available for {department}
          </option>
        )}
        {filteredTemplates.map((template) => (
          <option
            key={template.id}
            value={template.id}
          >
            {template.title} ({template.steps.length} steps)
            {template.isRecurring && ' 🔄'}
          </option>
        ))}
      </select>

      {filteredTemplates.length === 0 && !department && (
        <p style={styles.emptyMessage}>
          No templates available yet. Create your first template by checking "Save as template" when creating a task.
        </p>
      )}

      {selectedTemplate && (
        <div style={styles.selectedInfo}>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Category:</span>
            <span style={styles.infoValue}>{selectedTemplate.category}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Steps:</span>
            <span style={styles.infoValue}>{selectedTemplate.steps.length}</span>
          </div>
          {selectedTemplate.estimatedDuration > 0 && (
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Est. Duration:</span>
              <span style={styles.infoValue}>{selectedTemplate.estimatedDuration} min</span>
            </div>
          )}
          {selectedTemplate.isRecurring && (
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Recurring:</span>
              <span style={styles.infoValue}>
                {selectedTemplate.recurrencePattern?.frequency || 'Yes'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tooltip Preview (shows on hover) */}
      {showPreview && previewTemplate && (
        <div style={styles.tooltip}>
          <div style={styles.tooltipHeader}>
            <strong>{previewTemplate.title}</strong>
            {previewTemplate.isRecurring && (
              <span style={styles.recurringBadge}>Recurring</span>
            )}
          </div>

          {previewTemplate.description && (
            <p style={styles.tooltipDescription}>{previewTemplate.description}</p>
          )}

          <div style={styles.tooltipMeta}>
            <span>{previewTemplate.category}</span>
            <span>•</span>
            <span>{previewTemplate.department}</span>
            <span>•</span>
            <span>{previewTemplate.steps.length} steps</span>
            {previewTemplate.estimatedDuration > 0 && (
              <>
                <span>•</span>
                <span>{previewTemplate.estimatedDuration} min</span>
              </>
            )}
          </div>

          {previewTemplate.steps.length > 0 && (
            <div style={styles.tooltipSteps}>
              <div style={styles.tooltipStepsHeader}>Steps:</div>
              {previewTemplate.steps.slice(0, 5).map((step, index) => (
                <div key={step.id} style={styles.tooltipStep}>
                  {index + 1}. {step.title}
                </div>
              ))}
              {previewTemplate.steps.length > 5 && (
                <div style={styles.tooltipStep}>
                  ... and {previewTemplate.steps.length - 5} more
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    position: 'relative',
    marginBottom: '24px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
    marginBottom: '8px',
  },
  select: {
    width: '100%',
    padding: '12px',
    fontSize: '15px',
    color: theme.colors.txt.primary,
    backgroundColor: theme.colors.bg.tertiary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
  emptyMessage: {
    marginTop: '8px',
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
    fontStyle: 'italic',
  },
  selectedInfo: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: theme.borderRadius.md,
    border: `1px solid rgba(59, 130, 246, 0.3)`,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '6px',
    fontSize: '13px',
  },
  infoLabel: {
    color: theme.colors.txt.secondary,
    fontWeight: 500,
  },
  infoValue: {
    color: theme.colors.txt.primary,
  },
  tooltip: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '8px',
    padding: '16px',
    backgroundColor: theme.colors.bg.secondary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    zIndex: 1000,
    maxWidth: '500px',
  },
  tooltipHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
    fontSize: '15px',
    color: theme.colors.txt.primary,
  },
  recurringBadge: {
    fontSize: '11px',
    padding: '2px 6px',
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    borderRadius: '4px',
    fontWeight: 600,
  },
  tooltipDescription: {
    fontSize: '13px',
    color: theme.colors.txt.secondary,
    marginBottom: '12px',
    lineHeight: '1.5',
  },
  tooltipMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
    marginBottom: '12px',
  },
  tooltipSteps: {
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
    paddingTop: '12px',
  },
  tooltipStepsHeader: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
    marginBottom: '8px',
  },
  tooltipStep: {
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
    marginBottom: '4px',
    paddingLeft: '8px',
  },
};

export default TemplateSelector;
