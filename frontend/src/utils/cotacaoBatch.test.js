import { describe, expect, it, vi } from 'vitest';
import { processarTabelasEmSequencia } from './cotacaoBatch';

describe('processarTabelasEmSequencia', () => {
  it('usa cada resultado como entrada da próxima tabela e devolve um único arquivo final', async () => {
    const arquivoInicial = new File(['original'], 'ALVORADA.xlsx');
    const selecoes = [
      { id: 'spani', nome: 'Spani', prazo: 14 },
      { id: 'muffato', nome: 'Muffato', prazo: 21 },
      { id: 'compre-facil', nome: 'Compre Fácil', prazo: 28 },
    ];
    const nomesRecebidos = [];
    const progresso = vi.fn();
    const processarTabela = vi.fn(async ({ arquivo, selecao }) => {
      nomesRecebidos.push(arquivo.name);
      return {
        blob: new Blob([`${selecao.nome}:${arquivo.size}`]),
        stats: { total: 1 },
        semMatch: [],
      };
    });

    const resultado = await processarTabelasEmSequencia({
      arquivoInicial,
      selecoes,
      processarTabela,
      onProgress: progresso,
    });

    expect(processarTabela).toHaveBeenCalledTimes(3);
    expect(nomesRecebidos).toEqual([
      'ALVORADA.xlsx',
      'ALVORADA_preenchida.xlsx',
      'ALVORADA_preenchida.xlsx',
    ]);
    expect(resultado.arquivoFinal).toBeInstanceOf(File);
    expect(resultado.arquivoFinal.name).toBe('ALVORADA_preenchida.xlsx');
    expect(resultado.resultados.map(item => item.selecao.prazo)).toEqual([14, 21, 28]);
    expect(progresso).toHaveBeenLastCalledWith(expect.objectContaining({
      etapa: 'concluida',
      concluidas: 3,
      total: 3,
    }));
  });

  it('não inicia com menos de duas tabelas', async () => {
    await expect(processarTabelasEmSequencia({
      arquivoInicial: new File(['original'], 'cotacao.xlsx'),
      selecoes: [{ id: 'spani', nome: 'Spani', prazo: 14 }],
      processarTabela: vi.fn(),
    })).rejects.toThrow('Selecione pelo menos duas tabelas');
  });

  it('interrompe sem executar as tabelas seguintes quando uma delas falha', async () => {
    const processarTabela = vi.fn()
      .mockResolvedValueOnce({ blob: new Blob(['primeira']) })
      .mockRejectedValueOnce(new Error('Falha no Muffato'));

    await expect(processarTabelasEmSequencia({
      arquivoInicial: new File(['original'], 'cotacao.xlsx'),
      selecoes: [
        { id: 'spani', nome: 'Spani', prazo: 14 },
        { id: 'muffato', nome: 'Muffato', prazo: 21 },
        { id: 'compre-facil', nome: 'Compre Fácil', prazo: 28 },
      ],
      processarTabela,
    })).rejects.toThrow('Falha no Muffato');

    expect(processarTabela).toHaveBeenCalledTimes(2);
  });
});
