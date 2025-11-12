import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { theme } from '../theme';
import { User, UserRole } from '../types';
import { DEFAULT_DEPARTMENTS, USER_ROLES, SUCCESS_MESSAGES, ERROR_MESSAGES } from '../constants';

const TeamManagementPage: React.FC = () => {
  const { users, addUser, updateUser, deleteUser, currentUser } = useAuth();
  const { success, error } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form state for new/edit user
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'team' as UserRole,
    department: '',
    isActive: true,
  });

  // Get active users (exclude soft-deleted)
  const activeUsers = users.filter(u => u.isActive !== false);

  // Filter users
  const filteredUsers = activeUsers.filter(user => {
    const matchesSearch =
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.lastName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = filterRole === 'all' || user.role === filterRole;
    const matchesDepartment = filterDepartment === 'all' || user.department === filterDepartment;

    return matchesSearch && matchesRole && matchesDepartment;
  });

  // Get unique departments from users
  const departments = Array.from(new Set([...DEFAULT_DEPARTMENTS, ...users.map(u => u.department)]));

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      role: 'team',
      department: '',
      isActive: true,
    });
    setEditingUser(null);
  };

  const handleOpenAddUser = () => {
    resetForm();
    setShowAddUserModal(true);
  };

  const handleOpenEditUser = (user: User) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '', // Don't show existing password
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      department: user.department,
      isActive: user.isActive ?? true,
    });
    setShowAddUserModal(true);
  };

  const handleCloseModal = () => {
    setShowAddUserModal(false);
    resetForm();
  };

  const validateForm = (): boolean => {
    if (!formData.email || !formData.firstName || !formData.lastName || !formData.department) {
      error(ERROR_MESSAGES.REQUIRED_FIELD);
      return false;
    }

    if (!formData.email.includes('@')) {
      error(ERROR_MESSAGES.INVALID_EMAIL);
      return false;
    }

    if (!editingUser && formData.password.length < 8) {
      error(ERROR_MESSAGES.INVALID_PASSWORD);
      return false;
    }

    // Check if email already exists (for new users or different user)
    const emailExists = users.find(
      u => u.email.toLowerCase() === formData.email.toLowerCase() && u.id !== editingUser?.id
    );
    if (emailExists) {
      error('Email already exists');
      return false;
    }

    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    if (editingUser) {
      // Update existing user
      const updateData: Partial<User> = {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        department: formData.department,
        isActive: formData.isActive,
      };

      // Only update password if provided
      if (formData.password) {
        updateData.password = formData.password;
      }

      updateUser(editingUser.id, updateData);
      success('User updated successfully');
    } else {
      // Add new user
      addUser({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        department: formData.department,
        isActive: true,
        invitedBy: currentUser?.id,
        notificationPreferences: {
          pushEnabled: true,
          emailEnabled: true,
          calendarSyncEnabled: false,
          taskReminders: true,
          overdueAlerts: true,
        },
      });
      success('User created successfully');
    }

    handleCloseModal();
  };

  const handleDeactivateUser = (user: User) => {
    if (user.id === currentUser?.id) {
      error('You cannot deactivate your own account');
      return;
    }

    if (window.confirm(`Are you sure you want to deactivate ${user.firstName} ${user.lastName}?`)) {
      updateUser(user.id, { isActive: false });
      success('User deactivated successfully');
    }
  };

  const handleActivateUser = (user: User) => {
    updateUser(user.id, { isActive: true });
    success('User activated successfully');
  };

  const handleDeleteUser = (user: User) => {
    if (user.id === currentUser?.id) {
      error('You cannot delete your own account');
      return;
    }

    if (window.confirm(`Are you sure you want to permanently delete ${user.firstName} ${user.lastName}? This action cannot be undone.`)) {
      deleteUser(user.id);
      success('User deleted successfully');
    }
  };

  const getRoleBadgeColor = (role: UserRole) => {
    return role === 'admin' ? '#8B5CF6' : '#3B82F6';
  };

  const getStatusBadgeColor = (isActive: boolean) => {
    return isActive ? '#10B981' : '#6B7280';
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Team Management</h1>
          <p style={styles.subtitle}>Manage your team members and their permissions</p>
        </div>
        <button onClick={handleOpenAddUser} style={styles.addButton}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
          Add Team Member
        </button>
      </div>

      {/* Filters */}
      <div style={styles.filtersCard}>
        <div style={styles.searchContainer}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2" style={styles.searchIcon}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>Role:</label>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as UserRole | 'all')}
            style={styles.filterSelect}
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="team">Team Member</option>
          </select>
        </div>

        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>Department:</label>
          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="all">All Departments</option>
            {departments.map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{activeUsers.length}</div>
          <div style={styles.statLabel}>Total Members</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{activeUsers.filter(u => u.role === 'admin').length}</div>
          <div style={styles.statLabel}>Admins</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{activeUsers.filter(u => u.role === 'team').length}</div>
          <div style={styles.statLabel}>Team Members</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{departments.length}</div>
          <div style={styles.statLabel}>Departments</div>
        </div>
      </div>

      {/* Users Table */}
      <div style={styles.tableCard}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>User</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Role</th>
              <th style={styles.th}>Department</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} style={styles.emptyState}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <div style={styles.emptyText}>No team members found</div>
                </td>
              </tr>
            ) : (
              filteredUsers.map(user => (
                <tr key={user.id} style={styles.tableRow}>
                  <td style={styles.td}>
                    <div style={styles.userInfo}>
                      <div style={styles.avatar}>
                        {user.firstName[0]}{user.lastName[0]}
                      </div>
                      <div>
                        <div style={styles.userName}>
                          {user.firstName} {user.lastName}
                          {user.id === currentUser?.id && (
                            <span style={styles.youBadge}>(You)</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.email}>{user.email}</span>
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.badge,
                      backgroundColor: getRoleBadgeColor(user.role) + '20',
                      color: getRoleBadgeColor(user.role),
                    }}>
                      {user.role === 'admin' ? 'Admin' : 'Team Member'}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.department}>{user.department}</span>
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.badge,
                      backgroundColor: getStatusBadgeColor(user.isActive ?? true) + '20',
                      color: getStatusBadgeColor(user.isActive ?? true),
                    }}>
                      {user.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.actionButtons}>
                      <button
                        onClick={() => handleOpenEditUser(user)}
                        style={styles.iconButton}
                        title="Edit user"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      {user.id !== currentUser?.id && (
                        <>
                          {user.isActive !== false ? (
                            <button
                              onClick={() => handleDeactivateUser(user)}
                              style={{...styles.iconButton, ...styles.warningButton}}
                              title="Deactivate user"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                              </svg>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleActivateUser(user)}
                              style={{...styles.iconButton, ...styles.successButton}}
                              title="Activate user"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteUser(user)}
                            style={{...styles.iconButton, ...styles.dangerButton}}
                            title="Delete user"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit User Modal */}
      {showAddUserModal && (
        <div style={styles.modalOverlay} onClick={handleCloseModal}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>
                {editingUser ? 'Edit Team Member' : 'Add New Team Member'}
              </h2>
              <button onClick={handleCloseModal} style={styles.closeButton}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>
                    First Name <span style={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    style={styles.input}
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>
                    Last Name <span style={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    style={styles.input}
                    required
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Email <span style={styles.required}>*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Password {editingUser ? '(leave blank to keep current)' : <span style={styles.required}>*</span>}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  style={styles.input}
                  required={!editingUser}
                  placeholder={editingUser ? 'Enter new password or leave blank' : 'Minimum 8 characters'}
                />
              </div>

              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>
                    Role <span style={styles.required}>*</span>
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    style={styles.input}
                    required
                  >
                    <option value="team">Team Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>
                    Department <span style={styles.required}>*</span>
                  </label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    style={styles.input}
                    required
                  >
                    <option value="">Select Department</option>
                    {departments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              </div>

              {editingUser && (
                <div style={styles.formGroup}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      style={styles.checkbox}
                    />
                    <span>Active User</span>
                  </label>
                </div>
              )}

              <div style={styles.modalFooter}>
                <button type="button" onClick={handleCloseModal} style={styles.cancelButton}>
                  Cancel
                </button>
                <button type="submit" style={styles.submitButton}>
                  {editingUser ? 'Save Changes' : 'Add Team Member'}
                </button>
              </div>
            </form>
          </div>
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
  },
  title: {
    fontSize: '32px',
    fontWeight: '800',
    color: theme.colors.textPrimary,
    margin: 0,
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '16px',
    color: theme.colors.textSecondary,
    margin: 0,
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
  },
  filtersCard: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '24px',
    marginBottom: '24px',
    display: 'flex',
    gap: '16px',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  searchContainer: {
    position: 'relative',
    flex: 1,
    minWidth: '300px',
  },
  searchIcon: {
    position: 'absolute',
    left: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
  },
  searchInput: {
    width: '100%',
    padding: '12px 16px 12px 48px',
    fontSize: '15px',
    backgroundColor: theme.colors.inputBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textPrimary,
    outline: 'none',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  filterLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  filterSelect: {
    padding: '12px 16px',
    fontSize: '15px',
    backgroundColor: theme.colors.inputBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textPrimary,
    outline: 'none',
    minWidth: '180px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  statCard: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '24px',
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
    fontWeight: '600',
  },
  tableCard: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeader: {
    backgroundColor: theme.colors.background,
  },
  th: {
    padding: '16px',
    textAlign: 'left',
    fontSize: '13px',
    fontWeight: '700',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  tableRow: {
    borderTop: `1px solid ${theme.colors.border}`,
    transition: 'background-color 0.2s',
  },
  td: {
    padding: '16px',
    fontSize: '14px',
    color: theme.colors.textPrimary,
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: '700',
  },
  userName: {
    fontWeight: '600',
    color: theme.colors.textPrimary,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  youBadge: {
    fontSize: '12px',
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  email: {
    color: theme.colors.textSecondary,
  },
  department: {
    color: theme.colors.textPrimary,
  },
  badge: {
    padding: '4px 12px',
    borderRadius: theme.borderRadius.full,
    fontSize: '12px',
    fontWeight: '600',
    display: 'inline-block',
  },
  actionButtons: {
    display: 'flex',
    gap: '8px',
  },
  iconButton: {
    padding: '8px',
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  warningButton: {
    borderColor: '#F59E0B',
    color: '#F59E0B',
  },
  successButton: {
    borderColor: '#10B981',
    color: '#10B981',
  },
  dangerButton: {
    borderColor: theme.colors.error,
    color: theme.colors.error,
  },
  emptyState: {
    padding: '60px 20px',
    textAlign: 'center',
  },
  emptyText: {
    marginTop: '16px',
    fontSize: '16px',
    color: theme.colors.textSecondary,
  },
  // Modal styles
  modalOverlay: {
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
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    border: `2px solid ${theme.colors.border}`,
    maxWidth: '600px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px',
    borderBottom: `2px solid ${theme.colors.border}`,
  },
  modalTitle: {
    fontSize: '24px',
    fontWeight: '800',
    color: theme.colors.textPrimary,
    margin: 0,
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
  },
  form: {
    padding: '24px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
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
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: theme.colors.textPrimary,
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  modalFooter: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    paddingTop: '20px',
    borderTop: `2px solid ${theme.colors.border}`,
  },
  cancelButton: {
    padding: '12px 24px',
    fontSize: '15px',
    fontWeight: '600',
    backgroundColor: 'transparent',
    color: theme.colors.textSecondary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
  },
  submitButton: {
    padding: '12px 24px',
    fontSize: '15px',
    fontWeight: '700',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
  },
};

export default TeamManagementPage;
