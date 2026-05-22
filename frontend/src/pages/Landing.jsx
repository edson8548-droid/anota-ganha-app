import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  ClipboardList,
  FileSpreadsheet,
  MessageCircle,
  Send,
  Sparkles,
  Store
} from 'lucide-react';
import './Landing.css';

const rcaSlides = [
  {
    step: '01',
    icon: FileSpreadsheet,
    title: 'Receba a lista do cliente',
    text: 'Pegue a planilha, PDF ou lista de produtos do mercado e suba na Cotação Pronta para reduzir digitação e evitar preço errado.',
    action: 'Abrir Cotação Pronta',
    message: 'Me envie sua lista de compras ou cotação. Eu retorno com os preços organizados e as melhores opções para fechar seu pedido.'
  },
  {
    step: '02',
    icon: Store,
    title: 'Monte uma vitrine de ofertas',
    text: 'Escolha os itens com maior giro, coloque preço e foto, gere o link da vitrine e mande para o cliente pedir pelo WhatsApp.',
    action: 'Criar Vitrine',
    message: 'Separei uma vitrine com ofertas para sua loja. Acesse o link, escolha os itens e me chame aqui para finalizar o pedido.'
  },
  {
    step: '03',
    icon: MessageCircle,
    title: 'Divulgue no WhatsApp',
    text: 'Use uma mensagem curta, com oferta clara e chamada para resposta. Envie primeiro para clientes parados e depois para a carteira ativa.',
    action: 'Enviar Divulgação',
    message: 'Bom dia! Tenho condições especiais hoje em itens de alto giro. Quer que eu te envie a lista com fotos e preços?'
  },
  {
    step: '04',
    icon: BarChart3,
    title: 'Acompanhe positivação',
    text: 'Veja quais clientes compraram, quem ainda falta ativar e quais campanhas podem aumentar seu incentivo no mês.',
    action: 'Ver Campanhas',
    message: 'Estou fechando a campanha da semana e consigo montar um pedido enxuto para sua loja não ficar sem produto de giro.'
  },
  {
    step: '05',
    icon: Sparkles,
    title: 'Use IA para vender melhor',
    text: 'Transforme uma lista simples em oferta, argumento de venda, mensagem de recuperação ou roteiro para abordagem de cliente.',
    action: 'Usar IA',
    message: 'Tenho uma sugestão de mix para melhorar seu giro essa semana. Posso te mandar uma opção por categoria?'
  }
];

const Landing = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [activeSlide, setActiveSlide] = useState(0);
  const [copiedSlide, setCopiedSlide] = useState(null);
  const currentSlide = rcaSlides[activeSlide];
  const CurrentIcon = currentSlide.icon;

  const handleCTA = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  };

  const goToSlide = index => {
    setActiveSlide((index + rcaSlides.length) % rcaSlides.length);
    setCopiedSlide(null);
  };

  const copySlideMessage = async () => {
    try {
      await navigator.clipboard.writeText(currentSlide.message);
      setCopiedSlide(activeSlide);
    } catch {
      setCopiedSlide(null);
    }
  };

  return (
    <div className="landing">
      {/* Navbar */}
      <nav className="landing-nav">
        <div className="landing-nav-logo">
          <img src="/assets/logo/venpro-logo-mark-color-transparent.svg" alt="Venpro" />
          <span className="landing-nav-word">Venpro</span>
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
          <img src="/assets/logo/venpro-logo-wordmark-color-transparent.svg" alt="Venpro" />
          <div>
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
            href="https://wa.me/5513996382430?text=Olá,%20quero%20saber%20mais%20sobre%20o%20Venpro"
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
            <h3>Prompts Prontos para RCA</h3>
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

      <section className="landing-rca-guide">
        <div className="landing-rca-heading">
          <span className="landing-video-badge"><Send size={16} /> Roteiro para RCA</span>
          <h2>Use o Venpro como uma rotina diária de venda</h2>
          <p>Um passo a passo simples para transformar cotação, vitrine, WhatsApp e campanhas em pedido fechado.</p>
        </div>

        <div className="landing-rca-slider" aria-live="polite">
          <button
            className="landing-rca-arrow"
            type="button"
            onClick={() => goToSlide(activeSlide - 1)}
            aria-label="Passo anterior"
            title="Passo anterior"
          >
            <ChevronLeft size={22} />
          </button>

          <article className="landing-rca-slide">
            <div className="landing-rca-slide-top">
              <span className="landing-rca-step">{currentSlide.step}</span>
              <div className="landing-rca-icon"><CurrentIcon size={28} /></div>
            </div>
            <h3>{currentSlide.title}</h3>
            <p>{currentSlide.text}</p>
            <div className="landing-rca-message">
              <span>Mensagem pronta</span>
              <p>{currentSlide.message}</p>
              <button type="button" onClick={copySlideMessage}>
                <Clipboard size={16} />
                {copiedSlide === activeSlide ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <button className="landing-btn-cta" type="button" onClick={handleCTA}>
              {currentSlide.action}
            </button>
          </article>

          <button
            className="landing-rca-arrow"
            type="button"
            onClick={() => goToSlide(activeSlide + 1)}
            aria-label="Próximo passo"
            title="Próximo passo"
          >
            <ChevronRight size={22} />
          </button>
        </div>

        <div className="landing-rca-dots" role="tablist" aria-label="Passos do roteiro">
          {rcaSlides.map((slide, index) => (
            <button
              key={slide.step}
              type="button"
              className={index === activeSlide ? 'active' : ''}
              onClick={() => goToSlide(index)}
              aria-label={`Ver passo ${slide.step}`}
            />
          ))}
        </div>
      </section>

      <section className="landing-video-section">
        <div className="landing-video-copy">
          <span className="landing-video-badge"><Store size={16} /> Veja o Venpro em ação</span>
          <h2>Cotação, vitrine e WhatsApp trabalhando juntos</h2>
          <p>
            Suba a tabela de preços, receba a cotação preenchida, monte ofertas com imagens e
            envie para o cliente pelo WhatsApp em poucos minutos.
          </p>
          <button className="landing-btn-cta" onClick={handleCTA}>
            Testar o Venpro grátis
          </button>
        </div>
        <div className="landing-video-frame demo-square">
          <video
            src="/videos/venpro-demo-ferramentas-whatsapp-instagram.mp4"
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
        <a href="https://wa.me/5513996382430?text=Olá,%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">Suporte WhatsApp</a>
      </footer>
    </div>
  );
};

export default Landing;
