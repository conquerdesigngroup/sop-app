import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import TaskFilesEditor from './TaskFilesEditor';
import { TaskFile } from '../../types';

const mockUpload = jest.fn();
jest.mock('../../lib/taskFiles', () => {
  const actual = jest.requireActual('../../lib/taskFiles');
  return {
    ...actual,
    uploadTaskFile: (...args: any[]) => mockUpload(...args),
    signTaskFile: async () => 'https://signed.example/x',
    cachedTaskFileUrl: () => undefined,
  };
});
jest.mock('../../lib/supabase', () => ({ supabase: { storage: { from: jest.fn() } } }));

const record = (name: string): TaskFile => ({
  id: name, path: `u/${name}`, name, mimeType: 'application/pdf', size: 100, uploadedAt: 'now',
});

const Harness: React.FC<{ onBusy?: (b: boolean) => void }> = ({ onBusy }) => {
  const [files, setFiles] = useState<TaskFile[]>([]);
  return <TaskFilesEditor files={files} onChange={setFiles} uid="u" onBusyChange={onBusy} />;
};

const pick = (container: HTMLElement, names: string[]) => {
  const input = container.querySelectorAll('input[type="file"]')[1] as HTMLInputElement;
  const files = names.map(n => new File(['x'], n, { type: 'application/pdf' }));
  fireEvent.change(input, { target: { files } });
};

describe('TaskFilesEditor', () => {
  beforeEach(() => mockUpload.mockReset());

  it('uploads one at a time, says so, and lists each file as it lands', async () => {
    let release: (() => void) | null = null;
    mockUpload.mockImplementation((_uid: string, f: File) =>
      new Promise(resolve => { release = () => resolve(record(f.name)); }));
    const busy: boolean[] = [];
    const { container } = render(<Harness onBusy={b => busy.push(b)} />);

    pick(container, ['a.pdf', 'b.pdf']);
    expect(screen.getByRole('status').textContent).toMatch(/Uploading 1 of 2: a\.pdf/);
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Add files/ }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => { release!(); });
    expect(screen.getByText('a.pdf')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Uploading 2 of 2: b\.pdf/);

    await act(async () => { release!(); });
    expect(screen.getByRole('status').textContent).toMatch(/Added 2 files/);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(busy).toEqual([true, false]);
  });

  it('ignores a second pick while the first batch is still going', async () => {
    let release: (() => void) | null = null;
    mockUpload.mockImplementation((_uid: string, f: File) =>
      new Promise(resolve => { release = () => resolve(record(f.name)); }));
    const { container } = render(<Harness />);

    pick(container, ['a.pdf']);
    pick(container, ['b.pdf']);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    await act(async () => { release!(); });
  });

  it('ends a failure with what to do next instead of going quiet', async () => {
    mockUpload.mockRejectedValue(new Error('Network down'));
    const { container } = render(<Harness />);
    await act(async () => { pick(container, ['a.pdf']); });
    expect(screen.getByRole('status').textContent).toMatch(/Couldn't upload a\.pdf: Network down.*try that one again/);
  });

  it('Cancel stops the batch after the file in flight', async () => {
    let release: (() => void) | null = null;
    mockUpload.mockImplementation((_uid: string, f: File) =>
      new Promise(resolve => { release = () => resolve(record(f.name)); }));
    const { container } = render(<Harness />);

    pick(container, ['a.pdf', 'b.pdf', 'c.pdf']);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => { release!(); });
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toMatch(/Stopped/);
  });
});
