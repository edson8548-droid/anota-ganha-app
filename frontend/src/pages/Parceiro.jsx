import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgePercent, Copy, ExternalLink, Handshake, Users, WalletCards } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthContext } from '../contexts/AuthContext';
import api from '../services/api';
import { buildPartnerSignupLink, getPartnerConfig } from '../utils/partnerProgram';
import './Parceiro.css';

const copyText = async (value, successMessage) => {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
  } catch {
    toast.warning('Nao consegui copiar automaticamente.');
  }
};

const Parceiro = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [referralsData, setReferralsData] = useState(null);
  const [referralsLoading, setReferralsLoading] = useState(false);
  const partner = getPartnerConfig(user);

  const signupLink = useMemo(() => {
    return partner ? buildPartnerSignupLink(partner.code) : '';
  }, [partner]);

  useEffect(() => {
    if (!partner) return;
    let mounted = true;
    setReferralsLoading(true);
    api.get('/users/partner/referrals')
      .then((response) => {
        if (mounted) setReferralsData(response.data);
      })
      .catch((error) => {
        console.error('[Parceiro] Erro ao carregar indicados:', error);
        toast.warning('Nao consegui carregar seus indicados agora.');
      })
      .finally(() => {
        if (mounted) setReferralsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [partner]);

  if (!partner) {
    return (
      <div className="partner-page">
        <main className="partner-denied">
          <img className="partner-logo" src="/assets/logo/venpro-logo-mark-exato-colorido.svg?v=20260523-2" alt="" />
          <h1>Acesso restrito</h1>
          <p>Esta area aparece apenas para RCAs parceiros cadastrados no programa Venpro.</p>
          <button type="button" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={18} /> Voltar ao painel
          </button>
        </main>
      </div>
    );
  }

  const whatsappMessage = [
    'Estou usando o Venpro para transformar tabela de fornecedor em cotacao pronta.',
    'Meu codigo de parceiro para entrar no Venpro:',
    partner.code,
    '',
    signupLink
  ].join('\n');

  const handleCopyMessage = async () => {
    await copyText(whatsappMessage, 'Mensagem copiada.');
    setCopiedMessage(true);
  };

  return (
    <div className="partner-page">
      <header className="partner-header">
        <button type="button" className="partner-back" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={18} /> Painel
        </button>
        <div className="partner-brand">
          <img src="/assets/logo/venpro-logo-mark-exato-colorido.svg?v=20260523-2" alt="" />
          <span>Venpro</span>
        </div>
      </header>

      <main className="partner-main">
        <section className="partner-hero">
          <div>
            <span className="partner-kicker">Programa Parceiro</span>
            <h1>{partner.name}</h1>
            <p>Use este painel para divulgar seu codigo, copiar o link de cadastro e acompanhar a regra inicial da parceria.</p>
          </div>
          <div className="partner-status">
            <Handshake size={22} />
            <span>{partner.status}</span>
          </div>
        </section>

        <section className="partner-grid">
          <article className="partner-code-panel">
            <span className="partner-label">Codigo do parceiro</span>
            <strong>{partner.code}</strong>
            <p>Quem entrar pelo link ou informar este codigo fica vinculado ao parceiro no cadastro.</p>
            <div className="partner-actions">
              <button type="button" onClick={() => copyText(partner.code, 'Codigo copiado.')}>
                <Copy size={17} /> Copiar codigo
              </button>
              <button type="button" onClick={() => copyText(signupLink, 'Link copiado.')}>
                <ExternalLink size={17} /> Copiar link
              </button>
            </div>
          </article>

          <article className="partner-link-panel">
            <span className="partner-label">Link para enviar</span>
            <div className="partner-link">{signupLink}</div>
            <button type="button" onClick={handleCopyMessage}>
              <Copy size={17} /> Copiar texto para WhatsApp
            </button>
            {copiedMessage && <small>Agora cole no WhatsApp ou no grupo do RCA.</small>}
          </article>
        </section>

        <section className="partner-metrics">
          <article>
            <WalletCards size={24} />
            <span>Comissao</span>
            <strong>{partner.commissionLabel}</strong>
          </article>
          <article>
            <BadgePercent size={24} />
            <span>Cupom</span>
            <strong>{partner.discountLabel}</strong>
          </article>
          <article>
            <Users size={24} />
            <span>Assinando</span>
            <strong>{referralsData?.metrics?.activeSubscriptions ?? 0}</strong>
          </article>
        </section>

        <section className="partner-referrals">
          <div className="partner-referrals-header">
            <div>
              <h2>Indicados</h2>
              <p>Por privacidade, esta lista mostra somente nome e status da assinatura.</p>
            </div>
            <strong>{referralsData?.metrics?.totalReferrals ?? 0} cadastro(s)</strong>
          </div>

          {referralsLoading ? (
            <div className="partner-referral-empty">Carregando indicados...</div>
          ) : referralsData?.referrals?.length ? (
            <div className="partner-referral-list">
              {referralsData.referrals.map((item, index) => (
                <div className="partner-referral-row" key={`${item.name}-${index}`}>
                  <strong>{item.name}</strong>
                  <span className={item.status === 'active' ? 'active' : ''}>{item.statusLabel}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="partner-referral-empty">Nenhum indicado registrado ainda.</div>
          )}
        </section>

        <section className="partner-rules">
          <div>
            <h2>Como vai ficar gravado</h2>
            <p>No cadastro do novo usuario, o Venpro salva `referralCode` e `referredByCode` com o codigo do parceiro.</p>
          </div>
          <div className="partner-rule-list">
            <span>Codigo: {partner.code}</span>
            <span>Parceiro: {partner.name}</span>
            <span>Comissao combinada: R$ 40 por mes enquanto a assinatura estiver ativa</span>
            <span>Status de pagamento: conferencia manual nesta primeira fase</span>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Parceiro;
