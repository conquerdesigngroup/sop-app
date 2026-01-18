import React, { useState, useEffect, memo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useSOPs } from '../contexts/SOPContext';
import { useAuth } from '../contexts/AuthContext';
import { theme } from '../theme';
import { SOP, SOPStatus } from '../types';
import SOPForm from '../components/SOPForm';
import SOPViewer from '../components/SOPViewer';
import SOPImport from '../components/SOPImport';
import { equipmentIcons, IconName } from '../components/IconSelector';
import { useResponsive } from '../hooks/useResponsive';
import { SOPPageSkeleton } from '../components/Skeleton';

type FilterView = 'all' | 'published' | 'draft' | 'archived';
type ViewMode = 'sops' | 'templates';

const SOPPage: React.FC = () => {
  const { sops, deleteSOP, updateSOPStatus, createFromTemplate, loading } = useSOPs();
  const { isAdmin } = useAuth();
  const location = useLocation();
  const { isMobileOrTablet } = useResponsive();
  const [viewMode, setViewMode] = useState<ViewMode>('sops');
  const [showForm, setShowForm] = useState(false);
  const [editingSOP, setEditingSOP] = useState<SOP | null>(null);
  const [viewingSOP, setViewingSOP] = useState<SOP | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [filterView, setFilterView] = useState<FilterView>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');

  // Check if we should open the form or apply filters based on navigation state
  useEffect(() => {
    if (location.state) {
      const state = location.state as any;
      if (state.openForm) {
        setShowForm(true);
      }
      if (state.filterStatus) {
        setFilterView(state.filterStatus as FilterView);
      }
      if (state.filterDepartment) {
        setSelectedDepartment(state.filterDepartment);
      }
      if (state.viewMode) {
        setViewMode(state.viewMode as ViewMode);
      }
      if (state.expandCategory) {
        setExpandedCategories(new Set([state.expandCategory]));
      }
      // Clear the state so it doesn't reapply on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Memoized callbacks - must be defined before any early returns to follow hooks rules
  const handleEdit = useCallback((sop: SOP) => {
    setEditingSOP(sop);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback((id: string) => {
    if (viewMode === 'templates') {
      // Templates are permanently deleted
      if (window.confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
        deleteSOP(id);
      }
    } else {
      // SOPs are archived instead of deleted
      if (window.confirm('Are you sure you want to archive this SOP?')) {
        updateSOPStatus(id, 'archived');
      }
    }
  }, [viewMode, deleteSOP, updateSOPStatus]);

  const handleView = useCallback((sop: SOP) => {
    setViewingSOP(sop);
  }, []);

  const handleUseTemplate = useCallback((templateId: string) => {
    createFromTemplate(templateId);
    setViewMode('sops');
    setFilterView('draft');
  }, [createFromTemplate]);

  const getIcon = useCallback((iconName?: string) => {
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
  }, []);

  // Show skeleton while loading
  if (loading) {
    return <SOPPageSkeleton isMobile={isMobileOrTablet} />;
  }

  // Split SOPs into templates and non-templates
  const templates = sops.filter(sop => sop.isTemplate);
  const nonTemplateSOPs = sops.filter(sop => !sop.isTemplate);

  // Get the current list based on view mode
  const currentList = viewMode === 'templates' ? templates : nonTemplateSOPs;

  // Get unique departments from current list
  const departments = Array.from(new Set(currentList.map(sop => sop.department))).sort();

  // Calculate filter counts (for SOPs only)
  const filterCounts = {
    all: nonTemplateSOPs.length,
    published: nonTemplateSOPs.filter(s => s.status === 'published').length,
    draft: nonTemplateSOPs.filter(s => s.status === 'draft').length,
    archived: nonTemplateSOPs.filter(s => s.status === 'archived').length,
  };

  // Get unique categories from current list
  const categories = Array.from(new Set(currentList.map(sop => sop.category)));

  // Filter based on view mode
  const filteredItems = currentList.filter(sop => {
    const matchesDepartment = selectedDepartment === 'all' || sop.department === selectedDepartment;

    const matchesSearch = searchTerm === '' ||
      sop.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sop.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sop.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

    // For templates, ignore status filter
    if (viewMode === 'templates') {
      return matchesDepartment && matchesSearch;
    }

    // For SOPs, apply status filter
    const matchesFilter =
      filterView === 'all' ||
      (filterView === 'published' && sop.status === 'published') ||
      (filterView === 'draft' && sop.status === 'draft') ||
      (filterView === 'archived' && sop.status === 'archived');

    return matchesDepartment && matchesSearch && matchesFilter;
  });

  // Group items by category
  const itemsByCategory = filteredItems.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
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

  if (viewingSOP) {
    return <SOPViewer sop={viewingSOP} onClose={handleCloseViewer} />;
  }

  if (showForm) {
    return <SOPForm sop={editingSOP} onClose={handleCloseForm} />;
  }

  return (
    <>
      {showImport && (
        <SOPImport
          onClose={() => setShowImport(false)}
          onImportComplete={() => setShowImport(false)}
        />
      )}
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
            {viewMode === 'templates'
              ? 'Reusable SOP templates for your organization'
              : 'Step-by-step procedures for equipment setup and operations'}
          </p>
        </div>
        {isAdmin && (
          <div style={isMobileOrTablet ? styles.headerButtonsMobile : styles.headerButtons}>
            <button
              onClick={() => setShowImport(true)}
              style={isMobileOrTablet ? styles.importButtonMobile : styles.importButton}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {!isMobileOrTablet && 'Import'}
            </button>
            <button
              onClick={() => setShowForm(true)}
              style={isMobileOrTablet ? styles.addButtonMobile : styles.addButton}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {viewMode === 'templates' ? 'Create Template' : 'Create SOP'}
            </button>
          </div>
        )}
      </div>

      {/* View Mode Tabs - Matching Job Tasks Page Style */}
      <div style={isMobileOrTablet ? styles.tabNavigationMobile : styles.tabNavigation}>
        <button
          onClick={() => {
            setViewMode('sops');
            setSelectedDepartment('all');
          }}
          style={{
            ...styles.tabButton,
            ...(isMobileOrTablet && styles.tabButtonMobile),
            ...(viewMode === 'sops' && styles.tabButtonActive),
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          SOPs
        </button>
        <button
          onClick={() => {
            setViewMode('templates');
            setSelectedDepartment('all');
          }}
          style={{
            ...styles.tabButton,
            ...(isMobileOrTablet && styles.tabButtonMobile),
            ...(viewMode === 'templates' && styles.tabButtonActive),
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          </svg>
          Templates
        </button>
      </div>

      {/* Department Tabs */}
      {departments.length > 0 && (
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
      )}

      {/* Filter Tabs (only show for SOPs) */}
      {viewMode === 'sops' && (
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
      )}

      <div style={isMobileOrTablet ? styles.controlsMobile : styles.controls}>
        <div style={isMobileOrTablet ? styles.searchContainerMobile : styles.searchContainer}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textMuted} strokeWidth="2" style={styles.searchIcon}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder={isMobileOrTablet ? `Search ${viewMode}...` : `Search ${viewMode} by title, description, or tags...`}
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

      {filteredItems.length === 0 ? (
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
            {viewMode === 'templates' ? (
              <>
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </>
            ) : (
              <>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </>
            )}
          </svg>
          <h3 style={styles.emptyTitle}>
            {searchTerm
              ? `No ${viewMode === 'templates' ? 'Templates' : 'SOPs'} Found`
              : `No ${viewMode === 'templates' ? 'Templates' : 'SOPs'} Created Yet`}
          </h3>
          <p style={styles.emptyText}>
            {searchTerm
              ? 'Try adjusting your search criteria.'
              : viewMode === 'templates'
              ? 'Create your first template to reuse across your organization.'
              : 'Create your first SOP to help your team follow standardized procedures.'}
          </p>
          {!searchTerm && isAdmin && (
            <button onClick={() => setShowForm(true)} style={styles.emptyButton}>
              Create First {viewMode === 'templates' ? 'Template' : 'SOP'}
            </button>
          )}
        </div>
      ) : (
        <div style={styles.categoriesContainer}>
          {Object.keys(itemsByCategory).sort().map(category => (
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
                    {itemsByCategory[category].length} {itemsByCategory[category].length === 1 ? (viewMode === 'templates' ? 'TEMPLATE' : 'SOP') : (viewMode === 'templates' ? 'TEMPLATES' : 'SOPs')}
                  </span>
                </div>
              </button>

              {expandedCategories.has(category) && (
                <div style={isMobileOrTablet ? styles.sopGridMobile : styles.sopGrid}>
                  {itemsByCategory[category].map(item => (
                    <SOPCard
                      key={item.id}
                      item={item}
                      isMobileOrTablet={isMobileOrTablet}
                      isAdmin={isAdmin}
                      getIcon={getIcon}
                      onView={handleView}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onUseTemplate={handleUseTemplate}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
};

// Memoized SOP Card Component for better list performance
interface SOPCardProps {
  item: SOP;
  isMobileOrTablet: boolean;
  isAdmin: boolean;
  getIcon: (iconName?: IconName) => React.ReactNode;
  onView: (sop: SOP) => void;
  onEdit: (sop: SOP) => void;
  onDelete: (id: string) => void;
  onUseTemplate: (id: string) => void;
}

const SOPCard: React.FC<SOPCardProps> = memo(({
  item,
  isMobileOrTablet,
  isAdmin,
  getIcon,
  onView,
  onEdit,
  onDelete,
  onUseTemplate,
}) => {
  return (
    <div style={isMobileOrTablet ? styles.sopCardMobile : styles.sopCard}>
      <div style={styles.sopHeader}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={styles.sopCategory}>{item.category}</div>
          {item.isTemplate && (
            <span style={styles.templateBadge}>Template</span>
          )}
          {!item.isTemplate && item.status === 'draft' && (
            <span style={styles.draftBadge}>Draft</span>
          )}
          {!item.isTemplate && item.status === 'archived' && (
            <span style={styles.archivedBadge}>Archived</span>
          )}
        </div>
        <div style={styles.sopStepCount}>
          {item.steps.length} {item.steps.length === 1 ? 'Step' : 'Steps'}
        </div>
      </div>

      <div style={styles.sopTitleContainer}>
        <div style={styles.sopIcon}>{getIcon(item.icon as IconName)}</div>
        <h3 style={styles.sopTitle}>{item.title}</h3>
      </div>
      <p style={styles.sopDescription}>{item.description}</p>

      {item.tags && item.tags.length > 0 && (
        <div style={styles.sopTags}>
          {item.tags.slice(0, 3).map((tag, index) => (
            <span key={index} style={styles.sopTag}>
              {tag}
            </span>
          ))}
          {item.tags.length > 3 && (
            <span style={styles.sopTag}>+{item.tags.length - 3}</span>
          )}
        </div>
      )}

      <div style={isMobileOrTablet ? styles.sopActionsMobile : styles.sopActions}>
        <button onClick={() => onView(item)} style={isMobileOrTablet ? styles.viewButtonMobile : styles.viewButton}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          View
        </button>

        {item.isTemplate && (
          <button onClick={() => onUseTemplate(item.id)} style={isMobileOrTablet ? styles.templateButtonMobile : styles.templateButton}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
            {!isMobileOrTablet && 'Use'}
          </button>
        )}

        {isAdmin && (
          <button onClick={() => onEdit(item)} style={isMobileOrTablet ? styles.editButtonMobile : styles.editButton}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            {!isMobileOrTablet && 'Edit'}
          </button>
        )}

        {isAdmin && (
          <button onClick={() => onDelete(item.id)} style={isMobileOrTablet ? styles.deleteButtonMobile : styles.deleteButton}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            {!isMobileOrTablet && 'Delete'}
          </button>
        )}
      </div>
    </div>
  );
});

SOPCard.displayName = 'SOPCard';

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: theme.pageLayout.containerPadding.desktop,
    maxWidth: theme.pageLayout.maxWidth,
    margin: '0 auto',
  },
  containerMobile: {
    padding: theme.pageLayout.containerPadding.mobile,
    maxWidth: '100%',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.pageLayout.headerMargin.desktop,
    gap: theme.spacing.lg,
  },
  headerMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.md,
    marginBottom: theme.pageLayout.headerMargin.mobile,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    display: 'flex',
    alignItems: 'center',
  },
  titleMobile: {
    ...theme.typography.h2Mobile,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    display: 'flex',
    alignItems: 'center',
  },
  subtitle: {
    ...theme.typography.subtitle,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  addButton: {
    ...theme.components.button.base,
    ...theme.components.button.sizes.md,
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  addButtonMobile: {
    ...theme.components.button.base,
    ...theme.components.button.sizes.md,
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    fontWeight: 700,
    flex: 1,
  },
  headerButtons: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  headerButtonsMobile: {
    display: 'flex',
    gap: '8px',
    width: '100%',
  },
  importButton: {
    ...theme.components.button.base,
    ...theme.components.button.sizes.md,
    backgroundColor: 'transparent',
    color: theme.colors.textSecondary,
    fontWeight: 600,
    border: `2px solid ${theme.colors.border}`,
    whiteSpace: 'nowrap',
  },
  importButtonMobile: {
    ...theme.components.button.base,
    ...theme.components.button.sizes.md,
    backgroundColor: 'transparent',
    color: theme.colors.textSecondary,
    fontWeight: 600,
    border: `2px solid ${theme.colors.border}`,
    padding: '12px 16px',
    minWidth: '48px',
  },
  // Tab Navigation Styles - Matching Job Tasks Page
  tabNavigation: {
    display: 'flex',
    gap: '4px',
    marginBottom: theme.spacing.xl,
    borderBottom: `2px solid ${theme.colors.bdr.primary}`,
  },
  tabNavigationMobile: {
    gap: '2px',
    marginBottom: theme.spacing.lg,
  },
  tabButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '14px 28px',
    background: theme.colors.bg.secondary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderBottom: 'none',
    borderRadius: `${theme.borderRadius.md} ${theme.borderRadius.md} 0 0`,
    color: theme.colors.txt.secondary,
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    position: 'relative',
    marginBottom: '-2px',
  } as React.CSSProperties,
  tabButtonMobile: {
    padding: '12px 16px',
    fontSize: '14px',
    flex: 1,
  },
  tabButtonActive: {
    background: theme.colors.cardBackground,
    color: theme.colors.primary,
    borderColor: theme.colors.primary,
    borderBottomColor: theme.colors.cardBackground,
    fontWeight: 700,
  },
  controls: {
    display: 'flex',
    gap: theme.pageLayout.filterGap.desktop,
    marginBottom: theme.pageLayout.sectionMargin.desktop,
    flexWrap: 'wrap',
  },
  controlsMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.pageLayout.filterGap.mobile,
    marginBottom: theme.pageLayout.sectionMargin.mobile,
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
    backgroundColor: `${theme.colors.status.info}20`,
    color: theme.colors.status.info,
    borderRadius: theme.borderRadius.sm,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  draftBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '4px 8px',
    backgroundColor: `${theme.colors.status.draft}20`,
    color: theme.colors.status.draft,
    borderRadius: theme.borderRadius.sm,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  archivedBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '4px 8px',
    backgroundColor: `${theme.colors.status.archived}20`,
    color: theme.colors.status.archived,
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
    backgroundColor: theme.colors.status.info,
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
    backgroundColor: theme.colors.status.info,
    color: '#FFFFFF',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minHeight: '44px',
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
