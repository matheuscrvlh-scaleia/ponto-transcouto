import { useMatch, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEmpresaAdmin } from '../context/EmpresaAdminContext'
import { IconeEmpresa, IconePainel } from './Icones'
import { SeletorLista, type OpcaoLista } from './SeletorLista'

const TODAS = 'todas'

/* Só para a equipe Scale IA, no topo: empresa que está sendo visualizada.
   "Todas as empresas" junta tudo no dashboard; Configuração pede uma empresa. */
export function SeletorEmpresa({ className = '' }: { className?: string }) {
  const { unidades } = useAuth()
  const { ehAdmin, empresaId, empresas, selecionar } = useEmpresaAdmin()
  const navigate = useNavigate()
  const matchUnidade = useMatch('/unidades/:unidadeId/*')

  if (!ehAdmin || empresas.length === 0) return null

  const opcoes: OpcaoLista<number | typeof TODAS>[] = [
    { id: TODAS, nome: 'Todas as empresas', geral: true },
    ...[...empresas]
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((empresa) => ({ id: empresa.id, nome: empresa.ativo ? empresa.nome : `${empresa.nome} (inativa)` })),
  ]

  function escolher(id: number | typeof TODAS) {
    const novaEmpresa = id === TODAS ? null : id
    selecionar(novaEmpresa)
    // olhando uma unidade de outra empresa: volta para o painel da empresa escolhida
    const unidadeAtual = matchUnidade ? unidades.find((u) => u.id === Number(matchUnidade.params.unidadeId)) : null
    if (novaEmpresa != null && unidadeAtual && unidadeAtual.empresa_id !== novaEmpresa) navigate('/unidades')
  }

  return (
    <SeletorLista
      rotulo="Empresa"
      opcoes={opcoes}
      selecionadoId={empresaId ?? TODAS}
      onEscolher={escolher}
      icone={empresaId == null ? <IconePainel tamanho={18} /> : <IconeEmpresa tamanho={18} />}
      iconeGeral={<IconePainel tamanho={16} />}
      className={`seletor-empresa-topo ${className}`}
    />
  )
}
