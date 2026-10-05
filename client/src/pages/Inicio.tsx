import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { EstadoVazio } from '../components/Estados'
import { TELAS } from '../lib/telas'

export function Inicio() {
  const { unidades, perfil, telas, podeVer } = useAuth()

  // sem o Dashboard no grupo de permissão: entra na primeira tela liberada
  if (!podeVer('dashboard')) {
    const primeira = TELAS.find((tela) => telas.includes(tela.id))
    if (primeira) return <Navigate to={primeira.caminho} replace />
    return (
      <EstadoVazio titulo="Nenhuma tela liberada">
        <p>O seu grupo de permissão ainda não libera nenhuma tela. Fale com o RH.</p>
      </EstadoVazio>
    )
  }

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
          {podeVer('unidades') && (
            <Link to="/configuracao/unidades" className="btn-link">
              Configurar unidades
            </Link>
          )}
        </>
      )}
    </EstadoVazio>
  )
}
