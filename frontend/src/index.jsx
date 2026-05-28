import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from './App';
import { Toaster } from "sonner";

const ROUTE_RELOAD_KEY = 'venpro-route-chunk-reload';
const ROUTE_RELOAD_PARAM = 'venpro_reload';

const isRouteLoadFailure = (error) => {
  const message = String(error?.message || error?.reason?.message || error || '');
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|Failed to load module script|error loading dynamically imported module|NetworkError when attempting to fetch resource|Load failed/i.test(message);
};

const reloadOnceForFreshAssets = () => {
  try {
    if (window.sessionStorage.getItem(ROUTE_RELOAD_KEY) === '1') return;
    window.sessionStorage.setItem(ROUTE_RELOAD_KEY, '1');
    window.location.reload();
    return;
  } catch {
    // Some in-app mobile browsers restrict sessionStorage. Fall back to a URL marker
    // so a failed asset cannot cause an endless reload loop.
  }

  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get(ROUTE_RELOAD_PARAM) === '1') return;
    url.searchParams.set(ROUTE_RELOAD_PARAM, '1');
    window.location.replace(url.toString());
    return;
  } catch {
    // Last resort: reload once for normal browsers.
  }

  window.location.reload();
};

window.addEventListener('unhandledrejection', (event) => {
  if (isRouteLoadFailure(event.reason)) {
    event.preventDefault();
    reloadOnceForFreshAssets();
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
      if (registrations.length) {
        console.info(`[SW] ${registrations.length} service worker antigo removido.`);
      }
    } catch (error) {
      console.warn('[SW] Não foi possível remover service worker antigo.', error);
    }
  });
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
    <Toaster position="top-right" richColors />
  </React.StrictMode>
);
