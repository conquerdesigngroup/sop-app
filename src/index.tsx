import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for PWA functionality
serviceWorkerRegistration.register({
  onSuccess: () => {
    console.log('Service worker registered successfully');
    // Check for updates every 60 seconds
    setInterval(() => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CHECK_FOR_UPDATE' });
      }
    }, 60000);
  },
  onUpdate: (registration) => {
    console.log('New content available');

    // Non-blocking banner: the app only reloads if the user chooses to update,
    // so nobody loses in-progress work to a forced refresh.
    //
    // WHY THIS IS NOT JUST "postMessage and wait"
    //
    // service-worker.js calls self.skipWaiting() at the end of its install
    // handler, so a new worker never rests in the `waiting` state — it goes
    // installing -> activating -> activated on its own. The previous version of
    // this code read registration.waiting, then waited for THAT worker to fire
    // a statechange to 'activated'. By the time anyone clicked Update, the
    // worker had already activated, no further statechange was ever coming, and
    // the button sat on "Updating…" forever.
    //
    // It also bailed out entirely when registration.waiting was null, so the
    // banner sometimes never appeared even though the page was running stale
    // JavaScript.
    //
    // What actually matters here is reloading the page: the new worker is
    // already in charge, the open tab is just still running the old bundle. So
    // reload on whichever signal arrives first, and reload regardless if none
    // does.
    showUpdateBanner(() => {
      let done = false;
      const reload = () => {
        if (done) return;
        done = true;
        window.location.reload();
      };

      const waiting = registration.waiting;

      // Nothing waiting: the new worker already took over. Just reload.
      if (!waiting) {
        reload();
        return;
      }

      // Fires when the new worker takes control via clients.claim().
      navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });

      // Fires if the worker is still short of 'activated' when we get here.
      waiting.addEventListener('statechange', (event: any) => {
        if (event.target.state === 'activated') reload();
      });

      // Already past 'activated' — neither event above will ever fire.
      if (waiting.state === 'activated') {
        reload();
        return;
      }

      waiting.postMessage({ type: 'SKIP_WAITING' });

      // Backstop. Every path above is event-driven and every one of them can
      // lose a race with a worker that activates itself during install. A
      // reload is cheap and idempotent; a button stuck on "Updating…" is not.
      window.setTimeout(reload, 2000);
    });
  },
});

// Lightweight DOM banner (lives outside the React tree so it works even if
// the app is mid-crash or mid-navigation). Uses the theme CSS variables.
function showUpdateBanner(onUpdate: () => void) {
  if (document.getElementById('sw-update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.setAttribute('role', 'status');
  // Sit above the bottom navigation when it is on screen, rather than on top
  // of it. The banner is built outside React and does not know the route, so
  // it asks the DOM.
  const overBottomNav = !!document.querySelector('[data-bottom-nav]');
  const bottom = overBottomNav
    ? 'calc(76px + env(safe-area-inset-bottom, 0px))'
    : 'calc(24px + env(safe-area-inset-bottom, 0px))';

  banner.style.cssText = [
    // left+right+margin:auto rather than left:50% + translateX: without a width
    // the box shrink-wrapped, the two fixed-width buttons took what they needed
    // and the message was left wrapping onto three lines in the remainder.
    'position:fixed', 'left:16px', 'right:16px', `bottom:${bottom}`,
    'margin:0 auto', 'max-width:440px',
    'display:flex', 'align-items:center', 'gap:16px',
    'padding:12px 16px 12px 20px', 'border-radius:12px',
    'background:var(--c-bg-secondary, #161618)',
    'border:2px solid var(--c-bdr-primary, #26262B)',
    'color:var(--c-txt-primary, #F4F4F5)',
    'box-shadow:var(--shadow-lg, 0 8px 16px rgba(0,0,0,0.7))',
    'font-family:Barlow, -apple-system, sans-serif', 'font-size:14px',
    'z-index:10000',
  ].join(';');

  const text = document.createElement('span');
  text.textContent = 'A new version is available.';
  // The message is the only part that should give up space; the two buttons
  // below are fixed-width and must never be squeezed into ellipsis.
  text.style.cssText = 'flex:1;min-width:0';

  const updateBtn = document.createElement('button');
  updateBtn.textContent = 'Update';
  updateBtn.style.cssText =
    'background:#E2144F;color:#FFF;border:none;border-radius:8px;padding:8px 16px;' +
    'font-weight:600;font-size:14px;cursor:pointer;' +
    // Without these the label clipped to "Updat" at 375px, and worse once it
    // became the longer "Updating…".
    'flex-shrink:0;white-space:nowrap';
  updateBtn.onclick = () => {
    updateBtn.disabled = true;
    updateBtn.textContent = 'Updating…';
    onUpdate();
  };

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Later';
  dismissBtn.setAttribute('aria-label', 'Dismiss update notification');
  dismissBtn.style.cssText =
    'background:none;color:var(--c-txt-tertiary, #8B8B8B);border:none;padding:8px 4px;' +
    'font-size:14px;cursor:pointer;flex-shrink:0;white-space:nowrap';
  dismissBtn.onclick = () => banner.remove();

  banner.append(text, updateBtn, dismissBtn);
  document.body.appendChild(banner);
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
