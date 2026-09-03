import React from 'react';
import { theme } from '../../theme';
import { Button } from '../ui';

/**
 * "We couldn't load this" — visibly different from "there is nothing here".
 *
 * WHY IT LOOKS DIFFERENT ON PURPOSE
 *
 * Every empty state on this page is calm, borderless and reassuring, because
 * an empty season is not a problem. This one has a rule down its left edge and
 * a retry button, because it IS a problem and the parent can do something
 * about it. If the two states looked alike, the distinction the loaders now
 * carry would be thrown away at the last moment.
 *
 * It deliberately does not use the error colour as a fill. A failed request is
 * not an emergency and this is a page about children's dance classes — the
 * accent rule is enough to mark it as different in kind.
 */
interface CardErrorProps {
  message: string;
  onRetry?: () => void;
}

const CardError: React.FC<CardErrorProps> = ({ message, onRetry }) => (
  <div
    role="alert"
    style={{
      borderLeft: `3px solid ${theme.colors.status.warning}`,
      paddingLeft: theme.spacing.md,
      paddingTop: theme.spacing.xs,
      paddingBottom: theme.spacing.xs,
    }}
  >
    <p style={{
      ...theme.typography.bodySmall,
      fontFamily: theme.fonts.primary,
      color: theme.colors.txt.secondary,
      margin: 0,
      maxWidth: '46ch',
    }}>
      {message}
    </p>

    {onRetry && (
      <div style={{ marginTop: theme.spacing.sm }}>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )}
  </div>
);

export default CardError;
