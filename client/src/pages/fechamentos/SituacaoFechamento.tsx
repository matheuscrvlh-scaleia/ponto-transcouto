import { PilulaStatus } from '../../components/PilulaStatus'
import { formatarQuando } from '../../lib/formato'
import type { FechamentoAdmin } from '../../types/api'
import { aguardandoRetomada, estaAtrasado, pausadoPorCota } from './fechamentos-util'

/** Situação do fechamento: pausado pela cota e "nova tentativa" ganham texto próprio (com quando retoma). */
export function SituacaoFechamento({ fechamento, comRetomada = true }: { fechamento: FechamentoAdmin; comRetomada?: boolean }) {
  const retomaEm = fechamento.proxima_tentativa_em

  if (aguardandoRetomada(fechamento) && retomaEm) {
    const cota = pausadoPorCota(fechamento)
    return (
      <span className="fech-situacao">
        <span className={cota ? 'pilula pilula-pausada' : 'pilula pilula-pendente'}>
          {cota ? 'Pausada pela cota' : 'Nova tentativa agendada'}
        </span>
        {comRetomada && <span className="celula-sub">Retoma {formatarQuando(retomaEm)}</span>}
      </span>
    )
  }

  return <PilulaStatus status={fechamento.status} atrasado={estaAtrasado(fechamento)} />
}
