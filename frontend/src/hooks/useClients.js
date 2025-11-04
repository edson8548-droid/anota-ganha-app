// COLE EM: src/hooks/useClients.js
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
  serverTimestamp
} from 'firebase/firestore';
import { useAuthContext } from '../contexts/AuthContext'; // ✅ useAuthContext

export const useClients = (campaignId = null) => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const authData = useAuthContext();
  
  // Tentar pegar o user de diferentes formas
  const user = authData?.user || authData?.currentUser || authData;
  const userId = user?.id || user?._id || user?.uid;
  
  const db = getFirestore();

  // ============================================
  // LISTENER EM TEMPO REAL - BUSCAR CLIENTES
  // ============================================
  useEffect(() => {
    if (!user || !userId) {
      console.log('⚠️ Aguardando autenticação...');
      setClients([]);
      setLoading(false);
      return;
    }

    console.log('🔄 Iniciando listener de clientes...');
    
    // Query base: sempre filtrar por userId
    let q = query(
      collection(db, 'clients'),
      where('userId', '==', userId)
    );

    // Se tem campaignId, filtrar também por campanha
    if (campaignId) {
      console.log('📋 Filtrando por campanha:', campaignId);
      q = query(
        collection(db, 'clients'),
        where('userId', '==', userId),
        where('campaignId', '==', campaignId)
      );
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const clientsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log('✅ Clientes carregados:', clientsData.length);
        setClients(clientsData);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('❌ Erro ao carregar clientes:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, userId, campaignId, db]);

  // ============================================
  // CRIAR CLIENTE
  // ============================================
  const createClient = async (clientData) => {
    try {
      console.log('🔄 Criando cliente...', clientData);

      if (!userId) {
        console.error('❌ User ID não encontrado');
        throw new Error('Usuário não autenticado');
      }

      // ⚠️ VALIDAÇÃO OBRIGATÓRIA: campaignId deve existir
      if (!clientData.campaignId) {
        throw new Error('❌ ID da campanha não fornecido');
      }

      // Adicionar userId e timestamps
      const newClientData = {
        ...clientData,
        userId: userId,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };

      // Salvar no Firestore
      const docRef = await addDoc(collection(db, 'clients'), newClientData);
      console.log('✅ Cliente criado com ID:', docRef.id);

      return docRef.id;

    } catch (error) {
      console.error('❌ Erro ao criar cliente:', error);
      setError(error.message);
      throw error;
    }
  };

  // ============================================
  // ATUALIZAR CLIENTE
  // ============================================
  const updateClient = async (clientId, updatedData) => {
    try {
      console.log('🔄 Atualizando cliente:', clientId);

      if (!userId) {
        throw new Error('Usuário não autenticado');
      }

      const clientRef = doc(db, 'clients', clientId);
      
      await updateDoc(clientRef, {
        ...updatedData,
        updated_at: serverTimestamp()
      });

      console.log('✅ Cliente atualizado com sucesso!');

    } catch (error) {
      console.error('❌ Erro ao atualizar cliente:', error);
      setError(error.message);
      throw error;
    }
  };

  // ============================================
  // DELETAR CLIENTE
  // ============================================
  const deleteClient = async (clientId) => {
    try {
      console.log('🔄 Deletando cliente:', clientId);

      if (!userId) {
        throw new Error('Usuário não autenticado');
      }

      const clientRef = doc(db, 'clients', clientId);
      await deleteDoc(clientRef);

      console.log('✅ Cliente deletado com sucesso!');

    } catch (error) {
      console.error('❌ Erro ao deletar cliente:', error);
      setError(error.message);
      throw error;
    }
  };

  return {
    clients,
    loading,
    error,
    createClient,
    updateClient,
    deleteClient
  };
};