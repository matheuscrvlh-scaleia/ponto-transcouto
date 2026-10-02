-- =====================================================================
-- 007 — Log de batidas (marcações) vindas da FonteDados da Secullum.
-- Somente leitura: o worker copia as marcações para o painel mostrar
-- quem bateu o ponto e quando. A FonteDados não entra na cota de
-- /Calcular. A carga é incremental por empresa: guarda o próximo Id a
-- pedir em FonteDados/APartirDoId (a API devolve Id >= cursor, 5.000
-- por página).
-- =====================================================================

CREATE TABLE public.batidas (
    id                      bigserial   PRIMARY KEY,
    empresa_id              integer     NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    -- Id da marcação na FonteDados (único dentro do banco Secullum da empresa)
    fonte_dados_id          bigint      NOT NULL,
    -- NULL enquanto o funcionário não chegou pela sincronização de cadastros
    colaborador_id          integer     REFERENCES public.colaboradores(id) ON DELETE CASCADE,
    -- unidade do colaborador quando a batida foi vinculada (escopo do gestor)
    unidade_id              integer     REFERENCES public.unidades(id) ON DELETE CASCADE,
    funcionario_secullum_id integer,
    cpf                     text,
    data                    date        NOT NULL,
    hora                    time        NOT NULL,
    -- 0 Original, 1 Manual, 2 Pré-assinalado, 3 Desconsiderado
    tipo                    smallint    NOT NULL DEFAULT 0,
    -- 0 Desconhecido, 1 Relógio de ponto, 2 Incluído manualmente, 3 Pré-assinalado, 4 Check-in,
    -- 5 Central do Funcionário (web), 6 (app), 7 (app offline), 8 Integração externa
    origem                  smallint    NOT NULL DEFAULT 0,
    equipamento_id          integer,
    -- quando a marcação entrou na Secullum
    incluida_em             timestamp,
    importada_em            timestamptz NOT NULL DEFAULT now(),
    atualizada_em           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT batidas_fonte_uk UNIQUE (empresa_id, fonte_dados_id),
    CONSTRAINT batidas_vinculo_chk CHECK ((colaborador_id IS NULL) = (unidade_id IS NULL))
);
-- log: última batida primeiro, com filtro por unidade (escopo) e por colaborador
CREATE INDEX batidas_unidade_idx ON public.batidas (unidade_id, data DESC, hora DESC, id DESC);
CREATE INDEX batidas_colaborador_idx ON public.batidas (colaborador_id, data DESC, hora DESC);
CREATE INDEX batidas_sem_vinculo_idx ON public.batidas (empresa_id) WHERE colaborador_id IS NULL;

-- Cursor da carga incremental, por empresa.
CREATE TABLE public.batidas_importacao (
    empresa_id       integer     PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
    -- próximo Id a pedir em FonteDados/APartirDoId; NULL = ainda na carga inicial por data
    proximo_id       bigint,
    importado_em     timestamptz,
    -- última releitura dos dias recentes por data (pega marcações alteradas sem Id novo)
    revisado_em      timestamptz,
    tentado_em       timestamptz NOT NULL DEFAULT now(),
    ultimo_erro      text,
    ultimo_erro_em   timestamptz
);

ALTER TABLE public.batidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batidas_importacao ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON public.batidas, public.batidas_importacao FROM anon, authenticated';
    END IF;
END $$;
