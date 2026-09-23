import React, { useEffect, useState } from 'react';
import { theme } from '../../theme';
import { PortalDocument } from '../../types';
import { loadUpdateFilesQuietly } from '../../lib/updateFiles';
import { DocumentList } from './DocumentList';

/**
 * The files attached to an info post (v65), as a parent sees them.
 *
 * WHY DocumentList AND NOT A LIST OF LINKS
 *
 * Because a photo should be a photo. DocumentList already decides per file
 * whether it is a picture to look at, a video to play, a recording to hear or
 * a row to download, and it carries the two things a list of anchors would
 * quietly lose: pre-signed URLs, so a tap is never an await away from a
 * navigation iOS will drop, and Save to Photos on a phone. A second renderer
 * would be the one that forgets both.
 *
 * WHY A FAILURE HERE IS SILENT
 *
 * The words are the announcement. A post whose attachments could not be
 * fetched should still say what it says, rather than replacing an
 * announcement with an error about a file.
 */

/**
 * Attachments for a whole page of posts, in one request, keyed by post id.
 *
 * Keyed on the ids rather than the array: the pages above re-render often and
 * `updates` is a fresh array each time, which would re-fetch forever.
 */
export const useUpdateFiles = (updateIds: string[]): Record<string, PortalDocument[]> => {
  const [files, setFiles] = useState<Record<string, PortalDocument[]>>({});
  const key = updateIds.join(' ');

  useEffect(() => {
    const ids = key ? key.split(' ') : [];
    if (ids.length === 0) {
      setFiles({});
      return;
    }
    let cancelled = false;
    loadUpdateFilesQuietly(ids).then(next => { if (!cancelled) setFiles(next); });
    return () => { cancelled = true; };
  }, [key]);

  return files;
};

const UpdateFiles: React.FC<{
  files: PortalDocument[] | undefined;
  /** Fired when a parent opens or saves one. ClassDetail passes the logger. */
  onDownload?: (doc: PortalDocument) => void;
}> = ({ files, onDownload }) => {
  if (!files || files.length === 0) return null;

  return (
    <div style={{ marginTop: theme.spacing.md }}>
      <h3 style={{
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.mono,
        color: theme.colors.txt.tertiary,
        margin: `0 0 ${theme.spacing.sm}`,
      }}>
        {files.length === 1 ? 'ATTACHED FILE' : `ATTACHED FILES (${files.length})`}
      </h3>
      <DocumentList documents={files} onDownload={onDownload} />
    </div>
  );
};

export default UpdateFiles;
