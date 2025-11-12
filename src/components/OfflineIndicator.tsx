import React from 'react';
import { useOfflineSync } from '../hooks/useOfflineSync';

export const OfflineIndicator: React.FC = () => {
  const { isOnline, isSyncing, pendingChangesCount, syncChanges } = useOfflineSync();

  // Don't show anything if online and no pending changes
  if (isOnline && !isSyncing && pendingChangesCount === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        backgroundColor: isOnline ? '#10b981' : '#ef4444',
        color: 'white',
        padding: '12px 20px',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: '14px',
        fontWeight: 500,
      }}
    >
      {/* Status icon */}
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: 'white',
          animation: isSyncing ? 'pulse 1.5s ease-in-out infinite' : 'none',
        }}
      />

      {/* Status text */}
      <div>
        {isSyncing && 'Syncing changes...'}
        {!isSyncing && !isOnline && `Offline mode • ${pendingChangesCount} pending changes`}
        {!isSyncing && isOnline && pendingChangesCount > 0 && (
          <>
            <span>{pendingChangesCount} changes ready to sync</span>
            <button
              onClick={syncChanges}
              style={{
                marginLeft: '10px',
                backgroundColor: 'white',
                color: '#10b981',
                border: 'none',
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Sync Now
            </button>
          </>
        )}
      </div>

      <style>
        {`
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
          }
        `}
      </style>
    </div>
  );
};
