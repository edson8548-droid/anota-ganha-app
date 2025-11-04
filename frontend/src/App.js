// SUBSTITUA COMPLETAMENTE: src/App.js
// App.js final com TODAS as rotas de pagamento

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Plans from './pages/Plans';
import Checkout from './pages/Checkout';

// 1. IMPORTAR AS NOVAS PÁGINAS
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentFailure from './pages/PaymentFailure';

import './App.css';

function App() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <Router>
          <Routes>
            {/* Rota raiz */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            
            {/* Autenticação */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            {/* Aplicação */}
            <Route path="/dashboard" element={<Dashboard />} />
            
            {/* Planos e Checkout */}
            <Route path="/plans" element={<Plans />} />
            <Route path="/checkout" element={<Checkout />} />
            
            {/* ⭐️ 2. ADICIONAR AS ROTAS DE STATUS DE PAGAMENTO ⭐️ */}
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/payment-failure" element={<PaymentFailure />} />
            <Route path="/payment-pending" element={<PaymentFailure />} /> {/* Reutiliza a página de falha para pendente */}
            
            {/* Rota 404 */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Router>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export default App;