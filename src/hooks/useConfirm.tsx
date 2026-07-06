import React, { useCallback, useRef, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
}

/**
 * Promise-based wrapper around ConfirmDialog, as a drop-in replacement for
 * window.confirm:
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   ...
 *   if (await confirm({ title: 'Delete task?', message: 'This cannot be undone.' })) {
 *     await deleteTask(id);
 *   }
 *   ...
 *   return <div>...{confirmDialog}</div>;
 */
export const useConfirm = () => {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      // If a dialog is somehow already open, treat it as cancelled
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirmDialog = (
    <ConfirmDialog
      isOpen={options !== null}
      title={options?.title ?? ''}
      message={options?.message ?? ''}
      confirmLabel={options?.confirmLabel}
      cancelLabel={options?.cancelLabel}
      variant={options?.variant}
      onConfirm={() => settle(true)}
      onClose={() => settle(false)}
    />
  );

  return { confirm, confirmDialog };
};
