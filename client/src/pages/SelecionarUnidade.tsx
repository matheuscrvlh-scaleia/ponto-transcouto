import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados'
import { api } from '../lib/api'
import { formatarData, normalizarBusca } from '../lib/formato'
import { salvarUltimaUnidade } from '../lib/preferencias'
import { useRecurso } from '../lib/useRecurso'
import type { UnidadeResumo } from '../types/api'

export function SelecionarUnidade() {
  const { unidades: unidadesSessao } = useAuth()
  const [busca, setBusca] = useState('')
  const { dados, erro, carregando, recarregar } = useRecurso(
    (signal) => api<UnidadeResumo[]>('/unidades', { signal }),
    'unidades',
  )

  useEffect(() => {
    document.title = 'Unidades — Copiloto de Ponto'
  }, [])

  if (unidadesSessao.length === 1) return <Navigate to={`/unidades/${unidadesSessao[0].id}`} replace />

  const termo = normalizarBusca(busca)
  const lista = (dados ?? [])
    .filter((unidade) => normalizarBusca(unidade.nome_exibicao).includes(termo))
    .sort((a, b) => a.nome_exibicao.localeCompare(b.nome_exibicao, 'pt-BR'))

  return (
    <section className="pagina">
      <header className="pagina-header">
        <h1>Escolha uma unidade</h1>
        <p className="pagina-sub">Veja o banco de horas dos colaboradores de cada unidade.</p>
      </header>

      {carregando && <Carregando />}
      {erro && <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />}

      {dados && dados.length === 0 && (
        <EstadoVazio titulo="Nenhuma unidade disponível">
          <p>Você ainda não está vinculado a nenhuma unidade. Fale com o RH.</p>
        </EstadoVazio>
      )}

      {dados && dados.length > 8 && (
        <div className="busca">
          <label htmlFor="busca-unidade" className="sr-only">
            Buscar unidade
          </label>
          <input
            id="busca-unidade"
            type="search"
            placeholder="Buscar unidade"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
        </div>
      )}

      {dados && dados.length > 0 && (
        <ul className="grade-unidades">
          {lista.map((unidade) => (
            <li key={unidade.id}>
              <Link
                to={`/unidades/${unidade.id}`}
                className="cartao-unidade"
                onClick={() => salvarUltimaUnidade(unidade.id)}
              >
                <span className="cartao-unidade-nome">{unidade.nome_exibicao}</span>
                <span className="cartao-unidade-info">
                  {unidade.ultimo_fechamento
                    ? `Dados até ${formatarData(unidade.ultimo_fechamento.data_referencia)}`
                    : 'Sem dados ainda'}
                </span>
                {unidade.ultimo_fechamento && unidade.total_colaboradores !== undefined && (
                  <span className="cartao-unidade-info">
                    {unidade.total_colaboradores} colaboradores
                    {unidade.fora_da_curva ? ` · ${unidade.fora_da_curva} fora da curva` : ''}
                  </span>
                )}
              </Link>
            </li>
          ))}
          {lista.length === 0 && <li className="texto-suave">Nenhuma unidade encontrada para “{busca}”.</li>}
        </ul>
      )}
    </section>
  )
}
