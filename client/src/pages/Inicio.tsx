import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { EstadoVazio } from '../components/Estados'
import { lerUltimaUnidade } from '../lib/preferencias'

export function Inicio() {
  const { unidades, perfil } = useAuth()

  if (unidades.length === 1) return <Navigate to={`/unidades/${unidades[0].id}`} replace />

  if (unidades.length > 1) {
    const ultima = lerUltimaUnidade()
    const valida = unidades.some((unidade) => unidade.id === ultima)
    return <Navigate to={valida ? `/unidades/${ultima}` : '/unidades'} replace />
  }

  return (
    <EstadoVazio titulo="Nenhuma unidade disponível">
      {perfil === 'gestor' ? (
        <p>Você ainda não está vinculado a nenhuma unidade. Fale com o RH.</p>
      ) : (
        <>
          <p>Nenhuma unidade tem nome de exibição configurado ainda.</p>
          <Link to="/admin/unidades" className="btn-link">
            Configurar unidades
          </Link>
        </>
      )}
    </EstadoVazio>
  )
}
