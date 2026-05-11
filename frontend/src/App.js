import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import ProtectedRoute from './components/ProtectedRoute';

// Páginas Normais
import Login from './pages/Login';
import Register from './pages/Register';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Plans from './pages/Plans';
import Checkout from './pages/Checkout';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentFailure from './pages/PaymentFailure';
import MinhaLicenca from './pages/MinhaLicenca';
import AssistenteIA from './pages/AssistenteIA';
import Cotacao from './pages/Cotacao';
import Disparador from './pages/Disparador';
import ForgotPassword from './pages/ForgotPassword';
import Vitrine from './pages/Vitrine';
import VitrineEditar from './pages/VitrineEditar';
import VitrinePublica from './pages/VitrinePublica';
import { startExtensionTokenBridge } from './utils/extensionTokenBridge';

import './App.css';

startExtensionTokenBridge();

function App() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <Router>
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
        </Router>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export default App;
