import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  ClipboardList,
  Check,
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
    title: 'Use prompts para vender melhor',
    text: 'Copie comandos prontos para transformar lista simples em oferta, argumento de venda, mensagem de recuperação ou roteiro de abordagem.',
    action: 'Copiar prompt',
    message: 'Tenho uma sugestão de mix para melhorar seu giro essa semana. Posso te mandar uma opção por categoria?'
  }
];

const productShowcases = [
  {
    title: 'Cotação Pronta',
    eyebrow: 'Tabela + lista do cliente',
    image: '/assets/marketing/venpro-slide2-cotacao-pronta.png',
    alt: 'Tela da Cotação Pronta no Venpro',
    text: 'O representante sobe a tabela de preço, carrega a lista do cliente e recebe os itens encontrados para conferir antes de baixar a cotação.',
    points: ['Busca por EAN e descrição', 'Preço ajustável por item', 'Arquivo pronto para revisar']
  },
  {
    title: 'Vitrine Inteligente',
    eyebrow: 'Oferta com foto, preço e link',
    image: '/assets/screenshots/pedido-whatsapp-vitrine-2.jpg',
    alt: 'Tela da Vitrine Inteligente no Venpro',
    text: 'Você monta uma vitrine com produtos, fotos, nomes e preços. O Venpro gera o link pronto para enviar ao cliente pelo WhatsApp.',
    points: ['Cliente recebe o link da vitrine', 'Escolhe itens e quantidades', 'Pedido volta no WhatsApp'],
    kind: 'vitrineFlow'
  },
  {
    title: 'Raio-X dos Incentivos',
    eyebrow: 'Quem chamar primeiro',
    image: '/assets/marketing/venpro-print-raiox.png',
    alt: 'Painel Raio-X dos Clientes no Venpro',
    text: 'O painel ajuda a enxergar clientes parados, positivação e oportunidades de campanha para priorizar a carteira com mais clareza.',
    points: ['Clientes parados', 'Taxa de positivação', 'Lista de ataque']
  },
  {
    title: 'Carteira no WhatsApp',
    eyebrow: 'Disparo organizado',
    image: '/assets/screenshots/venpro-whatsapp-disparo-progresso.jpg',
    alt: 'Disparo de oferta pelo WhatsApp com Venpro',
    text: 'Monte a mensagem uma vez, selecione contatos e envie ofertas pelo WhatsApp Web com acompanhamento do progresso.',
    points: ['Mensagem personalizada', 'Fotos da oferta', 'Controle de envio']
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
          <img src="/assets/logo/venpro-logo-mark-exato-colorido.svg" alt="" />
          <span>Venpro</span>
        </div>
        <div className="landing-nav-links">
          <a href="#recursos">Recursos</a>
          <a href="#prints">Prints</a>
          <a href="#plano">Plano</a>
          <a href="#avaliacoes">Avaliações</a>
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
          <img src="/assets/logo/venpro-logo-mark-exato-colorido.svg" alt="" />
          <div>
            <div className="landing-hero-brand-name">Venpro</div>
            <div className="landing-hero-brand-line">Mais vendas. Mais resultados.</div>
          </div>
        </div>
        <span className="landing-hero-badge">Ferramentas para Representantes Comerciais</span>
        <h1>
          Venda mais, <span>trabalhe menos</span>
        </h1>
        <p>
          Cotações automáticas, prompts prontos para vender melhor, campanhas de positivação
          e vitrine de ofertas — tudo em um só lugar, feito para o dia a dia do RCA.
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
      <section className="landing-features" id="recursos">
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
            <p>Copie modelos de comando para organizar tabelas, montar ofertas, revisar mensagens e usar no ChatGPT ou outra IA da sua preferência.</p>
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

      <section className="landing-showcase" id="prints">
        <div className="landing-showcase-heading">
          <span className="landing-video-badge"><ClipboardList size={16} /> Prints das ferramentas</span>
          <h2>Veja como cada função entra na rotina do RCA</h2>
          <p>Não é só promessa: a página mostra o que o representante usa no dia a dia para cotar, ofertar, acompanhar clientes e chamar a carteira.</p>
        </div>

        <div className="landing-showcase-list">
          {productShowcases.map((item, index) => (
            <article className="landing-showcase-item" key={item.title}>
              <div className="landing-showcase-copy">
                <span>{item.eyebrow}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <ul>
                  {item.points.map(point => (
                    <li key={point}><Check size={16} /> {point}</li>
                  ))}
                </ul>
              </div>
              {item.kind === 'vitrineFlow' ? (
                <div className="landing-vitrine-flow" aria-label="Fluxo da Vitrine Inteligente: cliente abre o link e pedido volta no WhatsApp">
                  <div className="landing-client-link-print">
                    <div className="client-link-url">venpro.com.br/oferta/ofertas-da-semana</div>
                    <div className="client-link-header">
                      <div className="client-link-logo">V</div>
                      <div>
                        <strong>Ofertas de quinta feira</strong>
                        <span>Spani Atacadista · 12 produtos</span>
                      </div>
                    </div>
                    <div className="client-link-search">Buscar produto...</div>
                    <div className="client-link-products">
                      <div className="client-link-product">
                        <div className="client-link-photo">CAFÉ</div>
                        <div>
                          <strong>Café Fort 500g Almofada</strong>
                          <span>Caixa: R$ 219,54</span>
                        </div>
                        <div className="client-link-qty">- 2 +</div>
                      </div>
                      <div className="client-link-product">
                        <div className="client-link-photo green">SARD</div>
                        <div>
                          <strong>Sardinha Pescador 125g</strong>
                          <span>Caixa: R$ 237,06</span>
                        </div>
                        <div className="client-link-qty">- 1 +</div>
                      </div>
                    </div>
                    <div className="client-link-footer">
                      <span>Total: R$ 952,40</span>
                      <button type="button">Enviar pedido pelo WhatsApp</button>
                    </div>
                  </div>
                  <div className="landing-vitrine-order-print">
                    <img src={item.image} alt={item.alt} />
                  </div>
                </div>
              ) : (
                <div className={`landing-showcase-media media-${index + 1}`}>
                  <img src={item.image} alt={item.alt} />
                </div>
              )}
            </article>
          ))}

          <article className="landing-showcase-item landing-showcase-prompt">
            <div className="landing-showcase-copy">
              <span>Comandos prontos</span>
              <h3>Prompts para vender melhor</h3>
              <p>Modelos prontos para transformar tabela, oferta e mensagem em abordagem mais clara para o cliente.</p>
              <ul>
                <li><Check size={16} /> Mensagem de recuperação</li>
                <li><Check size={16} /> Argumento por categoria</li>
                <li><Check size={16} /> Roteiro para campanha</li>
              </ul>
            </div>
            <div className="landing-prompt-preview" aria-label="Exemplo de prompt pronto para RCA">
              <div className="landing-prompt-header">
                <span>Prompt pronto</span>
                <strong>RCA</strong>
              </div>
              <p>
                Monte uma mensagem curta para cliente parado há 21 dias, usando oferta de alto giro,
                tom profissional e chamada para responder no WhatsApp.
              </p>
              <button type="button" onClick={handleCTA}>Copiar prompt</button>
            </div>
          </article>
        </div>
      </section>

      <section className="landing-proof" id="avaliacoes">
        <div className="landing-proof-heading">
          <span className="landing-video-badge"><Check size={16} /> Transparência</span>
          <h2>Somos novos, e queremos mostrar avaliações reais.</h2>
          <p>O Venpro está em lançamento. Em vez de inventar depoimentos, vamos publicar aqui comentários de representantes que testarem a ferramenta.</p>
        </div>

        <div className="landing-proof-grid">
          <div className="landing-proof-slot">
            <strong>Aguardando o primeiro depoimento real.</strong>
            <span>Vaga aberta</span>
          </div>
          <div className="landing-proof-slot">
            <strong>Aguardando o segundo depoimento real.</strong>
            <span>Vaga aberta</span>
          </div>
          <div className="landing-proof-slot">
            <strong>Aguardando o terceiro depoimento real.</strong>
            <span>Vaga aberta</span>
          </div>
        </div>

        <div className="landing-proof-banner">
          <div>
            <h3>Testou o Venpro?</h3>
            <p>Use os 15 dias grátis. Se ajudar na rotina, envie sua avaliação e ela poderá aparecer aqui com seu nome e cidade.</p>
          </div>
          <button className="landing-btn-cta" onClick={() => navigate('/register')}>
            Experimentar grátis
          </button>
        </div>
      </section>

      <section className="landing-pricing" id="plano">
        <div className="landing-pricing-heading">
          <span className="landing-video-badge"><Check size={16} /> Plano Venpro</span>
          <h2>Comece grátis. Assine quando fizer sentido.</h2>
          <p>Uma assinatura para acessar as ferramentas principais da rotina do representante comercial.</p>
        </div>

        <div className="landing-price-card">
          <div className="landing-price-tag">Preço de lançamento</div>
          <h3>Plano Mensal</h3>
          <div className="landing-price-before">Plano normal <span>R$ 139,90</span> por</div>
          <div className="landing-price-value">
            <small>R$</small>
            <strong>69</strong>
            <span>,90</span>
          </div>
          <p className="landing-price-period">por mês, recorrente até cancelar</p>
          <ul className="landing-price-list">
            <li><Check size={17} /> Cotação Pronta ilimitada</li>
            <li><Check size={17} /> Carteira no WhatsApp</li>
            <li><Check size={17} /> Vitrine Inteligente com link da empresa</li>
            <li><Check size={17} /> Prompts Prontos para RCA</li>
            <li><Check size={17} /> Gestão de clientes ilimitada</li>
            <li><Check size={17} /> Suporte via WhatsApp</li>
          </ul>
          <button className="landing-btn-cta" onClick={() => navigate('/register')}>
            Começar 15 dias grátis
          </button>
          <p className="landing-price-note">Sem cartão de crédito no teste. Cancele quando quiser.</p>
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
