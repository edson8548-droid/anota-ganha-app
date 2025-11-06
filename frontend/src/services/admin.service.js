// CRIE ESTE NOVO FICHEIRO: src/services/admin.service.js
// Este serviço busca DADOS GLOBAIS (todos os utilizadores e assinaturas)

import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config'; // ⭐️ Verificado que este é o caminho correto

class AdminService {
  constructor() {
    this.usersCollection = collection(db, 'users');
    this.subscriptionsCollection = collection(db, 'subscriptions');
  }

  // Buscar TODOS os utilizadores (em tempo real)
  subscribeToAllUsers(callback) {
    try {
      const q = query(this.usersCollection);

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const users = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            users.push({
              id: doc.id,
              ...data,
              created_at: data.created_at?.toDate() || new Date(),
              trial_ends_at: data.trial_ends_at?.toDate() || null
            });
          });
          
          console.log('[AdminService] Todos os Utilizadores carregados:', users.length);
          callback(users);
        },
        (error) => {
          console.error('[AdminService] Erro ao buscar utilizadores:', error);
          callback([]);
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error('[AdminService] Erro ao se inscrever (utilizadores):', error);
      return () => {};
    }
  }

  // Buscar TODAS as assinaturas (em tempo real)
  subscribeToAllSubscriptions(callback) {
    try {
      const q = query(this.subscriptionsCollection);

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const subscriptions = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            subscriptions.push({
              id: doc.id, // O ID da assinatura (é o mesmo que o userId)
              ...data,
              createdAt: data.createdAt?.toDate() || new Date(),
              trialEndsAt: data.trialEndsAt?.toDate() || null,
              lastPaymentDate: data.lastPaymentDate?.toDate() || null,
              nextBillingDate: data.nextBillingDate?.toDate() || null
            });
          });
          
          console.log('[AdminService] Todas as Assinaturas carregadas:', subscriptions.length);
          callback(subscriptions);
        },
        (error) => {
          console.error('[AdminService] Erro ao buscar assinaturas:', error);
          callback([]);
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error('[AdminService] Erro ao se inscrever (assinaturas):', error);
      return () => {};
    }
  }
}

export const adminService = new AdminService();