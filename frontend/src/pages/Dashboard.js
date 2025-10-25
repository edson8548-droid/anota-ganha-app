1|import React, { useState, useEffect } from 'react';
2|import { useNavigate } from 'react-router-dom';
3|import { useAuth } from '../contexts/AuthContext';
4|import {
5|  getCampaigns,
6|  createCampaign,
7|  updateCampaign,
8|  deleteCampaign,
9|  resetCampaign,
10|  getSheets,
11|  createSheet,
12|  updateSheet,
13|  deleteSheet,
14|  getClients,
15|  createClient,
16|  updateClient,
17|  deleteClient,
18|  getCampaignStats,
19|  getCampaignStatsByCity
20|} from '../services/api';
21|import CampaignSelector from '../components/CampaignSelector';
22|import CityFilter from '../components/CityFilter';
23|import ClientCardIndustries from '../components/ClientCardIndustries';
24|import CampaignModal from '../components/modals/CampaignModal';
25|import ClientModalIndustries from '../components/modals/ClientModalIndustries';
26|import StatsModalIndustries from '../components/modals/StatsModalIndustries';
27|import CityStatsModal from '../components/modals/CityStatsModal';
28|import AnalyticsDashboard from '../components/AnalyticsDashboard';
29|import { LogOut, UserPlus, Settings, Search, Filter, RotateCcw, MapPin, BarChart3, Users } from 'lucide-react';
30|import { toast } from 'sonner';
31|
32|export default function Dashboard() {
33|  const { user, logout } = useAuth();
34|  const navigate = useNavigate();
35|
36|  // State
37|  const [campaigns, setCampaigns] = useState([]);
38|  const [activeCampaign, setActiveCampaign] = useState(null);
39|  const [sheets, setSheets] = useState([]);
40|  const [activeSheet, setActiveSheet] = useState(null);
41|  const [clients, setClients] = useState([]);
42|  const [loading, setLoading] = useState(true);
43|
44|  // Modals
45|  const [showCampaignModal, setShowCampaignModal] = useState(false);
46|  const [showClientModal, setShowClientModal] = useState(false);
47|  const [showStatsModal, setShowStatsModal] = useState(false);
48|  const [showCityStatsModal, setShowCityStatsModal] = useState(false);
49|  const [editingCampaign, setEditingCampaign] = useState(null);
50|  const [editingClient, setEditingClient] = useState(null);
51|  const [statsData, setStatsData] = useState(null);
52|  const [cityStatsData, setCityStatsData] = useState(null);
53|
54|  // Dropdowns
55|  const [showCampaignDropdown, setShowCampaignDropdown] = useState(false);
56|  const [showCityDropdown, setShowCityDropdown] = useState(false); // Novo dropdown de cidades
57|
58|  // Filters
59|  const [searchTerm, setSearchTerm] = useState('');
60|  const [selectedCity, setSelectedCity] = useState('all');
61|  const [selectedBairro, setSelectedBairro] = useState('all');
62|  const [selectedIndustry, setSelectedIndustry] = useState('all');
63|  const [industryStatus, setIndustryStatus] = useState('all'); // 'all', 'positivado', 'nao_positivado'
64|  
65|  // Tabs
66|  const [activeTab, setActiveTab] = useState('clients'); // 'clients' or 'analytics'
67|
68|  // Load campaigns
69|  useEffect(() => {
70|    loadCampaigns();
71|  }, []);
72|
73|  // Load sheets when campaign changes
74|  useEffect(() => {
75|    if (activeCampaign) {
76|      loadSheets(activeCampaign);
77|      loadClients(null, activeCampaign); // Carregar todos os clientes da campanha
78|    }
79|  }, [activeCampaign]);
80|
81|  const loadCampaigns = async () => {
82|    try {
83|      const response = await getCampaigns();
84|      setCampaigns(response.data);
85|      if (response.data.length > 0 && !activeCampaign) {
86|        setActiveCampaign(response.data[0].id);
87|      }
88|    } catch (error) {
89|      console.error('Error loading campaigns:', error);
90|      toast.error('Erro ao carregar campanhas');
91|    } finally {
92|      setLoading(false);
93|    }
94|  };
95|
96|  const loadSheets = async (campaignId) => {
97|    try {
98|      const response = await getSheets(campaignId);
99|      setSheets(response.data);
100|      if (response.data.length > 0 && !activeSheet) {
101|        setActiveSheet(response.data[0].id);
102|      }
103|    } catch (error) {
104|      console.error('Error loading sheets:', error);
105|      toast.error('Erro ao carregar cidades');
106|    }
107|  };
108|
109|  const loadClients = async (sheetId, campaignId) => {
110|    try {
111|      const params = { campaign_id: campaignId };
112|      if (sheetId) {
113|        params.sheet_id = sheetId;
114|      }
115|      
116|      const response = await getClients(params);
117|      const clientsData = response.data;
118|      
119|      // Sincronizar produtos da campanha com clientes existentes
120|      const currentCampaign = campaigns.find(c => c.id === campaignId);
121|      const campaignProducts = Object.keys(currentCampaign?.product_goals || {});
122|      
123|      // Para cada cliente, garantir que tenha todos os produtos da campanha
124|      const syncedClients = await Promise.all(clientsData.map(async (client) => {
125|        let needsUpdate = false;
126|        const updatedProducts = { ...client.products };
127|        
128|        // Adicionar produtos faltantes
129|        campaignProducts.forEach(productName => {
130|          if (!updatedProducts[productName]) {
131|            updatedProducts[productName] = { status: '', value: 0 };
132|            needsUpdate = true;
133|          }
134|        });
135|        
136|        // Remover produtos que não existem mais na campanha
137|        Object.keys(updatedProducts).forEach(productName => {
138|          if (!campaignProducts.includes(productName)) {
139|            delete updatedProducts[productName];
140|            needsUpdate = true;
141|          }
142|        });
143|        
144|        // Atualizar cliente se necessário
145|        if (needsUpdate) {
146|          try {
147|            await updateClient(client.id, { products: updatedProducts });
148|            return { ...client, products: updatedProducts };
149|          } catch (error) {
150|            console.error('Error syncing client products:', error);
151|            return client;
152|          }
153|        }
154|        
155|        return client;
156|      }));
157|      
158|      setClients(syncedClients);
159|    } catch (error) {
160|      console.error('Error loading clients:', error);
161|      toast.error('Erro ao carregar clientes');
162|    }
163|  };
164|
165|  // Campaign handlers
166|  const handleCreateCampaign = () => {
167|    setEditingCampaign(null);
168|    setShowCampaignModal(true);
169|  };
170|
171|  const handleEditCampaign = (campaign) => {
172|    setEditingCampaign(campaign);
173|    setShowCampaignModal(true);
174|  };
175|
176|  const handleSaveCampaign = async (data) => {
177|    try {
178|      if (editingCampaign) {
179|        await updateCampaign(editingCampaign.id, data);
180|        toast.success('Campanha atualizada!');
181|        
182|        // Sincronizar produtos de todos os clientes desta campanha
183|        if (editingCampaign.id === activeCampaign && data.industries) {
184|          // Extrair todos os produtos de todas as indústrias
185|          const allProducts = [];
186|          data.industries.forEach(industry => {
187|            if (industry.products) {
188|              allProducts.push(...industry.products);
189|            }
190|          });
191|          if (allProducts.length > 0) {
192|            await syncCampaignProducts(editingCampaign.id, allProducts);
193|          }
194|        }
195|      } else {
196|        const response = await createCampaign(data);
197|        toast.success('Campanha criada!');
198|        setActiveCampaign(response.data.id);
199|      }
200|      await loadCampaigns();
201|      setShowCampaignModal(false);
202|    } catch (error) {
203|      console.error('Error saving campaign:', error);
204|      toast.error('Erro ao salvar campanha');
205|    }
206|  };
207|
208|  // Função para sincronizar produtos da campanha com todos os clientes
209|  const syncCampaignProducts = async (campaignId, productNames) => {
210|    try {
211|      // Buscar todos os clientes da campanha
212|      const response = await getClients({ campaign_id: campaignId });
213|      const allClients = response.data;
214|      
215|      // Atualizar cada cliente
216|      await Promise.all(allClients.map(async (client) => {
217|        const updatedProducts = { ...client.products };
218|        let needsUpdate = false;
219|        
220|        // Adicionar novos produtos
221|        productNames.forEach(productName => {
222|          if (!updatedProducts[productName]) {
223|            updatedProducts[productName] = { status: '', value: 0 };
224|            needsUpdate = true;
225|          }
226|        });
227|        
228|        // Remover produtos que não existem mais
229|        Object.keys(updatedProducts).forEach(productName => {
230|          if (!productNames.includes(productName)) {
231|            delete updatedProducts[productName];
232|            needsUpdate = true;
233|          }
234|        });
235|        
236|        if (needsUpdate) {
237|          await updateClient(client.id, { products: updatedProducts });
238|        }
239|      }));
240|      
241|      // Recarregar clientes da sheet ativa
242|      if (activeSheet) {
243|        await loadClients(activeSheet, campaignId);
244|      }
245|      
246|      toast.success('Produtos sincronizados com todos os clientes!');
247|    } catch (error) {
248|      console.error('Error syncing campaign products:', error);
249|      toast.error('Erro ao sincronizar produtos');
250|    }

Action: file_editor view /app/frontend/src/pages/Dashboard.js
Observation: /app/frontend/src/pages/Dashboard.js:
251|  };
252|
253|  const handleDeleteCampaign = async (campaignId) => {
254|    if (!window.confirm('Tem certeza que deseja excluir esta campanha? Todos os dados serão perdidos.')) {
255|      return;
256|    }
257|    try {
258|      await deleteCampaign(campaignId);
259|      toast.success('Campanha excluída!');
260|      if (activeCampaign === campaignId) {
261|        setActiveCampaign(null);
262|        setActiveSheet(null);
263|        setClients([]);
264|      }
265|      await loadCampaigns();
266|    } catch (error) {
267|      console.error('Error deleting campaign:', error);
268|      toast.error('Erro ao excluir campanha');
269|    }
270|  };
271|
272|  const handleResetCampaign = async () => {
273|    if (!window.confirm('Tem certeza que deseja resetar esta campanha? Todos os produtos serão marcados como "Não Positivados" e valores zerados.')) {
274|      return;
275|    }
276|    try {
277|      await resetCampaign(activeCampaign);
278|      toast.success('Campanha resetada com sucesso!');
279|      await loadClients(activeSheet, activeCampaign);
280|    } catch (error) {
281|      console.error('Error resetting campaign:', error);
282|      toast.error('Erro ao resetar campanha');
283|    }
284|  };
285|
286|  const handleViewStats = async (campaignId) => {
287|    try {
288|      // Não precisa mais buscar do backend, o modal calcula diretamente
289|      setShowStatsModal(true);
290|    } catch (error) {
291|      console.error('Error loading stats:', error);
292|      toast.error('Erro ao carregar estatísticas');
293|    }
294|  };
295|
296|  const handleViewCityStats = async () => {
297|    try {
298|      const response = await getCampaignStatsByCity(activeCampaign);
299|      setCityStatsData(response.data);
300|      setShowCityStatsModal(true);
301|    } catch (error) {
302|      console.error('Error loading city stats:', error);
303|      toast.error('Erro ao carregar estatísticas por cidade');
304|    }
305|  };
306|
307|  // Sheet handlers
308|  const handleCreateSheet = () => {
309|    if (!activeCampaign) {
310|      toast.error('Selecione uma campanha primeiro');
311|      return;
312|    }
313|    setEditingSheet(null);
314|    setShowSheetModal(true);
315|  };
316|
317|  const handleEditSheet = (sheet) => {
318|    setEditingSheet(sheet);
319|    setShowSheetModal(true);
320|  };
321|
322|  const handleSaveSheet = async (data) => {
323|    try {
324|      if (editingSheet) {
325|        await updateSheet(editingSheet.id, data);
326|        toast.success('Cidade atualizada!');
327|      } else {
328|        const response = await createSheet({
329|          ...data,
330|          campaign_id: activeCampaign,
331|          headers: getCurrentHeaders()
332|        });
333|        toast.success('Cidade criada!');
334|        setActiveSheet(response.data.id);
335|      }
336|      await loadSheets(activeCampaign);
337|      setShowSheetModal(false);
338|    } catch (error) {
339|      console.error('Error saving sheet:', error);
340|      toast.error('Erro ao salvar cidade');
341|    }
342|  };
343|
344|  const handleDeleteSheet = async (sheetId) => {
345|    const sheetToDelete = sheets.find(s => s.id === sheetId);
346|    if (!window.confirm(`Tem certeza que deseja excluir a cidade "${sheetToDelete?.name}"?\n\nTodos os clientes desta cidade serão perdidos permanentemente!`)) {
347|      return;
348|    }
349|    
350|    try {
351|      console.log('Deletando sheet:', sheetId);
352|      await deleteSheet(sheetId);
353|      toast.success(`Cidade "${sheetToDelete?.name}" excluída com sucesso!`);
354|      
355|      // Se for a sheet ativa, limpar
356|      if (activeSheet === sheetId) {
357|        setActiveSheet(null);
358|        setClients([]);
359|      }
360|      
361|      // Recarregar lista de sheets
362|      await loadSheets(activeCampaign);
363|      
364|      console.log('Sheet excluída com sucesso');
365|    } catch (error) {
366|      console.error('Error deleting sheet:', error);
367|      toast.error(`Erro ao excluir cidade: ${error.response?.data?.detail || error.message}`);
368|    }
369|  };
370|
371|  // Client handlers
372|  const handleCreateClient = () => {
373|    if (!activeCampaign) {
374|      toast.error('Selecione uma campanha primeiro');
375|      return;
376|    }
377|    
378|    // Não exigir sheet ativa - será criada automaticamente baseada na cidade
379|    setEditingClient(null);
380|    setShowClientModal(true);
381|  };
382|
383|  const handleEditClient = (client) => {
384|    setEditingClient(client);
385|    setShowClientModal(true);
386|  };
387|
388|  const handleSaveClient = async (data) => {
389|    try {
390|      if (editingClient) {
391|        await updateClient(editingClient.id, data);
392|        toast.success('Cliente atualizado!');
393|        await loadClients(null, activeCampaign);
394|      } else {
395|        // Verificar se a cidade do cliente tem uma sheet correspondente
396|        const clientCity = data.CIDADE;
397|        let targetSheetId = activeSheet;
398|        
399|        if (clientCity) {
400|          // Primeiro, recarregar sheets para ter lista atualizada
401|          const sheetsResponse = await getSheets(activeCampaign);
402|          const currentSheets = sheetsResponse.data;
403|          
404|          // Procurar sheet com o mesmo nome da cidade
405|          const citySheet = currentSheets.find(s => s.name.toLowerCase() === clientCity.toLowerCase());
406|          
407|          if (citySheet) {
408|            // Usar sheet existente
409|            targetSheetId = citySheet.id;
410|            console.log(`Usando cidade existente: ${citySheet.name}`);
411|          } else {
412|            // Criar nova sheet para a cidade
413|            console.log(`Criando nova cidade: ${clientCity}`);
414|            const newSheetResponse = await createSheet({
415|              campaign_id: activeCampaign,
416|              name: clientCity,
417|              headers: getCurrentHeaders()
418|            });
419|            targetSheetId = newSheetResponse.data.id;
420|            toast.success(`✨ Nova cidade criada: ${clientCity}`);
421|            
422|            // Recarregar sheets para mostrar a nova
423|            await loadSheets(activeCampaign);
424|          }
425|          
426|          // Se não estava em nenhuma sheet, definir a cidade como ativa
427|          if (!activeSheet) {
428|            setActiveSheet(targetSheetId);
429|          }
430|        } else {
431|          // Se não tem cidade, usar a primeira sheet disponível ou criar uma padrão
432|          if (!targetSheetId) {
433|            const sheetsResponse = await getSheets(activeCampaign);
434|            if (sheetsResponse.data.length > 0) {
435|              targetSheetId = sheetsResponse.data[0].id;
436|            } else {
437|              // Criar sheet padrão
438|              const newSheetResponse = await createSheet({
439|                campaign_id: activeCampaign,
440|                name: 'Geral',
441|                headers: getCurrentHeaders()
442|              });
443|              targetSheetId = newSheetResponse.data.id;
444|              await loadSheets(activeCampaign);
445|            }
446|          }
447|        }
448|        
449|        // Criar o cliente na sheet correta
450|        await createClient({
451|          ...data,
452|          sheet_id: targetSheetId,
453|          campaign_id: activeCampaign
454|        });
455|        
456|        toast.success(`✅ Cliente adicionado${clientCity ? ' em: ' + clientCity : '!'}`);
457|        
458|        // Recarregar sheets e clientes
459|        await loadSheets(activeCampaign);
460|        await loadClients(null, activeCampaign);
461|      }
462|      setShowClientModal(false);
463|    } catch (error) {
464|      console.error('Error saving client:', error);
465|      toast.error('Erro ao salvar cliente');
466|    }
467|  };
468|
469|  const handleDeleteClient = async (clientId) => {
470|    if (!window.confirm('Tem certeza que deseja excluir este cliente?')) {
471|      return;
472|    }
473|    try {
474|      await deleteClient(clientId);
475|      toast.success('Cliente excluído!');
476|      await loadClients(activeSheet, activeCampaign);
477|    } catch (error) {
478|      console.error('Error deleting client:', error);
479|      toast.error('Erro ao excluir cliente');
480|    }
481|  };
482|
483|  const handleUpdateProduct = async (clientId, industryName, productName, productData) => {
484|    try {
485|      const client = clients.find(c => c.id === clientId);
486|      const updatedIndustries = {
487|        ...client.industries,
488|        [industryName]: {
489|          ...client.industries[industryName],
490|          products: {
491|            ...client.industries[industryName].products,
492|            [productName]: productData
493|          }
494|        }
495|      };
496|      
497|      // Recalcular status da indústria
498|      const hasPositivado = Object.values(updatedIndustries[industryName].products).some(
499|        p => p.status?.toLowerCase() === 'positivado'
500|      );

Action: file_editor view /app/frontend/src/pages/Dashboard.js
Observation: /app/frontend/src/pages/Dashboard.js:
501|      updatedIndustries[industryName].industry_status = hasPositivado ? 'positivado' : '';
502|      
503|      // Enviar cliente completo para não perder campos como CIDADE, BAIRRO, etc
504|      await updateClient(clientId, { 
505|        ...client,
506|        industries: updatedIndustries 
507|      });
508|      await loadClients(activeSheet, activeCampaign);
509|    } catch (error) {
510|      console.error('Error updating product:', error);
511|      toast.error('Erro ao atualizar produto');
512|    }
513|  };
514|
515|  const getCurrentHeaders = () => {
516|    const currentCampaign = campaigns.find(c => c.id === activeCampaign);
517|    return Object.keys(currentCampaign?.product_goals || {});
518|  };
519|
520|  const getCurrentSheet = () => {
521|    return sheets.find(s => s.id === activeSheet);
522|  };
523|  
524|  const getCurrentCampaign = () => {
525|    return campaigns.find(c => c.id === activeCampaign);
526|  };
527|
528|  const getIndustries = () => {
529|    const currentCampaign = getCurrentCampaign();
530|    return currentCampaign?.industries || [];
531|  };
532|
533|  const getBairros = () => {
534|    // Extrai bairros únicos dos clientes da cidade selecionada
535|    const bairrosSet = new Set();
536|    clients.forEach(client => {
537|      // Se tem filtro de cidade, só mostra bairros dessa cidade
538|      if (selectedCity !== 'all' && client.CIDADE !== selectedCity) {
539|        return;
540|      }
541|      if (client.BAIRRO && client.BAIRRO.trim()) {
542|        bairrosSet.add(client.BAIRRO);
543|      }
544|    });
545|    return Array.from(bairrosSet).sort();
546|  };
547|
548|  // Obter cidades únicas dos clientes
549|  const getUniqueCities = () => {
550|    const cities = [...new Set(clients.map(c => c.CIDADE).filter(Boolean))];
551|    return cities.sort();
552|  };
553|
554|  const uniqueCities = getUniqueCities();
555|
556|  // Filter clients
557|  // Filtra clientes e suas indústrias baseado nos filtros ativos
558|  const filteredClients = clients
559|    .map(client => {
560|      // City filter
561|      if (selectedCity !== 'all' && client.CIDADE !== selectedCity) {
562|        return null;
563|      }
564|
565|      // Bairro filter
566|      if (selectedBairro !== 'all' && client.BAIRRO !== selectedBairro) {
567|        return null;
568|      }
569|
570|      // Search filter
571|      if (searchTerm && !client.CLIENTE.toLowerCase().includes(searchTerm.toLowerCase())) {
572|        return null;
573|      }
574|
575|      // Filtrar indústrias do cliente
576|      let filteredIndustries = { ...client.industries };
577|
578|      // Industry filter (filtro por nome de indústria específica)
579|      if (selectedIndustry !== 'all') {
580|        const industryData = client.industries?.[selectedIndustry];
581|        if (!industryData) return null;
582|        
583|        // Se tem filtro de indústria específica, mostrar apenas essa
584|        filteredIndustries = { [selectedIndustry]: industryData };
585|        
586|        // Industry status filter (quando tem indústria específica selecionada)
587|        if (industryStatus !== 'all') {
588|          const isIndustryPositivado = industryData.industry_status?.toLowerCase() === 'positivado';
589|          
590|          if (industryStatus === 'positivado' && !isIndustryPositivado) return null;
591|          if (industryStatus === 'nao_positivado' && isIndustryPositivado) return null;
592|        }
593|      } else if (industryStatus !== 'all') {
594|        // Filtro de status sem indústria específica: filtrar INDÚSTRIAS dentro do cliente
595|        const allIndustries = Object.entries(client.industries || {});
596|        
597|        filteredIndustries = {};
598|        
599|        for (const [industryName, industryData] of allIndustries) {
600|          const isIndustryPositivado = industryData.industry_status?.toLowerCase() === 'positivado';
601|          
602|          if (industryStatus === 'positivado' && isIndustryPositivado) {
603|            // Mostrar apenas indústrias positivadas
604|            filteredIndustries[industryName] = industryData;
605|          } else if (industryStatus === 'nao_positivado' && !isIndustryPositivado) {
606|            // Mostrar apenas indústrias não positivadas
607|            filteredIndustries[industryName] = industryData;
608|          }
609|        }
610|        
611|        // Se não tem nenhuma indústria após filtrar, não mostrar o cliente
612|        if (Object.keys(filteredIndustries).length === 0) {
613|          return null;
614|        }
615|      }
616|
617|      // Retornar cliente com indústrias filtradas
618|      return {
619|        ...client,
620|        industries: filteredIndustries
621|      };
622|    })
623|    .filter(client => client !== null); // Remove clientes que foram filtrados (null)
624|
625|  const handleLogout = () => {
626|    logout();
627|    navigate('/login');
628|  };
629|
630|  if (loading) {
631|    return (
632|      <div className="flex items-center justify-center min-h-screen">
633|        <div className="text-xl">Carregando...</div>
634|      </div>
635|    );
636|  }
637|
638|  const headers = getCurrentHeaders();
639|
640|  return (
641|    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
642|      {/* Header - Compacto para Mobile */}
643|      <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-10">
644|        {/* Linha 1: Título e Menu */}
645|        <div className="flex justify-between items-center p-3 border-b border-gray-200 dark:border-gray-700">
646|          <h1 className="text-lg md:text-2xl font-bold text-blue-600 dark:text-blue-400 truncate">
647|            Anota & Ganha Incentivos
648|          </h1>
649|          <div className="flex items-center space-x-2">
650|            {/* Botões - Ícones apenas no mobile */}
651|            {user?.role === 'admin' && (
652|              <button
653|                onClick={() => navigate('/admin')}
654|                className="p-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
655|                title="Painel Admin"
656|              >
657|                🔧
658|              </button>
659|            )}
660|            
661|            {(user?.license_type === 'trial' || user?.license_type === 'expired') && (
662|              <button
663|                onClick={() => navigate('/pricing')}
664|                className="p-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 animate-pulse"
665|                title="Assinar Agora"
666|              >
667|                ⚡
668|              </button>
669|            )}
670|            
671|            {user?.license_type !== 'trial' && user?.license_type !== 'expired' && (
672|              <button
673|                onClick={() => navigate('/my-subscription')}
674|                className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
675|                title="Minha Assinatura"
676|              >
677|                💳
678|              </button>
679|            )}
680|            
681|            <button
682|              onClick={handleLogout}
683|              className="p-2 bg-red-600 text-white rounded-md hover:bg-red-700"
684|              title="Sair"
685|            >
686|              <LogOut className="w-4 h-4" />
687|            </button>
688|          </div>
689|        </div>
690|
691|        {/* Linha 2: Seletores - Compactos */}
692|        <div className="p-2 space-y-2">
693|          <CampaignSelector
694|            campaigns={campaigns}
695|            activeCampaign={activeCampaign}
696|            onSelectCampaign={setActiveCampaign}
697|            onCreateCampaign={handleCreateCampaign}
698|            onEditCampaign={handleEditCampaign}
699|            onDeleteCampaign={handleDeleteCampaign}
700|            onViewStats={handleViewStats}
701|            showDropdown={showCampaignDropdown}
702|            setShowDropdown={setShowCampaignDropdown}
703|          />
704|
705|          {/* Tabs - Clientes vs Analytics */}
706|          {activeCampaign && (
707|            <div className="flex border-b border-gray-200 dark:border-gray-700">
708|              <button
709|                onClick={() => setActiveTab('clients')}
710|                className={`flex-1 flex items-center justify-center px-4 py-3 text-sm font-medium transition-colors ${
711|                  activeTab === 'clients'
712|                    ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
713|                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
714|                }`}
715|              >
716|                <Users className="w-4 h-4 mr-2" />
717|                Clientes
718|              </button>
719|              <button
720|                onClick={() => setActiveTab('analytics')}
721|                className={`flex-1 flex items-center justify-center px-4 py-3 text-sm font-medium transition-colors ${
722|                  activeTab === 'analytics'
723|                    ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
724|                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
725|                }`}
726|              >
727|                <BarChart3 className="w-4 h-4 mr-2" />
728|                Analytics
729|              </button>
730|            </div>
731|          )}
732|
733|          {/* Linha 3: Botões de Ação - Mobile Friendly */}
734|          {activeCampaign && activeTab === 'clients' && (
735|            <div className="flex flex-wrap gap-2">
736|              <button
737|                onClick={handleCreateClient}
738|                className="flex-1 min-w-[120px] flex items-center justify-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
739|                data-testid="add-client-btn"
740|              >
741|                <UserPlus className="w-4 h-4 mr-1" />
742|                Novo Cliente
743|              </button>
744|              
745|              {clients.length > 0 && (
746|                <>
747|                  <button
748|                    onClick={() => handleViewStats()}
749|                    className="flex-1 min-w-[120px] flex items-center justify-center px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
750|                  >
751|                    <Settings className="w-4 h-4 mr-1" />
752|                    Estatísticas
753|                  </button>
754|                  <button
755|                    onClick={handleViewCityStats}
756|                    className="flex-1 min-w-[120px] flex items-center justify-center px-3 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 text-sm"
757|                    data-testid="city-stats-btn"
758|                  >
759|                    <MapPin className="w-4 h-4 mr-1" />
760|                    Por Cidade
761|                  </button>
762|                  <button
763|                    onClick={handleResetCampaign}
764|                    className="flex-1 min-w-[120px] flex items-center justify-center px-3 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 text-sm"
765|                    data-testid="reset-campaign-btn"
766|                  >
767|                    <RotateCcw className="w-4 h-4 mr-1" />
768|                    Resetar
769|                  </button>
770|                  <button
771|                    onClick={() => syncCampaignProducts(activeCampaign, getCurrentHeaders())}
772|                    className="flex-1 min-w-[120px] flex items-center justify-center px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
773|                    title="Sincronizar produtos da campanha com todos os clientes"
774|                  >
775|                    <Settings className="w-4 h-4 mr-1" />
776|                    Sincronizar
777|                  </button>
778|                </>
779|              )}
780|            </div>
781|          )}
782|
783|          {/* Filtro por Cidade dos Clientes */}
784|          {activeCampaign && activeTab === 'clients' && uniqueCities.length > 0 && (
785|            <CityFilter
786|              cities={uniqueCities}
787|              selectedCity={selectedCity}
788|              onSelectCity={setSelectedCity}
789|              showDropdown={showCityDropdown}
790|              setShowDropdown={setShowCityDropdown}
791|              clientCount={filteredClients.length}
792|            />
793|          )}
794|        </div>
795|      </header>
796|
797|      {/* Main Content - Padding reduzido no mobile */}
798|      <main className="p-2 md:p-4">
799|        {activeCampaign ? (
800|          <div className="max-w-7xl mx-auto">
801|            {activeTab === 'clients' ? (
802|              <>
803|                {/* Filters - Mais compacto no mobile */}
804|                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-2 md:p-4 mb-2 md:mb-4">
805|              <h3 className="text-xs md:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
806|                <Filter className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
807|                Filtros
808|              </h3>
809|              
810|              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3">
811|                {/* Busca por nome */}
812|                <div className="relative col-span-2">
813|                  <Search className="absolute left-2 md:left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 md:w-4 md:h-4 text-gray-400" />
814|                  <input
815|                    type="text"
816|                    placeholder="Buscar..."
817|                    value={searchTerm}
818|                    onChange={(e) => setSearchTerm(e.target.value)}
819|                    className="w-full pl-8 md:pl-10 pr-2 md:pr-4 py-1.5 md:py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-xs md:text-sm"
820|                  />
821|                </div>
822|
823|                {/* Filtro de Cidade */}
824|                <select
825|                  value={selectedCity}
826|                  onChange={(e) => {
827|                    setSelectedCity(e.target.value);
828|                    setSelectedBairro('all'); // Reseta bairro ao mudar cidade
829|                  }}
830|                  className="px-2 md:px-4 py-1.5 md:py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-xs md:text-sm"
831|                >
832|                  <option value="all">📍 Cidades</option>
833|                  {getUniqueCities().map(city => (
834|                    <option key={city} value={city}>{city}</option>
835|                  ))}
836|                </select>
837|
838|                {/* Filtro de Bairro */}
839|                <select
840|                  value={selectedBairro}
841|                  onChange={(e) => setSelectedBairro(e.target.value)}
842|                  className="px-2 md:px-4 py-1.5 md:py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-xs md:text-sm"
843|                  disabled={selectedCity === 'all'}
844|                >
845|                  <option value="all">🏘️ Bairros</option>
846|                  {getBairros().map(bairro => (
847|                    <option key={bairro} value={bairro}>{bairro}</option>
848|                  ))}
849|                </select>
850|
851|                {/* Filtro de Indústria */}
852|                <select
853|                  value={selectedIndustry}
854|                  onChange={(e) => {
855|                    setSelectedIndustry(e.target.value);
856|                    if (e.target.value === 'all') {
857|                      setIndustryStatus('all');
858|                    }
859|                  }}
860|                  className="px-2 md:px-4 py-1.5 md:py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-xs md:text-sm"
861|                >
862|                  <option value="all">🏭 Indústrias</option>
863|                  {getIndustries().map(industry => (
864|                    <option key={industry.name} value={industry.name}>{industry.name}</option>
865|                  ))}
866|                </select>
867|
868|                {/* Filtro de Status da Indústria */}
869|                <select
870|                  value={industryStatus}
871|                  onChange={(e) => setIndustryStatus(e.target.value)}
872|                  className="px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
873|                >
874|                  <option value="all">📊 Todos os Status</option>
875|                  <option value="positivado">✅ Positivados</option>
876|                  <option value="nao_positivado">⭕ Não Positivados</option>
877|                </select>
878|              </div>
879|
880|              {/* Active Filters Badges */}
881|              {(selectedCity !== 'all' || selectedIndustry !== 'all' || industryStatus !== 'all' || searchTerm) && (
882|                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
883|                  <span className="text-xs text-gray-600 dark:text-gray-400 font-semibold">Filtros ativos:</span>
884|                  
885|                  {selectedCity !== 'all' && (
886|                    <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-xs flex items-center">
887|                      📍 {selectedCity}
888|                      <button
889|                        onClick={() => setSelectedCity('all')}
890|                        className="ml-2 hover:text-blue-600"
891|                      >
892|                        ✕
893|                      </button>
894|                    </span>
895|                  )}
896|                  
897|                  {selectedIndustry !== 'all' && (
898|                    <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full text-xs flex items-center">
899|                      🏭 {selectedIndustry}
900|                      <button
901|                        onClick={() => setSelectedIndustry('all')}
902|                        className="ml-2 hover:text-purple-600"
903|                      >
904|                        ✕
905|                      </button>
906|                    </span>
907|                  )}
908|                  
909|                  {industryStatus !== 'all' && (
910|                    <span className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-xs flex items-center">
911|                      {industryStatus === 'positivado' ? '✅ Positivados' : '⭕ Não Positivados'}
912|                      <button
913|                        onClick={() => setIndustryStatus('all')}
914|                        className="ml-2 hover:text-green-600"
915|                      >
916|                        ✕
917|                      </button>
918|                    </span>
919|                  )}
920|                  
921|                  {searchTerm && (
922|                    <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-full text-xs flex items-center">
923|                      🔍 "{searchTerm}"
924|                      <button
925|                        onClick={() => setSearchTerm('')}
926|                        className="ml-2 hover:text-gray-600"
927|                      >
928|                        ✕
929|                      </button>
930|                    </span>
931|                  )}
932|                  
933|                  <button
934|                    onClick={() => {
935|                      setSelectedCity('all');
936|                      setSelectedIndustry('all');
937|                      setIndustryStatus('all');
938|                      setSearchTerm('');
939|                    }}
940|                    className="px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-full text-xs hover:bg-red-200 dark:hover:bg-red-800"
941|                  >
942|                    🗑️ Limpar Todos
943|                  </button>
944|                </div>
945|              )}
946|              
947|              {/* Results count */}
948|              <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
949|                Exibindo <strong className="text-blue-600 dark:text-blue-400">{filteredClients.length}</strong> de <strong>{clients.length}</strong> clientes
950|              </div>
951|            </div>
952|
953|            {/* Clients Grid - Otimizado para Mobile */}
954|            {filteredClients.length > 0 ? (
955|              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
956|                {filteredClients.map(client => (
957|                  <ClientCardIndustries
958|                    key={client.id}
959|                    client={client}
960|                    campaign={campaigns.find(c => c.id === activeCampaign)}
961|                    onEdit={handleEditClient}
962|                    onDelete={handleDeleteClient}
963|                    onUpdateProduct={handleUpdateProduct}
964|                  />
965|                ))}
966|              </div>
967|            ) : (
968|              <div className="text-center bg-white dark:bg-gray-800 rounded-lg shadow p-6 md:p-10">
969|                <h3 className="text-lg md:text-xl font-semibold mb-2">Nenhum cliente encontrado</h3>
970|                <p className="text-sm md:text-base text-gray-500">
971|                  {searchTerm || selectedCity !== 'all' || selectedIndustry !== 'all' || industryStatus !== 'all'
972|                    ? 'Tente ajustar os filtros' 
973|                    : 'Adicione seu primeiro cliente para começar'}
974|                </p>
975|              </div>
976|            )}
977|            </>
978|          ) : (
979|            /* Analytics Dashboard */
980|            <AnalyticsDashboard campaignId={activeCampaign} />
981|          )}
982|          </div>
983|        ) : (
984|          <div className="text-center bg-white dark:bg-gray-800 rounded-lg shadow p-6 md:p-10 max-w-2xl mx-auto">
985|            <h3 className="text-lg md:text-xl font-semibold mb-2">Bem-vindo!</h3>
986|            <p className="text-sm md:text-base text-gray-500">
987|              Crie uma campanha para começar a gerenciar seus clientes
988|            </p>
989|          </div>
990|        )}
991|      </main>
992|
993|      {/* Modals */}
994|      <CampaignModal
995|        isOpen={showCampaignModal}
996|        onClose={() => setShowCampaignModal(false)}
997|        onSave={handleSaveCampaign}
998|        campaign={editingCampaign}
999|      />
1000|      
1001|      <ClientModalIndustries
1002|        isOpen={showClientModal}
1003|        onClose={() => setShowClientModal(false)}
1004|        onSave={handleSaveClient}
1005|        client={editingClient}
1006|        campaign={campaigns.find(c => c.id === activeCampaign)}
1007|      />
1008|
1009|      <StatsModalIndustries
1010|        isOpen={showStatsModal}
1011|        onClose={() => setShowStatsModal(false)}
1012|        campaign={campaigns.find(c => c.id === activeCampaign)}
1013|        clients={clients}
1014|      />
1015|
1016|      <CityStatsModal
1017|        isOpen={showCityStatsModal}
1018|        onClose={() => setShowCityStatsModal(false)}
1019|        stats={cityStatsData}
1020|      />
1021|    </div>
1022|  );
1023|}
1024|
