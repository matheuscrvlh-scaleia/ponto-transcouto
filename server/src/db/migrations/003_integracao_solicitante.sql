-- =====================================================================
-- 003 — Integração FriPonto: registrar quem pediu cada extração.
-- Quem pede (equipe ou cliente) fica no fechamento enquanto ele espera o
-- worker; ao começar, o worker copia para a execução (disparo 'manual')
-- e limpa o pedido.
-- =====================================================================

ALTER TABLE public.fechamentos
    ADD COLUMN solicitado_por_usuario integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
    ADD COLUMN solicitado_por_cliente integer REFERENCES public.clientes(id) ON DELETE SET NULL,
    ADD CONSTRAINT fechamentos_solicitante_chk
        CHECK (solicitado_por_usuario IS NULL OR solicitado_por_cliente IS NULL);

ALTER TABLE public.execucoes_extracao
    ADD COLUMN disparado_por_cliente integer REFERENCES public.clientes(id) ON DELETE SET NULL;

ALTER TABLE public.execucoes_extracao DROP CONSTRAINT execucoes_autor_chk;
ALTER TABLE public.execucoes_extracao
    ADD CONSTRAINT execucoes_autor_chk
        CHECK (disparo = 'manual' OR (disparado_por IS NULL AND disparado_por_cliente IS NULL)),
    ADD CONSTRAINT execucoes_um_autor_chk
        CHECK (disparado_por IS NULL OR disparado_por_cliente IS NULL);

-- histórico de integração da tela (filtra por empresa e ação, mais recentes primeiro)
CREATE INDEX log_auditoria_empresa_acao_idx ON public.log_auditoria (empresa_id, acao, criado_em DESC);
