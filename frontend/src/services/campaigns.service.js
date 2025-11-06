// SUBSTITUA: src/services/campaigns.service.js
// VERSÃO V4 - Corrige o caminho de importação do Firebase

import { 
  collection, addDoc, updateDoc, deleteDoc, doc, query, 
  where, onSnapshot, serverTimestamp, arrayUnion 
} from 'firebase/firestore';
// ⭐️ CORREÇÃO: O caminho foi atualizado para apontar para o teu ficheiro
import { db } from '../firebase/config.js'; 

class CampaignsService {
  constructor() {
    this.collectionName = 'campaigns';
  }

  // Criar nova campanha (Mantido da v3)
  async createCampaign(userId, campaignData) {
    try {
      if (!userId) {
        throw new Error('ID do usuário não fornecido');
      }

      const campaignRef = collection(db, this.collectionName);
      
      const newCampaign = {
        userId: userId,
        name: campaignData.name,
        startDate: campaignData.startDate,
        endDate: campaignData.endDate || null,
        status: campaignData.status || 'active',
        industries: campaignData.industries || {},
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        clientIds: [] // Começa com uma lista vazia
      };

      console.log('Criando campanha (v4):', newCampaign);
      const docRef = await addDoc(campaignRef, newCampaign);
      
      return {
        id: docRef.id,
        ...newCampaign,
        created_at: new Date(),
        updated_at: new Date()
      };
    } catch (error) {
      console.error('Erro ao criar campanha:', error);
      throw new Error('Erro ao criar campanha: ' + error.message);
    }
  }

  // Atualizar campanha existente (Mantido da v3)
  async updateCampaign(campaignId, campaignData) {
    try {
      if (!campaignId) {
        throw new Error('ID da campanha não fornecido');
      }

      const campaignRef = doc(db, this.collectionName, campaignId);
      
      const updateData = {
        name: campaignData.name,
        startDate: campaignData.startDate,
        endDate: campaignData.endDate || null,
        status: campaignData.status || 'active',
        industries: campaignData.industries || {},
        updated_at: serverTimestamp()
      };

      await updateDoc(campaignRef, updateData);
      
      return {
        id: campaignId,
        ...updateData,
        updated_at: new Date()
      };
    } catch (error) {
      console.error('Erro ao atualizar campanha:', error);
      throw new Error('Erro ao atualizar campanha: ' + error.message);
    }
  }

  // Ligar Cliente à Campanha (Mantido da v3)
  async linkClientToCampaign(campaignId, clientId) {
    try {
      if (!campaignId || !clientId) {
        throw new Error('ID da campanha ou do cliente não fornecido');
      }
      
      console.log(`[Service] Ligando Cliente ${clientId} à Campanha ${campaignId}`);
      
      const campaignRef = doc(db, this.collectionName, campaignId);
      
      await updateDoc(campaignRef, {
        clientIds: arrayUnion(clientId), 
        updated_at: serverTimestamp()
      });
      
      console.log('✅ Cliente ligado com sucesso!');
      
    } catch (error) {
      console.error('Erro ao ligar cliente:', error);
      throw new Error('Erro ao ligar cliente: ' + error.message);
    }
  }

  // Deletar campanha (Mantido da v3)
  async deleteCampaign(campaignId) {
    try {
      if (!campaignId) {
        throw new Error('ID da campanha não fornecido');
      }
      
      const campaignRef = doc(db, this.collectionName, campaignId);
      await deleteDoc(campaignRef);
      
      console.log('Campanha deletada:', campaignId);
    } catch (error) {
      console.error('Erro ao deletar campanha:', error);
      throw new Error('Erro ao deletar campanha: ' + error.message);
    }
  }

  // Buscar campanhas do usuário (em tempo real - Mantido da v3)
  subscribeToCampaigns(userId, callback) {
    try {
      if (!userId) {
        throw new Error('ID do usuário não fornecido');
      }

      const campaignsRef = collection(db, this.collectionName);
      const q = query(campaignsRef, where('userId', '==', userId));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const campaigns = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            campaigns.push({
              id: doc.id,
              ...data,
              clientIds: data.clientIds || [], 
              created_at: data.created_at?.toDate() || new Date(),
              updated_at: data.updated_at?.toDate() || new Date()
            });
          });
          
          callback(campaigns);
        },
        (error) => {
          console.error('Erro ao buscar campanhas:', error);
          callback([]);
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error('Erro ao se inscrever em campanhas:', error);
      return () => {};
    }
  }
}

export const campaignsService = new CampaignsService();