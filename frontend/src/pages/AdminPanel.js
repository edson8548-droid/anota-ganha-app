1|import React, { useState, useEffect } from 'react';
2|import { useNavigate } from 'react-router-dom';
3|import { useAuth } from '../contexts/AuthContext';
4|import { getAdminUsers, getAdminStats, activateUser } from '../services/adminApi';
5|import { ArrowLeft, Users, DollarSign, TrendingUp, CheckCircle, XCircle, Clock } from 'lucide-react';
6|import { toast } from 'sonner';
7|
8|export default function AdminPanel() {
9|  const { user, logout } = useAuth();
10|  const navigate = useNavigate();
11|  const [users, setUsers] = useState([]);
12|  const [stats, setStats] = useState(null);
13|  const [loading, setLoading] = useState(true);
14|  const [selectedUser, setSelectedUser] = useState(null);
15|  const [showActivateModal, setShowActivateModal] = useState(false);
16|
17|  useEffect(() => {
18|    if (user?.role !== 'admin') {
19|      toast.error('Acesso negado. Apenas administradores.');
20|      navigate('/');
21|      return;
22|    }
23|    loadData();
24|  }, [user, navigate]);
25|
26|  const loadData = async () => {
27|    try {
28|      const [usersRes, statsRes] = await Promise.all([
29|        getAdminUsers(),
30|        getAdminStats()
31|      ]);
32|      setUsers(usersRes.data.users);
33|      setStats(statsRes.data);
34|    } catch (error) {
35|      console.error('Error loading admin data:', error);
36|      toast.error('Erro ao carregar dados administrativos');
37|    } finally {
38|      setLoading(false);
39|    }
40|  };
41|
42|  const handleActivateUser = async (email, plan) => {
43|    try {
44|      await activateUser(email, plan);
45|      toast.success(`Usuário ${email} ativado com sucesso!`);
46|      setShowActivateModal(false);
47|      setSelectedUser(null);
48|      loadData();
49|    } catch (error) {
50|      console.error('Error activating user:', error);
51|      toast.error('Erro ao ativar usuário');
52|    }
53|  };
54|
55|  const formatCurrency = (value) => {
56|    return new Intl.NumberFormat('pt-BR', {
57|      style: 'currency',
58|      currency: 'BRL'
59|    }).format(value || 0);
60|  };
61|
62|  const formatDate = (dateString) => {
63|    if (!dateString) return 'N/A';
64|    return new Date(dateString).toLocaleDateString('pt-BR');
65|  };
66|
67|  const getDaysRemaining = (expiryDate) => {
68|    if (!expiryDate) return null;
69|    const days = Math.floor((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
70|    return Math.max(0, days);
71|  };
72|
73|  const getLicenseStatusBadge = (user) => {
74|    if (user.role === 'admin') {
75|      return <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full font-semibold">ADMIN</span>;
76|    }
77|
78|    const days = getDaysRemaining(user.license_expiry);
79|    
80|    if (user.license_type === 'trial') {
81|      return <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">Trial ({days} dias)</span>;
82|    }
83|    if (user.license_type === 'monthly') {
84|      return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Mensal ({days} dias)</span>;
85|    }
86|    if (user.license_type === 'annual') {
87|      return <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs rounded-full">Anual ({days} dias)</span>;
88|    }
89|    if (user.license_type === 'expired') {
90|      return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">Expirado</span>;
91|    }
92|    return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">{user.license_type}</span>;
93|  };
94|
95|  if (loading) {
96|    return (
97|      <div className="flex items-center justify-center min-h-screen">
98|        <div className="text-xl">Carregando painel admin...</div>
99|      </div>
100|    );
101|  }
102|
103|  return (
104|    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
105|      {/* Header */}
106|      <header className="bg-white dark:bg-gray-800 shadow-md p-4">
107|        <div className="flex justify-between items-center max-w-7xl mx-auto">
108|          <div className="flex items-center space-x-4">
109|            <button
110|              onClick={() => navigate('/')}
111|              className="flex items-center px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
112|            >
113|              <ArrowLeft className="w-4 h-4 mr-2" />
114|              Voltar ao Dashboard
115|            </button>
116|            <h1 className="text-2xl font-bold text-purple-600 dark:text-purple-400">
117|              🔧 Painel Administrativo
118|            </h1>
119|          </div>
120|          <span className="text-sm text-gray-600 dark:text-gray-400">
121|            Admin: <strong>{user?.email}</strong>
122|          </span>
123|        </div>
124|      </header>
125|
126|      <main className="p-4 max-w-7xl mx-auto">
127|        {/* Stats Cards */}
128|        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
129|          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
130|            <div className="flex items-center justify-between">
131|              <div>
132|                <p className="text-sm text-gray-600 dark:text-gray-400">Total de Usuários</p>
133|                <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.total_users || 0}</p>
134|              </div>
135|              <Users className="w-8 h-8 text-blue-600" />
136|            </div>
137|          </div>
138|
139|          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
140|            <div className="flex items-center justify-between">
141|              <div>
142|                <p className="text-sm text-gray-600 dark:text-gray-400">Usuários Pagos</p>
143|                <p className="text-3xl font-bold text-green-600">
144|                  {(stats?.monthly_users || 0) + (stats?.annual_users || 0)}
145|                </p>
146|                <p className="text-xs text-gray-500">
147|                  {stats?.monthly_users || 0} mensais + {stats?.annual_users || 0} anuais
148|                </p>
149|              </div>
150|              <CheckCircle className="w-8 h-8 text-green-600" />
151|            </div>
152|          </div>
153|
154|          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
155|            <div className="flex items-center justify-between">
156|              <div>
157|                <p className="text-sm text-gray-600 dark:text-gray-400">Em Trial</p>
158|                <p className="text-3xl font-bold text-blue-600">{stats?.trial_users || 0}</p>
159|              </div>
160|              <Clock className="w-8 h-8 text-blue-600" />
161|            </div>
162|          </div>
163|
164|          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
165|            <div className="flex items-center justify-between">
166|              <div>
167|                <p className="text-sm text-gray-600 dark:text-gray-400">Receita Mensal</p>
168|                <p className="text-2xl font-bold text-green-600">
169|                  {formatCurrency(stats?.total_monthly_revenue || 0)}
170|                </p>
171|                <p className="text-xs text-gray-500">
172|                  Anual: {formatCurrency(stats?.total_annual_revenue || 0)}
173|                </p>
174|              </div>
175|              <DollarSign className="w-8 h-8 text-green-600" />
176|            </div>
177|          </div>
178|        </div>
179|
180|        {/* Users Table */}
181|        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
182|          <div className="p-4 border-b dark:border-gray-700">
183|            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
184|              Lista de Usuários ({users.length})
185|            </h2>
186|          </div>
187|
188|          <div className="overflow-x-auto">
189|            <table className="w-full">
190|              <thead className="bg-gray-50 dark:bg-gray-700">
191|                <tr>
192|                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
193|                    Usuário
194|                  </th>
195|                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
196|                    Status
197|                  </th>
198|                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
199|                    Cadastro
200|                  </th>
201|                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
202|                    Expira em
203|                  </th>
204|                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
205|                    Último Pagamento
206|                  </th>
207|                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
208|                    Ações
209|                  </th>
210|                </tr>
211|              </thead>
212|              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
213|                {users.map((userData) => (
214|                  <tr key={userData.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
215|                    <td className="px-4 py-3">
216|                      <div>
217|                        <p className="font-medium text-gray-900 dark:text-white">{userData.name || 'Sem nome'}</p>
218|                        <p className="text-sm text-gray-500 dark:text-gray-400">{userData.email}</p>
219|                      </div>
220|                    </td>
221|                    <td className="px-4 py-3">
222|                      {getLicenseStatusBadge(userData)}
223|                    </td>
224|                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
225|                      {formatDate(userData.created_at)}
226|                    </td>
227|                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
228|                      {userData.license_expiry ? formatDate(userData.license_expiry) : 'Ilimitado'}
229|                    </td>
230|                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
231|                      {userData.last_payment_date ? formatDate(userData.last_payment_date) : '-'}
232|                    </td>
233|                    <td className="px-4 py-3">
234|                      {userData.role !== 'admin' && (
235|                        <button
236|                          onClick={() => {
237|                            setSelectedUser(userData);
238|                            setShowActivateModal(true);
239|                          }}
240|                          className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
241|                        >
242|                          Ativar
243|                        </button>
244|                      )}
245|                    </td>
246|                  </tr>
247|                ))}
248|              </tbody>
249|            </table>
250|          </div>
251|        </div>
252|      </main>
253|
254|      {/* Activate User Modal */}
255|      {showActivateModal && selectedUser && (
256|        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
257|          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md p-6">
258|            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
259|              Ativar Licença
260|            </h3>
261|            <p className="text-gray-600 dark:text-gray-400 mb-4">
262|              Usuário: <strong>{selectedUser.email}</strong>
263|            </p>
264|            
265|            <div className="space-y-3">
266|              <button
267|                onClick={() => handleActivateUser(selectedUser.email, 'monthly_30')}
268|                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-left"
269|              >
270|                <div className="font-semibold">Plano Mensal</div>
271|                <div className="text-sm">R$ 30,00/mês - 30 dias</div>
272|              </button>
273|              
274|              <button
275|                onClick={() => handleActivateUser(selectedUser.email, 'annual_300')}
276|                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 text-left"
277|              >
278|                <div className="font-semibold">Plano Anual</div>
279|                <div className="text-sm">R$ 300,00/ano - 365 dias</div>
280|              </button>
281|            </div>
282|
283|            <button
284|              onClick={() => {
285|                setShowActivateModal(false);
286|                setSelectedUser(null);
287|              }}
288|              className="w-full mt-4 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
289|            >
290|              Cancelar
291|            </button>
292|          </div>
293|        </div>
294|      )}
295|    </div>
296|  );
297|}
298|
