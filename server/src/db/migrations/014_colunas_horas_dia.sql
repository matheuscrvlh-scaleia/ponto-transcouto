-- =====================================================================
-- 014 — Colunas da FriPonto em cada dia.
-- horas_dia guardava só a soma das extras e negativas do dia. Passa a
-- guardar também o valor de cada coluna de horas (Ex50%, ExNot, Faltas...),
-- como veio da FriPonto, para a tela mostrar de que colunas sai a soma e
-- para o recálculo refazer as extras e negativas dos dias quando o
-- mapeamento de colunas muda (com dados congelados, a coleta não volta
-- nesses dias).
-- Os dias já gravados ficam sem colunas ('{}'): as linhas por dia não são
-- guardadas em dados_brutos. Elas entram quando a coleta puxar o dia de
-- novo (ou quando o período for refeito pela Integração).
-- =====================================================================

ALTER TABLE public.horas_dia
    ADD COLUMN colunas jsonb NOT NULL DEFAULT '{}';   -- {"Ex50%": "01:45", "ExNot": "01:45"}; vazias ficam de fora
