# ContaAzulHub

Hub de integração com a API da Conta Azul para gerenciamento de contas a pagar e a receber.

## 🚀 Tecnologias

### Front-end
- **React 18** com **Vite** e **TypeScript**.
- **Tailwind CSS** para estilização.
- **Lucide React** para ícones.
- **Axios** para consumo da API.

### Back-end
- **Node.js** com **Express** e **TypeScript**.
- **Prisma ORM** para modelagem e persistência de dados.
- **Axios** para integração com a API da Conta Azul.
- **OAuth2** para autenticação segura.

### Infraestrutura
- **Docker & Docker Compose**: Gerenciamento do container **PostgreSQL 16**.
- **PostgreSQL**: Banco de dados relacional.
- **ngrok**: Utilizado para expor o servidor local via HTTPS, permitindo o recebimento de callbacks de redirecionamento do OAuth da Conta Azul.

---

## 🛠️ Configuração e Execução

### 1. Banco de Dados (Docker)
Inicie o container do banco de dados:
```bash
docker-compose up -d
```

### 2. Back-end
Configure o `.env` em `packages/backend` com as credenciais da Conta Azul e a `DATABASE_URL`.
```bash
cd packages/backend
npm install
npx prisma migrate dev
npm run dev
```

### 3. Front-end
```bash
cd packages/frontend
npm install
npm run dev
```

### 4. HTTPS com ngrok
Como a Conta Azul exige HTTPS para o Redirect URI:
```bash
ngrok http 3001
```
Configure o callback no portal do desenvolvedor da Conta Azul apontando para a URL do ngrok.

---

## 📑 Endpoints da API

### Autenticação (OAuth)
- `GET /api/auth/authorize`: Inicia o fluxo OAuth.
- `GET /api/auth/callback/`: Handler para o callback da Conta Azul.
- `GET /api/auth/status/:companyId`: Verifica se a empresa está autenticada.
- `DELETE /api/auth/disconnect/:companyId`: Remove a autenticação.

### Contas a Pagar (Payables)
- `GET /api/payables/:companyId`: Lista os títulos a pagar salvos.
- `POST /api/payables/:companyId/sync`: Sincroniza títulos da Conta Azul para o banco local.
- `GET /api/payables/:companyId/sync/status`: Status da última sincronização.

### Contas a Receber (Receivables)
- `GET /api/receivables/:companyId`: Lista os títulos a receber salvos.
- `POST /api/receivables/:companyId/sync`: Sincroniza títulos da Conta Azul para o banco local.

---

## 📂 Estrutura do Projeto
- `packages/backend`: API Node.js e configurações do Prisma.
- `packages/frontend`: Aplicação React/Vite.
- `prisma/`: Schema e migrações do banco de dados.
- `docker-compose.yml`: Configuração do ambiente PostgreSQL.
