import { useEffect, useState, type FormEvent } from 'react'
import { useEmpresaAdmin } from '../../context/EmpresaAdminContext'
import { Campo } from '../../components/Campo'
import { Carregando, ErroCarregamento, EstadoVazio } from '../../components/Estados'
import { Modal } from '../../components/Modal'
import { PilulaAtivo } from '../../components/PilulaStatus'
import { api } from '../../lib/api'
import { errosDeCampos, mensagemDeErro } from '../../lib/erros'
import { formatarDataHora } from '../../lib/formato'
import type { Empresa, TesteConexao } from '../../types/api'

export function Empresas() {
  const { empresas, carregando, erro, recarregarEmpresas } = useEmpresaAdmin()
  const [editando, setEditando] = useState<Empresa | 'nova' | null>(null)
  const [mensagem, setMensagem] = useState('')

  useEffect(() => {
    document.title = 'Empresas — Copiloto de Ponto'
  }, [])

  const credenciais = (empresa: Empresa) =>
    empresa.secullum_usuario ? (
      <>
        {empresa.secullum_usuario}
        <span className="celula-sub">
          {empresa.possui_senha ? 'Senha salva' : 'Sem senha'} · banco {empresa.secullum_banco_id ?? 'não definido'}
        </span>
      </>
    ) : (
      <span className="badge badge-alerta">Sem credenciais</span>
    )

  return (
    <section className="pagina">
      <header className="pagina-header-linha">
        <div className="pagina-header">
          <h1>Empresas</h1>
          <p className="pagina-sub">Clientes atendidos e credenciais da integração com a Secullum.</p>
        </div>
        <button type="button" className="btn-primary btn-compact" onClick={() => setEditando('nova')}>
          Nova empresa
        </button>
      </header>

      {mensagem && (
        <p className="form-ok" role="status">
          {mensagem}
        </p>
      )}

      {carregando && <Carregando texto="Carregando empresas..." />}
      {erro && <ErroCarregamento erro={erro} onTentarDeNovo={recarregarEmpresas} />}
      {!carregando && !erro && empresas.length === 0 && (
        <EstadoVazio titulo="Nenhuma empresa cadastrada">
          <p>Cadastre a primeira empresa para configurar a integração.</p>
        </EstadoVazio>
      )}

      {empresas.length > 0 && (
        <>
          <div className="card card-tabela tabela-desktop">
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Empresas</caption>
                <thead>
                  <tr>
                    <th scope="col">Empresa</th>
                    <th scope="col">Secullum</th>
                    <th scope="col" className="num">
                      Unidades
                    </th>
                    <th scope="col">Situação</th>
                    <th scope="col">Sincronizada em</th>
                    <th scope="col">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {empresas.map((empresa) => (
                    <tr key={empresa.id} className={empresa.ativo ? undefined : 'linha-inativa'}>
                      <th scope="row">{empresa.nome}</th>
                      <td>{credenciais(empresa)}</td>
                      <td className="num">{empresa.qtd_unidades}</td>
                      <td>
                        <PilulaAtivo ativo={empresa.ativo} rotulos={['Ativa', 'Inativa']} />
                      </td>
                      <td>{formatarDataHora(empresa.sincronizado_em)}</td>
                      <td className="table-actions">
                        <button type="button" className="btn-link" onClick={() => setEditando(empresa)} aria-label={`Editar ${empresa.nome}`}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="cartoes-admin">
            {empresas.map((empresa) => (
              <li key={empresa.id} className={empresa.ativo ? 'cartao-admin' : 'cartao-admin inativo'}>
                <div className="cartao-admin-topo">
                  <span className="cartao-admin-titulo">{empresa.nome}</span>
                  <PilulaAtivo ativo={empresa.ativo} rotulos={['Ativa', 'Inativa']} />
                </div>
                <span>{credenciais(empresa)}</span>
                <span>{empresa.qtd_unidades} unidades</span>
                <div className="barra-acoes">
                  <button type="button" className="btn-link" onClick={() => setEditando(empresa)}>
                    Editar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {editando && (
        <ModalEmpresa
          empresa={editando === 'nova' ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={(empresa, nova) => {
            setEditando(null)
            setMensagem(`Empresa ${empresa.nome} ${nova ? 'criada' : 'atualizada'}.`)
            recarregarEmpresas()
          }}
        />
      )}
    </section>
  )
}

interface ModalProps {
  empresa: Empresa | null
  onFechar: () => void
  onSalvo: (empresa: Empresa, nova: boolean) => void
}

function ModalEmpresa({ empresa, onFechar, onSalvo }: ModalProps) {
  const [nome, setNome] = useState(empresa?.nome ?? '')
  const [usuario, setUsuario] = useState(empresa?.secullum_usuario ?? '')
  const [senha, setSenha] = useState('')
  const [senhaVisivel, setSenhaVisivel] = useState(false)
  const [bancoId, setBancoId] = useState(empresa?.secullum_banco_id ?? '')
  const [ativo, setAtivo] = useState(empresa?.ativo ?? true)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [teste, setTeste] = useState<TesteConexao | null>(null)
  const [testando, setTestando] = useState(false)

  const senhaSalva = Boolean(empresa?.possui_senha)
  const removendoCredenciais = Boolean(empresa?.secullum_usuario) && !usuario.trim()

  function validar() {
    const saida: Record<string, string> = {}
    if (!nome.trim()) saida.nome = 'Informe o nome.'
    if (usuario.trim() && !senha && !senhaSalva) saida.secullum_senha = 'Informe a senha da Secullum.'
    if (!usuario.trim() && senha) saida.secullum_usuario = 'Informe o usuário junto com a senha.'
    return saida
  }

  async function salvar(event: FormEvent) {
    event.preventDefault()
    const locais = validar()
    setErros(locais)
    setErroGeral('')
    if (Object.keys(locais).length) return

    const usuarioLimpo = usuario.trim() || null
    const bancoLimpo = bancoId.trim() || null
    setEnviando(true)
    try {
      if (!empresa) {
        const criada = await api<Empresa>('/admin/empresas', {
          method: 'POST',
          json: {
            nome: nome.trim(),
            secullum_usuario: usuarioLimpo,
            secullum_senha: senha || null,
            secullum_banco_id: bancoLimpo,
            ativo,
          },
        })
        return onSalvo(criada, true)
      }

      const alteracoes: Record<string, unknown> = {}
      if (nome.trim() !== empresa.nome) alteracoes.nome = nome.trim()
      if (usuarioLimpo !== empresa.secullum_usuario) alteracoes.secullum_usuario = usuarioLimpo
      if (senha && usuarioLimpo) alteracoes.secullum_senha = senha
      if (bancoLimpo !== empresa.secullum_banco_id) alteracoes.secullum_banco_id = bancoLimpo
      if (ativo !== empresa.ativo) alteracoes.ativo = ativo
      if (!Object.keys(alteracoes).length) return onFechar()

      const atualizada = await api<Empresa>(`/admin/empresas/${empresa.id}`, { method: 'PATCH', json: alteracoes })
      onSalvo(atualizada, false)
    } catch (e) {
      setErros(errosDeCampos(e))
      setErroGeral(mensagemDeErro(e))
      setEnviando(false)
    }
  }

  async function testar() {
    if (!empresa) return
    setTestando(true)
    setTeste(null)
    try {
      const corpo: Record<string, string> = {}
      if (usuario.trim()) corpo.secullum_usuario = usuario.trim()
      if (senha) corpo.secullum_senha = senha
      setTeste(await api<TesteConexao>(`/admin/empresas/${empresa.id}/testar-conexao`, { method: 'POST', json: corpo }))
    } catch (e) {
      setTeste({ ok: false, erro: mensagemDeErro(e) })
    } finally {
      setTestando(false)
    }
  }

  return (
    <Modal titulo={empresa ? `Editar ${empresa.nome}` : 'Nova empresa'} onFechar={onFechar} largo>
      <form className="modal-form" onSubmit={salvar} noValidate>
        <Campo rotulo="Nome" erro={erros.nome}>
          {(props) => (
            <input {...props} type="text" value={nome} maxLength={120} onChange={(event) => setNome(event.target.value)} data-autofoco />
          )}
        </Campo>

        <fieldset className="form-secao">
          <legend>Integração Secullum</legend>
          <div className="campos-grade">
            <Campo
              rotulo="Usuário"
              erro={erros.secullum_usuario}
              ajuda={removendoCredenciais ? 'Salvar sem usuário remove as credenciais.' : undefined}
            >
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={usuario}
                  autoComplete="off"
                  onChange={(event) => setUsuario(event.target.value)}
                />
              )}
            </Campo>
            <Campo
              rotulo={
                <>
                  Senha {senhaSalva && !removendoCredenciais && <span className="badge badge-success badge-mini">senha salva</span>}
                </>
              }
              erro={erros.secullum_senha}
              ajuda={senhaSalva ? 'A senha salva nunca é exibida. Preencha só para trocar.' : undefined}
            >
              {(props) => (
                <div className="campo-senha">
                  <input
                    {...props}
                    type={senhaVisivel ? 'text' : 'password'}
                    value={senha}
                    autoComplete="new-password"
                    placeholder={senhaSalva ? '••••••••' : ''}
                    disabled={removendoCredenciais}
                    onChange={(event) => setSenha(event.target.value)}
                  />
                  <button
                    type="button"
                    className="campo-senha-toggle"
                    onClick={() => setSenhaVisivel((v) => !v)}
                    aria-pressed={senhaVisivel}
                    aria-label={senhaVisivel ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {senhaVisivel ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              )}
            </Campo>
          </div>
          <Campo rotulo="Banco (ID na Secullum)" erro={erros.secullum_banco_id} ajuda="Use “Testar conexão” para listar os bancos disponíveis.">
            {(props) => (
              <input {...props} type="text" value={bancoId} maxLength={100} onChange={(event) => setBancoId(event.target.value)} />
            )}
          </Campo>

          <div className="barra-acoes">
            <button
              type="button"
              className="btn-secondary"
              onClick={testar}
              disabled={!empresa || testando || removendoCredenciais}
              aria-describedby={!empresa ? 'ajuda-testar' : undefined}
            >
              {testando ? 'Testando...' : 'Testar conexão'}
            </button>
            {!empresa && (
              <small id="ajuda-testar" className="field-ajuda">
                Salve a empresa para testar a conexão.
              </small>
            )}
          </div>

          <div aria-live="polite">
            {teste && !teste.ok && (
              <p className="form-erro" role="alert">
                Falha na conexão: {teste.erro}
              </p>
            )}
            {teste?.ok && (
              <div className="form-secao">
                <p className="form-ok">
                  Conexão ok — {teste.bancos.length} banco{teste.bancos.length === 1 ? '' : 's'} encontrado
                  {teste.bancos.length === 1 ? '' : 's'}.
                  {teste.banco_configurado_encontrado === false && ' O banco configurado não está entre eles.'}
                </p>
                {teste.bancos.length > 0 && (
                  <div className="lista-radio" role="radiogroup" aria-label="Escolha o banco">
                    {teste.bancos.map((banco) => (
                      <label key={banco.id} className="checkbox-item">
                        <input
                          type="radio"
                          name="banco-secullum"
                          value={banco.id}
                          checked={bancoId === banco.id}
                          onChange={() => setBancoId(banco.id)}
                        />
                        {banco.nome || 'Sem nome'} <span className="texto-suave">(ID {banco.id})</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </fieldset>

        <label className="checkbox-item">
          <input type="checkbox" checked={ativo} onChange={(event) => setAtivo(event.target.checked)} />
          Empresa ativa (extrações e sincronizações habilitadas)
        </label>

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
            {enviando ? 'Salvando...' : empresa ? 'Salvar alterações' : 'Criar empresa'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
