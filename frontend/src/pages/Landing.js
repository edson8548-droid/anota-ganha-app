import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { FileSpreadsheet, ClipboardList, MessageCircle, BarChart3, Store } from 'lucide-react';
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
          <img src="/assets/logo/venpro-logo-icon-transparent.png" alt="VenPro" />
          <span className="landing-nav-ven">Ven</span><span className="landing-nav-pro">Pro</span>
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
        <div className="landing-hero-brand">
          <img src="/assets/logo/venpro-logo-icon-transparent.png" alt="VenPro" />
          <div>
            <div className="landing-hero-brand-name"><span>Ven</span><span>Pro</span></div>
            <div className="landing-hero-brand-line">Mais vendas. Mais resultados.</div>
          </div>
        </div>
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
            <div className="landing-feature-icon"><Store size={32} /></div>
            <h3>Vitrine Inteligente</h3>
            <p>Monte ofertas com produtos, fotos e preços, gere um link profissional com o nome da empresa e receba o pedido direto pelo WhatsApp.</p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon"><ClipboardList size={32} /></div>
            <h3>Biblioteca de Prompts</h3>
            <p>Copie modelos de comando para organizar tabelas, montar ofertas, revisar mensagens e usar no ChatGPT, Gemini ou outra IA da sua preferência.</p>
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

      <section className="landing-video-section">
        <div className="landing-video-copy">
          <span className="landing-video-badge"><Store size={16} /> Vitrine Inteligente</span>
          <h2>Monte ofertas com foto e envie o link para o cliente pedir pelo WhatsApp</h2>
          <p>
            Cole sua lista de produtos, revise as fotos, gere uma vitrine profissional e mande o
            link para seus clientes. O pedido volta pronto para o RCA continuar no WhatsApp.
          </p>
          <button className="landing-btn-cta" onClick={handleCTA}>
            Criar minha vitrine
          </button>
        </div>
        <div className="landing-video-frame">
          <video
            src="/videos/venpro-vitrine-inteligente-curto.mp4"
            autoPlay
            muted
            loop
            playsInline
            controls
            preload="metadata"
          />
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
