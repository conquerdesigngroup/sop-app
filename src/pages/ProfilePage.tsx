import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { FormInput, FormButton, FormGroup } from '../components/FormComponents';

const ProfilePage: React.FC = () => {
  const { currentUser, updateUser, changePassword } = useAuth();
  const { showToast } = useToast();
  const { isMobileOrTablet } = useResponsive();

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState(currentUser?.firstName || '');
  const [lastName, setLastName] = useState(currentUser?.lastName || '');
  const [department, setDepartment] = useState(currentUser?.department || '');

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSaveProfile = async () => {
    if (!currentUser) return;

    setLoading(true);
    try {
      await updateUser(currentUser.id, {
        firstName,
        lastName,
        department,
      });
      showToast('Profile updated successfully', 'success');
      setIsEditing(false);
    } catch (error) {
      showToast('Failed to update profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      showToast('Please enter your current password', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await changePassword(currentPassword, newPassword);
      if (result.success) {
        showToast('Password changed successfully', 'success');
        setShowPasswordForm(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        showToast(result.error || 'Failed to change password', 'error');
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to change password', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setFirstName(currentUser?.firstName || '');
    setLastName(currentUser?.lastName || '');
    setDepartment(currentUser?.department || '');
    setIsEditing(false);
  };

  if (!currentUser) {
    return null;
  }

  const memberSince = new Date(currentUser.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="page-enter" style={styles.container}>
      <div style={{
        ...styles.content,
        padding: isMobileOrTablet ? '20px 16px' : '40px',
        maxWidth: isMobileOrTablet ? '100%' : '800px',
      }}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>Profile</h1>
          <p style={styles.subtitle}>Manage your account information</p>
        </div>

        {/* Avatar Section */}
        <div style={styles.avatarSection}>
          <div style={styles.avatarLarge}>
            {currentUser.avatar ? (
              <img src={currentUser.avatar} alt="Avatar" style={styles.avatarImage} />
            ) : (
              <span style={styles.avatarInitials}>
                {currentUser.firstName.charAt(0)}{currentUser.lastName.charAt(0)}
              </span>
            )}
          </div>
          <div style={styles.avatarInfo}>
            <h2 style={styles.userName}>
              {currentUser.firstName} {currentUser.lastName}
            </h2>
            <span style={{
              ...styles.roleBadge,
              backgroundColor: currentUser.role === 'admin' ? theme.colors.primary : theme.colors.bg.tertiary,
            }}>
              {currentUser.role === 'admin' ? 'Admin' : 'Team Member'}
            </span>
          </div>
        </div>

        {/* Profile Info Card */}
        <div className="card-hover-subtle" style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Personal Information
            </h3>
            {!isEditing && (
              <FormButton
                variant="secondary"
                size="sm"
                onClick={() => setIsEditing(true)}
                leftIcon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                }
              >
                Edit
              </FormButton>
            )}
          </div>

          {isEditing ? (
            <FormGroup gap={theme.spacing.lg}>
              <div style={styles.fieldRow}>
                <FormInput
                  label="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Enter first name"
                />
                <FormInput
                  label="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Enter last name"
                />
              </div>
              <FormInput
                label="Email"
                value={currentUser.email}
                disabled
                helperText="Email cannot be changed"
              />
              <FormInput
                label="Department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Enter department"
              />
              <div style={styles.buttonRow}>
                <FormButton variant="secondary" onClick={handleCancelEdit}>
                  Cancel
                </FormButton>
                <FormButton
                  variant="primary"
                  onClick={handleSaveProfile}
                  loading={loading}
                >
                  Save Changes
                </FormButton>
              </div>
            </FormGroup>
          ) : (
            <div style={styles.infoGrid}>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>First Name</span>
                <span style={styles.infoValue}>{currentUser.firstName}</span>
              </div>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Last Name</span>
                <span style={styles.infoValue}>{currentUser.lastName}</span>
              </div>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Email</span>
                <span style={styles.infoValue}>{currentUser.email}</span>
              </div>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Department</span>
                <span style={styles.infoValue}>{currentUser.department}</span>
              </div>
            </div>
          )}
        </div>

        {/* Account Info Card */}
        <div className="card-hover-subtle" style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Account Details
            </h3>
          </div>
          <div style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Member Since</span>
              <span style={styles.infoValue}>{memberSince}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Account Status</span>
              <span style={{
                ...styles.statusBadge,
                backgroundColor: currentUser.isActive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: currentUser.isActive ? '#22c55e' : '#ef4444',
              }}>
                {currentUser.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Role</span>
              <span style={styles.infoValue}>
                {currentUser.role === 'admin' ? 'Administrator' : 'Team Member'}
              </span>
            </div>
          </div>
        </div>

        {/* Password Change Card */}
        <div className="card-hover-subtle" style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
              </svg>
              Security
            </h3>
            {!showPasswordForm && (
              <FormButton
                variant="secondary"
                size="sm"
                onClick={() => setShowPasswordForm(true)}
              >
                Change Password
              </FormButton>
            )}
          </div>

          {showPasswordForm ? (
            <FormGroup gap={theme.spacing.lg}>
              <FormInput
                type="password"
                label="Current Password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
              <FormInput
                type="password"
                label="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                helperText="Must be at least 6 characters"
              />
              <FormInput
                type="password"
                label="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
              <div style={styles.buttonRow}>
                <FormButton
                  variant="secondary"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                >
                  Cancel
                </FormButton>
                <FormButton
                  variant="primary"
                  onClick={handleChangePassword}
                  loading={loading}
                  disabled={!currentPassword || !newPassword || !confirmPassword}
                >
                  Update Password
                </FormButton>
              </div>
            </FormGroup>
          ) : (
            <p style={styles.securityNote}>
              Keep your account secure by using a strong, unique password.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: 'calc(100vh - 80px)',
    backgroundColor: theme.colors.background,
  },
  content: {
    margin: '0 auto',
  },
  header: {
    marginBottom: '32px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: theme.colors.txt.primary,
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '16px',
    color: theme.colors.txt.secondary,
  },
  avatarSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    marginBottom: '32px',
    padding: '24px',
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    border: `2px solid ${theme.colors.bdr.primary}`,
  },
  avatarLarge: {
    width: '100px',
    height: '100px',
    borderRadius: '50%',
    backgroundColor: theme.colors.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  avatarInitials: {
    fontSize: '36px',
    fontWeight: 700,
    color: '#FFFFFF',
  },
  avatarInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  userName: {
    fontSize: '24px',
    fontWeight: 700,
    color: theme.colors.txt.primary,
    margin: 0,
  },
  roleBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#FFFFFF',
    width: 'fit-content',
  },
  card: {
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    border: `2px solid ${theme.colors.bdr.primary}`,
    padding: '24px',
    marginBottom: '20px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  infoLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.colors.txt.tertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  infoValue: {
    fontSize: '16px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
  },
  statusBadge: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: 600,
    width: 'fit-content',
  },
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '8px',
  },
  securityNote: {
    fontSize: '14px',
    color: theme.colors.txt.secondary,
    margin: 0,
  },
};

export default ProfilePage;
