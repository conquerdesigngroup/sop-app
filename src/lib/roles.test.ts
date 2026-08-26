import { isManagementRole, isSuperAdminRole, roleLabel, ROLE_ORDER } from './roles';

describe('isManagementRole', () => {
  it('includes both management tiers', () => {
    expect(isManagementRole('admin')).toBe(true);
    expect(isManagementRole('super_admin')).toBe(true);
  });

  it('excludes team members and absent roles', () => {
    expect(isManagementRole('team')).toBe(false);
    expect(isManagementRole(undefined)).toBe(false);
    expect(isManagementRole(null)).toBe(false);
  });
});

describe('isSuperAdminRole', () => {
  // The whole point of the tier: a plain admin must not pass the narrow test.
  it('is true only for super_admin', () => {
    expect(isSuperAdminRole('super_admin')).toBe(true);
    expect(isSuperAdminRole('admin')).toBe(false);
    expect(isSuperAdminRole('team')).toBe(false);
    expect(isSuperAdminRole(undefined)).toBe(false);
  });
});

describe('roleLabel', () => {
  it('names every known role', () => {
    expect(roleLabel('super_admin')).toBe('Super Admin');
    expect(roleLabel('admin')).toBe('Admin');
    expect(roleLabel('team')).toBe('Team Member');
  });

  // An installed phone can run a bundle older than the database.
  it('degrades to Unknown rather than leaking a raw value', () => {
    expect(roleLabel(undefined)).toBe('Unknown');
    expect(roleLabel('owner' as never)).toBe('Unknown');
  });
});

describe('ROLE_ORDER', () => {
  it('lists most privileged first and covers every role', () => {
    expect(ROLE_ORDER).toEqual(['super_admin', 'admin', 'team']);
  });
});
