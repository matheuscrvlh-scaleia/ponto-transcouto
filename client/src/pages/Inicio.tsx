import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { EstadoVazio } from '../components/Estados'

export function Inicio() {
  const { unidades, perfil } = useAuth()

  if (unidades.length === 1) return <Navigate to={`/unidades/${unidades[0].id}`} replace />

  // com várias unidades, entra direto no painel com todas juntas; a unidade se escolhe na sidebar
  if (unidades.length > 1) return <Navigate to="/unidades" replace />

  return (
    <EstadoVazio titulo="Nenhuma unidade disponível">
      {perfil === 'gestor' ? (
        <p>Você ainda não está vinculado a nenhuma unidade. Fale com o RH.</p>
      ) : (
        <>
          <p>Nenhuma unidade tem nome de exibição configurado ainda.</p>
          <Link to="/configuracao/unidades" className="btn-link">
            Configurar unidades
          </Link>
        </>
      )}
    </EstadoVazio>
  )
}
