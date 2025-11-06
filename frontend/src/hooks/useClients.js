// COLE EM: src/hooks/useClients.js
// ✅ VERSÃO v2 (Global): Busca TODOS os clientes do usuário

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
import { useAuthContext } from '../contexts/AuthContext'; 

// ⭐️ CORREÇÃO: O hook não precisa mais do campaignId
export const useClients = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const authData = useAuthContext();
  
  const user = authData?.user || authData?.currentUser || authData;
  const userId = user?.id || user?._id || user?.uid;
  
  const db = getFirestore();

  // ============================================
  // LISTENER EM TEMPO REAL - BUSCAR CLIENTES (GLOBAL)
  // ============================================
  useEffect(() => {
    if (!user || !userId) {
      console.log('⚠️ [useClients] Aguardando autenticação...');
      setClients([]);
      setLoading(false);
      return;
    }

    console.log('🔄 [useClients] Iniciando listener de TODOS os clientes...');
    
    // ⭐️ CORREÇÃO: A query agora busca TODOS os clientes do userId.
    // Removemos o filtro 'if (campaignId)'.
    let q = query(
      collection(db, 'clients'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const clientsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log('✅ [useClients] Clientes (Globais) carregados:', clientsData.length);
        setClients(clientsData);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('❌ [useClients] Erro ao carregar clientes:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    // Limpa o listener ao sair
    return () => unsubscribe();
    
  }, [user, userId, db]); // ⭐️ Removemos o campaignId das dependências

  // ============================================
  // CRIAR CLIENTE (GLOBAL)
  // ============================================
  const createClient = async (clientData) => {
    try {
      console.log('🔄 [useClients] Criando cliente global...', clientData);

      if (!userId) {
        console.error('❌ User ID não encontrado');
        throw new Error('Usuário não autenticado');
      }

      // ⭐️ REMOVIDO: Validação do campaignId
      // if (!clientData.campaignId) {
      //   throw new Error('❌ ID da campanha não fornecido');
      // }

      // Adicionar userId e timestamps
      const newClientData = {
        ...clientData,
        userId: userId,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
        // ⭐️ REMOVIDO: campaignId não é mais salvo aqui
      };

      // Salvar no Firestore
      const docRef = await addDoc(collection(db, 'clients'), newClientData);
      console.log('✅ [useClients] Cliente global criado com ID:', docRef.id);

      // Retorna o ID para o Dashboard poder ligar à campanha
      return docRef.id; 

    } catch (error) {
      console.error('❌ [useClients] Erro ao criar cliente:', error);
      setError(error.message);
      throw error;
    }
  };

  // ============================================
  // ATUALIZAR CLIENTE (Mantido)
  // ============================================
  const updateClient = async (clientId, updatedData) => {
    try {
      console.log('🔄 [useClients] Atualizando cliente:', clientId);

      if (!userId) {
        throw new Error('Usuário não autenticado');
      }

      const clientRef = doc(db, 'clients', clientId);
      
      await updateDoc(clientRef, {
        ...updatedData,
        updated_at: serverTimestamp()
      });

      console.log('✅ [useClients] Cliente atualizado com sucesso!');

    } catch (error) {
      console.error('❌ [useClients] Erro ao atualizar cliente:', error);
      setError(error.message);
      throw error;
    }
  };

  // ============================================
  // DELETAR CLIENTE (Mantido)
  // ============================================
  const deleteClient = async (clientId) => {
    try {
      console.log('🔄 [useClients] Deletando cliente:', clientId);

      if (!userId) {
        throw new Error('Usuário não autenticado');
      }

      const clientRef = doc(db, 'clients', clientId);
      await deleteDoc(clientRef);

      console.log('✅ [useClients] Cliente deletado com sucesso!');

    } catch (error) {
      console.error('❌ [useClients] Erro ao deletar cliente:', error);
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