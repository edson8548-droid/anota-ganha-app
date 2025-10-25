import React from 'react';
import { X, MapPin, TrendingUp, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function CityStatsModal({ isOpen, onClose, stats }) {
  if (!isOpen || !stats) return null;

  const { campaign, city_stats, total_cities } = stats;

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  // Prepare chart data
  const chartData = Object.entries(city_stats || {}).map(([cityName, data]) => {
    const totalValue = Object.values(data.products).reduce((sum, p) => sum + p.total_value, 0);
    const totalPositivados = Object.values(data.products).reduce((sum, p) => sum + p.positivados, 0);
    
    return {
      cidade: cityName,
      'Total Vendido': totalValue,
      'Clientes': data.total_clients,
      'Positivados': totalPositivados
    };
  }).sort((a, b) => b['Total Vendido'] - a['Total Vendido']);

  // Calculate totals
  const totalClients = Object.values(city_stats || {}).reduce((sum, data) => sum + data.total_clients, 0);
  const totalSold = Object.values(city_stats || {}).reduce((sum, data) => {
    return sum + Object.values(data.products).reduce((pSum, p) => pSum + p.total_value, 0);
  }, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" data-testid="city-stats-modal">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-6xl p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              Relatório por Cidades
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Campanha: {campaign?.name}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-100 dark:bg-blue-900 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 dark:text-blue-300">Total de Cidades</p>
                <p className="text-3xl font-bold text-blue-800 dark:text-blue-100">{total_cities}</p>
              </div>
              <MapPin className="w-8 h-8 text-blue-600 dark:text-blue-300" />
            </div>
          </div>

          <div className="bg-green-100 dark:bg-green-900 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 dark:text-green-300">Total de Clientes</p>
                <p className="text-3xl font-bold text-green-800 dark:text-green-100">{totalClients}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600 dark:text-green-300" />
            </div>
          </div>

          <div className="bg-purple-100 dark:bg-purple-900 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 dark:text-purple-300">Total Vendido</p>
                <p className="text-2xl font-bold text-purple-800 dark:text-purple-100">
                  {formatCurrency(totalSold)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-purple-600 dark:text-purple-300" />
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">
            Vendas por Cidade
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="cidade" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip formatter={(value, name) => {
                if (name === 'Total Vendido') return formatCurrency(value);
                return value;
              }} />
              <Legend />
              <Bar dataKey="Total Vendido" fill="#10b981" />
              <Bar dataKey="Clientes" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Detailed City Stats */}
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">
            Detalhes por Cidade
          </h3>
          <div className="space-y-4">
            {Object.entries(city_stats || {}).sort((a, b) => {
              const aTotal = Object.values(a[1].products).reduce((sum, p) => sum + p.total_value, 0);
              const bTotal = Object.values(b[1].products).reduce((sum, p) => sum + p.total_value, 0);
              return bTotal - aTotal;
            }).map(([cityName, data]) => {
              const totalValue = Object.values(data.products).reduce((sum, p) => sum + p.total_value, 0);
              const totalGoal = Object.values(data.products).reduce((sum, p) => sum + p.goal, 0);
              const progress = totalGoal > 0 ? (totalValue / totalGoal * 100).toFixed(1) : 0;
              
              return (
                <div key={cityName} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border-l-4 border-blue-500">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center">
                      <MapPin className="w-5 h-5 mr-2 text-blue-600" />
                      <h4 className="font-bold text-lg text-gray-800 dark:text-gray-200">{cityName}</h4>
                    </div>
                    <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm font-semibold">
                      {data.total_clients} clientes
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                    <div className="bg-white dark:bg-gray-800 rounded p-3">
                      <p className="text-xs text-gray-500">Total Vendido</p>
                      <p className="text-lg font-bold text-green-600">{formatCurrency(totalValue)}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded p-3">
                      <p className="text-xs text-gray-500">Meta Total</p>
                      <p className="text-lg font-bold text-purple-600">{formatCurrency(totalGoal)}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded p-3">
                      <p className="text-xs text-gray-500">Progresso</p>
                      <p className="text-lg font-bold text-blue-600">{progress}%</p>
                    </div>
                  </div>

                  {/* Products */}
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Produtos:</p>
                    {Object.entries(data.products).map(([productName, productData]) => (
                      <div key={productName} className="bg-white dark:bg-gray-800 rounded p-2">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium text-sm">{productName}</span>
                          <span className="text-xs text-gray-500">
                            {productData.positivados} / {data.total_clients} positivados
                          </span>
                        </div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>Vendido: <strong className="text-green-600">{formatCurrency(productData.total_value)}</strong></span>
                          <span>Meta: <strong className="text-purple-600">{formatCurrency(productData.goal)}</strong></span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              productData.goal_percentage >= 100 ? 'bg-green-500' :
                              productData.goal_percentage >= 75 ? 'bg-blue-500' :
                              productData.goal_percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(productData.goal_percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
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


