import React from 'react';
import { theme } from '../theme';

const TestPage: React.FC = () => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
      }}
    >
      <span
        style={{
          fontFamily: theme.fonts.display,
          fontSize: '64px',
          fontWeight: 700,
          color: theme.colors.txt.primary,
          textTransform: 'uppercase',
        }}
      >
        test
      </span>
    </div>
  );
};

export default TestPage;
