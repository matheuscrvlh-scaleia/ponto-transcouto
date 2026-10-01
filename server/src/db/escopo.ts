import type { Ator } from '../types/auth.types'

/**
 * Trecho SQL com as unidades que o ator pode ver (função unidades_permitidas).
 * O id vai como parâmetro (`param`, padrão $1); o tipo entra como literal,
 * mas só pode ser um dos dois valores fixos abaixo.
 */
export function unidadesPermitidasSql(ator: Ator, param = '$1') {
    const tipo = ator.tipo === 'equipe' ? 'equipe' : 'cliente'
    return `unidades_permitidas('${tipo}', ${param})`
}
