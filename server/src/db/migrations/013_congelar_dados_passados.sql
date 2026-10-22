-- =====================================================================
-- 013 — Congelar dados passados (por empresa).
-- Sem a flag, cada coleta puxa o período inteiro (do início do período até
-- a referência), então uma correção na FriPonto em dia já coletado entra na
-- coleta seguinte. Com a flag, cada coleta puxa só os dias depois da última
-- fotografia publicada do colaborador e soma ao que já estava gravado: os
-- dias de fotografias anteriores ficam como estavam, mesmo se a FriPonto
-- mudar. Refazer um período pela Integração continua puxando de novo.
-- =====================================================================

ALTER TABLE public.configuracoes
    ADD COLUMN congelar_dados_passados boolean NOT NULL DEFAULT false;

-- Primeiro dia que a coleta puxou. NULL ou igual ao início do período = os
-- totais são do período inteiro; depois do início = só os dias novos, que
-- somam com o registro anterior (dados_brutos guarda só esses dias).
ALTER TABLE public.registros_horas
    ADD COLUMN dados_desde date;

ALTER TABLE public.registros_tempo_real
    ADD COLUMN dados_desde date;
