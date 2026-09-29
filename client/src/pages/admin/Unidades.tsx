import { useEffect, useState, type FormEvent } from 'react'
import { useEmpresaSelecionada } from '../../context/EmpresaAdminContext'
import { Campo } from '../../components/Campo'
import { Aviso, Carregando, ErroCarregamento, EstadoVazio } from '../../components/Estados'
import { Modal } from '../../components/Modal'
import { ModalConfirmacao } from '../../components/ModalConfirmacao'
import { PilulaAtivo } from '../../components/PilulaStatus'
import { ApiError, api } from '../../lib/api'
import { errosDeCampos, mensagemDeErro } from '../../lib/erros'
import { formatarCnpj, formatarDataHora, normalizarBusca } from '../../lib/formato'
import { useRecurso } from '../../lib/useRecurso'
import type { UnidadeAdmin } from '../../types/api'

type Filtro = 'todas' | 'sem_nome' | 'inativas'

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'sem_nome', rotulo: 'Sem nome' },
  { valor: 'inativas', rotulo: 'Inativas' },
]

export function Unidades() {
  const { empresaId, empresas, query, recarregarEmpresas } = useEmpresaSelecionada()
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [editando, setEditando] = useState<UnidadeAdmin | null>(null)
  const [desativando, setDesativando] = useState<UnidadeAdmin | null>(null)
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const { dados, erro, carregando, recarregar } = useRecurso(
    (signal) => api<UnidadeAdmin[]>('/admin/unidades', { signal, query }),
    `unidades-admin-${empresaId}`,
  )

  useEffect(() => {
    document.title = 'Unidades — Copiloto de Ponto'
  }, [])

  const empresa = empresas.find((item) => item.id === empresaId)
  const termo = normalizarBusca(busca)
  const lista = (dados ?? []).filter((unidade) => {
    if (filtro === 'sem_nome' && unidade.nome_exibicao) return false
    if (filtro === 'inativas' && unidade.ativo) return false
    const texto = normalizarBusca(`${unidade.nome_exibicao ?? ''} ${unidade.razao_social} ${unidade.cnpj}`)
    return texto.includes(termo)
  })
  const semNome = (dados ?? []).filter((unidade) => !unidade.nome_exibicao).length

  async function sincronizar() {
    setSincronizando(true)
    setMensagem(null)
    try {
      await api('/admin/sincronizacoes', { method: 'POST', json: query })
      setMensagem({ tipo: 'ok', texto: 'Sincronização solicitada. A lista é atualizada em alguns minutos, quando o robô rodar.' })
      recarregarEmpresas()
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: mensagemDeErro(e) })
    } finally {
      setSincronizando(false)
    }
  }

  async function alterarAtivo(unidade: UnidadeAdmin, ativo: boolean) {
    await api(`/admin/unidades/${unidade.id}`, { method: 'PATCH', json: { ativo } })
    setMensagem({ tipo: 'ok', texto: `${unidade.nome_exibicao ?? unidade.razao_social} ${ativo ? 'ativada' : 'desativada'}.` })
    recarregar()
  }

  async function ativar(unidade: UnidadeAdmin) {
    try {
      await alterarAtivo(unidade, true)
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: mensagemDeErro(e) })
    }
  }

  return (
    <section className="pagina">
      <header className="pagina-header-linha">
        <div className="pagina-header">
          <h1>Unidades</h1>
          <p className="pagina-sub">
            De-para entre a razão social da FriPonto e o nome que aparece para os gestores.
            {empresa?.sincronizado_em && ` Última sincronização: ${formatarDataHora(empresa.sincronizado_em)}.`}
          </p>
        </div>
        <button type="button" className="btn-primary btn-compact" onClick={sincronizar} disabled={sincronizando}>
          {sincronizando ? 'Solicitando...' : 'Sincronizar com a FriPonto'}
        </button>
      </header>

      {mensagem && (
        <p className={mensagem.tipo === 'ok' ? 'form-ok' : 'form-erro'} role={mensagem.tipo === 'ok' ? 'status' : 'alert'}>
          {mensagem.texto}
        </p>
      )}

      {carregando && <Carregando texto="Carregando unidades..." />}
      {erro && <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />}

      {dados && dados.length === 0 && (
        <EstadoVazio titulo="Nenhuma unidade sincronizada">
          <p>Clique em “Sincronizar com a FriPonto” para trazer as empresas cadastradas na Secullum.</p>
        </EstadoVazio>
      )}

      {dados && dados.length > 0 && (
        <>
          {semNome > 0 && (
            <Aviso>
              {semNome} unidade{semNome === 1 ? '' : 's'} sem nome de exibição — não aparece{semNome === 1 ? '' : 'm'} para
              os gestores até receber um nome.
            </Aviso>
          )}

          <div className="filtros">
            <div className="busca">
              <label htmlFor="busca-unidade-admin" className="sr-only">
                Buscar por nome, razão social ou CNPJ
              </label>
              <input
                id="busca-unidade-admin"
                type="search"
                placeholder="Buscar por nome, razão social ou CNPJ"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
              />
            </div>
            <div className="segmentos" role="group" aria-label="Filtrar unidades">
              {FILTROS.map((item) => (
                <button
                  key={item.valor}
                  type="button"
                  className={item.valor === filtro ? 'segmento ativo' : 'segmento'}
                  aria-pressed={item.valor === filtro}
                  onClick={() => setFiltro(item.valor)}
                >
                  {item.rotulo}
                </button>
              ))}
            </div>
          </div>

          {lista.length === 0 ? (
            <EstadoVazio titulo="Nenhuma unidade encontrada" />
          ) : (
            <>
              <div className="card card-tabela tabela-desktop">
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">Unidades da empresa</caption>
                    <thead>
                      <tr>
                        <th scope="col">Nome de exibição</th>
                        <th scope="col">Razão social / CNPJ</th>
                        <th scope="col" className="num">
                          Colaboradores
                        </th>
                        <th scope="col">Status</th>
                        <th scope="col">Sincronizada em</th>
                        <th scope="col">
                          <span className="sr-only">Ações</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((unidade) => (
                        <tr
                          key={unidade.id}
                          className={!unidade.nome_exibicao ? 'linha-destaque' : !unidade.ativo ? 'linha-inativa' : undefined}
                        >
                          <th scope="row">
                            {unidade.nome_exibicao ?? <span className="badge badge-alerta">Sem nome</span>}
                          </th>
                          <td>
                            {unidade.razao_social}
                            <span className="celula-sub">{formatarCnpj(unidade.cnpj)}</span>
                          </td>
                          <td className="num">{unidade.qtd_colaboradores}</td>
                          <td>
                            <PilulaAtivo ativo={unidade.ativo} rotulos={['Ativa', 'Inativa']} />
                          </td>
                          <td>{formatarDataHora(unidade.sincronizado_em)}</td>
                          <td className="table-actions">
                            <AcoesUnidade
                              unidade={unidade}
                              onEditar={setEditando}
                              onDesativar={setDesativando}
                              onAtivar={ativar}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <ul className="cartoes-admin">
                {lista.map((unidade) => (
                  <li
                    key={unidade.id}
                    className={`cartao-admin${!unidade.nome_exibicao ? ' destaque' : ''}${!unidade.ativo ? ' inativo' : ''}`}
                  >
                    <div className="cartao-admin-topo">
                      <span className="cartao-admin-titulo">
                        {unidade.nome_exibicao ?? <span className="badge badge-alerta">Sem nome</span>}
                      </span>
                      <PilulaAtivo ativo={unidade.ativo} rotulos={['Ativa', 'Inativa']} />
                    </div>
                    <span>
                      {unidade.razao_social}
                      <span className="celula-sub">
                        {formatarCnpj(unidade.cnpj)} · {unidade.qtd_colaboradores} colaboradores
                      </span>
                    </span>
                    <div className="barra-acoes">
                      <AcoesUnidade unidade={unidade} onEditar={setEditando} onDesativar={setDesativando} onAtivar={ativar} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {editando && (
        <ModalNomeUnidade
          unidade={editando}
          onFechar={() => setEditando(null)}
          onSalvo={(atualizada) => {
            setEditando(null)
            setMensagem({ tipo: 'ok', texto: `Nome salvo: ${atualizada.nome_exibicao ?? 'sem nome'}.` })
            recarregar()
          }}
        />
      )}

      {desativando && (
        <ModalConfirmacao
          titulo="Desativar unidade"
          rotuloConfirmar="Desativar"
          perigo
          onFechar={() => setDesativando(null)}
          onConfirmar={async () => {
            await alterarAtivo(desativando, false)
            setDesativando(null)
          }}
        >
          <p>
            <strong>{desativando.nome_exibicao ?? desativando.razao_social}</strong> deixa de ser extraída e some dos
            painéis dos gestores. O histórico é mantido e você pode reativar depois.
          </p>
        </ModalConfirmacao>
      )}
    </section>
  )
}

interface AcoesProps {
  unidade: UnidadeAdmin
  onEditar: (unidade: UnidadeAdmin) => void
  onDesativar: (unidade: UnidadeAdmin) => void
  onAtivar: (unidade: UnidadeAdmin) => void
}

function AcoesUnidade({ unidade, onEditar, onDesativar, onAtivar }: AcoesProps) {
  const nome = unidade.nome_exibicao ?? unidade.razao_social
  return (
    <>
      <button type="button" className="btn-link" onClick={() => onEditar(unidade)} aria-label={`Editar nome de ${nome}`}>
        {unidade.nome_exibicao ? 'Editar nome' : 'Dar nome'}
      </button>
      {unidade.ativo ? (
        <button type="button" className="btn-link btn-link-danger" onClick={() => onDesativar(unidade)} aria-label={`Desativar ${nome}`}>
          Desativar
        </button>
      ) : (
        <button type="button" className="btn-link" onClick={() => onAtivar(unidade)} aria-label={`Ativar ${nome}`}>
          Ativar
        </button>
      )}
    </>
  )
}

interface ModalNomeProps {
  unidade: UnidadeAdmin
  onFechar: () => void
  onSalvo: (unidade: UnidadeAdmin) => void
}

function ModalNomeUnidade({ unidade, onFechar, onSalvo }: ModalNomeProps) {
  const [nome, setNome] = useState(unidade.nome_exibicao ?? '')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function salvar(event: FormEvent) {
    event.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const atualizada = await api<UnidadeAdmin>(`/admin/unidades/${unidade.id}`, {
        method: 'PATCH',
        json: { nome_exibicao: nome.trim() || null },
      })
      onSalvo(atualizada)
    } catch (e) {
      const campo = errosDeCampos(e).nome_exibicao
      setErro(campo ?? (e instanceof ApiError && e.status === 409 ? e.message : mensagemDeErro(e)))
      setEnviando(false)
    }
  }

  return (
    <Modal titulo="Nome de exibição" onFechar={onFechar}>
      <form className="modal-form" onSubmit={salvar} noValidate>
        <p className="modal-texto">
          {unidade.razao_social}
          <br />
          CNPJ {formatarCnpj(unidade.cnpj)}
        </p>
        <Campo
          rotulo="Nome que os gestores verão"
          erro={erro}
          ajuda="Ex.: GDR, VRD. Deixe em branco para remover o nome (a unidade some dos painéis)."
        >
          {(props) => (
            <input
              {...props}
              type="text"
              value={nome}
              maxLength={60}
              onChange={(event) => setNome(event.target.value)}
              data-autofoco
            />
          )}
        </Campo>
        <div className="form-acoes">
          <button type="button" className="btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
