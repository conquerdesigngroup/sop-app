import React, { useState } from 'react';
import { useSOPs } from '../contexts/SOPContext';
import { theme } from '../theme';
import { SOP } from '../types';
import SOPForm from '../components/SOPForm';
import SOPViewer from '../components/SOPViewer';
import { equipmentIcons, IconName } from '../components/IconSelector';

const TemplatesPage: React.FC = () => {
  const { sops, deleteSOP, createFromTemplate } = useSOPs();
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SOP | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<SOP | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');

  // Filter only templates
  const templates = sops.filter(sop => sop.isTemplate);

  // Extract unique departments from templates
  const departments = Array.from(new Set(templates.map(template => template.department))).sort();

  // Filter templates by department and search
  const filteredTemplates = templates.filter(template => {
    const matchesDepartment = selectedDepartment === 'all' || template.department === selectedDepartment;
    const matchesSearch = searchTerm === '' ||
      template.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesDepartment && matchesSearch;
  });

  // Group templates by category
  const templatesByCategory = filteredTemplates.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, SOP[]>);

  const categories = Object.keys(templatesByCategory).sort();

  const handleCreateNew = () => {
    setEditingTemplate(null);
    setShowForm(true);
  };

  const handleEdit = (template: SOP) => {
    setEditingTemplate(template);
    setShowForm(true);
  };

  const handleView = (template: SOP) => {
    setViewingTemplate(template);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this template?')) {
      deleteSOP(id);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTemplate(null);
  };

  const handleCloseViewer = () => {
    setViewingTemplate(null);
  };

  const handleUseTemplate = (templateId: string) => {
    createFromTemplate(templateId);
    alert('Template copied! Check your Drafts in the SOPs page.');
  };

  const getIcon = (iconName?: string) => {
    if (iconName && iconName in equipmentIcons) {
      return equipmentIcons[iconName as IconName];
    }
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  };

  if (showForm) {
    return <SOPForm sop={editingTemplate} onClose={handleCloseForm} />;
  }

  if (viewingTemplate) {
    return <SOPViewer sop={viewingTemplate} onClose={handleCloseViewer} />;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Templates</h1>
          <p style={styles.subtitle}>
            Reusable SOP templates for your organization
          </p>
        </div>
        <button onClick={handleCreateNew} style={styles.createButton}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create Template
        </button>
      </div>

      <div style={styles.controls}>
        <div style={styles.searchContainer}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textMuted} strokeWidth="2" style={styles.searchIcon}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
        </div>
      </div>

      {departments.length > 0 && (
        <div style={styles.departmentTabs}>
          <button
            onClick={() => setSelectedDepartment('all')}
            style={{
              ...styles.departmentTab,
              ...(selectedDepartment === 'all' ? styles.departmentTabActive : {}),
            }}
          >
            All Departments
          </button>
          {departments.map(dept => (
            <button
              key={dept}
              onClick={() => setSelectedDepartment(dept)}
              style={{
                ...styles.departmentTab,
                ...(selectedDepartment === dept ? styles.departmentTabActive : {}),
              }}
            >
              {dept}
            </button>
          ))}
        </div>
      )}

      {filteredTemplates.length === 0 ? (
        <div style={styles.emptyState}>
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke={theme.colors.textMuted}
            strokeWidth="1.5"
            style={{ marginBottom: '16px' }}
          >
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          </svg>
          <p style={styles.emptyText}>No templates found</p>
          <button onClick={handleCreateNew} style={styles.emptyButton}>
            Create Your First Template
          </button>
        </div>
      ) : (
        <div style={styles.content}>
          {categories.map(category => (
            <div key={category} style={styles.categorySection}>
              <h2 style={styles.categoryTitle}>{category}</h2>
              <div style={styles.templateGrid}>
                {templatesByCategory[category].map(template => (
                  <div key={template.id} style={styles.templateCard}>
                    <div style={styles.templateHeader}>
                      <div style={styles.templateDepartment}>{template.department}</div>
                      <span style={styles.templateBadge}>Template</span>
                    </div>
                    <div style={styles.templateCategory}>{template.category}</div>

                    <div style={styles.templateTitleContainer}>
                      <div style={styles.templateIcon}>{getIcon(template.icon)}</div>
                      <h3 style={styles.templateTitle}>{template.title}</h3>
                    </div>

                    <p style={styles.templateDescription}>{template.description}</p>

                    {template.tags && template.tags.length > 0 && (
                      <div style={styles.templateTags}>
                        {template.tags.slice(0, 3).map((tag, index) => (
                          <span key={index} style={styles.templateTag}>{tag}</span>
                        ))}
                        {template.tags.length > 3 && (
                          <span style={styles.templateTag}>+{template.tags.length - 3}</span>
                        )}
                      </div>
                    )}

                    <div style={styles.templateActions}>
                      <button onClick={() => handleView(template)} style={styles.viewButton}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        View
                      </button>

                      <button onClick={() => handleUseTemplate(template.id)} style={styles.useButton}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                        </svg>
                        Use Template
                      </button>

                      <button onClick={() => handleEdit(template)} style={styles.editButton}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Edit
                      </button>

                      <button onClick={() => handleDelete(template.id)} style={styles.deleteButton}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '40px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '32px',
    gap: '24px',
  },
  title: {
    fontSize: '36px',
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '16px',
    color: theme.colors.textSecondary,
    marginTop: '8px',
  },
  createButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '14px 24px',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  controls: {
    marginBottom: '24px',
  },
  searchContainer: {
    position: 'relative',
    maxWidth: '500px',
  },
  departmentTabs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '0 0 24px 0',
    borderBottom: `3px solid ${theme.colors.primary}`,
    marginBottom: '32px',
  },
  departmentTab: {
    padding: '16px 32px',
    backgroundColor: 'transparent',
    color: theme.colors.textPrimary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    overflow: 'visible',
  } as React.CSSProperties,
  departmentTabActive: {
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    border: `2px solid ${theme.colors.primary}`,
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 12px rgba(239, 35, 60, 0.4)',
  },
  searchIcon: {
    position: 'absolute',
    left: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: '14px 16px 14px 48px',
    fontSize: '15px',
    backgroundColor: theme.colors.inputBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textPrimary,
    outline: 'none',
  },
  emptyState: {
    textAlign: 'center',
    padding: '80px 20px',
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    border: `2px solid ${theme.colors.border}`,
  },
  emptyText: {
    fontSize: '16px',
    color: theme.colors.textMuted,
    marginBottom: '24px',
  },
  emptyButton: {
    padding: '12px 24px',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  categorySection: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '24px',
  },
  categoryTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: '20px',
  },
  templateGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '20px',
  },
  templateCard: {
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    padding: '20px',
    transition: 'all 0.2s',
  },
  templateHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  templateDepartment: {
    fontSize: '12px',
    fontWeight: '700',
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  templateCategory: {
    fontSize: '11px',
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '12px',
  },
  templateBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '4px 8px',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    color: '#3B82F6',
    borderRadius: theme.borderRadius.sm,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  templateTitleContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  templateIcon: {
    color: theme.colors.primary,
    display: 'flex',
    alignItems: 'center',
  },
  templateTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: theme.colors.textPrimary,
    margin: 0,
  },
  templateDescription: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
    marginBottom: '16px',
    lineHeight: '1.6',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  templateTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginBottom: '16px',
  },
  templateTag: {
    fontSize: '11px',
    fontWeight: '600',
    padding: '4px 10px',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    color: theme.colors.textPrimary,
    borderRadius: theme.borderRadius.full,
  },
  templateActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  viewButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px 16px',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  useButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px 16px',
    backgroundColor: '#3B82F6',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  editButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px 12px',
    backgroundColor: 'transparent',
    color: theme.colors.textSecondary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  deleteButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px 12px',
    backgroundColor: 'transparent',
    color: theme.colors.error,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};

export default TemplatesPage;
