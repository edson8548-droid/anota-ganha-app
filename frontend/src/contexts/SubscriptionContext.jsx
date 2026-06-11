// COLE EM: src/contexts/SubscriptionContext.js
// Context para gerenciar assinaturas do Venpro

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuthContext } from './AuthContext';
import { 
  getFirestore, 
  doc, 
  updateDoc,
  onSnapshot
} from 'firebase/firestore';
import { ensureTrialSubscription } from '../services/api';

const SubscriptionContext = createContext();

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription deve ser usado dentro de SubscriptionProvider');
  }
  return context;
};

const normalizeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// ============================================
// PLANOS DISPONÍVEIS
// ============================================
export const PLANS = {
  trial: {
    id: 'trial',
    name: 'Trial',
    displayName: '🎁 Trial Gratuito',
    price: 0,
    period: 'trial',
    duration: '15 dias',
    limits: {
      campaigns: 999999,
      clients: 999999,
      industries: 999999
    },
    features: [
      '15 dias grátis',
      'Campanhas ilimitadas',
      'Clientes ilimitados',
      'Indústrias ilimitadas',
      'Suporte completo',
      'Analytics completo'
    ],
    highlight: false
  },
  monthly: {
    id: 'monthly',
    name: 'Venpro',
    displayName: 'Venpro',
    price: 139.90,
    period: 'monthly',
    duration: 'por mês',
    billingCycle: 'Pagamento mensal via Asaas.',
    limits: {
      campaigns: 999999,
      clients: 999999,
      industries: 999999
    },
    features: [
      'Cotação Pronta — planilha preenchida automática',
      'Carteira no WhatsApp — envio em massa',
      'Prompts Prontos para RCA',
      'Extensão Cotatudo Automático',
      'Raio-X dos Incentivos',
      'Suporte via WhatsApp',
    ],
    highlight: true
  }
};

export const SubscriptionProvider = ({ children }) => {
  const authData = useAuthContext();
  const user = authData?.user;
  const userId = user?.id || user?._id || user?.uid;
  
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trialEndsAt, setTrialEndsAt] = useState(null);
  const [isTrialActive, setIsTrialActive] = useState(false);
  const [currentPlan, setCurrentPlan] = useState(null);

  const db = getFirestore();

  // ============================================
  // CARREGAR ASSINATURA DO USUÁRIO
  // ============================================
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    console.log('🔄 Carregando assinatura do usuário:', userId);

    const subscriptionRef = doc(db, 'subscriptions', userId);

    const unsubscribe = onSnapshot(
      subscriptionRef,
      async (docSnap) => {
        if (docSnap.exists()) {
          const subData = docSnap.data();
          console.log('✅ Assinatura encontrada:', subData);
          
          // Verificar trial
          const now = new Date();
          const trialEnd = normalizeDate(subData.trialEndsAt);
          const isTrial = trialEnd && now < trialEnd && subData.status === 'trialing';
          
          // Pegar plano atual
          const plan = PLANS[subData.planId] || PLANS.trial;
          
          setSubscription(subData);
          setCurrentPlan(plan);
          setTrialEndsAt(trialEnd);
          setIsTrialActive(isTrial);
          
          if (isTrial) {
            const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
            console.log(`🎁 Trial ativo! ${daysLeft} dias restantes`);
          }

          // Verificar se trial expirou
          if (subData.status === 'trialing' && trialEnd && now > trialEnd) {
            console.log('⚠️ Trial expirado! Atualizando status...');
            await updateDoc(subscriptionRef, {
              status: 'trial_expired',
              updatedAt: now
            });
          }

        } else {
          console.log('ℹ️ Sem assinatura - criando trial...');
          await createTrialSubscription();
        }
        setLoading(false);
      },
      (error) => {
        console.error('❌ Erro ao carregar assinatura:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, db]);

  // ============================================
  // CRIAR ASSINATURA TRIAL (15 DIAS)
  // ============================================
  const createTrialSubscription = async () => {
    if (!userId) return;

    try {
      console.log('🎁 Solicitando trial no backend...');
      const response = await ensureTrialSubscription();
      const trialData = response.data?.subscription || {};
      const trialEnd = normalizeDate(trialData.trialEndsAt);

      console.log('✅ Trial criado:', trialData);
      setSubscription(trialData);
      setCurrentPlan(PLANS.trial);
      setTrialEndsAt(trialEnd);
      setIsTrialActive(Boolean(trialEnd && trialEnd > new Date()));

    } catch (error) {
      console.error('❌ Erro ao criar trial:', error);
    }
  };

  // ============================================
  // VERIFICAR LIMITES
  // ============================================
  const checkLimit = (resource, currentCount) => {
    if (!currentPlan) return { allowed: true, limit: 999999 };

    const limit = currentPlan.limits[resource];
    const allowed = currentCount < limit;

    return {
      allowed,
      limit,
      current: currentCount,
      remaining: Math.max(0, limit - currentCount)
    };
  };

  const canCreateCampaign = (currentCount) => {
    return checkLimit('campaigns', currentCount);
  };

  const canAddClient = (currentCount) => {
    return checkLimit('clients', currentCount);
  };

  const canAddIndustry = (currentCount) => {
    return checkLimit('industries', currentCount);
  };

  // ============================================
  // CANCELAR ASSINATURA
  // ============================================
  const cancelSubscription = async () => {
    if (!userId) return;

    try {
      console.log('🔄 Cancelando assinatura...');

      const subscriptionRef = doc(db, 'subscriptions', userId);
      
      await updateDoc(subscriptionRef, {
        status: 'canceled',
        canceledAt: new Date(),
        updatedAt: new Date()
      });

      console.log('✅ Assinatura cancelada!');

    } catch (error) {
      console.error('❌ Erro ao cancelar assinatura:', error);
      throw error;
    }
  };

  const value = {
    subscription,
    currentPlan,
    loading,
    isTrialActive,
    trialEndsAt,
    checkLimit,
    canCreateCampaign,
    canAddClient,
    canAddIndustry,
    cancelSubscription,
    PLANS
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};
