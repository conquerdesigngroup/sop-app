import React, { useState, useRef } from 'react';
import { useTask } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { theme } from '../theme';
import { TaskTemplate, TaskPriority, RecurrencePattern } from '../types';

interface TaskLibraryImportProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ParsedTaskTemplate {
  title: string;
  description: string;
  department: string;
  category: string;
  priority: TaskPriority;
  estimatedDuration: number;
  isRecurring: boolean;
  recurrencePattern?: RecurrencePattern;
  steps: {
    title: string;
    description: string;
    requiresPhoto: boolean;
  }[];
}

const TaskLibraryImport: React.FC<TaskLibraryImportProps> = ({ isOpen, onClose, onSuccess }) => {
  const { addTaskTemplate } = useTask();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedTemplates, setParsedTemplates] = useState<ParsedTaskTemplate[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<number>>(new Set());

  // Reuse CSV parser from SOPImport
  const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentCell += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !insideQuotes) {
        currentRow.push(currentCell.trim());
        if (currentRow.some(cell => cell !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
        if (char === '\r') i++;
      } else {
        currentCell += char;
      }
    }

    // Push last row
    currentRow.push(currentCell.trim());
    if (currentRow.some(cell => cell !== '')) {
      rows.push(currentRow);
    }

    return rows;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const rows = parseCSV(text);

        if (rows.length < 2) {
          showToast('CSV file must have a header row and at least one data row', 'error');
          return;
        }

        const headers = rows[0].map(h => h.toLowerCase().trim());
        const dataRows = rows.slice(1);

        // Find column indices
        const titleIdx = headers.findIndex(h => h === 'title');
        const descIdx = headers.findIndex(h => h === 'description');
        const deptIdx = headers.findIndex(h => h === 'department');
        const catIdx = headers.findIndex(h => h === 'category');
        const priorityIdx = headers.findIndex(h => h === 'priority');
        const durationIdx = headers.findIndex(h => h === 'estimated_duration');
        const recurringIdx = headers.findIndex(h => h === 'is_recurring');
        const freqIdx = headers.findIndex(h => h === 'recurrence_frequency');
        const daysIdx = headers.findIndex(h => h === 'recurrence_days');

        if (titleIdx === -1 || descIdx === -1) {
          showToast('CSV must have "title" and "description" columns', 'error');
          return;
        }

        // Find step columns (support up to 20 steps)
        const stepColumns: { titleIdx: number; descIdx: number; photoIdx: number }[] = [];
        for (let i = 1; i <= 20; i++) {
          const stepTitleIdx = headers.findIndex(h => h === `step${i}_title`);
          const stepDescIdx = headers.findIndex(h => h === `step${i}_description`);
          const stepPhotoIdx = headers.findIndex(h => h === `step${i}_requires_photo`);
          if (stepTitleIdx !== -1 && stepDescIdx !== -1) {
            stepColumns.push({ titleIdx: stepTitleIdx, descIdx: stepDescIdx, photoIdx: stepPhotoIdx });
          }
        }

        const parsed: ParsedTaskTemplate[] = dataRows.map(row => {
          const title = row[titleIdx]?.trim();
          const description = row[descIdx]?.trim();

          // Skip invalid rows
          if (!title || title.toLowerCase() === 'untitled' || !description) {
            return null;
          }

          // Parse basic fields
          const department = row[deptIdx]?.trim() || 'Admin';
          const category = row[catIdx]?.trim() || 'General';
          const priorityRaw = (row[priorityIdx]?.trim() || 'medium').toLowerCase();
          const priority: TaskPriority = ['low', 'medium', 'high', 'urgent'].includes(priorityRaw)
            ? priorityRaw as TaskPriority
            : 'medium';
          const estimatedDuration = parseInt(row[durationIdx]?.trim() || '30') || 30;

          // Parse recurrence
          const isRecurringRaw = (row[recurringIdx]?.trim() || 'false').toLowerCase();
          const isRecurring = ['true', 'yes', '1'].includes(isRecurringRaw);

          let recurrencePattern: RecurrencePattern | undefined;
          if (isRecurring) {
            const frequency = (row[freqIdx]?.trim() || 'weekly').toLowerCase() as 'daily' | 'weekly' | 'monthly';
            const daysStr = row[daysIdx]?.trim() || '';

            if (frequency === 'weekly') {
              const daysOfWeek = daysStr.split(',')
                .map(d => parseInt(d.trim()))
                .filter(d => d >= 0 && d <= 6);
              recurrencePattern = { frequency, daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek : [1] };
            } else if (frequency === 'monthly') {
              const dayOfMonth = parseInt(daysStr) || 1;
              recurrencePattern = { frequency, dayOfMonth };
            } else {
              recurrencePattern = { frequency };
            }
          }

          // Parse steps
          const steps = stepColumns
            .map(({ titleIdx, descIdx, photoIdx }) => {
              const stepTitle = row[titleIdx]?.trim();
              const stepDesc = row[descIdx]?.trim();
              const requiresPhotoRaw = (row[photoIdx]?.trim() || 'false').toLowerCase();
              const requiresPhoto = ['true', 'yes', '1'].includes(requiresPhotoRaw);

              if (stepTitle && stepDesc) {
                return { title: stepTitle, description: stepDesc, requiresPhoto };
              }
              return null;
            })
            .filter(step => step !== null) as ParsedTaskTemplate['steps'];

          return {
            title,
            description,
            department,
            category,
            priority,
            estimatedDuration,
            isRecurring,
            recurrencePattern,
            steps,
          };
        }).filter(template => template !== null) as ParsedTaskTemplate[];

        if (parsed.length === 0) {
          showToast('No valid task templates found in the CSV file', 'error');
          return;
        }

        setParsedTemplates(parsed);
        setSelectedTemplates(new Set(parsed.map((_, i) => i)));
        setPreviewMode(true);
        showToast(`Found ${parsed.length} task template${parsed.length > 1 ? 's' : ''} to import`, 'success');
      } catch (error) {
        console.error('Error parsing CSV:', error);
        showToast('Error parsing CSV file. Please check the format.', 'error');
      }
    };
    reader.readAsText(file);
  };

  const toggleTemplateSelection = (index: number) => {
    const newSelected = new Set(selectedTemplates);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedTemplates(newSelected);
  };

  const selectAll = () => {
    setSelectedTemplates(new Set(parsedTemplates.map((_, i) => i)));
  };

  const deselectAll = () => {
    setSelectedTemplates(new Set());
  };

  const handleImport = async () => {
    if (selectedTemplates.size === 0) {
      showToast('Please select at least one task template to import', 'error');
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    let errorCount = 0;

    for (const index of Array.from(selectedTemplates)) {
      const template = parsedTemplates[index];
      try {
        const taskTemplate: Omit<TaskTemplate, 'id' | 'createdAt'> = {
          title: template.title,
          description: template.description,
          category: template.category,
          department: template.department,
          priority: template.priority,
          estimatedDuration: template.estimatedDuration,
          sopIds: [], // Empty initially, can be linked later
          steps: template.steps.map((step, idx) => ({
            id: `step_${Date.now()}_${idx}`,
            order: idx + 1,
            title: step.title,
            description: step.description,
            requiresPhoto: step.requiresPhoto,
          })),
          createdBy: currentUser?.id || 'system',
          updatedAt: new Date().toISOString(),
          isRecurring: template.isRecurring,
          recurrencePattern: template.recurrencePattern,
        };

        await addTaskTemplate(taskTemplate);
        successCount++;
      } catch (error) {
        console.error('Error importing template:', template.title, error);
        errorCount++;
      }
    }

    setIsImporting(false);

    if (successCount > 0) {
      showToast(
        `Successfully imported ${successCount} task template${successCount > 1 ? 's' : ''}${errorCount > 0 ? ` (${errorCount} failed)` : ''}`,
        'success'
      );
      onSuccess?.();
      onClose();
    } else {
      showToast('Failed to import task templates. Please try again.', 'error');
    }
  };

  const downloadTemplate = () => {
    // Generate header with 20 step columns
    const stepHeaders: string[] = [];
    for (let i = 1; i <= 20; i++) {
      stepHeaders.push(
        `step${i}_title`,
        `step${i}_description`,
        `step${i}_requires_photo`
      );
    }

    const header = [
      'title',
      'description',
      'department',
      'category',
      'priority',
      'estimated_duration',
      'is_recurring',
      'recurrence_frequency',
      'recurrence_days',
      ...stepHeaders
    ].join(',');

    // Example rows with real data
    const exampleRows = [
      // Opening Procedures - Daily recurring
      [
        'Opening Procedures',
        'Daily tasks to complete when opening the studio',
        'Admin',
        'Opening Duties',
        'high',
        '45',
        'true',
        'daily',
        '',
        'Unlock Building',
        'Arrive 15 minutes before first class and unlock all doors',
        'false',
        'Turn On Lights',
        'Turn on all interior and exterior lights',
        'false',
        'Check Temperature',
        'Verify HVAC is set to 72°F',
        'false',
      ].join(','),

      // Closing Procedures - Daily recurring
      [
        'Closing Procedures',
        'Daily tasks to complete when closing the studio',
        'Admin',
        'Closing Duties',
        'high',
        '30',
        'true',
        'daily',
        '',
        'Lock All Doors',
        'Ensure all entry points are secured',
        'true',
        'Turn Off Lights',
        'Turn off all interior lights except emergency lighting',
        'false',
        'Set Alarm',
        'Activate security system before leaving',
        'false',
      ].join(','),

      // Weekly Deep Clean - Weekly recurring (Monday, Wednesday, Friday)
      [
        'Weekly Deep Clean',
        'Comprehensive cleaning tasks performed weekly',
        'Maintenance',
        'Cleaning',
        'medium',
        '120',
        'true',
        'weekly',
        '1,3,5',
        'Vacuum All Floors',
        'Vacuum all carpeted areas and mop hard floors',
        'true',
        'Clean Bathrooms',
        'Deep clean all bathrooms including toilets and sinks',
        'true',
        'Dust All Surfaces',
        'Dust all shelves and high surfaces',
        'false',
      ].join(','),

      // Monthly Inventory - Monthly recurring (1st of month)
      [
        'Monthly Inventory',
        'Check and restock supplies monthly',
        'Admin',
        'Administrative',
        'low',
        '60',
        'true',
        'monthly',
        '1',
        'Count Supplies',
        'Take inventory of all consumable supplies',
        'false',
        'Create Order List',
        'List items that need to be reordered',
        'false',
        'Submit Purchase Orders',
        'Submit orders to vendors',
        'false',
      ].join(','),
    ];

    const csvContent = [header, ...exampleRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', 'task-library-import-template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Import Task Templates from Spreadsheet</h2>
          <button onClick={onClose} style={styles.closeButton}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {!previewMode ? (
          <div style={styles.content}>
            <div style={styles.instructions}>
              <h3 style={styles.instructionsTitle}>How to Import Task Templates</h3>
              <ol style={styles.instructionsList}>
                <li>Download the CSV template below</li>
                <li>Open it in Excel or Google Sheets</li>
                <li>Fill in your task templates (one per row)</li>
                <li>Save as CSV and upload here</li>
              </ol>
            </div>

            <div style={styles.templateSection}>
              <button onClick={downloadTemplate} style={styles.templateButton}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download CSV Template
              </button>
              <p style={styles.templateNote}>
                The template includes columns for task details (title, description, priority, duration, recurrence) and up to 20 steps.
                Just fill in the steps you need - leave extra step columns empty.
              </p>
            </div>

            <div style={styles.uploadSection}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                style={styles.fileInput}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={styles.uploadButton}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload CSV File
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.content}>
            <div style={styles.previewHeader}>
              <p style={styles.previewCount}>
                {selectedTemplates.size} of {parsedTemplates.length} task template{parsedTemplates.length !== 1 ? 's' : ''} selected for import
              </p>
              <div style={styles.selectionButtons}>
                <button onClick={selectAll} style={styles.selectButton}>Select All</button>
                <button onClick={deselectAll} style={styles.selectButton}>Deselect All</button>
              </div>
            </div>

            <div style={styles.previewList}>
              {parsedTemplates.map((template, index) => (
                <div
                  key={index}
                  style={{
                    ...styles.previewItem,
                    ...(selectedTemplates.has(index) ? styles.previewItemSelected : {}),
                  }}
                  onClick={() => toggleTemplateSelection(index)}
                >
                  <div style={styles.checkbox}>
                    {selectedTemplates.has(index) && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <div style={styles.previewInfo}>
                    <div style={styles.previewTitle}>{template.title}</div>
                    <div style={styles.previewMeta}>
                      {template.department} | {template.category} | {template.priority} | {template.steps.length} step{template.steps.length !== 1 ? 's' : ''} | {template.estimatedDuration} min
                      {template.isRecurring && template.recurrencePattern && (
                        <> | Recurring {template.recurrencePattern.frequency}</>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.previewActions}>
              <button
                onClick={() => {
                  setPreviewMode(false);
                  setParsedTemplates([]);
                  setSelectedTemplates(new Set());
                }}
                style={styles.backButton}
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={isImporting || selectedTemplates.size === 0}
                style={{
                  ...styles.importButton,
                  ...(isImporting || selectedTemplates.size === 0 ? styles.importButtonDisabled : {}),
                }}
              >
                {isImporting ? 'Importing...' : `Import ${selectedTemplates.size} Template${selectedTemplates.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.bdr.primary}`,
    width: '100%',
    maxWidth: '600px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
  },
  title: {
    fontSize: '20px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    padding: '4px',
    cursor: 'pointer',
    color: theme.colors.txt.secondary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.sm,
  },
  content: {
    padding: '24px',
    overflowY: 'auto',
  },
  instructions: {
    marginBottom: '24px',
  },
  instructionsTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginBottom: '12px',
  },
  instructionsList: {
    margin: 0,
    paddingLeft: '20px',
    color: theme.colors.txt.secondary,
    lineHeight: 1.8,
  },
  templateSection: {
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    padding: '20px',
    marginBottom: '24px',
    textAlign: 'center' as const,
  },
  templateButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: theme.colors.primary,
    color: '#fff',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    padding: '12px 20px',
    fontSize: '15px',
    fontWeight: 500,
    cursor: 'pointer',
    marginBottom: '12px',
  },
  templateNote: {
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
    margin: 0,
  },
  uploadSection: {
    textAlign: 'center' as const,
  },
  fileInput: {
    display: 'none',
  },
  uploadButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: theme.colors.bg.tertiary,
    color: theme.colors.txt.primary,
    border: `2px dashed ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    padding: '24px 40px',
    fontSize: '15px',
    fontWeight: 500,
    cursor: 'pointer',
    width: '100%',
    justifyContent: 'center',
  },
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    flexWrap: 'wrap' as const,
    gap: '12px',
  },
  previewCount: {
    fontSize: '14px',
    color: theme.colors.txt.secondary,
    margin: 0,
  },
  selectionButtons: {
    display: 'flex',
    gap: '8px',
  },
  selectButton: {
    backgroundColor: 'transparent',
    color: theme.colors.primary,
    border: 'none',
    padding: '4px 8px',
    fontSize: '13px',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  previewList: {
    maxHeight: '300px',
    overflowY: 'auto' as const,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  previewItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  previewItemSelected: {
    backgroundColor: 'rgba(239, 35, 60, 0.1)',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    border: `2px solid ${theme.colors.bdr.primary}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: theme.colors.primary,
  },
  previewInfo: {
    flex: 1,
    minWidth: 0,
  },
  previewTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
    marginBottom: '4px',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  previewMeta: {
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
  },
  previewActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
  },
  backButton: {
    backgroundColor: 'transparent',
    color: theme.colors.txt.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  importButton: {
    backgroundColor: theme.colors.primary,
    color: '#fff',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  importButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};

export default TaskLibraryImport;
