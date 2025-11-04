import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import App from './App';
import { Toaster } from "sonner";

// ============================================
// ⭐️ CORREÇÃO APLICADA ⭐️
// O Service Worker foi desativado para desenvolvimento em localhost
// para corrigir o bug de "Internal storage".
// ============================================
/*
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
*/
// ============================================

ReactDOM.render(
  <React.StrictMode>
    <App />
    <Toaster position="top-right" richColors />
  </React.StrictMode>,
  document.getElementById("root")
);