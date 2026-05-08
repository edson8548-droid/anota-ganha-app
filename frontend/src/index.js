import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import App from './App';
import { Toaster } from "sonner";

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

ReactDOM.render(
  <React.StrictMode>
    <App />
    <Toaster position="top-right" richColors />
  </React.StrictMode>,
  document.getElementById("root")
);
