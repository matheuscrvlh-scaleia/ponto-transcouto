/* Aviso entre telas: "acabei de pedir algo à FriPonto". O indicador de sincronização
   consulta a atividade na hora, em vez de esperar a próxima consulta periódica. */

const EVENTO = 'copiloto:sincronizacao-pedida'

export function avisarSincronizacaoPedida() {
  window.dispatchEvent(new Event(EVENTO))
}

export function ouvirSincronizacaoPedida(fn: () => void) {
  window.addEventListener(EVENTO, fn)
  return () => window.removeEventListener(EVENTO, fn)
}
