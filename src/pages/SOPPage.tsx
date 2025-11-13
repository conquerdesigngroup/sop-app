import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSOPs } from '../contexts/SOPContext';
import { theme } from '../theme';
import { SOP, SOPStatus } from '../types';
import SOPForm from '../components/SOPForm';
import SOPViewer from '../components/SOPViewer';
import { equipmentIcons, IconName } from '../components/IconSelector';
import { useResponsive } from '../hooks/useResponsive';

type FilterView = 'all' | 'published' | 'draft' | 'archived';

const SOPPage: React.FC = () => {
  const { sops, deleteSOP, updateSOPStatus, createFromTemplate } = useSOPs();
  const location = useLocation();
  const { isMobileOrTablet } = useResponsive();
  const [showForm, setShowForm] = useState(false);
  const [editingSOP, setEditingSOP] = useState<SOP | null>(null);
  const [viewingSOP, setViewingSOP] = useState<SOP | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [filterView, setFilterView] = useState<FilterView>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');

  // Check if we should open the form based on navigation state
  useEffect(() => {
    if (location.state && (location.state as any).openForm) {
      setShowForm(true);
      // Clear the state so it doesn't reopen on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Only show non-template SOPs
  const nonTemplateSOPs = sops.filter(sop => !sop.isTemplate);

  // Get unique departments
  const departments = Array.from(new Set(nonTemplateSOPs.map(sop => sop.department))).sort();

  // Calculate filter counts (exclude templates)
  const filterCounts = {
    all: nonTemplateSOPs.length,
    published: nonTemplateSOPs.filter(s => s.status === 'published').length,
    draft: nonTemplateSOPs.filter(s => s.status === 'draft').length,
    archived: nonTemplateSOPs.filter(s => s.status === 'archived').length,
  };

  // Get unique categories (from non-templates only)
  const categories = Array.from(new Set(nonTemplateSOPs.map(sop => sop.category)));

  // Filter SOPs by department, search, and status (exclude templates)
  const filteredSOPs = nonTemplateSOPs.filter(sop => {
    const matchesDepartment = selectedDepartment === 'all' || sop.department === selectedDepartment;

    const matchesSearch = searchTerm === '' ||
      sop.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sop.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sop.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesFilter =
      filterView === 'all' ||
      (filterView === 'published' && sop.status === 'published') ||
      (filterView === 'draft' && sop.status === 'draft') ||
      (filterView === 'archived' && sop.status === 'archived');

    return matchesDepartment && matchesSearch && matchesFilter;
  });

  // Group SOPs by category
  const sopsByCategory = filteredSOPs.reduce((acc, sop) => {
    if (!acc[sop.category]) {
      acc[sop.category] = [];
    }
    acc[sop.category].push(sop);
    return acc;
  }, {} as Record<string, SOP[]>);

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const expandAll = () => {
    setExpandedCategories(new Set(categories));
  };

  const collapseAll = () => {
    setExpandedCategories(new Set());
  };

  const handleEdit = (sop: SOP) => {
    setEditingSOP(sop);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this SOP? This action cannot be undone.')) {
      deleteSOP(id);
    }
  };

  const handleView = (sop: SOP) => {
    setViewingSOP(sop);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingSOP(null);
  };

  const handleCloseViewer = () => {
    setViewingSOP(null);
  };

  const handleArchive = (id: string) => {
    const sop = sops.find(s => s.id === id);
    if (!sop) return;

    if (sop.status === 'archived') {
      updateSOPStatus(id, 'published');
    } else {
      if (window.confirm('Are you sure you want to archive this SOP?')) {
        updateSOPStatus(id, 'archived');
      }
    }
  };

  const handlePublishToggle = (id: string) => {
    const sop = sops.find(s => s.id === id);
    if (!sop) return;

    if (sop.status === 'published') {
      updateSOPStatus(id, 'draft');
    } else {
      updateSOPStatus(id, 'published');
    }
  };

  const handleUseTemplate = (templateId: string) => {
    createFromTemplate(templateId);
    setFilterView('draft');
  };

  const getIcon = (iconName?: string) => {
    if (iconName && iconName in equipmentIcons) {
      return equipmentIcons[iconName as IconName];
    }
    // Default icon for SOPs (document/clipboard)
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    );
  };

  if (viewingSOP) {
    return <SOPViewer sop={viewingSOP} onClose={handleCloseViewer} />;
  }

  if (showForm) {
    return <SOPForm sop={editingSOP} onClose={handleCloseForm} />;
  }

  return (
    <div style={isMobileOrTablet ? styles.containerMobile : styles.container}>
      <div style={isMobileOrTablet ? styles.headerMobile : styles.header}>
        <div>
          <h1 style={isMobileOrTablet ? styles.titleMobile : styles.title}>
            <svg
              width={isMobileOrTablet ? "24" : "32"}
              height={isMobileOrTablet ? "24" : "32"}
              viewBox="0 0 24 24"
              fill="none"
              stroke={theme.colors.primary}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: isMobileOrTablet ? '8px' : '12px' }}
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Standard Operating Procedures
          </h1>
          <p style={styles.subtitle}>
            Step-by-step procedures for equipment setup and operations
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={isMobileOrTablet ? styles.addButtonMobile : styles.addButton}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create SOP
        </button>
      </div>

      {/* Department Tabs */}
      <div style={isMobileOrTablet ? styles.departmentTabsMobile : styles.departmentTabs}>
        <button
          onClick={() => setSelectedDepartment('all')}
          style={{
            ...(isMobileOrTablet ? styles.departmentTabMobile : styles.departmentTab),
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
              ...(isMobileOrTablet ? styles.departmentTabMobile : styles.departmentTab),
              ...(selectedDepartment === dept ? styles.departmentTabActive : {}),
            }}
          >
            {dept}
          </button>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={isMobileOrTablet ? styles.filterTabsMobile : styles.filterTabs}>
        <button
          onClick={() => setFilterView('all')}
          style={{
            ...(isMobileOrTablet ? styles.filterTabMobile : styles.filterTab),
            ...(filterView === 'all' ? styles.filterTabActive : {}),
          }}
        >
          <span>All</span>
          <span style={styles.filterCount}>{filterCounts.all}</span>
        </button>
        <button
          onClick={() => setFilterView('published')}
          style={{
            ...(isMobileOrTablet ? styles.filterTabMobile : styles.filterTab),
            ...(filterView === 'published' ? styles.filterTabActive : {}),
          }}
        >
          <span>Published</span>
          <span style={styles.filterCount}>{filterCounts.published}</span>
        </button>
        <button
          onClick={() => setFilterView('draft')}
          style={{
            ...(isMobileOrTablet ? styles.filterTabMobile : styles.filterTab),
            ...(filterView === 'draft' ? styles.filterTabActive : {}),
          }}
        >
          <span>Drafts</span>
          <span style={styles.filterCount}>{filterCounts.draft}</span>
        </button>
        <button
          onClick={() => setFilterView('archived')}
          style={{
            ...(isMobileOrTablet ? styles.filterTabMobile : styles.filterTab),
            ...(filterView === 'archived' ? styles.filterTabActive : {}),
          }}
        >
          <span>Archived</span>
          <span style={styles.filterCount}>{filterCounts.archived}</span>
        </button>
      </div>

      <div style={isMobileOrTablet ? styles.controlsMobile : styles.controls}>
        <div style={isMobileOrTablet ? styles.searchContainerMobile : styles.searchContainer}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textMuted} strokeWidth="2" style={styles.searchIcon}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder={isMobileOrTablet ? "Search SOPs..." : "Search SOPs by title, description, or tags..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={isMobileOrTablet ? styles.searchInputMobile : styles.searchInput}
          />
        </div>

        <div style={isMobileOrTablet ? styles.expandControlsMobile : styles.expandControls}>
          <button onClick={expandAll} style={isMobileOrTablet ? styles.expandButtonMobile : styles.expandButton}>
            Expand All
          </button>
          <button onClick={collapseAll} style={isMobileOrTablet ? styles.expandButtonMobile : styles.expandButton}>
            Collapse All
          </button>
        </div>
      </div>

      <div style={isMobileOrTablet ? styles.statsMobile : styles.stats}>
        <div style={isMobileOrTablet ? styles.statCardMobile : styles.statCard}>
          <div style={styles.statNumber}>{sops.length}</div>
          <div style={styles.statLabel}>Total SOPs</div>
        </div>
        <div style={isMobileOrTablet ? styles.statCardMobile : styles.statCard}>
          <div style={styles.statNumber}>{categories.length}</div>
          <div style={styles.statLabel}>Categories</div>
        </div>
        <div style={isMobileOrTablet ? styles.statCardMobile : styles.statCard}>
          <div style={styles.statNumber}>{filteredSOPs.length}</div>
          <div style={styles.statLabel}>Showing</div>
        </div>
      </div>

      {filteredSOPs.length === 0 ? (
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
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <h3 style={styles.emptyTitle}>
            {searchTerm ? 'No SOPs Found' : 'No SOPs Created Yet'}
          </h3>
          <p style={styles.emptyText}>
            {searchTerm
              ? 'Try adjusting your search criteria.'
              : 'Create your first SOP to help your team follow standardized procedures.'}
          </p>
          {!searchTerm && (
            <button onClick={() => setShowForm(true)} style={styles.emptyButton}>
              Create First SOP
            </button>
          )}
        </div>
      ) : (
        <div style={styles.categoriesContainer}>
          {Object.keys(sopsByCategory).sort().map(category => (
            <div key={category} style={styles.categorySection}>
              <button
                onClick={() => toggleCategory(category)}
                style={styles.categoryHeader}
              >
                <div style={styles.categoryHeaderLeft}>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      ...styles.categoryChevron,
                      transform: expandedCategories.has(category) ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <h2 style={styles.categoryTitle}>{category}</h2>
                  <span style={styles.categoryCount}>
                    {sopsByCategory[category].length} {sopsByCategory[category].length === 1 ? 'SOP' : 'SOPs'}
                  </span>
                </div>
              </button>

              {expandedCategories.has(category) && (
                <div style={isMobileOrTablet ? styles.sopGridMobile : styles.sopGrid}>
                  {sopsByCategory[category].map(sop => (
            <div key={sop.id} style={isMobileOrTablet ? styles.sopCardMobile : styles.sopCard}>
              <div style={styles.sopHeader}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={styles.sopCategory}>{sop.category}</div>
                  {sop.isTemplate && (
                    <span style={styles.templateBadge}>Template</span>
                  )}
                  {sop.status === 'draft' && (
                    <span style={styles.draftBadge}>Draft</span>
                  )}
                  {sop.status === 'archived' && (
                    <span style={styles.archivedBadge}>Archived</span>
                  )}
                </div>
                <div style={styles.sopStepCount}>
                  {sop.steps.length} {sop.steps.length === 1 ? 'Step' : 'Steps'}
                </div>
              </div>

              <div style={styles.sopTitleContainer}>
                <div style={styles.sopIcon}>{getIcon(sop.icon)}</div>
                <h3 style={styles.sopTitle}>{sop.title}</h3>
              </div>
              <p style={styles.sopDescription}>{sop.description}</p>

              {sop.tags && sop.tags.length > 0 && (
                <div style={styles.sopTags}>
                  {sop.tags.slice(0, 3).map((tag, index) => (
                    <span key={index} style={styles.sopTag}>
                      {tag}
                    </span>
                  ))}
                  {sop.tags.length > 3 && (
                    <span style={styles.sopTag}>+{sop.tags.length - 3}</span>
                  )}
                </div>
              )}

              <div style={isMobileOrTablet ? styles.sopActionsMobile : styles.sopActions}>
                <button onClick={() => handleView(sop)} style={isMobileOrTablet ? styles.viewButtonMobile : styles.viewButton}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  View
                </button>

                {/* Template: Show "Use Template" + Delete */}
                {sop.isTemplate && (
                  <>
                    <button onClick={() => handleUseTemplate(sop.id)} style={isMobileOrTablet ? styles.templateButtonMobile : styles.templateButton}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                      </svg>
                      {!isMobileOrTablet && 'Use Template'}
                    </button>
                    <button onClick={() => handleDelete(sop.id)} style={isMobileOrTablet ? styles.deleteButtonMobile : styles.deleteButton}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      {!isMobileOrTablet && 'Delete'}
                    </button>
                  </>
                )}

                {/* Regular SOP: Show Edit + Delete */}
                {!sop.isTemplate && (
                  <>
                    <button onClick={() => handleEdit(sop)} style={isMobileOrTablet ? styles.editButtonMobile : styles.editButton}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      {!isMobileOrTablet && 'Edit'}
                    </button>

                    <button onClick={() => handleDelete(sop.id)} style={isMobileOrTablet ? styles.deleteButtonMobile : styles.deleteButton}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      {!isMobileOrTablet && 'Delete'}
                    </button>
                  </>
                )}
              </div>
            </div>
                  ))}
                </div>
              )}
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
  containerMobile: {
    padding: '16px',
    maxWidth: '100%',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '32px',
    gap: '24px',
  },
  headerMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '24px',
  },
  title: {
    fontSize: '36px',
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
  },
  titleMobile: {
    fontSize: '24px',
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
  },
  subtitle: {
    fontSize: '16px',
    color: theme.colors.textSecondary,
    marginTop: '8px',
  },
  addButton: {
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
  addButtonMobile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
    minHeight: '44px',
    width: '100%',
  },
  controls: {
    display: 'flex',
    gap: '16px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  controlsMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '16px',
  },
  searchContainer: {
    position: 'relative',
    flex: 1,
    minWidth: '300px',
  },
  searchContainerMobile: {
    position: 'relative',
    width: '100%',
  },
  searchIcon: {
    position: 'absolute',
    left: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
  },
  searchInput: {
    width: '100%',
    padding: '14px 16px 14px 48px',
    fontSize: '15px',
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textPrimary,
    outline: 'none',
  },
  searchInputMobile: {
    width: '100%',
    padding: '12px 16px 12px 48px',
    fontSize: '15px',
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textPrimary,
    outline: 'none',
    minHeight: '44px',
  },
  expandControls: {
    display: 'flex',
    gap: '8px',
  },
  expandControlsMobile: {
    display: 'flex',
    gap: '8px',
    width: '100%',
  },
  expandButton: {
    padding: '14px 20px',
    fontSize: '14px',
    fontWeight: '600',
    backgroundColor: 'transparent',
    color: theme.colors.textSecondary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  expandButtonMobile: {
    flex: 1,
    padding: '12px 16px',
    fontSize: '14px',
    fontWeight: '600',
    backgroundColor: 'transparent',
    color: theme.colors.textSecondary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
    minHeight: '44px',
  },
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '32px',
  },
  statsMobile: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    marginBottom: '16px',
  },
  statCard: {
    backgroundColor: theme.colors.cardBackground,
    padding: '24px',
    borderRadius: theme.borderRadius.lg,
    border: `2px solid ${theme.colors.border}`,
    textAlign: 'center',
  },
  statCardMobile: {
    backgroundColor: theme.colors.cardBackground,
    padding: '16px 12px',
    borderRadius: theme.borderRadius.lg,
    border: `2px solid ${theme.colors.border}`,
    textAlign: 'center',
  },
  statNumber: {
    fontSize: '32px',
    fontWeight: '800',
    color: theme.colors.primary,
    marginBottom: '8px',
  },
  statLabel: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: '600',
  },
  categoriesContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  categorySection: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  categoryHeader: {
    width: '100%',
    padding: '20px 24px',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    transition: 'background-color 0.2s',
  },
  categoryHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  categoryChevron: {
    transition: 'transform 0.2s',
    color: theme.colors.primary,
  },
  categoryTitle: {
    fontSize: '22px',
    fontWeight: '700',
    color: theme.colors.textPrimary,
    margin: 0,
  },
  categoryCount: {
    fontSize: '14px',
    fontWeight: '600',
    color: theme.colors.textMuted,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    padding: '4px 12px',
    borderRadius: theme.borderRadius.full,
  },
  sopGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '24px',
    padding: '0 24px 24px 24px',
  },
  sopGridMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '0 16px 16px 16px',
  },
  sopCard: {
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    transition: 'all 0.2s',
  },
  sopCardMobile: {
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    transition: 'all 0.2s',
    width: '100%',
  },
  sopHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sopCategory: {
    fontSize: '12px',
    fontWeight: '700',
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  sopStepCount: {
    fontSize: '13px',
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  sopTitleContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  sopIcon: {
    width: '40px',
    height: '40px',
    minWidth: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: theme.borderRadius.md,
    color: theme.colors.primary,
  },
  sopTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: theme.colors.textPrimary,
    margin: 0,
    flex: 1,
  },
  sopDescription: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
    lineHeight: '1.6',
    margin: 0,
  },
  sopTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  sopTag: {
    fontSize: '12px',
    padding: '4px 10px',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    color: theme.colors.textSecondary,
    borderRadius: theme.borderRadius.full,
    fontWeight: '600',
  },
  sopActions: {
    display: 'flex',
    gap: '8px',
    marginTop: 'auto',
  },
  sopActionsMobile: {
    display: 'flex',
    gap: '8px',
    marginTop: 'auto',
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
  viewButtonMobile: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '12px 16px',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minHeight: '44px',
  },
  editButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px 16px',
    backgroundColor: 'transparent',
    color: theme.colors.textSecondary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  editButtonMobile: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '12px 16px',
    backgroundColor: 'transparent',
    color: theme.colors.textSecondary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minHeight: '44px',
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
  deleteButtonMobile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 14px',
    backgroundColor: 'transparent',
    color: theme.colors.error,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
    minHeight: '44px',
    minWidth: '44px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '80px 20px',
  },
  emptyTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: '12px',
  },
  emptyText: {
    fontSize: '16px',
    color: theme.colors.textSecondary,
    marginBottom: '24px',
    maxWidth: '500px',
    margin: '0 auto 24px',
  },
  emptyButton: {
    padding: '14px 28px',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  filterTabs: {
    display: 'flex',
    gap: '12px',
    padding: '0 0 24px 0',
    borderBottom: `2px solid ${theme.colors.border}`,
    marginBottom: '24px',
  },
  filterTabsMobile: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
    padding: '0 0 16px 0',
    borderBottom: `2px solid ${theme.colors.border}`,
    marginBottom: '16px',
  },
  filterTab: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    backgroundColor: 'transparent',
    color: theme.colors.textSecondary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  filterTabMobile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: 'transparent',
    color: theme.colors.textSecondary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minHeight: '44px',
  },
  filterTabActive: {
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: `2px solid ${theme.colors.primary}`,
  },
  filterCount: {
    fontSize: '13px',
    fontWeight: '700',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: '2px 8px',
    borderRadius: theme.borderRadius.full,
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
  draftBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '4px 8px',
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    color: '#F59E0B',
    borderRadius: theme.borderRadius.sm,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  archivedBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '4px 8px',
    backgroundColor: 'rgba(156, 163, 175, 0.15)',
    color: '#6B7280',
    borderRadius: theme.borderRadius.sm,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  templateButton: {
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
  templateButtonMobile: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '12px 16px',
    backgroundColor: '#3B82F6',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minHeight: '44px',
  },
  publishButton: {
    padding: '10px 16px',
    backgroundColor: '#10B981',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  unpublishButton: {
    padding: '10px 16px',
    backgroundColor: 'transparent',
    color: theme.colors.textSecondary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  archiveButton: {
    padding: '10px 16px',
    backgroundColor: 'transparent',
    color: '#6B7280',
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  restoreButton: {
    padding: '10px 16px',
    backgroundColor: '#10B981',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  departmentTabs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '0 0 24px 0',
    borderBottom: `3px solid ${theme.colors.primary}`,
    marginBottom: '24px',
  },
  departmentTabsMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '0 0 16px 0',
    borderBottom: `3px solid ${theme.colors.primary}`,
    marginBottom: '16px',
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
  },
  departmentTabMobile: {
    padding: '14px 20px',
    backgroundColor: 'transparent',
    color: theme.colors.textPrimary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    minHeight: '44px',
    width: '100%',
  },
  departmentTabActive: {
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    border: `2px solid ${theme.colors.primary}`,
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 12px rgba(239, 35, 60, 0.4)',
  },
};

export default SOPPage;
