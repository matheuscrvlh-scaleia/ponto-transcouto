-- =====================================================================
-- 010 — Demitido que a FriPonto não encontra vira aviso, não erro.
-- A FriPonto não calcula totais de colaborador desligado (responde
-- "Funcionário não encontrado"). Essas respostas passam a ser gravadas
-- com etapa 'demitido' e a data de demissão, e saem da lista de erros.
-- As respostas já gravadas como 'calcular' são convertidas.
-- =====================================================================

ALTER TABLE public.execucao_erros DROP CONSTRAINT execucao_erros_etapa_chk;
ALTER TABLE public.execucao_erros ADD CONSTRAINT execucao_erros_etapa_chk
    CHECK (etapa IN ('autenticacao', 'sincronizacao', 'calcular', 'mapeamento', 'gravacao', 'demitido'));

UPDATE public.execucao_erros e
   SET etapa = 'demitido',
       mensagem = 'Demitido em ' || to_char(col.data_demissao, 'DD/MM/YYYY')
                  || '. A FriPonto não calcula colaborador desligado, então ele fica fora deste fechamento.'
  FROM public.colaboradores col
 WHERE col.id = e.colaborador_id
   AND NOT col.ativo AND col.data_demissao IS NOT NULL
   AND e.etapa = 'calcular' AND e.http_status = 400 AND e.mensagem ILIKE '%não encontrado%';
