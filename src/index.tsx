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

    const waitingServiceWorker = registration.waiting;
    if (!waitingServiceWorker) return;

    // Non-blocking banner: the app only reloads if the user chooses to update,
    // so nobody loses in-progress work to a forced refresh.
    showUpdateBanner(
      () => {
        waitingServiceWorker.addEventListener('statechange', (event: any) => {
          if (event.target.state === 'activated') {
            window.location.reload();
          }
        });
        waitingServiceWorker.postMessage({ type: 'SKIP_WAITING' });
      }
    );
  },
});

// Lightweight DOM banner (lives outside the React tree so it works even if
// the app is mid-crash or mid-navigation). Uses the theme CSS variables.
function showUpdateBanner(onUpdate: () => void) {
  if (document.getElementById('sw-update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.setAttribute('role', 'status');
  banner.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:24px', 'transform:translateX(-50%)',
    'display:flex', 'align-items:center', 'gap:16px',
    'padding:12px 16px 12px 20px', 'border-radius:12px',
    'background:var(--c-bg-secondary, #161618)',
    'border:2px solid var(--c-bdr-primary, #26262B)',
    'color:var(--c-txt-primary, #F4F4F5)',
    'box-shadow:var(--shadow-lg, 0 8px 16px rgba(0,0,0,0.7))',
    'font-family:Barlow, -apple-system, sans-serif', 'font-size:14px',
    'z-index:10000', 'max-width:calc(100vw - 32px)',
  ].join(';');

  const text = document.createElement('span');
  text.textContent = 'A new version is available.';

  const updateBtn = document.createElement('button');
  updateBtn.textContent = 'Update';
  updateBtn.style.cssText =
    'background:#E2144F;color:#FFF;border:none;border-radius:8px;padding:8px 16px;font-weight:600;font-size:14px;cursor:pointer';
  updateBtn.onclick = () => {
    updateBtn.disabled = true;
    updateBtn.textContent = 'Updating…';
    onUpdate();
  };

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Later';
  dismissBtn.setAttribute('aria-label', 'Dismiss update notification');
  dismissBtn.style.cssText =
    'background:none;color:var(--c-txt-tertiary, #8B8B8B);border:none;padding:8px 4px;font-size:14px;cursor:pointer';
  dismissBtn.onclick = () => banner.remove();

  banner.append(text, updateBtn, dismissBtn);
  document.body.appendChild(banner);
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
