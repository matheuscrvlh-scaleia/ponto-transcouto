import { useState, type FormEvent } from 'react'
import { Campo } from '../../components/Campo'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import { errosDeCampos, mensagemDeErro } from '../../lib/erros'
import { dataHoraLocalParaIso, formatarData, formatarDiaSemana, isoParaDataHoraLocal } from '../../lib/formato'
import type { DataHoraISO, DataISO, TipoCiclo } from '../../types/api'

export interface CicloParaAjuste {
  ciclo_id: number
  titulo: string
  tipo: TipoCiclo
  data_referencia: DataISO
  gatilho_em: DataHoraISO
  gatilho_previsto_em: DataHoraISO
}

export function ModalGatilho({ ciclo, onFechar, onSalvo }: { ciclo: CicloParaAjuste; onFechar: () => void; onSalvo: () => void }) {
  const [valor, setValor] = useState(() => isoParaDataHoraLocal(ciclo.gatilho_em))
  const [motivo, setMotivo] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function salvar(event: FormEvent) {
    event.preventDefault()
    const gatilho = dataHoraLocalParaIso(valor)
    const locais: Record<string, string> = {}
    if (!gatilho) locais.gatilho_em = 'Informe data e hora.'
    if (motivo.trim().length < 5) locais.motivo = 'Informe o motivo (mín. 5 caracteres).'
    setErros(locais)
    setErro('')
    if (Object.keys(locais).length) return

    setEnviando(true)
    try {
      await api(`/admin/ciclos/${ciclo.ciclo_id}/gatilho`, {
        method: 'PATCH',
        json: { gatilho_em: gatilho, motivo: motivo.trim() },
      })
      onSalvo()
    } catch (e) {
      setErros(errosDeCampos(e))
      setErro(mensagemDeErro(e))
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={`Ajustar gatilho — ${ciclo.titulo}`} onFechar={onFechar}>
      <form className="modal-form" onSubmit={salvar} noValidate>
        <p className="modal-texto">
          Ciclo com dados até <strong>{formatarData(ciclo.data_referencia)}</strong>
          {ciclo.tipo === 'fechamento_mes' && ' (fechamento do mês)'}. Regra calculada:{' '}
          <strong>{formatarDiaSemana(ciclo.gatilho_previsto_em)}</strong>. Vale para todas as unidades do ciclo.
        </p>
        <Campo rotulo="Nova data e hora (horário de Brasília)" erro={erros.gatilho_em}>
          {(props) => (
            <input {...props} type="datetime-local" value={valor} onChange={(event) => setValor(event.target.value)} data-autofoco />
          )}
        </Campo>
        <Campo rotulo="Motivo" erro={erros.motivo} ajuda="Fica registrado na auditoria.">
          {(props) => <textarea {...props} value={motivo} onChange={(event) => setMotivo(event.target.value)} maxLength={500} />}
        </Campo>
        {erro && (
          <p className="form-erro" role="alert">
            {erro}
          </p>
        )}
        <div className="form-acoes">
          <button type="button" className="btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar gatilho'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
