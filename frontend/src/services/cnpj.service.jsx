// Serviço de CNPJ - Múltiplas APIs para maior confiabilidade

class CNPJService {
  constructor() {
    // Lista de APIs em ordem de prioridade
    this.apis = [
      {
        name: 'ReceitaWS',
        url: (cnpj) => `https://receitaws.com.br/v1/cnpj/${cnpj}`,
        parser: (data) => ({
          nome: data.nome || data.fantasia,
          fantasia: data.fantasia,
          cnpj: data.cnpj,
          telefone: data.telefone,
          email: data.email,
          logradouro: data.logradouro,
          numero: data.numero,
          complemento: data.complemento,
          bairro: data.bairro,
          municipio: data.municipio,
          uf: data.uf,
          cep: data.cep
        })
      },
      {
        name: 'BrasilAPI',
        url: (cnpj) => `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
        parser: (data) => ({
          nome: data.razao_social,
          fantasia: data.nome_fantasia,
          cnpj: data.cnpj,
          telefone: data.ddd_telefone_1 || data.telefone,
          email: data.email || '',
          logradouro: data.logradouro,
          numero: data.numero,
          complemento: data.complemento,
          bairro: data.bairro,
          municipio: data.municipio,
          uf: data.uf,
          cep: data.cep
        })
      },
      {
        name: 'CNPJA',
        url: (cnpj) => `https://publica.cnpj.ws/cnpj/${cnpj}`,
        parser: (data) => ({
          nome: data.razao_social || data.estabelecimento?.nome_fantasia,
          fantasia: data.estabelecimento?.nome_fantasia,
          cnpj: data.estabelecimento?.cnpj,
          telefone: data.estabelecimento?.ddd1 + data.estabelecimento?.telefone1,
          email: data.estabelecimento?.email || '',
          logradouro: data.estabelecimento?.tipo_logradouro + ' ' + data.estabelecimento?.logradouro,
          numero: data.estabelecimento?.numero,
          complemento: data.estabelecimento?.complemento,
          bairro: data.estabelecimento?.bairro,
          municipio: data.estabelecimento?.cidade?.nome,
          uf: data.estabelecimento?.estado?.sigla,
          cep: data.estabelecimento?.cep
        })
      }
    ];
  }

  formatCNPJ(cnpj) {
    const cleaned = cnpj.replace(/\D/g, '');
    return cleaned.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      '$1.$2.$3/$4-$5'
    );
  }

  cleanCNPJ(cnpj) {
    return cnpj.replace(/\D/g, '');
  }

  validateCNPJ(cnpj) {
    const cleaned = this.cleanCNPJ(cnpj);
    
    if (cleaned.length !== 14) {
      return false;
    }

    // Validação básica de dígitos verificadores
    if (/^(\d)\1+$/.test(cleaned)) {
      return false;
    }

    return true;
  }

  async fetchFromAPI(api, cnpj) {
    try {
      const response = await fetch(api.url(cnpj), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // Verificar se a resposta contém erro
      if (data.status === 'ERROR' || data.error) {
        throw new Error(data.message || 'Dados não encontrados');
      }

      return api.parser(data);
    } catch (error) {
      console.error(`Erro na API ${api.name}:`, error);
      throw error;
    }
  }

  async fetchCNPJ(cnpj) {
    const cleaned = this.cleanCNPJ(cnpj);

    if (!this.validateCNPJ(cleaned)) {
      throw new Error('CNPJ inválido. Verifique o número digitado.');
    }

    // Tentar cada API em sequência até uma funcionar
    let lastError = null;

    for (const api of this.apis) {
      try {
        console.log(`Tentando buscar CNPJ na API: ${api.name}`);
        const data = await this.fetchFromAPI(api, cleaned);
        console.log(`✅ Sucesso com API: ${api.name}`);
        return data;
      } catch (error) {
        console.warn(`❌ Falha na API ${api.name}:`, error.message);
        lastError = error;
        continue; // Tentar próxima API
      }
    }

    // Se todas as APIs falharam
    throw new Error(
      'Não foi possível buscar os dados do CNPJ. ' +
      'Por favor, preencha manualmente ou tente novamente mais tarde.\n' +
      `Erro: ${lastError?.message || 'Todas as APIs falharam'}`
    );
  }

  // Método de fallback - dados mock para desenvolvimento
  async fetchCNPJMock(cnpj) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      nome: 'EMPRESA EXEMPLO LTDA',
      fantasia: 'Empresa Exemplo',
      cnpj: this.formatCNPJ(cnpj),
      telefone: '(13) 3333-3333',
      email: 'contato@exemplo.com.br',
      logradouro: 'Rua Exemplo',
      numero: '123',
      complemento: 'Sala 1',
      bairro: 'Centro',
      municipio: 'São Paulo',
      uf: 'SP',
      cep: '01234-567'
    };
  }
}

export const cnpjService = new CNPJService();