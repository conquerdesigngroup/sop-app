import React from 'react';
import { Modal } from '../ui';
import { PortalDocument } from '../../types';
import { streamIframeUrl } from '../../lib/portalStream';

/**
 * A class video played on THIS page, in Cloudflare's player.
 *
 * WHY NOT A LINK TO CLOUDFLARE'S /watch PAGE
 *
 * The staff screens used to open `<playback>/watch` in a new tab, and every
 * video there said "You don't have permission to view this video". The
 * portal-stream function sets allowedOrigins on each video (didc.app and the
 * production aliases), and Cloudflare enforces it on the player iframe by its
 * Referer: /iframe answers 403 without one and 200 with https://www.didc.app/.
 * The watch page's own player is embedded from cloudflarestream.com, which is
 * not on the list, so it can never play. Parents never hit this because their
 * page embeds the iframe directly (DocumentList's StreamBlock), and this does
 * the same.
 */
const StreamPlayerModal: React.FC<{
  doc: PortalDocument | null;
  onClose: () => void;
}> = ({ doc, onClose }) => (
  <Modal isOpen={doc !== null} onClose={onClose} title={doc?.title ?? ''} size="xl">
    {doc?.streamPlaybackUrl && (
      // A 16:9 box held open with padding, as StreamBlock does, so older iOS
      // without aspect-ratio still gets a frame. Literal black letterbox.
      <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', backgroundColor: '#000000' }}>
        <iframe
          src={streamIframeUrl(doc.streamPlaybackUrl)}
          title={doc.title}
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    )}
  </Modal>
);

export default StreamPlayerModal;
