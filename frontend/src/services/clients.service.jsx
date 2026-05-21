import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
// ⭐️ CORREÇÃO: O caminho foi atualizado para apontar para o teu ficheiro
import { db } from '../firebase/config.js';

class ClientsService {
  constructor() {
    this.collectionName = 'clients';
  }

  // Criar novo cliente (Mantido da v2 - Global)
  async createClient(userId, clientData) {
    try {
      if (!userId) {
        throw new Error('ID do usuário não fornecido');
      }

      const clientRef = collection(db, this.collectionName);
      
      const newClient = {
        userId: userId,
        CNPJ: clientData.CNPJ || '',
        CLIENTE: clientData.CLIENTE,
        TELEFONE: clientData.TELEFONE || '',
        EMAIL: clientData.EMAIL || '',
        ENDERECO: clientData.ENDERECO || '',
        CIDADE: clientData.CIDADE,
        ESTADO: clientData.ESTADO || '',
        BAIRRO: clientData.BAIRRO || '',
        CEP: clientData.CEP || '',
        industries: clientData.industries || {}, 
        notes: clientData.notes || '',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };

      console.log('Criando cliente (v3 - Global):', newClient);
      const docRef = await addDoc(clientRef, newClient);
      console.log('Cliente criado com ID:', docRef.id);

      return {
        id: docRef.id,
        ...newClient,
        created_at: new Date(),
        updated_at: new Date()
      };
    } catch (error) {
      console.error('Erro ao criar cliente:', error);
      throw new Error('Erro ao criar cliente: ' + error.message);
    }
  }

  // Atualizar cliente existente (Mantido da v2)
  async updateClient(clientId, clientData) {
    try {
      if (!clientId) {
        throw new Error('ID do cliente não fornecido');
      }

      const clientRef = doc(db, this.collectionName, clientId);
      
      const updateData = {
        CNPJ: clientData.CNPJ || '',
        CLIENTE: clientData.CLIENTE,
        TELEFONE: clientData.TELEFONE || '',
        EMAIL: clientData.EMAIL || '',
        ENDERECO: clientData.ENDERECO || '',
        CIDADE: clientData.CIDADE,
        ESTADO: clientData.ESTADO || '',
        BAIRRO: clientData.BAIRRO || '',
        CEP: clientData.CEP || '',
        industries: clientData.industries || {},
        notes: clientData.notes || '',
        updated_at: serverTimestamp()
      };

      await updateDoc(clientRef, updateData);
      console.log('Cliente atualizado com sucesso!');

      return {
        id: clientId,
        ...updateData,
        updated_at: new Date()
      };
    } catch (error) {
      console.error('Erro ao atualizar cliente:', error);
      throw new Error('Erro ao atualizar cliente: ' + error.message);
    }
  }

  // Deletar cliente (Mantido da v2)
  async deleteClient(clientId) {
    try {
      if (!clientId) {
        throw new Error('ID do cliente não fornecido');
      }

      const clientRef = doc(db, this.collectionName, clientId);
      await deleteDoc(clientRef);
      console.log('Cliente deletado:', clientId);
    } catch (error) {
      console.error('Erro ao deletar cliente:', error);
      throw new Error('Erro ao deletar cliente: ' + error.message);
    }
  }

  // Buscar clientes do usuário (em tempo real - Mantido da v2)
  subscribeToClients(userId, callback) {
    try {
      if (!userId) {
        throw new Error('ID do usuário não fornecido');
      }

      const clientsRef = collection(db, this.collectionName);
      const q = query(clientsRef, where('userId', '==', userId));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const clients = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            clients.push({
              id: doc.id,
              ...data,
              created_at: data.created_at?.toDate() || new Date(),
              updated_at: data.updated_at?.toDate() || new Date()
            });
          });
          
          console.log('Clientes (Globais) carregados:', clients.length);
          callback(clients);
        },
        (error) => {
          console.error('Erro ao buscar clientes:', error);
          callback([]);
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error('Erro ao se inscrever em clientes:', error);
      return () => {};
    }
  }
}

export const clientsService = new ClientsService();