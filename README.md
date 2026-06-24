# UserPulse

## Setup local

O UserPulse pode rodar localmente com PostgreSQL via Docker ou com PostgreSQL instalado diretamente no Windows.

### Opcao A: Docker + WSL

Requisitos:

- Docker Desktop instalado.
- WSL habilitado no Windows.

Se o WSL ainda nao estiver instalado:

```bash
wsl --install
```

Reinicie o Windows, abra o Docker Desktop e suba o banco:

```bash
docker compose up -d
```

Use no `server/.env`:

```env
DATABASE_URL="postgresql://userpulse:userpulse@localhost:5432/userpulse?schema=public"
PORT=3333
```

### Opcao B: PostgreSQL instalado no Windows

Crie um banco e usuario local:

```sql
CREATE USER userpulse WITH PASSWORD 'userpulse';
CREATE DATABASE userpulse OWNER userpulse;
```

Use no `server/.env`:

```env
DATABASE_URL="postgresql://userpulse:userpulse@localhost:5432/userpulse?schema=public"
PORT=3333
```

## Migrations e Prisma

Depois que o banco local estiver rodando:

```bash
cd server
npm run db:migrate
npm run db:generate
```

## Seed de teste

Para criar ou atualizar uma campanha ativa de teste para o embed:

```bash
cd server
npm run db:seed
```

A campanha criada usa:

```text
sistema: QuarkClinic
tela: agenda
titulo: Melhorias de Marco
descricao: melhorias de marco
modo_exibicao: modal
gatilho: abertura_tela
atraso_ms: 800
feedback_habilitado: true
```

## Desenvolvimento

Em um terminal:

```bash
cd server
npm run dev
```

Em outro terminal:

```bash
cd web
npm run dev
```

Ou, na raiz:

```bash
npm run dev
```

## Testar o embed

1. Suba o banco local.
2. Rode migrations e generate.
3. Rode o seed.
4. Suba server e web.
5. Abra `test-embed.html` no navegador.

O arquivo usa:

```html
<script src="http://localhost:5173/widget.js"></script>
<script>
window.UserPulse.init({
  sistema: "QuarkClinic",
  tela: "agenda",
  usuario_id: "123",
  usuario_nome: "Maria Silva",
  usuario_email: "maria@quarkclinic.com"
});
</script>
```

## Neon em producao

O suporte ao Neon continua disponivel. Em producao, use a URL pooler em `DATABASE_URL`.
Se for necessario rodar migrations contra Neon, configure tambem `DIRECT_URL` com o host direto, sem `-pooler`.
