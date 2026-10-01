import { Link, Outlet } from 'react-router-dom'
import { useEmpresaAdmin } from '../../context/EmpresaAdminContext'
import { Carregando, ErroCarregamento, EstadoVazio } from '../../components/Estados'
import './admin.css'

/* Casca das áreas Configuração e Administração. A navegação fica na sidebar
   e a empresa em foco no topo (ambos no AppLayout); aqui só o conteúdo. */
export function AdminLayout() {
  return (
    <div className="admin-layout">
      <div className="admin-content">
        <Outlet />
      </div>
    </div>
  )
}

/** Telas que dependem de uma empresa: a equipe usa a escolhida no topo; o RH, a própria. */
export function ComEmpresa() {
  const { ehAdmin, empresaId, empresas, carregando, erro, selecionar, recarregarEmpresas } = useEmpresaAdmin()

  if (ehAdmin && carregando) return <Carregando texto="Carregando empresas..." />
  if (ehAdmin && erro) return <ErroCarregamento erro={erro} onTentarDeNovo={recarregarEmpresas} />

  if (ehAdmin && empresas.length === 0) {
    return (
      <EstadoVazio titulo="Nenhuma empresa cadastrada">
        <Link to="/admin/empresas" className="btn-link">
          Cadastrar empresa
        </Link>
      </EstadoVazio>
    )
  }

  // equipe em "Todas as empresas": esta tela é de uma empresa só, então pede a escolha
  if (ehAdmin && empresaId == null) {
    return (
      <EstadoVazio titulo="Escolha uma empresa">
        <p>Esta tela mostra os dados de uma empresa. Escolha qual no seletor do topo ou aqui:</p>
        <div className="escolha-empresa">
          {empresas.map((empresa) => (
            <button key={empresa.id} type="button" className="escolha-empresa-botao" onClick={() => selecionar(empresa.id)}>
              {empresa.nome}
              {!empresa.ativo && <span> (inativa)</span>}
            </button>
          ))}
        </div>
      </EstadoVazio>
    )
  }

  if (empresaId == null) {
    return (
      <EstadoVazio titulo="Sem empresa vinculada">
        <p>Seu usuário não está vinculado a uma empresa.</p>
      </EstadoVazio>
    )
  }

  return <Outlet key={empresaId} />
}
