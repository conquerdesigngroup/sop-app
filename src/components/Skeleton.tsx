import React from 'react';
import { theme } from '../theme';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  style?: React.CSSProperties;
}

// Base skeleton component with pulse animation
export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '20px',
  borderRadius = theme.borderRadius.md,
  style,
}) => {
  return (
    <div
      className="skeleton-pulse"
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: theme.colors.bg.tertiary,
        ...style,
      }}
    />
  );
};

// Stat card skeleton for Dashboard
interface StatCardSkeletonProps {
  isMobile?: boolean;
}

export const StatCardSkeleton: React.FC<StatCardSkeletonProps> = ({ isMobile = false }) => {
  return (
    <div style={isMobile ? styles.statCardMobile : styles.statCard}>
      <Skeleton
        width={32}
        height={32}
        borderRadius={theme.borderRadius.md}
      />
      <div style={styles.statContent}>
        <Skeleton
          width={60}
          height={32}
          style={{ marginBottom: theme.spacing.xs }}
        />
        <Skeleton width={80} height={14} />
      </div>
    </div>
  );
};

// List item skeleton for task lists
export const ListItemSkeleton: React.FC = () => {
  return (
    <div style={styles.listItem}>
      <div style={styles.listItemHeader}>
        <Skeleton width="60%" height={18} />
        <Skeleton width={70} height={24} borderRadius={theme.borderRadius.full} />
      </div>
      <div style={styles.listItemFooter}>
        <Skeleton width={100} height={14} />
        <Skeleton width={60} height={14} />
      </div>
    </div>
  );
};

// Card skeleton for SOP grid view
export const CardSkeleton: React.FC = () => {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <Skeleton width="70%" height={20} />
        <Skeleton width={60} height={20} borderRadius={theme.borderRadius.sm} />
      </div>
      <Skeleton width="100%" height={14} style={{ marginBottom: '8px' }} />
      <Skeleton width="80%" height={14} style={{ marginBottom: '16px' }} />
      <div style={styles.cardFooter}>
        <Skeleton width={80} height={12} />
        <Skeleton width={100} height={12} />
      </div>
    </div>
  );
};

// Section skeleton with title and content
interface SectionSkeletonProps {
  itemCount?: number;
  isMobile?: boolean;
}

export const SectionSkeleton: React.FC<SectionSkeletonProps> = ({
  itemCount = 3,
  isMobile = false
}) => {
  return (
    <div style={isMobile ? styles.sectionMobile : styles.section}>
      <Skeleton width={150} height={24} style={{ marginBottom: theme.spacing.lg }} />
      {Array.from({ length: itemCount }).map((_, index) => (
        <ListItemSkeleton key={index} />
      ))}
    </div>
  );
};

// Stats grid skeleton
interface StatsGridSkeletonProps {
  count?: number;
  isMobile?: boolean;
}

export const StatsGridSkeleton: React.FC<StatsGridSkeletonProps> = ({
  count = 4,
  isMobile = false
}) => {
  return (
    <div style={isMobile ? styles.statsGridMobile : styles.statsGrid}>
      {Array.from({ length: count }).map((_, index) => (
        <StatCardSkeleton key={index} isMobile={isMobile} />
      ))}
    </div>
  );
};

// SOP grid skeleton
interface SOPGridSkeletonProps {
  count?: number;
  isMobile?: boolean;
}

export const SOPGridSkeleton: React.FC<SOPGridSkeletonProps> = ({
  count = 6,
  isMobile = false
}) => {
  return (
    <div style={isMobile ? styles.sopGridMobile : styles.sopGrid}>
      {Array.from({ length: count }).map((_, index) => (
        <CardSkeleton key={index} />
      ))}
    </div>
  );
};

// Table row skeleton for list views
export const TableRowSkeleton: React.FC = () => {
  return (
    <div style={styles.tableRow}>
      <Skeleton width="40%" height={16} />
      <Skeleton width={80} height={24} borderRadius={theme.borderRadius.full} />
      <Skeleton width={100} height={16} />
      <Skeleton width={80} height={16} />
    </div>
  );
};

// Full Dashboard skeleton (Team Member view)
interface DashboardSkeletonProps {
  isMobile?: boolean;
}

export const DashboardSkeleton: React.FC<DashboardSkeletonProps> = ({ isMobile = false }) => {
  return (
    <div style={isMobile ? styles.containerMobile : styles.container}>
      {/* Header */}
      <div style={isMobile ? styles.headerMobile : styles.header}>
        <div>
          <Skeleton width={200} height={36} style={{ marginBottom: theme.spacing.sm }} />
          <Skeleton width={250} height={16} />
        </div>
        {!isMobile && <Skeleton width={140} height={44} borderRadius={theme.borderRadius.md} />}
      </div>

      {/* Stats Grid */}
      <StatsGridSkeleton count={4} isMobile={isMobile} />

      {/* Content Sections */}
      <SectionSkeleton itemCount={3} isMobile={isMobile} />
    </div>
  );
};

// Full SOP page skeleton
interface SOPPageSkeletonProps {
  isMobile?: boolean;
  viewMode?: 'grid' | 'list';
}

export const SOPPageSkeleton: React.FC<SOPPageSkeletonProps> = ({
  isMobile = false,
  viewMode = 'grid'
}) => {
  return (
    <div style={isMobile ? styles.containerMobile : styles.container}>
      {/* Header */}
      <div style={isMobile ? styles.headerMobile : styles.header}>
        <div>
          <Skeleton width={180} height={36} style={{ marginBottom: theme.spacing.sm }} />
          <Skeleton width={220} height={16} />
        </div>
        {!isMobile && <Skeleton width={120} height={44} borderRadius={theme.borderRadius.md} />}
      </div>

      {/* View Mode Tabs */}
      <div style={styles.tabsSkeleton}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} width={100} height={40} borderRadius={theme.borderRadius.md} />
        ))}
      </div>

      {/* Content */}
      {viewMode === 'grid' ? (
        <SOPGridSkeleton count={6} isMobile={isMobile} />
      ) : (
        <div style={styles.listContainer}>
          {Array.from({ length: 5 }).map((_, index) => (
            <TableRowSkeleton key={index} />
          ))}
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: theme.responsiveSpacing.containerPadding.desktop,
    maxWidth: '1400px',
    margin: '0 auto',
  },
  containerMobile: {
    padding: theme.responsiveSpacing.containerPadding.mobile,
    maxWidth: '100%',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  headerMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: theme.responsiveSpacing.cardGap.desktop,
    marginBottom: theme.responsiveSpacing.containerPadding.desktop,
  },
  statsGridMobile: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: theme.responsiveSpacing.cardGap.mobile,
    marginBottom: theme.spacing.lg,
  },
  statCard: {
    ...theme.components.card.base,
    display: 'flex',
    alignItems: 'center',
    gap: theme.responsiveSpacing.cardGap.desktop,
  },
  statCardMobile: {
    ...theme.components.card.base,
    ...theme.components.card.mobile,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: theme.responsiveSpacing.cardGap.mobile,
    textAlign: 'center',
  },
  statContent: {
    flex: 1,
  },
  section: {
    ...theme.components.card.base,
    marginBottom: theme.spacing.lg,
  },
  sectionMobile: {
    ...theme.components.card.base,
    ...theme.components.card.mobile,
    marginBottom: theme.spacing.md,
  },
  listItem: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
  },
  listItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  listItemFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  card: {
    ...theme.components.card.base,
    display: 'flex',
    flexDirection: 'column',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
  },
  sopGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: theme.responsiveSpacing.cardGap.desktop,
  },
  sopGridMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.responsiveSpacing.cardGap.mobile,
  },
  tabsSkeleton: {
    display: 'flex',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
    padding: '6px',
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    border: `2px solid ${theme.colors.border}`,
  },
  tableRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
  },
  listContainer: {
    display: 'flex',
    flexDirection: 'column',
  },
};

export default Skeleton;
