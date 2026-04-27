import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import './Landing.css';

const Landing = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();

  const handleCTA = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="landing">
      {/* Navbar */}
      <nav className="landing-nav">
        <div className="landing-nav-logo">
          <svg viewBox="0 0 18 18" fill="none">
            <path d="M2 3.5L9 14.5L16 3.5" stroke="#3A85A8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M9 14.5L12.5 8.5" stroke="rgba(58,133,168,0.6)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span className="landing-nav-ven">Ven</span><span className="landing-nav-pro">pro</span>
        </div>
        <div className="landing-nav-actions">
          {user ? (
            <button className="landing-btn-primary" onClick={() => navigate('/dashboard')}>Meu Painel</button>
          ) : (
            <>
              <button className="landing-btn-outline" onClick={() => navigate('/login')}>Entrar</button>
              <button className="landing-btn-primary" onClick={() => navigate('/register')}>Cadastrar</button>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <span className="landing-hero-badge">Ferramentas para Representantes Comerciais</span>
        <h1>
          Venda mais, <span>trabalhe menos</span>
        </h1>
        <p>
          Cotações automáticas, assistente IA especializado em vendas, campanhas de positivação
          e muito mais — tudo em um só lugar, feito para o dia a dia do RCA.
        </p>
        <div className="landing-hero-cta">
          <button className="landing-btn-cta" onClick={handleCTA}>
            Começar grátis
          </button>
          <a
            className="landing-btn-cta-ghost"
            href="https://wa.me/5513997501798?text=Olá,%20quero%20saber%20mais%20sobre%20o%20Venpro"
            target="_blank"
            rel="noopener noreferrer"
          >
            Falar com suporte
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="landing-features">
        <h2 className="landing-features-title">Ferramentas que trabalham por você</h2>
        <p className="landing-features-sub">Tudo o que um representante comercial precisa, em uma única plataforma.</p>
        <div className="landing-features-grid">
          <div className="landing-feature-card">
            <div className="landing-feature-icon">📊</div>
            <h3>Robô de Cotação</h3>
            <p>Suba sua planilha de cotação e receba todos os preços preenchidos automaticamente — por código de barras ou nome do produto.</p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon">🤖</div>
            <h3>Assistente IA</h3>
            <p>Crie textos de oferta, emails profissionais, scripts de negociação e muito mais — especializado em representação comercial.</p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon">🏆</div>
            <h3>Campanhas e Positivação</h3>
            <p>Acompanhe campanhas, monitore positivação de clientes e acompanhe seus resultados de indústria em tempo real.</p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon">📲</div>
            <h3>Disparo WhatsApp</h3>
            <p>Envie ofertas automaticamente para toda sua carteira de clientes com texto e fotos personalizados. (Em breve)</p>
          </div>
        </div>
      </section>

      {/* CTA Bottom */}
      <section className="landing-cta-bottom">
        <h2>Pronto para vender mais?</h2>
        <p>Cadastre-se grátis e comece a usar as ferramentas agora mesmo.</p>
        <button className="landing-btn-cta" onClick={handleCTA}>
          Criar minha conta grátis
        </button>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        &copy; {new Date().getFullYear()} Venpro — Ferramentas para Representantes Comerciais ·{' '}
        <a href="https://wa.me/5513997501798?text=Olá,%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">Suporte WhatsApp</a>
      </footer>
    </div>
  );
};

export default Landing;
