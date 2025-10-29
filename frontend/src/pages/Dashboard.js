import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  resetCampaign,
  getSheets,
  createSheet,
  updateSheet,
  deleteSheet,
  getClients,
  createClient,
  updateClient,
  deleteClient,
  getCampaignStats,
  getCampaignStatsByCity
} from '../services/api';
import CampaignSelector from '../components/CampaignSelector';
import CityFilter from '../components/CityFilter';
import ClientCardIndustries from '../components/ClientCardIndustries';
import CampaignModal from '../components/modals/CampaignModal';
import ClientModalIndustries from '../components/modals/ClientModalIndustries';
import StatsModalIndustries from '../components/modals/StatsModalIndustries';
import CityStatsModal from '../components/modals/CityStatsModal';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import { LogOut, UserPlus, Settings, Search, Filter, RotateCcw, MapPin, BarChart3, Users } from 'lucide-react';
import { toast } from 'sonner';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // State
  const [campaigns, setCampaigns] = useState([]);
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [activeSheet, setActiveSheet] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showCityStatsModal, setShowCityStatsModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [cityStatsData, setCityStatsData] = useState(null);
  const [editingSheet, setEditingSheet] = useState(null);
  const [showSheetModal, setShowSheetModal] = useState(false);

  // Dropdowns
  const [showCampaignDropdown, setShowCampaignDropdown] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedBairro, setSelectedBairro] = useState('all');
  const [selectedIndustry, setSelectedIndustry] = useState('all');
  const [industryStatus, setIndustryStatus] = useState('all');

  // Tabs
  const [activeTab, setActiveTab] = useState('clients');

  // Load campaigns
  useEffect(() => {
    loadCampaigns();
  }, []);

  // Load sheets when campaign changes
  useEffect(() => {
    if (activeCampaign) {
      loadSheets(activeCampaign);
      loadClients(null, activeCampaign);
    }
  }, [activeCampaign]);

  const loadCampaigns = async () => {
    try {
      const response = await getCampaigns();
      setCampaigns(response.data);
      if (response.data.length > 0 && !activeCampaign) {
        setActiveCampaign(response.data[0].id);
      }
    } catch (error) {
      console.error('Error loading campaigns:', error);
      toast.error('Erro ao carregar campanhas');
    } finally {
      setLoading(false);
    }
  };

  const loadSheets = async (campaignId) => {
    try {
      const response = await getSheets(campaignId);
      setSheets(response.data);
      if (response.data.length > 0 && !activeSheet) {
        setActiveSheet(response.data[0].id);
      }
    } catch (error) {
      console.error('Error loading sheets:', error);
      toast.error('Erro ao carregar cidades');
    }
  };

  const loadClients = async (sheetId, campaignId) => {
    try {
      const params = { campaign_id: campaignId };
      if (sheetId) {
        params.sheet_id = sheetId;
      }

      const response = await getClients(params);
      const clientsData = response.data;

      const currentCampaign = campaigns.find(c => c.id === campaignId);
      const campaignProducts = Object.keys(currentCampaign?.product_goals || {});

      const syncedClients = await Promise.all(clientsData.map(async (client) => {
        let needsUpdate = false;
        const updatedProducts = { ...client.products };

        campaignProducts.forEach(productName => {
          if (!updatedProducts[productName]) {
            updatedProducts[productName] = { status: '', value: 0 };
            needsUpdate = true;
          }
        });

        Object.keys(updatedProducts).forEach(productName => {
          if (!campaignProducts.includes(productName)) {
            delete updatedProducts[productName];
            needsUpdate = true;
          }
        });

        if (needsUpdate) {
          try {
            await updateClient(client.id, { products: updatedProducts });
            return { ...client, products: updatedProducts };
          } catch (error) {
            console.error('Error syncing client products:', error);
            return client;
          }
        }

        return client;
      }));

      setClients(syncedClients);
    } catch (error) {
      console.error('Error loading clients:', error);
      toast.error('Erro ao carregar clientes');
    }
  };

  const handleCreateCampaign = () => {
    setEditingCampaign(null);
    setShowCampaignModal(true);
  };

  const handleEditCampaign = (campaign) => {
    setEditingCampaign(campaign);
    setShowCampaignModal(true);
  };

  const handleSaveCampaign = async (data) => {
    try {
      if (editingCampaign) {
        await updateCampaign(editingCampaign.id, data);
        toast.success('Campanha atualizada!');

        if (editingCampaign.id === activeCampaign && data.industries) {
          const allProducts = [];
          data.industries.forEach(industry => {
            if (industry.products) {
              allProducts.push(...industry.products);
            }
          });
          if (allProducts.length > 0) {
            await syncCampaignProducts(editingCampaign.id, allProducts);
          }
        }
      } else {
        const response = await createCampaign(data);
        toast.success('Campanha criada!');
        setActiveCampaign(response.data.id);
      }
      await loadCampaigns();
      setShowCampaignModal(false);
    } catch (error) {
      console.error('Error saving campaign:', error);
      toast.error('Erro ao salvar campanha');
    }
  };

  const syncCampaignProducts = async (campaignId, productNames) => {
    try {
      const response = await getClients({ campaign_id: campaignId });
      const allClients = response.data;

      await Promise.all(allClients.map(async (client) => {
        const updatedProducts = { ...client.products };
        let needsUpdate = false;

        productNames.forEach(productName => {
          if (!updatedProducts[productName]) {
            updatedProducts[productName] = { status: '', value: 0 };
            needsUpdate = true;
          }
        });

        Object.keys(updatedProducts).forEach(productName => {
          if (!productNames.includes(productName)) {
            delete updatedProducts[productName];
            needsUpdate = true;
          }
        });

        if (needsUpdate) {
          await updateClient(client.id, { products: updatedProducts });
        }
      }));

      if (activeSheet) {
        await loadClients(activeSheet, campaignId);
      }

      toast.success('Produtos sincronizados com todos os clientes!');
    } catch (error) {
      console.error('Error syncing campaign products:', error);
      toast.error('Erro ao sincronizar produtos');
    }
  };

  const handleDeleteCampaign = async (campaignId) => {
    if (!window.confirm('Tem certeza que deseja excluir esta campanha? Todos os dados serão perdidos.')) {
      return;
    }
    try {
      await deleteCampaign(campaignId);
      toast.success('Campanha excluída!');
      if (activeCampaign === campaignId) {
        setActiveCampaign(null);
        setActiveSheet(null);
        setClients([]);
      }
      await loadCampaigns();
    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast.error('Erro ao excluir campanha');
    }
  };

  const handleResetCampaign = async () => {
    if (!window.confirm('Tem certeza que deseja resetar esta campanha? Todos os produtos serão marcados como "Não Positivados" e valores zerados.')) {
      return;
    }
    try {
      await resetCampaign(activeCampaign);
      toast.success('Campanha resetada com sucesso!');
      await loadClients(activeSheet, activeCampaign);
    } catch (error) {
      console.error('Error resetting campaign:', error);
      toast.error('Erro ao resetar campanha');
    }
  };

  const handleViewStats = async (campaignId) => {
    try {
      setShowStatsModal(true);
    } catch (error) {
      console.error('Error loading stats:', error);
      toast.error('Erro ao carregar estatísticas');
    }
  };

  const handleViewCityStats = async () => {
    try {
      const response = await getCampaignStatsByCity(activeCampaign);
      setCityStatsData(response.data);
      setShowCityStatsModal(true);
    } catch (error) {
      console.error('Error loading city stats:', error);
      toast.error('Erro ao carregar estatísticas por cidade');
    }
  };

  const handleCreateSheet = () => {
    if (!activeCampaign) {
      toast.error('Selecione uma campanha primeiro');
      return;
    }
    setEditingSheet(null);
    setShowSheetModal(true);
  };

  const handleEditSheet = (sheet) => {
    setEditingSheet(sheet);
    setShowSheetModal(true);
  };

  const handleSaveSheet = async (data) => {
    try {
      if (editingSheet) {
        await updateSheet(editingSheet.id, data);
        toast.success('Cidade atualizada!');
      } else {
        const response = await createSheet({
          ...data,
          campaign_id: activeCampaign,
          headers: getCurrentHeaders()
        });
        toast.success('Cidade criada!');
        setActiveSheet(response.data.id);
      }
      await loadSheets(activeCampaign);
      setShowSheetModal(false);
    } catch (error) {
      console.error('Error saving sheet:', error);
      toast.error('Erro ao salvar cidade');
    }
  };

  const handleDeleteSheet = async (sheetId) => {
    const sheetToDelete = sheets.find(s => s.id === sheetId);
    if (!window.confirm(`Tem certeza que deseja excluir a cidade "${sheetToDelete?.name}"?\n\nTodos os clientes desta cidade serão perdidos permanentemente!`)) {
      return;
    }

    try {
      console.log('Deletando sheet:', sheetId);
      await deleteSheet(sheetId);
      toast.success(`Cidade "${sheetToDelete?.name}" excluída com sucesso!`);

      if (activeSheet === sheetId) {
        setActiveSheet(null);
        setClients([]);
      }

      await loadSheets(activeCampaign);

      console.log('Sheet excluída com sucesso');
    } catch (error) {
      console.error('Error deleting sheet:', error);
      toast.error(`Erro ao excluir cidade: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleCreateClient = () => {
    if (!activeCampaign) {
      toast.error('Selecione uma campanha primeiro');
      return;
    }

    setEditingClient(null);
    setShowClientModal(true);
  };

  const handleEditClient = (client) => {
    setEditingClient(client);
    setShowClientModal(true);
  };

  const handleSaveClient = async (data) => {
    try {
      if (editingClient) {
        await updateClient(editingClient.id, data);
        toast.success('Cliente atualizado!');
        await loadClients(null, activeCampaign);
      } else {
        const clientCity = data.CIDADE;
        let targetSheetId = activeSheet;

        if (clientCity) {
          const sheetsResponse = await getSheets(activeCampaign);
          const currentSheets = sheetsResponse.data;

          const citySheet = currentSheets.find(s => s.name.toLowerCase() === clientCity.toLowerCase());

          if (citySheet) {
            targetSheetId = citySheet.id;
            console.log(`Usando cidade existente: ${citySheet.name}`);
          } else {
            console.log(`Criando nova cidade: ${clientCity}`);
            const newSheetResponse = await createSheet({
              campaign_id: activeCampaign,
              name: clientCity,
              headers: getCurrentHeaders()
            });
            targetSheetId = newSheetResponse.data.id;
            toast.success(`✨ Nova cidade criada: ${clientCity}`);

            await loadSheets(activeCampaign);
          }

          if (!activeSheet) {
            setActiveSheet(targetSheetId);
          }
        } else {
          if (!targetSheetId) {
            const sheetsResponse = await getSheets(activeCampaign);
            if (sheetsResponse.data.length > 0) {
              targetSheetId = sheetsResponse.data[0].id;
            } else {
              const newSheetResponse = await createSheet({
                campaign_id: activeCampaign,
                name: 'Geral',
                headers: getCurrentHeaders()
              });
              targetSheetId = newSheetResponse.data.id;
              await loadSheets(activeCampaign);
            }
          }
        }

        await createClient({
          ...data,
          sheet_id: targetSheetId,
          campaign_id: activeCampaign
        });

        toast.success(`✅ Cliente adicionado${clientCity ? ' em: ' + clientCity : '!'}`);

        await loadSheets(activeCampaign);
        await loadClients(null, activeCampaign);
      }
      setShowClientModal(false);
    } catch (error) {
      console.error('Error saving client:', error);
      toast.error('Erro ao salvar cliente');
    }
  };

  const handleDeleteClient = async (clientId) => {
    if (!window.confirm('Tem certeza que deseja excluir este cliente?')) {
      return;
    }
    try {
      await deleteClient(clientId);
      toast.success('Cliente excluído!');
      await loadClients(activeSheet, activeCampaign);
    } catch (error) {
      console.error('Error deleting client:', error);
      toast.error('Erro ao excluir cliente');
    }
  };

  const handleUpdateProduct = async (clientId, industryName, productName, productData) => {
    try {
      const client = clients.find(c => c.id === clientId);
      const updatedIndustries = {
        ...client.industries,
        [industryName]: {
          ...client.industries[industryName],
          products: {
            ...client.industries[industryName].products,
            [productName]: productData
          }
        }
      };

      const hasPositivado = Object.values(updatedIndustries[industryName].products).some(
        p => p.status?.toLowerCase() === 'positivado'
      );

      updatedIndustries[industryName].industry_status = hasPositivado ? 'positivado' : '';

      await updateClient(clientId, { 
        ...client,
        industries: updatedIndustries 
      });
      await loadClients(activeSheet, activeCampaign);
    } catch (error) {
      console.error('Error updating product:', error);
      toast.error('Erro ao atualizar produto');
    }
  };

  const getCurrentHeaders = () => {
    const currentCampaign = campaigns.find(c => c.id === activeCampaign);
    return Object.keys(currentCampaign?.product_goals || {});
  };

  const getCurrentSheet = () => {
    return sheets.find(s => s.id === activeSheet);
  };

  const getCurrentCampaign = () => {
    return campaigns.find(c => c.id === activeCampaign);
  };

  const getIndustries = () => {
    const currentCampaign = getCurrentCampaign();
    return currentCampaign?.industries || [];
  };

  const getBairros = () => {
    const bairrosSet = new Set();
    clients.forEach(client => {
      if (selectedCity !== 'all' && client.CIDADE !== selectedCity) {
        return;
      }
      if (client.BAIRRO && client.BAIRRO.trim()) {
        bairrosSet.add(client.BAIRRO);
      }
    });
    return Array.from(bairrosSet).sort();
  };

  const getUniqueCities = () => {
    const cities = [...new Set(clients.map(c => c.CIDADE).filter(Boolean))];
    return cities.sort();
  };

  const uniqueCities = getUniqueCities();

  const filteredClients = clients
    .map(client => {
      if (selectedCity !== 'all' && client.CIDADE !== selectedCity) {
        return null;
      }

      if (selectedBairro !== 'all' && client.BAIRRO !== selectedBairro) {
        return null;
      }

      if (searchTerm && !client.CLIENTE.toLowerCase().includes(searchTerm.toLowerCase())) {
        return null;
      }

      let filteredIndustries = { ...client.industries };

      if (selectedIndustry !== 'all') {
        const industryData = client.industries?.[selectedIndustry];
        if (!industryData) return null;

        filteredIndustries = { [selectedIndustry]: industryData };

        if (industryStatus !== 'all') {
          const isIndustryPositivado = industryData.industry_status?.toLowerCase() === 'positivado';

          if (industryStatus === 'positivado' && !isIndustryPositivado) return null;
          if (industryStatus === 'nao_positivado' && isIndustryPositivado) return null;
        }
      } else if (industryStatus !== 'all') {
        const allIndustries = Object.entries(client.industries || {});

        filteredIndustries = {};

        for (const [industryName, industryData] of allIndustries) {
          const isIndustryPositivado = industryData.industry_status?.toLowerCase() === 'positivado';

          if (industryStatus === 'positivado' && isIndustryPositivado) {
            filteredIndustries[industryName] = industryData;
          } else if (industryStatus === 'nao_positivado' && !isIndustryPositivado) {
            filteredIndustries[industryName] = industryData;
          }
        }

        if (Object.keys(filteredIndustries).length === 0) {
          return null;
        }
      }

      return {
        ...client,
        industries: filteredIndustries
      };
    })
    .filter(client => client !== null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Carregando...</div>
      </div>
    );
  }

  const headers = getCurrentHeaders();

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-10">
        <div className="flex justify-between items-center p-3 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-lg md:text-2xl font-bold text-blue-600 dark:text-blue-400 truncate">
            Anota & Ganha Incentivos
          </h1>
          <div className="flex items-center space-x-2">
            {user?.role === 'admin' && (
              <button
                onClick={() => navigate('/admin')}
                className="p-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                title="Painel Admin"
              >
                🔧
              </button>
            )}

            {(user?.license_type === 'trial' || user?.license_type === 'expired') && (
              <button
                onClick={() => navigate('/pricing')}
                className="p-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 animate-pulse"
                title="Assinar Agora"
              >
                ⚡
              </button>
            )}

            {user?.license_type !== 'trial' && user?.license_type !== 'expired' && (
              <button
                onClick={() => navigate('/my-subscription')}
                className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                title="Minha Assinatura"
              >
                💳
              </button>
            )}

            <button
              onClick={handleLogout}
              className="p-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-2 space-y-2">
          <CampaignSelector
            campaigns={campaigns}
            activeCampaign={activeCampaign}
            onSelectCampaign={setActiveCampaign}
            onCreateCampaign={handleCreateCampaign}
            onEditCampaign={handleEditCampaign}
            onDeleteCampaign={handleDeleteCampaign}
            onViewStats={handleViewStats}
            showDropdown={showCampaignDropdown}
            setShowDropdown={setShowCampaignDropdown}
          />

          {activeCampaign && (
            <div className="flex border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setActiveTab('clients')}
                className={`flex-1 flex items-center justify-center px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'clients'
                    ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                <Users className="w-4 h-4 mr-2" />
                Clientes
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`flex-1 flex items-center justify-center px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'analytics'
                    ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                Analytics
              </button>
            </div>
          )}

          {activeCampaign && activeTab === 'clients' && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleCreateClient}
                className="flex-1 min-w-[120px] flex items-center justify-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                data-testid="add-client-btn"
              >
                <UserPlus className="w-4 h-4 mr-1" />
                Novo Cliente
              </button>

              {clients.length > 0 && (
                <>
                  <button
                    onClick={() => handleViewStats()}
                    className="flex-1 min-w-[120px] flex items-center justify-center px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
                  >
                    <Settings className="w-4 h-4 mr-1" />
                    Estatísticas
                  </button>
                  <button
                    onClick={handleViewCityStats}
                    className="flex-1 min-w-[120px] flex items-center justify-center px-3 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 text-sm"
                    data-testid="city-stats-btn"
                  >
                    <MapPin className="w-4 h-4 mr-1" />
                    Por Cidade
                  </button>
                  <button
                    onClick={handleResetCampaign}
                    className="flex-1 min-w-[120px] flex items-center justify-center px-3 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 text-sm"
                    data-testid="reset-campaign-btn"
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Resetar
                  </button>
                  <button
                    onClick={() => syncCampaignProducts(activeCampaign, getCurrentHeaders())}
                    className="flex-1 min-w-[120px] flex items-center justify-center px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
                    title="Sincronizar produtos da campanha com todos os clientes"
                  >
                    <Settings className="w-4 h-4 mr-1" />
                    Sincronizar
                  </button>
                </>
              )}
            </div>
          )}

          {activeCampaign && activeTab === 'clients' && uniqueCities.length > 0 && (
            <CityFilter
              cities={uniqueCities}
              selectedCity={selectedCity}
              onSelectCity={setSelectedCity}
              showDropdown={showCityDropdown}
              setShowDropdown={setShowCityDropdown}
              clientCount={filteredClients.length}
            />
          )}
        </div>
      </header>

      <main className="p-2 md:p-4">
        {activeCampaign ? (
          <div className="max-w-7xl mx-auto">
            {activeTab === 'clients' ? (
              <>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-2 md:p-4 mb-2 md:mb-4">
                  <h3 className="text-xs md:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                    <Filter className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
                    Filtros
                  </h3>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3">
                    <div className="relative col-span-2">
                      <Search className="absolute left-2 md:left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 md:w-4 md:h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Buscar..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-8 md:pl-10 pr-2 md:pr-4 py-1.5 md:py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-xs md:text-sm"
                      />
                    </div>

                    <select
                      value={selectedCity}
                      onChange={(e) => {
                        setSelectedCity(e.target.value);
                        setSelectedBairro('all');
                      }}
                      className="px-2 md:px-4 py-1.5 md:py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-xs md:text-sm"
                    >
                      <option value="all">📍 Cidades</option>
                      {getUniqueCities().map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>

                    <select
                      value={selectedBairro}
                      onChange={(e) => setSelectedBairro(e.target.value)}
                      className="px-2 md:px-4 py-1.5 md:py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-xs md:text-sm"
                      disabled={selectedCity === 'all'}
                    >
                      <option value="all">🏘️ Bairros</option>
                      {getBairros().map(bairro => (
                        <option key={bairro} value={bairro}>{bairro}</option>
                      ))}
                    </select>

                    <select
                      value={selectedIndustry}
                      onChange={(e) => {
                        setSelectedIndustry(e.target.value);
                        if (e.target.value === 'all') {
                          setIndustryStatus('all');
                        }
                      }}
                      className="px-2 md:px-4 py-1.5 md:py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-xs md:text-sm"
                    >
                      <option value="all">🏭 Indústrias</option>
                      {getIndustries().map(industry => (
                        <option key={industry.name} value={industry.name}>{industry.name}</option>
                      ))}
                    </select>

                    <select
                      value={industryStatus}
                      onChange={(e) => setIndustryStatus(e.target.value)}
                      className="px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                    >
                      <option value="all">📊 Todos os Status</option>
                      <option value="positivado">✅ Positivados</option>
                      <option value="nao_positivado">⭕ Não Positivados</option>
                    </select>
                  </div>

                  {(selectedCity !== 'all' || selectedIndustry !== 'all' || industryStatus !== 'all' || searchTerm) && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-xs text-gray-600 dark:text-gray-400 font-semibold">Filtros ativos:</span>

                      {selectedCity !== 'all' && (
                        <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-xs flex items-center">
                          📍 {selectedCity}
                          <button
                            onClick={() => setSelectedCity('all')}
                            className="ml-2 hover:text-blue-600"
                          >
                            ✕
                          </button>
                        </span>
                      )}

                      {selectedIndustry !== 'all' && (
                        <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full text-xs flex items-center">
                          🏭 {selectedIndustry}
                          <button
                            onClick={() => setSelectedIndustry('all')}
                            className="ml-2 hover:text-purple-600"
                          >
                            ✕
                          </button>
                        </span>
                      )}

                      {industryStatus !== 'all' && (
                        <span className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-xs flex items-center">
                          {industryStatus === 'positivado' ? '✅ Positivados' : '⭕ Não Positivados'}
                          <button
                            onClick={() => setIndustryStatus('all')}
                            className="ml-2 hover:text-green-600"
                          >
                            ✕
                          </button>
                        </span>
                      )}

                      {searchTerm && (
                        <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-full text-xs flex items-center">
                          🔍 "{searchTerm}"
                          <button
                            onClick={() => setSearchTerm('')}
                            className="ml-2 hover:text-gray-600"
                          >
                            ✕
                          </button>
                        </span>
                      )}

                      <button
                        onClick={() => {
                          setSelectedCity('all');
                          setSelectedIndustry('all');
                          setIndustryStatus('all');
                          setSearchTerm('');
                        }}
                        className="px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-full text-xs hover:bg-red-200 dark:hover:bg-red-800"
                      >
                        🗑️ Limpar Todos
                      </button>
                    </div>
                  )}

                  <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                    Exibindo <strong className="text-blue-600 dark:text-blue-400">{filteredClients.length}</strong> de <strong>{clients.length}</strong> clientes
                  </div>
                </div>

                {filteredClients.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                    {filteredClients.map(client => (
                      <ClientCardIndustries
                        key={client.id}
                        client={client}
                        campaign={campaigns.find(c => c.id === activeCampaign)}
                        onEdit={handleEditClient}
                        onDelete={handleDeleteClient}
                        onUpdateProduct={handleUpdateProduct}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center bg-white dark:bg-gray-800 rounded-lg shadow p-6 md:p-10">
                    <h3 className="text-lg md:text-xl font-semibold mb-2">Nenhum cliente encontrado</h3>
                    <p className="text-sm md:text-base text-gray-500">
                      {searchTerm || selectedCity !== 'all' || selectedIndustry !== 'all' || industryStatus !== 'all'
                        ? 'Tente ajustar os filtros' 
                        : 'Adicione seu primeiro cliente para começar'}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <AnalyticsDashboard campaignId={activeCampaign} />
            )}
          </div>
        ) : (
          <div className="text-center bg-white dark:bg-gray-800 rounded-lg shadow p-6 md:p-10 max-w-2xl mx-auto">
            <h3 className="text-lg md:text-xl font-semibold mb-2">Bem-vindo!</h3>
            <p className="text-sm md:text-base text-gray-500">
              Crie uma campanha para começar a gerenciar seus clientes
            </p>
          </div>
        )}
      </main>

      <CampaignModal
        isOpen={showCampaignModal}
        onClose={() => setShowCampaignModal(false)}
        onSave={handleSaveCampaign}
        campaign={editingCampaign}
      />

      <ClientModalIndustries
        isOpen={showClientModal}
        onClose={() => setShowClientModal(false)}
        onSave={handleSaveClient}
        client={editingClient}
        campaign={campaigns.find(c => c.id === activeCampaign)}
      />

      <StatsModalIndustries
        isOpen={showStatsModal}
        onClose={() => setShowStatsModal(false)}
        campaign={campaigns.find(c => c.id === activeCampaign)}
        clients={clients}
      />

      <CityStatsModal
        isOpen={showCityStatsModal}
        onClose={() => setShowCityStatsModal(false)}
        stats={cityStatsData}
      />
    </div>
  );
}