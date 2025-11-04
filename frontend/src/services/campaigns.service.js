import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

class CampaignsService {
  constructor() {
    this.collectionName = 'campaigns';
  }

  // Criar nova campanha
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
        updated_at: serverTimestamp()
      };

      console.log('Criando campanha:', newCampaign);

      const docRef = await addDoc(campaignRef, newCampaign);
      
      console.log('Campanha criada com ID:', docRef.id);

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

  // Atualizar campanha existente
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

      console.log('Atualizando campanha:', campaignId, updateData);

      await updateDoc(campaignRef, updateData);
      
      console.log('Campanha atualizada com sucesso!');

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

  // Deletar campanha
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

  // Buscar campanhas do usuário (em tempo real)
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
              created_at: data.created_at?.toDate() || new Date(),
              updated_at: data.updated_at?.toDate() || new Date()
            });
          });
          
          console.log('Campanhas carregadas:', campaigns.length);
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