import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAdminUsers, getAdminStats, activateUser } from '../services/adminApi';
import { ArrowLeft, Users, DollarSign, TrendingUp, CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminPanel() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showActivateModal, setShowActivateModal] = useState(false);

  useEffect(() => {
    if (user?.role !== 'admin') {
      toast.error('Acesso negado. Apenas administradores.');
      navigate('/');
      return;
    }
    loadData();
  }, [user, navigate]);

  const loadData = async () => {
    try {
      const [usersRes, statsRes] = await Promise.all([
        getAdminUsers(),
        getAdminStats()
      ]);
      setUsers(usersRes.data.users);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error loading admin data:', error);
      toast.error('Erro ao carregar dados administrativos');
    } finally {
      setLoading(false);
    }
  };

  const handleActivateUser = async (email, plan) => {
    try {
      await activateUser(email, plan);
      toast.success(`Usuário ${email} ativado com sucesso!`);
      setShowActivateModal(false);
      setSelectedUser(null);
      loadData();
    } catch (error) {
      console.error('Error activating user:', error);
      toast.error('Erro ao ativar usuário');
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const getDaysRemaining = (expiryDate) => {
    if (!expiryDate) return null;
    const days = Math.floor((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  const getLicenseStatusBadge = (user) => {
    if (user.role === 'admin') {
      return <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full font-semibold">ADMIN</span>;
    }

    const days = getDaysRemaining(user.license_expiry);
    
    if (user.license_type === 'trial') {
      return <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">Trial ({days} dias)</span>;
    }
    if (user.license_type === 'monthly') {
      return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Mensal ({days} dias)</span>;
    }
    if (user.license_type === 'annual') {
      return <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs rounded-full">Anual ({days} dias)</span>;
    }
    if (user.license_type === 'expired') {
      return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">Expirado</span>;
    }
    return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">{user.license_type}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Carregando painel admin...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-md p-4">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/')}
              className="flex items-center px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao Dashboard
            </button>
            <h1 className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              🔧 Painel Administrativo
            </h1>
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Admin: <strong>{user?.email}</strong>
          </span>
        </div>
      </header>

      <main className="p-4 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total de Usuários</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.total_users || 0}</p>
              </div>
              <Users className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Usuários Pagos</p>
                <p className="text-3xl font-bold text-green-600">
                  {(stats?.monthly_users || 0) + (stats?.annual_users || 0)}
                </p>
                <p className="text-xs text-gray-500">
                  {stats?.monthly_users || 0} mensais + {stats?.annual_users || 0} anuais
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Em Trial</p>
                <p className="text-3xl font-bold text-blue-600">{stats?.trial_users || 0}</p>
              </div>
              <Clock className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Receita Mensal</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(stats?.total_monthly_revenue || 0)}
                </p>
                <p className="text-xs text-gray-500">
                  Anual: {formatCurrency(stats?.total_annual_revenue || 0)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Lista de Usuários ({users.length})
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Usuário
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Cadastro
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Expira em
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Último Pagamento
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {users.map((userData) => (
                  <tr key={userData.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{userData.name || 'Sem nome'}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{userData.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {getLicenseStatusBadge(userData)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(userData.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {userData.license_expiry ? formatDate(userData.license_expiry) : 'Ilimitado'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {userData.last_payment_date ? formatDate(userData.last_payment_date) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {userData.role !== 'admin' && (
                        <button
                          onClick={() => {
                            setSelectedUser(userData);
                            setShowActivateModal(true);
                          }}
                          className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                        >
                          Ativar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {showActivateModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
              Ativar Licença
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Usuário: <strong>{selectedUser.email}</strong>
            </p>
            
            <div className="space-y-3">
              <button
                onClick={() => handleActivateUser(selectedUser.email, 'monthly_30')}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-left"
              >
                <div className="font-semibold">Plano Mensal</div>
                <div className="text-sm">R$ 30,00/mês - 30 dias</div>
              </button>
              
              <button
                onClick={() => handleActivateUser(selectedUser.email, 'annual_300')}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 text-left"
              >
                <div className="font-semibold">Plano Anual</div>
                <div className="text-sm">R$ 300,00/ano - 365 dias</div>
              </button>
            </div>

            <button
              onClick={() => {
                setShowActivateModal(false);
                setSelectedUser(null);
              }}
              className="w-full mt-4 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
