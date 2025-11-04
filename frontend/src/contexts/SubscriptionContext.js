// COLE EM: src/contexts/SubscriptionContext.js
// Context para gerenciar assinaturas com Mercado Pago

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuthContext } from './AuthContext';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  onSnapshot
} from 'firebase/firestore';

const SubscriptionContext = createContext();

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription deve ser usado dentro de SubscriptionProvider');
  }
  return context;
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
    name: 'Mensal',
    displayName: '📦 Plano Mensal',
    price: 39.00,
    period: 'monthly',
    duration: 'por mês',
    billingCycle: 'Cobrado mensalmente',
    mercadoPagoPreapprovalPlanId: null, // Será preenchido após criar no MP
    limits: {
      campaigns: 999999,
      clients: 999999,
      industries: 999999
    },
    features: [
      'Campanhas ilimitadas',
      'Clientes ilimitados',
      'Indústrias ilimitadas',
      'Suporte completo',
      'Analytics completo',
      'Renovação automática'
    ],
    highlight: false
  },
  annual_installments: {
    id: 'annual_installments',
    name: 'Anual Parcelado',
    displayName: '🚀 Anual Parcelado',
    price: 394.80,
    pricePerMonth: 32.90,
    installments: 12,
    period: 'annual',
    duration: 'por ano',
    billingCycle: '12x de R$ 32,90 no cartão',
    savings: 73.20, // vs mensal (39*12 - 394.80)
    savingsPercent: 15.7,
    mercadoPagoPreapprovalPlanId: null,
    limits: {
      campaigns: 999999,
      clients: 999999,
      industries: 999999
    },
    features: [
      'Campanhas ilimitadas',
      'Clientes ilimitados',
      'Indústrias ilimitadas',
      'Suporte completo',
      'Analytics completo',
      'Renovação automática',
      'Economia de R$ 73,20/ano'
    ],
    highlight: true // Destacar como melhor opção
  },
  annual_upfront: {
    id: 'annual_upfront',
    name: 'Anual à Vista',
    displayName: '💎 Anual à Vista',
    price: 360.00,
    period: 'annual',
    duration: 'por ano',
    billingCycle: 'Pagamento único anual',
    savings: 108.00, // vs mensal (39*12 - 360)
    savingsPercent: 23.1,
    mercadoPagoPreapprovalPlanId: null,
    limits: {
      campaigns: 999999,
      clients: 999999,
      industries: 999999
    },
    features: [
      'Campanhas ilimitadas',
      'Clientes ilimitados',
      'Indústrias ilimitadas',
      'Suporte completo',
      'Analytics completo',
      'Renovação automática',
      'Economia de R$ 108,00/ano',
      '💰 Melhor custo-benefício!'
    ],
    highlight: false
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
          const trialEnd = subData.trialEndsAt?.toDate();
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
      console.log('🎁 Criando trial de 15 dias...');
      
      const now = new Date();
      const trialEnd = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 dias

      const trialData = {
        userId: userId,
        planId: 'trial',
        status: 'trialing',
        trialEndsAt: trialEnd,
        createdAt: now,
        updatedAt: now,
        paymentMethod: null,
        mercadoPagoSubscriptionId: null,
        mercadoPagoCustomerId: null
      };

      const subscriptionRef = doc(db, 'subscriptions', userId);
      await setDoc(subscriptionRef, trialData);

      console.log('✅ Trial criado:', trialData);
      setSubscription(trialData);
      setCurrentPlan(PLANS.trial);
      setTrialEndsAt(trialEnd);
      setIsTrialActive(true);

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
  // CRIAR ASSINATURA PAGA
  // ============================================
  const createPaidSubscription = async (planId, mercadoPagoData) => {
    if (!userId) {
      throw new Error('Usuário não autenticado');
    }

    try {
      console.log('🔄 Criando assinatura paga:', planId);

      const now = new Date();
      const subscriptionRef = doc(db, 'subscriptions', userId);

      const subscriptionData = {
        userId: userId,
        planId: planId,
        status: 'active',
        trialEndsAt: null, // Remover trial
        createdAt: now,
        updatedAt: now,
        mercadoPagoSubscriptionId: mercadoPagoData.subscriptionId,
        mercadoPagoCustomerId: mercadoPagoData.customerId,
        mercadoPagoPaymentId: mercadoPagoData.paymentId,
        paymentMethod: mercadoPagoData.paymentMethod,
        lastPaymentDate: now,
        nextBillingDate: mercadoPagoData.nextBillingDate
      };

      await setDoc(subscriptionRef, subscriptionData);

      console.log('✅ Assinatura paga criada!');
      
      setSubscription(subscriptionData);
      setCurrentPlan(PLANS[planId]);
      setIsTrialActive(false);
      setTrialEndsAt(null);

      return subscriptionData;

    } catch (error) {
      console.error('❌ Erro ao criar assinatura:', error);
      throw error;
    }
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
    createPaidSubscription,
    cancelSubscription,
    PLANS
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};
