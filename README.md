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

## Produção (Docker)

`docker-compose.yml` sobe dois serviços:

| Serviço | Porta (host → container) | O que é |
|---|---|---|
| `api` | 3001 → 3000 | API com o worker embutido (`WORKER_EMBUTIDO=true`); manter uma réplica só |
| `web` | 8081 → 80 | Nginx com o build do client; repassa `/api` para a `api` |

O HTTPS fica com o proxy da VPS, apontando para a 8081. O banco continua no Supabase.

```bash
cp server/.env.example server/.env   # CORS_ORIGIN=https://<domínio do front>, TRUST_PROXY (ver abaixo)
docker compose build
docker compose run --rm api node --import tsx src/db/migrate.ts --dry-run
docker compose run --rm api node --import tsx src/db/migrate.ts
docker compose up -d
```

`TRUST_PROXY` = quantos proxies há na frente da API: `2` com proxy da VPS → `web` → `api`. Na VPS (IPv4), use a connection string do *Session pooler* do Supabase.

## Scripts do server

| Script | O que faz |
|---|---|
| `dev` / `start` | API |
| `dev:worker` / `start:worker` | Worker (`--uma-vez` roda um ciclo e sai) |
| `migrate` | Aplica migrations pendentes |
| `seed:admin` | Cria/atualiza alguém da equipe Scale IA (sem `--senha`, gera temporária) |
| `seed:dev` | Recria os dados da empresa Demo |
| `typecheck` / `test` | TypeScript e vitest |

## Arquitetura

- `server/src`: `routes → controllers → models` (SQL) com `types` (zod), `services` (regras puras), `integrations/secullum`, `jobs` e `middlewares`.
- Multi-empresa, com duas tabelas de login (e-mail/CPF únicos entre elas):
  - `usuarios` = equipe Scale IA (perfil `admin`, sem empresa): Administração (empresas, integração, fechamentos, calendário, equipe) e acesso a tudo.
  - `clientes` = usuários das empresas atendidas: `rh` (Gestão + Configuração da própria empresa) e `gestor` (Gestão das unidades vinculadas em `cliente_unidades`).
  - Escopo aplicado no SQL por `unidades_permitidas(tipo, id)`; o token leva o tipo (`equipe`/`cliente`).
- Extração: `/Calcular` da Secullum, um colaborador por chamada, limitado por `configuracoes.cota_calcular_por_hora` (padrão 90/h). A resposta traz os totais do período e uma linha por dia: os totais vão para o fechamento e os dias para `horas_dia` (extras, negativas e marcações de cada dia, regravados a cada coleta). Os dias alimentam o filtro de datas do Dashboard e de Colaboradores, a linha expansível de Colaboradores e o limite diário (Configuração → Alertas e horas pagas).
- Recálculo do histórico: o saldo do banco é acumulado (cada período herda o anterior), então a regra de horas pagas e o mapeamento de colunas valem para todos os dados, não só os próximos. Salvar uma dessas regras grava um pedido em `recalculos_saldo`; o worker (`jobs/recalculo.job.ts`) refaz, numa transação, todos os registros da empresa (fechamentos, tempo real e histórico diário) com a regra atual a partir dos totais da FriPonto já gravados, sem gastar cota. O fechamento publicado continua congelado: o trigger só libera o UPDATE dentro do recálculo e sem mexer nos dados brutos. As horas por dia (`horas_dia`) seguem o mapeamento novo a partir da próxima coleta.
- Modo de atualização por empresa (`configuracoes.modo_extracao`, o cliente escolhe em Configuração → Atualização dos dados):
  - `semanal`: só as fotografias semanais (ciclos/fechamentos) no dia e hora escolhidos.
  - `tempo_real`: as fotografias semanais continuam (histórico oficial, teto semanal) e o worker (`jobs/tempo-real.job.ts`) mantém em `registros_tempo_real` o período atual até hoje de cada colaborador, em rodízio. Fechamentos na fila têm prioridade e 10 chamadas/h ficam de reserva; com N colaboradores, cada um é atualizado a cada ~N/(cota−10) horas. O painel mostra, por colaborador, o dado mais recente entre o ao vivo e a última fotografia.
- Batidas (Gestão → Batidas): log das marcações da FriPonto, da mais recente para a mais antiga, com filtros por colaborador, unidade, período, origem e situação. O worker (`jobs/batidas.job.ts`) copia a `FonteDados` da Secullum para `batidas` a cada ~5 min por empresa: carga inicial dos últimos 31 dias por data, depois incremental por `FonteDados/APartirDoId` (cursor em `batidas_importacao`) e, uma vez por dia, relê os últimos 7 dias para pegar marcações alteradas. Não usa a cota de `/Calcular`.
- Para ligar a Transcouto: em Administração → Empresas, cadastre o usuário de integração da Secullum, teste a conexão, escolha o banco, sincronize, faça o de-para das unidades e o mapeamento de colunas.
