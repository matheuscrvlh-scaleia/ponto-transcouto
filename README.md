# Copiloto de Ponto — Transcouto

Painel somente leitura do banco de horas por unidade. Os dados vêm da FriPonto (Secullum Ponto Web) uma vez por semana, depois do ajuste do RH, e ficam congelados em fechamentos.

```
client/   React + Vite (painel do gestor e área admin)
server/   Fastify + PostgreSQL (API REST em /api/v1 e worker de extração)
```

## Rodando local

```bash
# server
cd server
cp .env.example .env          # SUPABASE_CONNECTION_STRING, JWT_SECRET (≥32), ENCRYPTION_KEY (64 hex)
npm install
npm run migrate               # use --dry-run para testar sem aplicar
npm run seed:admin -- --email voce@scaleia.ai
npm run seed:dev              # opcional: empresa "Demo" com dados fictícios
npm run dev                   # API em :3000
npm run dev:worker            # régua, sincronização e extração

# client
cd client
cp .env.example .env          # VITE_API_URL=http://localhost:3000/api/v1
npm install
npm run dev                   # :5173
```

Usuários da Demo: `gestor@demo.local` e `rh@demo.local`, senha `demo12345`.

## Scripts do server

| Script | O que faz |
|---|---|
| `dev` / `start` | API |
| `dev:worker` / `start:worker` | Worker (`--uma-vez` roda um ciclo e sai) |
| `migrate` | Aplica migrations pendentes |
| `seed:admin` | Cria/atualiza um admin (sem `--senha`, gera temporária) |
| `seed:dev` | Recria os dados da empresa Demo |
| `typecheck` / `test` | TypeScript e vitest |

## Arquitetura

- `server/src`: `routes → controllers → models` (SQL) com `types` (zod), `services` (regras puras), `integrations/secullum`, `jobs` e `middlewares`.
- Perfis: `admin` (Scale, todas as empresas), `rh` (própria empresa), `gestor` (unidades vinculadas). Escopo aplicado no SQL por `unidades_permitidas()`.
- Extração: `/Calcular/SomenteTotais` da Secullum, um colaborador por chamada, limitado por `configuracoes.cota_calcular_por_hora` (padrão 90/h).
- Para ligar a Transcouto: em Admin → Empresas, cadastre o usuário de integração da Secullum, teste a conexão, escolha o banco, sincronize, faça o de-para das unidades e o mapeamento de colunas.
