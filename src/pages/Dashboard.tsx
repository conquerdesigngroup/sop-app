import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSOPs } from '../contexts/SOPContext';
import { useAuth } from '../contexts/AuthContext';
import { useTask } from '../contexts/TaskContext';
import { useEvent } from '../contexts/EventContext';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { DashboardSkeleton } from '../components/Skeleton';
import CalendarTaskModal from '../components/CalendarTaskModal';
import EventDetailModal from '../components/EventDetailModal';
import { JobTask, User, CalendarEvent } from '../types';

const Dashboard: React.FC = () => {
  const { sops, loading: sopsLoading } = useSOPs();
  const { isAdmin, currentUser, users } = useAuth();
  const { jobTasks, loading: tasksLoading } = useTask();
  const { events } = useEvent();
  const navigate = useNavigate();
  const { isMobileOrTablet } = useResponsive();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState<JobTask | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [dayActionModal, setDayActionModal] = useState<{ date: Date; x: number; y: number } | null>(null);

  // Show skeleton while loading
  if ((isAdmin && sopsLoading) || (!isAdmin && tasksLoading)) {
    return <DashboardSkeleton isMobile={isMobileOrTablet} />;
  }

  // If not admin, show team member dashboard
  if (!isAdmin && currentUser) {
    return (
      <TeamMemberDashboard
        currentUser={currentUser}
        jobTasks={jobTasks}
        events={events}
        users={users}
        currentMonth={currentMonth}
        setCurrentMonth={setCurrentMonth}
        selectedTask={selectedTask}
        setSelectedTask={setSelectedTask}
        selectedEvent={selectedEvent}
        setSelectedEvent={setSelectedEvent}
        navigate={navigate}
      />
    );
  }

  // Admin dashboard
  return (
    <AdminDashboard
      sops={sops}
      jobTasks={jobTasks}
      events={events}
      users={users}
      currentMonth={currentMonth}
      setCurrentMonth={setCurrentMonth}
      selectedTask={selectedTask}
      setSelectedTask={setSelectedTask}
      selectedEvent={selectedEvent}
      setSelectedEvent={setSelectedEvent}
      dayActionModal={dayActionModal}
      setDayActionModal={setDayActionModal}
      navigate={navigate}
    />
  );
};

// Calendar Day Component with hover effect
const CalendarDayCell: React.FC<{
  day: number;
  isToday: boolean;
  isMobileOrTablet: boolean;
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  isClickable?: boolean;
}> = ({ day, isToday, isMobileOrTablet, children, onClick, isClickable = false }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      style={{
        ...(isMobileOrTablet ? styles.calendarDayMobile : styles.calendarDay),
        ...(isToday ? styles.calendarDayToday : {}),
        ...(isHovered && !isToday ? styles.calendarDayHover : {}),
        ...(isClickable ? { cursor: 'pointer' } : {}),
      }}
    >
      {children}
    </div>
  );
};

// Helper functions
const getUserInitials = (userId: string, users: User[]): string => {
  const user = users.find(u => u.id === userId);
  if (user) {
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  }
  return '??';
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'completed': return theme.colors.status.completed;
    case 'in-progress': return theme.colors.status.inProgress;
    case 'overdue': return theme.colors.status.overdue;
    case 'pending': return theme.colors.status.pending;
    default: return theme.colors.textMuted;
  }
};

// Shared Calendar Component (compact version)
const TaskCalendar: React.FC<{
  tasks: JobTask[];
  events: CalendarEvent[];
  users: User[];
  currentMonth: Date;
  setCurrentMonth: (date: Date) => void;
  onTaskClick: (task: JobTask) => void;
  onEventClick: (event: CalendarEvent) => void;
  showAllUsers?: boolean;
  onDayClick?: (date: Date, e: React.MouseEvent) => void;
}> = ({ tasks, events, users, currentMonth, setCurrentMonth, onTaskClick, onEventClick, showAllUsers = false, onDayClick }) => {
  const { isMobileOrTablet } = useResponsive();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return {
      daysInMonth: lastDay.getDate(),
      startingDayOfWeek: firstDay.getDay(),
      year,
      month
    };
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentMonth);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const getTasksForDate = (day: number) => {
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    return tasks.filter(task => {
      const taskDate = new Date(task.scheduledDate);
      taskDate.setHours(0, 0, 0, 0);
      return taskDate.getTime() === date.getTime();
    });
  };

  const getEventsForDate = (day: number) => {
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    return events.filter(event => {
      const eventStartDate = new Date(event.startDate);
      eventStartDate.setHours(0, 0, 0, 0);
      const eventEndDate = event.endDate ? new Date(event.endDate) : eventStartDate;
      eventEndDate.setHours(0, 0, 0, 0);
      return date >= eventStartDate && date <= eventEndDate;
    });
  };

  return (
    <div style={styles.calendarSection}>
      <div style={styles.calendarHeader}>
        <h3 style={styles.calendarTitle}>{monthNames[month]} {year}</h3>
        <div style={styles.calendarNav}>
          <button onClick={() => setCurrentMonth(new Date())} style={styles.todayBtn}>Today</button>
          <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} style={styles.navBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} style={styles.navBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      <div style={styles.calendarGrid}>
        {(isMobileOrTablet ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']).map((day, idx) => (
          <div key={idx} style={isMobileOrTablet ? styles.dayHeaderMobile : styles.dayHeader}>{day}</div>
        ))}

        {Array.from({ length: startingDayOfWeek }).map((_, index) => (
          <div key={`empty-${index}`} style={isMobileOrTablet ? styles.calendarDayEmptyMobile : styles.calendarDayEmpty} />
        ))}

        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1;
          const tasksForDay = getTasksForDate(day);
          const eventsForDay = getEventsForDate(day);
          const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
          const totalItems = tasksForDay.length + eventsForDay.length;
          const maxVisible = isMobileOrTablet ? 2 : 3;
          const clickedDate = new Date(year, month, day);

          return (
            <CalendarDayCell
              key={day}
              day={day}
              isToday={isToday}
              isMobileOrTablet={isMobileOrTablet}
              onClick={onDayClick ? (e) => onDayClick(clickedDate, e) : undefined}
              isClickable={!!onDayClick}
            >
              <div style={{
                ...(isMobileOrTablet ? styles.dayNumberMobile : styles.dayNumber),
                ...(isToday ? (isMobileOrTablet ? styles.dayNumberTodayMobile : styles.dayNumberToday) : {}),
              }}>
                {day}
              </div>

              {totalItems > 0 && (
                <div style={isMobileOrTablet ? styles.itemsListMobile : styles.itemsList}>
                  {eventsForDay.slice(0, maxVisible).map(event => (
                    <div
                      key={event.id}
                      style={{ ...(isMobileOrTablet ? styles.eventItemMobile : styles.eventItem), backgroundColor: event.color }}
                      onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                    >
                      <span style={isMobileOrTablet ? styles.eventTitleMobile : styles.eventTitle}>{event.title}</span>
                    </div>
                  ))}

                  {tasksForDay.slice(0, Math.max(0, maxVisible - eventsForDay.length)).map(task => (
                    <div
                      key={task.id}
                      style={{ ...(isMobileOrTablet ? styles.taskItemMobile : styles.taskItem), borderLeftColor: getStatusColor(task.status) }}
                      onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
                    >
                      {showAllUsers && task.assignedTo.length > 0 && (
                        <span style={isMobileOrTablet ? styles.taskInitialsMobile : styles.taskInitials}>
                          {getUserInitials(task.assignedTo[0], users)}
                        </span>
                      )}
                      <span style={isMobileOrTablet ? styles.taskTitleMobile : styles.taskTitle}>{task.title}</span>
                    </div>
                  ))}

                  {totalItems > maxVisible && (
                    <div style={isMobileOrTablet ? styles.moreIndicatorMobile : styles.moreIndicator}>+{totalItems - maxVisible}</div>
                  )}
                </div>
              )}
            </CalendarDayCell>
          );
        })}
      </div>
    </div>
  );
};

// Team Member Dashboard
const TeamMemberDashboard: React.FC<{
  currentUser: User;
  jobTasks: JobTask[];
  events: CalendarEvent[];
  users: User[];
  currentMonth: Date;
  setCurrentMonth: (date: Date) => void;
  selectedTask: JobTask | null;
  setSelectedTask: (task: JobTask | null) => void;
  selectedEvent: CalendarEvent | null;
  setSelectedEvent: (event: CalendarEvent | null) => void;
  navigate: ReturnType<typeof useNavigate>;
}> = ({ currentUser, jobTasks, events, users, currentMonth, setCurrentMonth, selectedTask, setSelectedTask, selectedEvent, setSelectedEvent, navigate }) => {
  const { isMobileOrTablet } = useResponsive();
  const myTasks = jobTasks.filter(task => task.assignedTo.includes(currentUser.id));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Stats
  const pendingTasks = myTasks.filter(t => t.status === 'pending').length;
  const inProgressTasks = myTasks.filter(t => t.status === 'in-progress').length;
  const completedTasks = myTasks.filter(t => t.status === 'completed').length;
  const overdueTasks = myTasks.filter(task => {
    const taskDate = new Date(task.scheduledDate);
    taskDate.setHours(0, 0, 0, 0);
    return taskDate < today && task.status !== 'completed';
  });

  // Today's tasks
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

  return (
    <div style={isMobileOrTablet ? styles.containerMobile : styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={isMobileOrTablet ? styles.titleMobile : styles.title}>Welcome, {currentUser.firstName}</h1>
      </div>

      {/* Stats Row - Compact */}
      <div style={isMobileOrTablet ? styles.statsRowMobile : styles.statsRow}>
        <div style={styles.statItem} onClick={() => navigate('/my-tasks', { state: { filterStatus: 'pending' } })}>
          <span style={{ ...styles.statNumber, color: theme.colors.status.pending }}>{pendingTasks}</span>
          <span style={styles.statLabel}>Pending</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statItem} onClick={() => navigate('/my-tasks', { state: { filterStatus: 'in-progress' } })}>
          <span style={{ ...styles.statNumber, color: theme.colors.status.inProgress }}>{inProgressTasks}</span>
          <span style={styles.statLabel}>In Progress</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statItem} onClick={() => navigate('/my-tasks', { state: { filterStatus: 'completed' } })}>
          <span style={{ ...styles.statNumber, color: theme.colors.status.completed }}>{completedTasks}</span>
          <span style={styles.statLabel}>Completed</span>
        </div>
        {overdueTasks.length > 0 && (
          <>
            <div style={styles.statDivider} />
            <div style={styles.statItem} onClick={() => navigate('/my-tasks')}>
              <span style={{ ...styles.statNumber, color: theme.colors.status.overdue }}>{overdueTasks.length}</span>
              <span style={styles.statLabel}>Overdue</span>
            </div>
          </>
        )}
      </div>

      {/* Task Lists */}
      <div style={isMobileOrTablet ? styles.contentGridMobile : styles.contentGrid}>
        {/* Today's Tasks */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Today ({todayTasks.length})</h3>
            <button onClick={() => navigate('/my-tasks')} style={styles.viewAllBtn}>View All</button>
          </div>
          {todayTasks.length === 0 ? (
            <p style={styles.emptyText}>No tasks due today</p>
          ) : (
            <div style={styles.tasksList}>
              {todayTasks.slice(0, 4).map(task => (
                <div key={task.id} style={styles.taskCard} onClick={() => setSelectedTask(task)}>
                  <div style={styles.taskCardHeader}>
                    <span style={styles.taskCardTitle}>{task.title}</span>
                    <span style={{ ...styles.taskCardStatus, backgroundColor: getStatusColor(task.status) }}>
                      {task.status.replace('-', ' ')}
                    </span>
                  </div>
                  <div style={styles.taskCardProgress}>
                    <div style={styles.progressBar}>
                      <div style={{ ...styles.progressFill, width: `${task.progressPercentage}%` }} />
                    </div>
                    <span style={styles.progressText}>{task.progressPercentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Tasks */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Upcoming ({upcomingTasks.length})</h3>
          </div>
          {upcomingTasks.length === 0 ? (
            <p style={styles.emptyText}>No upcoming tasks</p>
          ) : (
            <div style={styles.tasksList}>
              {upcomingTasks.slice(0, 4).map(task => (
                <div key={task.id} style={styles.taskCard} onClick={() => setSelectedTask(task)}>
                  <div style={styles.taskCardHeader}>
                    <span style={styles.taskCardTitle}>{task.title}</span>
                    <span style={styles.taskCardDate}>
                      {new Date(task.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Overdue Tasks */}
      {overdueTasks.length > 0 && (
        <div style={{ ...styles.section, borderColor: theme.colors.status.overdue }}>
          <div style={styles.sectionHeader}>
            <h3 style={{ ...styles.sectionTitle, color: theme.colors.status.overdue }}>Overdue ({overdueTasks.length})</h3>
          </div>
          <div style={styles.tasksList}>
            {overdueTasks.slice(0, 3).map(task => (
              <div key={task.id} style={styles.taskCard} onClick={() => setSelectedTask(task)}>
                <div style={styles.taskCardHeader}>
                  <span style={styles.taskCardTitle}>{task.title}</span>
                  <span style={{ ...styles.taskCardDate, color: theme.colors.status.overdue }}>
                    Due: {new Date(task.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar */}
      <TaskCalendar
        tasks={myTasks}
        events={events}
        users={users}
        currentMonth={currentMonth}
        setCurrentMonth={setCurrentMonth}
        onTaskClick={setSelectedTask}
        onEventClick={setSelectedEvent}
        showAllUsers={false}
      />

      {/* Modals */}
      <CalendarTaskModal isOpen={selectedTask !== null} onClose={() => setSelectedTask(null)} task={selectedTask} users={users} />
      <EventDetailModal isOpen={selectedEvent !== null} onClose={() => setSelectedEvent(null)} event={selectedEvent} users={users} onEdit={() => {}} onDelete={() => {}} />
    </div>
  );
};

// Admin Dashboard
const AdminDashboard: React.FC<{
  sops: any[];
  jobTasks: JobTask[];
  events: CalendarEvent[];
  users: User[];
  currentMonth: Date;
  setCurrentMonth: (date: Date) => void;
  selectedTask: JobTask | null;
  setSelectedTask: (task: JobTask | null) => void;
  selectedEvent: CalendarEvent | null;
  setSelectedEvent: (event: CalendarEvent | null) => void;
  dayActionModal: { date: Date; x: number; y: number } | null;
  setDayActionModal: (modal: { date: Date; x: number; y: number } | null) => void;
  navigate: ReturnType<typeof useNavigate>;
}> = ({ sops, jobTasks, events, users, currentMonth, setCurrentMonth, selectedTask, setSelectedTask, selectedEvent, setSelectedEvent, dayActionModal, setDayActionModal, navigate }) => {
  const { isMobileOrTablet } = useResponsive();

  // SOP Stats
  const publishedSOPs = sops.filter(s => s.status === 'published' && !s.isTemplate).length;
  const draftSOPs = sops.filter(s => s.status === 'draft').length;
  const templateSOPs = sops.filter(s => s.isTemplate).length;

  // Department stats
  const departments = Array.from(new Set(sops.map(sop => sop.department))).filter(d => d);
  const departmentStats = departments.map(department => ({
    name: department,
    count: sops.filter(sop => sop.department === department).length,
  })).sort((a, b) => b.count - a.count);

  // Category stats
  const categories = Array.from(new Set(sops.map(sop => sop.category)));
  const categoryStats = categories.map(category => ({
    name: category,
    count: sops.filter(sop => sop.category === category).length,
  })).sort((a, b) => b.count - a.count);

  // Recent SOPs
  const recentSOPs = [...sops]
    .filter(s => !s.isTemplate)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  // Task stats
  const activeTasks = jobTasks.filter(t => t.status !== 'archived' && t.status !== 'draft');
  const pendingTasks = activeTasks.filter(t => t.status === 'pending').length;
  const inProgressTasks = activeTasks.filter(t => t.status === 'in-progress').length;
  const completedTasks = activeTasks.filter(t => t.status === 'completed').length;

  // Calculate overdue tasks
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueTasks = activeTasks.filter(t => {
    const taskDate = new Date(t.scheduledDate);
    taskDate.setHours(0, 0, 0, 0);
    return taskDate < today && t.status !== 'completed';
  }).length;

  return (
    <div style={isMobileOrTablet ? styles.containerMobile : styles.container}>
      {/* Header */}
      <div style={styles.headerRow}>
        <h1 style={isMobileOrTablet ? styles.titleMobile : styles.title}>Dashboard</h1>
        <div style={styles.headerButtons}>
          <button onClick={() => navigate('/job-tasks', { state: { openCreateModal: true } })} style={styles.createBtnSecondary}>
            + New Task
          </button>
          <button onClick={() => navigate('/sop', { state: { openForm: true } })} style={styles.createBtn}>
            + New SOP
          </button>
        </div>
      </div>

      {/* Task Stats Row */}
      <div style={isMobileOrTablet ? styles.statsRowMobile : styles.statsRow}>
        <div style={styles.statItem} onClick={() => navigate('/job-tasks', { state: { filterStatus: 'pending' } })}>
          <span style={{ ...styles.statNumber, color: theme.colors.status.pending }}>{pendingTasks}</span>
          <span style={styles.statLabel}>Pending</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statItem} onClick={() => navigate('/job-tasks', { state: { filterStatus: 'in-progress' } })}>
          <span style={{ ...styles.statNumber, color: theme.colors.status.inProgress }}>{inProgressTasks}</span>
          <span style={styles.statLabel}>In Progress</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statItem} onClick={() => navigate('/job-tasks', { state: { filterStatus: 'completed' } })}>
          <span style={{ ...styles.statNumber, color: theme.colors.status.completed }}>{completedTasks}</span>
          <span style={styles.statLabel}>Completed</span>
        </div>
        {overdueTasks > 0 && (
          <>
            <div style={styles.statDivider} />
            <div style={styles.statItem} onClick={() => navigate('/job-tasks', { state: { filterStatus: 'overdue' } })}>
              <span style={{ ...styles.statNumber, color: theme.colors.status.error }}>{overdueTasks}</span>
              <span style={styles.statLabel}>Overdue</span>
            </div>
          </>
        )}
      </div>

      {/* Departments - Compact pills */}
      {departmentStats.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Departments</h3>
          </div>
          <div style={styles.pillsGrid}>
            {departmentStats.map((dept, index) => (
              <div
                key={index}
                style={styles.departmentPill}
                onClick={() => navigate('/sop', { state: { filterDepartment: dept.name } })}
              >
                <span style={styles.pillName}>{dept.name}</span>
                <span style={styles.pillCount}>{dept.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content Grid: Recent SOPs + Categories */}
      <div style={isMobileOrTablet ? styles.contentGridMobile : styles.contentGrid}>
        {/* Recent SOPs */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Recent SOPs</h3>
            <button onClick={() => navigate('/sop')} style={styles.viewAllBtn}>View All</button>
          </div>
          {recentSOPs.length === 0 ? (
            <p style={styles.emptyText}>No SOPs created yet</p>
          ) : (
            <div style={styles.recentList}>
              {recentSOPs.map(sop => (
                <div key={sop.id} style={styles.recentItem} onClick={() => navigate('/sop')}>
                  <div style={styles.recentItemHeader}>
                    <span style={styles.recentItemTitle}>{sop.title}</span>
                    <span style={styles.recentItemCategory}>{sop.category}</span>
                  </div>
                  <div style={styles.recentItemMeta}>
                    <span>{sop.steps.length} steps</span>
                    <span>{new Date(sop.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Categories */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Categories</h3>
          </div>
          {categoryStats.length === 0 ? (
            <p style={styles.emptyText}>No categories yet</p>
          ) : (
            <div style={styles.categoryList}>
              {categoryStats.slice(0, 6).map((category, index) => (
                <div
                  key={index}
                  style={styles.categoryItem}
                  onClick={() => navigate('/sop', { state: { expandCategory: category.name } })}
                >
                  <span style={styles.categoryName}>{category.name}</span>
                  <span style={styles.categoryCount}>{category.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Calendar */}
      <TaskCalendar
        tasks={activeTasks}
        events={events}
        users={users}
        currentMonth={currentMonth}
        setCurrentMonth={setCurrentMonth}
        onTaskClick={setSelectedTask}
        onEventClick={setSelectedEvent}
        showAllUsers={true}
        onDayClick={(date, e) => {
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          setDayActionModal({
            date,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          });
        }}
      />

      {/* Day Action Modal */}
      {dayActionModal && (
        <DayActionModal
          date={dayActionModal.date}
          position={{ x: dayActionModal.x, y: dayActionModal.y }}
          onClose={() => setDayActionModal(null)}
          onAddEvent={() => {
            const dateStr = `${dayActionModal.date.getFullYear()}-${String(dayActionModal.date.getMonth() + 1).padStart(2, '0')}-${String(dayActionModal.date.getDate()).padStart(2, '0')}`;
            setDayActionModal(null);
            navigate('/calendar', { state: { openEventForm: true, selectedDate: dateStr } });
          }}
          onAddJobTask={() => {
            const dateStr = `${dayActionModal.date.getFullYear()}-${String(dayActionModal.date.getMonth() + 1).padStart(2, '0')}-${String(dayActionModal.date.getDate()).padStart(2, '0')}`;
            setDayActionModal(null);
            navigate('/job-tasks', { state: { openCreateModal: true, selectedDate: dateStr } });
          }}
        />
      )}

      {/* Modals */}
      <CalendarTaskModal isOpen={selectedTask !== null} onClose={() => setSelectedTask(null)} task={selectedTask} users={users} />
      <EventDetailModal isOpen={selectedEvent !== null} onClose={() => setSelectedEvent(null)} event={selectedEvent} users={users} onEdit={() => {}} onDelete={() => {}} />
    </div>
  );
};

// Day Action Modal - popup when admin clicks on a calendar day
const DayActionModal: React.FC<{
  date: Date;
  position: { x: number; y: number };
  onClose: () => void;
  onAddEvent: () => void;
  onAddJobTask: () => void;
}> = ({ date, position, onClose, onAddEvent, onAddJobTask }) => {
  const modalRef = React.useRef<HTMLDivElement>(null);

  // Close on click outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Calculate position to keep modal in viewport
  const modalStyle: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(position.y, window.innerHeight - 200),
    left: Math.min(Math.max(position.x - 120, 10), window.innerWidth - 250),
    zIndex: 1000,
  };

  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <>
      {/* Backdrop */}
      <div style={dayActionStyles.backdrop} />

      {/* Modal */}
      <div ref={modalRef} style={{ ...dayActionStyles.modal, ...modalStyle }}>
        <div style={dayActionStyles.header}>
          <span style={dayActionStyles.dateLabel}>{formattedDate}</span>
          <button onClick={onClose} style={dayActionStyles.closeBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={dayActionStyles.buttonGroup}>
          <button onClick={onAddEvent} style={dayActionStyles.actionBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>Add Event</span>
          </button>

          <button onClick={onAddJobTask} style={{ ...dayActionStyles.actionBtn, ...dayActionStyles.actionBtnPrimary }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <span>Add Job Task</span>
          </button>
        </div>
      </div>
    </>
  );
};

const dayActionStyles: { [key: string]: React.CSSProperties } = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 999,
  },
  modal: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '12px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    minWidth: '200px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    paddingBottom: '10px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  dateLabel: {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  closeBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: theme.colors.textMuted,
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '12px 16px',
    fontSize: '14px',
    fontWeight: 600,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textPrimary,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  actionBtnPrimary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    color: '#FFFFFF',
  },
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: theme.pageLayout.containerPadding.desktop,
    maxWidth: theme.pageLayout.maxWidth,
    margin: '0 auto',
  },
  containerMobile: {
    padding: theme.pageLayout.containerPadding.mobile,
  },
  header: {
    marginBottom: theme.spacing.lg,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.textPrimary,
    margin: 0,
  },
  titleMobile: {
    ...theme.typography.h1Mobile,
    color: theme.colors.textPrimary,
    margin: 0,
  },
  headerButtons: {
    display: 'flex',
    gap: '10px',
  },
  createBtn: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 700,
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  createBtnSecondary: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 700,
    backgroundColor: theme.colors.bg.tertiary,
    color: theme.colors.textPrimary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },

  // Stats Row - Compact inline
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    marginBottom: theme.spacing.lg,
    padding: '14px 20px',
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
  },
  statsRowMobile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    flexWrap: 'wrap' as const,
    gap: '12px',
    marginBottom: theme.spacing.md,
    padding: '12px',
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    cursor: 'pointer',
    padding: '4px 12px',
    borderRadius: theme.borderRadius.md,
    transition: 'background-color 0.2s',
  },
  statNumber: {
    fontSize: '26px',
    fontWeight: 800,
    lineHeight: 1,
  },
  statLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginTop: '2px',
  },
  statDivider: {
    width: '1px',
    height: '32px',
    backgroundColor: theme.colors.border,
  },

  // Sections
  section: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '16px',
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  sectionTitle: {
    fontSize: '17px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    margin: 0,
  },
  viewAllBtn: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.primary,
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
  },
  emptyText: {
    fontSize: '15px',
    color: theme.colors.textMuted,
    textAlign: 'center' as const,
    padding: '20px',
  },

  // Content Grid
  contentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
    gap: theme.spacing.lg,
  },
  contentGridMobile: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: theme.spacing.md,
  },

  // Department Pills
  pillsGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  departmentPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.full,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  pillName: {
    fontSize: '15px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  pillCount: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#FFFFFF',
    backgroundColor: theme.colors.primary,
    padding: '2px 8px',
    borderRadius: theme.borderRadius.full,
  },

  // Recent List
  recentList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  recentItem: {
    padding: '10px 12px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  recentItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  recentItemTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  recentItemCategory: {
    fontSize: '12px',
    fontWeight: 700,
    color: theme.colors.primary,
    textTransform: 'uppercase' as const,
  },
  recentItemMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: theme.colors.textMuted,
  },

  // Category List
  categoryList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  categoryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  categoryName: {
    fontSize: '15px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  categoryCount: {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.colors.textSecondary,
  },

  // Task Cards
  tasksList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  taskCard: {
    padding: '10px 12px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  taskCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  taskCardTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  taskCardStatus: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#FFFFFF',
    padding: '3px 8px',
    borderRadius: theme.borderRadius.full,
    textTransform: 'uppercase' as const,
  },
  taskCardDate: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textMuted,
    whiteSpace: 'nowrap' as const,
  },
  taskCardProgress: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '8px',
  },
  progressBar: {
    flex: 1,
    height: '4px',
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
  progressText: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textMuted,
    minWidth: '32px',
    textAlign: 'right' as const,
  },

  // Calendar
  calendarSection: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  calendarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  calendarTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    margin: 0,
  },
  calendarNav: {
    display: 'flex',
    gap: '6px',
  },
  todayBtn: {
    padding: '5px 10px',
    fontSize: '14px',
    fontWeight: 600,
    backgroundColor: 'transparent',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
  },
  navBtn: {
    padding: '5px',
    backgroundColor: 'transparent',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
  },
  dayHeader: {
    textAlign: 'center' as const,
    fontSize: '14px',
    fontWeight: 700,
    color: theme.colors.textMuted,
    padding: '10px 4px',
    textTransform: 'uppercase' as const,
    backgroundColor: theme.colors.bg.tertiary,
    borderBottom: `1px solid ${theme.colors.border}`,
    borderRight: `1px solid ${theme.colors.border}`,
  },
  dayHeaderMobile: {
    textAlign: 'center' as const,
    fontSize: '13px',
    fontWeight: 700,
    color: theme.colors.textMuted,
    padding: '8px 2px',
    textTransform: 'uppercase' as const,
    backgroundColor: theme.colors.bg.tertiary,
    borderBottom: `1px solid ${theme.colors.border}`,
    borderRight: `1px solid ${theme.colors.border}`,
  },
  calendarDay: {
    height: '90px',
    padding: '4px',
    backgroundColor: theme.colors.bg.secondary,
    borderRight: `1px solid ${theme.colors.border}`,
    borderBottom: `1px solid ${theme.colors.border}`,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  calendarDayMobile: {
    height: '65px',
    padding: '3px',
    backgroundColor: theme.colors.bg.secondary,
    borderRight: `1px solid ${theme.colors.border}`,
    borderBottom: `1px solid ${theme.colors.border}`,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  calendarDayEmpty: {
    height: '90px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRight: `1px solid ${theme.colors.border}`,
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  calendarDayEmptyMobile: {
    height: '65px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRight: `1px solid ${theme.colors.border}`,
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  calendarDayToday: {
    backgroundColor: theme.colors.bg.primary,
  },
  calendarDayHover: {
    backgroundColor: '#2a2a2a',
    cursor: 'pointer',
  },
  dayNumber: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
  },
  dayNumberMobile: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
  },
  dayNumberToday: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    borderRadius: '50%',
    fontSize: '15px',
  },
  dayNumberTodayMobile: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    borderRadius: '50%',
    fontSize: '13px',
  },
  itemsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    flex: 1,
    overflow: 'hidden',
    marginTop: '2px',
  },
  itemsListMobile: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1px',
    flex: 1,
    overflow: 'hidden',
    marginTop: '1px',
  },
  eventItem: {
    padding: '2px 4px',
    borderRadius: '2px',
    overflow: 'hidden',
    cursor: 'pointer',
  },
  eventItemMobile: {
    padding: '1px 3px',
    borderRadius: '2px',
    overflow: 'hidden',
    cursor: 'pointer',
  },
  eventTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#FFFFFF',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
  },
  eventTitleMobile: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#FFFFFF',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
  },
  taskItem: {
    padding: '2px 4px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: '2px',
    borderLeft: '2px solid',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    cursor: 'pointer',
  },
  taskItemMobile: {
    padding: '1px 3px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: '2px',
    borderLeft: '2px solid',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    cursor: 'pointer',
  },
  taskInitials: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#FFFFFF',
    backgroundColor: theme.colors.primary,
    padding: '2px 4px',
    borderRadius: '2px',
    flexShrink: 0,
  },
  taskInitialsMobile: {
    fontSize: '9px',
    fontWeight: 700,
    color: '#FFFFFF',
    backgroundColor: theme.colors.primary,
    padding: '1px 3px',
    borderRadius: '2px',
    flexShrink: 0,
  },
  taskTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  taskTitleMobile: {
    fontSize: '11px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  moreIndicator: {
    fontSize: '12px',
    color: theme.colors.txt.secondary,
    fontWeight: 600,
  },
  moreIndicatorMobile: {
    fontSize: '10px',
    color: theme.colors.txt.secondary,
    fontWeight: 600,
  },
};

export default Dashboard;
