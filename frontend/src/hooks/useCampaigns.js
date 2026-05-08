// COLE EM: src/hooks/useCampaigns.js
// ✅ VERSÃO usando useAuthContext (conforme erro indica)

import { useState, useEffect } from 'react';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc,
  deleteDoc,
  doc, 
  query, 
  where, 
  onSnapshot,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { useAuthContext } from '../contexts/AuthContext'; // ✅ useAuthContext

const INDUSTRY_META_FIELDS = ['targetValue', 'alreadySoldValue'];

export const useCampaigns = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const authData = useAuthContext();
  
  console.log('🔍 DEBUG - AuthContext retornou:', authData);
  console.log('🔍 DEBUG - Propriedades disponíveis:', Object.keys(authData || {}));
  
  // Tentar pegar o user de diferentes formas
  const user = authData?.user || authData?.currentUser || authData;
  const userId = user?.id || user?._id || user?.uid;
  
  console.log('🔍 DEBUG - User:', user);
  console.log('🔍 DEBUG - User ID:', userId);
  
  const db = getFirestore();

  // ============================================
  // LISTENER EM TEMPO REAL - BUSCAR CAMPANHAS
  // ============================================
  useEffect(() => {
    if (!user || !userId) {
      console.warn('⚠️ Aguardando autenticação...');
      console.log('🔍 User:', user);
      console.log('🔍 UserId:', userId);
      setCampaigns([]);
      setLoading(false);
      return;
    }

    console.log('🔄 Iniciando listener de campanhas para usuário:', userId);

    const q = query(
      collection(db, 'campaigns'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const campaignsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log('✅ Campanhas carregadas:', campaignsData.length);
        setCampaigns(campaignsData);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('❌ Erro ao carregar campanhas:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, userId, db]);

  // ============================================
  // FUNÇÃO: BUSCAR TODOS OS CLIENTES DO USUÁRIO
  // ============================================
  const getAllUserClients = async () => {
    try {
      if (!userId) {
        console.error('❌ User ID não encontrado');
        return [];
      }

      console.log('📋 Buscando todos os clientes do usuário...');
      
      const q = query(
        collection(db, 'clients'),
        where('userId', '==', userId)
      );
      
      const snapshot = await getDocs(q);
      const clientsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log(`✅ ${clientsData.length} clientes encontrados`);
      return clientsData;
      
    } catch (error) {
      console.error('❌ Erro ao buscar clientes:', error);
      return [];
    }
  };

  // ============================================
  // FUNÇÃO: ADICIONAR CLIENTES NA CAMPANHA
  // ============================================
  const addClientsToNewCampaign = async (campaignId, campaignData) => {
    try {
      if (!userId) {
        console.error('❌ User ID não encontrado');
        return;
      }

      console.log('🔄 Adicionando clientes automaticamente na campanha:', campaignId);
      
      const allClients = await getAllUserClients();
      
      if (allClients.length === 0) {
        console.log('ℹ️ Nenhum cliente existente para adicionar');
        return;
      }

      console.log(`📥 Adicionando ${allClients.length} clientes na nova campanha...`);

      for (const client of allClients) {
        const newIndustries = {};
        
        if (campaignData.industries) {
          Object.keys(campaignData.industries).forEach(industryName => {
            newIndustries[industryName] = {};
            
            Object.keys(campaignData.industries[industryName])
              .filter(productName => !INDUSTRY_META_FIELDS.includes(productName))
              .forEach(productName => {
              newIndustries[industryName][productName] = {
                positivado: false,
                valor: 0
              };
            });
          });
        }

        const newClientData = {
          CNPJ: client.CNPJ,
          CLIENTE: client.CLIENTE,
          CONTATO: client.CONTATO || '',
          CIDADE: client.CIDADE,
          ESTADO: client.ESTADO,
          ENDERECO: client.ENDERECO || '',
          BAIRRO: client.BAIRRO || '',
          CEP: client.CEP || '',
          TELEFONE: client.TELEFONE || '',
          EMAIL: client.EMAIL || '',
          notes: client.notes || '',
          userId: userId,
          campaignId: campaignId,
          industries: newIndustries,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        };

        await addDoc(collection(db, 'clients'), newClientData);
      }

      console.log(`✅ ${allClients.length} clientes adicionados com sucesso!`);
      
    } catch (error) {
      console.error('❌ Erro ao adicionar clientes na campanha:', error);
      throw error;
    }
  };

  // ============================================
  // CRIAR CAMPANHA (COM CLIENTES AUTOMÁTICOS)
  // ============================================
  const createCampaign = async (campaignData) => {
    try {
      console.log('🔄 Criando campanha...', campaignData);

      if (!user || !userId) {
        console.error('❌ Usuário não autenticado');
        console.error('🔍 User:', user);
        console.error('🔍 User ID:', userId);
        console.error('🔍 AuthData completo:', authData);
        throw new Error('Usuário não autenticado. Faça login novamente.');
      }

      console.log('✅ User ID:', userId);

      const newCampaignData = {
        ...campaignData,
        userId: userId,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'campaigns'), newCampaignData);
      console.log('✅ Campanha criada com ID:', docRef.id);

      // ✨ ADICIONAR TODOS OS CLIENTES AUTOMATICAMENTE
      await addClientsToNewCampaign(docRef.id, campaignData);

      return docRef.id;

    } catch (error) {
      console.error('❌ Erro ao criar campanha:', error);
      setError(error.message);
      throw error;
    }
  };

  // ============================================
  // ATUALIZAR CAMPANHA
  // ============================================
  const updateCampaign = async (campaignId, updatedData) => {
    try {
      console.log('🔄 Atualizando campanha:', campaignId);

      if (!userId) {
        throw new Error('Usuário não autenticado');
      }

      const campaignRef = doc(db, 'campaigns', campaignId);
      
      await updateDoc(campaignRef, {
        ...updatedData,
        updated_at: serverTimestamp()
      });

      console.log('✅ Campanha atualizada com sucesso!');

    } catch (error) {
      console.error('❌ Erro ao atualizar campanha:', error);
      setError(error.message);
      throw error;
    }
  };

  // ============================================
  // DELETAR CAMPANHA
  // ============================================
  const deleteCampaign = async (campaignId) => {
    try {
      console.log('🔄 Deletando campanha:', campaignId);

      if (!userId) {
        throw new Error('Usuário não autenticado');
      }

      // Deletar todos os clientes desta campanha
      const clientsQuery = query(
        collection(db, 'clients'),
        where('campaignId', '==', campaignId),
        where('userId', '==', userId)
      );
      
      const clientsSnapshot = await getDocs(clientsQuery);
      const deletePromises = clientsSnapshot.docs.map(doc => 
        deleteDoc(doc.ref)
      );
      await Promise.all(deletePromises);

      // Deletar a campanha
      const campaignRef = doc(db, 'campaigns', campaignId);
      await deleteDoc(campaignRef);

      console.log('✅ Campanha e clientes deletados!');

    } catch (error) {
      console.error('❌ Erro ao deletar campanha:', error);
      setError(error.message);
      throw error;
    }
  };

  return {
    campaigns,
    loading,
    error,
    createCampaign,
    updateCampaign,
    deleteCampaign
  };
};
