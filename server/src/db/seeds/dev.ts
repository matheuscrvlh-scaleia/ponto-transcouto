import type { PoolClient } from 'pg'
import { db, withTransaction } from '../database'
import { proximosCiclos } from '../../services/calendario.service'
import { hashPassword } from '../../utils/hash'
import { minutosParaHoras } from '../../utils/minutos'

const EMPRESA = 'Demo'
const SENHA_DEMO = 'demo12345'
const DIA_MS = 86400000
const TETO_MENSAL = 600
const configDemo = {
    dia_semana_extracao: 3,
    hora_extracao: '06:00',
    dia_fechamento_mes: 25,
    dias_apos_fechamento_mes: 2,
    fuso_horario: 'America/Sao_Paulo',
}

const unidadesDemo = [
    { razao: 'TC GDR TRANSPORTE E LOGISTICA LTDA', nome: 'GDR', cnpjBase: '112223330001', colaboradores: 10 },
    { razao: 'TC VRD TRANSPORTES RODOVIARIOS LTDA', nome: 'VRD', cnpjBase: '445556660001', colaboradores: 9 },
    { razao: 'TC TRS LOGISTICA INTEGRADA LTDA', nome: 'TRS', cnpjBase: '778889990001', colaboradores: 6 },
    { razao: 'TC NOVA UNIDADE SERVICOS LTDA', nome: null, cnpjBase: '121314150001', colaboradores: 0 },
]

const nomes = [
    'Ana Paula Ribeiro', 'Bruno Carvalho Lima', 'Carla Mendes Souza', 'Diego Ferreira Alves', 'Eduarda Martins Rocha',
    'Fábio Nascimento Costa', 'Gabriela Teixeira Dias', 'Henrique Barbosa Pinto', 'Isabela Moreira Gomes',
    'João Victor Araújo', 'Karina Lopes Cardoso', 'Leonardo Santos Freitas', 'Mariana Duarte Viana',
    'Nelson Pereira Campos', 'Otávio Rezende Melo', 'Patrícia Almeida Nunes', 'Rafael Cunha Monteiro',
    'Sabrina Castro Farias', 'Thiago Batista Moura', 'Úrsula Correia Brandão', 'Vinícius Rocha Tavares',
    'Wesley Fonseca Prado', 'Yasmin Guimarães Leal', 'Zeca Antunes Queiroz', 'Lívia Machado Serra',
]
const funcoes = ['Motorista', 'Ajudante de carga', 'Conferente', 'Auxiliar administrativo', 'Operador de empilhadeira']

const colunasSecullum = ['Normais', 'Ex50%', 'Ex100%', 'Faltas', 'Atras.', 'BSaldo']
const mapeamento = [
    ['Normais', 'ignorar'],
    ['Ex50%', 'extra'],
    ['Ex100%', 'extra'],
    ['Faltas', 'negativa'],
    ['Atras.', 'negativa'],
    ['BSaldo', 'saldo_banco'],
]

function digitoCpf(base: string) {
    const soma = [...base].reduce((acc, n, i) => acc + Number(n) * (base.length + 1 - i), 0)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
}

function gerarCpf(semente: number) {
    let base = String(semente).padStart(9, '0')
    base += digitoCpf(base)
    return base + digitoCpf(base)
}

function gerarCnpj(base: string) {
    const digito = (b: string) => {
        const pesos = b.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        const resto = [...b].reduce((acc, n, i) => acc + Number(n) * pesos[i], 0) % 11
        return resto < 2 ? 0 : 11 - resto
    }
    const b13 = base + digito(base)
    return b13 + digito(b13)
}

function aleatorio(semente: number) {
    let s = semente
    return (min: number, max: number) => {
        s = (s * 1103515245 + 12345) % 2147483648
        return min + (s % (max - min + 1))
    }
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const somarDias = (d: Date, n: number) => new Date(d.getTime() + n * DIA_MS)

function montarCiclos(agora: Date) {
    const previstos = proximosCiclos(configDemo, somarDias(agora, -60), 20)
    const passados = previstos.filter(c => c.gatilho_em <= agora)
    return { publicados: passados.slice(-3), futuro: previstos.find(c => c.gatilho_em > agora)! }
}

type Perfil = { saldoInicial: number; extraSemana: [number, number]; negativaSemana: [number, number] }

function perfilDoColaborador(i: number, sorteio: ReturnType<typeof aleatorio>): Perfil {
    if (i % 8 === 0) return { saldoInicial: sorteio(900, 1500), extraSemana: [240, 480], negativaSemana: [0, 30] }
    if (i % 8 === 3) return { saldoInicial: sorteio(-1100, -700), extraSemana: [0, 20], negativaSemana: [120, 260] }
    if (i % 8 === 5) return { saldoInicial: sorteio(300, 500), extraSemana: [120, 260], negativaSemana: [0, 40] }
    return { saldoInicial: sorteio(-300, 300), extraSemana: [0, 200], negativaSemana: [0, 120] }
}

async function limparDemo(client: PoolClient, empresaId: number) {
    const porEmpresa = [
        `UPDATE fechamentos SET status = 'cancelado' WHERE empresa_id = $1 AND status = 'sucesso'`,
        'DELETE FROM registros_horas WHERE fechamento_id IN (SELECT id FROM fechamentos WHERE empresa_id = $1)',
        'DELETE FROM fechamentos WHERE empresa_id = $1',
        'DELETE FROM ciclos WHERE empresa_id = $1',
        'DELETE FROM usuarios WHERE empresa_id = $1',
        'DELETE FROM colaboradores WHERE empresa_id = $1',
        'DELETE FROM unidades WHERE empresa_id = $1',
        'DELETE FROM chamadas_api WHERE empresa_id = $1',
        'DELETE FROM mapeamento_colunas WHERE empresa_id = $1',
        'DELETE FROM log_auditoria WHERE empresa_id = $1',
    ]
    for (const sql of porEmpresa) await client.query(sql, [empresaId])
}

async function semear(client: PoolClient) {
    const sorteio = aleatorio(20260929)
    const hoje = new Date()

    const existente = await client.query<{ id: number }>('SELECT id FROM empresas WHERE nome = $1', [EMPRESA])
    let empresaId = existente.rows[0]?.id
    if (empresaId) {
        await limparDemo(client, empresaId)
        await client.query(
            `UPDATE empresas SET secullum_usuario = NULL, secullum_senha_cripto = NULL, secullum_banco_id = NULL,
                    ativo = true, sincronizacao_solicitada_em = NULL, sincronizado_em = now() WHERE id = $1`,
            [empresaId],
        )
    } else {
        const nova = await client.query<{ id: number }>(
            'INSERT INTO empresas (nome, sincronizado_em) VALUES ($1, now()) RETURNING id',
            [EMPRESA],
        )
        empresaId = nova.rows[0].id
    }
    await client.query(`DELETE FROM usuarios WHERE lower(email) IN ('rh@demo.local', 'gestor@demo.local')`)

    await client.query(
        `INSERT INTO configuracoes (empresa_id, dia_semana_extracao, hora_extracao, dia_fechamento_mes,
                dias_apos_fechamento_mes, origem_horas_pagas, teto_horas_pagas_minutos, teto_periodicidade,
                alerta_saldo_positivo_minutos, alerta_saldo_negativo_minutos, fuso_horario, cota_calcular_por_hora,
                atualizado_por)
         VALUES ($1, 3, '06:00', 25, 2, 'teto', $2, 'mensal', 600, 600, 'America/Sao_Paulo', 90, NULL)
         ON CONFLICT (empresa_id) DO UPDATE SET
                dia_semana_extracao = 3, hora_extracao = '06:00', dia_fechamento_mes = 25,
                dias_apos_fechamento_mes = 2, origem_horas_pagas = 'teto', teto_horas_pagas_minutos = $2,
                teto_periodicidade = 'mensal', alerta_saldo_positivo_minutos = 600,
                alerta_saldo_negativo_minutos = 600, fuso_horario = 'America/Sao_Paulo',
                cota_calcular_por_hora = 90, atualizado_por = NULL`,
        [empresaId, TETO_MENSAL],
    )

    for (const [coluna, campo] of mapeamento) {
        await client.query('INSERT INTO mapeamento_colunas (empresa_id, coluna_secullum, campo) VALUES ($1, $2, $3)', [
            empresaId,
            coluna,
            campo,
        ])
    }

    const unidades: { id: number; nome: string | null; colaboradores: number[] }[] = []
    let indiceColaborador = 0
    for (const u of unidadesDemo) {
        const { rows } = await client.query<{ id: number }>(
            `INSERT INTO unidades (empresa_id, documento, razao_social, nome_exibicao, sincronizado_em)
             VALUES ($1, $2, $3, $4, now()) RETURNING id`,
            [empresaId, gerarCnpj(u.cnpjBase), u.razao, u.nome],
        )
        const unidade = { id: rows[0].id, nome: u.nome, colaboradores: [] as number[] }
        for (let i = 0; i < u.colaboradores; i++, indiceColaborador++) {
            const col = await client.query<{ id: number }>(
                `INSERT INTO colaboradores (empresa_id, unidade_id, secullum_id, nome, cpf, numero_folha, departamento,
                        funcao, data_admissao, sincronizado_em)
                 VALUES ($1, $2, $3, $4, $5, $6, 'Operações', $7, $8, now()) RETURNING id`,
                [
                    empresaId,
                    unidade.id,
                    9000 + indiceColaborador,
                    nomes[indiceColaborador],
                    gerarCpf(812345000 + indiceColaborador * 7),
                    String(1000 + indiceColaborador),
                    funcoes[indiceColaborador % funcoes.length],
                    iso(somarDias(hoje, -400 - indiceColaborador * 30)),
                ],
            )
            unidade.colaboradores.push(col.rows[0].id)
        }
        unidades.push(unidade)
    }

    const { publicados, futuro } = montarCiclos(hoje)

    const ciclos: number[] = []
    for (const c of [...publicados, futuro]) {
        const { rows } = await client.query<{ id: number }>(
            `INSERT INTO ciclos (empresa_id, tipo, periodo_inicio, data_referencia, gatilho_previsto_em, gatilho_em)
             VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`,
            [empresaId, c.tipo, c.periodo_inicio, c.data_referencia, c.gatilho_em],
        )
        ciclos.push(rows[0].id)
    }
    const cicloFuturoId = ciclos.pop()!

    const perfis = new Map<number, Perfil>()
    unidades.flatMap(u => u.colaboradores).forEach((id, i) => perfis.set(id, perfilDoColaborador(i, sorteio)))

    const mapeadas = unidades.filter(u => u.nome)
    for (const unidade of mapeadas) {
        const acumulado = new Map<number, { extra: number; negativa: number; pagas: number; banco: number; id: number | null }>()
        const saldoBase = new Map<number, number>()
        unidade.colaboradores.forEach(id => saldoBase.set(id, perfis.get(id)!.saldoInicial))

        for (const [k, cicloId] of ciclos.entries()) {
            const gatilho = publicados[k].gatilho_em
            if (k === 0 || publicados[k].periodo_inicio !== publicados[k - 1].periodo_inicio) {
                for (const id of unidade.colaboradores) {
                    const a = acumulado.get(id)
                    if (a) saldoBase.set(id, saldoBase.get(id)! + a.banco - a.negativa)
                    acumulado.set(id, { extra: 0, negativa: 0, pagas: 0, banco: 0, id: null })
                }
            }
            const falhou = unidade.nome === 'TRS' && k === ciclos.length - 1
            const comRegistro = falhou ? unidade.colaboradores.slice(0, 4) : unidade.colaboradores
            const publicadoEm = new Date(gatilho.getTime() + 40 * 60000)

            const f = await client.query<{ id: number }>(
                `INSERT INTO fechamentos (ciclo_id, empresa_id, unidade_id, status, tentativas, total_colaboradores,
                        teto_aplicado_minutos, teto_periodicidade_aplicada, publicado_em)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'mensal', $8) RETURNING id`,
                [
                    cicloId,
                    empresaId,
                    unidade.id,
                    falhou ? 'falhou' : 'sucesso',
                    falhou ? 5 : 1,
                    unidade.colaboradores.length,
                    TETO_MENSAL,
                    falhou ? null : publicadoEm,
                ],
            )
            const fechamentoId = f.rows[0].id

            const ex = await client.query<{ id: number }>(
                `INSERT INTO execucoes_extracao (fechamento_id, status, total_colaboradores, processados, com_erro,
                        mensagem_erro, iniciado_em, finalizado_em)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                [
                    fechamentoId,
                    falhou ? 'falhou' : 'sucesso',
                    unidade.colaboradores.length,
                    comRegistro.length,
                    unidade.colaboradores.length - comRegistro.length,
                    falhou ? 'Cota da Secullum esgotada (HTTP 429) após 5 tentativas.' : null,
                    new Date(gatilho.getTime() + 60000),
                    falhou ? new Date(gatilho.getTime() + 25 * 60000) : new Date(gatilho.getTime() + 35 * 60000),
                ],
            )

            if (falhou) {
                for (const colaboradorId of unidade.colaboradores.slice(4)) {
                    await client.query(
                        `INSERT INTO execucao_erros (execucao_id, colaborador_id, etapa, http_status, mensagem)
                         VALUES ($1, $2, 'calcular', 429, 'Too Many Requests: limite de 100 requisições por hora.')`,
                        [ex.rows[0].id, colaboradorId],
                    )
                }
                await client.query(
                    `INSERT INTO execucao_erros (execucao_id, etapa, mensagem)
                     VALUES ($1, 'mapeamento', 'Coluna não mapeada: Ex150%')`,
                    [ex.rows[0].id],
                )
            }

            for (const colaboradorId of comRegistro) {
                const perfil = perfis.get(colaboradorId)!
                const anterior = acumulado.get(colaboradorId)!
                const extra = anterior.extra + sorteio(...perfil.extraSemana)
                const negativa = anterior.negativa + sorteio(...perfil.negativaSemana)
                const pagas = Math.min(extra, TETO_MENSAL)
                const banco = extra - pagas
                const saldo = saldoBase.get(colaboradorId)! + banco - negativa
                const extra50 = Math.round(extra * 0.7)
                const faltas = Math.round(negativa * 0.6)

                const dadosBrutos = {
                    colunas: colunasSecullum,
                    totais: [
                        minutosParaHoras(176 * 60 - negativa),
                        minutosParaHoras(extra50),
                        minutosParaHoras(extra - extra50),
                        minutosParaHoras(faltas),
                        minutosParaHoras(negativa - faltas),
                        minutosParaHoras(saldo),
                    ],
                }

                const r = await client.query<{ id: number }>(
                    `INSERT INTO registros_horas (fechamento_id, colaborador_id, extra_periodo, negativa_periodo,
                            pagas_periodo, banco_periodo, extra_semana, negativa_semana, pagas_semana, banco_semana,
                            saldo_banco_total, base_semana_registro_id, dados_brutos)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
                    [
                        fechamentoId,
                        colaboradorId,
                        extra,
                        negativa,
                        pagas,
                        banco,
                        extra - anterior.extra,
                        negativa - anterior.negativa,
                        pagas - anterior.pagas,
                        banco - anterior.banco,
                        saldo,
                        anterior.id,
                        dadosBrutos,
                    ],
                )
                if (!falhou) acumulado.set(colaboradorId, { extra, negativa, pagas, banco, id: r.rows[0].id })
            }
        }

        await client.query(
            `INSERT INTO fechamentos (ciclo_id, empresa_id, unidade_id, status, teto_aplicado_minutos,
                    teto_periodicidade_aplicada)
             VALUES ($1, $2, $3, 'pendente', $4, 'mensal')`,
            [cicloFuturoId, empresaId, unidade.id, TETO_MENSAL],
        )
    }

    const senha = await hashPassword(SENHA_DEMO)
    const rh = await client.query<{ id: number }>(
        `INSERT INTO usuarios (nome, email, cpf, senha, perfil, empresa_id, ativo, deve_trocar_senha)
         VALUES ('RH Demo', 'rh@demo.local', $1, $2, 'rh', $3, true, false) RETURNING id`,
        [gerarCpf(812399001), senha, empresaId],
    )
    const gestor = await client.query<{ id: number }>(
        `INSERT INTO usuarios (nome, email, cpf, senha, perfil, empresa_id, ativo, deve_trocar_senha)
         VALUES ('Gestor Demo', 'gestor@demo.local', $1, $2, 'gestor', $3, true, false) RETURNING id`,
        [gerarCpf(812399002), senha, empresaId],
    )
    for (const unidade of mapeadas.slice(0, 2)) {
        await client.query(
            'INSERT INTO usuario_unidades (usuario_id, unidade_id, empresa_id, criado_por) VALUES ($1, $2, $3, $4)',
            [gestor.rows[0].id, unidade.id, empresaId, rh.rows[0].id],
        )
    }

    return {
        empresaId,
        unidades: unidades.map(u => ({ id: u.id, nome: u.nome, colaboradores: u.colaboradores.length })),
        ciclos: [...publicados.map(c => `${c.data_referencia} ${c.tipo}`), `${futuro.data_referencia} ${futuro.tipo} (pendente)`],
        gestorCpf: gerarCpf(812399002),
    }
}

withTransaction(semear)
    .then(r => {
        console.log(`Empresa "${EMPRESA}" #${r.empresaId} recriada.`)
        console.table(r.unidades)
        console.log('Ciclos:', r.ciclos.join(', '))
        console.log(`Usuários: rh@demo.local e gestor@demo.local (CPF ${r.gestorCpf}), senha "${SENHA_DEMO}"`)
    })
    .catch(err => {
        console.error(err)
        process.exitCode = 1
    })
    .finally(() => db.end())
