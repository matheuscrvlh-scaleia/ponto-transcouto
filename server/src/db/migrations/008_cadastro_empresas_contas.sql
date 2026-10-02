-- =====================================================================
-- 008 — Cadastro mais completo de empresas e contas.
--   empresas: razão social, CNPJ, logo, contato, cidade/UF e observações
--   usuarios (equipe) e clientes (RH/gestor): cargo e telefone
-- Tudo opcional: empresas e contas já cadastradas continuam válidas.
-- =====================================================================

ALTER TABLE public.empresas
    ADD COLUMN razao_social   text,
    ADD COLUMN cnpj           text,       -- só dígitos
    -- imagem pequena (o front reduz para no máx. 256px) como data URL
    ADD COLUMN logo           text,
    ADD COLUMN responsavel    text,       -- contato principal na empresa
    ADD COLUMN email_contato  text,
    ADD COLUMN telefone       text,       -- só dígitos, com DDD
    ADD COLUMN cidade         text,
    ADD COLUMN uf             text,
    ADD COLUMN observacoes    text,
    ADD CONSTRAINT empresas_cnpj_chk     CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$'),
    ADD CONSTRAINT empresas_telefone_chk CHECK (telefone IS NULL OR telefone ~ '^[0-9]{10,11}$'),
    ADD CONSTRAINT empresas_uf_chk       CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
    ADD CONSTRAINT empresas_logo_chk     CHECK (
        logo IS NULL OR (logo ~ '^data:image/(png|jpeg|webp);base64,' AND length(logo) <= 400000)
    );

CREATE UNIQUE INDEX empresas_cnpj_uk ON public.empresas (cnpj) WHERE cnpj IS NOT NULL;

ALTER TABLE public.usuarios
    ADD COLUMN cargo    text,
    ADD COLUMN telefone text,
    ADD CONSTRAINT usuarios_telefone_chk CHECK (telefone IS NULL OR telefone ~ '^[0-9]{10,11}$');

ALTER TABLE public.clientes
    ADD COLUMN cargo    text,
    ADD COLUMN telefone text,
    ADD CONSTRAINT clientes_telefone_chk CHECK (telefone IS NULL OR telefone ~ '^[0-9]{10,11}$');
