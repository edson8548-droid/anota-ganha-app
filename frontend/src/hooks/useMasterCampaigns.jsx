import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  getFirestore, collection, addDoc, updateDoc, doc,
  query, where, onSnapshot, serverTimestamp, arrayUnion, getDocs,
} from 'firebase/firestore';
import { useAuthContext } from '../contexts/AuthContext';
import { campaignsService } from '../services/campaigns.service';

// Junta a campanha MESTRE (backend, read-only, viva) com a camada do RCA
// (Firestore rca_campaigns: metas próprias, clientes vinculados) e devolve
// "campanhas sintéticas" no mesmo formato que o Dashboard já usa.
export const useMasterCampaigns = () => {
  const authData = useAuthContext();
  const user = authData?.user || authData?.currentUser || authData;
  const userId = user?.id || user?._id || user?.uid;
  const db = getFirestore();

  const [masters, setMasters] = useState([]);       // do backend (/minhas)
  const [overlays, setOverlays] = useState([]);      // Firestore rca_campaigns
  const [loading, setLoading] = useState(true);
  const creatingRef = useRef(new Set());             // evita criar overlay duplicado

  // --- Carrega as campanhas mestre liberadas (acesso automático) ---
  const refreshMasters = useCallback(async () => {
    if (!userId) { setMasters([]); return []; }
    try {
      const data = await campaignsService.minhasCampanhasMestre();
      setMasters(Array.isArray(data) ? data : []);
      return data || [];
    } catch (err) {
      console.warn('Falha ao carregar campanhas mestre:', err?.message);
      setMasters([]);
      return [];
    }
  }, [userId]);

  useEffect(() => {
    let ativo = true;
    (async () => { await refreshMasters(); if (ativo) setLoading(false); })();
    return () => { ativo = false; };
  }, [refreshMasters]);

  // --- Listener das overlays do RCA (tempo real) ---
  useEffect(() => {
    if (!userId) { setOverlays([]); return; }
    const q = query(collection(db, 'rca_campaigns'), where('userId', '==', userId));
    const unsub = onSnapshot(q,
      (snap) => setOverlays(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => { console.warn('Overlay listener erro:', err?.message); setOverlays([]); }
    );
    return () => unsub();
  }, [userId, db]);

  const overlayByMaster = useMemo(() => {
    const map = {};
    overlays.forEach(o => { if (o.masterId) map[o.masterId] = o; });
    return map;
  }, [overlays]);

  // --- Garante que cada mestre liberada tenha um overlay (para aparecer) ---
  const ensureOverlay = useCallback(async (master) => {
    if (!userId || !master?.id) return null;
    const existing = overlayByMaster[master.id];
    if (existing) return existing.id;
    if (creatingRef.current.has(master.id)) return null; // já criando
    creatingRef.current.add(master.id);
    try {
      // Confere no Firestore (evita duplicar por corrida entre unlock e listener)
      const jaQ = query(
        collection(db, 'rca_campaigns'),
        where('userId', '==', userId),
        where('masterId', '==', master.id),
      );
      const snap = await getDocs(jaQ);
      if (!snap.empty) return snap.docs[0].id;

      const ref = await addDoc(collection(db, 'rca_campaigns'), {
        userId,
        masterId: master.id,
        sharedSlug: master.slug || '',
        nome: master.nome || '',
        metas: {},
        clientIds: [],
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      return ref.id;
    } catch (err) {
      console.warn('Falha ao criar overlay:', err?.message);
      return null;
    } finally {
      creatingRef.current.delete(master.id);
    }
  }, [userId, db, overlayByMaster]);

  useEffect(() => {
    masters.forEach(m => { if (!overlayByMaster[m.id]) ensureOverlay(m); });
  }, [masters, overlayByMaster, ensureOverlay]);

  // --- Monta as campanhas sintéticas (estrutura da mestre + metas do RCA) ---
  const buildIndustries = (master, metas = {}) => {
    const out = {};
    Object.keys(master.industries || {}).forEach(indName => {
      const produtos = master.industries[indName]?.produtos || {};
      const entry = {
        targetValue: Number(metas[indName]) || 0,
        alreadySoldValue: 0, // progresso real é calculado a partir dos clientes
      };
      Object.keys(produtos).forEach(nome => {
        entry[nome] = { positivado: false, valor: 0, ean: produtos[nome]?.ean || '' };
      });
      out[indName] = entry;
    });
    return out;
  };

  const sharedCampaigns = useMemo(() => {
    return masters
      .map(master => {
        const overlay = overlayByMaster[master.id];
        if (!overlay) return null; // ainda criando o overlay
        return {
          id: overlay.id,
          isShared: true,
          masterId: master.id,
          sharedSlug: master.slug || '',
          distribuidora: master.distribuidora || '',
          regulamento: master.regulamento || '',
          descricao: master.descricao || '',
          name: master.nome,
          startDate: master.startDate || '',
          endDate: master.endDate || '',
          status: master.active ? 'active' : 'inactive',
          clientIds: overlay.clientIds || [],
          metas: overlay.metas || {},
          industries: buildIndustries(master, overlay.metas || {}),
        };
      })
      .filter(Boolean);
  }, [masters, overlayByMaster]);

  // --- Ações ---
  const unlock = useCallback(async (code) => {
    const res = await campaignsService.desbloquearCampanha(code); // {acesso, campanha}
    const master = res?.campanha;
    if (!master?.id) throw new Error('Resposta inválida do servidor');
    const overlayId = await ensureOverlay(master);
    await refreshMasters();
    return { master, overlayId };
  }, [ensureOverlay, refreshMasters]);

  const saveMetas = useCallback(async (overlayId, metas) => {
    await updateDoc(doc(db, 'rca_campaigns', overlayId), { metas, updated_at: serverTimestamp() });
  }, [db]);

  const linkClient = useCallback(async (overlayId, clientId) => {
    await updateDoc(doc(db, 'rca_campaigns', overlayId), {
      clientIds: arrayUnion(clientId), updated_at: serverTimestamp(),
    });
  }, [db]);

  // Vincula vários clientes de uma vez (usado ao desbloquear: carteira existente).
  const linkClients = useCallback(async (overlayId, clientIds) => {
    if (!overlayId || !clientIds?.length) return;
    await updateDoc(doc(db, 'rca_campaigns', overlayId), {
      clientIds: arrayUnion(...clientIds), updated_at: serverTimestamp(),
    });
  }, [db]);

  return { sharedCampaigns, masters, loading, unlock, saveMetas, linkClient, linkClients, refreshMasters };
};
