import { useMatch, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEmpresaAdmin } from '../context/EmpresaAdminContext'
import { IconePainel, IconeUnidade } from './Icones'
import { SeletorLista, type OpcaoLista } from './SeletorLista'
import { caminhoColaboradores } from '../lib/painel'

const TODAS = 'todas'

/* Unidade em foco na Gestão. A primeira opção leva ao painel com todas as
   unidades; para a equipe, a lista segue a empresa escolhida na barra lateral.
   Na tela de Colaboradores, trocar a unidade continua na lista de colaboradores. */
export function SeletorUnidade({ className = '' }: { className?: string }) {
  const { unidades } = useAuth()
  const { ehAdmin, empresaId } = useEmpresaAdmin()
  const navigate = useNavigate()
  const matchUnidade = useMatch('/unidades/:unidadeId/*')
  const naColaboradoresTodas = Boolean(useMatch('/colaboradores'))
  const naColaboradoresUnidade = Boolean(useMatch('/unidades/:unidadeId/colaboradores'))
  const naColaboradores = naColaboradoresTodas || naColaboradoresUnidade
  const naVisaoGeral = Boolean(useMatch('/unidades')) || naColaboradoresTodas

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
      onEscolher={(id) => {
        const unidade = id === TODAS ? null : id
        navigate(naColaboradores ? caminhoColaboradores(unidade) : unidade ? `/unidades/${unidade}` : '/unidades')
      }}
      icone={selecionadoId === TODAS ? <IconePainel tamanho={18} /> : <IconeUnidade tamanho={18} />}
      iconeGeral={<IconePainel tamanho={16} />}
      vazio="Escolha uma unidade"
      className={className}
    />
  )
}
