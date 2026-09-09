import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { theme } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import { useToast } from '../../contexts/ToastContext';
import { useRefreshable } from '../../contexts/RefreshContext';
import { useConfirm } from '../../hooks/useConfirm';
import { parseCsvToObjects } from '../../lib/csv';
import { callPortalAdmin } from '../../lib/portalAdminApi';
import { supabase } from '../../lib/supabase';
import {
  loadStudents, studentMatches, studentFullName, ageFrom, ViewerStudent,
} from '../../lib/portalViewer';
import {
  normaliseEmail, isValidEmail, dancerBlockedReason, emailBlockedReason,
} from '../../lib/studentLogin';
import AccessEventsPanel from '../../components/portal-admin/AccessEventsPanel';
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
  /** 'student' rows are one dancer's own login; 'guardian' is a parent sign-up. */
  member_type: 'guardian' | 'student';
  student_id: string | null;
  dancer_name: string | null;
  /**
   * Whether a portal_household_members row actually exists for this dancer.
   * THE MEMBERSHIP IS THE ACCESS: a student row can be deactivated while the
   * membership stands, which is why Deactivate cannot be described as revoking
   * anything for these rows.
   */
  has_login: boolean;
}

interface ImportResult {
  inserted: number;
  updated: number;
  unchanged: number;
  auto_claimed: number;
  households_created: number;
  students_created: number;
  students_updated: number;
  /** Rows that got an allowlist entry but no student record, for want of a dob. */
  students_skipped_no_dob: number;
  rejected: { row: number; email: string; reason: string }[];
}

const PAGE_SIZE = 100;

const FILTER_OPTIONS = [
  { value: 'all', label: 'All roster rows' },
  { value: 'claimed', label: 'Linked to an account' },
  { value: 'unclaimed', label: 'Not signed up yet' },
  { value: 'student', label: 'Dancer logins' },
  { value: 'inactive', label: 'Deactivated rows' },
];

const REJECT_REASON: Record<string, string> = {
  invalid_email: 'not a valid email address',
  missing_student_name: 'no student name',
  invalid_dob: 'date of birth is not a real past date',
  unknown_program: 'unknown program',
  duplicate_in_file: 'duplicate row in the file',
};

// ------------------------------------------------------------------ CSV

/**
 * Header names as the enrollment export (or a hand-made sheet) writes them.
 *
 * Deliberately absent: bare `first name` / `last name`. In a parents-and-students
 * export those belong to the PARENT, and mapping them onto the child would file
 * a family under the wrong person's name — silently, because both spellings are
 * plausible. The student's own columns have to say `student`.
 */
const HEADER_MAP: Record<string, string> = {
  email: 'email', 'guardian email': 'email', 'parent email': 'email',
  student: 'student_name', 'student name': 'student_name', student_name: 'student_name', dancer: 'student_name',
  'student first': 'student_first_name', 'student first name': 'student_first_name', student_first_name: 'student_first_name',
  'student last': 'student_last_name', 'student last name': 'student_last_name', student_last_name: 'student_last_name',
  guardian: 'guardian_name', 'guardian name': 'guardian_name', guardian_name: 'guardian_name', parent: 'guardian_name', 'parent name': 'guardian_name',
  dob: 'date_of_birth', 'date of birth': 'date_of_birth', date_of_birth: 'date_of_birth',
  'student dob': 'date_of_birth', student_dob: 'date_of_birth', birthday: 'date_of_birth', birthdate: 'date_of_birth',
  program: 'program_slug', program_slug: 'program_slug',
  id: 'external_id', external_id: 'external_id', 'enrollment id': 'external_id', 'student id': 'external_id',
  notes: 'notes',
};

const csvToRosterRows = (text: string): { rows: Record<string, string>[]; error?: string } => {
  const { rows, headers } = parseCsvToObjects(text, HEADER_MAP);
  if (rows.length === 0) return { rows: [], error: 'Need a header row and at least one data row.' };

  const hasSplitName = headers.includes('student_first_name') && headers.includes('student_last_name');
  if (!headers.includes('email') || !(headers.includes('student_name') || hasSplitName)) {
    return {
      rows: [],
      error:
        'The header row must include "email", plus either "student_name" or both ' +
        '"student_first_name" and "student_last_name".',
    };
  }
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
  // Seeded from ?q= so "Login & roster" in the Portal Viewer opens on the one
  // family being looked at rather than on all 388 roster rows.
  const [urlParams] = useSearchParams();
  const [search, setSearch] = useState(() => urlParams.get('q') ?? '');
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // ------------------------------------------------ give a dancer a login
  //
  // The dancer is picked, never typed. A roster row for a dancer login must
  // resolve to a real portal_students id — that id is what pins the login to
  // one child AND to the right family, since the dancer's own address matches
  // no household. Typing a name could only ever be matched back to an id, and
  // two dancers share a name often enough that guessing is not acceptable.
  const [showGrant, setShowGrant] = useState(false);
  const [grantStudents, setGrantStudents] = useState<ViewerStudent[]>([]);
  const [grantTaken, setGrantTaken] = useState<Set<string>>(new Set());
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantSearch, setGrantSearch] = useState('');
  const [grantPicked, setGrantPicked] = useState<ViewerStudent | null>(null);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantError, setGrantError] = useState('');

  const [emailTarget, setEmailTarget] = useState<ClientRow | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [passwordTarget, setPasswordTarget] = useState<ClientRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);


  // `silent` is the app-wide refresh: same first page, but the list stays on
  // screen while it loads instead of dropping to a spinner.
  const fetchRows = useCallback(async (offset = 0, append = false, silent = false) => {
    if (!silent) setLoading(true);
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

  const refetch = useCallback(() => fetchRows(0, false, true), [fetchRows]);
  useRefreshable(refetch);

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
      const totals: ImportResult = {
        inserted: 0, updated: 0, unchanged: 0, auto_claimed: 0,
        households_created: 0, students_created: 0, students_updated: 0,
        students_skipped_no_dob: 0, rejected: [],
      };
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
        // Absent when the function predates v49; ?? 0 keeps an older deploy readable.
        totals.households_created += r.households_created ?? 0;
        totals.students_created += r.students_created ?? 0;
        totals.students_updated += r.students_updated ?? 0;
        totals.students_skipped_no_dob += r.students_skipped_no_dob ?? 0;
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

  const openGrant = async () => {
    setShowGrant(true);
    setGrantSearch(''); setGrantPicked(null); setGrantEmail(''); setGrantError('');
    setGrantLoading(true);
    try {
      // portal_admin_student_overview is security_invoker and both underlying
      // policies end in `or is_admin()`, so an admin reads every dancer here
      // without a bespoke endpoint.
      const [{ rows, error }, taken] = await Promise.all([
        loadStudents(),
        supabase.from('portal_household_members').select('student_id').eq('member_type', 'student'),
      ]);
      if (error) setGrantError(error);
      setGrantStudents(rows);
      setGrantTaken(new Set(
        (taken.data ?? []).map((m: { student_id: string | null }) => m.student_id ?? '').filter(Boolean),
      ));
    } finally {
      setGrantLoading(false);
    }
  };

  const grantMatches = useMemo(() => {
    const q = grantSearch.trim();
    if (!q) return [];
    return grantStudents.filter(s => s.status === 'active' && studentMatches(s, q));
  }, [grantStudents, grantSearch]);

  const submitGrant = async () => {
    if (!grantPicked) return;
    const email = normaliseEmail(grantEmail);
    if (!isValidEmail(email)) {
      setGrantError('That is not a valid email address.'); return;
    }
    setGrantBusy(true);
    setGrantError('');
    try {
      const data = await callPortalAdmin({
        action: 'roster_add_student',
        studentId: grantPicked.id,
        newEmail: email,
      });
      const r = data.result ?? {};
      success(
        r.linked
          ? `${r.student_name} is set up at ${email}, and the account already on that address is now linked. It sees only their own dancing.`
          : `${r.student_name} can now register at ${email}. Their login will see only their own dancing.`,
      );
      setShowGrant(false);
      await fetchRows(0, false);
    } catch (e: any) {
      setGrantError(e.message || 'Could not set that up');
    } finally {
      setGrantBusy(false);
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
    // First, because it changes what every badge after it means.
    if (r.member_type === 'student') badges.push(<Badge key="dl" variant="info">Dancer login</Badge>);
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
            <Button variant="outline" onClick={openGrant}>Give a dancer a login</Button>
          </div>
        }
      />

      {/* Above the roster because it is the only part of this page that can be
          URGENT: a family locked out today is worth more of the reader's
          attention than a roster that has not changed since the last import.
          "Find in roster" drops an address into the search below. */}
      <AccessEventsPanel
        onFindInRoster={email => {
          setFilter('all');
          setSearch(email);
        }}
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
                      {head.member_type === 'student'
                        ? (head.dancer_name || head.student_name)
                        : (accountName || head.guardian_name || head.email)}
                    </span>
                    {accountBadges(head)}
                  </div>
                  <span style={mono}>{head.email}</span>

                  {head.member_type === 'student' && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{
                        ...theme.typography.bodySmall,
                        fontFamily: theme.fonts.primary,
                        color: theme.colors.txt.tertiary,
                        minWidth: 0,
                      }}>
                        {head.guardian_name ? `${head.guardian_name} family · ` : ''}
                        sees only their own classes and attendance
                      </span>
                      {head.has_login && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={rowBusy}
                          onClick={async () => {
                            if (await confirm({
                              title: 'Remove this dancer login?',
                              message:
                                `${head.dancer_name || head.student_name} loses access to the portal, and ` +
                                `${head.email} can no longer register. Their account is not deleted and the ` +
                                `family's own login is untouched. You can grant it again afterwards.`,
                              variant: 'danger',
                            })) {
                              runRowAction(
                                head.id,
                                { action: 'roster_revoke_student', rosterId: head.id },
                                'Dancer login removed',
                              );
                            }
                          }}
                        >
                          Remove dancer login
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Students on this email. A dancer login is one row naming the
                      same person as the header, so listing it again reads as two
                      different people. */}
                  {head.member_type !== 'student' && (
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
                  )}

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
                            // THE MEMBERSHIP IS THE ACCESS. For a dancer who has
                            // already registered, deactivating this row stops a
                            // future sign-up and revokes nothing at all — saying
                            // otherwise is how somebody ends up believing they
                            // have removed access they have not removed.
                            message: head.member_type === 'student' && head.has_login
                              ? `${head.dancer_name || head.student_name} KEEPS their login and keeps seeing their own dancing — this only stops ${head.email} registering again. To take the login away, use "Remove dancer login".`
                              : `${head.student_name} will no longer count for portal sign-up under ${head.email}.`,
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
            {(importResult.students_created > 0 || importResult.students_updated > 0 || importResult.households_created > 0) && (
              <p style={{ ...theme.typography.bodySmall, fontFamily: theme.fonts.primary, color: theme.colors.txt.secondary, margin: 0 }}>
                Student records: {importResult.students_created} created
                {importResult.students_updated > 0 && `, ${importResult.students_updated} birthday corrected`}
                {importResult.households_created > 0 && ` · ${importResult.households_created} new famil${importResult.households_created === 1 ? 'y' : 'ies'}`}
              </p>
            )}
            {importResult.students_skipped_no_dob > 0 && (
              <p style={{ ...theme.typography.bodySmall, fontFamily: theme.fonts.primary, color: theme.colors.status.warning, margin: 0 }}>
                {importResult.students_skipped_no_dob} row
                {importResult.students_skipped_no_dob === 1 ? '' : 's'} got a sign-up entry but no student
                record, because the date of birth was missing. Those parents can still register; the child
                will have no age, classes or attendance until you re-import with a date of birth.
              </p>
            )}
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
              Paste CSV from the enrollment export, or pick a file. One row per dancer — a
              parent with three children gets three rows sharing their email.
            </p>
            <p style={{ ...theme.typography.bodySmall, fontFamily: theme.fonts.primary, color: theme.colors.txt.secondary, margin: 0 }}>
              Needs <code>email</code>, plus either <code>student_name</code> or{' '}
              <code>student_first_name</code> + <code>student_last_name</code>. Include{' '}
              <code>student_dob</code> and the import also creates the child's student
              record; without it the parent can sign up but the child has no age, classes
              or attendance. Optional: <code>guardian_name</code>, <code>notes</code>.
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
              placeholder={
                'email,guardian_name,student_first_name,student_last_name,student_dob\n' +
                'family@example.com,Jones,Mia,Jones,2018-04-12\n' +
                'family@example.com,Jones,Leo,Jones,2020-11-03'
              }
              disabled={importBusy}
              error={modalError || undefined}
              style={{ fontFamily: theme.fonts.mono, fontSize: '12px' }}
            />
          </div>
        )}
      </Modal>

      {/* ------------------------------------------ give a dancer a login */}
      <Modal
        isOpen={showGrant}
        onClose={() => !grantBusy && setShowGrant(false)}
        title="Give a dancer a login"
        size="md"
        footer={
          grantPicked ? (
            <>
              <Button variant="secondary" onClick={() => setShowGrant(false)} disabled={grantBusy}>Cancel</Button>
              <Button variant="primary" onClick={submitGrant} loading={grantBusy} disabled={!grantEmail.trim()}>
                Create sign-up
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setShowGrant(false)}>Cancel</Button>
          )
        }
      >
        {grantPicked ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Card padding="sm">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ ...theme.typography.body, fontFamily: theme.fonts.primary, fontWeight: 600, color: theme.colors.txt.primary }}>
                  {studentFullName(grantPicked)}
                </span>
                <span style={{ ...theme.typography.bodySmall, fontFamily: theme.fonts.primary, color: theme.colors.txt.tertiary }}>
                  {grantPicked.householdName} family
                  {ageFrom(grantPicked.dateOfBirth, new Date()) !== null && ` · ${ageFrom(grantPicked.dateOfBirth, new Date())}`}
                  {` · ${grantPicked.enrollmentCount} class${grantPicked.enrollmentCount === 1 ? '' : 'es'}`}
                </span>
              </div>
            </Card>
            <Button variant="ghost" size="sm" onClick={() => { setGrantPicked(null); setGrantError(''); }} disabled={grantBusy}>
              Choose a different dancer
            </Button>
            <Input
              label="The dancer's own email"
              type="email"
              autoCapitalize="none"
              placeholder="dancer@example.com"
              value={grantEmail}
              onChange={e => { setGrantEmail(e.target.value); setGrantError(''); }}
              error={grantError || undefined}
              disabled={grantBusy}
            />
            {emailBlockedReason(grantPicked, grantEmail) && (
              <p style={{ ...theme.typography.bodySmall, fontFamily: theme.fonts.primary, color: theme.colors.status.warning, margin: 0 }}>
                {emailBlockedReason(grantPicked, grantEmail)}
              </p>
            )}
            <p style={{ ...theme.typography.caption, fontFamily: theme.fonts.primary, color: theme.colors.txt.tertiary, margin: 0 }}>
              They must register with exactly this address — any other one is not on the roster
              and will be turned away. Their login sees only this dancer, never a sibling.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ ...theme.typography.bodySmall, fontFamily: theme.fonts.primary, color: theme.colors.txt.secondary, margin: 0 }}>
              Find the dancer, then give them their own email address. Only dancers already on
              file can be given a login — if someone is missing, import the roster first.
            </p>
            <SearchInput
              placeholder="Search by dancer, family or email…"
              value={grantSearch}
              onChange={e => setGrantSearch(e.target.value)}
              onClear={() => setGrantSearch('')}
              autoFocus
              disabled={grantLoading}
            />
            {grantError && (
              <p style={{ ...theme.typography.bodySmall, fontFamily: theme.fonts.primary, color: theme.colors.status.error, margin: 0 }}>
                {grantError}
              </p>
            )}
            {grantLoading ? (
              <Spinner />
            ) : !grantSearch.trim() ? (
              <EmptyState title="Search for a dancer" description="By their name, their family name, or the family's email." />
            ) : grantMatches.length === 0 ? (
              <EmptyState
                title="No dancer matches that"
                description="Only dancers already on file appear here. If they are new, import the roster with their date of birth first."
              />
            ) : (
              <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {grantMatches.slice(0, 30).map(s => {
                  const blocked = dancerBlockedReason(s, grantTaken);
                  const age = ageFrom(s.dateOfBirth, new Date());
                  return (
                    <Card
                      key={s.id}
                      padding="sm"
                      hover={!blocked}
                      onClick={blocked ? undefined : () => { setGrantPicked(s); setGrantError(''); }}
                      style={blocked ? { opacity: 0.55 } : undefined}
                    >
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ ...theme.typography.bodySmall, fontFamily: theme.fonts.primary, fontWeight: 600, color: theme.colors.txt.primary, minWidth: 0, overflowWrap: 'anywhere' }}>
                          {studentFullName(s)}
                        </span>
                        {blocked && <Badge variant="info" size="sm">Has a login</Badge>}
                        <span style={{ ...theme.typography.caption, fontFamily: theme.fonts.primary, color: theme.colors.txt.tertiary, minWidth: 0, overflowWrap: 'anywhere' }}>
                          {s.householdName}
                          {age !== null && ` · ${age}`}
                          {` · ${s.enrollmentCount} class${s.enrollmentCount === 1 ? '' : 'es'}`}
                        </span>
                      </div>
                    </Card>
                  );
                })}
                {grantMatches.length > 30 && (
                  <span style={{ ...theme.typography.caption, fontFamily: theme.fonts.primary, color: theme.colors.txt.tertiary }}>
                    {grantMatches.length - 30} more — keep typing to narrow it down.
                  </span>
                )}
              </div>
            )}
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
