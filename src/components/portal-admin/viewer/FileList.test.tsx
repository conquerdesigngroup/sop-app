import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FileList from './FileList';
import { mapViewerFile } from '../../../lib/portalViewerFiles';

jest.mock('../../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../../lib/portalStorage', () => ({
  DOCUMENT_BUCKET: 'portal-documents',
  SIGNED_URL_TTL_SECONDS: 3600,
  signDocumentUrls: jest.fn(() => Promise.resolve({})),
}));
jest.mock('../../../lib/activityLog', () => ({ logActivity: jest.fn(() => Promise.resolve()) }));
jest.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ error: jest.fn() }) }));

const BASE = 'https://customer-x.cloudflarestream.com/abc123';

const video = (over: Record<string, unknown> = {}) => mapViewerFile({
  id: 'v1', program_id: 'p1', class_id: 'c1', update_id: null,
  title: 'Recital run-through', description: '', category: null,
  storage_path: null, stream_uid: 'abc123', stream_playback_url: BASE,
  stream_status: 'ready', stream_download_url: `${BASE}/downloads/default.mp4`,
  duration_seconds: 60, file_name: 'run.mov', mime_type: 'video/quicktime',
  size_bytes: 1000, sort_order: 0, is_published: true, created_at: '2026-09-20T18:00:00Z',
  uploaded_by: 'u1', portal_classes: { name: 'Jazz 2' }, portal_programs: null, portal_updates: null,
  ...over,
}, { u1: 'Jamie Rivera' });

const renderList = (files = [video()]) => render(
  <FileList files={files} loading={false} error={null}
    query="" setQuery={() => {}} uploader={null} setUploader={() => {}} />,
);

describe('FileList video playback', () => {
  it('plays in an embedded player, never a link to Cloudflare\'s /watch page', () => {
    renderList();
    // /watch plays nowhere: the video's allowedOrigins exclude
    // cloudflarestream.com, so its own page says "no permission".
    expect(document.querySelector(`a[href$="/watch"]`)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));
    expect(document.querySelector('iframe')).toHaveAttribute('src', `${BASE}/iframe`);
  });

  it('offers no Watch until Cloudflare has finished', () => {
    renderList([video({ stream_status: 'pending', stream_download_url: null })]);
    expect(screen.queryByRole('button', { name: 'Watch' })).toBeNull();
    expect(screen.queryByText('Download')).toBeNull();
  });
});
