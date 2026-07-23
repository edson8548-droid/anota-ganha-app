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

async function createRivershopCaptureDom(html) {
  const { JSDOM } = await import(pathToFileURL(join(root, 'frontend/node_modules/jsdom/lib/api.js')).href);
  const dom = new JSDOM(html, {
    url: 'https://www.rivershop.com.br/meus-clientes',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  let messageListener;
  const runtimeMessages = [];
  dom.window.chrome = {
    runtime: {
      onMessage: {
        addListener(listener) { messageListener = listener; },
      },
      sendMessage(message) {
        runtimeMessages.push(message);
        return Promise.resolve();
      },
    },
  };
  dom.window.eval(readText('captura-tabelas-extension/rivershop-capture.js'));
  return {
    dom,
    runtimeMessages,
    send(message) {
      return new Promise(resolve => messageListener(message, {}, resolve));
    },
  };
}

async function createMultiTableApi() {
  const { JSDOM } = await import(pathToFileURL(join(root, 'frontend/node_modules/jsdom/lib/api.js')).href);
  const dom = new JSDOM('', {
    url: 'chrome-extension://venpro/popup.html',
    runScripts: 'outside-only',
  });
  dom.window.eval(readText('chrome-extension/multi-table.js'));
  return dom;
}

describe('extensoes Chrome', () => {
  it('comparacao de tabelas escolhe o menor preco antes de preencher o site', async () => {
    const dom = await createMultiTableApi();
    try {
      const api = dom.window.VenproMultiTable;
      const merged = api.mergeTableMatchResponses([
        {
          selection: { tabelaId: 'spani', nome: 'Spani', prazo: 14 },
          data: {
            precos: [
              { idx: 1, price: '5,89' },
              { idx: 2, price: '4,00' },
            ],
            mantidos: [],
            diagnostics: ['idx=1|decisao=atualizar'],
          },
        },
        {
          selection: { tabelaId: 'muffato', nome: 'Muffato', prazo: 21 },
          data: {
            precos: [
              { idx: 1, price: '5,50' },
              { idx: 3, price: '2,00' },
            ],
            mantidos: [2, 4],
            diagnostics: ['idx=1|decisao=atualizar'],
          },
        },
        {
          selection: { tabelaId: 'compre-facil', nome: 'Compre Fácil', prazo: 28 },
          data: {
            precos: [
              { idx: 1, price: '5,70' },
              { idx: 2, price: '4,10' },
            ],
            mantidos: [],
          },
        },
      ], 5);

      assert.deepEqual(
        Array.from(merged.precos, item => ({ idx: item.idx, price: item.price, tabela: item.tabela_nome })),
        [
          { idx: 1, price: '5,50', tabela: 'Muffato' },
          { idx: 2, price: '4,00', tabela: 'Spani' },
          { idx: 3, price: '2,00', tabela: 'Muffato' },
        ],
      );
      assert.deepEqual(Array.from(merged.mantidos), [4]);
      assert.equal(merged.stats.preenchidos, 3);
      assert.equal(merged.stats.mantidos_menor_preco, 1);
      assert.equal(merged.stats.nao_encontrados, 1);
      assert.match(merged.diagnostics[0], /^tabela=Spani\|/);
    } finally {
      dom.window.close();
    }
  });

  it('comparacao preserva jobs antigos de uma unica tabela', async () => {
    const dom = await createMultiTableApi();
    try {
      const selections = dom.window.VenproMultiTable.normalizeJobTableSelections({
        tabelaId: 'spani',
        tabelaNome: 'Spani',
        prazo: 14,
      });
      assert.equal(selections.length, 1);
      assert.deepEqual(
        { ...selections[0] },
        { tabelaId: 'spani', nome: 'Spani', prazo: 14 },
      );
    } finally {
      dom.window.close();
    }
  });

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

  it('demonstração oficial identifica e preenche uma cotação fictícia', async () => {
    const dom = await createContentDom(`
      <table>
        <thead><tr><th>EAN</th><th>Produto</th><th>Quantidade</th><th>Preço unitário</th></tr></thead>
        <tbody><tr><td>7891000100103</td><td>Arroz Tipo 1</td><td>20</td><td><input name="preco_1" /></td></tr></tbody>
      </table>
    `, 'https://venpro.com.br/demonstracao-extensao-cotacao.html');
    try {
      assert.equal(dom.window.eval('detectQuotationSite()'), 'venpro-demo');
      const items = await dom.window.eval('extractQuotationItems()');
      assert.equal(items.length, 1);
      assert.equal(items[0].ean, '7891000100103');

      const result = await dom.window.eval(`fillQuotationPrices([{
        idx: 0, ean: '7891000100103', nome: 'Arroz Tipo 1', price: '24,90'
      }])`);
      assert.equal(result.filled, 1);
      assert.equal(dom.window.document.querySelector('input[name="preco_1"]').value, '24,90');
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

  it('Nafarmas detecta itens e preenche somente Preço Unitário', async () => {
    const dom = await createContentDom(`
      <h1>A7Pharma - Cotação Online</h1>
      <form id="formItensCotacao">
        <input id="formItensCotacao:itens" value="2" />
        <table id="formItensCotacao:tabelaItensCotacao">
          <thead><tr><th></th><th>Cód. Barras</th><th>Produto</th><th>Fabricante</th><th>Unidade</th><th>Qtd</th><th>Preço Unit.</th><th>% Desc.</th></tr></thead>
          <tbody><tr>
            <td><input type="checkbox" /></td><td>7899674017062</td><td>DES AERO ABOVE CANDY 150ML</td><td>ABOVE</td><td>1</td><td>6,00</td>
            <td><input class="numero precoUnitario" id="formItensCotacao:tabelaItensCotacao:0:precoUnitario" /></td>
            <td><input class="numero desconto" id="formItensCotacao:tabelaItensCotacao:0:desconto" /></td>
          </tr></tbody>
        </table>
        <div id="formItensCotacao:tableItesnScroller"><table><tr><td class="rich-datascr-act">1</td></tr></table></div>
      </form>
    `, 'http://nafarmasl.ddns.net:8080/web/cotacao/itensCotacoes.jsp');
    try {
      assert.equal(dom.window.eval('detectQuotationSite()'), 'nafarmas-cotacao');
      const items = await dom.window.eval('extractQuotationItems()');
      assert.equal(items.length, 1);
      assert.equal(items[0].ean, '7899674017062');
      assert.equal(items[0].nome, 'DES AERO ABOVE CANDY 150ML');

      const result = await dom.window.eval(`fillQuotationPrices([{
        idx: 0, ean: '7899674017062', nome: 'DES AERO ABOVE CANDY 150ML', price: '5,51'
      }])`);
      assert.equal(result.filled, 1);
      assert.equal(dom.window.document.querySelector('input.precoUnitario').value, '5,51');
      assert.equal(dom.window.document.querySelector('input.desconto').value, '');
    } finally {
      dom.window.close();
    }
  });

  it('Dobesone usa BARRA como EAN e salva apenas o campo VALOR', async () => {
    const dom = await createContentDom(`
      <h2>PRODUTOS COTAÇÃO ONLINE</h2>
      <table>
        <thead><tr><th>CÓDIGO</th><th>DESCRIÇÃO</th><th>REFERÊNCIA</th><th>BARRA</th><th>EMB</th><th>UN</th><th>QTDE</th><th>VALOR</th><th>OBSERVAÇÃO</th></tr></thead>
        <tbody><tr>
          <td>24396</td><td>CHOCOLATE BATON 16G BRANCO</td><td></td><td>0000078912366</td><td>1</td><td>UN</td><td>90.000</td>
          <td><input class="form-control input-table maskvalor" id="valor155" name="valor155" /></td>
          <td><input class="form-control input-table" id="obs155" name="obs155" /></td>
        </tr></tbody>
      </table>
    `, 'https://cotacao.dobesone.emartim.com.br/cotacao.php?chave=teste');
    try {
      let saves = 0;
      dom.window.document.querySelector('#valor155').addEventListener('blur', () => { saves += 1; });

      assert.equal(dom.window.eval('detectQuotationSite()'), 'dobesone-cotacao');
      const items = await dom.window.eval('extractQuotationItems()');
      assert.equal(items.length, 1);
      assert.equal(items[0].ean, '0000078912366');
      assert.equal(items[0].nome, 'CHOCOLATE BATON 16G BRANCO');

      const result = await dom.window.eval(`fillQuotationPrices([{
        idx: 0, ean: '0000078912366', nome: 'CHOCOLATE BATON 16G BRANCO', price: '5,51'
      }])`);
      assert.equal(result.site, 'dobesone-cotacao');
      assert.equal(result.filled, 1);
      assert.equal(dom.window.document.querySelector('#valor155').value, '5,51');
      assert.equal(dom.window.document.querySelector('#obs155').value, '');
      assert.ok(saves > 0);
    } finally {
      dom.window.close();
    }
  });

  it('Syspan preenche Valor Unitário e quantidade mínima sem alterar observações', async () => {
    const dom = await createContentDom(`
      <h4>Itens Cotação</h4>
      <h6>Atenção: Digite a vírgula para as casas decimais</h6>
      <table>
        <thead><tr><th>Cód. Barras</th><th>Item</th><th>Unid.</th><th>Qtd Pedido</th><th>Valor Unit.(R$)</th><th>Qtd Mínima</th><th>Subtotal (R$)</th><th>Observação</th></tr></thead>
        <tbody><tr>
          <td>07896083800018</td><td>AGUA SANIT.QBOA 1L</td><td>UN</td><td>480</td>
          <td><input class="direita valor largura_campo" id="vl_845529" name="vl_845529" placeholder="Valor" /></td>
          <td><input class="direita largura_campo valor_st" id="st_845529" name="st_845529" placeholder="Quantidade" /></td>
          <td><input disabled id="d_845529" /></td>
          <td><input id="ma_845529" name="ma_845529" placeholder="Observações" /></td>
        </tr></tbody>
      </table>
    `, 'https://cotacao.syspanweb.com.br/?:=itens_cotacao&tt=atd&c=4204');
    try {
      let priceBlurs = 0;
      let quantityBlurs = 0;
      let emptyValueEvents = 0;
      dom.window.document.querySelector('#vl_845529').addEventListener('blur', () => { priceBlurs += 1; });
      dom.window.document.querySelector('#st_845529').addEventListener('blur', () => { quantityBlurs += 1; });
      dom.window.document.querySelector('#vl_845529').addEventListener('input', (event) => {
        if (!event.target.value) emptyValueEvents += 1;
      });

      assert.equal(dom.window.eval('detectQuotationSite()'), 'syspan-cotacao');
      const items = await dom.window.eval('extractQuotationItems()');
      assert.equal(items.length, 1);
      assert.equal(items[0].ean, '07896083800018');
      assert.equal(items[0].nome, 'AGUA SANIT.QBOA 1L');

      const result = await dom.window.eval(`fillQuotationPrices([{
        idx: 0, ean: '07896083800018', nome: 'AGUA SANIT.QBOA 1L', price: '5,51'
      }])`);
      assert.equal(result.site, 'syspan-cotacao');
      assert.equal(result.filled, 1);
      assert.equal(result.diagnostics[0].reason, 'syspan_value_confirmed');
      assert.equal(dom.window.document.querySelector('#vl_845529').value, '5,51');
      assert.equal(dom.window.document.querySelector('#st_845529').value, '1');
      assert.equal(dom.window.document.querySelector('#ma_845529').value, '');
      assert.ok(priceBlurs > 0);
      assert.ok(quantityBlurs > 0);
      assert.equal(emptyValueEvents, 0);

      const withMasterQuantity = await dom.window.eval(`fillQuotationPrices([{
        idx: 0, ean: '07896083800018', nome: 'AGUA SANIT.QBOA 1L', price: '5,52', fracionamento: '6'
      }])`);
      assert.equal(withMasterQuantity.filled, 1);
      assert.equal(dom.window.document.querySelector('#vl_845529').value, '5,52');
      assert.equal(dom.window.document.querySelector('#st_845529').value, '6');
    } finally {
      dom.window.close();
    }
  });

  it('Imperium preenche somente o preço por EAN', async () => {
    const dom = await createContentDom(`
      <h1>Cotação #25</h1><h3>Produtos</h3>
      <table><thead><tr><th>EAN</th><th>Descrição</th><th>Unidade</th><th>Embalagem</th><th>Quantidade</th><th>Preço</th><th>Dias Entrega</th><th>Dias Pagamento</th></tr></thead>
      <tbody><tr>
        <td>7896007550463</td><td>ABS INTIMUS DAYS ANTIBACTERIANA</td><td>UN</td><td>4,000</td><td>1,000</td>
        <td>R$ <input class="txtPreco" id="preco-1" /></td>
        <td><input class="txtEntrega" type="number" id="entrega-1" value="7" /></td>
        <td><input class="txtPagamento" type="number" id="pagamento-1" value="28" /></td>
      </tr></tbody></table>
    `, 'http://bids.imperiumsolucoes.com/Cotacao.aspx?id=1541&numero=25');
    try {
      assert.equal(dom.window.eval('detectQuotationSite()'), 'imperium-cotacao');
      const items = await dom.window.eval('extractQuotationItems()');
      assert.equal(items.length, 1);
      assert.equal(items[0].ean, '7896007550463');
      assert.equal(items[0].nome, 'ABS INTIMUS DAYS ANTIBACTERIANA');

      const result = await dom.window.eval(`fillQuotationPrices([{
        idx: 0, ean: '7896007550463', nome: 'ABS INTIMUS DAYS ANTIBACTERIANA', price: '5,51'
      }])`);
      assert.equal(result.site, 'imperium-cotacao');
      assert.equal(result.filled, 1);
      assert.equal(dom.window.document.querySelector('#preco-1').value, '5,51');
      assert.equal(dom.window.document.querySelector('#entrega-1').value, '7');
      assert.equal(dom.window.document.querySelector('#pagamento-1').value, '28');
    } finally {
      dom.window.close();
    }
  });

  it('Super 20 preenche somente o campo preco por EAN', async () => {
    const dom = await createContentDom(`
      <form id="formLancarCotacao"><table><tbody><tr>
        <td><input name="[0].cod" value="3362"></td>
        <td><input name="[0].descricao" value="CERVEJA BRAHMA ZERO 350ML"></td>
        <td><input name="[0].codbarras" value="7891149104932"></td>
        <td><input name="[0].qtde" value="29,00"></td>
        <td><input name="[0].preco" value="0,00"></td>
        <td><input name="[0].observacao" value=""></td>
      </tr></tbody></table></form>
    `, 'http://200.160.111.171:8082/Cotacao/LancarCotacao?codigo=122&ord=1');
    try {
      assert.equal(dom.window.eval('detectQuotationSite()'), 'super20-cotacao');
      const items = await dom.window.eval('extractQuotationItems()');
      assert.equal(items.length, 1);
      assert.equal(items[0].ean, '7891149104932');

      const result = await dom.window.eval(`fillQuotationPrices([{
        idx: 0, ean: '7891149104932', nome: 'CERVEJA BRAHMA ZERO 350ML', price: '5,51'
      }])`);
      assert.equal(result.site, 'super20-cotacao');
      assert.equal(result.filled, 1);
      assert.equal(dom.window.document.querySelector('[name="[0].preco"]').value, '5,51');
      assert.equal(dom.window.document.querySelector('[name="[0].qtde"]').value, '29,00');
      assert.equal(dom.window.document.querySelector('[name="[0].observacao"]').value, '');
    } finally {
      dom.window.close();
    }
  });

  it('Cotefácil preenche preço comum e monitorado sem alterar quantidade ou desconto', async () => {
    const dom = await createContentDom(`
      <form id="respostaCotacao">
        <table id="respostaCotacao:respostas">
          <tbody><tr>
            <td>7500435214667</td><td>ABS ALWAYS NOT SV XG C/AB 8UN</td>
            <td><input id="respostaCotacao:respostas:0:quantidade" value="2"><input type="hidden" value="2"></td>
            <td><select><option selected>Unidade</option></select><input id="respostaCotacao:respostas:0:txtQtdeEmbalagem" value="1" disabled></td>
            <td><input id="respostaCotacao:respostas:0:valorBruto" value="0,00"></td>
            <td><input id="respostaCotacao:respostas:0:valorDesconto" value="4,00"></td>
            <td>0,00</td>
          </tr></tbody>
        </table>
        <table id="respostaCotacao:respostasMonitorado">
          <tbody><tr>
            <td>7891106908221</td><td>BEPANTOL BABY CREME 60G</td>
            <td><input id="respostaCotacao:respostasMonitorado:0:quantidade" value="3"><input type="hidden" value="3"></td>
            <td><select><option selected>Unidade</option></select><input id="respostaCotacao:respostasMonitorado:0:txtQtdeEmbalagem" value="1" disabled></td>
            <td><input id="respostaCotacao:respostasMonitorado:0:valorComST" value="0,00"></td>
            <td><input id="respostaCotacao:respostasMonitorado:0:descontoInformado" value="2,00"></td>
          </tr></tbody>
        </table>
      </form>
    `, 'https://sistemas.cotefacil.com/CTFLLogan-webapp/spring/pages/representante/respostas/cotacao?execution=e2s1');
    try {
      let priceBlurs = 0;
      dom.window.document.querySelector('[id$=":valorBruto"]').addEventListener('blur', () => { priceBlurs += 1; });
      dom.window.document.querySelector('[id$=":valorComST"]').addEventListener('blur', () => { priceBlurs += 1; });

      assert.equal(dom.window.eval('detectQuotationSite()'), 'cotefacil-cotacao');
      const items = await dom.window.eval('extractQuotationItems()');
      assert.equal(items.length, 2);
      assert.equal(items[0].ean, '7500435214667');
      assert.equal(items[0].nome, 'ABS ALWAYS NOT SV XG C/AB 8UN');
      assert.equal(items[0].cotefacilSection, 'regular');
      assert.equal(items[1].ean, '7891106908221');
      assert.equal(items[1].nome, 'BEPANTOL BABY CREME 60G');
      assert.equal(items[1].cotefacilSection, 'monitorado');

      const result = await dom.window.eval(`fillQuotationPrices([
        { idx: 0, ean: '7500435214667', nome: 'ABS ALWAYS NOT SV XG C/AB 8UN', price: '5,51' },
        { idx: 1, ean: '7891106908221', nome: 'BEPANTOL BABY CREME 60G', price: '12,34' }
      ])`);
      assert.equal(result.site, 'cotefacil-cotacao');
      assert.equal(result.filled, 2);
      assert.equal(result.failed.length, 0);
      assert.equal(dom.window.document.querySelector('[id$=":valorBruto"]').value, '5,51');
      assert.equal(dom.window.document.querySelector('[id$=":valorComST"]').value, '12,34');
      assert.equal(dom.window.document.querySelector('#respostaCotacao\\:respostas\\:0\\:quantidade').value, '2');
      assert.equal(dom.window.document.querySelector('#respostaCotacao\\:respostasMonitorado\\:0\\:quantidade').value, '3');
      assert.equal(dom.window.document.querySelector('[id$=":valorDesconto"]').value, '4,00');
      assert.equal(dom.window.document.querySelector('[id$=":descontoInformado"]').value, '2,00');
      assert.ok(priceBlurs >= 2);
    } finally {
      dom.window.close();
    }
  });

  it('Cotefácil calcula o total e troca de página sem duplicar os monitorados', async () => {
    const regularRow = index => `
      <tr>
        <td>${String(7890000000000 + index)}</td><td>PRODUTO REGULAR ${index}</td>
        <td><input id="respostaCotacao:respostas:${index}:quantidade" value="1"></td>
        <td></td><td><input id="respostaCotacao:respostas:${index}:valorBruto" value="0,00"></td><td></td><td></td>
      </tr>`;
    const monitoredRow = index => `
      <tr>
        <td>${String(7900000000000 + index)}</td><td>PRODUTO MONITORADO ${index}</td>
        <td><input id="respostaCotacao:respostasMonitorado:${index}:quantidade" value="1"></td>
        <td></td><td><input id="respostaCotacao:respostasMonitorado:${index}:valorComST" value="0,00"></td><td></td>
      </tr>`;
    const dom = await createContentDom(`
      <form id="respostaCotacao">
        <span id="respostaCotacao:totalItens">310</span>
        <table id="respostaCotacao:respostas"><tbody>${Array.from({ length: 10 }, (_, index) => regularRow(index)).join('')}</tbody></table>
        <div id="respostaCotacao:respostas:j_id530" class="rich-datascr">
          <table><tbody><tr>
            <td class="rich-datascr-act">1</td>
            <td class="rich-datascr-inact" data-page="2" onclick="Event.fire(this, 'rich:datascroller:onscroll', {'page': '2'});">2</td>
          </tr></tbody></table>
        </div>
        <table id="respostaCotacao:respostasMonitorado"><tbody>${Array.from({ length: 5 }, (_, index) => monitoredRow(index)).join('')}</tbody></table>
      </form>
    `, 'https://sistemas.cotefacil.com/CTFLLogan-webapp/spring/pages/representante/respostas/cotacao?execution=e2s1');
    try {
      const { document } = dom.window;
      const pageTwoButton = document.querySelector('[data-page="2"]');
      pageTwoButton.addEventListener('click', () => {
        document.querySelector('#respostaCotacao\\:respostas tbody').innerHTML = Array.from(
          { length: 10 },
          (_, offset) => regularRow(10 + offset)
        ).join('');
        document.querySelector('.rich-datascr-act').className = 'rich-datascr-inact';
        pageTwoButton.className = 'rich-datascr-act';
      });

      const firstState = dom.window.eval('getCotefacilState()');
      assert.equal(firstState.ok, true);
      assert.equal(firstState.page, 1);
      assert.equal(firstState.pages, 31);
      assert.equal(firstState.total, 310);
      assert.equal(firstState.regularTotal, 305);
      assert.equal(firstState.monitoredTotal, 5);

      const loaded = await dom.window.eval('loadCotefacilPage(2)');
      assert.equal(loaded.ok, true);
      assert.equal(loaded.state.page, 2);
      assert.equal(loaded.state.mainRows, 10);

      const items = await dom.window.eval('extractQuotationItems()');
      assert.equal(items.length, 15);
      assert.equal(items.filter(item => item.cotefacilSection === 'regular').length, 10);
      assert.equal(items.filter(item => item.cotefacilSection === 'monitorado').length, 5);

      const popupJs = readText('chrome-extension/popup.js');
      assert.match(popupJs, /async function runCotefacilJob/);
      assert.match(popupJs, /item\.cotefacilSection !== 'monitorado'/);
      assert.match(popupJs, /action: 'loadCotefacilPage'/);
      assert.match(popupJs, /function resolveDetectedSite/);
      assert.match(popupJs, /pageSite && pageSite !== 'generic'/);
      assert.match(popupJs, /Recarregue a página da cotação uma vez/);
      assert.match(readText('chrome-extension/content.js'), /contentVersion: COTEFACIL_CONTENT_VERSION/);
    } finally {
      dom.window.close();
    }
  });

  it('Inplug identifica EAN e salva cada preço pelo editor React sem enviar Enter', async () => {
    const dom = await createContentDom(`
      <table>
        <thead><tr>
          <th>Código</th><th>Produto</th><th>UN</th><th>EMB</th><th>QTDE</th><th>Cotação R$</th>
        </tr></thead>
        <tbody>
          <tr>
            <td>7891000315507</td><td>*NESCAFE SOLUVEL 100G MATINAL</td><td>1</td><td>UN</td><td>0</td>
            <td data-price-cell><button data-slot="button">Inserir valor</button></td>
          </tr>
          <tr>
            <td>7891000100103</td><td>ARROZ TIPO 1 5KG</td><td>1</td><td>UN</td><td>10</td>
            <td><button data-slot="button">R$ 7,00</button></td>
          </tr>
        </tbody>
      </table>
    `, 'https://www.cotacao.inplug.online/cotacao/638?page=0&limit=0');

    try {
      const { document } = dom.window;
      const priceCell = document.querySelector('[data-price-cell]');
      let savedValue = '';
      let saveCount = 0;
      let enterCount = 0;

      priceCell.querySelector('button').addEventListener('click', () => {
        const input = document.createElement('input');
        input.setAttribute('data-slot', 'input');
        input.setAttribute('inputmode', 'decimal');
        input.setAttribute('placeholder', '0,00');
        input.type = 'text';
        input.addEventListener('input', () => {
          savedValue = input.value;
        });
        input.addEventListener('keydown', event => {
          if (event.key === 'Enter') enterCount++;
        });
        input.addEventListener('blur', () => {
          saveCount++;
          const button = document.createElement('button');
          button.setAttribute('data-slot', 'button');
          button.textContent = `R$ ${savedValue}`;
          priceCell.replaceChildren(button);
        });
        priceCell.replaceChildren(input);
        input.focus();
      });

      assert.equal(dom.window.eval('detectQuotationSite()'), 'inplug-cotacao');
      const items = await dom.window.eval('extractQuotationItems()');
      assert.equal(items.length, 2);
      assert.equal(items[0].ean, '7891000315507');
      assert.equal(items[0].nome, '*NESCAFE SOLUVEL 100G MATINAL');
      assert.equal(items[0].filled, false);
      assert.equal(items[0].current_price, null);
      assert.equal(items[1].filled, true);
      assert.equal(items[1].current_price, 7);

      const result = await dom.window.eval(`fillQuotationPrices([{
        idx: 0,
        ean: '7891000315507',
        nome: '*NESCAFE SOLUVEL 100G MATINAL',
        signature: '7891000315507|*NESCAFE SOLUVEL 100G MATINAL',
        price: '5,51'
      }])`);

      assert.equal(result.site, 'inplug-cotacao');
      assert.equal(result.rowCount, 2);
      assert.equal(result.filled, 1);
      assert.equal(result.failed.length, 0);
      assert.equal(saveCount, 1);
      assert.equal(enterCount, 0);
      assert.equal(priceCell.textContent.trim(), 'R$ 5,51');
      assert.equal(document.querySelector('tbody tr td:nth-child(5)').textContent.trim(), '0');
    } finally {
      dom.window.close();
    }
  });

  it('manifest da extensao Cotatudo referencia arquivos existentes', () => {
    const manifest = readJson('chrome-extension/manifest.json');
    const popupJs = readText('chrome-extension/popup.js');
    const popupHtml = readText('chrome-extension/popup.html');

    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, '1.0.81');
    assert.equal(manifest.minimum_chrome_version, '114');
    assert.equal(manifest.homepage_url, 'https://venpro.com.br');
    assert.ok(manifest.description.length <= 132, 'description precisa respeitar o limite da Chrome Web Store');
    assertFilesExist('chrome-extension', [
      manifest.background.service_worker,
      manifest.action?.default_popup || manifest.side_panel?.default_path,
      ...manifest.content_scripts.flatMap(script => script.js || []),
    ]);
    assert.ok(manifest.host_permissions.includes('https://api.venpro.com.br/*'));
    assert.ok(manifest.host_permissions.includes('https://*.venpro.com.br/*'));
    assert.ok(manifest.host_permissions.includes('https://anota-ganha-app.web.app/*'));
    assert.ok(manifest.host_permissions.includes('https://anota-ganha-app.firebaseapp.com/*'));
    assert.match(manifest.description, /Preenche cotações/);
    assert.ok(existsSync(join(root, 'chrome-extension/multi-table.js')));
    assert.match(popupHtml, /<script src="multi-table\.js"><\/script>/);
    assert.match(popupHtml, /id="compararTabelas"/);
    assert.match(popupJs, /mergeTableMatchResponses/);
    assert.ok(manifest.host_permissions.includes('https://infomagcotacao.com/*'));
    assert.ok(manifest.host_permissions.includes('https://*.intersolid.com.br/*'));
    assert.ok(manifest.host_permissions.includes('http://cotacaoweb.smus.com.br/*'));
    assert.ok(manifest.host_permissions.includes('https://catalog-32594.bubbleapps.io/*'));
    assert.ok(manifest.host_permissions.includes('https://cotacao.hipcomerp.com.br/*'));
    assert.ok(manifest.host_permissions.includes('http://gepautomacao.dyndns.org/*'));
    assert.ok(manifest.host_permissions.includes('http://cotacao.estanciasupermercados.com.br/*'));
    assert.ok(manifest.host_permissions.includes('http://nafarmasl.ddns.net:8080/*'));
    assert.ok(manifest.host_permissions.includes('https://cotacao.dobesone.emartim.com.br/*'));
    assert.ok(manifest.host_permissions.includes('https://cotacao.syspanweb.com.br/*'));
    assert.ok(manifest.host_permissions.includes('https://cotacao3.egestora.com.br/*'));
    assert.ok(manifest.host_permissions.includes('http://bids.imperiumsolucoes.com/*'));
    assert.ok(manifest.host_permissions.includes('https://sistemas.cotefacil.com/*'));
    assert.ok(manifest.host_permissions.includes('https://www.cotacao.inplug.online/*'));
    assert.match(popupJs, /function isSyspanCotacaoUrl/);
    assert.match(popupJs, /'syspan-cotacao': 'Syspan'/);
    assert.match(popupJs, /'egestora-cotacao': 'Egestora'/);
    assert.match(popupJs, /function isEgestoraCotacaoUrl/);
    assert.match(popupJs, /function isImperiumCotacaoUrl/);
    assert.match(popupJs, /'imperium-cotacao': 'Imperium Bids'/);
    assert.match(popupJs, /function isCotefacilCotacaoUrl/);
    assert.match(popupJs, /'cotefacil-cotacao': 'Cotefácil'/);
    assert.match(popupJs, /function isInplugCotacaoUrl/);
    assert.match(popupJs, /'inplug-cotacao': 'Inplug'/);
    assert.match(readText('backend/routes/cotacao.py'), /"syspan-cotacao"/);
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
    const quotationMatches = manifest.content_scripts.flatMap(script => script.matches || []);
    assert.ok(!quotationMatches.includes('https://*/fornecedores/*/cotacao/*'));
    assert.ok(!quotationMatches.includes('https://*/cotacao/*'));
    assert.ok(
      quotationMatches.includes('https://venpro.com.br/demonstracao-extensao-cotacao.html'),
      'manifest precisa carregar content script na demonstração oficial'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://cotacao.syspanweb.com.br/*')),
      'manifest precisa carregar content script na Syspan'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://sistemas.cotefacil.com/*')),
      'manifest precisa carregar content script no Cotefácil'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://www.cotacao.inplug.online/*')),
      'manifest precisa carregar content script no Inplug'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://anota-ganha-app.web.app/*')),
      'manifest precisa carregar venpro-content no endereco antigo do Firebase'
    );
  });

  it('edicao Legacy usa popup e bridges compativeis com Chrome 109', () => {
    const baseDir = 'chrome-extension-legacy-109';
    const manifest = readJson(`${baseDir}/manifest.json`);
    const backgroundJs = readText(`${baseDir}/background.js`);
    const loaderJs = readText(`${baseDir}/legacy-main-world-loader.js`);
    const webResources = manifest.web_accessible_resources.flatMap(resource => resource.resources || []);

    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.minimum_chrome_version, '109');
    assert.equal(manifest.version, '1.0.74.109');
    assert.match(manifest.name, /Chrome 109/);
    assert.equal(manifest.action.default_popup, 'popup.html');
    assert.equal(manifest.side_panel, undefined);
    assert.ok(!manifest.permissions.includes('sidePanel'));
    assert.ok(manifest.content_scripts.every(script => script.world === undefined));
    assert.ok(manifest.content_scripts.some(script =>
      (script.js || []).includes('legacy-main-world-loader.js') && script.run_at === 'document_start'));
    assertFilesExist(baseDir, [
      manifest.background.service_worker,
      manifest.action.default_popup,
      ...manifest.content_scripts.flatMap(script => script.js || []),
      ...webResources,
      'INSTALAR-CHROME-109.txt',
    ]);
    for (const bridge of [
      'hipcom-main-world.js',
      'arius-main-world.js',
      'bluesoft-main-world.js',
      'guiacotacao-main-world.js',
    ]) {
      assert.ok(webResources.includes(bridge), `${bridge} precisa ser web accessible no Chrome 109`);
      assert.match(loaderJs, new RegExp(bridge.replace(/\./g, '\\.')));
    }
    assert.doesNotMatch(backgroundJs, /chrome\.sidePanel|side_panel/);
    assert.match(loaderJs, /chrome\.runtime\.getURL\(bridge\.file\)/);
  });

  it('loader Legacy injeta o bridge correto no contexto da página', async () => {
    const { JSDOM } = await import(pathToFileURL(join(root, 'frontend/node_modules/jsdom/lib/api.js')).href);
    const dom = new JSDOM('<html><head></head><body></body></html>', {
      url: 'https://erp.bluesoft.com.br/grupomartins/Core/mainMenu/afterLogin',
      runScripts: 'outside-only',
    });
    try {
      dom.window.chrome = {
        runtime: {
          getURL(file) { return `chrome-extension://legacy-test/${file}`; },
        },
      };
      dom.window.eval(readText('chrome-extension-legacy-109/legacy-main-world-loader.js'));
      const injected = dom.window.document.querySelector('script[data-venpro-legacy-bridge]');
      assert.ok(injected);
      assert.equal(injected.dataset.venproLegacyBridge, 'bluesoft-main-world.js');
      assert.equal(injected.src, 'chrome-extension://legacy-test/bluesoft-main-world.js');
    } finally {
      dom.window.close();
    }
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
    assert.ok(existsSync(join(root, 'frontend/public/venpro-preencher-cotacao-1.0.65.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.65.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-preencher-cotacao-1.0.66.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.66.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-preencher-cotacao-1.0.67.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.67.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-preencher-cotacao-1.0.68.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.68.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-preencher-cotacao-1.0.69.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.69.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-preencher-cotacao-1.0.70.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.70.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-preencher-cotacao-1.0.71.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.71.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-preencher-cotacao-1.0.72.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.72.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-preencher-cotacao-1.0.73.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.73.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-preencher-cotacao-1.0.77.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.77.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-preencher-cotacao-1.0.79.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.79.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-preencher-cotacao-1.0.81.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.81.zip')));
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

  it('Bluesoft envia current_price apenas para preço positivo', () => {
    const bridgeJs = readText('chrome-extension/bluesoft-main-world.js');
    const popupJs = readText('chrome-extension/popup.js');

    assert.match(bridgeJs, /const current_price = parsedPrice != null && parsedPrice > 0 \? parsedPrice : null/);
    assert.match(popupJs, /Dados inválidos em \$\{field \|\| 'um item'\}/);
  });

  it('Captura de Tabelas reúne Bate Forte e Rivershop com os quatro prazos', () => {
    const manifest = readJson('captura-tabelas-extension/manifest.json');
    const popupJs = readText('captura-tabelas-extension/popup.js');
    const popupHtml = readText('captura-tabelas-extension/popup.html');
    const rivershopJs = readText('captura-tabelas-extension/rivershop-capture.js');

    assert.ok(manifest.host_permissions.includes('https://pwa-rca-prod.bateforte.link/*'));
    assert.ok(manifest.host_permissions.includes('https://www.rivershop.com.br/*'));
    assert.ok(manifest.permissions.includes('downloads'));
    assert.ok(manifest.content_scripts.some(script => (script.js || []).includes('bateforte-capture.js')));
    assert.ok(manifest.content_scripts.some(script => (script.js || []).includes('rivershop-capture.js')));
    assert.match(rivershopJs, /async function configureTerm/);
    assert.match(rivershopJs, /async function capture/);
    assert.match(rivershopJs, /data-id-embalagem/);
    assert.match(rivershopJs, /const PAGE_CONCURRENCY = 4/);
    assert.match(rivershopJs, /Promise\.allSettled/);
    assert.match(rivershopJs, /url\.searchParams\.delete\('perpage'\)/);
    assert.match(rivershopJs, /rivershopCaptureProgress/);
    assert.match(rivershopJs, /new DOMParser\(\)\.parseFromString/);
    assert.match(rivershopJs, /const DEPARTMENTS = \[/);
    assert.match(rivershopJs, /rivershopGetCaptureScopes/);
    assert.match(rivershopJs, /rivershopGetCaptureScope/);
    assert.doesNotMatch(rivershopJs, /cobranca\\s\\+bancaria/i);
    assert.match(rivershopJs, /return \{ unavailable: true, days \}/);
    assert.match(popupJs, /const TERMS = \[7, 14, 21, 28\]/);
    assert.match(popupJs, /'7 DIAS', '14 DIAS', '21 DIAS', '28 DIAS'/);
    assert.match(popupJs, /function downloadXlsx/);
    assert.match(popupJs, /chrome\.downloads\.download/);
    assert.match(popupJs, /RIVERSHOP_DOWNLOAD_FOLDER = 'Venpro\/Rio Vermelho'/);
    assert.match(popupJs, /saveCheckpoint/);
    assert.match(popupJs, /function setProgress/);
    assert.match(popupHtml, /role="progressbar"/);
    assert.match(popupJs, /DEPARTAMENTO/);
    assert.match(popupJs, /rivershop-tabela-\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}\.xlsx/);
    assert.match(popupJs, /const unavailableTerms = \[\]/);
    assert.match(popupJs, /if \(setup\?\.unavailable\)/);
    assert.match(popupJs, /rivershopSetTerm', days: 7/);
  });

  it('Rivershop mantém o pagamento válido do cliente e informa prazo ausente', async () => {
    const harness = await createRivershopCaptureDom(`
      <form data-form="selecionarPreferencias">
        <select name="id_forma_pagamento_preferencia">
          <option value="pix">PIX</option>
          <option value="boleto" selected>Boleto</option>
        </select>
        <select name="id_condicao_pagamento_preferencia">
          <option value="7">7 DIAS</option>
          <option value="14">14 DIAS</option>
        </select>
      </form>
    `);
    try {
      let submits = 0;
      harness.dom.window.document.querySelector('form').requestSubmit = () => { submits += 1; };

      const configured = await harness.send({ action: 'rivershopSetTerm', days: 14 });
      await new Promise(resolve => setTimeout(resolve, 70));
      assert.equal(configured.unavailable, false);
      assert.equal(configured.days, 14);
      assert.equal(harness.dom.window.document.querySelector('[name="id_forma_pagamento_preferencia"]').value, 'boleto');
      assert.equal(harness.dom.window.document.querySelector('[name="id_condicao_pagamento_preferencia"]').value, '14');
      assert.equal(submits, 1);

      const unavailable = await harness.send({ action: 'rivershopSetTerm', days: 21 });
      assert.equal(unavailable.unavailable, true);
      assert.equal(unavailable.days, 21);
      assert.equal(harness.dom.window.document.querySelector('[name="id_forma_pagamento_preferencia"]').value, 'boleto');
      assert.equal(submits, 1);
    } finally {
      harness.dom.window.close();
    }
  });

  it('Rivershop busca todas as páginas da categoria sem depender da rolagem', async () => {
    const harness = await createRivershopCaptureDom(`
      <a class="filter-categories__item--current" href="/mercearia?page=13&id_colecao=123">MERCEARIA</a>
      <a href="/higiene-e-beleza">HIGIENE E BELEZA</a><a href="/limpeza">LIMPEZA</a><a href="/bebidas">BEBIDAS</a>
      <a href="/bazar">BAZAR</a><a href="/agropecuaria">AGROPECUÁRIA</a><a href="/eletro">ELETRO</a><a href="/materiais-construcao">MATERIAIS DE CONSTRUÇÃO</a>
      <div class="products-view__options">302 produtos ordenados por:</div>
      <div class="products-list__body products-list__body__last-page">
        <table><tbody><tr class="product-card-logged"><td data-codigo-produto="123" data-nome="CAFÉ" data-preco="12.50" data-id-embalagem="7891234567890"></td><td>Embalagem: UN</td></tr></tbody></table>
      </div>
    `);
    try {
      harness.dom.window.history.replaceState(null, '', '/mercearia?page=13&id_colecao=123');
      const pages = new Map([
        ['1', `
          <div class="products-view__options">3 produtos ordenados por:</div>
          <table><tbody><tr class="product-card-logged"><td data-codigo-produto="123" data-nome="CAFÉ" data-preco="12.50" data-id-embalagem="7891234567890"></td><td>Embalagem: UN</td></tr></tbody></table>
        `],
        ['2', `
          <div class="products-view__options">3 produtos ordenados por:</div>
          <div class="products-list__body__last-page"><table><tbody><tr class="product-card-logged"><td data-codigo-produto="456" data-nome="AÇÚCAR" data-preco="8.75" data-id-embalagem="7891234567891"></td><td>Embalagem: UN</td></tr></tbody></table></div>
        `],
      ]);
      const requestedUrls = [];
      harness.dom.window.fetch = async url => {
        requestedUrls.push(url);
        return { ok: true, text: async () => pages.get(new URL(url).searchParams.get('page')) || '' };
      };
      const scope = await harness.send({ action: 'rivershopGetCaptureScope' });
      assert.equal(scope.category, 'MERCEARIA');
      assert.match(scope.url, /\/mercearia\?page=1&id_colecao=123$/);
      const scopes = await harness.send({ action: 'rivershopGetCaptureScopes' });
      assert.equal(scopes.length, 8);
      assert.equal(scopes[1].category, 'HIGIENE E BELEZA');
      assert.match(scopes[7].url, /\/materiais-construcao\?page=1&id_colecao=123$/);

      const capture = await harness.send({ action: 'rivershopCaptureCatalog', jobId: 'teste-progresso' });
      assert.equal(capture.done, true);
      assert.equal(capture.catalogTotal, 3);
      assert.equal(capture.pages, 2);
      assert.equal(capture.products.length, 2);
      assert.equal(capture.products[0].preco, 12.5);
      assert.doesNotMatch(requestedUrls[0], /perpage=/);
      assert.ok(harness.runtimeMessages.some(message => message.action === 'rivershopCaptureProgress'));
      assert.ok(harness.runtimeMessages.some(message => message.completedPages === 2 && message.totalPages === 2));
    } finally {
      harness.dom.window.close();
    }
  });

  it('Rivershop ignora categoria vazia sem interromper a captura', async () => {
    const harness = await createRivershopCaptureDom(`
      <form data-form="selecionarPreferencias"></form>
      <a class="filter-categories__item--current" href="/limpeza">LIMPEZA</a>
    `);
    try {
      harness.dom.window.fetch = async () => ({
        ok: true,
        text: async () => '<form data-form="selecionarPreferencias"></form><h1>LIMPEZA</h1>',
      });
      const capture = await harness.send({ action: 'rivershopCaptureCatalog' });
      assert.equal(capture.done, true);
      assert.equal(capture.skipped, true);
      assert.equal(capture.incomplete, undefined);
      assert.equal(capture.products.length, 0);
      assert.equal(capture.catalogTotal, 0);
    } finally {
      harness.dom.window.close();
    }
  });

  it('Rivershop preserva páginas capturadas quando uma página falha após tentativas', async () => {
    const harness = await createRivershopCaptureDom(`
      <form data-form="selecionarPreferencias"></form>
      <a class="filter-categories__item--current" href="/mercearia">MERCEARIA</a>
    `);
    try {
      let pageTwoAttempts = 0;
      harness.dom.window.fetch = async url => {
        const page = new URL(url).searchParams.get('page');
        if (page === '2') {
          pageTwoAttempts += 1;
          return { ok: false, status: 503, text: async () => '' };
        }
        return {
          ok: true,
          text: async () => `
            <form data-form="selecionarPreferencias"></form>
            <div class="products-view__options">2 produtos ordenados por:</div>
            <button data-click="paginate" data-pages="2"></button>
            <table><tbody><tr class="product-card-logged"><td data-codigo-produto="123" data-nome="CAFÉ" data-preco="12.50" data-id-embalagem="7891234567890"></td><td>Embalagem: UN</td></tr></tbody></table>
          `,
        };
      };
      const capture = await harness.send({ action: 'rivershopCaptureCatalog', jobId: 'teste-parcial' });
      assert.equal(capture.done, true);
      assert.equal(capture.incomplete, true);
      assert.equal(capture.products.length, 1);
      assert.equal(pageTwoAttempts, 3);
      assert.match(capture.warnings.join(' '), /Página 2/);
    } finally {
      harness.dom.window.close();
    }
  });

  it('Super 20 reconhece EAN e altera somente o input de preço', () => {
    const manifest = readJson('chrome-extension/manifest.json');
    const contentJs = readText('chrome-extension/content.js');
    const popupJs = readText('chrome-extension/popup.js');

    assert.ok(manifest.host_permissions.includes('http://200.160.111.171:8082/*'));
    assert.match(contentJs, /super20-cotacao/);
    assert.match(contentJs, /input\[name\$="\.preco"\]/);
    assert.match(contentJs, /input\[name\$="\.codbarras"\]/);
    assert.match(popupJs, /function isSuper20CotacaoUrl/);
  });

  it('Hipcomerp usa fluxo paginado com trava antes de salvar', () => {
    const manifest = readJson('chrome-extension/manifest.json');
    const popupJs = readText('chrome-extension/popup.js');
    const contentJs = readText('chrome-extension/content.js');
    const hipcomBridgeJs = readText('chrome-extension/hipcom-main-world.js');

    assert.equal(manifest.version, '1.0.81');
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

    assert.equal(manifest.version, '1.0.81');
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

  it('Estancia lê a quantidade numérica da coluna e calcula o valor da embalagem', async () => {
    const manifest = readJson('chrome-extension/manifest.json');
    const popupJs = readText('chrome-extension/popup.js');
    const contentJs = readText('chrome-extension/content.js');

    assert.equal(manifest.version, '1.0.81');
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
            <td>48</td>
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
    assert.equal(dom.window.eval("getEstanciaPackageQtyFromText('CX 48')"), 48);

    const fillResult = await dom.window.eval(`
      fillQuotationPrices([{
        idx: 0,
        ean: '7898085943809',
        nome: 'sab davene leite de aveia classico',
        signature: ${JSON.stringify(items[0].signature)},
        price: '2,50',
        qtdEmbalagem: 1
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
