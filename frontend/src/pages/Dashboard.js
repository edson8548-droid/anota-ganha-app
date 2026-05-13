
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileSpreadsheet, ClipboardList, BarChart3, Store, Plus, RotateCcw, Trash2, Copy, MessageCircle, Pencil, LifeBuoy, LogOut, CalendarDays, Bell, CheckCircle2, Clock, StickyNote, Printer } from 'lucide-react';
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
const ATTENDANCE_STATUS_OPTIONS = [
  { value: 'not_called', label: 'Não chamado' },
  { value: 'called', label: 'Chamado' },
  { value: 'follow_up', label: 'Pediu retorno' },
  { value: 'closed', label: 'Fechou' },
  { value: 'not_interested', label: 'Sem interesse' }
];

const getTodayISODate = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
  const [selectedIndustryFilter, setSelectedIndustryFilter] = useState('all');
  const [selectedOpportunityFilter, setSelectedOpportunityFilter] = useState('all');
  const [clientSortMode, setClientSortMode] = useState('smart');
  const [centralCampaignId, setCentralCampaignId] = useState('');
  const [centralStatusFilter, setCentralStatusFilter] = useState('priority');
  const [centralCity, setCentralCity] = useState('all');
  const [centralNeighborhood, setCentralNeighborhood] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [messageComposer, setMessageComposer] = useState(null);
  const [showCampaignSelector, setShowCampaignSelector] = useState(false);
  const [quickSaleDrafts, setQuickSaleDrafts] = useState({});
  const [agendaItems, setAgendaItems] = useState([]);
  const [agendaDraft, setAgendaDraft] = useState({
    title: '',
    date: getTodayISODate(),
    time: '',
    type: 'retorno',
    clientId: '',
    campaignId: '',
    notes: ''
  });
  const [feedbackDraft, setFeedbackDraft] = useState({
    type: 'melhoria',
    message: ''
  });
  const agendaLoadedRef = useRef(false);

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

  const agendaStorageKey = useMemo(() => {
    const userKey = user?.uid || user?.email || 'local';
    return `venpro:rca-agenda:${userKey}`;
  }, [user?.uid, user?.email]);

  useEffect(() => {
    agendaLoadedRef.current = false;
    try {
      const raw = localStorage.getItem(agendaStorageKey);
      setAgendaItems(raw ? JSON.parse(raw) : []);
    } catch {
      setAgendaItems([]);
    } finally {
      agendaLoadedRef.current = true;
    }
  }, [agendaStorageKey]);

  useEffect(() => {
    if (!agendaLoadedRef.current) return;
    localStorage.setItem(agendaStorageKey, JSON.stringify(agendaItems));
  }, [agendaItems, agendaStorageKey]);

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

  useEffect(() => {
    if (centralCampaignId && campaigns.some(c => c.id === centralCampaignId)) return;
    const activeCampaign = campaigns.find(c => c.status !== 'inactive') || campaigns[0];
    setCentralCampaignId(activeCampaign?.id || '');
  }, [campaigns, centralCampaignId]);

  const centralCampaign = useMemo(() => {
    if (!centralCampaignId) return campaigns.find(c => c.status !== 'inactive') || campaigns[0] || null;
    return campaigns.find(c => c.id === centralCampaignId) || null;
  }, [centralCampaignId, campaigns]);

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
  const handleSendDashboardFeedback = (e) => {
    e.preventDefault();
    const text = feedbackDraft.message.trim();
    if (!text) {
      toast.warning('Escreva sua melhoria, reclamação ou sugestão.');
      return;
    }

    const typeLabels = {
      melhoria: 'melhoria',
      reclamacao: 'reclamação',
      duvida: 'dúvida',
      outro: 'comentário'
    };
    const label = typeLabels[feedbackDraft.type] || 'comentário';
    const userInfo = user?.email ? `\n\nConta: ${user.email}` : '';
    const message = `Olá, tenho uma ${label} sobre o Venpro:\n\n${text}${userInfo}`;
    const url = `https://wa.me/5513997501798?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setFeedbackDraft(current => ({ ...current, message: '' }));
    toast.success('Mensagem preparada no WhatsApp.');
  };
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const todayISO = getTodayISODate;

  const formatDateBR = (value) => {
    if (!value) return '--';
    const [year, month, day] = String(value).split('-');
    if (!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
  };

  const getCampaignDeadlineInfo = (campaign) => {
    if (!campaign?.endDate) return null;
    const end = new Date(`${campaign.endDate}T23:59:59`);
    if (Number.isNaN(end.getTime())) return null;
    const daysLeft = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return { daysLeft, end };
  };

  const getCampaignGoalSummary = (campaign) => {
    const industries = Object.values(campaign?.industries || {});
    const targetValue = industries.reduce((sum, industry) => sum + (parseFloat(industry.targetValue) || 0), 0);
    const soldValue = industries.reduce((sum, industry) => sum + (parseFloat(industry.alreadySoldValue) || 0), 0);
    return {
      targetValue,
      soldValue,
      remaining: Math.max(targetValue - soldValue, 0),
      percentage: targetValue > 0 ? Math.min((soldValue / targetValue) * 100, 100) : 0
    };
  };

  const parseMoneyInput = (value) => {
    const normalized = String(value || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getAgendaDateTime = (item) => {
    if (!item?.date) return null;
    const time = item.time || '23:59';
    const date = new Date(`${item.date}T${time}`);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const getAgendaClientName = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    return client ? getClientDisplayName(client) : '';
  };

  const getAgendaCampaignName = (campaignId) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    return campaign?.name || '';
  };

  const getAgendaStatus = (item) => {
    if (item.done) return 'done';
    const today = todayISO();
    if (item.date < today) return 'overdue';
    if (item.date === today) {
      if (item.time) {
        const dateTime = getAgendaDateTime(item);
        if (dateTime && dateTime.getTime() < Date.now()) return 'overdue';
      }
      return 'today';
    }
    return 'upcoming';
  };

  const handleAgendaDraftChange = (field, value) => {
    setAgendaDraft(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'clientId' && value && !prev.title.trim()) {
        const client = clients.find(c => c.id === value);
        if (client) next.title = `Retornar ${getClientDisplayName(client)}`;
      }
      if (field === 'campaignId' && value && !prev.title.trim()) {
        const campaign = campaigns.find(c => c.id === value);
        if (campaign) next.title = `Acompanhar campanha ${campaign.name}`;
      }
      return next;
    });
  };

  const handleAddAgendaItem = (e) => {
    e.preventDefault();
    const linkedClientName = getAgendaClientName(agendaDraft.clientId);
    const title = agendaDraft.title.trim() || (linkedClientName ? `Retornar ${linkedClientName}` : '');
    if (!title) {
      toast.warning('Informe uma anotação ou escolha um cliente.');
      return;
    }
    const item = {
      id: `agenda-${Date.now()}`,
      title,
      date: agendaDraft.date || todayISO(),
      time: agendaDraft.time,
      type: agendaDraft.type,
      clientId: agendaDraft.clientId,
      campaignId: agendaDraft.campaignId,
      notes: agendaDraft.notes.trim(),
      done: false,
      createdAt: new Date().toISOString()
    };
    setAgendaItems(prev => [item, ...prev]);
    setAgendaDraft({
      title: '',
      date: todayISO(),
      time: '',
      type: 'retorno',
      clientId: '',
      campaignId: selectedCampaign?.id || '',
      notes: ''
    });
    toast.success('Lembrete criado na Agenda RCA.');
  };

  const handleToggleAgendaItem = (id) => {
    setAgendaItems(prev => prev.map(item =>
      item.id === id ? { ...item, done: !item.done, doneAt: !item.done ? new Date().toISOString() : null } : item
    ));
  };

  const handleDeleteAgendaItem = (id) => {
    setAgendaItems(prev => prev.filter(item => item.id !== id));
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

  const getClientIndustrySummariesForCampaign = (client, campaign) => {
    if (!campaign) return [];
    return Object.keys(campaign.industries || {}).map(industryName => {
      const clientIndustryProducts = client.industries?.[industryName] || {};
      const campaignProducts = campaign.industries[industryName] || {};
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

  const getClientIndustrySummaries = (client) => getClientIndustrySummariesForCampaign(client, selectedCampaign);

  const getClientActionMetaForCampaign = (client, campaign) => {
    const industrySummaries = getClientIndustrySummariesForCampaign(client, campaign);
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

  const getClientActionMeta = (client) => getClientActionMetaForCampaign(client, selectedCampaign);

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

  const getQuickSaleKey = (clientId, campaignId = selectedCampaign?.id) => `${campaignId || 'sem-campanha'}:${clientId}`;

  const getSavedQuickSale = (client, campaignId = selectedCampaign?.id) => {
    if (!client || !campaignId) return null;
    return client.quickSales?.[campaignId] || null;
  };

  const getQuickSaleAmounts = (sale) => {
    if (!sale) return { campaignValue: 0, generalValue: 0, totalValue: 0 };
    const campaignValue = parseFloat(sale.valorCampanha ?? sale.campaignValue ?? sale.valor ?? 0) || 0;
    const generalValue = parseFloat(sale.valorGeral ?? sale.generalValue ?? sale.outrosItens ?? 0) || 0;
    const explicitTotal = parseFloat(sale.valorTotal ?? sale.totalValue ?? 0) || 0;
    return {
      campaignValue,
      generalValue,
      totalValue: explicitTotal || campaignValue + generalValue,
    };
  };

  const isDateInCurrentMonth = (value) => {
    if (!value) return false;
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  };

  const getClientCurrentMonthSalesValue = (client) => {
    const quickSales = Object.values(client.quickSales || {});
    const quickSalesValue = quickSales.reduce((sum, sale) => {
      if (!isDateInCurrentMonth(sale.data)) return sum;
      return sum + getQuickSaleAmounts(sale).totalValue;
    }, 0);
    if (quickSalesValue > 0) return quickSalesValue;
    if (isDateInCurrentMonth(client.lastSaleDate)) {
      return parseFloat(client.lastSaleValue || 0) || 0;
    }
    return 0;
  };

  const clientBoughtThisMonth = (client) => getClientCurrentMonthSalesValue(client) > 0;

  const getQuickSaleDraft = (client) => {
    const key = getQuickSaleKey(client.id);
    const saved = getSavedQuickSale(client);
    return quickSaleDrafts[key] || {
      valor: '',
      data: saved?.data || todayISO(),
    };
  };

  const handleQuickSaleDraftChange = (client, field, value) => {
    const key = getQuickSaleKey(client.id);
    setQuickSaleDrafts(prev => ({
      ...prev,
      [key]: {
        ...getQuickSaleDraft(client),
        ...prev[key],
        [field]: value,
      }
    }));
  };

  const handleSaveQuickSale = async (e, client) => {
    e.stopPropagation();
    if (!selectedCampaign) {
      toast.warning('Abra uma campanha para lançar a venda.');
      return;
    }
    const draft = getQuickSaleDraft(client);
    const valorLancado = parseMoneyInput(draft.valor);
    if (valorLancado <= 0) {
      toast.warning('Informe o valor vendido para somar no cliente.');
      return;
    }
    const data = draft.data || todayISO();
    const saved = getSavedQuickSale(client);
    const previousTotal = getQuickSaleAmounts(saved).totalValue;
    const valorTotal = previousTotal + valorLancado;
    const nextQuickSales = {
      ...(client.quickSales || {}),
      [selectedCampaign.id]: {
        valor: 0,
        valorCampanha: 0,
        valorGeral: valorTotal,
        valorTotal,
        data,
        entries: [
          ...(saved?.entries || []),
          { valor: valorLancado, data, createdAt: new Date().toISOString() }
        ],
        campaignName: selectedCampaign.name,
        updatedAt: new Date().toISOString(),
      }
    };
    try {
      await updateClient(client.id, {
        quickSales: nextQuickSales,
        lastSaleValue: valorTotal,
        lastCampaignSaleValue: 0,
        lastGeneralSaleValue: valorTotal,
        lastSaleDate: data,
        lastSaleCampaignId: selectedCampaign.id,
      });
      toast.success('Venda lançada no cliente.');
    } catch (error) {
      console.error('Erro ao lançar venda rápida:', error);
      toast.error('Erro ao lançar venda. Tente novamente.');
    }
  };

  const getClientAttendanceStatus = (client, campaignId = selectedCampaign?.id) => {
    if (!client || !campaignId) return 'not_called';
    return client.attendanceStatus?.[campaignId]?.status || 'not_called';
  };

  const handleClientAttendanceChange = async (e, client) => {
    e.stopPropagation();
    if (!selectedCampaign) return;
    const status = e.target.value;
    const nextAttendanceStatus = {
      ...(client.attendanceStatus || {}),
      [selectedCampaign.id]: {
        status,
        campaignName: selectedCampaign.name,
        updatedAt: new Date().toISOString()
      }
    };
    try {
      await updateClient(client.id, { attendanceStatus: nextAttendanceStatus });
      toast.success('Status de atendimento atualizado.');
    } catch (error) {
      console.error('Erro ao atualizar status de atendimento:', error);
      toast.error('Erro ao salvar status.');
    }
  };

  const getCampaignClients = (campaign) => {
    if (!campaign) return [];
    const legacyClients = clients.filter(c => c.campaignId === campaign.id);
    const newClients = clients.filter(client =>
      (campaign.clientIds || []).includes(client.id)
    );
    const allCampaignClients = [...legacyClients];
    newClients.forEach(nc => {
      if (!allCampaignClients.find(lc => lc.id === nc.id)) {
        allCampaignClients.push(nc);
      }
    });
    return allCampaignClients;
  };

  useEffect(() => {
    setSelectedNeighborhood('all');
  }, [selectedCity]);

  useEffect(() => {
    setCentralNeighborhood('all');
  }, [centralCity, centralCampaignId]);

  const campaignClients = useMemo(() => {
    return getCampaignClients(selectedCampaign);
  }, [selectedCampaign, clients]);

  const campaignIndustryNames = useMemo(() => (
    ['all', ...Object.keys(selectedCampaign?.industries || {})]
  ), [selectedCampaign]);

  const centralBaseClients = useMemo(() => {
    return centralCampaign ? getCampaignClients(centralCampaign) : [];
  }, [centralCampaign, clients]);

  const centralCities = useMemo(() => {
    return ['all', ...new Set(centralBaseClients.map(c => c.CIDADE).filter(Boolean))];
  }, [centralBaseClients]);

  const centralCityFilteredClients = centralCity === 'all'
    ? centralBaseClients
    : centralBaseClients.filter(client => client.CIDADE === centralCity);

  const centralNeighborhoods = useMemo(() => {
    return ['all', ...new Set(centralCityFilteredClients.map(c => c.BAIRRO).filter(Boolean))];
  }, [centralCityFilteredClients]);

  const centralClients = useMemo(() => {
    if (!centralCampaign) return [];
    return centralBaseClients
      .map(client => {
        const meta = getClientActionMetaForCampaign(client, centralCampaign);
        const monthSalesValue = getClientCurrentMonthSalesValue(client);
        const monthlyNoPurchase = monthSalesValue <= 0;
        return {
          client,
          meta: {
            ...meta,
            monthlyNoPurchase,
            monthSalesValue,
            attentionPriority: meta.status !== 'complete' || monthlyNoPurchase || meta.priority === 'high'
          }
        };
      })
      .filter(item => {
        if (centralCity !== 'all' && item.client.CIDADE !== centralCity) return false;
        if (centralNeighborhood !== 'all' && item.client.BAIRRO !== centralNeighborhood) return false;
        if (centralStatusFilter === 'all') return true;
        if (centralStatusFilter === 'priority') return item.meta.attentionPriority;
        if (centralStatusFilter === 'noMonth') return item.meta.monthlyNoPurchase;
        return item.meta.status === centralStatusFilter;
      })
      .sort((a, b) => {
        if (a.meta.monthlyNoPurchase !== b.meta.monthlyNoPurchase) return a.meta.monthlyNoPurchase ? -1 : 1;
        const priorityOrder = { high: 0, medium: 1, low: 2, done: 3 };
        const statusOrder = { partial: 0, empty: 1, complete: 2 };
        const pa = priorityOrder[a.meta.priority] ?? 4;
        const pb = priorityOrder[b.meta.priority] ?? 4;
        if (pa !== pb) return pa - pb;
        const sa = statusOrder[a.meta.status] ?? 4;
        const sb = statusOrder[b.meta.status] ?? 4;
        if (sa !== sb) return sa - sb;
        return b.meta.missingCount - a.meta.missingCount;
      });
  }, [centralCampaign, centralBaseClients, centralCity, centralNeighborhood, centralStatusFilter]);

  const centralStats = useMemo(() => {
    if (!centralCampaign) return { total: 0, empty: 0, partial: 0, complete: 0, priority: 0, noPhone: 0, noMonth: 0 };
    return centralBaseClients.reduce((acc, client) => {
      if (centralCity !== 'all' && client.CIDADE !== centralCity) return acc;
      if (centralNeighborhood !== 'all' && client.BAIRRO !== centralNeighborhood) return acc;
      const meta = getClientActionMetaForCampaign(client, centralCampaign);
      const monthlyNoPurchase = !clientBoughtThisMonth(client);
      acc.total++;
      acc[meta.status] = (acc[meta.status] || 0) + 1;
      if (meta.priority === 'high' || meta.status !== 'complete' || monthlyNoPurchase) acc.priority++;
      if (monthlyNoPurchase) acc.noMonth++;
      if (!meta.hasPhone) acc.noPhone++;
      return acc;
    }, { total: 0, empty: 0, partial: 0, complete: 0, priority: 0, noPhone: 0, noMonth: 0 });
  }, [centralCampaign, centralBaseClients, centralCity, centralNeighborhood]);

  const escapePrintHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const handlePrintCentralList = () => {
    if (!centralCampaign || centralClients.length === 0) {
      toast.warning('Não há clientes na lista para imprimir.');
      return;
    }
    const printedAt = new Date().toLocaleString('pt-BR');
    const filterText = [
      centralCity === 'all' ? 'Todas as cidades' : centralCity,
      centralNeighborhood === 'all' ? 'Todos os bairros' : centralNeighborhood,
      centralStatusFilter === 'priority' ? 'Prioridade' :
        centralStatusFilter === 'noMonth' ? 'Sem compra no mês' :
        centralStatusFilter === 'all' ? 'Todos' :
        centralStatusFilter === 'empty' ? 'Sem venda na campanha' :
        centralStatusFilter === 'partial' ? 'Venda parcial' : 'Completo'
    ].join(' | ');

    const rows = centralClients.map(({ client, meta }, index) => {
      const missingProducts = getMissingProducts(meta);
      const statusLabel = meta.status === 'complete' ? 'Completo' : meta.status === 'partial' ? 'Parcial' : 'Sem venda';
      return `
        <tr>
          <td>${index + 1}</td>
          <td>
            <strong>${escapePrintHtml(getClientDisplayName(client))}</strong><br />
            <span>${escapePrintHtml(client.CNPJ || '')}</span>
          </td>
          <td>${escapePrintHtml(client.CIDADE || '')}</td>
          <td>${escapePrintHtml(client.BAIRRO || '')}</td>
          <td>${escapePrintHtml(client.TELEFONE || '')}</td>
          <td>${statusLabel}${meta.monthlyNoPurchase ? '<br /><b>Sem compra no mês</b>' : ''}</td>
          <td>${missingProducts.length > 0 ? escapePrintHtml(missingProducts.join(', ')) : 'Campanha completa'}</td>
          <td>${formatCurrency(meta.monthSalesValue)}</td>
        </tr>
      `;
    }).join('');

    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      toast.warning('O navegador bloqueou a impressão. Libere pop-ups para imprimir.');
      return;
    }
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Central RCA - ${escapePrintHtml(centralCampaign.name)}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
            h1 { font-size: 22px; margin: 0 0 6px; }
            p { margin: 0 0 14px; color: #4b5563; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; text-align: left; }
            th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; }
            td b { color: #b45309; }
            @media print { body { margin: 12px; } }
          </style>
        </head>
        <body>
          <h1>Central RCA - ${escapePrintHtml(centralCampaign.name)}</h1>
          <p>${escapePrintHtml(filterText)} | Impresso em ${escapePrintHtml(printedAt)} | ${centralClients.length} clientes</p>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th>Cidade</th>
                <th>Bairro</th>
                <th>Telefone</th>
                <th>Status</th>
                <th>Falta positivar</th>
                <th>Compra mês</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const cities = ['all', ...new Set(campaignClients.map(c => c.CIDADE).filter(Boolean))];
  const cityFilteredClients = selectedCity === 'all'
    ? campaignClients
    : campaignClients.filter(client => client.CIDADE === selectedCity);
  const neighborhoods = ['all', ...new Set(cityFilteredClients.map(c => c.BAIRRO).filter(Boolean))];

  const getClientSelectedIndustrySummary = (meta) => {
    if (selectedIndustryFilter === 'all') return null;
    const [, industryName] = selectedIndustryFilter.includes('::')
      ? selectedIndustryFilter.split('::')
      : ['missing', selectedIndustryFilter];
    return meta.industrySummaries.find(industry => industry.name === industryName) || null;
  };

  const getSelectedIndustryFilterMode = () => (
    selectedIndustryFilter.includes('::') ? selectedIndustryFilter.split('::')[0] : 'missing'
  );

  const clientMatchesOpportunityFilter = (client, meta) => {
    if (selectedOpportunityFilter === 'all') return true;
    if (selectedOpportunityFilter === 'fewMissing') {
      return meta.status === 'partial' && meta.missingCount > 0 && meta.missingCount <= 2;
    }
    if (selectedOpportunityFilter === 'almostDone') {
      return meta.status !== 'complete' && meta.completion >= 60;
    }
    if (selectedOpportunityFilter === 'withPhone') return meta.hasPhone;
    if (selectedOpportunityFilter === 'boughtMonth') return clientBoughtThisMonth(client);
    return true;
  };

  const clientMatchesIndustryFilter = (meta) => {
    const industry = getClientSelectedIndustrySummary(meta);
    if (!industry) return true;
    const mode = getSelectedIndustryFilterMode();
    if (mode === 'sold') return industry.soldProducts.length > 0;
    return industry.missingProducts.length > 0;
  };

  const getClientSortScore = (client, meta) => {
    const saleValue = getQuickSaleAmounts(getSavedQuickSale(client)).totalValue;
    if (clientSortMode === 'fewMissing') return meta.missingCount || 9999;
    if (clientSortMode === 'mostMissing') return -(meta.missingCount || 0);
    if (clientSortMode === 'sales') return -saleValue;
    const fewMissingBoost = meta.status === 'partial' && meta.missingCount > 0 && meta.missingCount <= 2 ? -10000 : 0;
    const phoneBoost = meta.hasPhone ? -1000 : 0;
    return fewMissingBoost + phoneBoost - meta.completion + (meta.missingCount * 3);
  };

  const filteredClients = campaignClients
    .map(client => ({ client, meta: getClientActionMeta(client) }))
    .filter(({ client, meta }) => {
    const matchesCity = selectedCity === 'all' || client.CIDADE === selectedCity;
    const matchesNeighborhood = selectedNeighborhood === 'all' || client.BAIRRO === selectedNeighborhood;
    const clientName = getClientDisplayName(client);
    const matchesStatus =
      selectedActionStatus === 'all' ||
      meta.status === selectedActionStatus ||
      (selectedActionStatus === 'priority' && meta.priority === 'high');
    const matchesIndustry = clientMatchesIndustryFilter(meta);
    const matchesOpportunity = clientMatchesOpportunityFilter(client, meta);
    const matchesSearch = !searchTerm ||
      clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.CNPJ?.includes(searchTerm);
    return matchesCity && matchesNeighborhood && matchesStatus && matchesIndustry && matchesOpportunity && matchesSearch;
  })
    .sort((a, b) => {
      const scoreDiff = getClientSortScore(a.client, a.meta) - getClientSortScore(b.client, b.meta);
      if (scoreDiff !== 0) return scoreDiff;
      return getClientDisplayName(a.client).localeCompare(getClientDisplayName(b.client));
    })
    .map(item => item.client);

  const actionStats = campaignClients.reduce((acc, client) => {
    const matchesCity = selectedCity === 'all' || client.CIDADE === selectedCity;
    const matchesNeighborhood = selectedNeighborhood === 'all' || client.BAIRRO === selectedNeighborhood;
    if (!matchesCity || !matchesNeighborhood) return acc;
    const meta = getClientActionMeta(client);
    if (!clientMatchesIndustryFilter(meta) || !clientMatchesOpportunityFilter(client, meta)) return acc;
    acc.total++;
    acc[meta.status] = (acc[meta.status] || 0) + 1;
    if (meta.priority === 'high') acc.priority++;
    acc.missingProducts += meta.missingCount;
    const saleAmounts = getQuickSaleAmounts(getSavedQuickSale(client));
    acc.campaignSalesValue += saleAmounts.campaignValue;
    acc.generalSalesValue += saleAmounts.generalValue;
    acc.totalSalesValue += saleAmounts.totalValue;
    return acc;
  }, {
    total: 0,
    empty: 0,
    partial: 0,
    complete: 0,
    priority: 0,
    missingProducts: 0,
    campaignSalesValue: 0,
    generalSalesValue: 0,
    totalSalesValue: 0
  });

  const attackList = filteredClients.slice(0, 10).map(client => {
    const meta = getClientActionMeta(client);
    return {
      client,
      meta,
      missingProducts: getMissingProducts(meta)
    };
  });

  const handleCopyAttackList = async () => {
    if (attackList.length === 0) {
      toast.warning('Não há clientes na lista de ataque.');
      return;
    }
    const filterLabel = [
      selectedCity === 'all' ? 'Todas as cidades' : selectedCity,
      selectedNeighborhood === 'all' ? 'Todos os bairros' : selectedNeighborhood,
      selectedIndustryFilter === 'all' ? 'Todas as indústrias' : selectedIndustryFilter.replace('missing::', 'Falta ').replace('sold::', 'Já comprou ')
    ].join(' | ');
    const lines = attackList.map(({ client, meta, missingProducts }, index) => {
      const phone = client.TELEFONE || 'sem telefone';
      const location = `${client.CIDADE || 'sem cidade'}${client.BAIRRO ? ` / ${client.BAIRRO}` : ''}`;
      const missing = missingProducts.length > 0 ? missingProducts.join(', ') : 'campanha completa';
      return `${index + 1}. ${getClientDisplayName(client)} | ${phone} | ${location} | ${Math.round(meta.completion)}% | Falta: ${missing}`;
    });
    const text = [
      `Lista de ataque - ${selectedCampaign?.name || 'Campanha'}`,
      filterLabel,
      '',
      ...lines
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Lista de ataque copiada.');
    } catch {
      toast.warning('Não consegui copiar automaticamente.');
    }
  };

  const campaignRouteRanking = useMemo(() => {
    if (!selectedCampaign) return [];
    const ranking = {};
    campaignClients.forEach(client => {
      const meta = getClientActionMetaForCampaign(client, selectedCampaign);
      if (meta.status === 'complete') return;
      const city = client.CIDADE || 'Cidade não informada';
      const neighborhood = client.BAIRRO || 'Bairro não informado';
      const key = `${city}|||${neighborhood}`;
      if (!ranking[key]) {
        ranking[key] = {
          key,
          city,
          neighborhood,
          clients: 0,
          missingProducts: 0,
          easyClients: 0,
          withPhone: 0
        };
      }
      ranking[key].clients++;
      ranking[key].missingProducts += meta.missingCount;
      if (meta.status === 'partial' && meta.missingCount > 0 && meta.missingCount <= 2) ranking[key].easyClients++;
      if (meta.hasPhone) ranking[key].withPhone++;
    });
    return Object.values(ranking)
      .sort((a, b) => {
        if (b.easyClients !== a.easyClients) return b.easyClients - a.easyClients;
        if (b.clients !== a.clients) return b.clients - a.clients;
        return b.missingProducts - a.missingProducts;
      })
      .slice(0, 5);
  }, [selectedCampaign, campaignClients]);

  const handlePrintCampaignReport = () => {
    if (!selectedCampaign) return;
    const goal = getCampaignGoalSummary(selectedCampaign);
    const deadline = getCampaignDeadlineInfo(selectedCampaign);
    const printedAt = new Date().toLocaleString('pt-BR');
    const industriesRows = Object.entries(selectedCampaign.industries || {}).map(([industryName, industry]) => {
      const target = parseFloat(industry.targetValue) || 0;
      const sold = parseFloat(industry.alreadySoldValue) || 0;
      const remaining = Math.max(target - sold, 0);
      const percentage = target > 0 ? Math.min((sold / target) * 100, 100) : 0;
      const productCount = Object.keys(industry || {}).filter(key => !INDUSTRY_META_FIELDS.includes(key)).length;
      return `
        <tr>
          <td>${escapePrintHtml(industryName)}</td>
          <td>${productCount}</td>
          <td>${formatCurrency(target)}</td>
          <td>${formatCurrency(sold)}</td>
          <td>${formatCurrency(remaining)}</td>
          <td>${percentage.toFixed(0)}%</td>
        </tr>
      `;
    }).join('');

    const statusRows = [
      ['Sem venda', actionStats.empty],
      ['Venda parcial', actionStats.partial],
      ['Completo', actionStats.complete],
      ['Alta prioridade', actionStats.priority],
      ['Itens faltando', actionStats.missingProducts]
    ].map(([label, value]) => `<div class="kpi"><strong>${escapePrintHtml(value)}</strong><span>${escapePrintHtml(label)}</span></div>`).join('');

    const routeRows = campaignRouteRanking.map(item => `
      <tr>
        <td>${escapePrintHtml(item.city)}</td>
        <td>${escapePrintHtml(item.neighborhood)}</td>
        <td>${item.clients}</td>
        <td>${item.easyClients}</td>
        <td>${item.missingProducts}</td>
        <td>${item.withPhone}</td>
      </tr>
    `).join('');

    const attackRows = attackList.map(({ client, meta, missingProducts }, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escapePrintHtml(getClientDisplayName(client))}</strong><br /><span>${escapePrintHtml(client.CNPJ || '')}</span></td>
        <td>${escapePrintHtml(client.CIDADE || '')}</td>
        <td>${escapePrintHtml(client.BAIRRO || '')}</td>
        <td>${escapePrintHtml(client.TELEFONE || '')}</td>
        <td>${Math.round(meta.completion)}%</td>
        <td>${escapePrintHtml(missingProducts.length > 0 ? missingProducts.join(', ') : 'Campanha completa')}</td>
        <td>${escapePrintHtml(ATTENDANCE_STATUS_OPTIONS.find(option => option.value === getClientAttendanceStatus(client))?.label || 'Não chamado')}</td>
      </tr>
    `).join('');

    const pendingRows = filteredClients.slice(0, 60).map(client => {
      const meta = getClientActionMeta(client);
      const missingProducts = getMissingProducts(meta);
      const sale = getQuickSaleAmounts(getSavedQuickSale(client)).totalValue;
      return `
        <tr>
          <td>${escapePrintHtml(getClientDisplayName(client))}</td>
          <td>${escapePrintHtml(client.CIDADE || '')}</td>
          <td>${escapePrintHtml(client.BAIRRO || '')}</td>
          <td>${escapePrintHtml(client.TELEFONE || '')}</td>
          <td>${meta.status === 'complete' ? 'Completo' : meta.status === 'partial' ? 'Parcial' : 'Sem venda'}</td>
          <td>${missingProducts.length}</td>
          <td>${formatCurrency(sale)}</td>
        </tr>
      `;
    }).join('');

    const printWindow = window.open('', '_blank', 'width=1200,height=900');
    if (!printWindow) {
      toast.warning('O navegador bloqueou o relatório. Libere pop-ups para gerar o PDF.');
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Relatório - ${escapePrintHtml(selectedCampaign.name)}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #111827; margin: 24px; background: #fff; }
            header { border-bottom: 3px solid #31708E; padding-bottom: 14px; margin-bottom: 18px; }
            h1 { margin: 0 0 6px; font-size: 24px; }
            h2 { font-size: 16px; margin: 22px 0 10px; color: #1f2937; }
            p { margin: 0; color: #4b5563; font-size: 13px; line-height: 1.45; }
            .meta { margin-top: 6px; }
            .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0; }
            .kpi { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px; background: #f9fafb; }
            .kpi strong { display: block; font-size: 18px; margin-bottom: 4px; }
            .kpi span { color: #6b7280; font-size: 11px; font-weight: 700; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 7px; vertical-align: top; text-align: left; }
            th { background: #eef2f7; font-size: 10px; text-transform: uppercase; color: #374151; }
            td span { color: #6b7280; }
            .section-note { margin-bottom: 8px; color: #6b7280; font-size: 12px; }
            .page-break { break-before: page; }
            @media print {
              body { margin: 12px; }
              .no-print { display: none; }
              table { page-break-inside: auto; }
              tr { page-break-inside: avoid; page-break-after: auto; }
            }
          </style>
        </head>
        <body>
          <header>
            <h1>Relatório de Campanha - ${escapePrintHtml(selectedCampaign.name)}</h1>
            <p>${escapePrintHtml(formatDateBR(selectedCampaign.startDate))} até ${escapePrintHtml(formatDateBR(selectedCampaign.endDate))} | Gerado em ${escapePrintHtml(printedAt)}</p>
            <p class="meta">Clientes: ${campaignClients.length} | Indústrias: ${Object.keys(selectedCampaign.industries || {}).length}${deadline ? ` | Vencimento: ${deadline.daysLeft < 0 ? 'encerrada' : `${deadline.daysLeft} dia(s)`}` : ''}</p>
          </header>

          <div class="kpis">
            <div class="kpi"><strong>${formatCurrency(goal.targetValue)}</strong><span>Meta total</span></div>
            <div class="kpi"><strong>${formatCurrency(goal.soldValue)}</strong><span>Vendido campanha</span></div>
            <div class="kpi"><strong>${formatCurrency(goal.remaining)}</strong><span>Falta para meta</span></div>
            <div class="kpi"><strong>${goal.percentage.toFixed(0)}%</strong><span>Avanço</span></div>
            ${statusRows}
          </div>

          <h2>Metas por indústria</h2>
          <table>
            <thead><tr><th>Indústria</th><th>Produtos</th><th>Meta</th><th>Vendido</th><th>Falta</th><th>Avanço</th></tr></thead>
            <tbody>${industriesRows || '<tr><td colspan="6">Sem indústrias cadastradas.</td></tr>'}</tbody>
          </table>

          <h2>Clientes para fechar hoje</h2>
          <p class="section-note">Top clientes conforme os filtros atuais do Raio-X.</p>
          <table>
            <thead><tr><th>#</th><th>Cliente</th><th>Cidade</th><th>Bairro</th><th>Telefone</th><th>Avanço</th><th>Falta vender</th><th>Atendimento</th></tr></thead>
            <tbody>${attackRows || '<tr><td colspan="8">Nenhum cliente na lista de ataque.</td></tr>'}</tbody>
          </table>

          <h2>Ranking por cidade/bairro</h2>
          <table>
            <thead><tr><th>Cidade</th><th>Bairro</th><th>Pendentes</th><th>Fáceis</th><th>Itens faltando</th><th>Com telefone</th></tr></thead>
            <tbody>${routeRows || '<tr><td colspan="6">Sem ranking disponível.</td></tr>'}</tbody>
          </table>

          <h2 class="page-break">Clientes do filtro atual</h2>
          <table>
            <thead><tr><th>Cliente</th><th>Cidade</th><th>Bairro</th><th>Telefone</th><th>Status</th><th>Qtd. faltando</th><th>Total vendido</th></tr></thead>
            <tbody>${pendingRows || '<tr><td colspan="7">Nenhum cliente no filtro atual.</td></tr>'}</tbody>
          </table>

          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const todayAgendaKey = todayISO();
  const agendaStats = agendaItems.reduce((acc, item) => {
    const status = getAgendaStatus(item);
    acc.total++;
    acc[status] = (acc[status] || 0) + 1;
    if (!item.done && item.date === todayAgendaKey) acc.today++;
    return acc;
  }, { total: 0, today: 0, overdue: 0, upcoming: 0, done: 0 });

  const orderedAgendaItems = [...agendaItems].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ad = getAgendaDateTime(a)?.getTime() || Number.MAX_SAFE_INTEGER;
    const bd = getAgendaDateTime(b)?.getTime() || Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });

  const agendaAlerts = orderedAgendaItems
    .filter(item => !item.done && ['overdue', 'today'].includes(getAgendaStatus(item)))
    .slice(0, 4);

  const campaignDeadlineAlerts = campaigns
    .filter(campaign => campaign.status !== 'inactive' && campaign.endDate)
    .map(campaign => {
      const end = new Date(`${campaign.endDate}T23:59:59`);
      const ms = end.getTime() - Date.now();
      return {
        campaign,
        daysLeft: Math.ceil(ms / (1000 * 60 * 60 * 24))
      };
    })
    .filter(item => item.daysLeft >= 0 && item.daysLeft <= 3)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 3);

  const dailyPlanItems = useMemo(() => {
    const activeCampaigns = campaigns.filter(campaign => campaign.status !== 'inactive');
    const items = [];

    activeCampaigns.forEach(campaign => {
      const campaignClientsList = getCampaignClients(campaign);
      const deadline = getCampaignDeadlineInfo(campaign);

      campaignClientsList.forEach(client => {
        const meta = getClientActionMetaForCampaign(client, campaign);
        if (meta.status === 'complete') return;

        const attendanceStatus = getClientAttendanceStatus(client, campaign.id);
        if (attendanceStatus === 'closed' || attendanceStatus === 'not_interested') return;

        const missingProducts = getMissingProducts(meta);
        const monthSalesValue = getClientCurrentMonthSalesValue(client);
        const noPurchaseMonth = monthSalesValue <= 0;
        const fewMissing = meta.status === 'partial' && meta.missingCount > 0 && meta.missingCount <= 2;
        const almostDone = meta.status !== 'complete' && meta.completion >= 60;
        const deadlineDays = deadline?.daysLeft;
        const deadlineBoost = Number.isFinite(deadlineDays) && deadlineDays >= 0 && deadlineDays <= 3
          ? 55 - (deadlineDays * 10)
          : 0;
        const attendanceBoost = {
          follow_up: 42,
          not_called: 30,
          called: 18
        }[attendanceStatus] || 0;

        const score =
          (fewMissing ? 90 : 0) +
          (almostDone ? 55 : 0) +
          (meta.status === 'partial' ? 45 : 0) +
          (meta.hasPhone ? 24 : -22) +
          (noPurchaseMonth ? 18 : 0) +
          deadlineBoost +
          attendanceBoost +
          Math.min(monthSalesValue / 180, 35) -
          Math.min(meta.missingCount * 3, 45);

        const reasons = [];
        if (fewMissing) reasons.push('falta pouco para fechar');
        else if (almostDone) reasons.push('campanha quase completa');
        if (noPurchaseMonth) reasons.push('sem compra no mes');
        if (meta.hasPhone) reasons.push('tem telefone');
        if (attendanceStatus === 'follow_up') reasons.push('pediu retorno');
        if (Number.isFinite(deadlineDays) && deadlineDays >= 0 && deadlineDays <= 3) {
          reasons.push(deadlineDays === 0 ? 'campanha vence hoje' : `vence em ${deadlineDays} dia${deadlineDays > 1 ? 's' : ''}`);
        }

        items.push({
          client,
          campaign,
          meta,
          score,
          missingProducts,
          monthSalesValue,
          noPurchaseMonth,
          attendanceStatus,
          reasons: reasons.slice(0, 4),
          deadlineDays
        });
      });
    });

    return items
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.meta.completion !== a.meta.completion) return b.meta.completion - a.meta.completion;
        return getClientDisplayName(a.client).localeCompare(getClientDisplayName(b.client));
      })
      .slice(0, 12);
  }, [campaigns, clients]);

  const dailyPlanStats = dailyPlanItems.reduce((acc, item) => {
    acc.total++;
    if (item.meta.status === 'partial') acc.partial++;
    if (item.noPurchaseMonth) acc.noPurchaseMonth++;
    if (item.attendanceStatus === 'follow_up') acc.followUp++;
    return acc;
  }, { total: 0, partial: 0, noPurchaseMonth: 0, followUp: 0 });

  const handleOpenDailyPlanItem = (item) => {
    setSelectedCity(item.client.CIDADE || 'all');
    setSelectedActionStatus(item.meta.status === 'partial' ? 'partial' : 'empty');
    setSelectedIndustryFilter('all');
    setSelectedOpportunityFilter(item.meta.status === 'partial' && item.meta.missingCount <= 2 ? 'fewMissing' : 'all');
    setClientSortMode('smart');
    setSelectedCampaignId(item.campaign.id);
    setTimeout(() => {
      setSelectedNeighborhood(item.client.BAIRRO || 'all');
    }, 0);
  };

  const handleCopyDailyPlan = async () => {
    if (dailyPlanItems.length === 0) {
      toast.warning('Nao ha clientes no plano do dia.');
      return;
    }

    const lines = dailyPlanItems.slice(0, 10).map((item, index) => {
      const location = `${item.client.CIDADE || 'sem cidade'}${item.client.BAIRRO ? ` / ${item.client.BAIRRO}` : ''}`;
      const missing = item.missingProducts.length > 0
        ? item.missingProducts.slice(0, 4).join(', ')
        : 'campanha completa';
      const reasons = item.reasons.length > 0 ? item.reasons.join(', ') : 'prioridade do sistema';
      return `${index + 1}. ${getClientDisplayName(item.client)} | ${item.campaign.name} | ${item.client.TELEFONE || 'sem telefone'} | ${location} | ${Math.round(item.meta.completion)}% | ${reasons} | Falta: ${missing}`;
    });

    try {
      await navigator.clipboard.writeText(['Plano do dia RCA', '', ...lines].join('\n'));
      toast.success('Plano do dia copiado.');
    } catch {
      toast.warning('Nao consegui copiar automaticamente.');
    }
  };

  const handleScheduleDailyPlanItem = (item) => {
    const missing = item.missingProducts.slice(0, 5).join(', ');
    setAgendaDraft({
      title: `Retornar ${getClientDisplayName(item.client)}`,
      date: todayISO(),
      time: '',
      type: 'retorno',
      clientId: item.client.id,
      campaignId: item.campaign.id,
      notes: `Plano do dia - ${item.campaign.name}. ${item.reasons.join(', ')}. Falta oferecer: ${missing || 'revisar campanha'}.`
    });
    document.querySelector('.rca-agenda-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast.info('Lembrete preenchido na Agenda RCA. Confira e salve.');
  };

  // ============================================
  // RENDER: TELA PRINCIPAL (LISTA DE CAMPANHAS)
  // ============================================
  const renderMainDashboard = () => {
    const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : '?';
    const displayName = (user?.name || user?.displayName || user?.email?.split('@')[0] || 'RCA').split(' ')[0];
    const currentHour = new Date().getHours();
    const greeting = currentHour < 12 ? 'Bom dia' : currentHour < 18 ? 'Boa tarde' : 'Boa noite';
    const dailyMessage = getDailyMotivationMessage();
    const showAdvancedRcaBlocks = false;

    return (
      <div className="dashboard-container">
        {/* Header */}
        <header className="dashboard-header">
          <div className="header-content">
            <div className="header-left">
              <a className="logo" href="/dashboard">
                <img className="logo-icon-img" src="/assets/logo/venpro-logo-icon-transparent.png" alt="Venpro" />
                <span className="logo-word">Venpro</span>
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
            <div className="daily-message-kicker">Motivação do dia</div>
            <h2 className="daily-message-title">{greeting}, {displayName}</h2>
            <p className="daily-message-text">{dailyMessage}</p>
          </section>

          {showAdvancedRcaBlocks && (
          <section className="rca-day-plan-section">
            <div className="rca-day-plan-header">
              <div>
                <span className="rca-central-kicker">Plano do Dia RCA</span>
                <h2>Clientes que merecem contato primeiro</h2>
                <p>Fila automática cruzando campanhas ativas, positivação, compra do mês, retorno pendente, telefone e prazo de vencimento.</p>
              </div>
              <div className="rca-day-plan-actions">
                <button type="button" onClick={handleCopyDailyPlan} disabled={dailyPlanItems.length === 0}>
                  <Copy size={15} /> Copiar plano
                </button>
                <button type="button" onClick={handleOpenCampaignSelector}>
                  <BarChart3 size={15} /> Abrir Raio-X
                </button>
              </div>
            </div>

            {dailyPlanItems.length === 0 ? (
              <div className="rca-day-plan-empty">
                <strong>Nenhuma oportunidade pendente nas campanhas ativas.</strong>
                <span>Crie ou abra uma campanha para o Venpro montar a fila de atendimento do dia.</span>
                <button type="button" onClick={handleOpenNewCampaign}>
                  <Plus size={16} /> Criar campanha
                </button>
              </div>
            ) : (
              <>
                <div className="rca-day-plan-stats">
                  <div><strong>{dailyPlanStats.total}</strong><span>clientes no plano</span></div>
                  <div><strong>{dailyPlanStats.partial}</strong><span>ja iniciados</span></div>
                  <div><strong>{dailyPlanStats.followUp}</strong><span>retornos</span></div>
                  <div><strong>{dailyPlanStats.noPurchaseMonth}</strong><span>sem compra mes</span></div>
                </div>

                <div className="rca-day-plan-grid">
                  {dailyPlanItems.slice(0, 6).map((item, index) => {
                    const statusLabel = item.meta.status === 'partial' ? 'Parcial' : 'Sem venda';
                    const firstMissing = item.missingProducts.slice(0, 3);
                    const attendanceLabel = ATTENDANCE_STATUS_OPTIONS.find(option => option.value === item.attendanceStatus)?.label || 'Nao chamado';
                    return (
                      <article key={`${item.campaign.id}-${item.client.id}`} className={`rca-day-plan-card ${item.meta.priority}`}>
                        <div className="rca-day-plan-rank">{index + 1}</div>
                        <div className="rca-day-plan-card-main">
                          <div className="rca-day-plan-card-top">
                            <div>
                              <strong>{getClientDisplayName(item.client)}</strong>
                              <span>{item.client.CIDADE || 'Cidade nao informada'}{item.client.BAIRRO ? ` / ${item.client.BAIRRO}` : ''}</span>
                            </div>
                            <em>{statusLabel}</em>
                          </div>
                          <div className="rca-day-plan-tags">
                            <span>{item.campaign.name}</span>
                            <span>{attendanceLabel}</span>
                            <span>{item.meta.hasPhone ? item.client.TELEFONE : 'Sem telefone'}</span>
                          </div>
                          <div className="rca-day-plan-progress">
                            <div><span style={{ width: `${Math.min(100, item.meta.completion)}%` }} /></div>
                            <b>{Math.round(item.meta.completion)}%</b>
                          </div>
                          <p>
                            {firstMissing.length > 0
                              ? `Falta oferecer: ${firstMissing.join(', ')}${item.missingProducts.length > 3 ? ` +${item.missingProducts.length - 3}` : ''}`
                              : 'Revisar oportunidade da campanha.'}
                          </p>
                          <div className="rca-day-plan-reasons">
                            {item.reasons.map(reason => <span key={reason}>{reason}</span>)}
                          </div>
                        </div>
                        <div className="rca-day-plan-card-actions">
                          <button type="button" onClick={(e) => handleCopyClientMessage(e, item.client, item.meta)}>
                            <Copy size={14} /> Copiar
                          </button>
                          <button type="button" className="whatsapp" onClick={(e) => handleOpenClientWhatsApp(e, item.client, item.meta)}>
                            <MessageCircle size={14} /> WhatsApp
                          </button>
                          <button type="button" onClick={() => handleScheduleDailyPlanItem(item)}>
                            <CalendarDays size={14} /> Lembrete
                          </button>
                          <button type="button" onClick={() => handleOpenDailyPlanItem(item)}>
                            Ver no Raio-X
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </section>
          )}

          <section className="rca-agenda-section">
            <div className="rca-agenda-header">
              <div>
                <span className="rca-central-kicker">Agenda RCA</span>
                <h2>Calendário, anotações e lembretes</h2>
                <p>Registre retornos, visitas, cotações e cobranças para não depender de memória no atendimento.</p>
              </div>
              <div className="rca-agenda-stats">
                <div><strong>{agendaStats.today}</strong><span>hoje</span></div>
                <div><strong>{agendaStats.overdue}</strong><span>atrasados</span></div>
                <div><strong>{agendaStats.upcoming}</strong><span>próximos</span></div>
              </div>
            </div>

            {(agendaAlerts.length > 0 || campaignDeadlineAlerts.length > 0) && (
              <div className="rca-agenda-alerts">
                {agendaAlerts.map(item => (
                  <button key={item.id} type="button" className={`rca-agenda-alert ${getAgendaStatus(item)}`} onClick={() => handleToggleAgendaItem(item.id)}>
                    <Bell size={15} />
                    <span>{getAgendaStatus(item) === 'overdue' ? 'Atrasado' : 'Hoje'}: {item.title}</span>
                  </button>
                ))}
                {campaignDeadlineAlerts.map(({ campaign, daysLeft }) => (
                  <button key={campaign.id} type="button" className="rca-agenda-alert campaign" onClick={() => setSelectedCampaignId(campaign.id)}>
                    <Clock size={15} />
                    <span>{campaign.name} {daysLeft === 0 ? 'vence hoje' : `vence em ${daysLeft} dia${daysLeft > 1 ? 's' : ''}`}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="rca-agenda-layout">
              <form className="rca-agenda-form" onSubmit={handleAddAgendaItem}>
                <div className="rca-agenda-form-title">
                  <CalendarDays size={18} />
                  <strong>Novo lembrete</strong>
                </div>
                <label>
                  <span>Anotação</span>
                  <input
                    type="text"
                    placeholder="Ex: retornar para fechar pedido"
                    value={agendaDraft.title}
                    onChange={(e) => handleAgendaDraftChange('title', e.target.value)}
                  />
                </label>
                <div className="rca-agenda-form-grid">
                  <label>
                    <span>Data</span>
                    <input
                      type="date"
                      value={agendaDraft.date}
                      onChange={(e) => handleAgendaDraftChange('date', e.target.value)}
                    />
                  </label>
                  <label>
                    <span>Horário</span>
                    <input
                      type="time"
                      value={agendaDraft.time}
                      onChange={(e) => handleAgendaDraftChange('time', e.target.value)}
                    />
                  </label>
                  <label>
                    <span>Tipo</span>
                    <select value={agendaDraft.type} onChange={(e) => handleAgendaDraftChange('type', e.target.value)}>
                      <option value="retorno">Retorno</option>
                      <option value="cotacao">Cotação</option>
                      <option value="visita">Visita</option>
                      <option value="cobranca">Cobrança</option>
                      <option value="outro">Outro</option>
                    </select>
                  </label>
                </div>
                <div className="rca-agenda-form-grid two">
                  <label>
                    <span>Cliente</span>
                    <select value={agendaDraft.clientId} onChange={(e) => handleAgendaDraftChange('clientId', e.target.value)}>
                      <option value="">Sem cliente vinculado</option>
                      {clients.slice(0, 600).map(client => (
                        <option key={client.id} value={client.id}>{getClientDisplayName(client)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Campanha</span>
                    <select value={agendaDraft.campaignId} onChange={(e) => handleAgendaDraftChange('campaignId', e.target.value)}>
                      <option value="">Sem campanha</option>
                      {campaigns.map(campaign => (
                        <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  <span>Observação</span>
                  <textarea
                    rows="3"
                    placeholder="Ex: cliente pediu preço especial, ligar depois do almoço"
                    value={agendaDraft.notes}
                    onChange={(e) => handleAgendaDraftChange('notes', e.target.value)}
                  />
                </label>
                <button type="submit" className="rca-agenda-save">
                  <Plus size={16} /> Salvar lembrete
                </button>
              </form>

              <div className="rca-agenda-list-panel">
                <div className="rca-agenda-list-head">
                  <div>
                    <strong>Próximos atendimentos</strong>
                    <span>{agendaItems.length} lembrete{agendaItems.length !== 1 ? 's' : ''} salvo{agendaItems.length !== 1 ? 's' : ''}</span>
                  </div>
                  <StickyNote size={18} />
                </div>

                {orderedAgendaItems.length === 0 ? (
                  <div className="rca-agenda-empty">
                    <strong>Nenhum lembrete ainda.</strong>
                    <span>Crie o primeiro retorno para organizar o dia do RCA.</span>
                  </div>
                ) : (
                  <div className="rca-agenda-list">
                    {orderedAgendaItems.slice(0, 8).map(item => {
                      const status = getAgendaStatus(item);
                      return (
                        <article key={item.id} className={`rca-agenda-item ${status}`}>
                          <button type="button" className="rca-agenda-check" onClick={() => handleToggleAgendaItem(item.id)} title="Marcar como feito">
                            <CheckCircle2 size={18} />
                          </button>
                          <div className="rca-agenda-item-main">
                            <div className="rca-agenda-item-top">
                              <strong>{item.title}</strong>
                              <span>{formatDateBR(item.date)}{item.time ? ` às ${item.time}` : ''}</span>
                            </div>
                            <div className="rca-agenda-item-meta">
                              <span>{item.type}</span>
                              {item.clientId && <span>{getAgendaClientName(item.clientId)}</span>}
                              {item.campaignId && <span>{getAgendaCampaignName(item.campaignId)}</span>}
                            </div>
                            {item.notes && <p>{item.notes}</p>}
                          </div>
                          <button type="button" className="rca-agenda-delete" onClick={() => handleDeleteAgendaItem(item.id)} title="Excluir">
                            <Trash2 size={15} />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rca-feedback-section">
            <div className="rca-feedback-copy">
              <span className="rca-central-kicker">Feedback</span>
              <h2>Ajude a melhorar o Venpro</h2>
              <p>Conte o que ficou confuso, o que precisa melhorar ou qual ferramenta faria diferença no seu dia.</p>
            </div>
            <form className="rca-feedback-form" onSubmit={handleSendDashboardFeedback}>
              <label>
                <span>Tipo</span>
                <select
                  value={feedbackDraft.type}
                  onChange={(e) => setFeedbackDraft(current => ({ ...current, type: e.target.value }))}
                >
                  <option value="melhoria">Melhoria</option>
                  <option value="reclamacao">Reclamação</option>
                  <option value="duvida">Dúvida</option>
                  <option value="outro">Outro</option>
                </select>
              </label>
              <label>
                <span>Mensagem</span>
                <textarea
                  rows="4"
                  placeholder="Escreva aqui sua sugestão, problema ou ideia..."
                  value={feedbackDraft.message}
                  onChange={(e) => setFeedbackDraft(current => ({ ...current, message: e.target.value }))}
                />
              </label>
              <button type="submit">
                <MessageCircle size={16} /> Enviar pelo WhatsApp
              </button>
            </form>
          </section>

          {showAdvancedRcaBlocks && (
          <section className="rca-central-section">
            <div className="rca-central-header">
              <div>
                <span className="rca-central-kicker">Central de Atendimento RCA</span>
                <h2>Fila do dia para chamar clientes</h2>
                <p>Clientes priorizados pela campanha, positivação e produtos que ainda faltam vender.</p>
              </div>
              <div className="rca-central-controls">
                <select
                  value={centralCampaign?.id || ''}
                  onChange={(e) => setCentralCampaignId(e.target.value)}
                  disabled={campaigns.length === 0}
                >
                  {campaigns.length === 0 ? (
                    <option value="">Nenhuma campanha</option>
                  ) : campaigns.map(campaign => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}{campaign.status === 'inactive' ? ' (encerrada)' : ''}
                    </option>
                  ))}
                </select>
                <select value={centralStatusFilter} onChange={(e) => setCentralStatusFilter(e.target.value)}>
                  <option value="priority">Prioridade</option>
                  <option value="noMonth">Sem compra no mês</option>
                  <option value="empty">Sem venda</option>
                  <option value="partial">Parcial</option>
                  <option value="complete">Completo</option>
                  <option value="all">Todos</option>
                </select>
                <select value={centralCity} onChange={(e) => setCentralCity(e.target.value)} disabled={!centralCampaign}>
                  <option value="all">Todas as cidades</option>
                  {centralCities.filter(city => city !== 'all').map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
                <select value={centralNeighborhood} onChange={(e) => setCentralNeighborhood(e.target.value)} disabled={!centralCampaign}>
                  <option value="all">Todos os bairros</option>
                  {centralNeighborhoods.filter(neighborhood => neighborhood !== 'all').map(neighborhood => (
                    <option key={neighborhood} value={neighborhood}>{neighborhood}</option>
                  ))}
                </select>
                <button type="button" className="rca-central-print" onClick={handlePrintCentralList} disabled={!centralCampaign || centralClients.length === 0}>
                  <Printer size={15} /> Imprimir
                </button>
              </div>
            </div>

            {!centralCampaign ? (
              <div className="rca-central-empty">
                <strong>Crie uma campanha para montar sua fila de atendimento.</strong>
                <span>Depois de cadastrar indústrias, produtos e clientes, esta área mostra quem chamar primeiro.</span>
                <button type="button" onClick={handleOpenNewCampaign}>
                  <Plus size={16} /> Criar campanha
                </button>
              </div>
            ) : (
              <>
                <div className="rca-central-stats">
                  <div><strong>{centralStats.priority}</strong><span>alta prioridade</span></div>
                  <div><strong>{centralStats.partial}</strong><span>venda parcial</span></div>
                  <div><strong>{centralStats.empty}</strong><span>sem venda</span></div>
                  <div><strong>{centralStats.complete}</strong><span>completo</span></div>
                  <div><strong>{centralStats.noMonth}</strong><span>sem compra mês</span></div>
                  <div><strong>{centralStats.noPhone}</strong><span>sem telefone</span></div>
                </div>

                {centralClients.length === 0 ? (
                  <div className="rca-central-empty compact">
                    <strong>Nenhum cliente neste filtro.</strong>
                    <span>Troque o filtro ou abra o Raio-X para revisar a campanha.</span>
                    <button type="button" onClick={() => setSelectedCampaignId(centralCampaign.id)}>
                      Abrir Raio-X
                    </button>
                  </div>
                ) : (
                  <div className="rca-central-list">
                    {centralClients.slice(0, 8).map(({ client, meta }) => {
                      const missingProducts = getMissingProducts(meta);
                      const firstMissing = missingProducts.slice(0, 3);
                      return (
                        <article key={client.id} className={`rca-central-card ${meta.priority}`}>
                          <div className="rca-central-card-main">
                            <div className="rca-central-card-top">
                              <strong>{getClientDisplayName(client)}</strong>
                              <span className={`rca-central-status ${meta.status}`}>
                                {meta.status === 'complete' ? 'Completo' : meta.status === 'partial' ? 'Parcial' : 'Sem venda'}
                              </span>
                            </div>
                            <div className="rca-central-meta">
                              <span>{client.CIDADE || 'Cidade não informada'}{client.BAIRRO ? ` / ${client.BAIRRO}` : ''}</span>
                              <span>{meta.hasPhone ? client.TELEFONE : 'Sem telefone válido'}</span>
                              {meta.monthlyNoPurchase ? (
                                <span className="rca-central-month-alert">Sem compra no mês</span>
                              ) : (
                                <span>Compra mês: {formatCurrency(meta.monthSalesValue)}</span>
                              )}
                            </div>
                            <div className="rca-central-progress">
                              <div><span style={{ width: `${Math.min(100, meta.completion)}%` }} /></div>
                              <b>{Math.round(meta.completion)}%</b>
                            </div>
                            <p>
                              {firstMissing.length > 0
                                ? `Falta oferecer: ${firstMissing.join(', ')}${missingProducts.length > 3 ? ` +${missingProducts.length - 3}` : ''}`
                                : 'Cliente com campanha completa.'}
                            </p>
                          </div>
                          <div className="rca-central-actions">
                            <button type="button" onClick={(e) => handleCopyClientMessage(e, client, meta)}>
                              <Copy size={14} /> Copiar
                            </button>
                            <button type="button" className="whatsapp" onClick={(e) => handleOpenClientWhatsApp(e, client, meta)}>
                              <MessageCircle size={14} /> WhatsApp
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                <div className="rca-central-footer">
                  <span>{centralClients.length} cliente{centralClients.length !== 1 ? 's' : ''} na lista filtrada</span>
                  <button type="button" onClick={() => setSelectedCampaignId(centralCampaign.id)}>
                    Abrir Raio-X completo
                  </button>
                  <button type="button" onClick={() => navigate('/disparador-whatsapp')}>
                    Carteira no WhatsApp
                  </button>
                </div>
              </>
            )}
          </section>
          )}

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
                <div className="tool-card-title">Prompts Prontos para RCA</div>
                <div className="tool-card-desc">Copie comandos prontos para organizar tabelas, montar ofertas, revisar mensagens e usar no ChatGPT, Gemini ou outra IA da sua preferência.</div>
              </div>
              <div className="tool-card" onClick={() => navigate('/disparador-whatsapp')}>
                <div className="tool-card-icon"><MessageCircle size={32} /></div>
                <div className="tool-card-title">Carteira no WhatsApp</div>
                <div className="tool-card-desc">Monte sua oferta uma vez e envie para todos os seus clientes pelo WhatsApp Web, com mensagens personalizadas, fotos dos produtos ou link de venda. Menos copiar e colar, mais clientes avisados e mais tempo para vender.</div>
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
    const selectedCampaignDeadline = getCampaignDeadlineInfo(selectedCampaign);
    const selectedCampaignGoal = getCampaignGoalSummary(selectedCampaign);
    const showCampaignDeadlineAlert = selectedCampaignDeadline && selectedCampaignDeadline.daysLeft >= 0 && selectedCampaignDeadline.daysLeft <= 3;

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
                <button className="btn-campaign-action secondary" onClick={handlePrintCampaignReport}>
                  <Printer size={16} /> Relatório PDF
                </button>
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
              {showCampaignDeadlineAlert && (
                <div className="campaign-deadline-alert">
                  <div>
                    <strong>
                      Campanha {selectedCampaignDeadline.daysLeft === 0 ? 'fecha hoje' : `fecha em ${selectedCampaignDeadline.daysLeft} dia${selectedCampaignDeadline.daysLeft > 1 ? 's' : ''}`}
                    </strong>
                    <span>
                      Meta: {formatCurrency(selectedCampaignGoal.targetValue)} | Vendido: {formatCurrency(selectedCampaignGoal.soldValue)} | Falta: {formatCurrency(selectedCampaignGoal.remaining)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOpportunityFilter('fewMissing');
                      setClientSortMode('smart');
                    }}
                  >
                    Ver clientes mais fáceis
                  </button>
                </div>
              )}

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
                <div className="filter-group">
                  <select value={selectedIndustryFilter} onChange={(e) => setSelectedIndustryFilter(e.target.value)}>
                    <option value="all">Todas as indústrias</option>
                    <optgroup label="Falta positivar">
                      {campaignIndustryNames.filter(name => name !== 'all').map(industryName => (
                        <option key={`missing-${industryName}`} value={`missing::${industryName}`}>Falta {industryName}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Já comprou">
                      {campaignIndustryNames.filter(name => name !== 'all').map(industryName => (
                        <option key={`sold-${industryName}`} value={`sold::${industryName}`}>Já comprou {industryName}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div className="filter-group">
                  <select value={selectedOpportunityFilter} onChange={(e) => setSelectedOpportunityFilter(e.target.value)}>
                    <option value="all">Todas oportunidades</option>
                    <option value="fewMissing">Faltam até 2 itens</option>
                    <option value="almostDone">Acima de 60%</option>
                    <option value="boughtMonth">Comprou no mês</option>
                    <option value="withPhone">Com telefone</option>
                  </select>
                </div>
                <div className="filter-group">
                  <select value={clientSortMode} onChange={(e) => setClientSortMode(e.target.value)}>
                    <option value="smart">Mais fáceis primeiro</option>
                    <option value="fewMissing">Menos itens faltando</option>
                    <option value="mostMissing">Mais itens faltando</option>
                    <option value="sales">Maior venda lançada</option>
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
                    {selectedIndustryFilter !== 'all' ? ` Filtro: ${selectedIndustryFilter.replace('missing::', 'falta ').replace('sold::', 'já comprou ')}.` : ''}
                    {selectedOpportunityFilter === 'fewMissing' ? ' Oportunidade: faltam até 2 itens.' : selectedOpportunityFilter === 'almostDone' ? ' Oportunidade: acima de 60%.' : selectedOpportunityFilter === 'boughtMonth' ? ' Oportunidade: comprou no mês.' : ''}
                    {' '}Total vendido lançado: {formatCurrency(actionStats.totalSalesValue)}.
                  </p>
                </div>
                <div className="summary-kpis">
                  <div><strong>{actionStats.priority}</strong><span>prioridade alta</span></div>
                  <div><strong>{actionStats.missingProducts}</strong><span>itens faltando</span></div>
                  <div><strong>{filteredClients.length}</strong><span>no filtro atual</span></div>
                  <div><strong>{formatCurrency(actionStats.totalSalesValue)}</strong><span>total vendido</span></div>
                </div>
              </div>

              {attackList.length > 0 && (
                <div className="campaign-attack-list">
                  <div className="campaign-attack-list-head">
                    <div>
                      <strong>Clientes para fechar hoje</strong>
                      <span>Top {attackList.length} clientes ordenados pelos filtros atuais.</span>
                    </div>
                    <button type="button" onClick={handleCopyAttackList}>
                      <Copy size={15} /> Copiar lista de ataque
                    </button>
                  </div>
                  <div className="campaign-attack-list-grid">
                    {attackList.map(({ client, meta, missingProducts }, index) => (
                      <article key={client.id}>
                        <div>
                          <strong>{index + 1}. {getClientDisplayName(client)}</strong>
                          <span>{client.CIDADE || 'Cidade não informada'}{client.BAIRRO ? ` / ${client.BAIRRO}` : ''}</span>
                        </div>
                        <em>{meta.hasPhone ? client.TELEFONE : 'Sem telefone'}</em>
                        <p>{missingProducts.length > 0 ? `Falta: ${missingProducts.slice(0, 4).join(', ')}${missingProducts.length > 4 ? ` +${missingProducts.length - 4}` : ''}` : 'Campanha completa'}</p>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {campaignRouteRanking.length > 0 && (
                <div className="campaign-route-ranking">
                  <div className="campaign-route-ranking-head">
                    <div>
                      <strong>Ranking por cidade/bairro</strong>
                      <span>Use para montar a rota ou sequência de atendimento.</span>
                    </div>
                  </div>
                  <div className="campaign-route-ranking-grid">
                    {campaignRouteRanking.map(item => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          setSelectedCity(item.city === 'Cidade não informada' ? 'all' : item.city);
                          setTimeout(() => {
                            setSelectedNeighborhood(item.neighborhood === 'Bairro não informado' ? 'all' : item.neighborhood);
                          }, 0);
                          setClientSortMode('smart');
                        }}
                      >
                        <strong>{item.city}</strong>
                        <span>{item.neighborhood}</span>
                        <em>{item.clients} clientes pendentes</em>
                        <small>{item.easyClients} fáceis | {item.missingProducts} itens faltando | {item.withPhone} com telefone</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                    const quickSaleDraft = getQuickSaleDraft(client);
                    const savedQuickSale = getSavedQuickSale(client);
                    const savedQuickSaleAmounts = getQuickSaleAmounts(savedQuickSale);
                    const draftSaleIncrement = parseMoneyInput(quickSaleDraft.valor);
                    const draftTotalValue = savedQuickSaleAmounts.totalValue + draftSaleIncrement;

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
                          <div className="client-attendance-status" onClick={(e) => e.stopPropagation()}>
                            <label>Status do atendimento</label>
                            <select value={getClientAttendanceStatus(client)} onChange={(e) => handleClientAttendanceChange(e, client)}>
                              {ATTENDANCE_STATUS_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
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

                          <div className="client-quick-sale" onClick={(e) => e.stopPropagation()}>
                            <div className="client-quick-sale-head">
                              <strong>Lançar valor vendido</strong>
                              {savedQuickSaleAmounts.totalValue > 0 && (
                                <span>
                                  Total salvo: {formatCurrency(savedQuickSaleAmounts.totalValue)} em {formatDateBR(savedQuickSale.data)}
                                </span>
                              )}
                            </div>
                            <div className="client-quick-sale-grid">
                              <label>
                                <span>Valor vendido</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="Ex: 1.000,00"
                                  value={quickSaleDraft.valor}
                                  onChange={(e) => handleQuickSaleDraftChange(client, 'valor', e.target.value)}
                                />
                              </label>
                              <label className="quick-sale-date-field">
                                <span>Data</span>
                                <input
                                  type="date"
                                  value={quickSaleDraft.data}
                                  onChange={(e) => handleQuickSaleDraftChange(client, 'data', e.target.value)}
                                />
                              </label>
                              <button type="button" onClick={(e) => handleSaveQuickSale(e, client)}>
                                Somar venda
                              </button>
                            </div>
                            <div className="client-quick-sale-total">
                              <span>Total vendido após salvar</span>
                              <strong>{formatCurrency(draftTotalValue)}</strong>
                            </div>
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
