import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}

function readText(path) {
  return readFileSync(join(root, path), 'utf8');
}

function assertFilesExist(baseDir, files) {
  for (const file of files) {
    assert.equal(typeof file, 'string', `referencia invalida em ${baseDir}`);
    assert.ok(existsSync(join(root, baseDir, file)), `${baseDir}/${file} nao existe`);
  }
}

async function createContentDom(html, url) {
  const { JSDOM } = await import(pathToFileURL(join(root, 'frontend/node_modules/jsdom/lib/api.js')).href);
  const dom = new JSDOM(html, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.chrome = {
    runtime: {
      onMessage: { addListener() {} },
      getURL(path) { return path; },
    },
  };
  window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
  window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { width: 120, height: 24, top: 0, left: 0, right: 120, bottom: 24 };
  };
  if (!window.CSS) window.CSS = {};
  if (!window.CSS.escape) {
    window.CSS.escape = value => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }
  if (!window.InputEvent) window.InputEvent = window.Event;
  window.document.execCommand = () => false;
  window.eval(readText('chrome-extension/content.js'));
  return dom;
}

describe('extensoes Chrome', () => {
  it('extracao generica nao confunde codigo interno curto com EAN', async () => {
    const dom = await createContentDom(`
      <table>
        <thead><tr><th>Codigo</th><th>Produto</th><th>Preco</th></tr></thead>
        <tbody><tr><td>12345678</td><td>Produto sem EAN</td><td><input /></td></tr></tbody>
      </table>
    `, 'https://fornecedor.exemplo.com.br/cotacao/1');
    try {
      const items = await dom.window.eval('extractQuotationItems()');
      assert.equal(items.length, 1);
      assert.equal(items[0].ean, null);
    } finally {
      dom.window.close();
    }
  });

  it('extracao generica preserva EAN identificado pelo cabecalho', async () => {
    const dom = await createContentDom(`
      <table>
        <thead><tr><th>Codigo</th><th>EAN</th><th>Produto</th><th>Preco</th></tr></thead>
        <tbody><tr><td>12345678</td><td>7891032016625</td><td>Produto com EAN</td><td><input value="1,70" /></td></tr></tbody>
      </table>
    `, 'https://fornecedor.exemplo.com.br/cotacao/1');
    try {
      const items = await dom.window.eval('extractQuotationItems()');
      assert.equal(items.length, 1);
      assert.equal(items[0].ean, '7891032016625');
      assert.equal(items[0].filled, true);
      assert.equal(items[0].current_price, 1.70);
    } finally {
      dom.window.close();
    }
  });

  it('VR Cotacao ignora coluna A/B/C e diagnostica o unico campo de preco', async () => {
    const dom = await createContentDom(`
      <h1>VR Cotação</h1>
      <table>
        <thead><tr><th>EAN</th><th>Produto</th><th>Preço</th></tr></thead>
        <tbody>
          <tr>
            <td>7891021006071</td>
            <td>CAFE MELITTA 250G TRADICIONAL VACUO</td>
            <td><input name="custo[7891021006071]" type="text" value="11,78" /></td>
          </tr>
        </tbody>
      </table>
    `, 'http://179.0.124.205/php/vrcotacao/cotacao.php');
    try {
      assert.equal(dom.window.eval('detectQuotationSite()'), 'vr-cotacao');
      const items = await dom.window.eval('extractQuotationItems({ empresaColuna: 4 })');
      assert.equal(items.length, 1);
      assert.equal(items[0].ean, '7891021006071');
      assert.equal(items[0].current_price, 11.78);
      assert.match(items[0].price_input_debug, /inputs=1\|pos=0/);
      assert.match(items[0].price_input_debug, /name=custo\[7891021006071\]/);

      const result = await dom.window.eval(`fillQuotationPrices([{
        idx: 0,
        ean: '7891021006071',
        nome: 'CAFE MELITTA 250G TRADICIONAL VACUO',
        price: '11,50'
      }], { empresaColuna: 4 })`);
      assert.equal(result.filled, 1);
      assert.equal(result.failed.length, 0);
      assert.equal(result.diagnostics[0].reason, 'vr_value_confirmed');
      assert.match(result.diagnostics[0].inputDebug, /inputs=1\|pos=0/);
    } finally {
      dom.window.close();
    }
  });

  it('manifest da extensao Cotatudo referencia arquivos existentes', () => {
    const manifest = readJson('chrome-extension/manifest.json');

    assert.equal(manifest.manifest_version, 3);
    assertFilesExist('chrome-extension', [
      manifest.background.service_worker,
      manifest.action?.default_popup || manifest.side_panel?.default_path,
      ...manifest.content_scripts.flatMap(script => script.js || []),
    ]);
    assert.ok(manifest.host_permissions.includes('https://api.venpro.com.br/*'));
    assert.ok(manifest.host_permissions.includes('https://*.venpro.com.br/*'));
    assert.ok(manifest.host_permissions.includes('https://anota-ganha-app.web.app/*'));
    assert.ok(manifest.host_permissions.includes('https://anota-ganha-app.firebaseapp.com/*'));
    assert.match(manifest.description, /Preenchedor de cotações/);
    assert.match(manifest.description, /VR Cotação/);
    assert.match(manifest.description, /RP HUB/);
    assert.match(manifest.description, /Rede de Fornecedores/);
    assert.match(manifest.description, /Infomag Cotação/);
    assert.match(manifest.description, /Intersolid Cotação/);
    assert.match(manifest.description, /Cotação Web SMUS/);
    assert.match(manifest.description, /Catalog Fornecedor/);
    assert.match(manifest.description, /Hipcomerp/);
    assert.match(manifest.description, /Easy Cotação Web/);
    assert.match(manifest.description, /Estância/);
    assert.ok(manifest.host_permissions.includes('https://infomagcotacao.com/*'));
    assert.ok(manifest.host_permissions.includes('https://*.intersolid.com.br/*'));
    assert.ok(manifest.host_permissions.includes('http://cotacaoweb.smus.com.br/*'));
    assert.ok(manifest.host_permissions.includes('https://catalog-32594.bubbleapps.io/*'));
    assert.ok(manifest.host_permissions.includes('https://cotacao.hipcomerp.com.br/*'));
    assert.ok(manifest.host_permissions.includes('http://gepautomacao.dyndns.org/*'));
    assert.ok(manifest.host_permissions.includes('http://cotacao.estanciasupermercados.com.br/*'));
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('http://179.0.124.205/*')),
      'manifest precisa carregar content script no VR Cotacao conhecido'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://fornecedor.rpinfo.com.br/*')),
      'manifest precisa carregar content script no RP HUB'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://rfd.net.br/*')),
      'manifest precisa carregar content script na Rede de Fornecedores'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://*.rfd.net.br/*')),
      'manifest precisa carregar content script em subdominios da Rede de Fornecedores'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://infomagcotacao.com/*')),
      'manifest precisa carregar content script no Infomag Cotacao'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://*.intersolid.com.br/*')),
      'manifest precisa carregar content script na Intersolid Cotacao'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('http://cotacaoweb.smus.com.br/*')),
      'manifest precisa carregar content script na Cotacao Web SMUS'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://catalog-32594.bubbleapps.io/*')),
      'manifest precisa carregar content script no Catalog Fornecedor'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://cotacao.hipcomerp.com.br/*')),
      'manifest precisa carregar content script no Hipcomerp'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('http://gepautomacao.dyndns.org/*')),
      'manifest precisa carregar content script no Easy Cotacao Web'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('http://cotacao.estanciasupermercados.com.br/*')),
      'manifest precisa carregar content script no Estancia'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://*/fornecedores/*/cotacao/*')),
      'manifest precisa carregar content script em rotas genericas de cotacao'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://anota-ganha-app.web.app/*')),
      'manifest precisa carregar venpro-content no endereco antigo do Firebase'
    );
  });

  it('manifest da extensao WhatsApp referencia arquivos existentes', () => {
    const manifest = readJson('chrome-extension-whatsapp/manifest.json');

    assert.equal(manifest.manifest_version, 3);
    assertFilesExist('chrome-extension-whatsapp', [
      manifest.background.service_worker,
      manifest.side_panel.default_path,
      ...manifest.content_scripts.flatMap(script => script.js || []),
    ]);
    assert.ok(manifest.host_permissions.includes('https://web.whatsapp.com/*'));
    assert.ok(manifest.host_permissions.includes('https://api.venpro.com.br/*'));
  });

  it('painel WhatsApp possui os controles usados pelo JavaScript', () => {
    const html = readText('chrome-extension-whatsapp/panel.html');
    const panelJs = readText('chrome-extension-whatsapp/panel.js');
    const ids = [...panelJs.matchAll(/getElementById\('([^']+)'\)/g)].map(match => match[1]);

    for (const id of ids) {
      assert.match(html, new RegExp(`id="${id}"`), `panel.html precisa do id ${id}`);
    }
  });

  it('ZIPs publicos das extensoes existem para download no site', () => {
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.21.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.22.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.23.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.24.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.25.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.26.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.27.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.28.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.29.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.30.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.31.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.32.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.33.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.34.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.35.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.36.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.37.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.38.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.39.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.40.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.41.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.42.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.43.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.44.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.45.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.48.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.49.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.50.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.51.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.52.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.53.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.54.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.55.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.56.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.61.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-preencher-cotacao-1.0.61.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.62.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-preencher-cotacao-1.0.62.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-whatsapp-extension.zip')));
  });

  it('Catalog Fornecedor usa captura isolada para inputs Bubble', () => {
    const contentJs = readText('chrome-extension/content.js');
    assert.match(contentJs, /function getBubbleCatalogEditableControls/);
    assert.match(contentJs, /function buildBubbleCatalogTextRows/);
    assert.match(contentJs, /getBubbleCatalogEditableControls\(document\.body\)/);
    assert.match(contentJs, /input,\s*textarea/);
    assert.match(contentJs, /if \(!meta \|\| \(!meta\.ean && !meta\.nome\)\) return null/);
    assert.match(contentJs, /function findBubbleCatalogFractionTarget/);
    assert.match(contentJs, /async function ensureBubbleCatalogFraction/);
    assert.match(contentJs, /site === 'bubble-catalog-fornecedor'/);
    assert.match(contentJs, /function getBubbleCatalogFractionValue/);
    assert.match(contentJs, /item\.fracionamento/);
    assert.match(contentJs, /\|\| '1'/);
    assert.match(contentJs, /function findBubbleCatalogCurrentRowForItem/);
    assert.match(contentJs, /requireExactEan/);
    assert.match(contentJs, /function bubbleCatalogRowShowsPrice/);
    assert.match(contentJs, /bubbleCatalogRowShowsPrice\(row, item\.price, samePriceLike, item\)/);
  });

  it('Hipcomerp usa fluxo paginado com trava antes de salvar', () => {
    const manifest = readJson('chrome-extension/manifest.json');
    const popupJs = readText('chrome-extension/popup.js');
    const contentJs = readText('chrome-extension/content.js');
    const hipcomBridgeJs = readText('chrome-extension/hipcom-main-world.js');

    assert.equal(manifest.version, '1.0.62');
    assert.ok(
      manifest.content_scripts.some(script => (script.js || []).includes('hipcom-main-world.js') && script.run_at === 'document_start' && script.world === 'MAIN'),
      'Hipcomerp precisa capturar a API antes do Flutter carregar'
    );
    assert.match(popupJs, /'hipcomerp-cotacao': 'Hipcomerp'/);
    assert.match(popupJs, /function isHipcomerpCotacaoUrl/);
    assert.match(popupJs, /async function runHipcomerpApiJob/);
    assert.match(popupJs, /async function ensureHipcomerpMainWorld/);
    assert.match(popupJs, /getHipcomerpApiState/);
    assert.doesNotMatch(popupJs, /refreshHipcomerpPage/);
    assert.match(popupJs, /Não recarreguei a página/);
    assert.match(popupJs, /async function runHipcomerpJob/);
    assert.match(popupJs, /sem preço ficam zerado/);
    assert.match(popupJs, /filled !== pricesToFill\.length/);
    assert.match(popupJs, /Preço encontrado na tabela não entrou no campo da tela\. Não cliquei em salvar\./);
    assert.match(popupJs, /advanceHipcomerp/);
    assert.match(contentJs, /async function loadHipcomerpApiItems/);
    assert.match(contentJs, /async function saveHipcomerpApiPrices/);
    assert.match(contentJs, /const HIPCOMERP_BRIDGE_VERSION = '1\.0\.54'/);
    assert.match(contentJs, /isCurrentHipcomerpBridgeState/);
    assert.doesNotMatch(contentJs, /window\.location\.reload/);
    assert.doesNotMatch(contentJs, /refreshHipcomerpPage/);
    assert.match(contentJs, /function isHipcomerpCotacaoPage/);
    assert.match(contentJs, /function getHipcomerpRows/);
    assert.match(contentJs, /function getHipcomerpPriceCandidates/);
    assert.match(contentJs, /async function advanceHipcomerpPage/);
    assert.match(contentJs, /salvar\\s\+e\\s\+carregar\\s\+mais/);
    assert.match(hipcomBridgeJs, /XMLHttpRequest/);
    assert.match(hipcomBridgeJs, /const BRIDGE_VERSION = '1\.0\.54'/);
    assert.match(hipcomBridgeJs, /venpro:hipcom-api-command/);
    assert.match(hipcomBridgeJs, /cotweb/);
    assert.match(hipcomBridgeJs, /recoverSingleFornecedor/);
    assert.match(hipcomBridgeJs, /recoverCotacaoDetails/);
    assert.match(hipcomBridgeJs, /recoverLojaByProbe/);
    assert.match(hipcomBridgeJs, /recoverBaseUrlFromPerformance/);
    assert.match(hipcomBridgeJs, /recoverAuthFromStorage/);
    assert.match(hipcomBridgeJs, /headers\.fornecedor/);
    assert.match(hipcomBridgeJs, /headers\.loja/);
    assert.match(contentJs, /\/oferta\/itens/);
  });

  it('Hipcomerp carrega itens e grava preços pela API do Flutter', async () => {
    const html = '<body flt-renderer="canvaskit (requested explicitly)"><flutter-view><flt-glass-pane></flt-glass-pane></flutter-view></body>';
    const dom = await createContentDom(html, 'https://cotacao.hipcomerp.com.br/#app/oferta');
    const { window } = dom;
    const savedPayloads = [];
    const apiState = {
      ready: true,
      baseCaptured: true,
      fornecedor: '223',
      loja: '7',
      numeroCotacao: '288',
      limit: 2,
      hasAuth: true,
      bridgeVersion: '1.0.54',
    };

    window.document.addEventListener('venpro:hipcom-api-command', event => {
      const detail = event.detail || {};
      let data = {};
      if (detail.path === '/cotacao/288/itens') {
        const page = Number(detail.body?.numeroPagina ?? 0);
        data = page === 0
          ? {
              quantidadeTotal: 3,
              itens: [
                {
                  id: 61,
                  plu: '30471',
                  descricao: 'APERITIVO CAMPARI 998ML',
                  codigoBarras: '17896010006312',
                  quantidade: 1,
                  quantidadePorCaixa: 12,
                  precoPreenchido: null,
                },
                {
                  id: 62,
                  plu: '902871',
                  descricao: 'APERITIVO TESTE 500ML',
                  codigoBarras: '17891136065205',
                  quantidade: 1,
                  quantidadePorCaixa: 6,
                  precoPreenchido: null,
                },
              ],
            }
          : {
              quantidadeTotal: 3,
              itens: [
                {
                  id: 63,
                  plu: '777',
                  descricao: 'ITEM JA DIGITADO',
                  codigoBarras: '7890000000001',
                  quantidade: 1,
                  quantidadePorCaixa: 1,
                  precoPreenchido: 10,
                },
              ],
            };
      } else if (detail.path === '/oferta/itens') {
        savedPayloads.push(...detail.body);
        data = { ok: true };
      }

      window.document.dispatchEvent(new window.CustomEvent('venpro:hipcom-api-command-result', {
        detail: {
          requestId: detail.requestId,
          ok: true,
          status: 200,
          data,
          state: apiState,
        },
      }));
    });

    window.document.dispatchEvent(new window.CustomEvent('venpro:hipcom-api-captured', {
      detail: {
        state: {
          ready: true,
          baseCaptured: true,
          fornecedor: 'old',
          loja: 'old',
          numeroCotacao: '999',
          limit: 2,
          hasAuth: true,
        },
      },
    }));
    assert.equal(window.eval('getHipcomerpApiState().ready'), false);

    window.document.dispatchEvent(new window.CustomEvent('venpro:hipcom-api-captured', {
      detail: { state: apiState },
    }));

    const state = window.eval('getHipcomerpApiState()');
    assert.equal(state.ready, true);
    assert.equal(state.usesCanvasKit, true);

    const loaded = await window.eval('loadHipcomerpApiItems({ waitMs: 100, limit: 2 })');
    assert.equal(loaded.ok, true);
    assert.equal(loaded.items.length, 3);
    assert.equal(loaded.items[0].ean, '17896010006312');
    assert.equal(loaded.items[0].plu, '30471');
    assert.equal(loaded.items[0].quantidadePorCaixa, 12);
    assert.equal(loaded.items[2].filled, true);

    const saveResult = await window.eval(`
      saveHipcomerpApiPrices([{
        idx: 0,
        numeroCotacao: '288',
        plu: '30471',
        codigo: '30471',
        ean: '17896010006312',
        nome: 'APERITIVO CAMPARI 998ML',
        quantidadePorCaixa: 12,
        price: '2,50'
      }])
    `);

    assert.equal(saveResult.ok, true);
    assert.equal(saveResult.saved, 1);
    assert.equal(savedPayloads.length, 1);
    assert.equal(savedPayloads[0].numeroCotacao, '288');
    assert.equal(savedPayloads[0].plu, '30471');
    assert.equal(savedPayloads[0].preco, 2.5);
    assert.equal(savedPayloads[0].valorICMS, 0);
    assert.equal(savedPayloads[0].quantidadePorCaixa, 12);
  });

  it('Easy Cotação Web preenche Qtd. Emb. antes do preço com fallback 1', () => {
    const manifest = readJson('chrome-extension/manifest.json');
    const popupJs = readText('chrome-extension/popup.js');
    const contentJs = readText('chrome-extension/content.js');
    const cotacaoPy = readText('backend/routes/cotacao.py');

    assert.equal(manifest.version, '1.0.62');
    assert.match(popupJs, /'easy-cotacao-web': 'Easy Cotação Web'/);
    assert.match(popupJs, /function isEasyCotacaoWebUrl/);
    assert.match(popupJs, /gepautomacao\.dyndns\.org/);
    assert.match(contentJs, /function isEasyCotacaoWebPage/);
    assert.match(contentJs, /function getEasyCotacaoRows/);
    assert.match(contentJs, /function getEasyCotacaoPriceCandidates/);
    assert.match(contentJs, /function getEasyCotacaoQuantityValue[\s\S]*\|\| '1'/);
    assert.match(contentJs, /async function ensureEasyCotacaoQuantity/);
    assert.match(contentJs, /site === 'easy-cotacao-web'/);
    assert.match(contentJs, /easyCotacaoRowShowsPrice/);
    assert.match(cotacaoPy, /"easy-cotacao-web"/);
    assert.match(cotacaoPy, /COTACAO_EXTENSION_SITES_COM_FRACIONAMENTO/);
    assert.match(cotacaoPy, /fracionamento = "1"/);
  });

  it('Estancia preenche campos fixos e calcula valor da embalagem', async () => {
    const manifest = readJson('chrome-extension/manifest.json');
    const popupJs = readText('chrome-extension/popup.js');
    const contentJs = readText('chrome-extension/content.js');

    assert.equal(manifest.version, '1.0.62');
    assert.match(popupJs, /'estancia-cotacao': 'Estância'/);
    assert.match(popupJs, /async function runEstanciaJob/);
    assert.match(popupJs, /loadEstanciaQuote/);
    assert.match(popupJs, /saveEstanciaPage/);
    assert.match(contentJs, /function isEstanciaCotacaoPage/);
    assert.match(contentJs, /function getEstanciaRows/);
    assert.match(contentJs, /function getEstanciaPackageQtyFromText/);
    assert.match(contentJs, /async function saveEstanciaPage/);
    assert.match(contentJs, /async function loadEstanciaPage/);
    assert.match(contentJs, /async function loadEstanciaQuote/);
    assert.match(contentJs, /unitPrice \* packageQty/);

    const html = `
      <form name="form1" action="cotacao.asp" method="post">
        <select name="arquivo" id="arquivo">
          <option value="CP003001005" selected>Cotação: 003001005</option>
          <option value="CP003001007">Cotação: 003001007</option>
        </select>
        <input type="submit" id="grava3" name="grava" value="Grava Alterações">
        <input type="hidden" name="gravar" value="true">
        <input type="hidden" name="pagina" value="1">
        <input type="hidden" name="paginaAnt" value="1">
        <input type="hidden" name="buscar" value="False">
        <table>
          <tr>
            <th>Cód. Barras</th>
            <th>Descrição</th>
            <th>Qtd Pedida</th>
            <th>Qtd Por Embalagem</th>
            <th>Qtd Disponível</th>
            <th>Referência</th>
            <th>Valor da Embalagem</th>
          </tr>
          <tr>
            <td>7898085943809<input type="hidden" name="codigoplu_0" id="codigoplu_0" value="65308"></td>
            <td>sab davene leite de aveia classico</td>
            <td>1</td>
            <td>CX 48</td>
            <td><input type="text" name="vlr1_0" id="vlr1_0" value="0"></td>
            <td><input type="text" name="vlr2_0" id="vlr2_0" value=""></td>
            <td><input type="text" name="vlr3_0" id="vlr3_0" value="0.00"></td>
          </tr>
        </table>
        <div>Páginas: 1 2 3</div>
      </form>`;
    const dom = await createContentDom(html, 'http://cotacao.estanciasupermercados.com.br/cotacao.asp');

    assert.equal(dom.window.eval('detectQuotationSite()'), 'estancia-cotacao');
    const items = await dom.window.eval('extractQuotationItems({})');
    assert.equal(items.length, 1);
    assert.equal(items[0].ean, '7898085943809');
    assert.equal(items[0].qtdEmbalagem, 48);

    const fillResult = await dom.window.eval(`
      fillQuotationPrices([{
        idx: 0,
        ean: '7898085943809',
        nome: 'sab davene leite de aveia classico',
        signature: ${JSON.stringify(items[0].signature)},
        price: '2,50',
        qtdEmbalagem: 48
      }])
    `);

    assert.equal(fillResult.site, 'estancia-cotacao');
    assert.equal(fillResult.filled, 1);
    assert.equal(dom.window.document.querySelector('[name="vlr1_0"]').value, '500');
    assert.equal(dom.window.document.querySelector('[name="vlr2_0"]').value, '1');
    assert.equal(dom.window.document.querySelector('[name="vlr3_0"]').value, '120.00');
    const state = dom.window.eval('getEstanciaState()');
    assert.equal(state.quoteCount, 2);
    assert.equal(state.pages, 3);
  });

  it('SG Cotação detecta grid, lê EAN e preenche o Preço Un.', async () => {
    const popupJs = readText('chrome-extension/popup.js');
    const contentJs = readText('chrome-extension/content.js');

    assert.match(popupJs, /'sg-cotacao': 'SG Cotação'/);
    assert.match(popupJs, /function isSgCotacaoUrl/);
    assert.match(contentJs, /function isSgCotacaoPage/);
    assert.match(contentJs, /function getSgCotacaoRows/);
    assert.match(contentJs, /function getSgCotacaoPriceCandidates/);
    assert.match(contentJs, /sgCotacaoRowShowsPrice\(row, item\.price, samePriceLike\)/);

    const manifest = readJson('chrome-extension/manifest.json');
    assert.ok(manifest.host_permissions.includes('http://cotacao.sghost.com.br/*'));
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('http://cotacao.sghost.com.br/*')),
      'manifest precisa carregar content script no SG Cotação'
    );

    // Grid conforme o template Angular compilado do site (td[data-label] + input id "<i>-preco")
    const html = `
      <div class="table-responsive table-overflow tableFixHead">
        <table class="table table-striped">
          <tr>
            <th>Nº</th><th>Produto</th><th>Cod. Barra</th><th>Qtde</th><th>Qtde. Emb</th>
            <th>Un.</th><th>Desc (%)</th><th>Preço Emb (R$)</th><th>Preço Un. (R$)</th><th>Preço Total (R$)</th>
          </tr>
          <tr>
            <td data-label="Nº">1</td>
            <td data-label="Produto">REFRIG COCA COLA 2L PET</td>
            <td data-label="Cod. Barra">7894900011517</td>
            <td data-label="Qtde">10</td>
            <td data-label="Qtde. Emb">6</td>
            <td data-label="Un.">UN</td>
            <td data-label="Desc (%)"><input id="0-percDesc" class="form-control" value=""></td>
            <td data-label="Preço Emb (R$)"><input id="0-precoEmb" class="form-control" value=""></td>
            <td class="edit" data-label="Preço Un. (R$)"><input id="0-preco" class="form-control" value=""></td>
            <td data-label="Preço Total (R$)"><input class="form-control" disabled value=""></td>
          </tr>
        </table>
      </div>`;
    const dom = await createContentDom(html, 'http://cotacao.sghost.com.br/#/movimentacao/cotacao');

    // Simula a ng2-currency-mask do site: o NgModel (item.preco) SÓ atualiza
    // pelo handler de paste, que relê o value do DOM após setTimeout(1).
    dom.window.eval(`
      window.__sgModel = { preco: 0, confirmado: false };
      const precoInput = document.getElementById('0-preco');
      precoInput.addEventListener('paste', () => {
        setTimeout(() => {
          const digits = String(precoInput.value).replace(/\\D/g, '');
          const n = Number(digits) / 100;
          precoInput.value = 'R$ ' + n.toFixed(2).replace('.', ',');
          window.__sgModel.preco = n;
        }, 1);
      });
      precoInput.addEventListener('blur', () => {
        window.__sgModel.confirmado = window.__sgModel.preco > 0;
      });
    `);

    assert.equal(dom.window.eval('detectQuotationSite()'), 'sg-cotacao');
    const items = await dom.window.eval('extractQuotationItems({})');
    assert.equal(items.length, 1);
    assert.equal(items[0].ean, '7894900011517');
    assert.equal(items[0].nome, 'REFRIG COCA COLA 2L PET');
    assert.equal(items[0].filled, false);

    const fillResult = await dom.window.eval(`
      fillQuotationPrices([{ idx: 0, ean: '7894900011517', nome: 'REFRIG COCA COLA 2L PET', price: '8,79' }])
    `);

    assert.equal(fillResult.site, 'sg-cotacao');
    assert.equal(fillResult.filled, 1);
    assert.match(dom.window.document.getElementById('0-preco').value, /8[.,]79/);
    // O model Angular (o que o botão Gravar salva) precisa ter recebido o preço
    const model = dom.window.eval('window.__sgModel');
    assert.equal(model.preco, 8.79);
    assert.equal(model.confirmado, true);
    assert.equal(dom.window.document.getElementById('0-precoEmb').value, '');
    assert.equal(dom.window.document.getElementById('0-percDesc').value, '');
  });
});
