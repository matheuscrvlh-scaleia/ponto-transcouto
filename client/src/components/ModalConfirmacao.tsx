import { useState, type FormEvent, type ReactNode } from 'react'
import { errosDeCampos } from '../lib/erros'
import { Campo } from './Campo'
import { Modal } from './Modal'
import { alertarFalha } from '../lib/alertas'

const MOTIVO_MINIMO = 5

interface Props {
  titulo: string
  children: ReactNode
  rotuloConfirmar: string
  perigo?: boolean
  motivo?: 'obrigatorio' | 'opcional'
  onConfirmar: (motivo: string | undefined) => Promise<void>
  onFechar: () => void
}

export function ModalConfirmacao({ titulo, children, rotuloConfirmar, perigo, motivo, onConfirmar, onFechar }: Props) {
  const [texto, setTexto] = useState('')
  const [erroMotivo, setErroMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function confirmar(event: FormEvent) {
    event.preventDefault()
    setErroMotivo('')
    const limpo = texto.trim()
    if (motivo === 'obrigatorio' && limpo.length < MOTIVO_MINIMO) {
      return setErroMotivo(`Informe o motivo (mín. ${MOTIVO_MINIMO} caracteres).`)
    }
    if (motivo === 'opcional' && limpo && limpo.length < MOTIVO_MINIMO) {
      return setErroMotivo(`O motivo precisa de ao menos ${MOTIVO_MINIMO} caracteres (ou deixe em branco).`)
    }
    setEnviando(true)
    try {
      await onConfirmar(limpo || undefined)
    } catch (e) {
      setErroMotivo(errosDeCampos(e).motivo ?? '')
      alertarFalha(e)
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={titulo} onFechar={onFechar}>
      <form className="modal-form" onSubmit={confirmar} noValidate>
        <div className="modal-texto">{children}</div>
        {motivo && (
          <Campo rotulo={motivo === 'obrigatorio' ? 'Motivo' : 'Motivo (opcional)'} erro={erroMotivo} ajuda="Fica registrado na auditoria.">
            {(props) => (
              <textarea {...props} value={texto} onChange={(event) => setTexto(event.target.value)} maxLength={500} data-autofoco />
            )}
          </Campo>
        )}
        <div className="form-acoes">
          <button type="button" className="btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className={perigo ? 'btn-primary btn-perigo' : 'btn-primary'} disabled={enviando}>
            {enviando ? 'Enviando...' : rotuloConfirmar}
          </button>
        </div>
      </form>
    </Modal>
  )
}
