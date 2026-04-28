
import React, { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Sparkles, MessageCircle, BarChart3, Puzzle } from 'lucide-react';
import { useAuthContext } from '../contexts/AuthContext';
import { useCampaigns } from '../hooks/useCampaigns';
import { useClients } from '../hooks/useClients';
import CreateCampaignModal from '../components/CreateCampaignModal';
import CreateClientModal from '../components/CreateClientModal';
import EditClientModal from '../components/EditClientModal';
import EditClientInfoModal from '../components/EditClientInfoModal';
import Analytics from '../components/Analytics';
import ConfirmDialog from '../components/ConfirmDialog';
import { campaignsService } from '../services/campaigns.service';
import './Dashboard.css';


const Dashboard = () => {
  const navigate = useNavigate();
  const authData = useAuthContext();
  const user = authData?.user;

  const { campaigns, loading: campaignsLoading, createCampaign, updateCampaign, deleteCampaign } = useCampaigns();
  const { clients, loading: clientsLoading, createClient, updateClient, deleteClient } = useClients();

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
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', description: '', onConfirm: null });

  const showConfirm = (title, description, onConfirm) =>
    setConfirmDialog({ open: true, title, description, onConfirm });
  const closeConfirm = () => setConfirmDialog(d => ({ ...d, open: false }));

  // Wake up backend on first load
  useEffect(() => {
    fetch('https://api.venpro.com.br/health', { method: 'GET', mode: 'cors' }).catch(() => {});
  }, []);

  const selectedCampaign = useMemo(() => {
    if (!selectedCampaignId) return null;
    return campaigns.find(c => c.id === selectedCampaignId);
  }, [selectedCampaignId, campaigns]);

  const handleLogout = () => {
    showConfirm('Sair', 'Deseja realmente sair?', () => {
      authData.logout();
      navigate('/login');
    });
  };
  const handleCreateCampaign = async (campaignData) => {
    try {
      await createCampaign(campaignData);
      setShowCreateCampaign(false);
    } catch (error) { console.error('Erro ao criar campanha:', error); }
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
    } catch (error) { console.error('Erro ao atualizar campanha:', error); }
  };
  const handleDeleteCampaign = (e, campaignId) => {
    e.stopPropagation();
    showConfirm(
      'Apagar campanha',
      'Os clientes permanecem na sua base, mas os dados de positivação desta campanha serão perdidos.',
      async () => {
        try {
          await deleteCampaign(campaignId);
          if (selectedCampaign?.id === campaignId) setSelectedCampaignId(null);
        } catch (error) { console.error('Erro ao deletar campanha:', error); }
      }
    );
  };

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
      console.error('Erro no processo de Criar/Ligar cliente:', error);
      toast.warning('Erro ao salvar o cliente. Tente novamente.');
    }
  };

  const handleDeleteClient = (e, clientId) => {
    e.stopPropagation();
    showConfirm(
      'Apagar cliente',
      'Isto apaga o cliente de TODAS as campanhas. Esta ação não pode ser desfeita.',
      async () => {
        try {
          await deleteClient(clientId);
        } catch (error) { console.error('Erro ao deletar cliente:', error); }
      }
    );
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
    } catch (error) { console.error('Erro ao atualizar cliente:', error); }
  };
  const handleCloseModals = () => {
    setShowEditModal(null);
    setSelectedClient(null);
  };
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

  const campaignClients = useMemo(() => {
    if (!selectedCampaign) return [];
    const legacyClients = clients.filter(c => c.campaignId === selectedCampaign.id);
    const newClients = clients.filter(client =>
      (selectedCampaign.clientIds || []).includes(client.id)
    );
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
    const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : '?';

    return (
      <div className="dashboard-container">
        {/* Header */}
        <header className="dashboard-header">
          <div className="header-content">
            <div className="header-left">
              <a className="logo" href="/dashboard">
                <div className="logo-icon">
                  <svg viewBox="0 0 18 18" fill="none">
                    <path d="M2 3.5L9 14.5L16 3.5" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 14.5L12.5 8.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <span className="logo-ven">Ven</span><span className="logo-pro">pro</span>
              </a>
            </div>
            <div className="header-actions">
              <button className="btn-nav" onClick={() => navigate('/plans')}>Planos</button>
              <button className="btn-nav" onClick={() => window.open('/assistente', '_blank', 'noopener,noreferrer')}>Consultor IA</button>
              <button className="btn-nav btn-notification" onClick={() => window.open('/notificacoes', '_blank', 'noopener,noreferrer')} title="Notificações">🔔</button>
              <button className="btn-nav" onClick={() => navigate('/minha-licenca')}>Licença</button>
              <button className="btn-nav" onClick={handleWhatsAppSupport}>Suporte</button>
              <div className="user-menu">
                <div className="user-avatar">{userInitial}</div>
                <div className="user-info">
                  <span className="user-name">{user?.name || 'Usuário'}</span>
                  <span className="user-email">{user?.email}</span>
                </div>
                <button className="btn-logout" onClick={handleLogout} title="Sair">Sair</button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="dashboard-main">
          {/* Ferramentas */}
          <section className="tools-section">
            <div className="tools-section-title">Ferramentas</div>
            <div className="tools-grid">
              <div className="tool-card" onClick={() => navigate('/cotacao')}>
                <div className="tool-card-icon"><FileSpreadsheet size={32} /></div>
                <div className="tool-card-badge live">Disponível</div>
                <div className="tool-card-title">Cotação Express</div>
                <div className="tool-card-desc">Suba sua planilha e receba com todos os preços preenchidos automaticamente — por código de barras ou nome do produto.</div>
              </div>
              <div className="tool-card" onClick={() => navigate('/assistente')}>
                <div className="tool-card-icon"><Sparkles size={32} /></div>
                <div className="tool-card-badge live">Disponível</div>
                <div className="tool-card-title">Consultor de Vendas IA</div>
                <div className="tool-card-desc">Crie textos de oferta, emails profissionais, scripts de negociação e muito mais — especializado em representação comercial.</div>
              </div>
              <div className="tool-card" onClick={() => {}}>
                <div className="tool-card-icon"><MessageCircle size={32} /></div>
                <div className="tool-card-badge soon">Em breve</div>
                <div className="tool-card-title">Campanhas WhatsApp</div>
                <div className="tool-card-desc">Envie ofertas automaticamente para toda sua carteira de clientes com texto e fotos personalizados.</div>
              </div>
              <div className="tool-card" onClick={() => {
                const a = document.createElement('a');
                a.href = '/venpro-cotatudo-extension.zip';
                a.download = 'venpro-cotatudo-extension.zip';
                a.click();
              }}>
                <div className="tool-card-icon"><Puzzle size={32} /></div>
                <div className="tool-card-badge live">Novo</div>
                <div className="tool-card-title">Cotatudo Automático</div>
                <div className="tool-card-desc">Baixe a extensão Chrome que preenche cotações no Cotatudo automaticamente com os preços da sua tabela Venpro.</div>
              </div>
              <div className="tool-card" onClick={() => {
                if (campaigns.length > 0) {
                  setSelectedCampaignId(campaigns[0].id);
                } else {
                  setShowCreateCampaign(true);
                }
              }}>
                <div className="tool-card-icon"><BarChart3 size={32} /></div>
                <div className="tool-card-badge live">Disponível</div>
                <div className="tool-card-title">Central de Campanhas</div>
                <div className="tool-card-desc">Acompanhe campanhas, monitore positivação de clientes e acompanhe seus resultados de indústria em tempo real.</div>
              </div>
            </div>
          </section>

          {/* Campanhas */}
          <section className="tools-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="tools-section-title">Minhas Campanhas</div>
              <button
                className="btn-action teal"
                style={{ fontSize: 13, padding: '7px 16px' }}
                onClick={() => setShowCreateCampaign(true)}
              >
                + Nova
              </button>
            </div>

            {campaignsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {[1, 2].map(i => (
                  <div key={i} className="campaign-quick-card" style={{ pointerEvents: 'none' }}>
                    <div className="cqc-main">
                      <span className="skeleton" style={{ display: 'block', height: 15, width: '55%', marginBottom: 8 }} />
                      <span className="skeleton" style={{ display: 'block', height: 11, width: '38%' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : campaigns.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📊</div>
                <h3 className="empty-title">Nenhuma campanha ainda</h3>
                <p className="empty-description">Crie sua primeira campanha para começar a acompanhar positivação.</p>
                <button className="btn-action teal" onClick={() => setShowCreateCampaign(true)}>+ Criar Campanha</button>
              </div>
            ) : (
              <div className="campaigns-quick-list">
                {campaigns.map(c => {
                  const start = new Date(c.startDate).toLocaleDateString('pt-BR');
                  const end = new Date(c.endDate).toLocaleDateString('pt-BR');
                  const industriesCount = Object.keys(c.industries || {}).length;
                  return (
                    <div
                      key={c.id}
                      className="campaign-quick-card"
                      onClick={() => setSelectedCampaignId(c.id)}
                    >
                      <div className="cqc-main">
                        <div className="cqc-name">{c.name}</div>
                        <div className="cqc-meta">{start} – {end} · {industriesCount} indústria{industriesCount !== 1 ? 's' : ''}</div>
                      </div>
                      <div className="cqc-actions">
                        <button
                          className="btn-icon btn-edit"
                          title="Editar"
                          onClick={(e) => handleEditCampaign(e, c)}
                        >✏️</button>
                        <button
                          className="btn-icon btn-delete"
                          title="Apagar"
                          onClick={(e) => handleDeleteCampaign(e, c.id)}
                        >🗑️</button>
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
      return <div className="loading">Carregando campanha...</div>;
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
                <p>{campaignPeriod} | {campaignClients.length} Clientes | {Object.keys(selectedCampaign.industries || {}).length} Indústrias</p>
              </div>
            </div>
            <div className="campaign-view-actions">
              <button className="btn-edit-campaign" onClick={(e) => handleEditCampaign(e, selectedCampaign)}>✏️ Editar</button>
              <button className="btn-whatsapp" onClick={handleWhatsAppSupport}>💬 Suporte</button>
              <button className="btn-logout" onClick={handleLogout}>Sair</button>
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
          {activeTab === 'clients' && (
            <section className="clients-section">
              <div className="filters">
                <div className="filter-group" style={{ flex: 2 }}>
                  <input type="text" placeholder="Buscar por Nome ou CNPJ..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <div className="filter-group">
                  <select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)}>
                    <option value="all">Todas as Cidades</option>
                    {cities.filter(c => c !== 'all').map(city => (<option key={city} value={city}>{city}</option>))}
                  </select>
                </div>
                <button className="btn-action teal" onClick={() => setShowCreateClient(true)}>+ Novo Cliente</button>
              </div>

              {clientsLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} className="client-card" style={{ pointerEvents: 'none' }}>
                      <span className="skeleton" style={{ display: 'block', height: 16, width: '50%', marginBottom: 10 }} />
                      <span className="skeleton" style={{ display: 'block', height: 12, width: '35%', marginBottom: 8 }} />
                      <span className="skeleton" style={{ display: 'block', height: 11, width: '65%' }} />
                    </div>
                  ))}
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">👥</div>
                  <h3 className="empty-title">Nenhum cliente encontrado</h3>
                  <p className="empty-description">Adicione clientes ou ajuste os filtros!</p>
                  <button className="btn-action teal" onClick={() => setShowCreateClient(true)}>+ Adicionar Primeiro Cliente</button>
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
                        <div>
                          <div className="client-header">
                            <div className="client-title-section">
                              <h3>
                                {client.CLIENTE}
                                {isComplete && <span className="icon-complete" title="Cliente 100% completo!">🏆</span>}
                              </h3>
                              <p>{client.CIDADE} - {client.ESTADO}</p>
                            </div>
                            <div className="client-actions-btns">
                              <button className="btn-icon btn-edit" onClick={(e) => handleOpenEditInfo(e, client)} title="Editar">✏️</button>
                              <button className="btn-icon btn-delete" onClick={(e) => handleDeleteClient(e, client.id)} title="Deletar">🗑️</button>
                            </div>
                          </div>
                          <div className="client-info-grid">
                            <div className="client-info-item"><strong>CNPJ</strong><span>{client.CNPJ}</span></div>
                            <div className="client-info-item"><strong>TELEFONE</strong><span>{client.TELEFONE || '--'}</span></div>
                          </div>
                        </div>

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
                                    <div key={industryName} className="industry-section" onClick={(e) => handleOpenEditProducts(e, client)} style={{ cursor: 'pointer' }}>
                                      <strong className="industry-name">🏭 {industryName}</strong>
                                      <div className="progress-bar"><div className="progress-fill" style={{ width: `${percentage}%` }} /></div>
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

  return (
    <>
      {!selectedCampaign ? renderMainDashboard() : renderCampaignView()}

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
          onSave={handleCreateClient}
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

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={() => { confirmDialog.onConfirm?.(); closeConfirm(); }}
        onCancel={closeConfirm}
      />
    </>
  );
};

export default Dashboard;
