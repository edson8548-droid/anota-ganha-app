// SUBSTITUA COMPLETAMENTE: src/App.js
// VERSÃO V2 - Adiciona a Rota de Admin protegida

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuthContext } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';

// Páginas Normais
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Plans from './pages/Plans';
import Checkout from './pages/Checkout';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentFailure from './pages/PaymentFailure';

// ⭐️ 1. IMPORTAR A NOVA PÁGINA DE ADMIN
import AdminDashboard from './pages/AdminDashboard';

import './App.css';

// ⭐️ 2. CRIAR A ROTA PROTEGIDA PARA O ADMIN
const AdminRoute = ({ children }) => {
  const { user, loading } = useAuthContext();

  if (loading) {
    // Aguarda o 'useAuth' (v2) verificar se o utilizador é admin
    return <div>Carregando verificação de admin...</div>; 
  }

  if (!user) {
    // Se não está logado, volta ao login
    return <Navigate to="/login" replace />;
  }
  
  if (user.isAdmin === true) {
    // Se está logado E é Admin, permite o acesso
    return children;
  }
  
  // Se está logado mas NÃO é Admin, volta ao dashboard normal
  return <Navigate to="/dashboard" replace />;
};

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
            
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/payment-failure" element={<PaymentFailure />} />
            <Route path="/payment-pending" element={<PaymentFailure />} />
            
            {/* ⭐️ 3. ADICIONAR A ROTA DE ADMIN PROTEGIDA ⭐️ */}
            <Route 
              path="/admin" 
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              } 
            />
            
            {/* Rota 404 */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Router>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export default App;