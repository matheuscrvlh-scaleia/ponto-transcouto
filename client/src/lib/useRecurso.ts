import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api'

interface Estado<T> {
  id: string
  chave: string
  dados: T | null
  erro: ApiError | null
  carregando: boolean
}

/** Carrega `buscar()` sempre que `chave` muda; `recarregar` repete a busca mantendo os dados atuais na tela. */
export function useRecurso<T>(buscar: (sinal: AbortSignal) => Promise<T>, chave: string) {
  const buscarRef = useRef(buscar)
  const [versao, setVersao] = useState(0)
  const id = `${chave}#${versao}`
  const [estado, setEstado] = useState<Estado<T>>({ id, chave, dados: null, erro: null, carregando: true })

  if (estado.id !== id) {
    const dados = estado.chave === chave ? estado.dados : null
    setEstado({ id, chave, dados, erro: null, carregando: dados === null })
  }

  useEffect(() => {
    buscarRef.current = buscar
  })

  useEffect(() => {
    const controle = new AbortController()

    buscarRef.current(controle.signal)
      .then((dados) => setEstado({ id, chave, dados, erro: null, carregando: false }))
      .catch((erro: unknown) => {
        if (controle.signal.aborted) return
        setEstado({ id, chave, dados: null, erro: erro instanceof ApiError ? erro : new ApiError(0, null), carregando: false })
      })

    return () => controle.abort()
  }, [id, chave])

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])

  return { dados: estado.dados, erro: estado.erro, carregando: estado.carregando, recarregar }
}
