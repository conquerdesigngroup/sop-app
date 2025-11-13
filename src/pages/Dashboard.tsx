import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSOPs } from '../contexts/SOPContext';
import { useAuth } from '../contexts/AuthContext';
import { useTask } from '../contexts/TaskContext';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';

const Dashboard: React.FC = () => {
  const { sops } = useSOPs();
  const { isAdmin, currentUser } = useAuth();
  const { jobTasks } = useTask();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // If not admin, show team member dashboard with calendar
  if (!isAdmin && currentUser) {
    return <TeamMemberDashboard currentUser={currentUser} jobTasks={jobTasks} currentMonth={currentMonth} setCurrentMonth={setCurrentMonth} navigate={navigate} />;
  }

  // Admin dashboard - existing SOP statistics
  return <AdminDashboard sops={sops} navigate={navigate} />;
};

// Team Member Dashboard Component with Calendar View
const TeamMemberDashboard: React.FC<{
  currentUser: any;
  jobTasks: any[];
  currentMonth: Date;
  setCurrentMonth: (date: Date) => void;
  navigate: any;
}> = ({ currentUser, jobTasks, currentMonth, setCurrentMonth, navigate }) => {
  const { isMobileOrTablet } = useResponsive();
  const myTasks = jobTasks.filter(task => task.assignedTo.includes(currentUser.id));

  // Task stats
  const pendingTasks = myTasks.filter(t => t.status === 'pending').length;
  const inProgressTasks = myTasks.filter(t => t.status === 'in-progress').length;
  const completedTasks = myTasks.filter(t => t.status === 'completed').length;
  const totalTasks = myTasks.length;

  // Today's tasks
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTasks = myTasks.filter(task => {
    const taskDate = new Date(task.scheduledDate);
    taskDate.setHours(0, 0, 0, 0);
    return taskDate.getTime() === today.getTime();
  });

  // Upcoming tasks (next 7 days)
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const upcomingTasks = myTasks.filter(task => {
    const taskDate = new Date(task.scheduledDate);
    return taskDate > today && taskDate <= nextWeek;
  });

  // Overdue tasks
  const overdueTasks = myTasks.filter(task => {
    const taskDate = new Date(task.scheduledDate);
    return taskDate < today && task.status !== 'completed';
  });

  // Calendar helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentMonth);

  const getTasksForDate = (day: number) => {
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);

    return myTasks.filter(task => {
      const taskDate = new Date(task.scheduledDate);
      taskDate.setHours(0, 0, 0, 0);
      return taskDate.getTime() === date.getTime();
    });
  };

  const previousMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div style={isMobileOrTablet ? styles.containerMobile : styles.container}>
      <div style={isMobileOrTablet ? styles.headerMobile : styles.header}>
        <div>
          <h1 style={isMobileOrTablet ? styles.titleMobile : styles.title}>My Dashboard</h1>
          <p style={styles.subtitle}>
            Welcome back, {currentUser.firstName}! Here's your task overview.
          </p>
        </div>
        <button
          onClick={() => navigate('/my-tasks')}
          style={styles.createButton}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          View All Tasks
        </button>
      </div>

      {/* Stats Grid */}
      <div style={isMobileOrTablet ? styles.statsGridMobile : styles.statsGrid}>
        <div style={isMobileOrTablet ? styles.statCardMobile : styles.statCard}>
          <div style={styles.statIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div style={styles.statContent}>
            <div style={{ ...styles.statNumber, color: '#F59E0B' }}>{pendingTasks}</div>
            <div style={styles.statLabel}>Pending</div>
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
          <div style={styles.statContent}>
            <div style={{ ...styles.statNumber, color: '#3B82F6' }}>{inProgressTasks}</div>
            <div style={styles.statLabel}>In Progress</div>
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <div style={styles.statContent}>
            <div style={{ ...styles.statNumber, color: '#10B981' }}>{completedTasks}</div>
            <div style={styles.statLabel}>Completed</div>
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div style={styles.statContent}>
            <div style={{ ...styles.statNumber, color: '#EF4444' }}>{overdueTasks.length}</div>
            <div style={styles.statLabel}>Overdue</div>
          </div>
        </div>
      </div>

      {/* Calendar Section */}
      <div style={isMobileOrTablet ? styles.sectionMobile : styles.section}>
        <div style={styles.calendarHeader}>
          <h2 style={styles.sectionTitle}>{monthNames[month]} {year}</h2>
          <div style={styles.calendarNav}>
            <button onClick={previousMonth} style={styles.navButton}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button onClick={nextMonth} style={styles.navButton}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>

        <div style={styles.calendar}>
          {/* Day headers */}
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} style={styles.dayHeader}>{day}</div>
          ))}

          {/* Empty cells before first day */}
          {Array.from({ length: startingDayOfWeek }).map((_, index) => (
            <div key={`empty-${index}`} style={styles.calendarDay} />
          ))}

          {/* Days of month */}
          {Array.from({ length: daysInMonth }).map((_, index) => {
            const day = index + 1;
            const tasksForDay = getTasksForDate(day);
            const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;

            return (
              <div
                key={day}
                style={{
                  ...styles.calendarDay,
                  ...(isToday ? styles.calendarDayToday : {}),
                }}
              >
                <div style={styles.dayNumber}>{day}</div>
                {tasksForDay.length > 0 && (
                  <div style={styles.taskIndicators}>
                    {tasksForDay.slice(0, 3).map(task => (
                      <div
                        key={task.id}
                        style={{
                          ...styles.taskDot,
                          backgroundColor:
                            task.status === 'completed'
                              ? '#10B981'
                              : task.status === 'in-progress'
                              ? '#3B82F6'
                              : '#F59E0B',
                        }}
                        title={task.title}
                      />
                    ))}
                    {tasksForDay.length > 3 && (
                      <span style={styles.moreTasksIndicator}>+{tasksForDay.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Today's Tasks & Upcoming */}
      <div style={isMobileOrTablet ? styles.contentGridMobile : styles.contentGrid}>
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Today's Tasks ({todayTasks.length})</h2>
          {todayTasks.length === 0 ? (
            <div style={styles.emptyState}>
              <p style={styles.emptyText}>No tasks due today</p>
            </div>
          ) : (
            <div style={styles.tasksList}>
              {todayTasks.map(task => (
                <div key={task.id} style={styles.taskItem} onClick={() => navigate('/my-tasks')}>
                  <div style={styles.taskItemHeader}>
                    <div style={styles.taskItemTitle}>{task.title}</div>
                    <div style={{
                      ...styles.statusBadge,
                      backgroundColor: task.status === 'completed' ? '#10B981' : task.status === 'in-progress' ? '#3B82F6' : '#F59E0B',
                    }}>
                      {task.status}
                    </div>
                  </div>
                  <div style={styles.progressInfo}>
                    <span>{task.completedSteps.length} / {task.steps.length} steps</span>
                    <span>{task.progressPercentage}%</span>
                  </div>
                  <div style={styles.progressBar}>
                    <div style={{ ...styles.progressFill, width: `${task.progressPercentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Upcoming (Next 7 Days)</h2>
          {upcomingTasks.length === 0 ? (
            <div style={styles.emptyState}>
              <p style={styles.emptyText}>No upcoming tasks</p>
            </div>
          ) : (
            <div style={styles.tasksList}>
              {upcomingTasks.slice(0, 5).map(task => (
                <div key={task.id} style={styles.taskItem} onClick={() => navigate('/my-tasks')}>
                  <div style={styles.taskItemHeader}>
                    <div style={styles.taskItemTitle}>{task.title}</div>
                    <div style={{
                      ...styles.statusBadge,
                      backgroundColor: task.status === 'completed' ? '#10B981' : task.status === 'in-progress' ? '#3B82F6' : '#F59E0B',
                    }}>
                      {task.status}
                    </div>
                  </div>
                  <div style={styles.taskItemFooter}>
                    <span style={styles.taskDate}>
                      {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span>{task.progressPercentage}% complete</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Overdue Tasks */}
      {overdueTasks.length > 0 && (
        <div style={styles.section}>
          <h2 style={{ ...styles.sectionTitle, color: '#EF4444' }}>Overdue Tasks ({overdueTasks.length})</h2>
          <div style={styles.tasksList}>
            {overdueTasks.map(task => (
              <div key={task.id} style={{ ...styles.taskItem, borderColor: '#EF4444' }} onClick={() => navigate('/my-tasks')}>
                <div style={styles.taskItemHeader}>
                  <div style={styles.taskItemTitle}>{task.title}</div>
                  <div style={{ ...styles.statusBadge, backgroundColor: '#EF4444' }}>
                    Overdue
                  </div>
                </div>
                <div style={styles.taskItemFooter}>
                  <span style={{ ...styles.taskDate, color: '#EF4444' }}>
                    Due: {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span>{task.progressPercentage}% complete</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Admin Dashboard Component (existing dashboard)
const AdminDashboard: React.FC<{ sops: any[]; navigate: any }> = ({ sops, navigate }) => {
  const { isMobileOrTablet } = useResponsive();

  // Calculate stats
  const totalSOPs = sops.length;
  const publishedSOPs = sops.filter(s => s.status === 'published' && !s.isTemplate).length;
  const draftSOPs = sops.filter(s => s.status === 'draft').length;
  const archivedSOPs = sops.filter(s => s.status === 'archived').length;
  const templateSOPs = sops.filter(s => s.isTemplate).length;
  const categories = Array.from(new Set(sops.map(sop => sop.category)));
  const departments = Array.from(new Set(sops.map(sop => sop.department))).filter(d => d); // Filter out undefined
  const totalSteps = sops.reduce((sum, sop) => sum + sop.steps.length, 0);
  const recentSOPs = [...sops]
    .filter(s => !s.isTemplate)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const categoryStats = categories.map(category => ({
    name: category,
    count: sops.filter(sop => sop.category === category).length,
  })).sort((a, b) => b.count - a.count);

  const departmentStats = departments.map(department => ({
    name: department,
    count: sops.filter(sop => sop.department === department).length,
    published: sops.filter(sop => sop.department === department && sop.status === 'published' && !sop.isTemplate).length,
    drafts: sops.filter(sop => sop.department === department && sop.status === 'draft').length,
    templates: sops.filter(sop => sop.department === department && sop.isTemplate).length,
  })).sort((a, b) => b.count - a.count);

  return (
    <div style={isMobileOrTablet ? styles.containerMobile : styles.container}>
      <div style={isMobileOrTablet ? styles.headerMobile : styles.header}>
        <div>
          <h1 style={isMobileOrTablet ? styles.titleMobile : styles.title}>Dashboard</h1>
          <p style={styles.subtitle}>
            Overview of your Standard Operating Procedures
          </p>
        </div>
        <button
          onClick={() => navigate('/sop', { state: { openForm: true } })}
          style={styles.createButton}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create SOP
        </button>
      </div>

      {/* Stats Grid */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <div style={styles.statContent}>
            <div style={{ ...styles.statNumber, color: '#10B981' }}>{publishedSOPs}</div>
            <div style={styles.statLabel}>Published</div>
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div style={styles.statContent}>
            <div style={{ ...styles.statNumber, color: '#F59E0B' }}>{draftSOPs}</div>
            <div style={styles.statLabel}>Drafts</div>
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h18v18H3zM21 9H3M21 15H3" />
            </svg>
          </div>
          <div style={styles.statContent}>
            <div style={{ ...styles.statNumber, color: '#6B7280' }}>{archivedSOPs}</div>
            <div style={styles.statLabel}>Archived</div>
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
          </div>
          <div style={styles.statContent}>
            <div style={{ ...styles.statNumber, color: '#3B82F6' }}>{templateSOPs}</div>
            <div style={styles.statLabel}>Templates</div>
          </div>
        </div>
      </div>

      {/* Department Breakdown - Full Width */}
      {departmentStats.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Departments</h2>
          <div style={styles.departmentGrid}>
            {departmentStats.map((dept, index) => (
              <div key={index} style={styles.departmentCard}>
                <div style={styles.departmentHeader}>
                  <div style={styles.departmentName}>{dept.name}</div>
                  <div style={styles.departmentTotal}>{dept.count} Total</div>
                </div>
                <div style={styles.departmentStats}>
                  <div style={styles.departmentStat}>
                    <span style={styles.departmentStatLabel}>Published</span>
                    <span style={{...styles.departmentStatValue, color: '#10B981'}}>{dept.published}</span>
                  </div>
                  <div style={styles.departmentStat}>
                    <span style={styles.departmentStatLabel}>Drafts</span>
                    <span style={{...styles.departmentStatValue, color: '#F59E0B'}}>{dept.drafts}</span>
                  </div>
                  <div style={styles.departmentStat}>
                    <span style={styles.departmentStatLabel}>Templates</span>
                    <span style={{...styles.departmentStatValue, color: '#3B82F6'}}>{dept.templates}</span>
                  </div>
                </div>
                <div style={styles.departmentBar}>
                  <div
                    style={{
                      ...styles.departmentBarFill,
                      width: `${(dept.count / totalSOPs) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={styles.contentGrid}>
        {/* Recent SOPs */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Recent SOPs</h2>
          {recentSOPs.length === 0 ? (
            <div style={styles.emptyState}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke={theme.colors.textMuted}
                strokeWidth="1.5"
                style={{ marginBottom: '12px' }}
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p style={styles.emptyText}>No SOPs created yet</p>
              <button
                onClick={() => navigate('/sop', { state: { openForm: true } })}
                style={styles.emptyButton}
              >
                Create Your First SOP
              </button>
            </div>
          ) : (
            <div style={styles.recentList}>
              {recentSOPs.map(sop => (
                <div
                  key={sop.id}
                  style={styles.recentItem}
                  onClick={() => navigate('/sop')}
                >
                  <div style={styles.recentItemHeader}>
                    <div style={styles.recentItemTitle}>{sop.title}</div>
                    <div style={styles.recentItemCategory}>{sop.category}</div>
                  </div>
                  <div style={styles.recentItemDescription}>
                    {sop.description}
                  </div>
                  <div style={styles.recentItemFooter}>
                    <span style={styles.recentItemSteps}>
                      {sop.steps.length} {sop.steps.length === 1 ? 'step' : 'steps'}
                    </span>
                    <span style={styles.recentItemDate}>
                      {new Date(sop.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Category Breakdown */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Categories</h2>
          {categoryStats.length === 0 ? (
            <div style={styles.emptyState}>
              <p style={styles.emptyText}>No categories yet</p>
            </div>
          ) : (
            <div style={styles.categoryList}>
              {categoryStats.map((category, index) => (
                <div key={index} style={styles.categoryItem}>
                  <div style={styles.categoryInfo}>
                    <div style={styles.categoryName}>{category.name}</div>
                    <div style={styles.categoryCount}>
                      {category.count} {category.count === 1 ? 'SOP' : 'SOPs'}
                    </div>
                  </div>
                  <div style={styles.categoryBar}>
                    <div
                      style={{
                        ...styles.categoryBarFill,
                        width: `${(category.count / totalSOPs) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Quick Actions</h2>
        <div style={styles.actionsGrid}>
          <button
            onClick={() => navigate('/sop')}
            style={styles.actionCard}
          >
            <div style={styles.actionIcon}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={theme.colors.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <div style={styles.actionTitle}>View All SOPs</div>
            <div style={styles.actionDescription}>
              Browse and manage all procedures
            </div>
          </button>

          <button
            onClick={() => navigate('/sop', { state: { openForm: true } })}
            style={styles.actionCard}
          >
            <div style={styles.actionIcon}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={theme.colors.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <div style={styles.actionTitle}>Create New SOP</div>
            <div style={styles.actionDescription}>
              Add a new standard operating procedure
            </div>
          </button>
        </div>
      </div>
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
  },
  titleMobile: {
    fontSize: '28px',
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
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginBottom: '40px',
  },
  statsGridMobile: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    marginBottom: '24px',
  },
  statCard: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    transition: 'all 0.2s',
  },
  statCardMobile: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    transition: 'all 0.2s',
    textAlign: 'center',
  },
  statIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statContent: {
    flex: 1,
  },
  statNumber: {
    fontSize: '32px',
    fontWeight: '800',
    color: theme.colors.primary,
    marginBottom: '4px',
  },
  statLabel: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  contentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
    gap: '24px',
    marginBottom: '40px',
  },
  contentGridMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '24px',
  },
  section: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '24px',
    marginBottom: '24px',
  },
  sectionMobile: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '16px',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: '20px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 20px',
  },
  emptyText: {
    fontSize: '14px',
    color: theme.colors.textMuted,
    marginBottom: '16px',
  },
  emptyButton: {
    padding: '10px 20px',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  recentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  recentItem: {
    padding: '16px',
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  recentItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  recentItemTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  recentItemCategory: {
    fontSize: '12px',
    fontWeight: '700',
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  recentItemDescription: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
    marginBottom: '12px',
    lineHeight: '1.5',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  recentItemFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '13px',
    color: theme.colors.textMuted,
  },
  recentItemSteps: {
    fontWeight: '600',
  },
  recentItemDate: {},
  categoryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  categoryItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  categoryInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryName: {
    fontSize: '15px',
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  categoryCount: {
    fontSize: '13px',
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  categoryBar: {
    height: '8px',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
  },
  categoryBarFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    transition: 'width 0.3s ease',
  },
  actionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
  },
  actionCard: {
    padding: '24px',
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  actionIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '12px',
  },
  actionTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: '8px',
  },
  actionDescription: {
    fontSize: '13px',
    color: theme.colors.textSecondary,
    lineHeight: '1.5',
  },
  departmentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
  },
  departmentCard: {
    padding: '20px',
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    transition: 'all 0.2s',
  },
  departmentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: `2px solid ${theme.colors.border}`,
  },
  departmentName: {
    fontSize: '18px',
    fontWeight: '700',
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  departmentTotal: {
    fontSize: '14px',
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  departmentStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    marginBottom: '16px',
  },
  departmentStat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  departmentStatLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  departmentStatValue: {
    fontSize: '24px',
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  departmentBar: {
    height: '8px',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
    border: `1px solid ${theme.colors.border}`,
  },
  departmentBarFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    transition: 'width 0.3s ease',
  },
  calendarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  calendarNav: {
    display: 'flex',
    gap: '8px',
  },
  navButton: {
    padding: '8px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.txt.primary,
    transition: 'all 0.2s',
  },
  calendar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '8px',
  },
  dayHeader: {
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: '700',
    color: theme.colors.txt.secondary,
    padding: '12px 0',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  calendarDay: {
    minHeight: '100px',
    padding: '8px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    position: 'relative',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  calendarDayToday: {
    border: `2px solid ${theme.colors.primary}`,
    backgroundColor: theme.colors.bg.secondary,
  },
  dayNumber: {
    fontSize: '14px',
    fontWeight: '600',
    color: theme.colors.txt.primary,
    marginBottom: '4px',
  },
  taskIndicators: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '8px',
  },
  taskDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
  },
  moreTasksIndicator: {
    fontSize: '10px',
    color: theme.colors.txt.secondary,
    fontWeight: '600',
  },
  tasksList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  taskItem: {
    padding: '16px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  taskItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  taskItemTitle: {
    fontSize: '15px',
    fontWeight: '700',
    color: theme.colors.txt.primary,
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: theme.borderRadius.full,
    fontSize: '11px',
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  progressInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '13px',
    color: theme.colors.txt.secondary,
    marginBottom: '8px',
  },
  progressBar: {
    height: '6px',
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    transition: 'width 0.3s ease',
  },
  taskItemFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '13px',
    color: theme.colors.txt.secondary,
  },
  taskDate: {
    fontWeight: '600',
  },
};

export default Dashboard;
