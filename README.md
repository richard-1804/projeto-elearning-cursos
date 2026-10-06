# Plataforma E-learning & Cursos — Backend

API em Node.js (ES Modules) + Express + Prisma 7 (MySQL/MariaDB) com a **camada de serviços** isolada para ser testada com Jest.

> ⚠️ Este README ainda tem seções marcadas com `TODO` que o grupo precisa preencher (exigência da atividade).

---
## 1. A visão geral do sistema

> Somos uma plataforma de **cursos online E-learning**. Onde instrutores cadastram cursos e turmas,  e alunos se matriculam, realizam as disciplinas, recebem notas e emitem certificados. O backend é uma API em Node.js, Express e Prisma, e a **camada de serviços** concentra as regras de negócio e é o alvo dos testes unitários deste grupo.

### As regras testadas foram:

- **Pré Requisitos:** um curso pode exigir a conclusão de outros cursos antes da matrícula.
- **Vagas:** cada turma tem número limitado de vagas e só aceita matrículas enquanto estiver aberta e com disponibilidade.
- **Certificados:** o certificado só pode ser emitido pelo próprio aluno quando as condições de conclusão do curso são atendidas.
- **Trancamento:** o aluno pode trancar e reativar a própria matrícula, respeitando as regras de status.
- **Autenticação:** cadastro e login com token **(JWT)**, e controle de acesso por perfil (aluno e instrutor).

## 2. Conceitos dos testes aplicados

> Análise geral do projeto de como ele se adequa aos conceitos de aplicação de testes back-end

## Pirâmide de Testes
Divide os testes em camadas: **testes Unitários** na base, **testes de Integração** no meio e **testes ponta a ponta (E2E)** no topo. Quanto mais alto, mais lento, caro e frágil é o teste, por isso deve haver muitos testes na base e poucos no topo. Neste projeto o foco é a **base da pirâmide** adequando-se aos testes unitários dos services, que são rápidos, baratos de executar e não dependem de banco de dados. Todos eles seguem o padrão **AAA (Arrange, Act, Assert)**: preparar o cenário, executar a ação e verificar o resultado.

### Mocks vs. Stubs
**Stubs** são respostas prontas que fornecem dados fixos para o teste rodar, como um model que sempre devolve o mesmo curso. **Mocks** são objetos mais avançados, como o jest.fn(), que além de devolver valores também **verificam o comportamento**: se uma função específica foi chamada, com quais parâmetros e quantas vezes. Neste projeto, as dependências externas (banco de dados e e-mail) são isoladas com jest.fn(), de modo que cada teste exercita apenas a regra de negócio do service.

### Padrão Factory
O Factory é um padrão de projeto que **centraliza a criação de objetos fictícios** (fakes) usados nos testes, como alunos, cursos, turmas e matrículas. Com ele evitamos duplicar código ao preparar os cenários (fase *Arrange*) e, se o formato de um objeto mudar, a correção é feita em um só lugar. Neste projeto, as factories ficam em tests/factories/ e permitem sobrescrever apenas os campos relevantes de cada cenário.
## 3. Como Executar

### Pré-requisitos
- Node.js (LTS) e Git
- MySQL ou MariaDB rodando localmente

### Instalação
```bash
npm install
npx prisma generate
npx prisma migrate dev --name criacao_das_tabelas   # ou: npx prisma db push
npm run dev
```

> ⚠️ No `.env` use `CHAVE=valor` (com `=`). Com `:` o dotenv não lê a variável.

### Rodando os testes
```bash
npm test                 # roda a suíte
npm run test:coverage    # roda a suíte com cobertura (mínimo exigido: 80%)
```

## Arquitetura

```
server.js                     -> sobe o Express e registra as rotas
db.js                         -> conexão Prisma + MariaDB (não alterar)
src/
  routes/        -> define endpoints e middlewares (auth, role, validação)
  controllers/   -> recebe req/res e chama o service (sem regra de negócio)
  services/      -> REGRAS DE NEGÓCIO (classes com dependências injetadas)  <- alvo dos testes
  models/        -> consultas ao banco com Prisma (dependência a ser mockada)
  gateways/      -> serviços externos (e-mail simulado)
  schemas/       -> validação de entrada com Zod
  middleware/    -> authMiddleware (JWT), roleMiddleware, validateMiddleware
  constants/     -> status e regras de negócio configuráveis
  errors/        -> AppError, NotFoundError, ConflictError, BusinessRuleError, ...
  utils/         -> handleError (converte erros de domínio em status HTTP)
  container.js   -> monta os services com os models reais
tests/
  services/      -> testes unitários (a escrever)
  factories/     -> factories de dados de teste (a escrever)
```

Fluxo: `rota → (auth/validação) → controller → service → model → banco`.



## Endpoints

| Método | Rota | Acesso |
|---|---|---|
| POST | `/auth/register` · `/auth/login` | Público |
| GET | `/courses` · `/courses/:id` · `/courses/:id/prerequisites` | Público |
| POST/PUT | `/courses` · `/courses/:id` | Instrutor |
| POST/DELETE | `/courses/:id/prerequisites` · `/courses/:id/prerequisites/:requiredId` | Instrutor |
| GET | `/classes` · `/classes/:id` · `/classes/:id/availability` | Público |
| POST | `/classes` | Instrutor |
| PATCH | `/classes/:id/close` | Instrutor |
| POST | `/enrollments` | Logado |
| GET | `/enrollments/me` | Logado |
| PATCH | `/enrollments/:id/lock` · `/enrollments/:id/reactivate` | Logado (dono) |
| POST | `/grades` | Instrutor |
| GET | `/grades/enrollment/:enrollmentId` | Dono ou instrutor |
| POST | `/certificates` | Logado (dono) |
| GET | `/certificates/me` | Logado |

Enviar o token no header: `Authorization: Bearer <TOKEN>`.
