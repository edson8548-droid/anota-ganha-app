import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from './App';
import { Toaster } from "sonner";

// Registrar Service Worker para PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        console.log('✅ PWA: Service Worker registrado!', registration.scope);
      })
      .catch((error) => {
        console.log('❌ PWA: Erro ao registrar Service Worker:', error);
      });
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
    <Toaster position="top-right" richColors />
  </React.StrictMode>,
);
