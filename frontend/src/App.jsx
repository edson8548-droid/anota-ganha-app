import React, { Component, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import ProtectedRoute from './components/ProtectedRoute';

import './App.css';

const ROUTE_RELOAD_KEY = 'venpro-route-chunk-reload';

const isLazyLoadFailure = (error) => {
  const message = String(error?.message || error || '');
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
};

const safeSessionGet = (key) => {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSessionSet = (key, value) => {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Session storage can be unavailable in private or restricted browsers.
  }
};

const safeSessionRemove = (key) => {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage restrictions.
  }
};

const lazyWithRetry = (importer) => lazy(async () => {
  try {
    const module = await importer();
    safeSessionRemove(ROUTE_RELOAD_KEY);
    return module;
  } catch (error) {
    if (isLazyLoadFailure(error) && safeSessionGet(ROUTE_RELOAD_KEY) !== '1') {
      safeSessionSet(ROUTE_RELOAD_KEY, '1');
      window.location.reload();
      return new Promise(() => {});
    }
    throw error;
  }
});

const Login = lazyWithRetry(() => import('./pages/Login'));
const Register = lazyWithRetry(() => import('./pages/Register'));
const Landing = lazyWithRetry(() => import('./pages/Landing'));
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const Plans = lazyWithRetry(() => import('./pages/Plans'));
const Checkout = lazyWithRetry(() => import('./pages/Checkout'));
const PaymentSuccess = lazyWithRetry(() => import('./pages/PaymentSuccess'));
const PaymentFailure = lazyWithRetry(() => import('./pages/PaymentFailure'));
const MinhaLicenca = lazyWithRetry(() => import('./pages/MinhaLicenca'));
const AssistenteIA = lazyWithRetry(() => import('./pages/AssistenteIA'));
const Cotacao = lazyWithRetry(() => import('./pages/Cotacao'));
const Disparador = lazyWithRetry(() => import('./pages/Disparador'));
const ForgotPassword = lazyWithRetry(() => import('./pages/ForgotPassword'));
const Vitrine = lazyWithRetry(() => import('./pages/Vitrine'));
const VitrineEditar = lazyWithRetry(() => import('./pages/VitrineEditar'));
const VitrinePublica = lazyWithRetry(() => import('./pages/VitrinePublica'));

const PageFallback = () => (
  <div style={{
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#2B2D31',
    color: '#E1E1E1',
    fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  }}>
    Carregando...
  </div>
);

const RouteErrorFallback = () => (
  <div className="route-error-page">
    <div className="route-error-card">
      <div className="route-error-kicker">Venpro</div>
      <h1>Não foi possível abrir esta tela.</h1>
      <p>Atualize a página para carregar a versão mais recente do sistema. Se continuar, volte ao painel e tente novamente.</p>
      <div className="route-error-actions">
        <button type="button" onClick={() => window.location.reload()}>Tentar novamente</button>
        <button type="button" className="secondary" onClick={() => { window.location.href = '/dashboard'; }}>Voltar ao painel</button>
      </div>
    </div>
  </div>
);

class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[Venpro] Erro ao abrir rota:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <RouteErrorFallback />;
    }
    return this.props.children;
  }
}

function AppRoutes() {
  const location = useLocation();

  return (
    <RouteErrorBoundary key={location.pathname}>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Rota raiz — Landing page */}
          <Route path="/" element={<Landing />} />

          {/* Autenticação */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* Aplicação */}
          <Route path="/dashboard" element={<ProtectedRoute requireSubscription><Dashboard /></ProtectedRoute>} />

          {/* Planos e Checkout */}
          <Route path="/plans" element={<ProtectedRoute><Plans /></ProtectedRoute>} />
          <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />

          <Route path="/minha-licenca" element={<ProtectedRoute><MinhaLicenca /></ProtectedRoute>} />
          <Route path="/assistente" element={<ProtectedRoute requireSubscription><AssistenteIA /></ProtectedRoute>} />
          <Route path="/cotacao" element={<ProtectedRoute requireSubscription><Cotacao /></ProtectedRoute>} />
          <Route path="/disparador-whatsapp" element={<ProtectedRoute requireSubscription><Disparador /></ProtectedRoute>} />
          <Route path="/vitrine" element={<ProtectedRoute requireSubscription><Vitrine /></ProtectedRoute>} />
          <Route path="/vitrine/:id/editar" element={<ProtectedRoute requireSubscription><VitrineEditar /></ProtectedRoute>} />
          <Route path="/oferta/:slug" element={<VitrinePublica />} />
          <Route path="/:empresa/ofertas/:slug" element={<VitrinePublica />} />
          <Route path="/payment-success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
          <Route path="/payment-failure" element={<ProtectedRoute><PaymentFailure /></ProtectedRoute>} />
          <Route path="/payment-pending" element={<ProtectedRoute><PaymentFailure /></ProtectedRoute>} />
          {/* Admin frontend desativado: operações administrativas devem ficar no backend. */}
          <Route path="/admin" element={<Navigate to="/dashboard" replace />} />

          {/* Rota 404 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

function App() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <Router>
          <AppRoutes />
        </Router>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export default App;
