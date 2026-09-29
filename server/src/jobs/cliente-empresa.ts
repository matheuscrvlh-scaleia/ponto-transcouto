import { criarClienteSecullum } from '../integrations/secullum/cliente'
import { SecullumError, type OpcoesCliente } from '../integrations/secullum/tipos'
import type { CredenciaisEmpresaRow } from '../models/sincronizacao.models'
import { decrypt } from '../utils/crypt'

export function clienteDaEmpresa(empresa: CredenciaisEmpresaRow, opcoes: OpcoesCliente = {}) {
    if (!empresa.secullum_usuario || !empresa.secullum_senha_cripto || !empresa.secullum_banco_id) {
        throw new SecullumError(`Empresa ${empresa.nome} sem credenciais Secullum completas.`, 'auth')
    }

    let senha: string
    try {
        senha = decrypt(empresa.secullum_senha_cripto)
    } catch {
        throw new SecullumError(`Empresa ${empresa.nome}: senha Secullum não pôde ser decifrada (ENCRYPTION_KEY?).`, 'auth')
    }

    return criarClienteSecullum(
        { empresaId: empresa.id, usuario: empresa.secullum_usuario, senha, bancoId: empresa.secullum_banco_id },
        opcoes,
    )
}
