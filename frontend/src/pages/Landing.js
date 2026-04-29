import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { FileSpreadsheet, Sparkles, MessageCircle, BarChart3 } from 'lucide-react';
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

      {/* Stats */}
      <section className="landing-stats">
        <div className="landing-stats-grid">
          <div className="landing-stat">
            <span className="landing-stat-num">1.100+</span>
            <span className="landing-stat-label">Produtos mapeados</span>
          </div>
          <div className="landing-stat">
            <span className="landing-stat-num">95%</span>
            <span className="landing-stat-label">Taxa de acerto médio</span>
          </div>
          <div className="landing-stat">
            <span className="landing-stat-num">3 min</span>
            <span className="landing-stat-label">Por cotação processada</span>
          </div>
          <div className="landing-stat">
            <span className="landing-stat-num">100%</span>
            <span className="landing-stat-label">Focado em RCA</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-features">
        <h2 className="landing-features-title">Ferramentas que trabalham por você</h2>
        <p className="landing-features-sub">Tudo o que um representante comercial precisa, em uma única plataforma.</p>
        <div className="landing-features-grid">
          <div className="landing-feature-card">
            <div className="landing-feature-icon"><FileSpreadsheet size={32} /></div>
            <h3>Cotação Pronta</h3>
            <p>Suba a planilha do cliente e receba a cotação preenchida automaticamente por código de barras ou nome do produto. Menos digitação, mais tempo para vender.</p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon"><Sparkles size={32} /></div>
            <h3>IA para Vender Mais</h3>
            <p>Digite sua ideia e a IA transforma em mensagem profissional para clientes, crédito, gerência ou indústria. Ofertas, negociações e cobranças em segundos.</p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon"><BarChart3 size={32} /></div>
            <h3>Raio-X dos Incentivos</h3>
            <p>Veja clientes positivados, clientes parados e oportunidades para ganhar mais incentivos da indústria — tudo em um só painel.</p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon"><MessageCircle size={32} /></div>
            <h3>Carteira no WhatsApp</h3>
            <p>Monte sua oferta uma vez e envie para todos os seus clientes pelo WhatsApp Web com mensagens personalizadas e fotos dos produtos.</p>
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
