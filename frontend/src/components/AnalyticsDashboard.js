import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  PieChart, Pie, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { TrendingUp, TrendingDown, Users, Target, Package, Award } from 'lucide-react';


const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';


const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];


export default function AnalyticsDashboard({ campaignId }) {
  const [metrics, setMetrics] = useState(null);
  const [industries, setIndustries] = useState([]);
  const [products, setProducts] = useState([]);
  const [topClients, setTopClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [debugData, setDebugData] = useState(null);


  useEffect(() => {
    if (campaignId) {
      loadAnalytics();
    }
  }, [campaignId]);


  const loadAnalytics = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };


      const [metricsRes, industriesRes, productsRes, topClientsRes] = await Promise.all([
        axios.get(`${API_URL}/analytics/metrics/${campaignId}`, { headers }),
        axios.get(`${API_URL}/analytics/industries/${campaignId}`, { headers }),
        axios.get(`${API_URL}/analytics/products/${campaignId}`, { headers }),
        axios.get(`${API_URL}/analytics/top-clients/${campaignId}?limit=10`, { headers })
      ]);


      setMetrics(metricsRes.data);
      setIndustries(industriesRes.data);
      setProducts(productsRes.data);
      setTopClients(topClientsRes.data);
      
      console.log('📊 Analytics Data:', {
        metrics: metricsRes.data,
        industries: industriesRes.data,
        products: productsRes.data,
        topClients: topClientsRes.data
      });
    } catch (error) {
      console.error('Erro ao carregar analytics:', error);
    } finally {
      setLoading(false);
    }
  };


  const loadDebugData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Load both debug endpoints
      const [debugResponse, rawResponse] = await Promise.all([
        axios.get(`${API_URL}/analytics/debug-auto`, { headers }),
        axios.get(`${API_URL}/analytics/debug-raw`, { headers })
      ]);
      
      setDebugData(debugResponse.data);
      
      console.log('🔍 Debug Data:', debugResponse.data);
      console.log('🔍 RAW Data:', rawResponse.data);
      
      alert('Debug data carregado! Veja o console do navegador (F12)');
    } catch (error) {
      console.error('Erro ao carregar debug:', error);
      alert('Erro ao carregar debug data');
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }


  if (!metrics) {
    return (
      <div className="text-center py-12 text-gray-500">
        Nenhum dado disponível
      </div>
    );
  }


  // Prepare data for charts
  const industriesChartData = industries.map(ind => ({
    name: ind.name,
    value: ind.total_positivados
  }));


  // Only show products with positivations > 0
  const productsChartData = products
    .filter(prod => prod.total_positivados > 0)
    .slice(0, 10)
    .map(prod => ({
      name: prod.name.length > 20 ? prod.name.substring(0, 20) + '...' : prod.name,
      positivados: prod.total_positivados,
      industria: prod.industry
    }));


  return (
    <div className="space-y-6">
      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total de Clientes"
          value={metrics.total_clients}
          icon={Users}
          color="bg-blue-500"
        />
        <MetricCard
          title="Clientes Positivados"
          value={metrics.clients_positivados}
          icon={Target}
          color="bg-green-500"
          subtitle={`${metrics.percentage_positivados}% do total`}
        />
        <MetricCard
          title="Indústrias"
          value={metrics.total_industries}
          icon={Package}
          color="bg-purple-500"
        />
        <MetricCard
          title="Produtos"
          value={metrics.total_products}
          icon={Award}
          color="bg-orange-500"
        />
      </div>


      {/* Bar Chart - Products and Industries Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart - Products */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Top 10 Produtos Mais Positivados
          </h3>
          {productsChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={productsChartData} margin={{ top: 20, right: 30, left: 20, bottom: 100 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={100}
                  interval={0}
                />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="positivados" fill="#3B82F6" name="Positivados" minPointSize={5} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-500 py-12">Nenhum produto positivado ainda</p>
          )}
        </div>


        {/* Industries Performance */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-green-500" />
            Positivação por Indústria
          </h3>
          <div className="space-y-4">
            {industries.length > 0 ? (
              industries.map((industry, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {industry.name}
                    </span>
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                      {industry.total_positivados} / {industry.total_clients}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${industry.percentage}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {industry.percentage}% de positivação
                  </p>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">Nenhuma indústria cadastrada</p>
            )}
          </div>
        </div>
      </div>


      {/* Top Clients - Full Width */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
          <Award className="w-5 h-5 mr-2 text-yellow-500" />
          Top 10 Clientes com Mais Positivação
        </h3>
        <div className="space-y-3">
          {topClients.length > 0 ? (
            topClients.map((client, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    index === 0 ? 'bg-yellow-400' :
                    index === 1 ? 'bg-gray-300' :
                    index === 2 ? 'bg-orange-400' :
                    'bg-blue-100'
                  }`}>
                    <span className="text-sm font-bold text-gray-900">
                      {index + 1}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {client.name || 'Cliente sem nome'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {client.city} {client.neighborhood && `- ${client.neighborhood}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {client.positivations}
                  </span>
                  <Target className="w-5 h-5 text-green-500" />
                </div>
              </div>
            ))
          ) : (
            <p className="text-center text-gray-500 py-8">Nenhum cliente com positivação ainda</p>
          )}
        </div>
      </div>
    </div>
  );
}


function MetricCard({ title, value, icon: Icon, color, subtitle }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
            {title}
          </p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {subtitle}
            </p>
          )}
        </div>
        <div className={`${color} p-3 rounded-lg`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}