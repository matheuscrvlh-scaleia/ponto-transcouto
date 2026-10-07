-- =====================================================================
-- 011 — Horas por dia e alertas diários.
-- A coleta passa a usar a rota Calcular completa, que traz os totais do
-- período e uma linha por dia (mesma cota da SomenteTotais). Cada coleta
-- regrava os dias do período que puxou, então correções do RH em dias já
-- coletados entram na coleta seguinte.
-- Os limites diários (0 = sem alerta) marcam o dia em que o colaborador
-- passou de X horas extras ou de X horas negativas.
-- =====================================================================

CREATE TABLE public.horas_dia (
    colaborador_id  integer     NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
    dia             date        NOT NULL,
    empresa_id      integer     NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    unidade_id      integer     NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    extra_min       integer     NOT NULL DEFAULT 0,
    negativa_min    integer     NOT NULL DEFAULT 0,
    marcacoes       text[]      NOT NULL DEFAULT '{}',   -- entradas e saídas do dia, como vieram ("09:33")
    atualizado_em   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (colaborador_id, dia),
    CONSTRAINT horas_dia_valores_chk CHECK (extra_min >= 0 AND negativa_min >= 0)
);
CREATE INDEX horas_dia_unidade_idx ON public.horas_dia (unidade_id, dia);

ALTER TABLE public.horas_dia ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON public.horas_dia FROM anon, authenticated';
    END IF;
END $$;

ALTER TABLE public.configuracoes
    ADD COLUMN alerta_extra_dia_minutos    integer NOT NULL DEFAULT 0,
    ADD COLUMN alerta_negativa_dia_minutos integer NOT NULL DEFAULT 0,
    ADD CONSTRAINT configuracoes_alerta_dia_chk
        CHECK (alerta_extra_dia_minutos >= 0 AND alerta_negativa_dia_minutos >= 0);
