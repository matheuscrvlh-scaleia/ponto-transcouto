import type { StatusFechamento } from '../types/api'

type Status = StatusFechamento | 'interrompida'

const ROTULOS: Record<Status, string> = {
  pendente: 'Pendente',
  processando: 'Processando',
  sucesso: 'Sucesso',
  falhou: 'Falhou',
  cancelado: 'Cancelado',
  interrompida: 'Interrompida',
}

export function PilulaStatus({ status, atrasado = false }: { status: Status; atrasado?: boolean }) {
  const classe = status === 'interrompida' ? 'falhou' : status
  return (
    <span className={`pilula pilula-${classe}`}>
      {ROTULOS[status]}
      {atrasado && ' (atrasado)'}
    </span>
  )
}

export function PilulaAtivo({ ativo, rotulos = ['Ativo', 'Inativo'] }: { ativo: boolean; rotulos?: [string, string] }) {
  return <span className={ativo ? 'pilula pilula-sucesso' : 'pilula pilula-inativo'}>{ativo ? rotulos[0] : rotulos[1]}</span>
}
