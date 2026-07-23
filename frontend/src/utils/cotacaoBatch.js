import { criarArquivoCotacaoEncadeado, defaultCotacaoFilename } from './cotacaoFileChain';

export async function processarTabelasEmSequencia({
  arquivoInicial,
  selecoes,
  processarTabela,
  onProgress,
}) {
  if (!(arquivoInicial instanceof Blob)) {
    throw new TypeError('Selecione um arquivo de cotação válido.');
  }
  if (!Array.isArray(selecoes) || selecoes.length < 2) {
    throw new Error('Selecione pelo menos duas tabelas de preço.');
  }
  if (typeof processarTabela !== 'function') {
    throw new TypeError('O processador de tabelas é obrigatório.');
  }

  let arquivoAtual = arquivoInicial;
  const resultados = [];

  for (let index = 0; index < selecoes.length; index += 1) {
    const selecao = selecoes[index];
    onProgress?.({
      etapa: 'processando',
      atual: index + 1,
      concluidas: index,
      total: selecoes.length,
      selecao,
    });

    const resultado = await processarTabela({
      arquivo: arquivoAtual,
      selecao,
      index,
      total: selecoes.length,
    });
    if (!(resultado?.blob instanceof Blob)) {
      throw new TypeError(`A tabela "${selecao.nome}" não retornou um Excel válido.`);
    }

    arquivoAtual = criarArquivoCotacaoEncadeado(
      resultado.blob,
      defaultCotacaoFilename(arquivoAtual)
    );
    resultados.push({ selecao, ...resultado });

    onProgress?.({
      etapa: 'concluida',
      atual: index + 1,
      concluidas: index + 1,
      total: selecoes.length,
      selecao,
    });
  }

  return { arquivoFinal: arquivoAtual, resultados };
}
