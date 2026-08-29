import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { theme } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../hooks/useConfirm';
import { supabase } from '../../lib/supabase';
import { CLIENT_MIN_PASSWORD } from '../../lib/clientAuth';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Spinner,
  Textarea,
} from '../../components/ui';

/**
 * Family logins and the enrollment roster — Workstream 2 of
 * CLIENT-AUTH-BUILD.md, the front desk's side of client auth.
 *
 * Everything here calls the portal-admin Edge Function; nothing touches
 * portal_roster or auth directly, so the function is the one audited surface
 * and every click leaves an activity-log row naming the admin who did it.
 *
 * THE TASK THIS PAGE IS SHAPED AROUND: a family changes their email in the
 * enrollment system. The next import lands the new address as an UNCLAIMED
 * row while their account still lives on the old one. The fix is two clicks
 * here — find the family, "Change email" — which moves the account (password
 * intact, nobody re-registers) and claims the waiting row.
 *
 * Phone-first like the rest of the portal admin: rows are stacked cards, the
 * filter row wraps, and every email/name cell gets minWidth: 0 plus
 * overflowWrap so a long address cannot push the layout off-screen.
 */

interface ClientRow {
  id: string;
  email: string;
  student_name: string;
  guardian_name: string | null;
  external_id: string | null;
  status: 'active' | 'inactive';
  claimed_by: string | null;
  claimed_at: string | null;
  imported_at: string;
  notes: string | null;
  program_name: string | null;
  program_slug: string | null;
  first_name: string | null;
  last_name: string | null;
  account_active: boolean | null;
  account_email: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
}

interface ImportResult {
  inserted: number;
  updated: number;
  unchanged: number;
  auto_claimed: number;
  rejected: { row: number; email: string; reason: string }[];
}

const PAGE_SIZE = 100;

const FILTER_OPTIONS = [
  { value: 'all', label: 'All roster rows' },
  { value: 'claimed', label: 'Linked to an account' },
  { value: 'unclaimed', label: 'Not signed up yet' },
  { value: 'inactive', label: 'Deactivated rows' },
];

const REJECT_REASON: Record<string, string> = {
  invalid_email: 'not a valid email address',
  missing_student_name: 'no student name',
  unknown_program: 'unknown program',
  duplicate_in_file: 'duplicate row in the file',
};

// ------------------------------------------------------------------ CSV

/**
 * Small CSV parser: quoted fields, embedded commas and quotes, CRLF. Kept here
 * because the import is the only CSV in the app; if a second appears, promote
 * it to lib.
 */
const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
};

/** Header names as the enrollment export (or a hand-made sheet) writes them. */
const HEADER_MAP: Record<string, string> = {
  email: 'email', 'guardian email': 'email', 'parent email': 'email',
  student: 'student_name', 'student name': 'student_name', student_name: 'student_name', dancer: 'student_name',
  guardian: 'guardian_name', 'guardian name': 'guardian_name', guardian_name: 'guardian_name', parent: 'guardian_name', 'parent name': 'guardian_name',
  program: 'program_slug', program_slug: 'program_slug',
  id: 'external_id', external_id: 'external_id', 'enrollment id': 'external_id', 'student id': 'external_id',
  notes: 'notes',
};

const csvToRosterRows = (text: string): { rows: Record<string, string>[]; error?: string } => {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: 'Need a header row and at least one data row.' };

  const headers = table[0].map(h => HEADER_MAP[h.trim().toLowerCase()] ?? null);
  if (!headers.includes('email') || !headers.includes('student_name')) {
    return { rows: [], error: 'The header row must include "email" and "student_name" (or "student") columns.' };
  }

  const rows = table.slice(1).map(cells => {
    const obj: Record<string, string> = {};
    headers.forEach((key, i) => {
      if (key && cells[i] !== undefined) obj[key] = cells[i].trim();
    });
    return obj;
  });
  return { rows };
};

// ------------------------------------------------------------------ page

const ClientAccountsPage: React.FC = () => {
  const { isMobileOrTablet } = useResponsive();
  const { success, error: toastError } = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const [rows, setRows] = useState<ClientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const [emailTarget, setEmailTarget] = useState<ClientRow | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [passwordTarget, setPasswordTarget] = useState<ClientRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const callPortalAdmin = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('portal-admin', { body });
    if (error) {
      let message = error.message || 'The request failed';
      try {
        const parsed = await (error as any).context?.json?.();
        if (parsed?.error) message = parsed.error;
      } catch { /* keep the generic message */ }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const fetchRows = useCallback(async (offset = 0, append = false) => {
    setLoading(true);
    try {
      const data = await callPortalAdmin({
        action: 'client_list',
        filter,
        search: search.trim() || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setTotal(data.total ?? 0);
      setRows(prev => (append ? [...prev, ...(data.rows ?? [])] : data.rows ?? []));
    } catch (e: any) {
      toastError(e.message || 'Could not load client accounts');
    } finally {
      setLoading(false);
    }
  }, [callPortalAdmin, filter, search, toastError]);

  // Debounced so typing in search does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { fetchRows(0, false); }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchRows, search]);

  // ------------------------------------------------------------- actions

  const runRowAction = async (
    rowId: string,
    body: Record<string, unknown>,
    successMessage: string,
  ) => {
    setBusyRow(rowId);
    try {
      await callPortalAdmin(body);
      success(successMessage);
      await fetchRows(0, false);
    } catch (e: any) {
      toastError(e.message || 'The action failed');
    } finally {
      setBusyRow(null);
    }
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  const runImport = async () => {
    const { rows: parsed, error } = csvToRosterRows(importText);
    if (error) { setModalError(error); return; }
    if (parsed.length === 0) { setModalError('No data rows found.'); return; }

    setImportBusy(true);
    setModalError('');
    try {
      // Chunked so a big season export cannot hit the function's body cap.
      const totals: ImportResult = { inserted: 0, updated: 0, unchanged: 0, auto_claimed: 0, rejected: [] };
      for (let i = 0; i < parsed.length; i += 500) {
        const chunk = parsed.slice(i, i + 500);
        const data = await callPortalAdmin({
          action: 'roster_import',
          rows: chunk,
          filename: `paste ${new Date().toISOString().slice(0, 10)} (${parsed.length} rows)`,
        });
        const r: ImportResult = data.result;
        totals.inserted += r.inserted;
        totals.updated += r.updated;
        totals.unchanged += r.unchanged;
        totals.auto_claimed += r.auto_claimed;
        // Rejected row numbers are chunk-relative; shift them back to the file.
        totals.rejected.push(...r.rejected.map(x => ({ ...x, row: x.row + i })));
      }
      setImportResult(totals);
      await fetchRows(0, false);
    } catch (e: any) {
      setModalError(e.message || 'The import failed');
    } finally {
      setImportBusy(false);
    }
  };

  const submitEmailChange = async () => {
    if (!emailTarget?.claimed_by) return;
    setModalBusy(true);
    setModalError('');
    try {
      const data = await callPortalAdmin({
        action: 'client_set_email',
        userId: emailTarget.claimed_by,
        newEmail: newEmail.trim(),
      });
      success(
        data.rosterRowsClaimed > 0
          ? `Email updated — ${data.rosterRowsClaimed} waiting roster row${data.rosterRowsClaimed === 1 ? '' : 's'} linked to the account.`
          : 'Email updated. They sign in with the new address and their existing password.',
      );
      setEmailTarget(null);
      setNewEmail('');
      await fetchRows(0, false);
    } catch (e: any) {
      setModalError(e.message || 'Could not change the email');
    } finally {
      setModalBusy(false);
    }
  };

  const submitPassword = async () => {
    if (!passwordTarget?.claimed_by) return;
    if (newPassword.length < CLIENT_MIN_PASSWORD) {
      setModalError(`Password must be at least ${CLIENT_MIN_PASSWORD} characters`);
      return;
    }
    setModalBusy(true);
    setModalError('');
    try {
      await callPortalAdmin({
        action: 'client_set_password',
        userId: passwordTarget.claimed_by,
        password: newPassword,
      });
      success('Password set. Tell them in person or by phone — never email a password.');
      setPasswordTarget(null);
      setNewPassword('');
    } catch (e: any) {
      setModalError(e.message || 'Could not set the password');
    } finally {
      setModalBusy(false);
    }
  };

  // ------------------------------------------------------------- render

  const mono: React.CSSProperties = {
    fontFamily: theme.fonts.mono,
    color: theme.colors.txt.tertiary,
    fontSize: '12px',
    minWidth: 0,
    overflowWrap: 'anywhere',
  };

  const grouped = useMemo(() => {
    // One card per guardian email: several students under one login is the
    // normal case and repeating the account block per student reads as three
    // different logins.
    const byEmail = new Map<string, ClientRow[]>();
    rows.forEach(r => {
      const key = r.email.toLowerCase();
      byEmail.set(key, [...(byEmail.get(key) ?? []), r]);
    });
    return Array.from(byEmail.values());
  }, [rows]);

  const accountBadges = (r: ClientRow) => {
    const badges: React.ReactNode[] = [];
    if (r.status === 'inactive') badges.push(<Badge key="ri" variant="default">Roster row off</Badge>);
    if (!r.claimed_by) {
      if (r.status === 'active') badges.push(<Badge key="uc" variant="warning">Not signed up</Badge>);
      return badges;
    }
    if (r.account_active === false) badges.push(<Badge key="dis" variant="danger">Account disabled</Badge>);
    else badges.push(<Badge key="act" variant="success">Account active</Badge>);
    if (!r.email_confirmed_at) badges.push(<Badge key="uv" variant="info">Awaiting verification</Badge>);
    return badges;
  };

  return (
    <div style={{ padding: isMobileOrTablet ? '16px' : '40px', maxWidth: '1100px', margin: '0 auto' }}>
      {confirmDialog}
      <PageHeader
        title="Client Accounts"
        subtitle="Family logins and the enrollment roster"
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Link to="/portal-admin" style={{ textDecoration: 'none' }}>
              <Button variant="outline">Portal manager</Button>
            </Link>
            <Button
              variant="primary"
              onClick={() => { setImportResult(null); setImportText(''); setModalError(''); setShowImport(true); }}
            >
              Import roster
            </Button>
          </div>
        }
      />

      {/* Filter row. Wraps — see the mobile rules in CLAUDE.md. */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '0 0 16px' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <SearchInput
            placeholder="Search email, student or guardian…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onClear={() => setSearch('')}
          />
        </div>
        <div style={{ flex: '0 1 220px', minWidth: '180px' }}>
          <Select
            options={FILTER_OPTIONS}
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
          <Spinner size={32} color={theme.colors.primary} />
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          title="No roster rows"
          description={
            filter === 'all' && !search
              ? 'Import the roster from the enrollment system to open sign-ups to families.'
              : 'Nothing matches this filter.'
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {grouped.map(family => {
            const head = family[0];
            const claimed = !!head.claimed_by;
            const accountName = `${head.first_name ?? ''} ${head.last_name ?? ''}`.trim();
            const rowBusy = busyRow !== null && family.some(r => r.id === busyRow || r.claimed_by === busyRow);

            return (
              <Card key={head.email + (head.claimed_by ?? '')} padding="md">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Guardian / account line */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{
                      ...theme.typography.body,
                      fontFamily: theme.fonts.primary,
                      fontWeight: 600,
                      color: theme.colors.txt.primary,
                      minWidth: 0,
                      overflowWrap: 'anywhere',
                    }}>
                      {accountName || head.guardian_name || head.email}
                    </span>
                    {accountBadges(head)}
                  </div>
                  <span style={mono}>{head.email}</span>

                  {/* Students on this email */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {family.map(r => (
                      <div key={r.id} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{
                          ...theme.typography.bodySmall,
                          fontFamily: theme.fonts.primary,
                          color: theme.colors.txt.secondary,
                          minWidth: 0,
                          overflowWrap: 'anywhere',
                        }}>
                          {r.student_name}
                        </span>
                        {r.program_name && <Badge variant="default" size="sm">{r.program_name}</Badge>}
                        {r.status === 'inactive' && <Badge variant="default" size="sm">off</Badge>}
                        {family.length > 1 && r.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={rowBusy}
                            onClick={async () => {
                              if (await confirm({
                                title: 'Deactivate roster row?',
                                message: `${r.student_name} will no longer count for portal sign-up under ${r.email}. The account (if any) is not touched.`,
                                variant: 'danger',
                              })) {
                                runRowAction(r.id, { action: 'roster_deactivate', rosterId: r.id }, 'Roster row deactivated');
                              }
                            }}
                          >
                            Remove row
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Account facts */}
                  {claimed && (
                    <span style={mono}>
                      {head.account_email && head.account_email.toLowerCase() !== head.email.toLowerCase()
                        ? `signs in as ${head.account_email} · `
                        : ''}
                      {head.last_sign_in_at
                        ? `last sign-in ${new Date(head.last_sign_in_at).toLocaleDateString()}`
                        : 'never signed in'}
                    </span>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {claimed ? (
                      <>
                        <Button
                          variant="outline" size="sm" disabled={rowBusy}
                          onClick={() => { setNewEmail(''); setModalError(''); setEmailTarget(head); }}
                        >
                          Change email
                        </Button>
                        <Button
                          variant="outline" size="sm" disabled={rowBusy}
                          onClick={() => { setNewPassword(''); setModalError(''); setPasswordTarget(head); }}
                        >
                          Set password
                        </Button>
                        <Button
                          variant={head.account_active === false ? 'primary' : 'danger'} size="sm" disabled={rowBusy}
                          onClick={async () => {
                            const activating = head.account_active === false;
                            if (await confirm({
                              title: activating ? 'Reactivate this account?' : 'Disable this account?',
                              message: activating
                                ? 'They can sign in again with their existing password.'
                                : 'They will not be able to sign in until reactivated. Their password is kept.',
                              variant: activating ? 'info' : 'danger',
                            })) {
                              runRowAction(head.claimed_by!, {
                                action: 'client_set_active',
                                userId: head.claimed_by,
                                isActive: activating,
                              }, activating ? 'Account reactivated' : 'Account disabled');
                            }
                          }}
                        >
                          {head.account_active === false ? 'Reactivate' : 'Disable'}
                        </Button>
                        <Button
                          variant="ghost" size="sm" disabled={rowBusy}
                          onClick={async () => {
                            if (await confirm({
                              title: 'Unlink roster row?',
                              message: `The row for ${head.student_name} can then be claimed by a fresh sign-up. The existing account keeps working — use this when fixing a mislink.`,
                              variant: 'danger',
                            })) {
                              runRowAction(head.id, { action: 'client_unlink', rosterId: head.id }, 'Roster row unlinked');
                            }
                          }}
                        >
                          Unlink
                        </Button>
                      </>
                    ) : head.status === 'active' ? (
                      <Button
                        variant="ghost" size="sm" disabled={rowBusy}
                        onClick={async () => {
                          if (await confirm({
                            title: 'Deactivate roster row?',
                            message: `${head.student_name} will no longer count for portal sign-up under ${head.email}.`,
                            variant: 'danger',
                          })) {
                            runRowAction(head.id, { action: 'roster_deactivate', rosterId: head.id }, 'Roster row deactivated');
                          }
                        }}
                      >
                        Remove row
                      </Button>
                    ) : (
                      <Button
                        variant="outline" size="sm" disabled={rowBusy}
                        onClick={() =>
                          runRowAction(head.id, { action: 'roster_reactivate', rosterId: head.id }, 'Roster row restored')
                        }
                      >
                        Restore row
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

          {rows.length < total && (
            <Button variant="outline" fullWidth loading={loading} onClick={() => fetchRows(rows.length, true)}>
              Load more ({rows.length} of {total})
            </Button>
          )}
        </div>
      )}

      {/* ------------------------------------------------ import modal */}
      <Modal
        isOpen={showImport}
        onClose={() => !importBusy && setShowImport(false)}
        title="Import roster"
        size="lg"
        footer={
          importResult ? (
            <Button variant="primary" onClick={() => setShowImport(false)}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setShowImport(false)} disabled={importBusy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={runImport} loading={importBusy} disabled={!importText.trim()}>
                Import
              </Button>
            </>
          )
        }
      >
        {importResult ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ ...theme.typography.body, fontFamily: theme.fonts.primary, color: theme.colors.txt.primary, margin: 0 }}>
              {importResult.inserted} added · {importResult.updated} updated · {importResult.unchanged} unchanged
              {importResult.auto_claimed > 0 && ` · ${importResult.auto_claimed} linked to existing accounts`}
            </p>
            {importResult.rejected.length > 0 && (
              <div>
                <p style={{ ...theme.typography.bodySmall, fontFamily: theme.fonts.primary, color: theme.colors.status.warning, margin: '0 0 6px' }}>
                  {importResult.rejected.length} row{importResult.rejected.length === 1 ? '' : 's'} skipped:
                </p>
                <ul style={{ margin: 0, paddingLeft: '18px' }}>
                  {importResult.rejected.slice(0, 20).map((r, i) => (
                    <li key={i} style={{ ...theme.typography.bodySmall, fontFamily: theme.fonts.mono, color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' }}>
                      row {r.row} ({r.email || 'no email'}) — {REJECT_REASON[r.reason] ?? r.reason}
                    </li>
                  ))}
                  {importResult.rejected.length > 20 && (
                    <li style={{ ...theme.typography.bodySmall, fontFamily: theme.fonts.primary, color: theme.colors.txt.tertiary }}>
                      …and {importResult.rejected.length - 20} more
                    </li>
                  )}
                </ul>
              </div>
            )}
            <p style={{ ...theme.typography.caption, fontFamily: theme.fonts.primary, color: theme.colors.txt.tertiary, margin: 0 }}>
              Nothing is ever deleted by an import. Re-importing the same file changes nothing.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ ...theme.typography.bodySmall, fontFamily: theme.fonts.primary, color: theme.colors.txt.secondary, margin: 0 }}>
              Paste CSV from the enrollment export, or pick a file. Needs
              columns <code>email</code> and <code>student_name</code>; optional{' '}
              <code>guardian_name</code>, <code>program</code> (allstars/academy),{' '}
              <code>external_id</code>, <code>notes</code>.
            </p>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleImportFile(f);
                  e.target.value = '';
                }}
              />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importBusy}>
                Choose CSV file
              </Button>
            </div>
            <Textarea
              label="CSV"
              rows={10}
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={'email,student_name,guardian_name,program\nfamily@example.com,Mia Jones,Sarah Jones,allstars'}
              disabled={importBusy}
              error={modalError || undefined}
              style={{ fontFamily: theme.fonts.mono, fontSize: '12px' }}
            />
          </div>
        )}
      </Modal>

      {/* -------------------------------------------- change email modal */}
      <Modal
        isOpen={emailTarget !== null}
        onClose={() => !modalBusy && setEmailTarget(null)}
        title="Change sign-in email"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEmailTarget(null)} disabled={modalBusy}>Cancel</Button>
            <Button variant="primary" onClick={submitEmailChange} loading={modalBusy} disabled={!newEmail.trim()}>
              Move account
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ ...theme.typography.bodySmall, fontFamily: theme.fonts.primary, color: theme.colors.txt.secondary, margin: 0, overflowWrap: 'anywhere' }}>
            Moves the account currently on{' '}
            <strong>{emailTarget?.account_email ?? emailTarget?.email}</strong> to a new
            address. Password and everything else stay; if the new address already has an
            unclaimed roster row (a fresh import, say), it links up automatically.
          </p>
          <Input
            label="New email"
            type="email"
            autoCapitalize="none"
            value={newEmail}
            onChange={e => { setNewEmail(e.target.value); setModalError(''); }}
            error={modalError || undefined}
            disabled={modalBusy}
          />
        </div>
      </Modal>

      {/* --------------------------------------------- set password modal */}
      <Modal
        isOpen={passwordTarget !== null}
        onClose={() => !modalBusy && setPasswordTarget(null)}
        title="Set a password"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPasswordTarget(null)} disabled={modalBusy}>Cancel</Button>
            <Button variant="primary" onClick={submitPassword} loading={modalBusy} disabled={newPassword.length < CLIENT_MIN_PASSWORD}>
              Set password
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ ...theme.typography.bodySmall, fontFamily: theme.fonts.primary, color: theme.colors.txt.secondary, margin: 0, overflowWrap: 'anywhere' }}>
            For <strong>{passwordTarget?.account_email ?? passwordTarget?.email}</strong>.
            At least {CLIENT_MIN_PASSWORD} characters. Prefer the self-serve reset
            email when their inbox works — this is for the front-desk moments when
            it doesn’t.
          </p>
          <Input
            label="New password"
            type="text"
            autoComplete="off"
            value={newPassword}
            onChange={e => { setNewPassword(e.target.value); setModalError(''); }}
            error={modalError || undefined}
            disabled={modalBusy}
            style={{ fontFamily: theme.fonts.mono }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default ClientAccountsPage;
