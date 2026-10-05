import { useRef } from 'react'
import { alertarErro, alertarSucesso } from '../lib/alertas'
import { Modal } from './Modal'

async function copiar(texto: string, alvo: HTMLElement | null) {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    if (!alvo) return false
    const selecao = window.getSelection()
    const intervalo = document.createRange()
    intervalo.selectNodeContents(alvo)
    selecao?.removeAllRanges()
    selecao?.addRange(intervalo)
    try {
      return document.execCommand('copy')
    } catch {
      return false
    }
  }
}

export function ModalSenhaTemporaria({ nome, senha, onFechar }: { nome: string; senha: string; onFechar: () => void }) {
  const codigo = useRef<HTMLElement>(null)

  return (
    <Modal titulo="Senha temporária" onFechar={onFechar}>
      <div className="modal-form">
        <p className="modal-texto">
          Senha temporária de <strong>{nome}</strong>. Ela é exibida <strong>somente agora</strong>; no primeiro acesso a
          pessoa será obrigada a trocá-la.
        </p>
        <div className="senha-exibida">
          <code ref={codigo} aria-label="Senha temporária">
            {senha}
          </code>
          <button
            type="button"
            className="btn-secondary"
            data-autofoco
            onClick={async () => {
              if (await copiar(senha, codigo.current)) alertarSucesso('Senha copiada para a área de transferência.')
              else alertarErro('Não foi possível copiar automaticamente. Selecione a senha e copie manualmente.')
            }}
          >
            Copiar
          </button>
        </div>
        <div className="form-acoes">
          <button type="button" className="btn-primary" onClick={onFechar}>
            Já anotei, fechar
          </button>
        </div>
      </div>
    </Modal>
  )
}
