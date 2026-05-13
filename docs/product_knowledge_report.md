# Product Knowledge - primeira versao

Data: 2026-05-13

## Como o sistema atual funciona

O matching principal continua em `backend/services/matching_engine.py`.
Ele normaliza nomes com `normalizar_nome`, compara candidatos por EAN e por
similaridade textual, e usa travas para impedir falsos positivos por marca,
categoria, embalagem, peso, sabor e subtipo.

## Falhas observadas

- Muitas marcas, sabores e fragrancias estavam dentro do codigo-fonte.
- O matcher corrigia falsos positivos caso a caso.
- Nomes ambigueos como `molho`, `pinho`, `lavanda`, `tradicional` e sabores
  precisavam de contexto de categoria.
- Produtos com muitas variacoes precisam separar marca, categoria, linha,
  sabor/fragrancia e medida antes do match por similaridade.

## Melhorias feitas

- Criado `backend/data/product_knowledge.json` com base externa curada.
- Criado `backend/services/product_knowledge.py` para:
  - carregar a base JSON;
  - normalizar texto, acentos, pontuacao, espacos e unidades;
  - reconhecer categoria, marca, linha, sabor, fragrancia, peso, volume,
    embalagem e confianca;
  - retornar alertas e hipoteses quando houver ambiguidade.
- Criado `backend/tests/test_product_knowledge.py` cobrindo exemplos reais.

## Fontes usadas

- Mondelez/Tang: https://www.mondelezinternational.com/our-brands/tang/index.html
- Pao de Acucar Tang Laranja 18g: https://www.paodeacucar.com/produto/1433063/refresco-em-po-tang-laranja-18g
- Pao de Acucar Tang Uva 18g: https://www.paodeacucar.com/produto/1433068/refresco-em-po-uva-tang-pacote-18g
- Pao de Acucar Tang Morango 18g: https://www.paodeacucar.com/produto/1433072/refresco-em-po-morango-tang-pacote-18g
- Pao de Acucar Tang Maracuja 18g: https://www.paodeacucar.com/produto/1433061/refresco-em-po-maracuja-tang-pacote-18g
- Ype Desinfetante Pinho Lavanda: https://www.ype.ind.br/produtos/desinfetante-ype-pinho-lavanda
- Ype Desinfetante BAK Lavanda: https://www.ype.ind.br/produtos/desinfetante-bak-ype-lavanda
- Ype Detergente Atol Neutro: https://www.ype.ind.br/produtos/detergente-atol-neutro
- Ype Amaciante Concentrado Delicado: https://www.ype.ind.br/produtos/amaciante-concentrado-ype-delicado
- Comfort Lavanda: https://www.comfort.com.br/products/catalog/amaciante-lavanda.html
- Casa K&M Casa & Perfume: https://www.casakm.com.br/casa---perfume-limpador-perfumado-sensazione-1l/p
- Lepok Veja Multiuso Lavanda 500ml: https://www.lepok.com.br/produto/Veja-Multiuso-Lavanda-E-Alcool-500ml/12868

Fontes de varejo foram usadas apenas quando a informacao de sabor/apresentacao
nao estava facilmente disponivel em uma pagina oficial do fabricante.

## Exemplo de saida

Entrada:

```text
ref po tang laranja 18g
```

Saida esperada:

```json
{
  "descricao_original": "ref po tang laranja 18g",
  "descricao_normalizada": "ref po tang laranja 18g",
  "categoria": "refresco em po",
  "subcategoria": "bebida em po",
  "marca": "Tang",
  "linha": null,
  "nome_comercial": null,
  "sabor": "laranja",
  "fragrancia": null,
  "peso": "18g",
  "volume": null,
  "unidade": null,
  "embalagem": null,
  "confianca": 0.95,
  "alertas": []
}
```

## Limitacoes restantes

- A base ainda e pequena e cobre apenas a primeira leva: Tang, Ype, Comfort,
  Casa & Perfume e Veja em exemplos especificos.
- O parser novo ainda nao substitui o matching de preco. Ele e uma camada
  paralela para reconhecimento estruturado e deve ser integrado ao matcher com
  cuidado, categoria por categoria.
- Marcas como UAU, Azulim, Coala, Pinho Sol, Omo, Ariel, Seda, Pantene,
  Rexona, Dove, Nivea e outras ainda precisam de curadoria com fonte.
- Sabores e fragrancias genericas sao usados com confianca menor quando nao
  estao ligados a uma marca/fonte especifica.
