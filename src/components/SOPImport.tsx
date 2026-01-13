import React, { useState, useRef } from 'react';
import { useSOPs } from '../contexts/SOPContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { theme } from '../theme';
import { SOP, SOPStep, SOPStatus } from '../types';

interface SOPImportProps {
  onClose: () => void;
  onImportComplete: () => void;
}

interface ParsedSOP {
  title: string;
  description: string;
  department: string;
  category: string;
  tags: string[];
  status: SOPStatus;
  steps: SOPStep[];
}

const SOPImport: React.FC<SOPImportProps> = ({ onClose, onImportComplete }) => {
  const { addSOP } = useSOPs();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedSOPs, setParsedSOPs] = useState<ParsedSOP[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [selectedSOPs, setSelectedSOPs] = useState<Set<number>>(new Set());

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
        const tagsIdx = headers.findIndex(h => h === 'tags');
        const statusIdx = headers.findIndex(h => h === 'status');

        if (titleIdx === -1 || descIdx === -1) {
          showToast('CSV must have "title" and "description" columns', 'error');
          return;
        }

        // Find step columns (support up to 20 steps)
        const stepColumns: { titleIdx: number; descIdx: number }[] = [];
        for (let i = 1; i <= 20; i++) {
          const stepTitleIdx = headers.findIndex(h => h === `step${i}_title`);
          const stepDescIdx = headers.findIndex(h => h === `step${i}_description`);
          if (stepTitleIdx !== -1 && stepDescIdx !== -1) {
            stepColumns.push({ titleIdx: stepTitleIdx, descIdx: stepDescIdx });
          }
        }

        const parsed: ParsedSOP[] = dataRows.map(row => {
          const steps: SOPStep[] = [];
          stepColumns.forEach((col, index) => {
            const stepTitle = row[col.titleIdx]?.trim();
            const stepDesc = row[col.descIdx]?.trim();
            if (stepTitle && stepDesc) {
              steps.push({
                id: `step_${index + 1}`,
                order: index + 1,
                title: stepTitle,
                description: stepDesc,
              });
            }
          });

          const tagsString = tagsIdx !== -1 ? row[tagsIdx] : '';
          const tags = tagsString
            ? tagsString.split(',').map(t => t.trim()).filter(t => t)
            : [];

          const statusValue = statusIdx !== -1 ? row[statusIdx]?.toLowerCase().trim() : 'draft';
          const status: SOPStatus = ['published', 'draft', 'archived'].includes(statusValue)
            ? statusValue as SOPStatus
            : 'draft';

          return {
            title: row[titleIdx]?.trim() || 'Untitled SOP',
            description: row[descIdx]?.trim() || '',
            department: deptIdx !== -1 ? row[deptIdx]?.trim() || 'Admin' : 'Admin',
            category: catIdx !== -1 ? row[catIdx]?.trim() || 'General' : 'General',
            tags,
            status,
            steps,
          };
        }).filter(sop => sop.title && sop.title !== 'Untitled SOP');

        if (parsed.length === 0) {
          showToast('No valid SOPs found in the CSV file', 'error');
          return;
        }

        setParsedSOPs(parsed);
        setSelectedSOPs(new Set(parsed.map((_, i) => i)));
        setPreviewMode(true);
        showToast(`Found ${parsed.length} SOPs to import`, 'success');
      } catch (error) {
        console.error('Error parsing CSV:', error);
        showToast('Error parsing CSV file. Please check the format.', 'error');
      }
    };
    reader.readAsText(file);
  };

  const toggleSOPSelection = (index: number) => {
    const newSelected = new Set(selectedSOPs);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedSOPs(newSelected);
  };

  const selectAll = () => {
    setSelectedSOPs(new Set(parsedSOPs.map((_, i) => i)));
  };

  const deselectAll = () => {
    setSelectedSOPs(new Set());
  };

  const handleImport = async () => {
    if (selectedSOPs.size === 0) {
      showToast('Please select at least one SOP to import', 'error');
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    let errorCount = 0;

    for (const index of Array.from(selectedSOPs)) {
      const sop = parsedSOPs[index];
      try {
        await addSOP({
          title: sop.title,
          description: sop.description,
          department: sop.department,
          category: sop.category,
          tags: sop.tags,
          status: sop.status,
          steps: sop.steps,
          isTemplate: false,
          createdBy: currentUser?.id || 'system',
        });
        successCount++;
      } catch (error) {
        console.error(`Error importing SOP "${sop.title}":`, error);
        errorCount++;
      }
    }

    setIsImporting(false);

    if (successCount > 0) {
      showToast(`Successfully imported ${successCount} SOP${successCount > 1 ? 's' : ''}${errorCount > 0 ? ` (${errorCount} failed)` : ''}`, 'success');
      onImportComplete();
    } else {
      showToast('Failed to import SOPs. Please try again.', 'error');
    }
  };

  const downloadTemplate = () => {
    // Generate header with 20 step columns
    const stepHeaders = [];
    for (let i = 1; i <= 20; i++) {
      stepHeaders.push(`step${i}_title`, `step${i}_description`);
    }
    const header = ['title', 'description', 'department', 'category', 'tags', 'status', ...stepHeaders].join(',');

    // Example rows with varying number of steps
    const exampleRows = [
      // 6 steps example
      `Opening Procedures,Daily tasks to complete when opening the studio,Admin,Operations,"opening,daily,checklist",published,Unlock Building,"Arrive 15 minutes before first class. Unlock all entry doors and check that security system is disarmed.",Turn On Lights,"Turn on all interior lights including lobby, studios, and hallways.",Check Temperature,"Verify HVAC is set to appropriate temperature. Adjust as needed for comfort.",Set Up Front Desk,"Power on computers, open scheduling software, and review day's schedule.",Prepare Studios,"Check all studios for cleanliness and ensure equipment is ready.",Review Messages,"Check voicemail, email, and parent communications for urgent matters."`,
      // 6 steps example
      `Closing Procedures,Daily tasks to complete when closing the studio,Admin,Operations,"closing,daily,checklist",published,Secure Cash,"Count and secure all cash. Complete daily cash reconciliation report.",Clean Studios,"Sweep floors, wipe mirrors, and ensure all equipment is stored properly.",Check Restrooms,"Verify restrooms are clean and stocked with supplies.",Turn Off Equipment,"Shut down all computers, sound systems, and non-essential equipment.",Set Thermostat,"Adjust HVAC to energy-saving mode for overnight.",Lock Up,"Check all doors and windows are locked. Arm security system."`,
      // 5 steps example
      `New Student Orientation,Process for welcoming and orienting new students,Teachers,Teaching & Instruction,"orientation,new students,onboarding",published,Welcome Family,"Greet family warmly. Introduce yourself and your role.",Tour Facility,"Show student and family around the studio including restrooms and waiting areas.",Explain Expectations,"Review class rules, dress code, and attendance policies.",Introduce to Class,"Introduce new student to classmates and make them feel welcome.",Check Comfort Level,"After class, check in with new student about their experience."`,
    ];

    const csvContent = [header, ...exampleRows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'sop-import-template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Import SOPs from Spreadsheet</h2>
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
              <h3 style={styles.instructionsTitle}>How to Import SOPs</h3>
              <ol style={styles.instructionsList}>
                <li>Download the CSV template below</li>
                <li>Open it in Excel or Google Sheets</li>
                <li>Fill in your SOPs (one per row)</li>
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
                The template includes columns for title, description, department, category, tags, status, and up to 20 steps. Just fill in the steps you need - leave extra step columns empty.
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
                {selectedSOPs.size} of {parsedSOPs.length} SOPs selected for import
              </p>
              <div style={styles.selectionButtons}>
                <button onClick={selectAll} style={styles.selectButton}>Select All</button>
                <button onClick={deselectAll} style={styles.selectButton}>Deselect All</button>
              </div>
            </div>

            <div style={styles.previewList}>
              {parsedSOPs.map((sop, index) => (
                <div
                  key={index}
                  style={{
                    ...styles.previewItem,
                    ...(selectedSOPs.has(index) ? styles.previewItemSelected : {}),
                  }}
                  onClick={() => toggleSOPSelection(index)}
                >
                  <div style={styles.checkbox}>
                    {selectedSOPs.has(index) && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <div style={styles.previewInfo}>
                    <div style={styles.previewTitle}>{sop.title}</div>
                    <div style={styles.previewMeta}>
                      {sop.department} | {sop.category} | {sop.steps.length} steps | {sop.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.previewActions}>
              <button
                onClick={() => {
                  setPreviewMode(false);
                  setParsedSOPs([]);
                  setSelectedSOPs(new Set());
                }}
                style={styles.backButton}
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={isImporting || selectedSOPs.size === 0}
                style={{
                  ...styles.importButton,
                  ...(isImporting || selectedSOPs.size === 0 ? styles.importButtonDisabled : {}),
                }}
              >
                {isImporting ? 'Importing...' : `Import ${selectedSOPs.size} SOP${selectedSOPs.size !== 1 ? 's' : ''}`}
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
    backgroundColor: 'rgba(255, 102, 0, 0.1)',
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

export default SOPImport;
