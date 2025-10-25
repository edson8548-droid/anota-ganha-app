import React, { useState } from 'react';
import { X, TrendingUp, Target, DollarSign, Factory, ChevronDown, ChevronUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function StatsModalIndustries({ isOpen, onClose, campaign, clients }) {
  const [expandedIndustry, setExpandedIndustry] = useState(null);

  if (!isOpen || !campaign || !clients) return null;

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  // Calculate statistics by industry
  const calculateIndustryStats = () => {
    const stats = {};

    campaign.industries?.forEach(industry => {
      stats[industry.name] = {
        goal: industry.goal,
        total_value: 0,
        positivados: 0,
        nao_positivados: 0,
        products: {}
      };

      // Initialize products
      industry.products.forEach(product => {
        stats[industry.name].products[product] = {
          total_value: 0,
          positivados: 0,
          nao_positivados: 0
        };
      });
    });

    // Calculate from clients
    clients.forEach(client => {
      Object.entries(client.industries || {}).forEach(([industryName, industryData]) => {
        if (stats[industryName]) {
          const isIndustryPositivado = industryData.industry_status?.toLowerCase() === 'positivado';
          
          if (isIndustryPositivado) {
            stats[industryName].positivados++;
          } else {
            stats[industryName].nao_positivados++;
          }

          // Calculate products
          Object.entries(industryData.products || {}).forEach(([productName, productData]) => {
            const value = parseFloat(productData.value) || 0;
            stats[industryName].total_value += value;

            if (stats[industryName].products[productName]) {
              stats[industryName].products[productName].total_value += value;
              
              if (productData.status?.toLowerCase() === 'positivado') {
                stats[industryName].products[productName].positivados++;
              } else {
                stats[industryName].products[productName].nao_positivados++;
              }
            }
          });
        }
      });
    });

    return stats;
  };

  const industryStats = calculateIndustryStats();

  // Calculate totals
  const totalGoal = campaign.industries?.reduce((sum, ind) => sum + (ind.goal || 0), 0) || 0;
  const totalSold = Object.values(industryStats).reduce((sum, data) => sum + data.total_value, 0);
  const overallProgress = totalGoal > 0 ? (totalSold / totalGoal * 100).toFixed(1) : 0;
  const totalPositivados = Object.values(industryStats).reduce((sum, data) => sum + data.positivados, 0);

  // Chart data
  const chartData = Object.entries(industryStats).map(([name, data]) => ({
    name,
    'Vendido': data.total_value,
    'Meta': data.goal,
    'Progresso %': data.goal > 0 ? ((data.total_value / data.goal) * 100).toFixed(1) : 0
  }));

  // Pie chart data for positivation
  const pieData = Object.entries(industryStats).map(([name, data]) => ({
    name,
    value: data.positivados,
    percentage: clients.length > 0 ? ((data.positivados / clients.length) * 100).toFixed(1) : 0
  }));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-7xl p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            📊 Estatísticas: {campaign.name}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm">Total de Clientes</p>
                <p className="text-3xl font-bold">{clients.length}</p>
              </div>
              <Target className="w-12 h-12 text-blue-200" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm">Positivados</p>
                <p className="text-3xl font-bold">{totalPositivados}</p>
              </div>
              <TrendingUp className="w-12 h-12 text-green-200" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm">Total Vendido</p>
                <p className="text-2xl font-bold">{formatCurrency(totalSold)}</p>
              </div>
              <DollarSign className="w-12 h-12 text-purple-200" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-sm">Progresso Geral</p>
                <p className="text-3xl font-bold">{overallProgress}%</p>
              </div>
              <Factory className="w-12 h-12 text-orange-200" />
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Bar Chart */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">
              Vendas vs Metas por Indústria
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="Vendido" fill="#10B981" />
                <Bar dataKey="Meta" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">
              Taxa de Positivação por Indústria
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage }) => `${name}: ${percentage}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed Industry Stats */}
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
            Detalhamento por Indústria
          </h3>

          {Object.entries(industryStats).map(([industryName, data], index) => {
            const progress = data.goal > 0 ? ((data.total_value / data.goal) * 100).toFixed(1) : 0;
            const isExpanded = expandedIndustry === industryName;

            return (
              <div key={index} className="border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                {/* Industry Header */}
                <button
                  onClick={() => setExpandedIndustry(isExpanded ? null : industryName)}
                  className="w-full p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <Factory className="w-6 h-6 text-blue-600" />
                    <div className="text-left flex-1">
                      <h4 className="font-bold text-lg text-gray-900 dark:text-white">
                        {industryName}
                      </h4>
                      <div className="flex items-center gap-4 mt-1 text-sm">
                        <span className="text-gray-600 dark:text-gray-400">
                          Meta: {formatCurrency(data.goal)}
                        </span>
                        <span className="text-green-600 dark:text-green-400 font-semibold">
                          Vendido: {formatCurrency(data.total_value)}
                        </span>
                        <span className={`font-bold ${progress >= 100 ? 'text-green-600' : 'text-orange-600'}`}>
                          {progress}%
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">{data.positivados}</p>
                        <p className="text-xs text-gray-500">Positivados</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-400">{data.nao_positivados}</p>
                        <p className="text-xs text-gray-500">Não Positivados</p>
                      </div>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
                </button>

                {/* Products Details */}
                {isExpanded && (
                  <div className="p-4 bg-white dark:bg-gray-900 space-y-3">
                    <h5 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Detalhamento por Produto:
                    </h5>
                    {Object.entries(data.products).map(([productName, productData], pIndex) => (
                      <div key={pIndex} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {productName}
                        </span>
                        <div className="flex items-center gap-4">
                          <span className="text-green-600 font-semibold">
                            {formatCurrency(productData.total_value)}
                          </span>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            ✓ {productData.positivados} | ✗ {productData.nao_positivados}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


