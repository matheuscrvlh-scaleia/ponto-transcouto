-- =====================================================================
-- 012 — Regra de horas pagas e mapeamento valem também para o histórico.
-- O saldo do banco é acumulado (cada período herda o anterior), então
-- mudar o teto de horas pagas ou o mapeamento de colunas só para os dados
-- novos deixa o saldo com pedaços calculados por regras diferentes.
-- Ao salvar uma dessas regras, a empresa é marcada para recálculo e o
-- worker refaz os valores de todos os registros a partir dos totais da
-- FriPonto já gravados (dados_brutos), sem chamar a FriPonto de novo.
-- =====================================================================

-- Pedido pendente por empresa (um só: pedidos novos só atualizam a hora)
CREATE TABLE public.recalculos_saldo (
    empresa_id     integer     PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
    solicitado_em  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recalculos_saldo ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON public.recalculos_saldo FROM anon, authenticated';
    END IF;
END $$;

-- Fechamento publicado continua congelado; a única exceção é o recálculo,
-- que liga copiloto.recalculo_saldos só na transação dele e não pode mexer
-- nos números que vieram da FriPonto nem trocar o registro de dono.
CREATE OR REPLACE FUNCTION public.impedir_alteracao_publicado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND current_setting('copiloto.recalculo_saldos', true) = 'on'
       AND NEW.fechamento_id = OLD.fechamento_id
       AND NEW.colaborador_id = OLD.colaborador_id
       AND NEW.dados_brutos = OLD.dados_brutos THEN
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM public.fechamentos f
                WHERE f.id = OLD.fechamento_id AND f.status = 'sucesso') THEN
        RAISE EXCEPTION 'registros_horas: fechamento % já publicado (congelado)', OLD.fechamento_id;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;
