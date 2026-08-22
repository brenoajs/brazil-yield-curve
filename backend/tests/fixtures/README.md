# Golden files — Ajustes do Pregão B3 (preços de ajuste DI1)

## Status da fonte HTML original (IMPORTANTE)

A página HTML clássica "Ajustes do Pregão" (`POST
https://www2.bmf.com.br/pages/portal/bmfbovespa/lumis/lum-ajustes-do-pregao-ptBR.asp`
com campo `dData1=dd/mm/yyyy`, tabela `id="tblDadosAjustes"`, encoding ISO-8859-1,
documentada no repo https://github.com/cfassoni/b3ajustes) **está FORA DO AR em produção**.
Desde ~dez/2025 ela responde `301` (Cloudflare) para a página do Boletim Diário:
`https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/consultas/boletim-diario/boletim-diario-do-mercado/`.
O próprio aviso oficial na B3 (página "s_ajuspreg") diz: *"A partir de 10/12/2025, os dados
contidos nesta página passarão a ser disponibilizados apenas no Boletim Diário de Mercado"*.

Fallback alternativo `TxRef1.asp` (repo rafa-rod/pyettj,
`http://www2.bmf.com.br/pages/portal/bmfbovespa/hist/TxRef1.asp?data=dd/mm/yyyy&slcTaxa=PRE`)
também está morto: responde `error code: 520` (Cloudflare).

## URL exata validada (em produção hoje)

Endpoint **GET**, sem sessão/cookie:

```
https://www.b3.com.br/pesquisapregao/download?filelist={PREFIXO}{yymmdd}.zip
```

- `{PREFIXO}`: `SPRD` = simplified price report (~130 KB, só preços de ajuste e OHLC básico)
  ou `PR` = price report completo (~2 MB). Para curva DI1, `SPRD` basta.
- `{yymmdd}`: data de pregão no formato **aammdd** (ex.: `SPRD260820.zip`).
- Referência que confirmou o endpoint: https://github.com/crdcj/PYield — módulo
  `pyield/b3/boletim.py` (`baixar_zip`), mantido e testado contra dados de 2026.

## Estrutura do arquivo baixado

ZIP externo → contém 1–2 ZIPs internos → cada um contém XML(s)
`BVBG.187.01_BV*.xml` (namespace `urn:bvmf.217.01.xsd`). Extrair sempre **o XML mais
recente** (último nome ordenado). Cada contrato é um bloco `<PricRpt>`:

```xml
<PricRpt>
  <TradDt><Dt>2026-08-20</Dt></TradDt>
  <SctyId><TckrSymb>DI1F27</TckrSymb></SckrId>
  <FinInstrmAttrbts>
    <OpnIntrst>6776098</OpnIntrst>          <!-- contratos em aberto -->
    <LastPric Ccy="BRL">13.725</LastPric>   <!-- último preço negociado -->
    <AdjstdQt Ccy="BRL">95461.23</AdjstdQt>   <!-- PREÇO DE AJUSTE (PU, R$ x 1000 DI) -->
    <AdjstdQtTax Ccy="BRL">13.727</AdjstdQtTax><!-- TAXA DE AJUSTE (% a.a., DI1/DAP) -->
    <PrvsAdjstdQt Ccy="BRL">95461.5</PrvsAdjstdQt>      <!-- ajuste dia anterior -->
    <PrvsAdjstdQtTax Ccy="BRL">13.726</PrvsAdjstdQtTax> <!-- taxa dia anterior -->
  </FinInstrmAttrbts>
</PricRpt>
```

Para DI1 usar `AdjstdQtTax` como taxa (% a.a.) e `AdjstdQt` como PU de liquidação.

## Arquivos salvos

| Arquivo | Conteúdo |
|---|---|
| `ajustes_sprd_20260820.zip` | SPRD bruto (20/08/2026, data recente) |
| `ajustes_sprd_20260820.xml` | XML extraído (45 contratos DI1) |
| `ajustes_sprd_20260721.zip` | SPRD bruto (21/07/2026, ~1 mês atrás) |
| `ajustes_sprd_20260721.xml` | XML extraído |

## Pegadinhas de parsing detectadas

1. ZIP aninhado duas vezes (zip externo → zip interno → xml). Não assumir um nível.
2. O ZIP interno pode conter **2 XMLs**; pegar o de nome mais alto (`sorted()[-1]`).
3. Tickers de futuros têm 6 chars (`DI1F27`); filtrar por prefixo + comprimento para não
   pegar opções sobre DI (`DI1xxx...` com 13+ chars).
4. Tags podem ter atributo (`<AdjstdQt Ccy="BRL">`) e o XML tem namespace
   (`urn:bvmf.217.01.xsd`) — usar parser com namespace-aware ou strip de namespace.
5. Campos de negociação podem vir vazios/auto-fechados (ex.: `<TradDtls/>`) para
   contratos sem negócio no dia — mas `<AdjstdQt>` sempre presente (é ajuste oficial).
6. Fim de semana/feriado: o endpoint retorna resposta inválida/pequena (< 1 KB), não 404.
7. Datas disponíveis limitadas ao histórico recente do Boletim Diário; para histórico
   antigo existe o dataset PR cacheado do PYield (parquet no GitHub).
