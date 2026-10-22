import { useState } from 'react'
import { Link } from 'react-router-dom'
import { iniciais, normalizarBusca } from '../lib/formato'
import type { LinhaDashboard, Minutos } from '../types/api'
import { Horas } from './Horas'
import { IndicadorCurva } from './IndicadorCurva'
import { Modal } from './Modal'

/** A partir de quantos colaboradores o modal mostra a busca. */
const MINIMO_PARA_BUSCA = 8

interface Props<T extends LinhaDashboard> {
  titulo: string
  descricao: string
  linhas: T[]
  /** maiores saldos primeiro (padrão) ou menores primeiro (ex.: abaixo do limite) */
  ordem?: 'desc' | 'asc'
  link: (linha: T) => string
  complemento: (linha: T) => string
  limiteDe?: (linha: T) => Minutos | undefined
  /** O que mostrar e ordenar em cada linha (ex.: extras do intervalo); sem isso, o saldo do período com a curva. */
  valor?: (linha: T) => Minutos
  /** Com `valor`: mostra o sinal e a cor (positivo/negativo). */
  sinal?: boolean
  /** state do Link, para o detalhe do colaborador voltar ao painel com os filtros */
  origem: { de: string }
  onFechar: () => void
}

/* Colaboradores de um pedaço de gráfico (faixa de saldo, dentro/acima/abaixo da curva) ou de um total do resumo. */
export function ModalColaboradores<T extends LinhaDashboard>({
  titulo,
  descricao,
  linhas,
  ordem = 'desc',
  link,
  complemento,
  limiteDe,
  valor,
  sinal = false,
  origem,
  onFechar,
}: Props<T>) {
  const [busca, setBusca] = useState('')
  const termo = normalizarBusca(busca)
  const fator = ordem === 'asc' ? 1 : -1
  const numero = (linha: T) => (valor ? valor(linha) : linha.saldo_min)
  const visiveis = linhas
    .filter((linha) => normalizarBusca(`${linha.nome} ${complemento(linha)}`).includes(termo))
    .sort((a, b) => fator * (numero(a) - numero(b)) || a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <Modal titulo={titulo} onFechar={onFechar} largo>
      <p className="modal-colab-descricao">
        {descricao} · <strong>{linhas.length}</strong> {linhas.length === 1 ? 'colaborador' : 'colaboradores'}
      </p>

      {linhas.length > MINIMO_PARA_BUSCA && (
        <div className="busca modal-colab-busca">
          <label htmlFor="busca-modal-colab" className="sr-only">
            Buscar colaborador
          </label>
          <input
            id="busca-modal-colab"
            type="search"
            placeholder="Buscar por nome"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            data-autofoco
          />
        </div>
      )}

      {linhas.length === 0 ? (
        <p className="dash-vazio">Nenhum colaborador neste grupo.</p>
      ) : visiveis.length === 0 ? (
        <p className="dash-vazio">Nenhum resultado para “{busca}”.</p>
      ) : (
        <ul className="modal-colab-lista">
          {visiveis.map((linha) => (
            <li key={linha.id}>
              <Link to={link(linha)} state={origem} className="modal-colab-item" onClick={onFechar}>
                <span className={`avatar avatar-${linha.fora_da_curva}`} aria-hidden="true">
                  {iniciais(linha.nome)}
                </span>
                <span className="modal-colab-texto">
                  <span className="modal-colab-nome">{linha.nome}</span>
                  {complemento(linha) && <span className="modal-colab-info">{complemento(linha)}</span>}
                </span>
                <span className="modal-colab-saldo">
                  {valor ? (
                    <Horas minutos={valor(linha)} sinal={sinal} destacar={sinal} className="forte" />
                  ) : (
                    <>
                      <Horas minutos={linha.saldo_min} sinal destacar className="forte" />
                      <IndicadorCurva valor={linha.fora_da_curva} limite={limiteDe?.(linha)} compacto />
                    </>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="modal-colab-rodape">
        <button type="button" className="btn-secondary" onClick={onFechar}>
          Fechar
        </button>
      </div>
    </Modal>
  )
}
