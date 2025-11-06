// CRIE ESTE NOVO FICHEIRO: src/pages/AdminDashboard.js
// Esta é a tua nova página de Admin

import React, { useState, useEffect, useMemo } from 'react';
import { adminService } from '../services/admin.service';
import { useAuthContext } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './AdminDashboard.css'; // Vamos criar este ficheiro CSS a seguir

const AdminDashboard = () => {
  const { logout } = useAuthContext();
  const navigate = useNavigate();
  
  const [allUsers, setAllUsers] = useState([]);
  const [allSubscriptions, setAllSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Carregar todos os dados
  useEffect(() => {
    setLoading(true);
    const unsubUsers = adminService.subscribeToAllUsers((users) => {
      setAllUsers(users);
    });
    
    const unsubSubs = adminService.subscribeToAllSubscriptions((subs) => {
      setAllSubscriptions(subs);
      setLoading(false);
    });

    // Limpar os listeners quando o componente sair
    return () => {
      unsubUsers();
      unsubSubs();
    };
  }, []);

  // Calcular as métricas que pediste
  const metrics = useMemo(() => {
    const totalUsers = allUsers.length;
    
    const activeSubscriptions = allSubscriptions.filter(
      sub => sub.status === 'active' || sub.status === 'trialing'
    );
    
    const activePaid = allSubscriptions.filter(sub => sub.status === 'active').length;
    const activeTrial = allSubscriptions.filter(sub => sub.status === 'trialing').length;
    
    return {
      totalUsers,
      totalSubscriptions: allSubscriptions.length,
      activeSubscriptions: activeSubscriptions.length,
      activePaid,
      activeTrial,
    };
  }, [allUsers, allSubscriptions]);

  // Juntar os dados de utilizador + assinatura
  const combinedData = useMemo(() => {
    return allUsers.map(user => {
      const subscription = allSubscriptions.find(sub => sub.id === user.id);
      return {
        ...user,
        subscription: subscription || null,
      };
    }).sort((a, b) => (b.created_at || 0) - (a.created_at || 0)); // Ordenar por mais recentes
  }, [allUsers, allSubscriptions]);

  const handleLogout = () => {
    if (window.confirm('Deseja realmente sair?')) {
      logout();
      navigate('/login');
    }
  };

  const formatDate = (date) => {
    if (!date) return '--';
    return date.toLocaleDateString('pt-BR');
  };

  if (loading) {
    return <div className="admin-loading">Carregando dados do Administrador...</div>;
  }

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <h1>Painel de Administrador</h1>
        <div className="admin-header-actions">
          <span>Bem-vindo, Admin!</span>
          <button onClick={() => navigate('/dashboard')} className="btn-admin-nav">Ir para App</button>
          <button onClick={handleLogout} className="btn-admin-logout">Sair</button>
        </div>
      </header>

      <main className="admin-main">
        {/* Métricas */}
        <div className="admin-metrics-grid">
          <div className="admin-metric-card">
            <div className="metric-value">{metrics.totalUsers}</div>
            <div className="metric-label">Total de Utilizadores</div>
          </div>
          <div className="admin-metric-card">
            <div className="metric-value">{metrics.activeSubscriptions}</div>
            <div className="metric-label">Assinaturas Ativas (Pagas + Trial)</div>
          </div>
          <div className="admin-metric-card">
            <div className="metric-value">{metrics.activePaid}</div>
            <div className="metric-label">Apenas Pagas</div>
          </div>
          <div className="admin-metric-card">
            <div className="metric-value">{metrics.activeTrial}</div>
            <div className="metric-label">Apenas Trial</div>
          </div>
        </div>

        {/* Tabela de Utilizadores e Assinaturas */}
        <div className="admin-table-container">
          <h2>Todos os Utilizadores e Assinaturas</h2>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Utilizador (Email)</th>
                  <th>Nome</th>
                  <th>Status da Assinatura</th>
                  <th>Plano (ID)</th>
                  <th>Vencimento do Trial</th>
                  <th>Data de Registo</th>
                </tr>
              </thead>
              <tbody>
                {combinedData.map(user => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>{user.name || '--'}</td>
                    <td>
                      <span className={`admin-status ${user.subscription?.status || 'none'}`}>
                        {user.subscription?.status || 'Sem Assinatura'}
                      </span>
                    </td>
                    <td>{user.subscription?.planId || '--'}</td>
                    <td>{formatDate(user.subscription?.trialEndsAt)}</td>
                    <td>{formatDate(user.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;