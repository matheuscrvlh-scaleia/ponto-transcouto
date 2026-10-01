import { useMatch, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEmpresaAdmin } from '../context/EmpresaAdminContext'
import { IconePainel, IconeUnidade } from './Icones'
import { SeletorLista, type OpcaoLista } from './SeletorLista'

const TODAS = 'todas'

/* Unidade em foco na Gestão. A primeira opção leva ao painel com todas as
   unidades; para a equipe, a lista segue a empresa escolhida no topo. */
export function SeletorUnidade({ className = '' }: { className?: string }) {
  const { unidades } = useAuth()
  const { ehAdmin, empresaId } = useEmpresaAdmin()
  const navigate = useNavigate()
  const matchUnidade = useMatch('/unidades/:unidadeId/*')
  const naVisaoGeral = Boolean(useMatch('/unidades'))

  const visiveis = ehAdmin && empresaId != null ? unidades.filter((unidade) => unidade.empresa_id === empresaId) : unidades
  if (visiveis.length < 2) return null

  const opcoes: OpcaoLista<number | typeof TODAS>[] = [
    { id: TODAS, nome: 'Todas as unidades', geral: true },
    ...[...visiveis]
      .sort((a, b) => a.nome_exibicao.localeCompare(b.nome_exibicao, 'pt-BR'))
      .map((unidade) => ({ id: unidade.id, nome: unidade.nome_exibicao })),
  ]
  const selecionadoId = naVisaoGeral ? TODAS : matchUnidade ? Number(matchUnidade.params.unidadeId) : null

  return (
    <SeletorLista
      rotulo="Unidade"
      opcoes={opcoes}
      selecionadoId={selecionadoId}
      onEscolher={(id) => navigate(id === TODAS ? '/unidades' : `/unidades/${id}`)}
      icone={selecionadoId === TODAS ? <IconePainel tamanho={18} /> : <IconeUnidade tamanho={18} />}
      iconeGeral={<IconePainel tamanho={16} />}
      vazio="Escolha uma unidade"
      className={className}
    />
  )
}
