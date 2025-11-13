import React, { useState } from 'react';
import { useSOPs } from '../contexts/SOPContext';
import { theme } from '../theme';
import { SOP, SOPStep, SOPStatus } from '../types';
import IconSelector, { IconName } from './IconSelector';
import ImageUpload from './ImageUpload';
import { useResponsive } from '../hooks/useResponsive';

interface SOPFormProps {
  sop?: SOP | null;
  onClose: () => void;
}

const SOPForm: React.FC<SOPFormProps> = ({ sop, onClose }) => {
  const { addSOP, updateSOP, saveAsTemplate, sops } = useSOPs();
  const { isMobile, isMobileOrTablet } = useResponsive();

  // Get unique categories from existing SOPs
  const existingCategories = Array.from(new Set(sops.map(s => s.category))).sort();
  const existingDepartments = Array.from(new Set(sops.map(s => s.department))).sort();

  const [title, setTitle] = useState(sop?.title || '');
  const [description, setDescription] = useState(sop?.description || '');
  const [category, setCategory] = useState(sop?.category || '');
  const [isCustomCategory, setIsCustomCategory] = useState(!sop?.category || !existingCategories.includes(sop?.category || ''));
  const [department, setDepartment] = useState(sop?.department || '');
  const [isCustomDepartment, setIsCustomDepartment] = useState(!sop?.department || !existingDepartments.includes(sop?.department || ''));
  const [icon, setIcon] = useState<IconName>(sop?.icon as IconName || 'box');
  const [imageUrl, setImageUrl] = useState(sop?.imageUrl || '');
  const [tags, setTags] = useState<string[]>(sop?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [steps, setSteps] = useState<SOPStep[]>(
    sop?.steps || [{
      id: `step_${Date.now()}`,
      order: 1,
      title: '',
      description: '',
    }]
  );

  const addStep = () => {
    const newStep: SOPStep = {
      id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      order: steps.length + 1,
      title: '',
      description: '',
    };
    setSteps([...steps, newStep]);
  };

  const updateStep = (index: number, field: keyof SOPStep, value: string) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setSteps(newSteps);
  };

  const removeStep = (index: number) => {
    if (steps.length === 1) {
      alert('You must have at least one step');
      return;
    }
    const newSteps = steps.filter((_, i) => i !== index);
    // Reorder steps
    newSteps.forEach((step, i) => {
      step.order = i + 1;
    });
    setSteps(newSteps);
  };

  const moveStepUp = (index: number) => {
    if (index === 0) return;
    const newSteps = [...steps];
    [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
    // Update order
    newSteps.forEach((step, i) => {
      step.order = i + 1;
    });
    setSteps(newSteps);
  };

  const moveStepDown = (index: number) => {
    if (index === steps.length - 1) return;
    const newSteps = [...steps];
    [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
    // Update order
    newSteps.forEach((step, i) => {
      step.order = i + 1;
    });
    setSteps(newSteps);
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const removeTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  const handleSave = (status: SOPStatus, isTemplate: boolean = false) => {
    if (!title.trim() || !description.trim() || !department.trim() || !category.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    if (steps.some(step => !step.title.trim() || !step.description.trim())) {
      alert('All steps must have a title and description');
      return;
    }

    const sopData = {
      title: title.trim(),
      description: description.trim(),
      department: department.trim(),
      category: category.trim(),
      icon: icon || undefined,
      imageUrl: imageUrl || undefined,
      steps,
      tags,
      status,
      isTemplate,
      createdBy: 'user', // Default value since we removed auth
    };

    if (sop) {
      updateSOP(sop.id, sopData);
    } else {
      addSOP(sopData);
    }

    onClose();
  };

  const handleSaveAsTemplate = () => {
    if (sop) {
      saveAsTemplate(sop.id);
      onClose();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Default submit saves as published
    handleSave('published', false);
  };

  return (
    <div style={{
      ...styles.container,
      ...(isMobile && styles.containerMobile),
    }}>
      <div style={{
        ...styles.header,
        ...(isMobile && styles.headerMobile),
      }}>
        <h1 style={{
          ...styles.title,
          ...(isMobile && styles.titleMobile),
        }}>
          {sop ? 'Edit SOP' : 'Create New SOP'}
        </h1>
        <button onClick={onClose} style={styles.closeButton}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={{
          ...styles.section,
          ...(isMobile && styles.sectionMobile),
        }}>
          <h3 style={styles.sectionTitle}>Basic Information</h3>

          <div style={styles.inputGroup}>
            <label style={styles.label}>
              Title <span style={styles.required}>*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., 3-Camera Recital Setup"
              style={{
                ...styles.input,
                ...(isMobile && styles.inputMobile),
              }}
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>
              Description <span style={styles.required}>*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief overview of this procedure..."
              style={{
                ...styles.input,
                ...styles.textarea,
                ...(isMobile && styles.inputMobile),
              }}
              rows={3}
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>
              Department <span style={styles.required}>*</span>
            </label>
            {existingDepartments.length > 0 && !isCustomDepartment ? (
              <div>
                <select
                  value={department}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '__custom__') {
                      setIsCustomDepartment(true);
                      setDepartment('');
                    } else {
                      setDepartment(value);
                    }
                  }}
                  style={{
                    ...styles.input,
                    ...(isMobile && styles.inputMobile),
                  }}
                  required
                >
                  <option value="">-- Select a department --</option>
                  {existingDepartments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                  <option value="__custom__">+ Create New Department</option>
                </select>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g., Admin, Staff, Management"
                  style={{
                    ...styles.input,
                    ...(isMobile && styles.inputMobile),
                  }}
                  required
                />
                {existingDepartments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomDepartment(false);
                      setDepartment('');
                    }}
                    style={styles.switchButton}
                  >
                    ← Select from existing departments
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>
              Category <span style={styles.required}>*</span>
            </label>
            {existingCategories.length > 0 && !isCustomCategory ? (
              <div>
                <select
                  value={category}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '__custom__') {
                      setIsCustomCategory(true);
                      setCategory('');
                    } else {
                      setCategory(value);
                    }
                  }}
                  style={{
                    ...styles.input,
                    ...(isMobile && styles.inputMobile),
                  }}
                  required
                >
                  <option value="">-- Select a category --</option>
                  {existingCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="__custom__">+ Create New Category</option>
                </select>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g., Camera Setup, Audio Setup, Lighting"
                  style={{
                    ...styles.input,
                    ...(isMobile && styles.inputMobile),
                  }}
                  required
                />
                {existingCategories.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomCategory(false);
                      setCategory('');
                    }}
                    style={styles.switchButton}
                  >
                    ← Select from existing categories
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Icon (Optional)</label>
            <IconSelector selectedIcon={icon} onSelect={setIcon} />
          </div>

          <div style={styles.inputGroup}>
            <ImageUpload
              value={imageUrl}
              onChange={setImageUrl}
              label="Cover Image (Optional)"
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Tags (Optional)</label>
            <div style={{
              ...styles.tagInputContainer,
              ...(isMobile && styles.tagInputContainerMobile),
            }}>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="Add a tag and press Enter"
                style={{
                  ...styles.input,
                  ...(isMobile && styles.inputMobile),
                }}
              />
              <button type="button" onClick={addTag} style={styles.addTagButton}>
                Add Tag
              </button>
            </div>
            {tags.length > 0 && (
              <div style={styles.tagsDisplay}>
                {tags.map((tag, index) => (
                  <div key={index} style={styles.tag}>
                    {tag}
                    <button type="button" onClick={() => removeTag(index)} style={styles.removeTagButton}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{
          ...styles.section,
          ...(isMobile && styles.sectionMobile),
        }}>
          <div style={{
            ...styles.sectionHeader,
            ...(isMobile && styles.sectionHeaderMobile),
          }}>
            <h3 style={styles.sectionTitle}>Procedure Steps</h3>
            <button type="button" onClick={addStep} style={styles.addStepButton}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Step
            </button>
          </div>

          {steps.map((step, index) => (
            <div key={step.id} style={{
              ...styles.stepCard,
              ...(isMobile && styles.stepCardMobile),
            }}>
              <div style={styles.stepHeader}>
                <div style={styles.stepNumber}>Step {index + 1}</div>
                <div style={styles.stepControls}>
                  <button
                    type="button"
                    onClick={() => moveStepUp(index)}
                    disabled={index === 0}
                    style={{
                      ...styles.stepControlButton,
                      opacity: index === 0 ? 0.3 : 1,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="18 15 12 9 6 15" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStepDown(index)}
                    disabled={index === steps.length - 1}
                    style={{
                      ...styles.stepControlButton,
                      opacity: index === steps.length - 1 ? 0.3 : 1,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStep(index)}
                    style={styles.removeStepButton}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.stepLabel}>
                  Step Title <span style={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  value={step.title}
                  onChange={(e) => updateStep(index, 'title', e.target.value)}
                  placeholder="e.g., Position camera on tripod"
                  style={{
                    ...styles.input,
                    ...(isMobile && styles.inputMobile),
                  }}
                  required
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.stepLabel}>
                  Step Description <span style={styles.required}>*</span>
                </label>
                <textarea
                  value={step.description}
                  onChange={(e) => updateStep(index, 'description', e.target.value)}
                  placeholder="Detailed instructions for this step..."
                  style={{
                    ...styles.input,
                    ...styles.textarea,
                    ...(isMobile && styles.inputMobile),
                  }}
                  rows={4}
                  required
                />
              </div>

              <div style={styles.inputGroup}>
                <ImageUpload
                  value={step.imageUrl || ''}
                  onChange={(url) => updateStep(index, 'imageUrl', url)}
                  label="Step Photo (Optional)"
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{
          ...styles.footer,
          ...(isMobile && styles.footerMobile),
        }}>
          <button type="button" onClick={onClose} style={{
            ...styles.cancelButton,
            ...(isMobile && styles.buttonMobile),
          }}>
            Cancel
          </button>
          <div style={{
            display: 'flex',
            gap: '12px',
            ...(isMobile && { flexDirection: 'column', width: '100%', gap: '8px' }),
          }}>
            {sop && !sop.isTemplate && (
              <button
                type="button"
                onClick={handleSaveAsTemplate}
                style={{
                  ...styles.templateButton,
                  ...(isMobile && styles.buttonMobile),
                }}
              >
                Save as Template
              </button>
            )}
            <button type="submit" style={{
              ...styles.submitButton,
              ...(isMobile && styles.buttonMobile),
            }}>
              {sop?.isTemplate ? 'Update Template' : sop ? 'Save Changes' : 'Save SOP'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '40px',
    maxWidth: '900px',
    margin: '0 auto',
  },
  containerMobile: {
    padding: '16px',
    maxWidth: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
  },
  headerMobile: {
    marginBottom: '20px',
  },
  title: {
    fontSize: '32px',
    fontWeight: '800',
    color: theme.colors.textPrimary,
    margin: 0,
  },
  titleMobile: {
    fontSize: '24px',
  },
  closeButton: {
    padding: '8px',
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  section: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '24px',
  },
  sectionMobile: {
    padding: '16px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  sectionHeaderMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '12px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: '20px',
  },
  inputGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: '8px',
  },
  stepLabel: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: '8px',
  },
  required: {
    color: theme.colors.error,
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '15px',
    backgroundColor: theme.colors.inputBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textPrimary,
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  inputMobile: {
    fontSize: '16px', // Prevents iOS zoom
  },
  textarea: {
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: '1.6',
  },
  switchButton: {
    marginTop: '8px',
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: '600',
    backgroundColor: 'transparent',
    color: theme.colors.textSecondary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tagInputContainer: {
    display: 'flex',
    gap: '8px',
  },
  tagInputContainerMobile: {
    flexDirection: 'column',
  },
  addTagButton: {
    padding: '12px 20px',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  tagsDisplay: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '12px',
  },
  tag: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    color: theme.colors.textPrimary,
    borderRadius: theme.borderRadius.full,
    fontSize: '13px',
    fontWeight: '600',
  },
  removeTagButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    fontSize: '18px',
    padding: 0,
    lineHeight: 1,
  },
  addStepButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 16px',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  stepCard: {
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    padding: '20px',
    marginBottom: '16px',
  },
  stepCardMobile: {
    padding: '16px',
  },
  stepHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  stepNumber: {
    fontSize: '16px',
    fontWeight: '700',
    color: theme.colors.primary,
  },
  stepControls: {
    display: 'flex',
    gap: '8px',
  },
  stepControlButton: {
    padding: '6px',
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeStepButton: {
    padding: '6px',
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.error,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreview: {
    marginTop: '12px',
    maxWidth: '100%',
    maxHeight: '200px',
    borderRadius: theme.borderRadius.md,
    border: `2px solid ${theme.colors.border}`,
  },
  footer: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'flex-end',
  },
  footerMobile: {
    flexDirection: 'column',
    gap: '12px',
  },
  cancelButton: {
    padding: '14px 28px',
    fontSize: '15px',
    fontWeight: '600',
    backgroundColor: 'transparent',
    color: theme.colors.textSecondary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  submitButton: {
    padding: '14px 28px',
    fontSize: '15px',
    fontWeight: '700',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  draftButton: {
    padding: '14px 28px',
    fontSize: '15px',
    fontWeight: '600',
    backgroundColor: 'transparent',
    color: '#F59E0B',
    border: `2px solid #F59E0B`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  templateButton: {
    padding: '14px 28px',
    fontSize: '15px',
    fontWeight: '600',
    backgroundColor: 'transparent',
    color: '#3B82F6',
    border: `2px solid #3B82F6`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  buttonMobile: {
    width: '100%',
    padding: '16px 24px',
    fontSize: '16px', // Touch-friendly and prevents iOS zoom
  },
};

export default SOPForm;
