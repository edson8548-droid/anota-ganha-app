const API_URL = 'https://api.venpro.com.br/api';

const statusEl = document.getElementById('status');
const tabelasEl = document.getElementById('tabelas');
const prazoEl = document.getElementById('prazo');
const modoEl = document.getElementById('modo');
const btnEl = document.getElementById('btnPreencher');
const resultsEl = document.getElementById('results');

function setStatus(text, type = 'info') {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
}

// Get Firebase token from Venpro's context
async function getToken() {
  try {
    const resp = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'getToken' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
    return resp?.token;
  } catch {
    return null;
  }
}

// Fetch tabelas from Venpro API
async function fetchTabelas(token) {
  const resp = await fetch(`${API_URL}/cotacao/tabelas`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Erro ${resp.status}`);
  return resp.json();
}

// Load tabelas
async function loadTabelas() {
  try {
    const token = await getToken();
    if (!token) {
      setStatus('Faça login no venpro.com.br primeiro.', 'err');
      return;
    }

    const tabelas = await fetchTabelas(token);
    tabelasEl.innerHTML = '';

    if (tabelas.length === 0) {
      tabelasEl.innerHTML = '<option value="">Nenhuma tabela cadastrada</option>';
      setStatus('Nenhuma tabela encontrada. Cadastre no Venpro.', 'err');
      return;
    }

    tabelas.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.nome} (${t.qtd_produtos} produtos)`;
      tabelasEl.appendChild(opt);
    });

    tabelasEl.disabled = false;
    btnEl.disabled = false;
    setStatus(`${tabelas.length} tabela(s) disponível(is).`, 'ok');
  } catch (err) {
    setStatus('Erro ao carregar tabelas. Faça login no Venpro.', 'err');
    console.error(err);
  }
}

// Check if we're on Cotatudo
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0]?.url || '';
  if (url.includes('cotatudo.com.br')) {
    setStatus('Página Cotatudo detectada. Carregando tabelas...', 'info');
    loadTabelas();
  } else {
    setStatus('Abra uma cotação no cotatudo.com.br primeiro.', 'err');
    tabelasEl.innerHTML = '<option value="">Necessário estar no Cotatudo</option>';
  }
});

// Fill button click
btnEl.addEventListener('click', async () => {
  const tabelaId = tabelasEl.value;
  const prazo = parseInt(prazoEl.value);
  const modo = modoEl.value;

  if (!tabelaId) {
    setStatus('Selecione uma tabela.', 'err');
    return;
  }

  btnEl.disabled = true;
  btnEl.textContent = 'Processando...';
  setStatus('Lendo itens da cotação e buscando preços...', 'info');
  resultsEl.style.display = 'none';

  try {
    const token = await getToken();
    if (!token) {
      setStatus('Token expirado. Faça login no Venpro.', 'err');
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Step 1: Extract items from Cotatudo table
    const extractResult = await chrome.tabs.sendMessage(tab.id, { action: 'extractItems' });

    if (!extractResult.items || extractResult.items.length === 0) {
      setStatus('Nenhum item encontrado na tabela. Abra a cotação.', 'err');
      btnEl.disabled = false;
      btnEl.textContent = 'Preencher Cotação';
      return;
    }

    setStatus(`Enviando ${extractResult.items.length} itens para busca de preços...`, 'info');

    // Step 2: Send items to Venpro API for matching
    const matchResp = await fetch(`${API_URL}/cotacao/match-cotatudo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tabela_id: tabelaId,
        prazo: prazo,
        modo: modo,
        itens: extractResult.items,
      }),
    });

    if (!matchResp.ok) {
      const errText = await matchResp.text();
      let msg = `Erro ${matchResp.status}`;
      try { msg = JSON.parse(errText).detail || msg; } catch {}
      throw new Error(msg);
    }

    const matchData = await matchResp.json();

    // Step 3: Fill prices in Cotatudo
    const fillResult = await chrome.tabs.sendMessage(tab.id, {
      action: 'fillPrices',
      prices: matchData.precos,
    });

    // Show results
    resultsEl.style.display = 'block';
    const { preenchidos, total, nao_encontrados } = matchData.stats;
    resultsEl.innerHTML = `
      <div class="ok">Preenchidos: ${preenchidos} preços</div>
      ${nao_encontrados > 0 ? `<div class="warn">Não encontrados: ${nao_encontrados}</div>` : ''}
      <div style="margin-top:4px; color:#A0A3A8;">Total: ${total} itens processados</div>
    `;
    setStatus('Preenchimento concluído!', 'ok');
  } catch (err) {
    setStatus(`Erro: ${err.message}`, 'err');
    console.error(err);
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = 'Preencher Cotação';
  }
});
