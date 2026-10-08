import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEmpresaAdmin } from '../../context/EmpresaAdminContext'
import { Campo } from '../../components/Campo'
import { Carregando, ErroCarregamento, EstadoVazio } from '../../components/Estados'
import { IconeBloqueio, IconeCheck, IconeLapis, IconeMais, IconePainel } from '../../components/Icones'
import { Modal } from '../../components/Modal'
import { ModalConfirmacao } from '../../components/ModalConfirmacao'
import { TituloPagina } from '../../components/TituloPagina'
import { api } from '../../lib/api'
import { alertarFalha, alertarSucesso } from '../../lib/alertas'
import { errosDeCampos, mensagemDeErro } from '../../lib/erros'
import {
  cnpjValido,
  EMAIL_VALIDO,
  formatarCnpj,
  formatarDataHora,
  formatarTelefone,
  mascararCnpjEntrada,
  mascararTelefoneEntrada,
  normalizarBusca,
} from '../../lib/formato'
import type { Empresa, TesteConexao } from '../../types/api'
import { CampoLogo, LogoEmpresa, PreviaCadastro, SecaoCadastro } from './FormCadastro'
import { BarraPessoas, CartaoPessoas, FiltroPessoas, MenuAcoesPessoa, Situacao, type AcaoPessoa } from './ListaPessoas'

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')

/** Linha de identificação: razão social e CNPJ. */
const identificacao = (empresa: Empresa) =>
  [empresa.razao_social, empresa.cnpj && `CNPJ ${formatarCnpj(empresa.cnpj)}`].filter(Boolean).join(' · ')

const local = (empresa: Empresa) => [empresa.cidade, empresa.uf].filter(Boolean).join(' / ')

export function Empresas() {
  const { empresas, carregando, erro, recarregarEmpresas, selecionar } = useEmpresaAdmin()
  const navigate = useNavigate()
  const [editando, setEditando] = useState<Empresa | 'nova' | null>(null)
  const [desativando, setDesativando] = useState<Empresa | null>(null)
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState<'' | 'ativas' | 'inativas'>('')

  useEffect(() => {
    document.title = 'Empresas — Copiloto de Ponto'
  }, [])

  const termo = normalizarBusca(busca.trim())
  // CNPJ: busca pelos dígitos, com ou sem máscara
  const digitos = busca.replace(/\D/g, '')
  const filtradas = empresas.filter((empresa) => {
    if (situacao === 'ativas' && !empresa.ativo) return false
    if (situacao === 'inativas' && empresa.ativo) return false
    if (!termo) return true
    const campos = [empresa.nome, empresa.razao_social, empresa.responsavel, empresa.cidade, empresa.email_contato]
    return (
      campos.some((campo) => campo && normalizarBusca(campo).includes(termo)) ||
      (digitos.length >= 3 && Boolean(empresa.cnpj?.includes(digitos)))
    )
  })

  async function alterarAtivo(empresa: Empresa, ativo: boolean) {
    await api(`/admin/empresas/${empresa.id}`, { method: 'PATCH', json: { ativo } })
    alertarSucesso(`${empresa.nome} ${ativo ? 'reativada' : 'desativada'}.`)
    recarregarEmpresas()
  }

  const acoes = (empresa: Empresa): AcaoPessoa[] => [
    { rotulo: 'Editar', icone: <IconeLapis tamanho={17} />, onClick: () => setEditando(empresa) },
    {
      rotulo: 'Ver no painel',
      icone: <IconePainel tamanho={17} />,
      onClick: () => {
        selecionar(empresa.id)
        navigate('/unidades')
      },
    },
    empresa.ativo
      ? { rotulo: 'Desativar', icone: <IconeBloqueio tamanho={17} />, onClick: () => setDesativando(empresa), perigo: true }
      : {
          rotulo: 'Reativar',
          icone: <IconeCheck tamanho={17} />,
          onClick: () => alterarAtivo(empresa, true).catch((e) => alertarFalha(e)),
        },
  ]

  const secullum = (empresa: Empresa) =>
    empresa.secullum_usuario ? (
      <span className="empresa-secullum">
        {empresa.secullum_usuario}
        <small>
          {empresa.possui_senha ? 'Senha salva' : 'Sem senha'} · banco {empresa.secullum_banco_id ?? 'não definido'}
        </small>
      </span>
    ) : (
      <span className="situacao-aviso">Sem credenciais</span>
    )

  const contato = (empresa: Empresa) => {
    const linhas = [empresa.email_contato, empresa.telefone && formatarTelefone(empresa.telefone), local(empresa)].filter(Boolean)
    if (!empresa.responsavel && linhas.length === 0) return <span className="etiqueta-vazia">Não informado</span>
    return (
      <span className="contato-celula">
        {empresa.responsavel ?? linhas.shift()}
        {linhas.map((linha) => (
          <small key={linha}>{linha}</small>
        ))}
      </span>
    )
  }

  const contagens = (empresa: Empresa) => (
    <span className="empresa-contagens">
      <span>
        <strong>{empresa.qtd_unidades}</strong> {empresa.qtd_unidades === 1 ? 'unidade' : 'unidades'}
      </span>
      <span>
        <strong>{empresa.qtd_usuarios}</strong> {empresa.qtd_usuarios === 1 ? 'usuário' : 'usuários'}
      </span>
    </span>
  )

  const pessoaEmpresa = (empresa: Empresa) => (
    <div className="pessoa">
      <LogoEmpresa nome={empresa.nome} logo={empresa.logo} />
      <span className="pessoa-texto">
        <span className="pessoa-nome">{empresa.nome}</span>
        <span className="pessoa-sub">{identificacao(empresa) || 'Sem razão social e CNPJ'}</span>
      </span>
    </div>
  )

  return (
    <section className="pagina">
      <TituloPagina>Empresas</TituloPagina>
      <header className="pessoas-topo">
        <p>Clientes atendidos: dados cadastrais, contato e credenciais da integração com a Secullum.</p>
        <button type="button" className="pessoas-novo" onClick={() => setEditando('nova')}>
          <IconeMais tamanho={18} />
          Nova empresa
        </button>
      </header>

      <CartaoPessoas>
        <BarraPessoas
          idBusca="busca-empresa"
          busca={busca}
          onBusca={setBusca}
          placeholder="Buscar por nome, razão social, CNPJ ou cidade"
          contagem={carregando ? undefined : `${filtradas.length} ${filtradas.length === 1 ? 'empresa' : 'empresas'}`}
        >
          <FiltroPessoas rotulo="Situação" valor={situacao} onMudar={(valor) => setSituacao(valor as typeof situacao)}>
            <option value="">Todas</option>
            <option value="ativas">Ativas</option>
            <option value="inativas">Inativas</option>
          </FiltroPessoas>
        </BarraPessoas>

        {carregando && (
          <div className="pessoas-estado">
            <Carregando texto="Carregando empresas..." />
          </div>
        )}
        {erro && (
          <div className="pessoas-estado">
            <ErroCarregamento erro={erro} onTentarDeNovo={recarregarEmpresas} />
          </div>
        )}
        {!carregando && !erro && filtradas.length === 0 && (
          <div className="pessoas-estado">
            <EstadoVazio titulo={empresas.length ? 'Nenhuma empresa encontrada' : 'Nenhuma empresa cadastrada'}>
              <p>{empresas.length ? 'Ajuste a busca ou o filtro.' : 'Cadastre a primeira empresa para configurar a integração.'}</p>
            </EstadoVazio>
          </div>
        )}

        {filtradas.length > 0 && (
          <>
            <div className="table-wrap pessoas-tabela-wrap">
              <table className="pessoas-tabela">
                <caption className="sr-only">Empresas</caption>
                <thead>
                  <tr>
                    <th scope="col">Empresa</th>
                    <th scope="col">Contato</th>
                    <th scope="col">Secullum</th>
                    <th scope="col">Uso</th>
                    <th scope="col">Situação</th>
                    <th scope="col">Sincronizada em</th>
                    <th scope="col" className="coluna-acoes">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((empresa) => (
                    <tr key={empresa.id} className={empresa.ativo ? undefined : 'inativa'}>
                      <th scope="row">{pessoaEmpresa(empresa)}</th>
                      <td>{contato(empresa)}</td>
                      <td>{secullum(empresa)}</td>
                      <td>{contagens(empresa)}</td>
                      <td>
                        <Situacao ativo={empresa.ativo} rotulos={['Ativa', 'Inativa']} />
                      </td>
                      <td className="ultimo-acesso">
                        {empresa.sincronizado_em ? formatarDataHora(empresa.sincronizado_em) : <span className="etiqueta-vazia">Nunca</span>}
                      </td>
                      <td className="coluna-acoes">
                        <MenuAcoesPessoa nome={empresa.nome} acoes={acoes(empresa)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="pessoas-cartoes">
              {filtradas.map((empresa) => (
                <li key={empresa.id} className={empresa.ativo ? 'pessoas-cartao' : 'pessoas-cartao inativa'}>
                  <div className="pessoas-cartao-topo">
                    {pessoaEmpresa(empresa)}
                    <MenuAcoesPessoa nome={empresa.nome} acoes={acoes(empresa)} />
                  </div>
                  <div className="pessoas-cartao-info">
                    <Situacao ativo={empresa.ativo} rotulos={['Ativa', 'Inativa']} />
                    {contagens(empresa)}
                  </div>
                  <div className="pessoas-cartao-info">{secullum(empresa)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </CartaoPessoas>

      {editando && (
        <ModalEmpresa
          empresa={editando === 'nova' ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={(empresa, nova) => {
            setEditando(null)
            alertarSucesso(`Empresa ${empresa.nome} ${nova ? 'criada' : 'atualizada'}.`)
            recarregarEmpresas()
          }}
        />
      )}

      {desativando && (
        <ModalConfirmacao
          titulo="Desativar empresa"
          rotuloConfirmar="Desativar"
          perigo
          onFechar={() => setDesativando(null)}
          onConfirmar={async () => {
            await alterarAtivo(desativando, false)
            setDesativando(null)
          }}
        >
          <p>
            <strong>{desativando.nome}</strong> deixa de ter extrações e sincronizações com a Secullum. Os dados já
            carregados continuam no painel e você pode reativar depois.
          </p>
        </ModalConfirmacao>
      )}
    </section>
  )
}

interface ModalProps {
  empresa: Empresa | null
  onFechar: () => void
  onSalvo: (empresa: Empresa, nova: boolean) => void
}

/** Campos cadastrais como o formulário os edita (texto com máscara). */
interface FormDados {
  razao_social: string
  cnpj: string
  responsavel: string
  email_contato: string
  telefone: string
  cidade: string
  uf: string
  observacoes: string
}

function dadosIniciais(empresa: Empresa | null): FormDados {
  return {
    razao_social: empresa?.razao_social ?? '',
    cnpj: empresa?.cnpj ? formatarCnpj(empresa.cnpj) : '',
    responsavel: empresa?.responsavel ?? '',
    email_contato: empresa?.email_contato ?? '',
    telefone: empresa?.telefone ? formatarTelefone(empresa.telefone) : '',
    cidade: empresa?.cidade ?? '',
    uf: empresa?.uf ?? '',
    observacoes: empresa?.observacoes ?? '',
  }
}

/** Como a API recebe: vazio vira null, CNPJ e telefone só com dígitos. */
function paraApi(dados: FormDados) {
  const texto = (valor: string) => valor.trim() || null
  const digitos = (valor: string) => valor.replace(/\D/g, '') || null
  return {
    razao_social: texto(dados.razao_social),
    cnpj: digitos(dados.cnpj),
    responsavel: texto(dados.responsavel),
    email_contato: texto(dados.email_contato)?.toLowerCase() ?? null,
    telefone: digitos(dados.telefone),
    cidade: texto(dados.cidade),
    uf: texto(dados.uf),
    observacoes: texto(dados.observacoes),
  }
}

function ModalEmpresa({ empresa, onFechar, onSalvo }: ModalProps) {
  const [nome, setNome] = useState(empresa?.nome ?? '')
  const [dados, setDados] = useState<FormDados>(() => dadosIniciais(empresa))
  const [logo, setLogo] = useState<string | null>(empresa?.logo ?? null)
  const [usuario, setUsuario] = useState(empresa?.secullum_usuario ?? '')
  const [senha, setSenha] = useState('')
  const [senhaVisivel, setSenhaVisivel] = useState(false)
  const [bancoId, setBancoId] = useState(empresa?.secullum_banco_id ?? '')
  const [ativo, setAtivo] = useState(empresa?.ativo ?? true)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [teste, setTeste] = useState<TesteConexao | null>(null)
  const [testando, setTestando] = useState(false)

  const senhaSalva = Boolean(empresa?.possui_senha)
  const removendoCredenciais = Boolean(empresa?.secullum_usuario) && !usuario.trim()

  const mudar = (campo: keyof FormDados) => (valor: string) => setDados((atual) => ({ ...atual, [campo]: valor }))

  function validar() {
    const saida: Record<string, string> = {}
    if (!nome.trim()) saida.nome = 'Informe o nome.'
    if (dados.cnpj && !cnpjValido(dados.cnpj)) saida.cnpj = 'CNPJ inválido.'
    if (dados.email_contato.trim() && !EMAIL_VALIDO.test(dados.email_contato.trim())) saida.email_contato = 'E-mail inválido.'
    const telefone = dados.telefone.replace(/\D/g, '')
    if (telefone && (telefone.length < 10 || telefone.length > 11)) saida.telefone = 'Informe DDD e número.'
    if (usuario.trim() && !senha && !senhaSalva) saida.secullum_senha = 'Informe a senha da Secullum.'
    if (!usuario.trim() && senha) saida.secullum_usuario = 'Informe o usuário junto com a senha.'
    return saida
  }

  async function salvar(event: FormEvent) {
    event.preventDefault()
    const locais = validar()
    setErros(locais)
    if (Object.keys(locais).length) return

    const usuarioLimpo = usuario.trim() || null
    const bancoLimpo = bancoId.trim() || null
    const cadastro = paraApi(dados)
    setEnviando(true)
    try {
      if (!empresa) {
        const criada = await api<Empresa>('/admin/empresas', {
          method: 'POST',
          json: {
            nome: nome.trim(),
            ...cadastro,
            logo,
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
      for (const [campo, valor] of Object.entries(cadastro)) {
        if (valor !== empresa[campo as keyof typeof cadastro]) alteracoes[campo] = valor
      }
      if (logo !== empresa.logo) alteracoes.logo = logo
      if (usuarioLimpo !== empresa.secullum_usuario) alteracoes.secullum_usuario = usuarioLimpo
      if (senha && usuarioLimpo) alteracoes.secullum_senha = senha
      if (bancoLimpo !== empresa.secullum_banco_id) alteracoes.secullum_banco_id = bancoLimpo
      if (ativo !== empresa.ativo) alteracoes.ativo = ativo
      if (!Object.keys(alteracoes).length) return onFechar()

      const atualizada = await api<Empresa>(`/admin/empresas/${empresa.id}`, { method: 'PATCH', json: alteracoes })
      onSalvo(atualizada, false)
    } catch (e) {
      setErros(errosDeCampos(e))
      alertarFalha(e)
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

  const subPrevia = [dados.razao_social.trim(), cnpjValido(dados.cnpj) && `CNPJ ${dados.cnpj}`].filter(Boolean).join(' · ')

  return (
    <Modal titulo={empresa ? `Editar ${empresa.nome}` : 'Nova empresa'} onFechar={onFechar} largo>
      <form className="modal-form" onSubmit={salvar} noValidate>
        <PreviaCadastro
          nome={nome}
          sub={subPrevia || undefined}
          vazio="Nome da empresa"
          imagem={<LogoEmpresa nome={nome || '?'} logo={logo} tamanho={52} />}
        />

        <SecaoCadastro titulo="Identificação" descricao="Como a empresa aparece no Copiloto e nos documentos.">
          <CampoLogo nome={nome} logo={logo} onMudar={setLogo} />
          <div className="campos-grade">
            <Campo rotulo="Nome (como aparece no sistema)" erro={erros.nome}>
              {(props) => (
                <input {...props} type="text" value={nome} maxLength={120} onChange={(event) => setNome(event.target.value)} data-autofoco />
              )}
            </Campo>
            <Campo rotulo="CNPJ" erro={erros.cnpj}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  inputMode="numeric"
                  placeholder="00.000.000/0000-00"
                  value={dados.cnpj}
                  onChange={(event) => mudar('cnpj')(mascararCnpjEntrada(event.target.value))}
                />
              )}
            </Campo>
          </div>
          <Campo rotulo="Razão social" erro={erros.razao_social}>
            {(props) => (
              <input
                {...props}
                type="text"
                value={dados.razao_social}
                maxLength={200}
                onChange={(event) => mudar('razao_social')(event.target.value)}
              />
            )}
          </Campo>
        </SecaoCadastro>

        <SecaoCadastro titulo="Contato" descricao="Com quem a Scale IA fala nesta empresa.">
          <div className="campos-grade">
            <Campo rotulo="Responsável" erro={erros.responsavel}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={dados.responsavel}
                  maxLength={120}
                  autoComplete="off"
                  onChange={(event) => mudar('responsavel')(event.target.value)}
                />
              )}
            </Campo>
            <Campo rotulo="Telefone" erro={erros.telefone}>
              {(props) => (
                <input
                  {...props}
                  type="tel"
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                  value={dados.telefone}
                  onChange={(event) => mudar('telefone')(mascararTelefoneEntrada(event.target.value))}
                />
              )}
            </Campo>
          </div>
          <Campo rotulo="E-mail de contato" erro={erros.email_contato}>
            {(props) => (
              <input
                {...props}
                type="email"
                value={dados.email_contato}
                autoComplete="off"
                onChange={(event) => mudar('email_contato')(event.target.value)}
              />
            )}
          </Campo>
          <div className="campos-cidade">
            <Campo rotulo="Cidade" erro={erros.cidade}>
              {(props) => (
                <input {...props} type="text" value={dados.cidade} maxLength={100} onChange={(event) => mudar('cidade')(event.target.value)} />
              )}
            </Campo>
            <Campo rotulo="UF" erro={erros.uf}>
              {(props) => (
                <select {...props} value={dados.uf} onChange={(event) => mudar('uf')(event.target.value)}>
                  <option value="">—</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
          </div>
        </SecaoCadastro>

        <SecaoCadastro titulo="Integração Secullum" descricao="Credenciais usadas para puxar cadastros, saldos e batidas.">
          <div className="campos-grade">
            <Campo
              rotulo="Usuário"
              erro={erros.secullum_usuario}
              ajuda={removendoCredenciais ? 'Salvar sem usuário remove as credenciais.' : undefined}
            >
              {(props) => (
                <input {...props} type="text" value={usuario} autoComplete="off" onChange={(event) => setUsuario(event.target.value)} />
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
        </SecaoCadastro>

        <SecaoCadastro titulo="Observações">
          <Campo rotulo="Anotações internas da equipe" erro={erros.observacoes}>
            {(props) => (
              <textarea
                {...props}
                value={dados.observacoes}
                maxLength={2000}
                rows={3}
                onChange={(event) => mudar('observacoes')(event.target.value)}
              />
            )}
          </Campo>
          <label className="checkbox-item">
            <input type="checkbox" checked={ativo} onChange={(event) => setAtivo(event.target.checked)} />
            Empresa ativa (extrações e sincronizações habilitadas)
          </label>
        </SecaoCadastro>

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
