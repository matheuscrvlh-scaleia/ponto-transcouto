-- =====================================================================
-- 006 — Histórico diário do tempo real.
-- Empresas em tempo real não têm fotografia semanal (só o fechamento do
-- mês). O histórico do colaborador passa a ser por dia: a cada atualização
-- ao vivo, o valor do dia é gravado (a última atualização do dia vale).
-- =====================================================================

CREATE TABLE public.historico_diario (
    colaborador_id     integer     NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
    dia                date        NOT NULL,
    empresa_id         integer     NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    unidade_id         integer     NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    periodo_inicio     date        NOT NULL,
    extra_periodo      integer     NOT NULL,
    negativa_periodo   integer     NOT NULL,
    pagas_periodo      integer     NOT NULL,
    banco_periodo      integer     NOT NULL,
    saldo_banco_total  integer     NOT NULL,
    atualizado_em      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (colaborador_id, dia),
    CONSTRAINT historico_diario_periodo_chk CHECK (dia >= periodo_inicio)
);
CREATE INDEX historico_diario_unidade_idx ON public.historico_diario (unidade_id, dia);

ALTER TABLE public.historico_diario ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON public.historico_diario FROM anon, authenticated';
    END IF;
END $$;
