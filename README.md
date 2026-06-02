# Conta Azul Hub - Teste Técnico

Projeto de teste técnico para integração com a API do Conta Azul (OAuth 2.0 multi-tenant) para sincronizar e salvar contas a pagar de múltiplos clientes.

## 📋 Stack Tecnológico

### Backend
- **Runtime:** Node.js
- **Linguagem:** TypeScript
- **Framework:** Express.js
- **Banco de Dados:** PostgreSQL
- **ORM:** Prisma

### Frontend
- **Framework:** React 18
- **Build Tool:** Vite
- **Linguagem:** TypeScript
- **Estilização:** Tailwind CSS

## 🏗️ Estrutura do Projeto

```
conta-azul-hub/
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   │   ├── auth.controller.ts      # Endpoints de autenticação OAuth
│   │   │   │   └── payable.controller.ts   # Endpoints de contas a pagar
│   │   │   ├── services/
│   │   │   │   └── contaAzul.service.ts    # Integração com API Conta Azul
│   │   │   └── index.ts                     # Aplicação Express principal
│   │   ├── prisma/
│   │   │   └── schema.prisma               # Schema do banco de dados
│   │   ├── docker-compose.yml              # Configuração PostgreSQL
│   │   ├── .env.example                    # Exemplo de variáveis de ambiente
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── frontend/
│       ├── src/
│       │   ├── pages/
│       │   │   ├── DashboardPage.tsx       # Tela com tabela de contas
│       │   │   └── SettingsPage.tsx        # Tela de integração
│       │   ├── services/
│       │   │   └── api.ts                  # Cliente HTTP para API
│       │   ├── App.tsx                     # Componente principal
│       │   ├── main.tsx                    # Entry point
│       │   └── index.css                   # Estilos globais
│       ├── index.html
│       ├── vite.config.ts
│       ├── tailwind.config.js
│       ├── postcss.config.js
│       ├── package.json
│       └── tsconfig.json
│
├── package.json                            # Root package.json (monorepo)
└── README.md
```

## 🗄️ Modelagem de Banco de Dados

### Tabelas

#### `Company`
- `id` (String, PK) - UUID
- `name` (String) - Nome da empresa
- `createdAt` (DateTime) - Data de criação

#### `ContaAzulAuth`
- `id` (String, PK) - UUID
- `companyId` (String, FK, Unique) - Referência para Company
- `accessToken` (String) - Token de acesso OAuth
- `refreshToken` (String) - Token de refresh (idealmente criptografado em produção)
- `expiresAt` (DateTime) - Data de expiração do token
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

#### `Payable`
- `id` (String, PK) - UUID
- `companyId` (String, FK) - Referência para Company
- `contaAzulId` (String, Unique) - ID externo da API Conta Azul
- `description` (String) - Descrição da conta
- `value` (Decimal) - Valor da conta
- `dueDate` (DateTime) - Data de vencimento
- `status` (String) - Status (pending, paid, overdue, etc.)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

## 🚀 Como Rodar o Projeto Localmente

### Pré-requisitos

- Node.js 18+
- Docker e Docker Compose
- npm ou yarn

### 1. Clone o Repositório

```bash
cd c:\projetos\ContaAzulHub
```

### 2. Instale as Dependências

```bash
# Instalar dependências de ambos os pacotes
npm install

# Ou com yarn
yarn install
```

### 3. Configure as Variáveis de Ambiente

**Backend:**

```bash
# Navegue até packages/backend
cd packages/backend

# Copie o arquivo de exemplo
cp .env.example .env

# Edite o .env com suas credenciais Conta Azul
# DATABASE_URL=postgresql://conta_azul_user:conta_azul_password@localhost:5432/conta_azul_hub?schema=public
# CONTA_AZUL_CLIENT_ID=sua_client_id_aqui
# CONTA_AZUL_CLIENT_SECRET=sua_client_secret_aqui
```

**Frontend:**

O frontend usa o proxy configurado no `vite.config.ts` para acessar a API em `http://localhost:3001`.

### 4. Inicie o Banco de Dados

```bash
# Na pasta packages/backend
cd packages/backend

# Inicie o PostgreSQL com Docker Compose
docker-compose up -d

# Verifique se o container está rodando
docker ps
```

### 5. Configure o Prisma

```bash
# Na pasta packages/backend
cd packages/backend

# Gere o cliente Prisma
npm run prisma:generate

# Execute as migrations (cria as tabelas)
npm run prisma:migrate
```

Se você quiser explorar o banco de dados:

```bash
npm run prisma:studio
```

### 6. Inicie o Backend

```bash
# Na pasta packages/backend
npm run dev
```

Você verá:
```
🚀 Server is running on port 3001
Environment: development
📚 API Health: http://localhost:3001/health
```

### 7. Em outro terminal, Inicie o Frontend

```bash
# Na pasta packages/frontend
npm run dev
```

Acesse http://localhost:3000 em seu navegador.

## 🔐 Fluxo OAuth 2.0 - Authorization Code Grant

### Sequência de Operações

1. **Clique em "Conectar Conta Azul"** na página de Configurações
2. **Redirecionamento** para o servidor de autenticação do Conta Azul
3. **Usuário autoriza** a aplicação para acessar seus dados
4. **Callback** retorna um `code` para `http://localhost:3001/api/auth/callback`
5. **Backend troca o code** por `accessToken` e `refreshToken`
6. **Tokens são salvos** no banco de dados com `expiresAt`

### Gerenciamento de Token Expirado

O `contaAzul.service.ts` implementa validação automática de expiração:

```typescript
// Antes de qualquer requisição, verifica se o token expirou
const isTokenExpired = (expiresAt: Date): boolean => {
  const now = new Date();
  const bufferTime = 5 * 60 * 1000; // 5 minutos de margem
  return now.getTime() >= expiresAt.getTime() - bufferTime;
};

// Se expirou, usa o refreshToken para obter novo accessToken
if (this.isTokenExpired(auth.expiresAt)) {
  await this.refreshAccessToken(companyId);
}
```

## 📡 API Endpoints

### Autenticação

- `GET /api/auth/authorize` - Obter URL de autorização
- `GET /api/auth/callback` - Callback da autorização OAuth
- `POST /api/auth/authorize/:companyId` - Autorizar empresa com code
- `GET /api/auth/status/:companyId` - Verificar status de autenticação

### Contas a Pagar

- `GET /api/payables/:companyId` - Listar contas a pagar (com paginação)
- `GET /api/payables/:companyId/:payableId` - Obter detalhes de uma conta
- `POST /api/payables/:companyId/sync` - Sincronizar contas da API Conta Azul
- `GET /api/payables/:companyId/sync/status` - Obter status da última sincronização
- `DELETE /api/payables/:companyId` - Deletar todas as contas (apenas teste)

### Health Check

- `GET /health` - Verificar status do servidor

## 🔑 Recursos Principais

### Backend (`contaAzul.service.ts`)

1. **`exchangeCodeForToken(code)`**
   - Troca o authorization code pelos tokens
   - Armazena tokens com data de expiração

2. **`getValidAccessToken(companyId)`**
   - Valida se o token ainda é válido
   - Se expirou, usa refreshToken para atualizar
   - Retorna accessToken válido

3. **`refreshAccessToken(companyId)`**
   - Usa refreshToken para obter novo accessToken
   - Atualiza tokens no banco de dados
   - Útil quando token expirou

4. **`fetchPayablesFromAPI(companyId, page, pageSize)`**
   - Busca contas a pagar da API Conta Azul
   - Implementa paginação básica
   - Garante token válido antes da requisição

5. **`syncPayables(companyId)`**
   - Sincroniza todas as contas de múltiplas páginas
   - Cria ou atualiza contas no banco local
   - Retorna quantidade de contas sincronizadas

### Frontend

**Settings Page:**
- Exibe status de autenticação
- Botão para conectar ao Conta Azul
- Mostra Company ID

**Dashboard:**
- Tabela com contas a pagar
- Colunas: Descrição, Valor, Data de Vencimento, Status
- Estatísticas: Total de contas, Valor total, Última sincronização
- Botão para sincronizar manualmente

## 🧪 Testando a Aplicação

### 1. Verificar Saúde da API

```bash
curl http://localhost:3001/health
```

### 2. Acessar o Frontend

```
http://localhost:3000
```

### 3. Testar Fluxo OAuth

- Clique em "Configurações"
- Clique em "Conectar Conta Azul"
- (Será redirecionado para a URL fictícia do Conta Azul)

### 4. Listar Contas via API

```bash
# Substitua {companyId} pelo ID da empresa
curl http://localhost:3001/api/payables/{companyId}
```

### 5. Sincronizar Manualmente

```bash
curl -X POST http://localhost:3001/api/payables/{companyId}/sync
```

## 📝 Variáveis de Ambiente

### Backend `.env`

```env
# Database
DATABASE_URL="postgresql://conta_azul_user:conta_azul_password@localhost:5432/conta_azul_hub?schema=public"

# Conta Azul OAuth (Production)
CONTA_AZUL_CLIENT_ID="seu_client_id"
CONTA_AZUL_CLIENT_SECRET="seu_client_secret"

# Application
PORT=3001
NODE_ENV="development"
```

## 🐛 Troubleshooting

### Erro de Conexão ao Banco

```bash
# Verifique se o PostgreSQL está rodando
docker ps

# Se não estiver, inicie novamente
cd packages/backend
docker-compose up -d
```

### Erro ao executar migration

```bash
# Reset do banco (cuidado - deleta todos os dados)
npm run prisma:reset
```

### Módulos não encontrados

```bash
# Reinstale as dependências
rm -rf node_modules package-lock.json
npm install
```

### Porta 3001 ou 3000 já em uso

Altere as portas em:
- Backend: `packages/backend/src/index.ts` (variável `PORT`)
- Frontend: `packages/frontend/vite.config.ts` (server.port)

## 📚 Documentação Adicional

- [Prisma ORM](https://www.prisma.io/docs/)
- [Express.js](https://expressjs.com/)
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)

## 📄 Licença

ISC

## ✍️ Notas de Implementação

### Segurança

⚠️ **Em produção, você deve:**
- Criptografar o `refreshToken` antes de armazenar no banco
- Usar HTTPS para todas as requisições OAuth
- Implementar CSRF protection
- Validar e sanitizar todos os inputs
- Usar variáveis de ambiente seguras

### Paginação

A API do Conta Azul retorna contas em páginas. O serviço implementa:
- Busca automática de múltiplas páginas
- Armazenamento local em banco de dados
- Paginação configurable no endpoint `/api/payables/:companyId`

### Token Expiration Buffer

Um buffer de 5 minutos é adicionado antes da data de expiração para evitar requisições com tokens prestes a expirar.

---

**Desenvolvido como teste técnico para vaga de Desenvolvedor**
