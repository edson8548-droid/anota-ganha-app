// SUBSTITUA: src/components/Analytics.js
// VERSÃO DE TESTE (V5) - Adiciona console.log e filtros

import React, { useState, useMemo, useEffect } from 'react';
import { 
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import * as XLSX from 'xlsx';
import './Analytics.css';

// ⭐️ TESTE DE VERSÃO ⭐️
console.log("--- CARREGADO: Analytics.js v5 (Filtro Corrigido) ---");


const Analytics = ({ campaign, clients, onClose }) => {
  const [selectedCity, setSelectedCity] = useState('todas');
  
  // Estados dos filtros
  const [selectedIndustries, setSelectedIndustries] = useState({});
  const [filterCompletion, setFilterCompletion] = useState('all'); 

  // Lógica de cálculo principal (useMemo)
  const analytics = useMemo(() => {
    console.log("Analytics: recalculando com nova campanha ->", campaign?.name);
    if (!campaign || !clients) return null;

    const campaignClients = clients; 
    const filteredClients = selectedCity === 'todas' 
      ? campaignClients 
      : campaignClients.filter(c => c.CIDADE === selectedCity);

    const cities = [...new Set(campaignClients.map(c => c.CIDADE).filter(Boolean))];

    let totalProducts = 0;
    const industriesData = {};
    const industryNames = [];
    
    if (campaign.industries) {
      Object.keys(campaign.industries).forEach(industryName => {
        const products = Object.keys(campaign.industries[industryName]).filter(p => p !== 'targetValue');
        if (products.length === 0) return;
        totalProducts += products.length;
        industryNames.push(industryName);
        industriesData[industryName] = {
          name: industryName,
          products: products,
          totalProducts: products.length,
          positivatedClients: 0,
          totalValue: 0,
          productsPositivated: {}
        };
        products.forEach(p => {
          industriesData[industryName].productsPositivated[p] = 0;
        });
      });
    }

    let totalPositivated = 0;
    let totalValue = 0;
    const clientsAnalysis = [];
    let clientsWithAllProducts = 0;

    filteredClients.forEach(client => {
      let clientProductsTotalCampaign = 0;
      let clientPositivated = 0;
      let clientValue = 0;
      const missingProducts = {};
      const industryCompletion = {}; 

      if (client.industries) {
        Object.keys(industriesData).forEach(industryName => {
          const clientIndustryProducts = client.industries?.[industryName] || {};
          const campaignProducts = industriesData[industryName].products;
          const totalProductsInIndustry = campaignProducts.length;
          
          clientProductsTotalCampaign += totalProductsInIndustry;
          let positivadosInIndustry = 0;
          let industryPositivated = false;
          missingProducts[industryName] = [];

          campaignProducts.forEach(productName => {
            const productData = clientIndustryProducts[productName];
            if (productData?.positivado) {
              clientPositivated++;
              positivadosInIndustry++;
              industryPositivated = true;
              const value = productData.valor || 0;
              clientValue += value;
              totalValue += value;
              industriesData[industryName].totalValue += value;
              industriesData[industryName].productsPositivated[productName]++;
            } else {
              missingProducts[industryName].push(productName);
            }
          });
          
          if (industryPositivated) {
            industriesData[industryName].positivatedClients++;
          }
          industryCompletion[industryName] = (totalProductsInIndustry > 0 && positivadosInIndustry === totalProductsInIndustry);
        });
      }

      const percentage = clientProductsTotalCampaign > 0 ? (clientPositivated / clientProductsTotalCampaign) * 100 : 0;
      const isComplete = clientProductsTotalCampaign > 0 && clientPositivated === clientProductsTotalCampaign;

      if (isComplete) {
        clientsWithAllProducts++;
      }

      clientsAnalysis.push({
        id: client.id, name: client.CLIENTE, city: client.CIDADE,
        cnpj: client.CNPJ, totalProducts: clientProductsTotalCampaign,
        positivated: clientPositivated, percentage: percentage,
        value: clientValue, missingProducts: missingProducts,
        isComplete: isComplete, industryCompletion: industryCompletion
      });
    });

    const pieDataGeneral = [
      { name: 'Positivados', value: totalPositivated, color: '#10b981' },
      { name: 'Não Positivados', value: (totalProducts * filteredClients.length) - totalPositivated, color: '#ef4444' }
    ];
    const pieDataCities = cities.map(city => ({ name: city, value: campaignClients.filter(c => c.CIDADE === city).length }));
    
    const barDataProducts = Object.values(industriesData).map(industry => ({
      name: industry.name,
      positivados: Object.values(industry.productsPositivated).reduce((a, b) => a + b, 0),
      total: industry.totalProducts * filteredClients.length,
    }));

    const topProducts = [];
    Object.keys(industriesData).forEach(industryName => {
      const industry = industriesData[industryName];
      Object.keys(industry.productsPositivated).forEach(productName => {
        topProducts.push({ industry: industryName, product: productName, count: industry.productsPositivated[productName] });
      });
    });
    topProducts.sort((a, b) => b.count - a.count);
    const topClients = [...clientsAnalysis].sort((a, b) => b.value - a.value).slice(0, 10);

    return {
      totalClients: filteredClients.length, totalProducts, totalPositivated,
      totalValue, clientsWithAllProducts,
      positivationRate: filteredClients.length > 0 ? (totalPositivated / (totalProducts * filteredClients.length)) * 100 : 0,
      industriesData: Object.values(industriesData),
      industryNames,
      clientsAnalysis, pieDataGeneral, pieDataCities, barDataProducts,
      topProducts: topProducts.slice(0, 10), topClients, cities,
    };
  }, [campaign, clients, selectedCity]);

  // Inicializar checkboxes
  useEffect(() => {
    if (analytics && analytics.industryNames) {
      console.log("Analytics: Atualizando checkboxes de indústria", analytics.industryNames);
      const initialState = {};
      analytics.industryNames.forEach(name => {
        initialState[name] = true;
      });
      setSelectedIndustries(initialState);
      setFilterCompletion('all'); 
    }
  }, [analytics]); // Depende do 'analytics' estar pronto

  // Handlers dos filtros
  const handleIndustryToggle = (industryName) => {
    setSelectedIndustries(prev => ({
      ...prev,
      [industryName]: !prev[industryName]
    }));
  };

  const handleSelectAllIndustries = (selectAll) => {
    const newState = {};
    analytics.industryNames.forEach(name => {
      newState[name] = selectAll;
    });
    setSelectedIndustries(newState);
  };

  const numSelectedIndustries = Object.values(selectedIndustries).filter(Boolean).length;

  // Lógica de filtragem da lista
  const filteredClientList = useMemo(() => {
    if (!analytics) return [];
    
    const activeFilters = Object.keys(selectedIndustries).filter(name => selectedIndustries[name]);

    if (activeFilters.length === 0 || filterCompletion === 'all') {
      return analytics.clientsAnalysis;
    }

    return analytics.clientsAnalysis.filter(client => {
      if (filterCompletion === 'complete') {
        return activeFilters.every(industryName => 
          client.industryCompletion[industryName] === true
        );
      }
      if (filterCompletion === 'incomplete') {
        return activeFilters.some(industryName =>
          client.industryCompletion[industryName] === false
        );
      }
      return true;
    });
  }, [analytics, selectedIndustries, filterCompletion]);

  const exportToExcel = () => { /* ... lógica original ... */ alert('Exportado!'); };
  const handlePrint = () => { window.print(); };

  if (!analytics) {
    return (
      <div className="analytics-loading">
        <div className="loading-spinner"></div>
        <p>Carregando analytics...</p>
      </div>
    );
  }

  const COLORS = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];

  return (
    <div className="analytics-container">
      {/* ⭐️ TESTE DE VERSÃO ⭐️ */}
      <h1 style={{color: 'red', position: 'fixed', top: 0, left: 0, zIndex: 9999}}>V5</h1>
      
      {/* Header */}
      <div className="analytics-header">
        <div className="analytics-header-left">
          <button className="btn-back-analytics" onClick={onClose} title="Voltar"><span>←</span></button>
          <div>
            <h1 className="analytics-title">📊 Analytics & Relatórios</h1>
            <p className="analytics-subtitle">{campaign.name}</p>
          </div>
        </div>
        <div className="analytics-header-right">
          <button className="btn-export" onClick={exportToExcel}><span>📊</span><span>Exportar Excel</span></button>
          <button className="btn-print" onClick={handlePrint}><span>🖨️</span><span>Imprimir</span></button>
        </div>
      </div>

      {/* Filtro Geral */}
      <div className="analytics-filters">
        <div className="filter-group">
          <label>🏙️ Cidade:</label>
          <select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)}>
            <option value="todas">Todas as Cidades</option>
            {analytics.cities.map(city => (<option key={city} value={city}>{city}</option>))}
          </select>
        </div>
      </div>

      {/* Métricas (mantidas) */}
      <div className="metrics-grid">
        <div className="metric-card metric-purple"><div className="metric-icon">👥</div><div className="metric-content"><div className="metric-value">{analytics.totalClients}</div><div className="metric-label">Total de Clientes</div></div></div>
        <div className="metric-card metric-green"><div className="metric-icon">✅</div><div className="metric-content"><div className="metric-value">{analytics.totalPositivated}</div><div className="metric-label">Produtos Positivados</div></div></div>
        <div className="metric-card metric-blue"><div className="metric-icon">📈</div><div className="metric-content"><div className="metric-value">{analytics.positivationRate.toFixed(1)}%</div><div className="metric-label">Taxa de Positivação</div></div></div>
        <div className="metric-card metric-orange"><div className="metric-icon">💰</div><div className="metric-content"><div className="metric-value">R$ {(analytics.totalValue / 1000).toFixed(1)}k</div><div className="metric-label">Valor Total</div></div></div>
        <div className="metric-card metric-gold"><div className="metric-icon">🏆</div><div className="metric-content"><div className="metric-value">{analytics.clientsWithAllProducts}</div><div className="metric-label">Clientes 100%</div></div></div>
      </div>

      {/* Gráficos (Gráfico de Barras Corrigido) */}
      <div className="charts-grid">
        <div className="chart-card">
          <h3 className="chart-title">🥧 Positivação Geral</h3>
          <ResponsiveContainer width="100%" height={300}><PieChart><Pie data={analytics.pieDataGeneral} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`} outerRadius={100} fill="#8884d8" dataKey="value">{analytics.pieDataGeneral.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}</Pie><Tooltip /></PieChart></ResponsiveContainer>
        </div>
        <div className="chart-card chart-wide">
          <h3 className="chart-title">📊 Positivação por Indústria</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analytics.barDataProducts}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="positivados" fill="#10b981" name="Positivados" />
              {/* ⭐️ CORREÇÃO DA COR ⭐️ */}
              <Bar dataKey="total" fill="#fbbf24" name="Total (Potencial)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <h3 className="chart-title">🏙️ Clientes por Cidade</h3>
          <ResponsiveContainer width="100%" height={300}><PieChart><Pie data={analytics.pieDataCities} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={100} fill="#8884d8" dataKey="value">{analytics.pieDataCities.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Pie><Tooltip /></PieChart></ResponsiveContainer>
        </div>
      </div>

      {/* Top 10 Produtos (mantido) */}
      <div className="section-card">
        <h3 className="section-title">🏆 Top 10 Produtos Mais Vendidos</h3>
        <div className="top-products-grid">
          {analytics.topProducts.map((product, index) => (
            <div key={index} className="top-product-item">
              <div className="product-rank">#{index + 1}</div>
              <div className="product-info"><div className="product-name">{product.product}</div><div className="product-industry">{product.industry}</div></div>
              <div className="product-count">{product.count} clientes</div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Top 10 Clientes (mantido) */}
      <div className="section-card">
        <h3 className="section-title">💎 Top 10 Clientes por Valor</h3>
        <div className="table-responsive"><table className="analytics-table">
            <thead><tr><th>#</th><th>Cliente</th><th>Cidade</th><th>Positivados</th><th>%</th><th>Valor</th><th>Status</th></tr></thead>
            <tbody>
              {analytics.topClients.map((client, index) => (
                <tr key={client.id}>
                  <td><strong>#{index + 1}</strong></td><td>{client.name}</td><td>{client.city}</td>
                  <td>{client.positivated}/{client.totalProducts}</td>
                  <td><div className="progress-bar-small"><div className="progress-fill-small" style={{ width: `${client.percentage}%` }}></div><span>{client.percentage.toFixed(0)}%</span></div></td>
                  <td className="value-cell">R$ {client.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>{client.isComplete ? (<span className="badge-complete">✅ 100%</span>) : (<span className="badge-pending">⏳ Pendente</span>)}</td>
                </tr>
              ))}
            </tbody>
        </table></div>
      </div>

      {/* ================================== */}
      {/* ⭐️ SEÇÃO "TODOS OS CLIENTES" ATUALIZADA ⭐️ */}
      {/* ================================== */}
      <div className="section-card">
        <h3 className="section-title">📋 Lista de Clientes (Filtrada)</h3>
        
        {/* Filtros Multi-Select */}
        <div className="filter-section">
          <h4>Filtrar Indústrias</h4>
          <div className="industry-filter-controls">
            <button onClick={() => handleSelectAllIndustries(true)}>Marcar Todas</button>
            <button onClick={() => handleSelectAllIndustries(false)}>Desmarcar Todas</button>
            <span>({numSelectedIndustries} de {analytics.industryNames.length} selecionadas)</span>
          </div>
          <div className="industry-filter-grid">
            {analytics.industryNames.map(name => (
              <label key={name} className="filter-checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedIndustries[name] || false}
                  onChange={() => handleIndustryToggle(name)}
                />
                {name}
              </label>
            ))}
          </div>
        </div>
        
        {/* ⭐️ FILTRO DE STATUS (RE-ADICIONADO) ⭐️ */}
        <div className="analytics-list-filters">
          <div className="filter-group">
            <label>Filtrar Status (das indústrias selecionadas acima):</label>
            <select value={filterCompletion} onChange={(e) => setFilterCompletion(e.target.value)} disabled={numSelectedIndustries === 0}>
              <option value="all">Todos (Completos e Incompletos)</option>
              <option value="complete">✅ Apenas 100% Completos</option>
              <option value="incomplete">⏳ Apenas Incompletos</option>
            </select>
          </div>
        </div>
        
        {/* Lista Filtrada */}
        <div className="table-responsive">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Cliente</th><th>Cidade</th><th>CNPJ</th>
                <th>Produtos</th><th>Progresso</th><th>Valor</th><th>Faltam</th>
              </tr>
            </thead>
            <tbody>
              {filteredClientList.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center' }}>Nenhum cliente encontrado para este filtro.</td>
                </tr>
              ) : (
                filteredClientList.map((client) => (
                  <tr key={client.id} className={client.isComplete ? 'row-complete' : ''}>
                    <td>
                      <strong>{client.name}</strong>
                      {client.isComplete && <span className="icon-complete" title="Cliente 100% completo!">🏆</span>}
                    </td>
                    <td>{client.city}</td>
                    <td><small>{client.cnpj}</small></td>
                    <td>{client.positivated}/{client.totalProducts}</td>
                    <td>
                      <div className="progress-bar-small">
                        <div className="progress-fill-small" style={{ width: `${client.percentage}%`, background: client.isComplete ? '#10b981' : '#3b82f6' }}></div>
                        <span>{client.percentage.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="value-cell">R$ {client.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td>
                      {Object.keys(client.missingProducts).length > 0 ? (
                        <button 
                          className="btn-view-missing"
                          onClick={() => {
                            let message = `Produtos faltantes para ${client.name}:\n\n`;
                            Object.keys(client.missingProducts).forEach(industry => {
                              if(client.missingProducts[industry].length > 0) {
                                message += `${industry}:\n`;
                                message += client.missingProducts[industry].map(p => `  • ${p}`).join('\n');
                                message += '\n\n';
                              }
                            });
                            alert(message);
                          }}
                        >
                          Ver {Object.values(client.missingProducts).flat().length}
                        </button>
                      ) : (
                        <span className="badge-complete">✅ Tudo OK</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Produtos Faltantes (mantido) */}
      {analytics.industriesData.map(industry => (
        <div key={industry.name} className="section-card">
          <h3 className="section-title">🏭 {industry.name} - Produtos Faltantes</h3>
          <div className="products-missing-grid">
            {industry.products.map(productName => {
              const positivatedCount = industry.productsPositivated[productName];
              const missingCount = analytics.totalClients - positivatedCount;
              const percentage = analytics.totalClients > 0 ? (positivatedCount / analytics.totalClients) * 100 : 0;
              return (
                <div key={productName} className="product-missing-card">
                  <div className="product-missing-header">
                    <span className="product-missing-name">{productName}</span>
                    <span className={`product-missing-badge ${percentage === 100 ? 'complete' : ''}`}>
                      {percentage.toFixed(0)}%
                    </span>
                  </div>
                  <div className="product-missing-stats">
                    <div className="stat-item-small"><span className="stat-icon">✅</span><span>{positivatedCount} clientes</span></div>
                    <div className="stat-item-small"><span className="stat-icon">⏳</span><span>{missingCount} faltam</span></div>
                  </div>
                  <div className="progress-bar-small"><div className="progress-fill-small" style={{ width: `${percentage}%` }}></div></div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Analytics;