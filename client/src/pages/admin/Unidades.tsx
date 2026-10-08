import { useEffect, useState, type FormEvent } from 'react'
import { useEmpresaSelecionada } from '../../context/EmpresaAdminContext'
import { Campo } from '../../components/Campo'
import { Carregando, ErroCarregamento, EstadoVazio } from '../../components/Estados'
import { IconeAlerta, IconeLapis, IconeSincronizar, IconeUnidade, IconeUsuarios } from '../../components/Icones'
import { Modal } from '../../components/Modal'
import { ModalConfirmacao } from '../../components/ModalConfirmacao'
import { PilulaAtivo } from '../../components/PilulaStatus'
import { ApiError, api } from '../../lib/api'
import { alertarFalha, alertarSucesso } from '../../lib/alertas'
import { errosDeCampos, mensagemDeErro } from '../../lib/erros'
import { formatarCnpj, formatarQuando, iniciais, normalizarBusca } from '../../lib/formato'
import { useRecurso } from '../../lib/useRecurso'
import type { UnidadeAdmin } from '../../types/api'
import { TituloPagina } from '../../components/TituloPagina'
import './unidades.css'

type Filtro = 'todas' | 'razao_social' | 'inativas'

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'razao_social', rotulo: 'Sem nome curto' },
  { valor: 'inativas', rotulo: 'Inativas' },
]

/** Unidade sem nome próprio: o servidor usa a razão social como nome. */
const usaRazaoSocial = (unidade: UnidadeAdmin) => !unidade.nome_exibicao || unidade.nome_exibicao === unidade.razao_social

const nomeDa = (unidade: UnidadeAdmin) => unidade.nome_exibicao ?? unidade.razao_social

/** Selo do cartão: o próprio nome curto (até 4 letras, ex.: GDR) ou as iniciais. */
function siglaDa(unidade: UnidadeAdmin) {
  const nome = nomeDa(unidade).trim()
  return nome.length <= 4 ? nome.toLocaleUpperCase('pt-BR') : iniciais(nome)
}

/** Primeira letra maiúscula ("hoje às 11:58" → "Hoje às 11:58"). */
const maiuscula = (texto: string) => texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1)

/* Configuração → Configurações → Unidades: o nome curto que aparece nos painéis para cada
   CNPJ da FriPonto e quais unidades entram nas extrações (ativa/inativa). */
export function Unidades() {
  const { empresaId, empresas, query, recarregarEmpresas } = useEmpresaSelecionada()
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [editando, setEditando] = useState<UnidadeAdmin | null>(null)
  const [desativando, setDesativando] = useState<UnidadeAdmin | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const { dados, erro, carregando, recarregar } = useRecurso(
    (signal) => api<UnidadeAdmin[]>('/admin/unidades', { signal, query }),
    `unidades-admin-${empresaId}`,
  )

  useEffect(() => {
    document.title = 'Unidades Copiloto de Ponto'
  }, [])

  const empresa = empresas.find((item) => item.id === empresaId)
  const todas = dados ?? []
  const termo = normalizarBusca(busca)
  const lista = todas
    .filter((unidade) => {
      if (filtro === 'razao_social' && !usaRazaoSocial(unidade)) return false
      if (filtro === 'inativas' && unidade.ativo) return false
      const texto = normalizarBusca(`${unidade.nome_exibicao ?? ''} ${unidade.razao_social} ${unidade.cnpj}`)
      return texto.includes(termo)
    })
    // ativas primeiro; dentro de cada grupo, pelo nome
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || nomeDa(a).localeCompare(nomeDa(b), 'pt-BR'))

  const ativas = todas.filter((unidade) => unidade.ativo)
  const colaboradores = ativas.reduce((soma, unidade) => soma + unidade.qtd_colaboradores, 0)
  const semNome = todas.filter((unidade) => unidade.ativo && usaRazaoSocial(unidade)).length

  async function sincronizar() {
    setSincronizando(true)
    try {
      await api('/admin/sincronizacoes', { method: 'POST', json: query })
      alertarSucesso('Sincronização pedida. A lista se atualiza em alguns minutos, quando o serviço de extração rodar.')
      recarregarEmpresas()
    } catch (e) {
      alertarFalha(e)
    } finally {
      setSincronizando(false)
    }
  }

  async function alterarAtivo(unidade: UnidadeAdmin, ativo: boolean) {
    await api(`/admin/unidades/${unidade.id}`, { method: 'PATCH', json: { ativo } })
    alertarSucesso(`${nomeDa(unidade)} ${ativo ? 'ativada' : 'desativada'}.`)
    recarregar()
  }

  async function ativar(unidade: UnidadeAdmin) {
    try {
      await alterarAtivo(unidade, true)
    } catch (e) {
      alertarFalha(e)
    }
  }

  return (
    <section className="pagina unid">
      <TituloPagina>Unidades</TituloPagina>
      <header className="unid-cabecalho">
        <button type="button" className="unid-botao" onClick={sincronizar} disabled={sincronizando}>
          <IconeSincronizar tamanho={16} />
          {sincronizando ? 'Pedindo...' : 'Sincronizar com a FriPonto'}
        </button>
      </header>

      {carregando && <Carregando texto="Carregando unidades..." />}
      {erro && <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />}

      {dados && dados.length === 0 && (
        <EstadoVazio titulo="Nenhuma unidade sincronizada">
          <p>Clique em “Sincronizar com a FriPonto” para trazer os CNPJs cadastrados na Secullum.</p>
        </EstadoVazio>
      )}

      {dados && dados.length > 0 && (
        <>
          <ul className="unid-resumo" aria-label="Resumo das unidades">
            <li>
              <span className="unid-resumo-icone" aria-hidden="true">
                <IconeUnidade tamanho={18} />
              </span>
              <span className="unid-resumo-valor">
                {ativas.length}
                <small>/{todas.length}</small>
              </span>
              <span className="unid-resumo-rotulo">unidades ativas</span>
            </li>
            <li>
              <span className="unid-resumo-icone" aria-hidden="true">
                <IconeUsuarios tamanho={18} />
              </span>
              <span className="unid-resumo-valor">{colaboradores.toLocaleString('pt-BR')}</span>
              <span className="unid-resumo-rotulo">colaboradores nas ativas</span>
            </li>
            <li>
              <span className="unid-resumo-icone" aria-hidden="true">
                <IconeSincronizar tamanho={18} />
              </span>
              <span className="unid-resumo-valor unid-resumo-texto">
                {empresa?.sincronizado_em ? maiuscula(formatarQuando(empresa.sincronizado_em)) : 'Nunca'}
              </span>
              <span className="unid-resumo-rotulo">última sincronização</span>
            </li>
          </ul>

          {semNome > 0 && filtro !== 'razao_social' && (
            <div className="unid-chamada" role="note">
              <span className="unid-chamada-icone" aria-hidden="true">
                <IconeAlerta tamanho={18} />
              </span>
              <p>
                <strong>
                  {semNome} {semNome === 1 ? 'unidade ativa está' : 'unidades ativas estão'} sem nome curto
                </strong>{' '}
                e aparecem nos painéis pela razão social. Um nome como “GDR” deixa o Dashboard e os filtros bem mais fáceis
                de ler.
              </p>
              <button type="button" className="unid-botao" onClick={() => setFiltro('razao_social')}>
                Ver quais
              </button>
            </div>
          )}

          <div className="unid-filtros">
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
            <EstadoVazio titulo="Nenhuma unidade encontrada">
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  setBusca('')
                  setFiltro('todas')
                }}
              >
                Limpar busca e filtro
              </button>
            </EstadoVazio>
          ) : (
            <ul className="unid-lista" aria-label="Unidades da empresa">
              {lista.map((unidade) => (
                <CartaoUnidade
                  key={unidade.id}
                  unidade={unidade}
                  onEditar={setEditando}
                  onDesativar={setDesativando}
                  onAtivar={ativar}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {editando && (
        <ModalNomeUnidade
          unidade={editando}
          onFechar={() => setEditando(null)}
          onSalvo={(atualizada) => {
            setEditando(null)
            alertarSucesso(`Nome salvo: ${nomeDa(atualizada)}.`)
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
            <strong>{nomeDa(desativando)}</strong> deixa de ser extraída e some dos painéis dos gestores. O histórico é
            mantido e você pode reativar depois.
          </p>
        </ModalConfirmacao>
      )}
    </section>
  )
}

interface CartaoProps {
  unidade: UnidadeAdmin
  onEditar: (unidade: UnidadeAdmin) => void
  onDesativar: (unidade: UnidadeAdmin) => void
  onAtivar: (unidade: UnidadeAdmin) => void
}

function CartaoUnidade({ unidade, onEditar, onDesativar, onAtivar }: CartaoProps) {
  const nome = nomeDa(unidade)
  const semNome = usaRazaoSocial(unidade)

  return (
    <li className={unidade.ativo ? 'unid-cartao' : 'unid-cartao inativa'}>
      <div className="unid-cartao-topo">
        <span className={semNome ? 'unid-sigla sem-nome' : 'unid-sigla'} aria-hidden="true">
          {siglaDa(unidade)}
        </span>
        <div className="unid-nomes">
          <span className="unid-nome">{nome}</span>
          {!semNome && <span className="unid-razao">{unidade.razao_social}</span>}
          <span className="unid-cnpj">CNPJ {formatarCnpj(unidade.cnpj)}</span>
        </div>
        <PilulaAtivo ativo={unidade.ativo} rotulos={['Ativa', 'Inativa']} />
      </div>

      {semNome && unidade.ativo && (
        <button type="button" className="unid-sem-nome" onClick={() => onEditar(unidade)}>
          Sem nome curto: aparece pela razão social. <span>Definir nome</span>
        </button>
      )}

      <dl className="unid-fatos">
        <div>
          <dt>Colaboradores</dt>
          <dd>{unidade.qtd_colaboradores.toLocaleString('pt-BR')}</dd>
        </div>
        <div>
          <dt>Sincronizada</dt>
          <dd>{unidade.sincronizado_em ? maiuscula(formatarQuando(unidade.sincronizado_em)) : 'Nunca'}</dd>
        </div>
      </dl>

      <div className="unid-acoes">
        <button type="button" className="unid-botao" onClick={() => onEditar(unidade)} aria-label={`Editar nome de ${nome}`}>
          <IconeLapis tamanho={15} />
          Editar nome
        </button>
        {unidade.ativo ? (
          <button
            type="button"
            className="unid-botao unid-botao-perigo"
            onClick={() => onDesativar(unidade)}
            aria-label={`Desativar ${nome}`}
          >
            Desativar
          </button>
        ) : (
          <button type="button" className="unid-botao" onClick={() => onAtivar(unidade)} aria-label={`Ativar ${nome}`}>
            Ativar
          </button>
        )}
      </div>
    </li>
  )
}

interface ModalNomeProps {
  unidade: UnidadeAdmin
  onFechar: () => void
  onSalvo: (unidade: UnidadeAdmin) => void
}

function ModalNomeUnidade({ unidade, onFechar, onSalvo }: ModalNomeProps) {
  // sem nome próprio o campo começa vazio (e não com a razão social repetida)
  const [nome, setNome] = useState(usaRazaoSocial(unidade) ? '' : (unidade.nome_exibicao ?? ''))
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const previa = nome.trim() || unidade.razao_social

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
    <Modal titulo="Nome da unidade" onFechar={onFechar}>
      <form className="modal-form" onSubmit={salvar} noValidate>
        <p className="modal-texto">
          {unidade.razao_social}
          <br />
          CNPJ {formatarCnpj(unidade.cnpj)}
        </p>
        <Campo
          rotulo="Nome curto que os gestores verão"
          erro={erro}
          ajuda="Ex.: GDR, VRD, Matriz. Em branco, vale a razão social. Para tirar a unidade dos painéis, desative-a."
        >
          {(props) => (
            <input
              {...props}
              type="text"
              value={nome}
              maxLength={60}
              placeholder="Ex.: GDR"
              onChange={(event) => setNome(event.target.value)}
              data-autofoco
            />
          )}
        </Campo>
        <p className="unid-previa">
          No painel:{' '}
          <span className={nome.trim() ? 'unid-previa-chip' : 'unid-previa-chip longo'}>
            <IconeUnidade tamanho={14} />
            {previa}
          </span>
        </p>
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
