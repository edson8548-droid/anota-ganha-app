import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import ProtectedRoute from './components/ProtectedRoute';

import './App.css';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Landing = lazy(() => import('./pages/Landing'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Plans = lazy(() => import('./pages/Plans'));
const Checkout = lazy(() => import('./pages/Checkout'));
const PaymentSuccess = lazy(() => import('./pages/PaymentSuccess'));
const PaymentFailure = lazy(() => import('./pages/PaymentFailure'));
const MinhaLicenca = lazy(() => import('./pages/MinhaLicenca'));
const AssistenteIA = lazy(() => import('./pages/AssistenteIA'));
const Cotacao = lazy(() => import('./pages/Cotacao'));
const Disparador = lazy(() => import('./pages/Disparador'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Vitrine = lazy(() => import('./pages/Vitrine'));
const VitrineEditar = lazy(() => import('./pages/VitrineEditar'));
const VitrinePublica = lazy(() => import('./pages/VitrinePublica'));

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

function App() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <Router>
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
        </Router>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export default App;
