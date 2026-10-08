import { Horas } from '../../components/Horas'
import { IconeAlerta, IconeCheck } from '../../components/Icones'
import { SeloTempoReal } from '../../components/SeloTempoReal'
import { MINUTOS_NO_DIA, type Indicadores } from '../../lib/historico-dias'
import {
  dataDoInstante,
  formatarData,
  formatarHora,
  formatarHoraOuData,
  formatarMinutos,
  hojeISO,
} from '../../lib/formato'
import type { ColaboradorDetalhe, Limites, Minutos } from '../../types/api'

type Resumo = NonNullable<ColaboradorDetalhe['resumo']>

/** Fotografia: "em dd/mm/aaaa"; tempo real: "Atualizado às HH:MM de hoje". */
export function referenciaResumo(resumo: Resumo, tempoReal: boolean) {
  if (resumo.fonte !== 'tempo_real') {
    // empresa em tempo real, mas este colaborador ainda não teve a vez dele na atualização ao vivo
    return tempoReal
      ? `Aguardando atualização ao vivo · dados de ${formatarData(resumo.data_referencia)}`
      : `Fechamento de ${formatarData(resumo.data_referencia)}`
  }
  if (resumo.atualizado_em) {
    return dataDoInstante(resumo.atualizado_em) === hojeISO()
      ? `Atualizado às ${formatarHora(resumo.atualizado_em)} de hoje`
      : `Atualizado em ${formatarHoraOuData(resumo.atualizado_em, { comData: true })}`
  }
  return resumo.data_referencia === hojeISO() ? 'Dados até hoje' : `Dados até ${formatarData(resumo.data_referencia)}`
}

export type TipoEstado = 'acima' | 'abaixo' | 'dentro'

/** Onde o saldo está em relação aos limites do banco (mesma regra do alerta: no limite já conta como fora). */
export function estadoDoLimite(saldo: Minutos, { alerta_pos, alerta_neg }: Limites): { tipo: TipoEstado; texto: string } {
  if (saldo >= alerta_pos) {
    return { tipo: 'acima', texto: `${formatarMinutos(saldo - alerta_pos)} acima do limite de +${formatarMinutos(alerta_pos)}` }
  }
  if (saldo <= -alerta_neg) {
    return { tipo: 'abaixo', texto: `${formatarMinutos(-saldo - alerta_neg)} abaixo do limite de −${formatarMinutos(alerta_neg)}` }
  }
  if (saldo > 0) {
    return { tipo: 'dentro', texto: `Dentro do limite · faltam ${formatarMinutos(alerta_pos - saldo)} para +${formatarMinutos(alerta_pos)}` }
  }
  if (saldo < 0) {
    return { tipo: 'dentro', texto: `Dentro do limite · faltam ${formatarMinutos(alerta_neg + saldo)} para −${formatarMinutos(alerta_neg)}` }
  }
  return { tipo: 'dentro', texto: 'Dentro do limite · banco zerado' }
}

function IconeEstado({ tipo }: { tipo: TipoEstado }) {
  if (tipo === 'dentro') return <IconeCheck tamanho={14} />
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d={tipo === 'acima' ? 'M5 1 9.5 9h-9L5 1Z' : 'M5 9 .5 1h9L5 9Z'} fill="currentColor" />
    </svg>
  )
}

/** Régua com o saldo entre o limite negativo e o positivo; fora deles a faixa fica tingida. */
function MedidorLimite({ saldo, limites, tipo }: { saldo: Minutos; limites: Limites; tipo: TipoEstado }) {
  const { alerta_pos: pos, alerta_neg: neg } = limites
  const folga = (pos + neg) * 0.18
  const min = Math.min(-neg - folga, saldo - folga / 2)
  const max = Math.max(pos + folga, saldo + folga / 2)
  const pct = (valor: number) => ((valor - min) / (max - min)) * 100

  return (
    <div className="dc-medidor" aria-hidden="true">
      <div className="dc-medidor-trilho">
        <span className="dc-medidor-zona dc-medidor-zona-neg" style={{ left: 0, width: `${pct(-neg)}%` }} />
        <span className="dc-medidor-zona dc-medidor-zona-pos" style={{ left: `${pct(pos)}%`, right: 0 }} />
      </div>
      <span className={`dc-medidor-marca dc-estado-${tipo}`} style={{ left: `${pct(saldo)}%` }} />
      <div className="dc-medidor-escala">
        <span style={{ left: `${pct(-neg)}%` }}>{`−${formatarMinutos(neg)}`}</span>
        <span style={{ left: `${pct(0)}%` }}>0</span>
        <span style={{ left: `${pct(pos)}%` }}>{`+${formatarMinutos(pos)}`}</span>
      </div>
    </div>
  )
}

interface Props {
  colaborador: ColaboradorDetalhe
  tempoReal: boolean
  /** Dias do período do resumo; null enquanto o detalhe por dia não carregou ou falhou. */
  indicadores: Indicadores | null
  /** Limite diário da empresa (0 = não configurado). */
  limiteDia: { extra_dia: Minutos; negativa_dia: Minutos }
}

/** Banco acumulado em destaque (com o estado em relação ao limite) e os números do período. */
export function ResumoBanco({ colaborador, tempoReal, indicadores, limiteDia }: Props) {
  const resumo = colaborador.resumo
  if (!resumo) return null

  const estado = estadoDoLimite(resumo.saldo_min, colaborador.limites)
  const aoVivo = resumo.fonte === 'tempo_real'
  const periodo = `${formatarData(resumo.periodo_inicio, { ano: false })} a ${formatarData(resumo.data_referencia, { ano: false })}`
  const temLimiteDia = limiteDia.extra_dia > 0 || limiteDia.negativa_dia > 0
  const limitesTexto = [
    limiteDia.extra_dia > 0 && `extras acima de ${formatarMinutos(limiteDia.extra_dia)}`,
    limiteDia.negativa_dia > 0 && `negativas acima de ${formatarMinutos(limiteDia.negativa_dia)}`,
  ].filter(Boolean)

  return (
    <div className="dc-resumo">
      <section className="dc-banco" aria-labelledby="dc-banco-rotulo">
        <div className="dc-banco-topo">
          <h2 className="dc-rotulo" id="dc-banco-rotulo">
            Banco acumulado atual
          </h2>
          {aoVivo && <SeloTempoReal />}
        </div>
        <Horas minutos={resumo.saldo_min} sinal destacar className="dc-banco-valor" />
        <p className={`dc-estado dc-estado-${estado.tipo}`}>
          <IconeEstado tipo={estado.tipo} />
          {estado.texto}
        </p>
        <MedidorLimite saldo={resumo.saldo_min} limites={colaborador.limites} tipo={estado.tipo} />
        <p className="dc-banco-ref">{referenciaResumo(resumo, tempoReal)}</p>
      </section>

      <dl className="dc-tiles" aria-label={`Números do período de ${periodo}`}>
        <div className="dc-tile">
          <dt>Extras no período</dt>
          <dd>
            <Horas minutos={resumo.extra_min} />
            <span className="dc-tile-sub">{periodo}</span>
          </dd>
        </div>
        <div className="dc-tile">
          <dt>Negativas no período</dt>
          <dd>
            <Horas minutos={resumo.negativa_min} />
            <span className="dc-tile-sub">{periodo}</span>
          </dd>
        </div>
        <div className="dc-tile">
          <dt>Pagas no período</dt>
          <dd>
            <Horas minutos={resumo.pagas_min} />
            <span className="dc-tile-sub">{periodo}</span>
          </dd>
        </div>

        <div className={`dc-tile${indicadores && indicadores.diasAcima > 0 ? ' dc-tile-alerta' : ''}`}>
          <dt>Dias acima do limite diário</dt>
          <dd>
            {!temLimiteDia ? (
              <>
                <span className="dc-zero">—</span>
                <span className="dc-tile-sub">Limite diário não configurado para a empresa.</span>
              </>
            ) : indicadores ? (
              <>
                {indicadores.diasAcima}
                <span className="dc-tile-sub">
                  {indicadores.diasComDados > 0
                    ? `de ${indicadores.diasComDados} ${indicadores.diasComDados === 1 ? 'dia' : 'dias'} com horas · ${limitesTexto.join(' ou ')}`
                    : 'Ainda sem horas por dia neste período.'}
                </span>
              </>
            ) : (
              <>
                <span className="dc-zero">—</span>
                <span className="dc-tile-sub">Detalhe por dia indisponível.</span>
              </>
            )}
          </dd>
        </div>

        <div className={`dc-tile${indicadores?.maiorExtra?.suspeito ? ' dc-tile-alerta' : ''}`}>
          <dt>Maior extra em um dia</dt>
          <dd>
            {indicadores?.maiorExtra ? (
              <>
                <Horas minutos={indicadores.maiorExtra.minutos} />
                <span className="dc-tile-sub">
                  em {formatarData(indicadores.maiorExtra.dia, { ano: false })}
                  {indicadores.maiorExtra.suspeito && (
                    <span className="dc-aviso-texto">
                      {' '}
                      · mais que {formatarMinutos(MINUTOS_NO_DIA)}: confira as batidas
                    </span>
                  )}
                  {indicadores.maiorNegativa && (
                    <>
                      <br />
                      Maior negativa {formatarMinutos(indicadores.maiorNegativa.minutos)} em{' '}
                      {formatarData(indicadores.maiorNegativa.dia, { ano: false })}
                    </>
                  )}
                </span>
              </>
            ) : (
              <>
                <span className="dc-zero">—</span>
                <span className="dc-tile-sub">
                  {indicadores ? 'Nenhuma hora extra por dia neste período.' : 'Detalhe por dia indisponível.'}
                </span>
              </>
            )}
          </dd>
        </div>

        <div className={`dc-tile${indicadores && indicadores.diasParaConferir > 0 ? ' dc-tile-alerta' : ''}`}>
          <dt>Dias para conferir</dt>
          <dd>
            {indicadores ? (
              <>
                {indicadores.diasParaConferir}
                <span className="dc-tile-sub">
                  {indicadores.diasParaConferir > 0 && <IconeAlerta tamanho={13} />}
                  {indicadores.diasParaConferir > 0
                    ? 'Batida faltando, fora de ordem ou extra maior que 24h.'
                    : 'Nenhuma batida estranha no período.'}
                </span>
              </>
            ) : (
              <>
                <span className="dc-zero">—</span>
                <span className="dc-tile-sub">Detalhe por dia indisponível.</span>
              </>
            )}
          </dd>
        </div>
      </dl>
    </div>
  )
}
