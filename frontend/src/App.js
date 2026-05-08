import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';

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

import './App.css';

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
            <Route path="/dashboard" element={<Dashboard />} />
            
            {/* Planos e Checkout */}
            <Route path="/plans" element={<Plans />} />
            <Route path="/checkout" element={<Checkout />} />
            
            <Route path="/minha-licenca" element={<MinhaLicenca />} />
            <Route path="/assistente" element={<AssistenteIA />} />
            <Route path="/cotacao" element={<Cotacao />} />
            <Route path="/disparador-whatsapp" element={<Disparador />} />
            <Route path="/vitrine" element={<Vitrine />} />
            <Route path="/vitrine/:id/editar" element={<VitrineEditar />} />
            <Route path="/oferta/:slug" element={<VitrinePublica />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/payment-failure" element={<PaymentFailure />} />
            <Route path="/payment-pending" element={<PaymentFailure />} />
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
