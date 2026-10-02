-- =====================================================================
-- 004 — Modo de atualização por empresa: 'semanal' ou 'tempo_real'.
-- No tempo real, as fotografias semanais (ciclos/fechamentos) continuam
-- sendo o histórico oficial; por cima delas o worker mantém, por
-- colaborador, o período atual até hoje em registros_tempo_real,
-- atualizado em rodízio conforme a cota da Secullum.
-- =====================================================================

ALTER TABLE public.configuracoes
    ADD COLUMN modo_extracao text NOT NULL DEFAULT 'semanal',
    ADD CONSTRAINT configuracoes_modo_chk CHECK (modo_extracao IN ('semanal', 'tempo_real'));

CREATE TABLE public.registros_tempo_real (
    colaborador_id      integer     PRIMARY KEY REFERENCES public.colaboradores(id) ON DELETE CASCADE,
    empresa_id          integer     NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    unidade_id          integer     NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    periodo_inicio      date        NOT NULL,
    dados_ate           date        NOT NULL,
    extra_periodo       integer     NOT NULL DEFAULT 0,
    negativa_periodo    integer     NOT NULL DEFAULT 0,
    pagas_periodo       integer     NOT NULL DEFAULT 0,
    banco_periodo       integer     NOT NULL DEFAULT 0,
    saldo_banco_total   integer     NOT NULL DEFAULT 0,
    -- fotografia semanal usada como base (teto semanal / saldo)
    base_registro_id    bigint      REFERENCES public.registros_horas(id) ON DELETE SET NULL,
    dados_brutos        jsonb,
    -- rodízio: última tentativa (com ou sem sucesso)
    tentado_em          timestamptz NOT NULL DEFAULT now(),
    -- última extração com sucesso; NULL = ainda sem dado ao vivo (o painel usa a fotografia semanal)
    extraido_em         timestamptz,
    -- última falha ao atualizar este colaborador (o valor anterior continua valendo)
    ultimo_erro         text,
    ultimo_erro_em      timestamptz,
    CONSTRAINT tempo_real_periodo_chk CHECK (dados_ate >= periodo_inicio),
    CONSTRAINT tempo_real_valores_chk CHECK (extra_periodo >= 0 AND negativa_periodo >= 0
                                             AND pagas_periodo >= 0 AND banco_periodo >= 0)
);
CREATE INDEX tempo_real_unidade_idx ON public.registros_tempo_real (unidade_id);
CREATE INDEX tempo_real_rodizio_idx ON public.registros_tempo_real (empresa_id, tentado_em);

ALTER TABLE public.registros_tempo_real ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON public.registros_tempo_real FROM anon, authenticated';
    END IF;
END $$;
