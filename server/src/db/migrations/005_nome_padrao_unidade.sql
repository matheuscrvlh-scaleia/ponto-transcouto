-- =====================================================================
-- 005 — Unidade sem nome de exibição usa a razão social como nome.
-- O nome continua editável (Configuração → Unidades); apagar o nome volta
-- para a razão social. Para tirar uma unidade do painel, desative-a.
-- Como o nome é único por empresa, razões sociais repetidas ganham o
-- final do CNPJ: "TC GDR TRANSPORTE LTDA (0186)".
-- =====================================================================

CREATE FUNCTION public.preencher_nomes_unidades(p_empresa_id integer)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_unidade record;
    v_nome    text;
    v_total   integer := 0;
BEGIN
    -- uma unidade por vez: cada UPDATE já enxerga os nomes dados às anteriores
    FOR v_unidade IN
        SELECT id, empresa_id, documento, razao_social
          FROM unidades
         WHERE nome_exibicao IS NULL
           AND (p_empresa_id IS NULL OR empresa_id = p_empresa_id)
         ORDER BY empresa_id, id
    LOOP
        v_nome := coalesce(nullif(btrim(v_unidade.razao_social), ''), v_unidade.documento);
        IF EXISTS (SELECT 1 FROM unidades
                    WHERE empresa_id = v_unidade.empresa_id AND lower(nome_exibicao) = lower(v_nome)) THEN
            v_nome := v_nome || ' (' || right(v_unidade.documento, 4) || ')';
        END IF;
        IF EXISTS (SELECT 1 FROM unidades
                    WHERE empresa_id = v_unidade.empresa_id AND lower(nome_exibicao) = lower(v_nome)) THEN
            v_nome := v_nome || ' #' || v_unidade.id;
        END IF;

        UPDATE unidades SET nome_exibicao = v_nome WHERE id = v_unidade.id;
        v_total := v_total + 1;
    END LOOP;
    RETURN v_total;
END $$;

REVOKE EXECUTE ON FUNCTION public.preencher_nomes_unidades(integer) FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.preencher_nomes_unidades(integer) FROM anon, authenticated';
    END IF;
END $$;

SELECT public.preencher_nomes_unidades(NULL);
