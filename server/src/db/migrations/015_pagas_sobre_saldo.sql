-- =====================================================================
-- 015 — Horas pagas sobre o saldo do período.
-- O teto de horas pagas passa a valer sobre o saldo (extras − negativas),
-- não sobre as extras brutas: saldo até o teto é todo pago e o banco do
-- período fica zerado; acima do teto, o excedente vai para o banco; saldo
-- negativo não paga nada e o negativo fica no banco.
-- banco_periodo passa a ser o saldo que não foi pago (já sem as
-- negativas) e pode ficar negativo; o saldo acumulado é a soma dele.
-- Os valores gravados passam para o formato novo (banco − negativas, o
-- saldo acumulado não muda), para que um registro que o recálculo não
-- consiga refazer continue servindo de base. Depois todas as empresas são
-- marcadas para recálculo: o worker refaz o histórico com a regra nova a
-- partir dos totais da FriPonto já gravados.
-- =====================================================================

ALTER TABLE public.registros_horas
    DROP CONSTRAINT registros_horas_periodo_chk,
    ADD CONSTRAINT registros_horas_periodo_chk CHECK (extra_periodo >= 0 AND negativa_periodo >= 0 AND pagas_periodo >= 0);

ALTER TABLE public.registros_tempo_real
    DROP CONSTRAINT tempo_real_valores_chk,
    ADD CONSTRAINT tempo_real_valores_chk CHECK (extra_periodo >= 0 AND negativa_periodo >= 0 AND pagas_periodo >= 0);

-- fechamento publicado é congelado; a mesma liberação do recálculo (só nesta transação)
SELECT set_config('copiloto.recalculo_saldos', 'on', true);
UPDATE public.registros_horas
   SET banco_periodo = banco_periodo - negativa_periodo, banco_semana = banco_semana - negativa_semana;
SELECT set_config('copiloto.recalculo_saldos', 'off', true);

UPDATE public.registros_tempo_real SET banco_periodo = banco_periodo - negativa_periodo;
UPDATE public.historico_diario SET banco_periodo = banco_periodo - negativa_periodo;

INSERT INTO public.recalculos_saldo (empresa_id)
SELECT empresa_id FROM public.configuracoes
ON CONFLICT (empresa_id) DO UPDATE SET solicitado_em = now();
