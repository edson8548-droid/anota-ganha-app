import React from 'react';
import { X, TrendingUp, Target, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function StatsModal({ isOpen, onClose, stats }) {
  if (!isOpen || !stats) return null;

  const { campaign, total_clients, product_stats } = stats;

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  // Prepare chart data
  const chartData = Object.entries(product_stats || {}).map(([name, data]) => ({
    name,
    'Valor Vendido': data.total_value,
    'Meta': data.goal,
    'Positivados': data.positivados
  }));

  // Calculate totals
  const totalSold = Object.values(product_stats || {}).reduce((sum, data) => sum + data.total_value, 0);
  const totalGoal = Object.values(product_stats || {}).reduce((sum, data) => sum + data.goal, 0);
  const overallProgress = totalGoal > 0 ? (totalSold / totalGoal * 100).toFixed(1) : 0;

  // Sort products by performance
  const sortedProducts = Object.entries(product_stats || {})
    .sort((a, b) => b[1].total_value - a[1].total_value);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" data-testid="stats-modal">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-6xl p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            Estatísticas: {campaign?.name}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-100 dark:bg-blue-900 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 dark:text-blue-300">Total de Clientes</p>
                <p className="text-3xl font-bold text-blue-800 dark:text-blue-100">{total_clients}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-600 dark:text-blue-300" />
            </div>
          </div>

          <div className="bg-green-100 dark:bg-green-900 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 dark:text-green-300">Total Vendido</p>
                <p className="text-2xl font-bold text-green-800 dark:text-green-100">
                  {formatCurrency(totalSold)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-green-600 dark:text-green-300" />
            </div>
          </div>

          <div className="bg-purple-100 dark:bg-purple-900 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 dark:text-purple-300">Meta Total</p>
                <p className="text-2xl font-bold text-purple-800 dark:text-purple-100">
                  {formatCurrency(totalGoal)}
                </p>
              </div>
              <Target className="w-8 h-8 text-purple-600 dark:text-purple-300" />
            </div>
          </div>

          <div className="bg-orange-100 dark:bg-orange-900 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600 dark:text-orange-300">Progresso</p>
                <p className="text-3xl font-bold text-orange-800 dark:text-orange-100">
                  {overallProgress}%
                </p>
              </div>
              <div className="text-orange-600 dark:text-orange-300">📊</div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">
            Desempenho por Produto
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="Valor Vendido" fill="#10b981" />
              <Bar dataKey="Meta" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Detailed Product Stats */}
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">
            Detalhes por Produto
          </h3>
          <div className="space-y-3">
            {sortedProducts.map(([productName, data]) => (
              <div key={productName} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200">{productName}</h4>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {data.positivados} / {total_clients} clientes
                  </span>
                </div>
                
                <div className="grid grid-cols-3 gap-4 mb-2">
                  <div>
                    <p className="text-xs text-gray-500">Vendido</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(data.total_value)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Meta</p>
                    <p className="text-lg font-bold text-purple-600">{formatCurrency(data.goal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Progresso</p>
                    <p className="text-lg font-bold text-blue-600">{data.goal_percentage.toFixed(1)}%</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      data.goal_percentage >= 100 ? 'bg-green-500' :
                      data.goal_percentage >= 75 ? 'bg-blue-500' :
                      data.goal_percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(data.goal_percentage, 100)}%` }}
                  />
                </div>
                
                <div className="mt-2 text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    Taxa de positivação: <strong>{data.percentage.toFixed(1)}%</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

