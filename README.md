# CRM Jurídico — Dr. Alef Vinicius Silva dos Santos
## OAB/PA 35.567 · Parauapebas/PA

---

## PASSO 1 — Criar tabelas no Supabase

1. Acesse https://supabase.com → seu projeto
2. Clique em **SQL Editor** no menu lateral
3. Cole o conteúdo do arquivo `supabase_setup.sql`
4. Clique em **Run**

---

## PASSO 2 — Subir o código no GitHub

1. Acesse https://github.com e crie um repositório novo (ex: `crm-alef`)
2. No terminal do seu Mac:

```bash
cd /caminho/para/esta/pasta
git init
git add .
git commit -m "CRM inicial"
git remote add origin https://github.com/SEU_USUARIO/crm-alef.git
git push -u origin main
```

---

## PASSO 3 — Deploy no Vercel

1. Acesse https://vercel.com → **Add New Project**
2. Conecte ao repositório GitHub que você acabou de criar
3. Na etapa **Environment Variables**, adicione:

```
NEXT_PUBLIC_SUPABASE_URL = https://nmfudzdumarqwzffcokd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = [sua chave do Supabase]
```

4. Clique em **Deploy**

Pronto — o Vercel fornece uma URL pública como `crm-alef.vercel.app`.

---

## PASSO 4 — Domínio personalizado (opcional)

No Vercel, vá em **Settings → Domains** e adicione `crm.alefvinicius.adv.br` ou similar.

---

## Segurança

- A chave `NEXT_PUBLIC_SUPABASE_ANON_KEY` é pública por design (acesso apenas às tabelas configuradas)
- As políticas RLS no SQL garantem que só os dados das tabelas `leads` e `historico` são acessíveis
- Para proteger o app com senha/login, avise que adiciono autenticação via Supabase Auth

---

## Desenvolvimento local

```bash
npm install
npm run dev
# Acesse http://localhost:3000
```
