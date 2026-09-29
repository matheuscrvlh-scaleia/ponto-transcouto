import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useEmpresaSelecionada } from '../../context/EmpresaAdminContext'
import { Aviso, Carregando, ErroCarregamento } from '../../components/Estados'
import { ApiError, api } from '../../lib/api'
import { mensagemDeErro } from '../../lib/erros'
import { useRecurso } from '../../lib/useRecurso'
import type { CampoMapeado, MapeamentoColuna, MapeamentoResposta } from '../../types/api'

const CAMPOS: { valor: CampoMapeado; rotulo: string }[] = [
  { valor: 'extra', rotulo: 'Horas extras' },
  { valor: 'negativa', rotulo: 'Horas negativas' },
  { valor: 'pagas', rotulo: 'Horas pagas' },
  { valor: 'saldo_banco', rotulo: 'Saldo do banco' },
  { valor: 'ignorar', rotulo: 'Ignorar' },
]

interface Linha extends MapeamentoColuna {
  chave: number
}

const normalizar = (coluna: string) => coluna.trim().toLowerCase()

let proximaChave = 0
const criarLinha = (item: MapeamentoColuna): Linha => ({ ...item, chave: proximaChave++ })

function validar(linhas: Linha[]) {
  const porLinha: Record<number, string> = {}
  const gerais: string[] = []
  const vistas = new Map<string, number>()
  for (const linha of linhas) {
    const nome = normalizar(linha.coluna_secullum)
    if (!nome) porLinha[linha.chave] = 'Informe o nome da coluna.'
    else if (vistas.has(nome)) porLinha[linha.chave] = 'Coluna repetida.'
    vistas.set(nome, linha.chave)
  }
  if (linhas.filter((linha) => linha.campo === 'saldo_banco').length > 1) gerais.push('Só uma coluna pode ser o saldo do banco.')
  if (linhas.length && !linhas.some((linha) => linha.campo === 'extra')) gerais.push('Mapeie ao menos uma coluna como horas extras.')
  return { porLinha, gerais }
}

export function MapeamentoColunas() {
  const { empresaId, query } = useEmpresaSelecionada()
  const { dados, erro, carregando, recarregar } = useRecurso(
    (signal) => api<MapeamentoResposta>('/admin/mapeamento-colunas', { signal, query }),
    `mapeamento-${empresaId}`,
  )

  useEffect(() => {
    document.title = 'Mapeamento de colunas — Copiloto de Ponto'
  }, [])

  if (carregando) return <Carregando texto="Carregando mapeamento..." />
  if (erro || !dados) return erro ? <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} /> : null

  return <EditorMapeamento inicial={dados} query={query} />
}

function EditorMapeamento({ inicial, query }: { inicial: MapeamentoResposta; query: { empresa_id?: number } }) {
  const [original, setOriginal] = useState(inicial.mapeamento)
  const [linhas, setLinhas] = useState<Linha[]>(() => inicial.mapeamento.map(criarLinha))
  const [tentouSalvar, setTentouSalvar] = useState(false)
  const [errosServer, setErrosServer] = useState<string[]>([])
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ultimaAdicionada = useRef<number | null>(null)

  const mapeadas = new Set(linhas.map((linha) => normalizar(linha.coluna_secullum)))
  const naoMapeadas = inicial.colunas_detectadas.filter((coluna) => !mapeadas.has(normalizar(coluna)))
  const erros = validar(linhas)
  const alterado =
    JSON.stringify(linhas.map(({ coluna_secullum, campo }) => [coluna_secullum.trim(), campo])) !==
    JSON.stringify(original.map(({ coluna_secullum, campo }) => [coluna_secullum, campo]))

  useEffect(() => {
    if (ultimaAdicionada.current === null) return
    document.getElementById(`coluna-${ultimaAdicionada.current}`)?.focus()
    ultimaAdicionada.current = null
  }, [linhas])

  function atualizar(chave: number, dados: Partial<MapeamentoColuna>) {
    setLinhas((atual) => atual.map((linha) => (linha.chave === chave ? { ...linha, ...dados } : linha)))
    setMensagem('')
  }

  function adicionar(colunas: string[], focar = true) {
    const novas = colunas.map((coluna) => criarLinha({ coluna_secullum: coluna, campo: 'ignorar' }))
    if (focar && novas.length === 1) ultimaAdicionada.current = novas[0].chave
    setLinhas((atual) => [...atual, ...novas])
    setMensagem('')
  }

  async function salvar(event: FormEvent) {
    event.preventDefault()
    setTentouSalvar(true)
    setErrosServer([])
    setMensagem('')
    if (Object.keys(erros.porLinha).length || erros.gerais.length) return

    setEnviando(true)
    try {
      const { mapeamento } = await api<{ mapeamento: MapeamentoColuna[] }>('/admin/mapeamento-colunas', {
        method: 'PUT',
        query,
        json: { mapeamento: linhas.map(({ coluna_secullum, campo }) => ({ coluna_secullum: coluna_secullum.trim(), campo })) },
      })
      setOriginal(mapeamento)
      setLinhas(mapeamento.map(criarLinha))
      setTentouSalvar(false)
      setMensagem('Mapeamento salvo. Vale para as próximas extrações.')
    } catch (e) {
      const campos = e instanceof ApiError ? Object.values(e.campos ?? {}).flat() : []
      setErrosServer(campos.length ? (campos as string[]) : [mensagemDeErro(e)])
    } finally {
      setEnviando(false)
    }
  }

  const mostrarErros = tentouSalvar

  return (
    <section className="pagina">
      <header className="pagina-header">
        <h1>Mapeamento de colunas</h1>
        <p className="pagina-sub">
          O que cada coluna do cálculo de totais da Secullum representa. Colunas não mapeadas fazem a extração falhar.
        </p>
      </header>

      {naoMapeadas.length > 0 && (
        <section className="card" aria-labelledby="titulo-detectadas">
          <div className="card-cabecalho">
            <h2 id="titulo-detectadas">Colunas detectadas sem mapeamento ({naoMapeadas.length})</h2>
            {naoMapeadas.length > 1 && (
              <button type="button" className="btn-link" onClick={() => adicionar(naoMapeadas, false)}>
                Adicionar todas
              </button>
            )}
          </div>
          <p>Vistas nos dados recentes ou nos erros de extração. Adicione e escolha o campo de cada uma.</p>
          <ul className="chips" style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
            {naoMapeadas.map((coluna) => (
              <li key={coluna} className="chip">
                {coluna}
                <button type="button" onClick={() => adicionar([coluna])} aria-label={`Adicionar coluna ${coluna}`}>
                  Adicionar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form className="card card-tabela" onSubmit={salvar} noValidate>
        {linhas.length === 0 ? (
          <div className="card-tabela-titulo">
            <Aviso>Nenhuma coluna mapeada. Adicione as colunas do cálculo da Secullum antes da primeira extração.</Aviso>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tabela-edicao">
              <caption className="sr-only">Mapeamento de colunas</caption>
              <thead>
                <tr>
                  <th scope="col">Coluna na Secullum</th>
                  <th scope="col">Representa</th>
                  <th scope="col">
                    <span className="sr-only">Remover</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha, indice) => {
                  const erroLinha = mostrarErros ? erros.porLinha[linha.chave] : undefined
                  return (
                    <tr key={linha.chave}>
                      <td>
                        <label htmlFor={`coluna-${linha.chave}`} className="sr-only">
                          Nome da coluna {indice + 1}
                        </label>
                        <input
                          id={`coluna-${linha.chave}`}
                          type="text"
                          value={linha.coluna_secullum}
                          maxLength={100}
                          aria-invalid={erroLinha ? true : undefined}
                          aria-describedby={erroLinha ? `erro-coluna-${linha.chave}` : undefined}
                          onChange={(event) => atualizar(linha.chave, { coluna_secullum: event.target.value })}
                        />
                        {erroLinha && (
                          <small id={`erro-coluna-${linha.chave}`} className="campo-erro">
                            {erroLinha}
                          </small>
                        )}
                      </td>
                      <td>
                        <label htmlFor={`campo-${linha.chave}`} className="sr-only">
                          O que a coluna {linha.coluna_secullum || indice + 1} representa
                        </label>
                        <select
                          id={`campo-${linha.chave}`}
                          value={linha.campo}
                          onChange={(event) => atualizar(linha.chave, { campo: event.target.value as CampoMapeado })}
                        >
                          {CAMPOS.map((campo) => (
                            <option key={campo.valor} value={campo.valor}>
                              {campo.rotulo}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="table-actions">
                        <button
                          type="button"
                          className="btn-link btn-link-danger"
                          onClick={() => setLinhas((atual) => atual.filter((item) => item.chave !== linha.chave))}
                          aria-label={`Remover coluna ${linha.coluna_secullum || indice + 1}`}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="card-tabela-titulo form-secao">
          {mostrarErros && erros.gerais.length > 0 && (
            <ul className="form-erro" role="alert" style={{ margin: 0, paddingLeft: 28 }}>
              {erros.gerais.map((texto) => (
                <li key={texto}>{texto}</li>
              ))}
            </ul>
          )}
          {errosServer.length > 0 && (
            <ul className="form-erro" role="alert" style={{ margin: 0, paddingLeft: 28 }}>
              {errosServer.map((texto) => (
                <li key={texto}>{texto}</li>
              ))}
            </ul>
          )}
          {mensagem && (
            <p className="form-ok" role="status">
              {mensagem}
            </p>
          )}
          <div className="form-acoes" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn-secondary" onClick={() => adicionar([''])}>
              Adicionar coluna
            </button>
            <button type="submit" className="btn-primary" disabled={enviando || !alterado}>
              {enviando ? 'Salvando...' : 'Salvar mapeamento'}
            </button>
          </div>
        </div>
      </form>
    </section>
  )
}
