1|import React, { useState, useEffect } from 'react';
2|import axios from 'axios';
3|import {
4|  PieChart, Pie, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
5|  Tooltip, Legend, ResponsiveContainer
6|} from 'recharts';
7|import { TrendingUp, TrendingDown, Users, Target, Package, Award } from 'lucide-react';
8|
9|const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
10|
11|const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
12|
13|export default function AnalyticsDashboard({ campaignId }) {
14|  const [metrics, setMetrics] = useState(null);
15|  const [industries, setIndustries] = useState([]);
16|  const [products, setProducts] = useState([]);
17|  const [topClients, setTopClients] = useState([]);
18|  const [loading, setLoading] = useState(true);
19|  const [debugData, setDebugData] = useState(null);
20|
21|  useEffect(() => {
22|    if (campaignId) {
23|      loadAnalytics();
24|    }
25|  }, [campaignId]);
26|
27|  const loadAnalytics = async () => {
28|    try {
29|      const token = localStorage.getItem('token');
30|      const headers = { Authorization: `Bearer ${token}` };
31|
32|      const [metricsRes, industriesRes, productsRes, topClientsRes] = await Promise.all([
33|        axios.get(`${API_URL}/analytics/metrics/${campaignId}`, { headers }),
34|        axios.get(`${API_URL}/analytics/industries/${campaignId}`, { headers }),
35|        axios.get(`${API_URL}/analytics/products/${campaignId}`, { headers }),
36|        axios.get(`${API_URL}/analytics/top-clients/${campaignId}?limit=10`, { headers })
37|      ]);
38|
39|      setMetrics(metricsRes.data);
40|      setIndustries(industriesRes.data);
41|      setProducts(productsRes.data);
42|      setTopClients(topClientsRes.data);
43|      
44|      console.log('📊 Analytics Data:', {
45|        metrics: metricsRes.data,
46|        industries: industriesRes.data,
47|        products: productsRes.data,
48|        topClients: topClientsRes.data
49|      });
50|    } catch (error) {
51|      console.error('Erro ao carregar analytics:', error);
52|    } finally {
53|      setLoading(false);
54|    }
55|  };
56|
57|  const loadDebugData = async () => {
58|    try {
59|      const token = localStorage.getItem('token');
60|      const headers = { Authorization: `Bearer ${token}` };
61|      
62|      // Load both debug endpoints
63|      const [debugResponse, rawResponse] = await Promise.all([
64|        axios.get(`${API_URL}/analytics/debug-auto`, { headers }),
65|        axios.get(`${API_URL}/analytics/debug-raw`, { headers })
66|      ]);
67|      
68|      setDebugData(debugResponse.data);
69|      
70|      console.log('🔍 Debug Data:', debugResponse.data);
71|      console.log('🔍 RAW Data:', rawResponse.data);
72|      
73|      alert('Debug data carregado! Veja o console do navegador (F12)');
74|    } catch (error) {
75|      console.error('Erro ao carregar debug:', error);
76|      alert('Erro ao carregar debug data');
77|    }
78|  };
79|
80|  if (loading) {
81|    return (
82|      <div className="flex items-center justify-center py-12">
83|        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
84|      </div>
85|    );
86|  }
87|
88|  if (!metrics) {
89|    return (
90|      <div className="text-center py-12 text-gray-500">
91|        Nenhum dado disponível
92|      </div>
93|    );
94|  }
95|
96|  // Prepare data for charts
97|  const industriesChartData = industries.map(ind => ({
98|    name: ind.name,
99|    value: ind.total_positivados
100|  }));
