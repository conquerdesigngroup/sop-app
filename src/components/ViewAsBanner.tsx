import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { theme } from '../theme';
import { roleLabel } from '../lib/roles';

/**
 * The strip under the header while an admin is viewing the app as someone
 * else. Loud on purpose: every page below it is lying about who you are,
 * and the one thing that must not happen is forgetting that and saving
 * something. Amber rather than pink so it does not read as a brand accent.
 */
const ViewAsBanner: React.FC = () => {
  const { viewingAs, exitViewAs } = useAuth();
  const navigate = useNavigate();

  if (!viewingAs) return null;

  return (
    <div
      role="status"
      data-view-as-banner
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap',
        padding: '10px 16px',
        backgroundColor: theme.colors.status.warning,
        color: '#000000',
        fontFamily: theme.fonts.primary,
        fontSize: '14px',
        // Sits under the sticky header and above page content; the header
        // is 100, page content sets none.
        position: 'sticky',
        top: 0,
        zIndex: 99,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span style={{ flex: '1 1 200px', minWidth: 0 }}>
        <strong>Viewing as {viewingAs.firstName} {viewingAs.lastName}</strong>
        {' '}({roleLabel(viewingAs.role)}). This is what they see. Anything you save is still saved as you.
      </span>
      <button
        type="button"
        onClick={() => {
          exitViewAs();
          navigate('/team');
        }}
        style={{
          padding: '6px 14px',
          borderRadius: theme.borderRadius.md,
          border: '2px solid #000000',
          backgroundColor: 'transparent',
          color: '#000000',
          fontWeight: 700,
          fontSize: '13px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Exit view
      </button>
    </div>
  );
};

export default ViewAsBanner;
