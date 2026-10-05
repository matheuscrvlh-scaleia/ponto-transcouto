import { useState, type FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Campo } from '../../components/Campo'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import { errosDeCampos, mensagemDeErro } from '../../lib/erros'
import { SECOES_TELAS, TELAS } from '../../lib/telas'
import type { AlcanceGrupo, GrupoPermissao, Tela } from '../../types/api'

const ALCANCES: { valor: AlcanceGrupo; titulo: string; descricao: string }[] = [
  { valor: 'unidades', titulo: 'Só unidades vinculadas', descricao: 'Cada usuário vê apenas as unidades marcadas no cadastro dele.' },
  { valor: 'empresa', titulo: 'Toda a empresa', descricao: 'Os usuários veem todas as unidades da empresa.' },
]

interface Props {
  grupo: GrupoPermissao | null
  /** a equipe escolhe a empresa no topo; o cliente usa a própria */
  query: { empresa_id?: number }
  onFechar: () => void
  onSalvo: (grupo: GrupoPermissao) => void
}

/* Criar ou editar um grupo de permissão: nome, alcance e as telas liberadas.
   Quem não é da equipe só marca telas que ele mesmo tem (o server confere). */
export function ModalGrupo({ grupo, query, onFechar, onSalvo }: Props) {
  const { telas: minhasTelas, perfil } = useAuth()
  const [nome, setNome] = useState(grupo?.nome ?? '')
  const [descricao, setDescricao] = useState(grupo?.descricao ?? '')
  const [alcance, setAlcance] = useState<AlcanceGrupo>(grupo?.alcance ?? 'unidades')
  const [telas, setTelas] = useState<Tela[]>(grupo?.telas ?? ['dashboard'])
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState('')
  const [enviando, setEnviando] = useState(false)

  const ehEquipe = perfil === 'admin'
  // alcance "empresa toda" só para quem também tem (equipe ou grupo com alcance empresa)
  const podeEmpresa = ehEquipe || perfil === 'rh'
  const podeMarcar = (tela: Tela) => ehEquipe || minhasTelas.includes(tela)

  function alternar(tela: Tela) {
    setTelas((atual) => (atual.includes(tela) ? atual.filter((item) => item !== tela) : [...atual, tela]))
  }

  function alternarSecao(secao: (typeof SECOES_TELAS)[number], marcar: boolean) {
    const daSecao = TELAS.filter((tela) => tela.secao === secao && podeMarcar(tela.id)).map((tela) => tela.id)
    setTelas((atual) => (marcar ? [...new Set([...atual, ...daSecao])] : atual.filter((tela) => !daSecao.includes(tela))))
  }

  async function salvar(event: FormEvent) {
    event.preventDefault()
    const locais: Record<string, string> = {}
    if (nome.trim().length < 2) locais.nome = 'Informe o nome (mín. 2 caracteres).'
    if (telas.length === 0) locais.telas = 'Libere ao menos uma tela.'
    setErros(locais)
    setErroGeral('')
    if (Object.keys(locais).length) return

    // mantém a ordem do catálogo
    const ordenadas = TELAS.map((tela) => tela.id).filter((tela) => telas.includes(tela))
    const corpo = { nome: nome.trim(), descricao: descricao.trim() || null, alcance, telas: ordenadas }
    setEnviando(true)
    try {
      const salvo = grupo
        ? await api<GrupoPermissao>(`/permissoes/grupos/${grupo.id}`, { method: 'PATCH', json: corpo })
        : await api<GrupoPermissao>('/permissoes/grupos', { method: 'POST', query, json: corpo })
      onSalvo(salvo)
    } catch (e) {
      const campos = errosDeCampos(e)
      setErros(campos)
      setErroGeral(Object.keys(campos).length ? '' : mensagemDeErro(e))
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={grupo ? `Editar ${grupo.nome}` : 'Novo grupo de permissão'} onFechar={onFechar} largo>
      <form className="modal-form" onSubmit={salvar} noValidate>
        <Campo rotulo="Nome do grupo" erro={erros.nome} ajuda="Ex.: Supervisão, Financeiro, Coordenação regional.">
          {(props) => (
            <input
              {...props}
              type="text"
              value={nome}
              maxLength={60}
              autoComplete="off"
              onChange={(event) => setNome(event.target.value)}
              data-autofoco
            />
          )}
        </Campo>
        <Campo rotulo="Descrição" erro={erros.descricao} ajuda="Opcional: para que serve o grupo.">
          {(props) => (
            <textarea {...props} rows={2} value={descricao} maxLength={300} onChange={(event) => setDescricao(event.target.value)} />
          )}
        </Campo>

        <fieldset className="grupo-bloco">
          <legend>Quais unidades os usuários veem</legend>
          <div className="grupo-alcances">
            {ALCANCES.map((item) => {
              const bloqueado = item.valor === 'empresa' && !podeEmpresa
              return (
                <label
                  key={item.valor}
                  className={['grupo-alcance', alcance === item.valor ? 'ativo' : '', bloqueado ? 'bloqueado' : ''].join(' ')}
                  title={bloqueado ? 'Só quem vê a empresa toda pode dar esse alcance.' : undefined}
                >
                  <input
                    type="radio"
                    name="alcance"
                    value={item.valor}
                    checked={alcance === item.valor}
                    disabled={bloqueado}
                    onChange={() => setAlcance(item.valor)}
                  />
                  <span className="grupo-alcance-titulo">{item.titulo}</span>
                  <span className="grupo-alcance-desc">{item.descricao}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="grupo-bloco" aria-describedby={erros.telas ? 'erro-telas' : undefined}>
          <legend>
            Telas liberadas <span className="grupo-contagem">{telas.length} de {TELAS.length}</span>
          </legend>
          {SECOES_TELAS.map((secao) => {
            const daSecao = TELAS.filter((tela) => tela.secao === secao)
            const todasMarcadas = daSecao.filter((tela) => podeMarcar(tela.id)).every((tela) => telas.includes(tela.id))
            return (
              <div key={secao} className="grupo-secao">
                <div className="grupo-secao-topo">
                  <span>{secao}</span>
                  <button type="button" className="btn-link" onClick={() => alternarSecao(secao, !todasMarcadas)}>
                    {todasMarcadas ? 'Desmarcar todas' : 'Marcar todas'}
                  </button>
                </div>
                <div className="grupo-telas">
                  {daSecao.map((tela) => {
                    const bloqueada = !podeMarcar(tela.id)
                    return (
                      <label
                        key={tela.id}
                        className={['grupo-tela', telas.includes(tela.id) ? 'marcada' : '', bloqueada ? 'bloqueada' : ''].join(' ')}
                      >
                        <input
                          type="checkbox"
                          checked={telas.includes(tela.id)}
                          disabled={bloqueada}
                          onChange={() => alternar(tela.id)}
                        />
                        <span className="grupo-tela-texto">
                          <span className="grupo-tela-nome">{tela.rotulo}</span>
                          <span className="grupo-tela-desc">
                            {bloqueada ? 'O seu grupo não tem esta tela, então você não pode liberá-la.' : tela.descricao}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {erros.telas && (
            <small id="erro-telas" className="campo-erro" role="alert">
              {erros.telas}
            </small>
          )}
        </fieldset>

        {grupo && grupo.usuarios > 0 && (
          <p className="modal-texto">
            Vale na hora para {grupo.usuarios === 1 ? 'o usuário' : `os ${grupo.usuarios} usuários`} deste grupo, sem precisar entrar de novo.
          </p>
        )}
        {erroGeral && (
          <p className="form-erro" role="alert">
            {erroGeral}
          </p>
        )}
        <div className="form-acoes">
          <button type="button" className="btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Salvando...' : grupo ? 'Salvar alterações' : 'Criar grupo'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
