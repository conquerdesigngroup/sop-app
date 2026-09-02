import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PortalAdminTabs from './PortalAdminTabs';

// react-router-dom resolves through the parent checkout's node_modules, which
// jest's resolver does not reach from this worktree. Only useNavigate is used
// here, so a virtual mock is both sufficient and the thing worth asserting on.
// The `mock` prefix is required: jest hoists the factory above the file, and
// only names starting with `mock` may be referenced from inside it.
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });

describe('PortalAdminTabs', () => {
  beforeEach(() => mockNavigate.mockClear());

  it('names the editing screen "Portal editor", not "Portal"', () => {
    render(<PortalAdminTabs active="editor" canViewEveryone />);
    expect(screen.getByText('Portal editor')).toBeInTheDocument();
    expect(screen.getByText('Portal viewer')).toBeInTheDocument();
  });

  it('renders nothing at all below super admin', () => {
    // Omitted, not disabled. A greyed-out tab advertises a room you cannot
    // enter; an absent one says nothing, which is what an instructor needs.
    const { container } = render(<PortalAdminTabs active="editor" canViewEveryone={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Portal viewer')).not.toBeInTheDocument();
  });

  it('marks the current area so the row cannot show two actives', () => {
    render(<PortalAdminTabs active="viewer" canViewEveryone />);
    expect(screen.getByText('Portal viewer')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('Portal editor')).not.toHaveAttribute('aria-current', 'true');
  });

  it('routes to the other area, and does not re-navigate to the one already open', () => {
    render(<PortalAdminTabs active="editor" canViewEveryone />);

    fireEvent.click(screen.getByText('Portal editor'));
    expect(mockNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Portal viewer'));
    expect(mockNavigate).toHaveBeenCalledWith('/portal-admin/viewer');
  });
});
