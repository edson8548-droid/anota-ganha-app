
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileSpreadsheet, ClipboardList, BarChart3, Store, Plus, RotateCcw, Trash2, Copy, MessageCircle, Pencil, LifeBuoy, LogOut } from 'lucide-react';
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
import { uploadAvatar } from '../services/api';
import { getDailyMotivationMessage } from '../data/dailyMotivationMessages';
import { backendUrl } from '../config/api';
import './Dashboard.css';

const INDUSTRY_META_FIELDS = ['targetValue', 'alreadySoldValue'];

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
  const [selectedNeighborhood, setSelectedNeighborhood] = useState('all');
  const [selectedActionStatus, setSelectedActionStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [messageComposer, setMessageComposer] = useState(null);
  const [showCampaignSelector, setShowCampaignSelector] = useState(false);

  const [expandedClientId, setExpandedClientId] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', description: '', onConfirm: null });
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);

  const showConfirm = (title, description, onConfirm) =>
    setConfirmDialog({ open: true, title, description, onConfirm });
  const closeConfirm = () => setConfirmDialog(d => ({ ...d, open: false }));

  // Wake up backend on first load
  useEffect(() => {
    fetch(backendUrl('/health'), { method: 'GET', mode: 'cors' }).catch(() => {});
  }, []);

  // Inicializa avatar com photoURL do Firestore
  useEffect(() => {
    if (user?.photoURL) setAvatarUrl(user.photoURL);
  }, [user?.photoURL]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const r = await uploadAvatar(file);
      setAvatarUrl(r.data.photoURL);
      if (authData.updateUserProfile) {
        await authData.updateUserProfile({ photoURL: r.data.photoURL });
      }
      toast.success('Foto atualizada');
    } catch {
      toast.error('Erro ao subir foto');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

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
      const newCampaignId = await createCampaign(campaignData);
      setShowCreateCampaign(false);
      setShowCampaignSelector(false);
      if (newCampaignId) setSelectedCampaignId(newCampaignId);
    } catch (error) { console.error('Erro ao criar campanha:', error); }
  };
  const handleEditCampaign = (e, campaign) => {
    e.stopPropagation();
    setEditingCampaign(campaign);
    setShowCreateCampaign(true);
  };
  const handleOpenNewCampaign = (e) => {
    e?.stopPropagation();
    setEditingCampaign(null);
    setShowCampaignSelector(false);
    setShowCreateCampaign(true);
  };
  const handleOpenCampaignSelector = () => {
    if (campaignsLoading) {
      toast.info('Carregando campanhas...');
      return;
    }
    if (campaigns.length === 0) {
      setShowCreateCampaign(true);
      return;
    }
    if (campaigns.length === 1) {
      setSelectedCampaignId(campaigns[0].id);
      return;
    }
    setShowCampaignSelector(true);
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
  const buildResetIndustries = (campaign) => {
    const resetIndustries = {};
    Object.entries(campaign?.industries || {}).forEach(([industryName, industryData]) => {
      resetIndustries[industryName] = {};
      Object.entries(industryData || {}).forEach(([fieldName, fieldValue]) => {
        if (fieldName === 'alreadySoldValue') {
          resetIndustries[industryName][fieldName] = 0;
        } else if (INDUSTRY_META_FIELDS.includes(fieldName)) {
          resetIndustries[industryName][fieldName] = fieldValue;
        } else {
          resetIndustries[industryName][fieldName] = { positivado: false, valor: 0 };
        }
      });
    });
    return resetIndustries;
  };
  const handleDuplicateCampaign = (e) => {
    e.stopPropagation();
    if (!selectedCampaign) return;

    showConfirm(
      'Duplicar campanha',
      'Será criada uma nova campanha com as mesmas indústrias e produtos, mas com vendas e positivações zeradas.',
      async () => {
        try {
          const today = new Date().toISOString().slice(0, 10);
          const newCampaignId = await createCampaign({
            name: `${selectedCampaign.name} - nova`,
            startDate: today,
            endDate: selectedCampaign.endDate || today,
            status: 'active',
            industries: buildResetIndustries(selectedCampaign)
          });
          if (newCampaignId) setSelectedCampaignId(newCampaignId);
          toast.success('Nova campanha criada com as indústrias reaproveitadas.');
        } catch (error) {
          console.error('Erro ao duplicar campanha:', error);
          toast.error('Erro ao duplicar campanha.');
        }
      }
    );
  };
  const handleCloseCampaign = (e) => {
    e.stopPropagation();
    if (!selectedCampaign) return;

    showConfirm(
      'Encerrar campanha',
      'A campanha ficará inativa, mas os resultados continuarão salvos para consulta.',
      async () => {
        try {
          await updateCampaign(selectedCampaign.id, { status: 'inactive' });
          toast.success('Campanha encerrada.');
        } catch (error) {
          console.error('Erro ao encerrar campanha:', error);
          toast.error('Erro ao encerrar campanha.');
        }
      }
    );
  };
  const handleResetCampaignProgress = (e) => {
    e.stopPropagation();
    if (!selectedCampaign) return;

    showConfirm(
      'Zerar vendas da campanha',
      'Isto limpa as positivações e valores vendidos dos clientes desta campanha, mas mantém clientes, indústrias, produtos e metas cadastradas.',
      async () => {
        try {
          const resetIndustries = buildResetIndustries(selectedCampaign);

          await Promise.all(campaignClients.map(client => {
            const nextIndustries = { ...(client.industries || {}) };

            Object.entries(selectedCampaign.industries || {}).forEach(([industryName, industryConfig]) => {
              const currentIndustry = nextIndustries[industryName] || {};
              nextIndustries[industryName] = {};

              Object.keys(industryConfig || {})
                .filter(productName => !INDUSTRY_META_FIELDS.includes(productName))
                .forEach(productName => {
                  nextIndustries[industryName][productName] = {
                    ...(currentIndustry[productName] || {}),
                    positivado: false,
                    valor: 0
                  };
                });
            });

            return updateClient(client.id, { industries: nextIndustries });
          }));

          await updateCampaign(selectedCampaign.id, { industries: resetIndustries });

          toast.success('Vendas e positivações zeradas para esta campanha.');
        } catch (error) {
          console.error('Erro ao zerar campanha:', error);
          toast.error('Erro ao zerar vendas da campanha.');
        }
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

  const getClientDisplayName = (client) => {
    return client.CLIENTE || client.NOME || client.nome || client.RAZAO_SOCIAL ||
      client.razao_social || client.NOME_FANTASIA || client.nome_fantasia ||
      client.CNPJ || 'Cliente sem nome';
  };

  const getClientContactName = (client) => {
    const contact = client.CONTATO || client.contato || client.NOME_CONTATO || '';
    if (String(contact).trim()) return String(contact).trim();
    const displayName = getClientDisplayName(client);
    return displayName === 'Cliente sem nome' ? 'cliente' : displayName.split(' ')[0];
  };

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const getClientIndustrySummaries = (client) => {
    if (!selectedCampaign) return [];
    return Object.keys(selectedCampaign.industries || {}).map(industryName => {
      const clientIndustryProducts = client.industries?.[industryName] || {};
      const campaignProducts = selectedCampaign.industries[industryName] || {};
      const productNames = Object.keys(campaignProducts).filter(p => !INDUSTRY_META_FIELDS.includes(p));
      const soldProducts = [];
      const missingProducts = [];
      let totalValue = 0;

      productNames.forEach(productName => {
        const productData = clientIndustryProducts[productName];
        if (productData?.positivado) {
          soldProducts.push(productName);
          totalValue += parseFloat(productData.valor) || 0;
        } else {
          missingProducts.push(productName);
        }
      });

      return {
        name: industryName,
        soldProducts,
        missingProducts,
        total: productNames.length,
        sold: soldProducts.length,
        totalValue,
        percentage: productNames.length > 0 ? (soldProducts.length / productNames.length) * 100 : 0
      };
    });
  };

  const getClientActionMeta = (client) => {
    const industrySummaries = getClientIndustrySummaries(client);
    const total = industrySummaries.reduce((sum, industry) => sum + industry.total, 0);
    const sold = industrySummaries.reduce((sum, industry) => sum + industry.sold, 0);
    const missingCount = industrySummaries.reduce((sum, industry) => sum + industry.missingProducts.length, 0);
    const completion = total > 0 ? (sold / total) * 100 : 0;
    const phoneDigits = String(client.TELEFONE || '').replace(/\D/g, '');
    const hasPhone = phoneDigits.length >= 10;
    let status = 'empty';
    if (total > 0 && sold >= total) status = 'complete';
    else if (sold > 0) status = 'partial';

    let priority = 'medium';
    if (status === 'partial') priority = missingCount <= 3 || completion >= 50 ? 'high' : 'medium';
    if (status === 'empty') priority = hasPhone ? 'medium' : 'low';
    if (status === 'complete') priority = 'done';

    return { industrySummaries, total, sold, missingCount, completion, status, priority, hasPhone, phoneDigits };
  };

  const getPriorityLabel = (priority) => {
    if (priority === 'high') return 'Alta prioridade';
    if (priority === 'medium') return 'Prioridade media';
    if (priority === 'low') return 'Baixa prioridade';
    return 'Concluido';
  };

  const getMissingProducts = (meta) => meta.industrySummaries
    .flatMap(industry => industry.missingProducts)
    .slice(0, 12);

  const buildClientMessage = (client, meta = getClientActionMeta(client), template = 'oferta', prices = {}) => {
    const name = getClientContactName(client);
    const greeting = getTimeGreeting();
    const missingProducts = getMissingProducts(meta);
    const missingLines = missingProducts
      .map(product => `- ${product}: R$ ${prices[product] || ''}`)
      .join('\n');
    const introByTemplate = {
      oferta: 'Separei algumas ofertas especialmente para você aproveitar na sua loja:',
      reativacao: 'Faz tempo que não vejo esses itens no seu pedido e separei uma oportunidade para repor com boa saída:',
      fechamento: 'Estou fechando os pedidos de hoje e deixei estes itens separados para você analisar:'
    };
    const ctaByTemplate = {
      oferta: 'Posso separar uma sugestão de pedido com esses itens para você analisar?',
      reativacao: 'Quer que eu monte uma sugestão de reposição com esses produtos?',
      fechamento: 'Me confirma o que posso reservar para você antes de fechar?'
    };

    return [
      `${greeting}, ${name}. Tudo bem?`,
      introByTemplate[template] || introByTemplate.oferta,
      missingLines || '- Produtos em oferta selecionados para sua loja',
      ctaByTemplate[template] || ctaByTemplate.oferta
    ].join('\n\n');
  };

  const handleCopyClientMessage = async (e, client, meta) => {
    e.stopPropagation();
    const message = buildClientMessage(client, meta);
    try {
      await navigator.clipboard.writeText(message);
      toast.success('Mensagem copiada');
    } catch {
      toast.warning('Não consegui copiar automaticamente. Tente pelo WhatsApp.');
    }
  };

  const handleOpenClientWhatsApp = (e, client, meta) => {
    e.stopPropagation();
    const missingProducts = getMissingProducts(meta);
    setMessageComposer({
      client,
      meta,
      template: 'oferta',
      prices: {},
      message: buildClientMessage(client, meta, 'oferta', {}),
      products: missingProducts
    });
  };

  const updateComposerMessage = (nextComposer) => ({
    ...nextComposer,
    message: buildClientMessage(nextComposer.client, nextComposer.meta, nextComposer.template, nextComposer.prices)
  });

  const handleComposerTemplateChange = (template) => {
    setMessageComposer(current => current ? updateComposerMessage({ ...current, template }) : current);
  };

  const handleComposerPriceChange = (product, value) => {
    setMessageComposer(current => {
      if (!current) return current;
      const prices = { ...current.prices, [product]: value };
      return updateComposerMessage({ ...current, prices });
    });
  };

  const handleComposerTextChange = (value) => {
    setMessageComposer(current => current ? { ...current, message: value } : current);
  };

  const handleCopyComposerMessage = async () => {
    if (!messageComposer) return;
    try {
      await navigator.clipboard.writeText(messageComposer.message);
      toast.success('Mensagem copiada');
    } catch {
      toast.warning('Não consegui copiar automaticamente.');
    }
  };

  const handleSendComposerWhatsApp = () => {
    if (!messageComposer) return;
    const client = messageComposer.client;
    const meta = messageComposer.meta;
    const phoneDigits = meta?.phoneDigits || String(client.TELEFONE || '').replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      toast.warning('Cliente sem telefone válido');
      return;
    }
    const phone = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(messageComposer.message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setMessageComposer(null);
  };

  const handleToggleClientCard = (e, clientId) => {
    e.stopPropagation();
    setExpandedClientId(prevId => (prevId === clientId ? null : clientId));
  };

  useEffect(() => {
    setSelectedNeighborhood('all');
  }, [selectedCity]);

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
  const cityFilteredClients = selectedCity === 'all'
    ? campaignClients
    : campaignClients.filter(client => client.CIDADE === selectedCity);
  const neighborhoods = ['all', ...new Set(cityFilteredClients.map(c => c.BAIRRO).filter(Boolean))];
  const filteredClients = campaignClients.filter(client => {
    const matchesCity = selectedCity === 'all' || client.CIDADE === selectedCity;
    const matchesNeighborhood = selectedNeighborhood === 'all' || client.BAIRRO === selectedNeighborhood;
    const clientName = getClientDisplayName(client);
    const meta = getClientActionMeta(client);
    const matchesStatus =
      selectedActionStatus === 'all' ||
      meta.status === selectedActionStatus ||
      (selectedActionStatus === 'priority' && meta.priority === 'high');
    const matchesSearch = !searchTerm ||
      clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.CNPJ?.includes(searchTerm);
    return matchesCity && matchesNeighborhood && matchesStatus && matchesSearch;
  });

  const actionStats = campaignClients.reduce((acc, client) => {
    const matchesCity = selectedCity === 'all' || client.CIDADE === selectedCity;
    const matchesNeighborhood = selectedNeighborhood === 'all' || client.BAIRRO === selectedNeighborhood;
    if (!matchesCity || !matchesNeighborhood) return acc;
    const meta = getClientActionMeta(client);
    acc.total++;
    acc[meta.status] = (acc[meta.status] || 0) + 1;
    if (meta.priority === 'high') acc.priority++;
    acc.missingProducts += meta.missingCount;
    return acc;
  }, { total: 0, empty: 0, partial: 0, complete: 0, priority: 0, missingProducts: 0 });

  // ============================================
  // RENDER: TELA PRINCIPAL (LISTA DE CAMPANHAS)
  // ============================================
  const renderMainDashboard = () => {
    const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : '?';
    const displayName = (user?.name || user?.displayName || user?.email?.split('@')[0] || 'RCA').split(' ')[0];
    const currentHour = new Date().getHours();
    const greeting = currentHour < 12 ? 'Bom dia' : currentHour < 18 ? 'Boa tarde' : 'Boa noite';
    const dailyMessage = getDailyMotivationMessage();

    return (
      <div className="dashboard-container">
        {/* Header */}
        <header className="dashboard-header">
          <div className="header-content">
            <div className="header-left">
              <a className="logo" href="/dashboard">
                <img className="logo-icon-img" src="/assets/logo/venpro-logo-icon-transparent.png" alt="VenPro" />
                <span className="logo-ven">Ven</span><span className="logo-pro">Pro</span>
              </a>
            </div>
            <div className="header-actions">
              <button className="btn-nav" onClick={() => navigate('/plans')}>Planos</button>
              <button className="btn-nav" onClick={() => navigate('/minha-licenca')}>Licença</button>
              <button className="btn-nav" onClick={handleWhatsAppSupport}>Suporte</button>
              <div className="user-menu">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={handleAvatarChange}
                />
                <div
                  className={`user-avatar${uploadingAvatar ? ' avatar-uploading' : ''}`}
                  onClick={() => !uploadingAvatar && avatarInputRef.current.click()}
                  title="Clique para trocar a foto"
                >
                  {avatarUrl
                    ? <img src={avatarUrl} alt="avatar" className="avatar-img" />
                    : uploadingAvatar ? '...' : userInitial
                  }
                </div>
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
          <section className="daily-message-card">
            <div className="daily-message-kicker">Mensagem diaria de incentivo</div>
            <h2 className="daily-message-title">{greeting}, {displayName}</h2>
            <p className="daily-message-text">{dailyMessage}</p>
          </section>

          {/* Ferramentas */}
          <section className="tools-section">
            <div className="tools-section-title">Ferramentas</div>
            <div className="tools-grid">
              <div className="tool-card" onClick={() => navigate('/cotacao')}>
                <div className="tool-card-icon"><FileSpreadsheet size={32} /></div>
                <div className="tool-card-title">Cotação Pronta</div>
                <div className="tool-card-desc">Suba a planilha do cliente e receba a cotação preenchida automaticamente por código de barras ou nome do produto. Menos digitação, menos erro e mais tempo livre para atender clientes, visitar lojas e vender mais.</div>
              </div>
              <div className="tool-card" onClick={() => navigate('/assistente')}>
                <div className="tool-card-icon"><ClipboardList size={32} /></div>
                <div className="tool-card-title">Biblioteca de Prompts</div>
                <div className="tool-card-desc">Copie comandos prontos para organizar tabelas, montar ofertas, revisar mensagens e usar no ChatGPT, Gemini ou outra IA da sua preferência.</div>
              </div>
              <div className="tool-card" onClick={() => navigate('/disparador-whatsapp')}>
                <div className="tool-card-icon"><MessageCircle size={32} /></div>
                <div className="tool-card-title">Carteira no WhatsApp</div>
                <div className="tool-card-desc">Monte sua oferta uma vez e envie para todos os seus clientes pelo WhatsApp Web, com mensagens personalizadas, fotos dos produtos ou link de venda. Menos copia e cola, mais clientes avisados e mais tempo para vender.</div>
              </div>
              <div className="tool-card" onClick={handleOpenCampaignSelector}>
                <div className="tool-card-icon"><BarChart3 size={32} /></div>
                <div className="tool-card-title">Raio-X dos Incentivos</div>
                <div className="tool-card-desc">Acompanhe sua carteira em um só painel: veja clientes positivados, clientes parados, itens vendidos por cliente, campanhas ativas e oportunidades para ganhar mais incentivos da indústria. Mais controle para saber onde agir e vender melhor.</div>
              </div>
              <div className="tool-card" onClick={() => navigate('/vitrine')}>
                <div className="tool-card-icon"><Store size={32} /></div>
                <div className="tool-card-title">Vitrine Inteligente</div>
                <div className="tool-card-desc">Monte sua oferta com produtos e preços, gere um link exclusivo e envie para seus clientes. Eles escolhem as quantidades e mandam o pedido direto no seu WhatsApp — sem ligação, sem digitação.</div>
              </div>
            </div>
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
              <button className="venpro-back-button" onClick={() => setSelectedCampaignId(null)} title="Voltar" aria-label="Voltar">
                <ArrowLeft size={18} />
              </button>
              <div className="campaign-view-info">
                <h1>{selectedCampaign.name}</h1>
                <p>{campaignPeriod} | {campaignClients.length} Clientes | {Object.keys(selectedCampaign.industries || {}).length} Indústrias</p>
              </div>
            </div>
            <div className="campaign-view-actions" aria-label="Ações do Raio-X">
              <div className="campaign-action-group">
                <button className="btn-campaign-action primary" onClick={handleOpenNewCampaign}>
                  <Plus size={16} /> Nova campanha
                </button>
                <button className="btn-campaign-action secondary" onClick={handleDuplicateCampaign}>
                  <Copy size={16} /> Duplicar
                </button>
                {selectedCampaign.status !== 'inactive' && (
                  <button className="btn-campaign-action secondary" onClick={handleCloseCampaign}>
                    Encerrar
                  </button>
                )}
              </div>

              <div className="campaign-action-group campaign-action-group-admin">
                <button className="btn-campaign-action secondary" onClick={(e) => handleEditCampaign(e, selectedCampaign)}>
                  <Pencil size={16} /> Editar
                </button>
                <button className="btn-campaign-action warning" onClick={handleResetCampaignProgress}>
                  <RotateCcw size={16} /> Zerar vendas
                </button>
                <button className="btn-campaign-action danger" onClick={(e) => handleDeleteCampaign(e, selectedCampaign.id)}>
                  <Trash2 size={16} /> Excluir
                </button>
              </div>

              <div className="campaign-action-group campaign-action-group-account">
                <button className="btn-campaign-action support" onClick={handleWhatsAppSupport}>
                  <LifeBuoy size={16} /> Suporte
                </button>
                <button className="btn-campaign-action ghost" onClick={handleLogout}>
                  <LogOut size={16} /> Sair
                </button>
              </div>
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
                <div className="filter-group">
                  <select value={selectedNeighborhood} onChange={(e) => setSelectedNeighborhood(e.target.value)}>
                    <option value="all">Todos os Bairros</option>
                    {neighborhoods.filter(b => b !== 'all').map(neighborhood => (
                      <option key={neighborhood} value={neighborhood}>{neighborhood}</option>
                    ))}
                  </select>
                </div>
                <div className="filter-group">
                  <select value={selectedActionStatus} onChange={(e) => setSelectedActionStatus(e.target.value)}>
                    <option value="all">Todos os status</option>
                    <option value="priority">Alta prioridade</option>
                    <option value="empty">Sem venda ainda</option>
                    <option value="partial">Venda parcial</option>
                    <option value="complete">100% positivado</option>
                  </select>
                </div>
                <button className="btn-action teal" onClick={() => setShowCreateClient(true)}>+ Novo Cliente</button>
              </div>

              <div className="clients-action-summary">
                <div className="summary-main">
                  <span>Resumo do dia</span>
                  <strong>
                    Foque em {actionStats.priority || actionStats.partial || actionStats.empty} cliente{(actionStats.priority || actionStats.partial || actionStats.empty) !== 1 ? 's' : ''} de maior chance.
                  </strong>
                  <p>
                    {selectedCity === 'all' ? 'Todas as cidades' : selectedCity}
                    {selectedNeighborhood !== 'all' ? ` / ${selectedNeighborhood}` : ''}: {actionStats.empty} sem venda, {actionStats.partial} parciais, {actionStats.complete} completos.
                  </p>
                </div>
                <div className="summary-kpis">
                  <div><strong>{actionStats.priority}</strong><span>prioridade alta</span></div>
                  <div><strong>{actionStats.missingProducts}</strong><span>itens faltando</span></div>
                  <div><strong>{filteredClients.length}</strong><span>no filtro atual</span></div>
                </div>
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
                    const clientDisplayName = getClientDisplayName(client);
                    const clientIndustries = client.industries || {};
                    const totalClientValue = Object.values(clientIndustries).reduce((acc, industry) =>
                      acc + Object.values(industry).reduce((sum, p) => sum + (p.valor || 0), 0)
                    , 0);

                    const isExpanded = expandedClientId === client.id;
                    const totalIndustriesCount = Object.keys(selectedCampaign.industries || {}).length;
                    const actionMeta = getClientActionMeta(client);
                    const industrySummaries = actionMeta.industrySummaries;
                    const isComplete = actionMeta.status === 'complete';

                    return (
                      <div key={client.id} className="client-card">
                        <div>
                          <div className="client-header">
                            <div className="client-title-section">
                              <h3>
                                {clientDisplayName}
                                {isComplete && <span className="icon-complete" title="Cliente 100% completo!">🏆</span>}
                              </h3>
                              <p>{client.CIDADE} - {client.ESTADO}</p>
                              {client.BAIRRO && <p className="client-neighborhood">{client.BAIRRO}</p>}
                            </div>
                            <div className="client-actions-btns">
                              <button className="btn-icon btn-edit" onClick={(e) => handleOpenEditInfo(e, client)} title="Editar" aria-label="Editar cliente">
                                <Pencil size={16} />
                              </button>
                              <button className="btn-icon btn-delete" onClick={(e) => handleDeleteClient(e, client.id)} title="Excluir" aria-label="Excluir cliente">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                          <div className={`client-priority-badge ${actionMeta.priority}`}>
                            {getPriorityLabel(actionMeta.priority)}
                          </div>
                          <div className="client-info-grid">
                            <div className="client-info-item"><strong>CNPJ</strong><span>{client.CNPJ}</span></div>
                            <div className="client-info-item"><strong>CONTATO</strong><span>{client.CONTATO || '--'}</span></div>
                            <div className="client-info-item"><strong>TELEFONE</strong><span>{client.TELEFONE || '--'}</span></div>
                          </div>
                          <div className="client-industry-summary">
                            {industrySummaries.map(industry => (
                              <button
                                key={industry.name}
                                type="button"
                                className={`client-industry-pill ${industry.sold === industry.total && industry.total > 0 ? 'complete' : industry.sold > 0 ? 'partial' : 'empty'}`}
                                onClick={(e) => handleOpenEditProducts(e, client)}
                                title={industry.missingProducts.length > 0 ? `Faltam: ${industry.missingProducts.join(', ')}` : 'Industria completa'}
                              >
                                <span>{industry.name}</span>
                                <strong>{industry.sold}/{industry.total}</strong>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="client-collapsible-content">
                          {isExpanded && (
                            <>
                              <div className="client-industries">
                                {Object.keys(selectedCampaign.industries || {}).map(industryName => {
                                  const industry = industrySummaries.find(item => item.name === industryName);
                                  if (!industry) return null;
                                  return (
                                    <div key={industryName} className="industry-section" onClick={(e) => handleOpenEditProducts(e, client)} style={{ cursor: 'pointer' }}>
                                      <strong className="industry-name">🏭 {industryName}</strong>
                                      <div className="progress-bar"><div className="progress-fill" style={{ width: `${industry.percentage}%` }} /></div>
                                      <div className="industry-total">
                                        <span>{industry.sold}/{industry.total} produtos</span>
                                        <span>{formatCurrency(industry.totalValue)}</span>
                                      </div>
                                      <div className="industry-products-status">
                                        {industry.soldProducts.length > 0 && (
                                          <div>
                                            <strong>Vendido</strong>
                                            <span>{industry.soldProducts.join(', ')}</span>
                                          </div>
                                        )}
                                        {industry.missingProducts.length > 0 && (
                                          <div>
                                            <strong>Falta</strong>
                                            <span>{industry.missingProducts.join(', ')}</span>
                                          </div>
                                        )}
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
                          {!isComplete && (
                            <div className="client-message-actions">
                              <button type="button" onClick={(e) => handleCopyClientMessage(e, client, actionMeta)}>
                                Copiar mensagem
                              </button>
                              <button type="button" className="whatsapp" onClick={(e) => handleOpenClientWhatsApp(e, client, actionMeta)}>
                                Preparar WhatsApp
                              </button>
                            </div>
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

      {showCampaignSelector && !selectedCampaign && (
        <div className="campaign-selector-overlay" onClick={() => setShowCampaignSelector(false)}>
          <div className="campaign-selector-modal" onClick={(e) => e.stopPropagation()}>
            <div className="campaign-selector-header">
              <div>
                <span>Raio-X da campanha</span>
                <h2>Escolha uma campanha</h2>
                <p>Abra uma campanha existente ou crie um novo período de acompanhamento.</p>
              </div>
              <button type="button" className="campaign-selector-close" onClick={() => setShowCampaignSelector(false)} aria-label="Fechar">
                ×
              </button>
            </div>

            <div className="campaign-selector-grid">
              {campaigns.map(campaign => {
                const startDate = campaign.startDate ? new Date(campaign.startDate).toLocaleDateString('pt-BR') : '--';
                const endDate = campaign.endDate ? new Date(campaign.endDate).toLocaleDateString('pt-BR') : '--';
                const industryCount = Object.keys(campaign.industries || {}).length;
                const linkedClientCount = clients.filter(client =>
                  client.campaignId === campaign.id || (campaign.clientIds || []).includes(client.id)
                ).length;

                return (
                  <button
                    key={campaign.id}
                    type="button"
                    className="campaign-selector-card"
                    onClick={() => {
                      setSelectedCampaignId(campaign.id);
                      setShowCampaignSelector(false);
                    }}
                  >
                    <div className="campaign-selector-card-top">
                      <span className={`campaign-selector-status ${campaign.status === 'inactive' ? 'inactive' : 'active'}`}>
                        {campaign.status === 'inactive' ? 'Encerrada' : 'Ativa'}
                      </span>
                      <strong>{campaign.name}</strong>
                    </div>
                    <div className="campaign-selector-card-meta">
                      <span>{startDate} - {endDate}</span>
                      <span>{industryCount} indústria{industryCount !== 1 ? 's' : ''}</span>
                      <span>{linkedClientCount} cliente{linkedClientCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="campaign-selector-card-action">
                      Abrir Raio-X
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="campaign-selector-footer">
              <button type="button" className="btn-new-campaign" onClick={handleOpenNewCampaign}>
                <Plus size={16} /> Criar campanha
              </button>
            </div>
          </div>
        </div>
      )}

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

      {messageComposer && (
        <div className="message-composer-overlay" onClick={() => setMessageComposer(null)}>
          <div className="message-composer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="message-composer-header">
              <div>
                <span>Mensagem para WhatsApp</span>
                <h3>{getClientDisplayName(messageComposer.client)}</h3>
                <p>Preencha os preços, revise o texto e envie quando estiver pronto.</p>
              </div>
              <button type="button" onClick={() => setMessageComposer(null)}>×</button>
            </div>

            <div className="message-template-tabs">
              <button
                type="button"
                className={messageComposer.template === 'oferta' ? 'active' : ''}
                onClick={() => handleComposerTemplateChange('oferta')}
              >
                Oferta rápida
              </button>
              <button
                type="button"
                className={messageComposer.template === 'reativacao' ? 'active' : ''}
                onClick={() => handleComposerTemplateChange('reativacao')}
              >
                Reativar cliente
              </button>
              <button
                type="button"
                className={messageComposer.template === 'fechamento' ? 'active' : ''}
                onClick={() => handleComposerTemplateChange('fechamento')}
              >
                Fechamento do dia
              </button>
            </div>

            {messageComposer.products.length > 0 && (
              <div className="message-price-grid">
                {messageComposer.products.map(product => (
                  <label key={product}>
                    <span>{product}</span>
                    <input
                      type="text"
                      value={messageComposer.prices[product] || ''}
                      onChange={(e) => handleComposerPriceChange(product, e.target.value)}
                      placeholder="Ex: 7,99"
                    />
                  </label>
                ))}
              </div>
            )}

            <textarea
              className="message-composer-textarea"
              value={messageComposer.message}
              onChange={(e) => handleComposerTextChange(e.target.value)}
              rows={11}
            />

            <div className="message-composer-footer">
              <button type="button" className="btn-cancel-message" onClick={() => setMessageComposer(null)}>
                Cancelar
              </button>
              <button type="button" className="btn-copy-message" onClick={handleCopyComposerMessage}>
                <Copy size={16} /> Copiar
              </button>
              <button type="button" className="btn-send-message" onClick={handleSendComposerWhatsApp}>
                <MessageCircle size={16} /> Abrir WhatsApp
              </button>
            </div>
          </div>
        </div>
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
