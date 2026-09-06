import React, { Suspense, lazy } from 'react';
import { ACTIVE_HOLIDAY } from '../lib/holiday/flag';

/**
 * The seasonal decoration layer. Purely visual, and mountable anywhere.
 *
 * Drop <HolidayLayer /> on a page and, when REACT_APP_HOLIDAY names a holiday,
 * a small cast of characters performs across it on a loop. With the flag unset
 * this renders null before touching anything: no chunk is fetched, no art is
 * downloaded, and the page's markup is identical to what it was before this
 * component existed.
 *
 * TO STAGE IT AGAINST A PAGE'S OWN FURNITURE
 *
 * Add `data-holiday-anchor="name"` to any element and acts can use its live
 * rect — the chooser names `logo`, `staff` and `dancer`, which is how a ghost
 * knows which tile to rise from behind. A page that names nothing still works;
 * acts fall back to viewport-relative staging.
 *
 * The page must establish a stacking context (`position: relative` plus
 * `isolation: isolate`, as ChooserPage does) or the layer's z-indices are
 * negotiated against the whole app instead of that page.
 *
 * WHY THIS COMPONENT IS A SHELL
 *
 * It exists to own the flag check and the chunk boundary, and nothing else. Its
 * OWN <Suspense fallback={null}> matters: without it the nested lazy would
 * suspend all the way up to App's boundary and blank the entire page behind
 * PageLoadingFallback while a decorative layer downloads.
 *
 * Not on staff pages. Motion behind a screen somebody works in all day is a
 * different and much worse idea — the same reasoning as RefractedGlassField.
 */

const HolidayStage = lazy(() => import('./holiday/HolidayStage'));

const HolidayLayer: React.FC = () => {
  if (!ACTIVE_HOLIDAY) return null;

  return (
    <Suspense fallback={null}>
      <HolidayStage holiday={ACTIVE_HOLIDAY} />
    </Suspense>
  );
};

export default HolidayLayer;
