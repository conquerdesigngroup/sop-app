import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { theme } from '../../theme';
import PortalLayout from '../../components/portal/PortalLayout';
import { Button, Card, Input } from '../../components/ui';
import { portalRoutes } from '../../lib/portal';
import { requestEvaluationEmail } from '../../lib/evaluations';

/**
 * "Email me my dancer's evaluations" — the public door for families without
 * an app account.
 *
 * One field. The answer is the same sentence whether or not the address is on
 * file, for the same reason the signup page's is: anything else turns this
 * form into a test for which families attend the studio. The function
 * (supabase/functions/evaluation-email) writes { ok: true } before it looks
 * anything up, so there is nothing here to leak even by timing.
 *
 * What it sends, when it matches: every SUBMITTED evaluation for every dancer
 * in the household, current season, as an HTML email with a PDF attached.
 * Drafts never. A family with an account gets the same thing on the dashboard
 * without the email, and the link at the foot says so.
 */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const EvaluationsRequest: React.FC = () => {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Enter the email address the studio has on file for your family.');
      return;
    }
    setError(null);
    setBusy(true);
    const result = await requestEvaluationEmail(trimmed);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Couldn't send the request. Check your connection and try again.");
      return;
    }
    setSent(true);
  };

  return (
    <PortalLayout
      title="Evaluations"
      subtitle="Have your dancers' class evaluations emailed to you."
      backTo={portalRoutes.home}
    >
      <Card style={{ maxWidth: '440px' }}>
        {sent ? (
          <div role="status" aria-live="polite">
            <p style={{ ...theme.typography.body, fontFamily: theme.fonts.primary, color: theme.colors.txt.primary, margin: 0 }}>
              <strong>If that address is on file, the evaluations are on their way.</strong>
            </p>
            <p style={{ ...theme.typography.bodySmall, fontFamily: theme.fonts.primary, color: theme.colors.txt.secondary, margin: `${theme.spacing.sm} 0 0` }}>
              Give it a few minutes and check your spam folder. Only evaluations a teacher has submitted are included,
              so if a round is still in progress the email may say there is nothing yet.
            </p>
            <div style={{ marginTop: theme.spacing.md }}>
              <Button variant="outline" size="sm" onClick={() => { setSent(false); setEmail(''); }}>
                Send to a different address
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <p style={{ ...theme.typography.bodySmall, fontFamily: theme.fonts.primary, color: theme.colors.txt.secondary, margin: `0 0 ${theme.spacing.md}` }}>
              Type the email address the studio has for your family. We will send every submitted evaluation for
              your dancers this season, as an email with a PDF attached.
            </p>
            <Input
              label="Email on file"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              error={error ?? undefined}
              disabled={busy}
            />
            <div style={{ marginTop: theme.spacing.md }}>
              <Button type="submit" variant="primary" size="lg" fullWidth loading={busy} disabled={busy}>
                Email my evaluations
              </Button>
            </div>
            <div role="status" aria-live="polite" style={{ minHeight: 20, marginTop: theme.spacing.sm, fontSize: '0.85rem', color: theme.colors.txt.tertiary }}>
              {busy ? 'Sending your request…' : ''}
            </div>
          </form>
        )}
      </Card>

      <p style={{ ...theme.typography.bodySmall, fontFamily: theme.fonts.primary, color: theme.colors.txt.tertiary, marginTop: theme.spacing.lg, maxWidth: '440px' }}>
        Have an account? Evaluations are on your{' '}
        <Link to={portalRoutes.home} style={{ color: theme.colors.primary }}>family dashboard</Link>
        {' '}as soon as they are submitted, no email needed.
      </p>
    </PortalLayout>
  );
};

export default EvaluationsRequest;
