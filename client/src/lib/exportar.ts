import type { Minutos } from '../types/api'

/* Exportação de arquivos gerados no navegador (sem passar pelo servidor). */

export type CelulaCsv = string | number | null | undefined

/** Minutos → "HH:MM" com "-" comum (o "−" tipográfico da tela atrapalha planilhas). */
export function minutosCsv(min: Minutos | null): string {
  if (min === null) return ''
  const abs = Math.abs(Math.trunc(min))
  const texto = `${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
  return min < 0 ? `-${texto}` : texto
}

function celula(valor: CelulaCsv) {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

/**
 * Baixa um CSV no padrão do Excel em português: separador ";" e BOM UTF-8
 * (sem o BOM, o Excel abre os acentos quebrados).
 */
export function baixarCsv(nomeArquivo: string, linhas: CelulaCsv[][]) {
  const conteudo = linhas.map((linha) => linha.map(celula).join(';')).join('\r\n')
  const blob = new Blob([`﻿${conteudo}\r\n`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** "Maria da Silva" → "maria-da-silva" (para nome de arquivo). */
export function paraNomeArquivo(texto: string) {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'arquivo'
  )
}

/**
 * Abre a impressão do navegador ("Salvar como PDF"). O título da aba vira o nome
 * sugerido do arquivo, então ele é trocado só durante a impressão.
 */
export function imprimirComoPdf(tituloArquivo: string) {
  const anterior = document.title
  document.title = tituloArquivo
  const restaurar = () => {
    document.title = anterior
    window.removeEventListener('afterprint', restaurar)
  }
  window.addEventListener('afterprint', restaurar)
  window.print()
}
