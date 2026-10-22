import { formatarDataHora, formatarMinutos, iniciais } from '../lib/formato'
import type { LinhaPainel as Linha } from '../lib/painel'
import './relatorio-colaboradores.css'

/* Versão para "Salvar PDF" da lista de Colaboradores: só aparece na impressão (a tabela da tela
   fica de fora). A4 deitado, um colaborador por linha, resumo no topo e barra do saldo. */

interface Props {
  titulo: string
  empresa: string | null
  /** Com várias unidades, entra a coluna Unidade. */
  consolidado: boolean
  /** Já filtradas e na ordem da tela. */
  linhas: Linha[]
  totalGeral: number
  filtro: string
  ordem: string
  dados: string
  /** Intervalo de datas escolhido: saldo do intervalo (extras − negativas); pagas e curva (do período inteiro) saem. */
  intervalo?: boolean
}

function somar(linhas: Linha[], campo: 'saldo_min' | 'extra_min' | 'negativa_min' | 'pagas_min') {
  return linhas.reduce((soma, linha) => soma + linha[campo], 0)
}

export function RelatorioColaboradores({
  titulo,
  empresa,
  consolidado,
  linhas,
  totalGeral,
  filtro,
  ordem,
  dados,
  intervalo = false,
}: Props) {
  const acima = linhas.filter((linha) => linha.fora_da_curva === 'positivo').length
  const abaixo = linhas.filter((linha) => linha.fora_da_curva === 'negativo').length
  const saldoTotal = somar(linhas, 'saldo_min')
  // a barra do saldo é proporcional ao maior saldo (em módulo) da lista
  const maiorSaldo = Math.max(1, ...linhas.map((linha) => Math.abs(linha.saldo_min)))
  const classeSinal = (min: number) => (min > 0 ? 'rel-pos' : min < 0 ? 'rel-neg' : '')

  return (
    <div className="so-impressao relatorio-colab">
      <header className="rel-topo">
        <div>
          <p className="rel-marca">
            <span className="rel-marca-selo" aria-hidden="true" />
            Copiloto de Ponto{empresa && ` · ${empresa}`}
          </p>
          <h1 className="rel-titulo">Colaboradores — {titulo}</h1>
          <p className="rel-sub">{dados}</p>
        </div>
        <div className="rel-topo-direita">
          <p>Exportado em {formatarDataHora(new Date().toISOString())}</p>
          <p className="rel-chips">
            <span className="rel-chip">Filtro: {filtro}</span>
            <span className="rel-chip">Ordem: {ordem}</span>
          </p>
        </div>
      </header>

      <div className="rel-resumo">
        <div className="rel-caixa rel-caixa-destaque">
          <span className="rel-caixa-rotulo">Colaboradores</span>
          <span className="rel-caixa-valor">{linhas.length}</span>
          <span className="rel-caixa-nota">{linhas.length === totalGeral ? 'todos da lista' : `de ${totalGeral} no painel`}</span>
        </div>
        <div className="rel-caixa">
          <span className="rel-caixa-rotulo">{intervalo ? 'Saldo do intervalo' : 'Saldo do período'}</span>
          <span className={`rel-caixa-valor ${classeSinal(saldoTotal)}`}>{formatarMinutos(saldoTotal, { sinal: true })}</span>
          <span className="rel-caixa-nota">soma da lista</span>
        </div>
        <div className="rel-caixa">
          <span className="rel-caixa-rotulo">Extras</span>
          <span className="rel-caixa-valor">{formatarMinutos(somar(linhas, 'extra_min'))}</span>
          <span className="rel-caixa-nota">total da lista</span>
        </div>
        <div className="rel-caixa">
          <span className="rel-caixa-rotulo">Negativas</span>
          <span className="rel-caixa-valor">{formatarMinutos(somar(linhas, 'negativa_min'))}</span>
          <span className="rel-caixa-nota">total da lista</span>
        </div>
        {!intervalo && (
          <div className="rel-caixa">
            <span className="rel-caixa-rotulo">Pagas</span>
            <span className="rel-caixa-valor">{formatarMinutos(somar(linhas, 'pagas_min'))}</span>
            <span className="rel-caixa-nota">total da lista</span>
          </div>
        )}
        {!intervalo && (
          <div className="rel-caixa">
            <span className="rel-caixa-rotulo">Fora da curva</span>
            <span className="rel-caixa-valor">
              <span className="rel-pos">▲ {acima}</span> <span className="rel-neg">▼ {abaixo}</span>
            </span>
            <span className="rel-caixa-nota">acima · abaixo do limite</span>
          </div>
        )}
      </div>

      <table className={consolidado ? 'rel-tabela com-unidade' : 'rel-tabela'}>
        <thead>
          <tr>
            <th className="rel-col-n">#</th>
            <th className="rel-col-nome">Colaborador</th>
            {consolidado && <th className="rel-col-unidade">Unidade</th>}
            <th className="rel-col-funcao">Função</th>
            <th className="rel-col-saldo">{intervalo ? 'Saldo do intervalo' : 'Saldo do período'}</th>
            <th className="rel-col-horas">Extras</th>
            <th className="rel-col-horas">Negativas</th>
            {!intervalo && <th className="rel-col-horas">Pagas</th>}
            {!intervalo && <th className="rel-col-curva">Situação</th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, indice) => {
            const pct = Math.min(100, (Math.abs(linha.saldo_min) / maiorSaldo) * 100)
            const curva = linha.fora_da_curva
            return (
              <tr key={`${linha.unidade_id ?? ''}-${linha.id}`} className={curva ? `rel-linha-${curva}` : undefined}>
                <td className="rel-col-n">{indice + 1}</td>
                <td className="rel-col-nome">
                  <span className="rel-pessoa">
                    <span className="rel-avatar">{iniciais(linha.nome)}</span>
                    <span className="rel-nome">{linha.nome}</span>
                  </span>
                </td>
                {consolidado && <td className="rel-col-unidade">{linha.unidade_nome ?? '—'}</td>}
                <td className="rel-col-funcao">{linha.funcao ?? '—'}</td>
                <td className="rel-col-saldo">
                  <span className="rel-saldo">
                    <span className={`rel-saldo-valor ${classeSinal(linha.saldo_min)}`}>
                      {formatarMinutos(linha.saldo_min, { sinal: true })}
                    </span>
                    <span className="rel-barra" aria-hidden="true">
                      <span
                        className={linha.saldo_min < 0 ? 'rel-barra-neg' : 'rel-barra-pos'}
                        style={{ width: `${pct / 2}%` }}
                      />
                    </span>
                  </span>
                </td>
                <td className="rel-col-horas">{formatarMinutos(linha.extra_min)}</td>
                <td className="rel-col-horas">{formatarMinutos(linha.negativa_min)}</td>
                {!intervalo && <td className="rel-col-horas">{formatarMinutos(linha.pagas_min)}</td>}
                {!intervalo && (
                  <td className="rel-col-curva">
                    {curva === 'positivo' ? (
                      <span className="rel-curva rel-curva-pos">▲ Acima</span>
                    ) : curva === 'negativo' ? (
                      <span className="rel-curva rel-curva-neg">▼ Abaixo</span>
                    ) : (
                      <span className="rel-curva">Normal</span>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className="rel-rodape">
        Somente leitura · ajustes de ponto são feitos pelo RH na FriPonto · “Acima/Abaixo” segue os limites de fora da
        curva configurados para a empresa.
      </p>
    </div>
  )
}
