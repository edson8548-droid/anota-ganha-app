import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import Login from '../pages/Login';
import Register from '../pages/Register';
import Dashboard from '../pages/Dashboard';

const Home = () => (
  <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
    <h1 style={{ color: '#3498db', marginBottom: '20px' }}>🎉 App Funcionando com Firebase!</h1>
    <p style={{ fontSize: '18px', color: '#666' }}>Autenticação e Firestore conectados!</p>
    <div style={{ marginTop: '30px' }}>
      <a href="/login" style={{ 
        padding: '12px 24px', 
        backgroundColor: '#3498db', 
        color: 'white', 
        textDecoration: 'none',
        borderRadius: '6px',
        marginRight: '10px'
      }}>
        Fazer Login
      </a>
      <a href="/register" style={{ 
        padding: '12px 24px', 
        backgroundColor: '#27ae60', 
        color: 'white', 
        textDecoration: 'none',
        borderRadius: '6px'
      }}>
        Criar Conta
      </a>
    </div>
  </div>
);

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } 
      />
      
      <Route path="/" element={<Home />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
