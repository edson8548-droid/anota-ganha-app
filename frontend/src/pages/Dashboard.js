
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { useCampaigns } from '../hooks/useCampaigns';
import { useClients } from '../hooks/useClients';
import CreateCampaignModal from '../components/CreateCampaignModal';
import CreateClientModal from '../components/CreateClientModal';
import EditClientModal from '../components/EditClientModal';
import EditClientInfoModal from '../components/EditClientInfoModal';
import Analytics from '../components/Analytics'; 
// ⭐️ IMPORTAÇÃO NOVA: Precisamos do service para a função de ligar (link)
import { campaignsService } from '../services/campaigns.service';
import './Dashboard.css'; 


const Dashboard = () => {
  const navigate = useNavigate();
  const authData = useAuthContext();
  const user = authData?.user;
  
  // ⭐️ NOTA: O useCampaigns não foi modificado, por isso importamos o service acima
  const { campaigns, loading: campaignsLoading, createCampaign, updateCampaign, deleteCampaign } = useCampaigns();
  const { clients, loading: clientsLoading, createClient, updateClient, deleteClient } = useClients(); // (Este hook já é global)

  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showEditModal, setShowEditModal] = useState(null); 
  const [selectedClient, setSelectedClient] = useState(null);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [activeTab, setActiveTab] = useState('clients');
  const [selectedCity, setSelectedCity] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [expandedClientId, setExpandedClientId] = useState(null);

  const selectedCampaign = useMemo(() => {
    if (!selectedCampaignId) return null;
    return campaigns.find(c => c.id === selectedCampaignId);
  }, [selectedCampaignId, campaigns]); 

  // ... (Handlers de logout, campanha, modals, etc., mantidos) ...
  const handleLogout = () => {
    if (window.confirm('Deseja realmente sair?')) {
      authData.logout();
      navigate('/login');
    }
  };
  const handleCreateCampaign = async (campaignData) => {
    try {
      await createCampaign(campaignData);
      setShowCreateCampaign(false);
    } catch (error) { console.error('❌ Erro ao criar campanha:', error); }
  };
  const handleEditCampaign = (e, campaign) => {
    e.stopPropagation(); 
    setEditingCampaign(campaign);
    setShowCreateCampaign(true);
  };
  const handleUpdateCampaign = async (campaignData) => {
    try {
      await updateCampaign(editingCampaign.id, campaignData);
      setShowCreateCampaign(false);
      setEditingCampaign(null);
    } catch (error) { console.error('❌ Erro ao atualizar campanha:', error); }
  };
  const handleDeleteCampaign = async (e, campaignId) => {
    e.stopPropagation(); 
    if (window.confirm('⚠️ Tem certeza? Ao apagar a campanha, os clientes permanecem na sua base, mas os dados de positivação desta campanha serão perdidos.')) {
      try {
        await deleteCampaign(campaignId);
        if (selectedCampaign?.id === campaignId) {
          setSelectedCampaignId(null);
        }
      } catch (error) { console.error('❌ Erro ao deletar campanha:', error); }
    }
  };
  
  // ⭐️⭐️⭐️ CORREÇÃO DE LÓGICA (V9) ⭐️⭐️⭐️
  // Esta função agora cria o cliente global E liga-o à campanha atual
  const handleCreateClient = async (clientData) => {
    try {
      if (!selectedCampaign) return;

      const newClientId = await createClient(clientData);

      if (newClientId) {
        await campaignsService.linkClientToCampaign(selectedCampaign.id, newClientId);
        setShowCreateClient(false);
      } else {
        throw new Error('O serviço de criação de cliente não retornou um ID.');
      }
    } catch (error) { 
      console.error('❌ Erro no processo de Criar/Ligar cliente:', error); 
      alert('Erro ao salvar o cliente. Tente novamente.');
    }
  };
  
  const handleDeleteClient = async (e, clientId) => {
    e.stopPropagation();
    if (window.confirm('⚠️ Tem certeza? (Isto apaga o cliente de TODAS as campanhas)')) {
      try {
        await deleteClient(clientId);
      } catch (error) { console.error('❌ Erro ao deletar cliente:', error); }
    }
  };
  const handleOpenEditInfo = (e, client) => {
    e.stopPropagation();
    setSelectedClient(client);
    setShowEditModal('INFO');
  };
  const handleOpenEditProducts = (e, client) => {
    e.stopPropagation();
    setSelectedClient(client);
    setShowEditModal('PRODUCTS');
  };
  const handleUpdateClient = async (updatedClient) => {
    try {
      const { id, ...clientData } = updatedClient;
      await updateClient(id, clientData);
      setShowEditModal(null); 
      setSelectedClient(null);
    } catch (error) { console.error('❌ Erro ao atualizar cliente:', error); }
  };
  const handleCloseModals = () => {
    setShowEditModal(null);
    setSelectedClient(null);
  }
  const handleWhatsAppSupport = () => {
    const phoneNumber = '5513997501798';
    const message = 'Olá, preciso de suporte no Venpro';
    const url = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };
  
  const handleToggleClientCard = (e, clientId) => {
    e.stopPropagation(); 
    setExpandedClientId(prevId => (prevId === clientId ? null : clientId));
  };
  
  // Lógica de filtro (Mantida da v8)
  const campaignClients = useMemo(() => {
    if (!selectedCampaign) return []; 
    
    // Suporte Legado (Campanhas antigas com campaignId)
    const legacyClients = clients.filter(c => c.campaignId === selectedCampaign.id);
    
    // Nova lógica (V8/V9): Filtra a base global de clientes pela lista de IDs da campanha
    const newClients = clients.filter(client => 
      (selectedCampaign.clientIds || []).includes(client.id)
    );

    // Junta os dois (para garantir que as campanhas antigas continuam a funcionar)
    const allCampaignClients = [...legacyClients];
    newClients.forEach(nc => {
      if (!allCampaignClients.find(lc => lc.id === nc.id)) {
        allCampaignClients.push(nc);
      }
    });

    return allCampaignClients;

  }, [selectedCampaign, clients]); 

  const cities = ['all', ...new Set(campaignClients.map(c => c.CIDADE).filter(Boolean))];
  const filteredClients = campaignClients.filter(client => {
    const matchesCity = selectedCity === 'all' || client.CIDADE === selectedCity;
    const matchesSearch = !searchTerm || 
      client.CLIENTE?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.CNPJ?.includes(searchTerm);
    return matchesCity && matchesSearch;
  });

  // ============================================
  // RENDER: TELA PRINCIPAL (LISTA DE CAMPANHAS)
  // ============================================
  const renderMainDashboard = () => {
    const totalIndustries = campaigns.reduce((acc, c) => acc + Object.keys(c.industries || {}).length, 0);
    const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : '?';

    return (
      <div className="dashboard-container">
        {/* Header */}
        <header className="dashboard-header">
          <div className="header-content">
            <div className="header-left">
              <a className="logo" href="/dashboard"><span className="logo-icon">📊</span>Venpro</a>
            </div>
            <div className="header-actions">
              <button className="btn-plans-header" onClick={() => navigate('/plans')}>💎 Ver Planos</button>
              <button className="btn-plans-header" onClick={() => navigate('/assistente')} style={{background:'#B35C44'}}>🤖 Assistente IA</button>
              <button className="btn-plans-header" onClick={() => navigate('/minha-licenca')} style={{background:'#10b981'}}>🔑 Minha Licença</button>
              <button className="btn-whatsapp-header" onClick={handleWhatsAppSupport}>💬 Suporte</button>
              <div className="user-menu">
                <div className="user-avatar">{userInitial}</div>
                <div className="user-info">
                  <span className="user-name">{user?.name || 'Usuário'}</span>
                  <span className="user-email">{user?.email}</span>
                </div>
                <button className="btn-logout" onClick={handleLogout} title="Sair">🚪</button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="dashboard-main">
          {/* Stats Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card-header"><span className="stat-icon purple">📋</span><span className="stat-label">Campanhas</span></div>
              <h3 className="stat-value">{campaigns.length}</h3>
              <p className="stat-description">Total de campanhas criadas</p>
            </div>
            <div className="stat-card">
              <div className="stat-card-header"><span className="stat-icon green">👥</span><span className="stat-label">Clientes</span></div>
              <h3 className="stat-value">{clients.length}</h3>
              <p className="stat-description">Total de clientes na base</p>
            </div>
            <div className="stat-card">
              <div className="stat-card-header"><span className="stat-icon orange">🏭</span><span className="stat-label">Indústrias</span></div>
              <h3 className="stat-value">{totalIndustries}</h3>
              <p className="stat-description">Total de indústrias gerenciadas</p>
            </div>
          </div>

          {/* Campanhas */}
          <section className="campaigns-section">
            <div className="section-header">
              <h2 className="section-title">Suas Campanhas</h2>
              <button className="btn-new-campaign" onClick={() => setShowCreateCampaign(true)}>➕ Nova Campanha</button>
            </div>
            {campaignsLoading ? (
              <div className="loading">⏳ Carregando campanhas...</div>
            ) : campaigns.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <h3 className="empty-title">Nenhuma campanha criada</h3>
                <p className="empty-description">Crie sua primeira campanha para começar!</p>
                <button className="btn-new-campaign" onClick={() => setShowCreateCampaign(true)}>➕ Criar Primeira Campanha</button>
              </div>
            ) : (
              <div className="campaigns-grid">
                {campaigns.map(campaign => {
                  const industriesList = Object.keys(campaign.industries || {});
                  
                  // ⭐️ USA A NOVA LÓGICA DE FILTRO PARA A CONTAGEM ⭐️
                  const clientCount = clients.filter(client => 
                    (campaign.clientIds || []).includes(client.id) || client.campaignId === campaign.id
                  ).length;
                  
                  return (
                    <div key={campaign.id} className="campaign-card" onClick={() => setSelectedCampaignId(campaign.id)}>
                      <div>
                        <div className="campaign-card-header">
                          <div className="campaign-card-header-main">
                            <h3 className="campaign-title">{campaign.name}</h3>
                            <p className="campaign-date">📅 {new Date(campaign.startDate).toLocaleDateString('pt-BR')} - {new Date(campaign.endDate).toLocaleDateString('pt-BR')}</p>
                          </div>
                          <div className="campaign-actions">
                            <button className="btn-icon btn-edit" onClick={(e) => handleEditCampaign(e, campaign)} title="Editar Campanha">✏️</button>
                            <button className="btn-icon btn-delete" onClick={(e) => handleDeleteCampaign(e, campaign.id)} title="Deletar Campanha">🗑️</button>
                          </div>
                        </div>
                        <span className={`campaign-status ${campaign.status === 'active' ? 'active' : 'inactive'}`}>
                          {campaign.status === 'active' ? 'Ativa' : 'Inativa'}
                        </span>
                        <div className="campaign-info">
                          <div className="info-row"><span className="info-label">👥 Clientes</span><span className="info-value">{clientCount}</span></div>
                          <div className="info-row"><span className="info-label">🏭 Indústrias</span><span className="info-value">{industriesList.length}</span></div>
                        </div>
                      </div>
                      <div className="industries-list">
                        {industriesList.slice(0, 3).map(name => (<span key={name} className="industry-tag">{name}</span>))}
                        {industriesList.length > 3 && (<span className="industry-tag">+{industriesList.length - 3}</span>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    );
  };

  // ============================================
  // RENDER: TELA DA CAMPANHA (DETALHES)
  // ============================================
  const renderCampaignView = () => {
    if (!selectedCampaign) {
      return <div className="loading">⏳ Carregando campanha...</div>;
    }

    const campaignPeriod = `${new Date(selectedCampaign.startDate).toLocaleDateString('pt-BR')} - ${new Date(selectedCampaign.endDate).toLocaleDateString('pt-BR')}`;
    
    return (
      <div className="campaign-view">
        {/* Header */}
        <header className="campaign-view-header">
          <div className="campaign-view-header-content">
            <div className="campaign-view-left">
              <button className="btn-back" onClick={() => setSelectedCampaignId(null)} title="Voltar">←</button>
              <div className="campaign-view-info">
                <h1>{selectedCampaign.name}</h1>
                <p>📅 {campaignPeriod}  |  👥 {campaignClients.length} Clientes  |  🏭 {Object.keys(selectedCampaign.industries || {}).length} Indústrias</p>
              </div>
            </div>
            <div className="campaign-view-actions">
              <button className="btn-plans-header" onClick={() => navigate('/plans')}>💎 Ver Planos</button>
              <button className="btn-plans-header" onClick={() => navigate('/assistente')} style={{background:'#B35C44'}}>🤖 Assistente IA</button>
              <button className="btn-plans-header" onClick={() => navigate('/minha-licenca')} style={{background:'#10b981'}}>🔑 Minha Licença</button>
              <button className="btn-edit-campaign" onClick={(e) => handleEditCampaign(e, selectedCampaign)}>✏️ Editar Campanha</button>
              <button className="btn-whatsapp" onClick={handleWhatsAppSupport}>💬 Suporte</button>
              <button className="btn-logout" onClick={handleLogout} title="Sair">🚪</button>
            </div>
          </div>
        </header>
        
        {/* Tabs */}
        <div className="tabs-container">
          <div className="tabs">
            <button className={`tab ${activeTab === 'clients' ? 'active' : ''}`} onClick={() => setActiveTab('clients')}>👥 Clientes ({filteredClients.length})</button>
            <button className={`tab ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>📊 Analytics</button>
          </div>
        </div>

        <main className="tab-content">
          {/* Tab: Clientes */}
          {activeTab === 'clients' && (
            <section className="clients-section">
              {/* Filtros */}
              <div className="filters">
                <div className="filter-group" style={{ flex: 2 }}><input type="text" placeholder="🔍 Buscar por Nome ou CNPJ..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/></div>
                <div className="filter-group">
                  <select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)}>
                    <option value="all">📍 Todas as Cidades</option>
                    {cities.filter(c => c !== 'all').map(city => (<option key={city} value={city}>{city}</option>))}
                  </select>
                </div>
                <button className="btn-action purple" onClick={() => setShowCreateClient(true)}>➕ Novo Cliente</button>
              </div>

              {/* Lista de Clientes (COM ACORDEÃO) */}
              {clientsLoading ? (
                <div className="loading">⏳ Carregando clientes...</div>
              ) : filteredClients.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">👥</div>
                  <h3 className="empty-title">Nenhum cliente encontrado</h3>
                  <p className="empty-description">Adicione clientes ou ajuste os filtros!</p>
                  <button className="btn-action purple" onClick={() => setShowCreateClient(true)}>➕ Adicionar Primeiro Cliente</button>
                </div>
              ) : (
                <div className="clients-grid">
                  {filteredClients.map(client => {
                    const clientIndustries = client.industries || {};
                    const totalClientValue = Object.values(clientIndustries).reduce((acc, industry) => 
                      acc + Object.values(industry).reduce((sum, p) => sum + (p.valor || 0), 0)
                    , 0);
                    
                    const isExpanded = expandedClientId === client.id;
                    const totalIndustriesCount = Object.keys(selectedCampaign.industries || {}).length;

                    // LÓGICA DO TROFÉU (Mantida) 
                    let clientProductsTotalCampaign = 0;
                    let clientPositivated = 0;
                    if (client.industries) {
                      Object.keys(selectedCampaign.industries || {}).forEach(industryName => {
                        const clientIndustryProducts = client.industries?.[industryName] || {};
                        const campaignProducts = selectedCampaign.industries[industryName] || {};
                        const total = Object.keys(campaignProducts).filter(p => p !== 'targetValue').length;
                        clientProductsTotalCampaign += total;

                        Object.keys(campaignProducts).filter(p => p !== 'targetValue').forEach(productName => {
                           const productData = clientIndustryProducts[productName];
                           if (productData?.positivado) {
                             clientPositivated++;
                           }
                        });
                      });
                    }
                    const isComplete = clientProductsTotalCampaign > 0 && clientPositivated === clientProductsTotalCampaign;
                    
                    return (
                      <div key={client.id} className="client-card">
                        
                        {/* 1. Conteúdo Fixo (Sempre visível) */}
                        <div>
                          <div className="client-header">
                            <div className="client-title-section">
                              <h3>
                                {client.CLIENTE}
                                {isComplete && <span className="icon-complete" title="Cliente 100% completo!">🏆</span>}
                              </h3>
                              <p>📍 {client.CIDADE} - {client.ESTADO}</p>
                            </div>
                            <div className="client-actions-btns">
                              <button className="btn-icon btn-edit" onClick={(e) => handleOpenEditInfo(e, client)} title="Editar Informações">✏️</button>
                              <button className="btn-icon btn-delete" onClick={(e) => handleDeleteClient(e, client.id)} title="Deletar Cliente">🗑️</button>
                            </div>
                          </div>
                          <div className="client-info-grid">
                            <div className="client-info-item"><strong>CNPJ</strong><span>{client.CNPJ}</span></div>
                            <div className="client-info-item"><strong>TELEFONE</strong><span>{client.TELEFONE || '--'}</span></div>
                          </div>
                        </div>

                        {/* 2. Conteúdo Colapsável (Indústrias e Total) */}
                        <div className="client-collapsible-content">
                          {isExpanded && (
                            <>
                              <div className="client-industries">
                                {Object.keys(selectedCampaign.industries || {}).map(industryName => {
                                  const clientIndustryData = client.industries?.[industryName] || {};
                                  const campaignProducts = selectedCampaign.industries[industryName] || {};
                                  const totalValue = Object.values(clientIndustryData).reduce((sum, p) => sum + (p.valor || 0), 0);
                                  const positivated = Object.values(clientIndustryData).filter(p => p.positivado).length;
                                  const total = Object.keys(campaignProducts).filter(p => p !== 'targetValue').length;
                                  const percentage = total > 0 ? (positivated / total) * 100 : 0;
                                  return (
                                    <div key={industryName} className="industry-section industry-section-clickable" title="Clique para positivar produtos" onClick={(e) => handleOpenEditProducts(e, client)}>
                                      <strong className="industry-name">🏭 {industryName}</strong>
                                      <div className="progress-bar"><div className="progress-fill" style={{ width: `${percentage}%` }}/></div>
                                      <div className="industry-total">
                                        <span>{positivated}/{total} produtos</span>
                                        <span>{formatCurrency(totalValue)}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="total-value">
                                <strong>Valor Total Positivado</strong>
                                <span>{formatCurrency(totalClientValue)}</span>
                              </div>
                            </>
                          )}
                          
                          <button 
                            type="button" 
                            className="btn-toggle-client" 
                            onClick={(e) => handleToggleClientCard(e, client.id)}
                          >
                            {isExpanded ? 'Ocultar Indústrias' : `Ver Indústrias (${totalIndustriesCount})`}
                          </button>
                        </div>
                        
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Tab: Analytics */}
          {activeTab === 'analytics' && (
            <section className="analytics-content">
              <Analytics
                campaign={selectedCampaign} 
                clients={campaignClients} 
                onClose={() => setActiveTab('clients')}
              />
            </section>
          )}
        </main>
      </div>
    );
  };

  // ============================================
  // RENDER PRINCIPAL DO COMPONENTE
  // ============================================
  return (
    <>
      {!selectedCampaign ? renderMainDashboard() : renderCampaignView()}

      {/* MODAIS (Renderizados fora do if/else) */}
      
      {showCreateCampaign && (
        <CreateCampaignModal
          onClose={() => { setShowCreateCampaign(false); setEditingCampaign(null); }}
          onSave={editingCampaign ? handleUpdateCampaign : handleCreateCampaign}
          campaign={editingCampaign}
        />
      )}
      
      {showCreateClient && (
        <CreateClientModal
          onClose={() => setShowCreateClient(false)}
          onSave={handleCreateClient} // ⭐️ AGORA CHAMA O NOVO HANDLER (V9)
          campaign={selectedCampaign}
        />
      )}

      {showEditModal === 'INFO' && selectedClient && (
        <EditClientInfoModal
          isOpen={true}
          onClose={handleCloseModals}
          onSave={handleUpdateClient}
          client={selectedClient}
        />
      )}

      {showEditModal === 'PRODUCTS' && selectedClient && (
        <EditClientModal
          isOpen={true}
          onClose={handleCloseModals}
          onSave={handleUpdateClient}
          client={selectedClient}
          campaign={selectedCampaign}
        />
      )}
    </>
  );
};

export default Dashboard;