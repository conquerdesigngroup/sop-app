import React, { useCallback, useEffect, useState } from 'react';
import { theme } from '../theme';
import { Button, Card, EmptyState, Select, Spinner } from './ui';
import { useRefreshable } from '../contexts/RefreshContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * How many times each file has actually been opened.
 *
 * WHY THIS IS NOT JUST A FILTER ON THE LOG
 *
 * The log answers "who opened this, and when". It cannot answer "which of the
 * things we posted is anybody actually looking at", because that is a count
 * per file across thousands of rows and no amount of scrolling gets you there.
 * admin_download_stats (v43) does the grouping in the database.
 *
 * MOST OF THESE PEOPLE HAVE NO NAME
 *
 * The portal is used with a studio access code, so the majority of opens are
 * by `visitor` rows — a real person the studio cannot identify. The address
 * column is therefore doing the work a name would normally do, and "unique
 * addresses" is the closest honest answer to "how many different households
 * opened this". It is an estimate: a family on one wifi is one address, and a
 * parent who opens it on the school run and again at home is two.
 */

interface StatRow {
  document_id: string;
  title: string | null;
  class_name: string | null;
  program_slug: string | null;
  file_name: string | null;
  downloads: number;
  unique_addresses: number;
  by_visitors: number;
  by_families: number;
  by_staff: number;
  first_download: string;
  last_download: string;
}

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last year' },
];

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const cell: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: `1px solid ${theme.colors.bdr.primary}`,
  fontFamily: theme.fonts.primary,
  fontSize: '14px',
  color: theme.colors.txt.primary,
  whiteSpace: 'nowrap',
};

const head: React.CSSProperties = {
  ...cell,
  color: theme.colors.txt.tertiary,
  fontFamily: theme.fonts.mono,
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  textAlign: 'left',
};

const num: React.CSSProperties = { ...cell, textAlign: 'right', fontFamily: theme.fonts.mono };

const DownloadsPanel: React.FC = () => {
  const [days, setDays] = useState('30');
  const [rows, setRows] = useState<StatRow[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!isSupabaseConfigured() || !supabase) {
      setError('Download figures need the online app.');
      return;
    }
    const from = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString();
    const { data, error: rpcError } = await supabase.rpc('admin_download_stats', {
      p_from: from,
      p_to: new Date().toISOString(),
      p_limit: 200,
    });
    if (rpcError) {
      // Thrown rather than swallowed when the app-wide refresh drives this, so
      // the refresh button can say it failed.
      if (silent) throw new Error(rpcError.message);
      setError(rpcError.message || 'Could not load download figures.');
      return;
    }
    setError('');
    setRows((data?.rows ?? []) as StatRow[]);
  }, [days]);

  useEffect(() => { setRows(null); void load(); }, [load]);

  const reload = useCallback(() => load(true), [load]);
  useRefreshable(reload);

  return (
    <Card>
      <div style={{
        display: 'flex', alignItems: 'center', gap: theme.spacing.md,
        flexWrap: 'wrap', marginBottom: theme.spacing.md,
      }}>
        <div style={{ minWidth: '200px', flex: 1 }}>
          <h3 style={{
            ...theme.typography.h3,
            fontFamily: theme.fonts.display,
            color: theme.colors.txt.primary,
            margin: 0,
          }}>
            Downloads
          </h3>
          <p style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.tertiary,
            margin: `${theme.spacing.xs} 0 0`,
            maxWidth: '60ch',
          }}>
            Repeat taps from one address inside fifteen minutes count once, so these
            are opens rather than button presses.
          </p>
        </div>
        <div style={{ flex: '0 0 160px' }}>
          <Select options={RANGES} value={days} onChange={e => setDays(e.target.value)} />
        </div>
      </div>

      {error && (
        <div role="alert" style={{
          borderLeft: `3px solid ${theme.colors.status.warning}`,
          paddingLeft: theme.spacing.md,
          marginBottom: theme.spacing.md,
        }}>
          <p style={{
            ...theme.typography.bodySmall,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.secondary,
            margin: 0,
          }}>
            {error}
          </p>
          <div style={{ marginTop: theme.spacing.sm }}>
            <Button variant="outline" size="sm" onClick={() => { setRows(null); void load(); }}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {!error && rows === null && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: theme.spacing.lg }}>
          <Spinner size={22} color={theme.colors.primary} />
        </div>
      )}

      {!error && rows?.length === 0 && (
        <EmptyState
          title="Nothing opened yet"
          description="Once somebody opens a file in the portal it is counted here — including visitors using the studio access code, who have no account."
        />
      )}

      {!error && !!rows?.length && (
        // Wide content scrolls inside its own box; the page itself must never
        // scroll sideways on a phone.
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '760px' }}>
            <thead>
              <tr>
                <th style={{ ...head, whiteSpace: 'normal', minWidth: '240px' }}>File</th>
                <th style={{ ...head, minWidth: '150px' }}>Class</th>
                <th style={{ ...head, textAlign: 'right' }}>Opens</th>
                <th style={{ ...head, textAlign: 'right' }}>Addresses</th>
                <th style={{ ...head, textAlign: 'right' }}>Visitor / Family / Staff</th>
                <th style={{ ...head, textAlign: 'right' }}>Last</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.document_id}>
                  <td style={{ ...cell, whiteSpace: 'normal', minWidth: '240px', overflowWrap: 'anywhere' }}>
                    {r.title || r.file_name || 'Untitled'}
                    {r.file_name && r.title !== r.file_name && (
                      <span style={{
                        display: 'block',
                        fontFamily: theme.fonts.mono,
                        fontSize: '11px',
                        color: theme.colors.txt.tertiary,
                        overflowWrap: 'anywhere',
                      }}>
                        {r.file_name}
                      </span>
                    )}
                  </td>
                  <td style={{ ...cell, color: theme.colors.txt.secondary }}>
                    {r.class_name || '—'}
                  </td>
                  <td style={{ ...num, color: theme.colors.primary }}>{r.downloads}</td>
                  <td style={num}>{r.unique_addresses}</td>
                  <td style={{ ...num, color: theme.colors.txt.secondary, fontSize: '12px' }}>
                    {r.by_visitors} / {r.by_families} / {r.by_staff}
                  </td>
                  <td style={{ ...num, color: theme.colors.txt.tertiary, fontSize: '12px' }}>
                    {shortDate(r.last_download)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

export default DownloadsPanel;
