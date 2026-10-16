# API de Livros - Uso no Postman

## Configuração do Firebase

Crie um arquivo `.env` na raiz usando `.env.example` como referência e preencha `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` com os dados da conta de serviço do Firebase. Na chave privada, mantenha as quebras de linha como `\n`. Configure `PUBLIC_APP_URL` com a origem pública do frontend (sem `/api`); em produção, configure essa variável também nas variáveis de ambiente do projeto da Vercel.

Este repositório inclui `vercel.json` para publicar o servidor Express como função da Vercel. Para que a API hospedada gere QR Codes e consulte o histórico, o projeto da Vercel precisa estar conectado a este repositório (`AlexCMoreira10/backend_v6`) e usar um deploy que inclua o serviço de QR Code. Configure `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` e `PUBLIC_APP_URL` nas variáveis de ambiente da Vercel e faça um novo deploy. `PUBLIC_APP_URL` deve ser a URL HTTPS do frontend, não a URL da API.

## 1. Visão geral

- Base URL: `http://localhost:3000/api`
- Essa API é o backend do aplicativo de troca/venda/doação de livros.

### 🔐 Autenticação

- Todas as rotas exigem autenticação via Firebase, exceto o cadastro de usuário e a consulta pública do histórico pelo QR Code.
- Cabeçalho obrigatório em todas as requisições protegidas:
  - Authorization: Bearer {{token}}
- O `token` deve ser obtido após o login no Firebase. Após o cadastro por e-mail e senha, o front deve autenticar o usuário no Firebase e usar o ID token retornado nas rotas protegidas.

## 2. Configuração sugerida no Postman

1. Crie um novo environment chamado `Local`.
2. Adicione as variáveis:
   - `baseUrl = http://localhost:3000`
   - `token = COLE_SEU_TOKEN_AQUI`
3. Use `{{baseUrl}}` e `{{token}}` nas requisições.

---

## 3. Rotas da API

### Cadastro de usuário

- Método: `POST`
- Endpoint: `{{baseUrl}}/api/usuarios/cadastro`
- Autenticação: não exige token.
- Cabeçalho: `Content-Type: application/json`
- Descrição: cria a conta no Firebase Authentication usando e-mail e senha e salva o perfil em `users/{_id}` no Firestore. A senha é enviada somente ao Firebase Authentication e nunca é armazenada no perfil.

Campos enviados no body:

| Atributo | Descrição | Tipo de dado | Obrigatório | Exemplo de valor |
|---|---|---|---|---|
| `nome` | Nome completo | String | Sim | `"Fernando Alguns Silva"` |
| `email` | Endereço eletrônico para login | String | Sim | `"fernando@email.com"` |
| `senha` | Senha para login (mínimo de 8 caracteres) | String | Sim | `"senhaSegura123"` |
| `telefone` | Números para contato | Array de strings | Sim | `["(11)99999-9999", "(21)88888-8888"]` |
| `data_nascimento` | Data de nascimento em formato ISO 8601 | Data | Sim | `"2000-09-03T18:30:00.000Z"` |
| `endereco` | Endereço para entrega | Objeto | Não | Ver exemplo abaixo |
| `geocode` | Geolocalização aproximada em GeoJSON Point | Objeto | Não | Ver exemplo abaixo |

Exemplo de body:

```json
{
  "nome": "Fernando Alguns Silva",
  "email": "fernando@email.com",
  "senha": "senhaSegura123",
  "telefone": ["(11)99999-9999", "(21)88888-8888"],
  "data_nascimento": "2000-09-03T18:30:00.000Z",
  "endereco": {
    "rua": "Rua das Macumbas",
    "numero": 5,
    "complemento": "Apto 12",
    "bairro": "Vila das Flores",
    "cidade": "São Paulo",
    "estado": "SP",
    "cep": "05800-000"
  },
  "geocode": {
    "type": "Point",
    "coordinates": [-46.6333, -23.5505]
  }
}
```

- `geoJson` também pode ser enviado como nome alternativo para `geocode`; o perfil é salvo usando o campo `geocode`.
- As coordenadas seguem a ordem GeoJSON `[longitude, latitude]`, em graus decimais. No futuro, esse ponto poderá ser usado para buscar livros por raio e facilitar trocas e doações.
- `_id` é gerado pelo servidor a partir do UID do Firebase Authentication e não deve ser enviado pelo cliente.
- `transacoes` é inicializado pelo servidor com `total`, `compras`, `vendas`, `trocas`, `doacoes_enviadas` e `doacoes_recebidas` iguais a `0`.
- `limite_doacoes` é inicializado pelo servidor com `{ "recebidas": 1, "utilizadas": 0, "disponiveis": 1 }`.
- Exemplo de resposta:

```json
{
  "id": "uid-gerado-pelo-firebase",
  "_id": "uid-gerado-pelo-firebase",
  "uid": "uid-gerado-pelo-firebase",
  "nome": "Fernando Alguns Silva",
  "email": "fernando@email.com",
  "telefone": ["(11)99999-9999", "(21)88888-8888"],
  "data_nascimento": "2000-09-03T18:30:00.000Z",
  "foto": "",
  "transacoes": {
    "total": 0,
    "compras": 0,
    "vendas": 0,
    "trocas": 0,
    "doacoes_enviadas": 0,
    "doacoes_recebidas": 0
  },
  "limite_doacoes": {
    "recebidas": 1,
    "utilizadas": 0,
    "disponiveis": 1
  }
}
```

- Resposta:
  - `201 Created` se o usuário for cadastrado
  - `400 Bad Request` se algum campo obrigatório ou formato for inválido
  - `409 Conflict` se o e-mail já estiver cadastrado
  - `500 Internal Server Error` se ocorrer um erro ao criar a conta ou salvar o perfil

### 3.1 Listar livros (com paginação e filtros)

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros`

### 3.2 Listar todos os livros

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros`
- Resposta: `200 OK`
- Exemplo de uso:
  - Request: `GET http://localhost:3000/api/livros?page=1&limit=10&titulo=pequeno`

- Resposta: 200 OK

### 3.3 Criar um novo livro

- Método: `POST`
- Endpoint: `{{baseUrl}}/api/livros`
- Cabeçalho: `Content-Type: application/json`
- Body: raw JSON

Exemplo de body válido:

```json
{
  "titulo": "O Pequeno Príncipe",
  "autor": "Antoine de Saint-Exupéry",
  "descricao": "Livro em bom estado, capa dura.",
  "editora": "Agir",
  "anoPublicacao": 1943,
  "generos": ["Infantil", "Fantasia"],
  "idioma": "Português",
  "condicao": "bom",
  "tipo": "doacao",
  "trocas": {
    "interesses": ["Romance", "História"],
    "aceitaRetirada": true
  },
  
  "fotos": ["https://exemplo.com/foto1.jpg"],
  "localizacao": "São Paulo - SP"
}
```

- Regras de validação:`
  - `titulo` e `autor` obrigatórios
  - `condicao` deve ser um de: `novo`, `bom`, `regular`, `usado`
  - `tipo` deve ser um de: `doacao`, `troca`, `venda`
  - `preco` é obrigatório se `tipo` for `venda`
  - `preco` não é permitido se `tipo` for `doacao` ou `troca`
  - o proprietário é identificado pelo token; `usuarioId` não deve ser enviado
- O servidor cria o QR Code automaticamente. A resposta inclui `qrUrl` e `qrCode` (Data URI PNG). O QR abre `{PUBLIC_APP_URL}/html/rastreio.html?token={token}`, onde o usuário pode solicitar a negociação.

### 3.4 Buscar livro por ID

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros/:id`
- Exemplo: `GET http://localhost:3000/api/livros/abc123`
- Resposta:
  - `200 OK` com o livro
  - `404 Not Found` se não existir

### 3.5 Atualizar livro

- Método: `PUT`
- Endpoint: `{{baseUrl}}/api/livros/:id`
- Cabeçalho: `Content-Type: application/json`
- Body: raw JSON com pelo menos um campo a ser alterado

Exemplo de body de atualização:

```json
{
  "titulo": "O Pequeno Príncipe - Segunda Edição",
  "condicao": "novo",
  "status": "disponivel | reservado | trocado | vendido"
}
```

- Regras de validação:
  - deve enviar pelo menos um campo válido
  - `tipo`, `condicao` e `status` devem respeitar os valores permitidos
  - `preco` só pode ser enviado se `tipo` for `venda`

### 3.6 Deletar livro

- Método: `DELETE`
- Endpoint: `{{baseUrl}}/api/livros/:id`
- Exemplo: `DELETE http://localhost:3000/api/livros/abc123`
- Resposta:
  - `405 Method Not Allowed`: livros cadastrados não podem ser excluídos
  - `404 Not Found` se não existir

### 3.7 Rastreio, aquisição e estante

#### Consultar o histórico pelo QR Code

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros/rastreio/:token`
- Autenticação: não exige token.
- Retorna os dados públicos do livro, o histórico de posse, as negociações concluídas e as avaliações.

#### Solicitar aquisição após ler o QR Code

- Método: `POST`
- Endpoint: `{{baseUrl}}/api/livros/rastreio/:token/aquisicao`
- Autenticação: exige token.
- Body:

```json
{
  "tipoNegociacao": "doacao"
}
```

- `tipoNegociacao` aceita `doacao`, `troca` ou `venda`.
- O pedido fica pendente até o proprietário atual confirmar; nesse momento a posse é transferida e a data/tipo da negociação são registrados.
- `POST {{baseUrl}}/api/livros/:id/aquisicoes/confirmar` confirma como proprietário atual.
- `POST {{baseUrl}}/api/livros/:id/aquisicoes/recusar` recusa como proprietário atual.
- A resposta do rastreio inclui o `id` do livro, usado nas rotas de confirmação.

#### Avaliar um livro

- Método: `POST`
- Endpoint: `{{baseUrl}}/api/livros/:id/avaliacoes`
- Autenticação: exige token.
- Body: `{ "comentario": "..." }` (de 1 a 2000 caracteres).
- Somente usuários registrados no histórico de posse podem comentar; cada usuário pode avaliar uma vez por livro.

#### Consultar e atualizar a estante

- `GET {{baseUrl}}/api/me/estante` lista os livros atualmente pertencentes ao usuário autenticado. Aceita `page`, `limit`, `titulo` e `estadoAcervo`.
- `PUT {{baseUrl}}/api/me/estante/:id/estado` marca um livro próprio como roubado ou danificado. Body: `{ "estadoAcervo": "roubado" }` ou `{ "estadoAcervo": "danificado" }`.
- `GET {{baseUrl}}/api/livros/:id/qrcode` retorna o QR Code e sua URL ao proprietário atual.
- Livros marcados como roubados não podem ser adquiridos e não aparecem nos resultados de anúncios.

#### Guia de integração no frontend

O QR Code precisa abrir uma página do frontend, não diretamente a resposta JSON da API. Configure `PUBLIC_APP_URL` no backend com a origem pública do frontend, sem `/api`. Por exemplo:

```env
# Backend .env
PUBLIC_APP_URL=http://localhost:5173
```

Com essa configuração, o QR leva para `http://localhost:5173/html/rastreio.html?token={token}`. A tela apresenta o pedido de negociação e consulta a API em `GET http://localhost:3000/api/livros/rastreio/{token}`. Em produção, use o domínio HTTPS do frontend para `PUBLIC_APP_URL` e configure o frontend para consultar a URL da API publicada.

Quando a pessoa confirma o pedido, o backend registra uma notificação para o proprietário atual. Ela aparece no perfil do vendedor, que pode confirmar ou recusar a solicitação na área de anúncios. Depois da confirmação, o solicitante recebe outra notificação e o livro entra na estante. A transferência não ocorre ao apenas escanear ou confirmar o pedido.

Crie um helper para enviar o ID token do Firebase nas rotas protegidas:

```js
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

async function apiFetch(path, { firebaseUser, ...options } = {}) {
  const idToken = firebaseUser ? await firebaseUser.getIdToken() : null;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      ...options.headers
    }
  });

  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(body?.erro || `Erro HTTP ${response.status}`);
  }
  return body;
}
```

Ao cadastrar o livro, use `POST /livros` e mostre o QR retornado, por exemplo com `<img src={livro.qrCode} alt="QR Code para rastrear o livro" />`. `qrCode` é uma Data URI PNG e `qrUrl` contém o endereço que pode ser compartilhado. Para livros antigos, obtenha o código com `GET /livros/:id/qrcode`.

Implemente a tela/rota `/livros/rastreio/:token` nesta ordem:

1. Leia o token da query string e consulte `GET /livros/rastreio/:token` sem exigir login. Apresente o livro e, se desejado, o histórico público.
2. Ao carregar o QR, solicite confirmação da negociação. Se a pessoa ainda não estiver autenticada, peça login e retorne à tela do QR; envie `POST /livros/rastreio/:token/aquisicao` com `{ "tipoNegociacao": "doacao" }` (ou `troca`/`venda`) e o token Firebase no cabeçalho.
3. Informe que o pedido aguarda confirmação do proprietário. O backend cria uma notificação para o vendedor e mantém o pedido pendente; não mova o livro para a estante enquanto o vendedor não confirmar.

O dono pode consultar pedidos pendentes nos livros que possui (`GET /me/livros`; o campo `transferenciaPendente` vem no livro) e apresentar ações para:

```js
await apiFetch(`/livros/${livroId}/aquisicoes/confirmar`, {
  method: 'POST',
  firebaseUser
});
// Ou, para recusar:
await apiFetch(`/livros/${livroId}/aquisicoes/recusar`, {
  method: 'POST',
  firebaseUser
});
```

Após confirmar, atualize a tela e a estante. A estante é carregada com `GET /me/estante`; para marcar um livro como roubado ou danificado, envie `PUT /me/estante/:id/estado` com `{ "estadoAcervo": "roubado" }` ou `{ "estadoAcervo": "danificado" }`. O backend não permite excluir livros.

Na página do histórico, mostre o formulário de comentário apenas para pessoas autenticadas que tenham tido a posse do livro; o backend valida essa regra e aceita um comentário por usuário. Envie `POST /livros/:id/avaliacoes` com `{ "comentario": "..." }`. Se o servidor responder `401`, peça para entrar novamente; exiba as mensagens de `400`, `403` e `409` para orientar o usuário (por exemplo, pedido pendente, aquisição já feita ou tentativa de comentar sem ter possuído o livro).

Para leitura dentro do aplicativo, integre uma biblioteca de scanner compatível com a plataforma e navegue para o endereço encontrado no QR. A mesma rota `/livros/rastreio/:token` atende tanto quem abre o QR pela câmera do celular quanto quem usa o scanner do próprio aplicativo. Solicite permissão de câmera somente após ação explícita do usuário e mantenha também uma opção para abrir/digitar o link.

### 3.8 Buscar por título

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros/busca/titulo`
- Query string: `titulo`
- Exemplo:
  - `GET http://localhost:3000/api/livros/busca/titulo?titulo=pequeno`
- Observação:
  - agora a busca encontra o termo em qualquer posição do título
  - por exemplo, `pequeno` encontra `O Pequeno Príncipe`

### 3.9 Busca avançada combinando filtros

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros/busca/avancada`
- Query string: qualquer combinação de:
  - `titulo`
  - `genero`
  - `autor`
  - `editora`
  - `tipo`
  - `ehDoacao`

Exemplos:
  - `GET http://localhost:3000/api/livros/busca/avancada?titulo=pequeno&ehDoacao=true`
  - `GET http://localhost:3000/api/livros/busca/avancada?titulo=pequeno&genero=fantasia`
  - `GET http://localhost:3000/api/livros/busca/avancada?genero=infantil&tipo=doacao`

### 3.10 Buscar por gênero

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros/busca/genero`
- Query string: `genero`
- Exemplo:
  - `GET http://localhost:3000/api/livros/busca/genero?genero=fantasia`

### 3.11 Buscar por editora

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros/busca/editora`
- Query string: `editora`
- Exemplo:
  - `GET http://localhost:3000/api/livros/busca/editora?editora=agir`

### 3.12 Buscar por autor

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros/busca/autor`
- Query string: `autor`
- Exemplo:
  - `GET http://localhost:3000/api/livros/busca/autor?autor=antoine`

### 3.13 Filtrar por tipo de livro

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros/filtro/tipo`
- Query string: `ehDoacao`
- Exemplo:
  - `GET http://localhost:3000/api/livros/filtro/tipo?ehDoacao=true`

- Observação:
  - aceita `true` ou `false`
  - retorna livros de doação quando `true`
  - retorna livros de troca/venda quando `false`

### 3.14 Notificações

#### Listar notificações do usuário

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/notificacoes`
- Cabeçalho: `Authorization: Bearer {{token}}`
- Descrição: retorna as notificações do usuário autenticado.
- Exemplo:
  - `GET http://localhost:3000/api/notificacoes`
- Resposta:
  - `200 OK` com um array de notificações
  - `401 Unauthorized` se o token estiver ausente ou inválido

#### Marcar notificação como lida

- Método: `PUT`
- Endpoint: `{{baseUrl}}/api/notificacoes/:id/lida`
- Cabeçalho: `Authorization: Bearer {{token}}`
- Descrição: marca a notificação especificada como lida.
- Exemplo:
  - `PUT http://localhost:3000/api/notificacoes/abc123/lida`
- Resposta:
  - `200 OK` com `{ mensagem: 'Notificação marcada como lida' }`
  - `401 Unauthorized` se o token estiver ausente ou inválido

### 3.15 Mensagens

> **Status:** o envio, o histórico, a listagem de conversas e a marcação de leitura estão implementados.

#### Enviar mensagem para outro usuário

- Método: `POST`
- Endpoint: `{{baseUrl}}/api/mensagens`
- Cabeçalho:
  - `Content-Type: application/json`
  - `Authorization: Bearer {{token}}`
- Body:
  - `id_destinatario` (string)
  - `conteudo` (string)
- Observação: o remetente é obtido automaticamente a partir do token de autenticação.
- Exemplo de body:

```json
{
  "id_destinatario": "uid-do-destinatario",
  "conteudo": "Olá! Gostaria de conversar sobre o livro."
}
```
- Exemplo de uso:
  - `POST http://localhost:3000/api/mensagens`
- Resposta:
  - `201 Created` com o objeto da mensagem enviada
  - `400 Bad Request` se `id_destinatario` estiver ausente ou `conteudo` estiver vazio
  - `404 Not Found` se o remetente ou destinatário não existir
  - `401 Unauthorized` se o token estiver ausente ou inválido

#### Listar mensagens do usuário autenticado

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/mensagens`
- Cabeçalho: `Authorization: Bearer {{token}}`
- Descrição: retorna as mensagens em que o usuário autenticado é remetente ou destinatário. O usuário é identificado pelo token; não enviar nem aceitar `id_remetente` pela query string ou pelo body.
- Exemplo:
  - `GET http://localhost:3000/api/mensagens`
- Resposta:
  - `200 OK` com um array de mensagens
  - `401 Unauthorized` se o token estiver ausente ou inválido
- Cada mensagem deve conter, no mínimo:

```json
{
  "id": "id-da-mensagem",
  "id_remetente": "uid-do-remetente",
  "id_destinatario": "uid-do-destinatario",
  "conteudo": "Texto da mensagem",
  "data_envio": "2026-10-12T15:00:00.000Z"
}
```

#### Listar conversas do usuário autenticado

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/mensagens/conversas`
- Cabeçalho: `Authorization: Bearer {{token}}`
- Descrição: retorna uma conversa por usuário com quem o usuário autenticado trocou mensagens, incluindo o outro participante, a última mensagem e a quantidade de mensagens não lidas.
- A rota `/conversas` é registrada antes de `/:id_usuario` para que o caminho estático não seja interpretado como um ID de usuário.
- Exemplo:
  - `GET http://localhost:3000/api/mensagens/conversas`
- Resposta:
  - `200 OK` com um array de conversas
  - `401 Unauthorized` se o token estiver ausente ou inválido
- Formato de cada conversa:

```json
{
  "outro_participante": {
    "id": "uid-do-usuario",
    "nome": "Nome do usuário",
    "foto": "https://exemplo.com/foto.jpg"
  },
  "ultima_mensagem": {
    "id": "id-da-mensagem",
    "id_remetente": "uid-do-remetente",
    "id_destinatario": "uid-do-destinatario",
    "conteudo": "Texto da mensagem",
    "data_envio": "2026-10-12T15:00:00.000Z"
  },
  "mensagens_nao_lidas": 2
}
```

- Observação: `mensagens_nao_lidas` deve ser `0` quando não houver mensagens recebidas pendentes de leitura. Se o backend não fornecer `nome` e `foto`, o front deverá consultar outro endpoint de usuários.

#### Listar mensagens trocadas com um usuário

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/mensagens/:id_usuario`
- Cabeçalho: `Authorization: Bearer {{token}}`
- Query string:
  - `page` (opcional, padrão `1`)
  - `limit` (opcional, padrão `20`)
- Validação: `page` deve ser maior que `0`; `limit` deve estar entre `1` e `100`.
- Descrição: retorna as mensagens trocadas entre o usuário autenticado e o usuário informado, em ordem cronológica crescente (`data_envio`), com paginação. O usuário autenticado deve ser obtido pelo token.
- Exemplo:
  - `GET http://localhost:3000/api/mensagens/uid-do-usuario?page=1&limit=20`
- Resposta:
  - `200 OK` com as mensagens e os dados de paginação
  - `400 Bad Request` se `page` ou `limit` forem inválidos
  - `401 Unauthorized` se o token estiver ausente ou inválido
- Formato da resposta:

```json
{
  "mensagens": [
    {
      "id": "id-da-mensagem",
      "id_remetente": "uid-do-remetente",
      "id_destinatario": "uid-do-destinatario",
      "conteudo": "Texto da mensagem",
      "data_envio": "2026-10-12T15:00:00.000Z"
    }
  ],
  "paginacao": {
    "pagina": 1,
    "limite": 20,
    "total": 1,
    "total_paginas": 1
  }
}
```

#### Marcar mensagem como lida

- Método: `PUT`
- Endpoint: `{{baseUrl}}/api/mensagens/:id/lida`
- Cabeçalho: `Authorization: Bearer {{token}}`
- Descrição: marca como lida uma mensagem recebida. O backend deve confirmar que o usuário autenticado é o destinatário; mensagens de outros usuários ou enviadas pelo próprio usuário não podem ser marcadas por esta rota.
- Exemplo:
  - `PUT http://localhost:3000/api/mensagens/id-da-mensagem/lida`
- Resposta:
  - `200 OK` com `{ "mensagem": "Mensagem marcada como lida" }`
  - `401 Unauthorized` se o token estiver ausente ou inválido
  - `403 Forbidden` se o usuário autenticado não for o destinatário
  - `404 Not Found` se a mensagem não existir

## 4. Erros comuns no Postman

- `400 Bad Request`
  - body inválido
  - falta de campo obrigatório
  - `preco` enviado com `tipo` diferente de `venda`
  - query string ausente em endpoints de busca

- `404 Not Found`
  - ID de livro inexistente

- `409 Conflict`
  - e-mail já cadastrado na criação de usuário

- `500 Internal Server Error`
  - problema no servidor ou no Firebase

## 5. Recomendações para criar o collection

- Crie uma coleção `API Livros`
- Adicione requests:
  - `Cadastrar usuário`
  - `Listar livros`
  - `Criar livro`
  - `Buscar livro por ID`
  - `Atualizar livro`
  - `Deletar livro`
  - `Buscar por título`
  - `Buscar por gênero`
  - `Buscar por editora`
  - `Buscar por autor`
  - `Filtrar por tipo`
- Use `{{baseUrl}}` nas URLs
- Para requests `POST` e `PUT`, use `raw` + `JSON`

## 6. Exemplo de uso rápido

No Postman, copie a URL e defina o body conforme o exemplo abaixo para criar um livro:

```json
{
  "titulo": "O Pequeno Príncipe",
  "autor": "Antoine de Saint-Exupéry",
  "descricao": "Exemplar em bom estado.",
  "editora": "Agir",
  "anoPublicacao": 1943,
  "generos": ["Infantil", "Fantasia"],
  "idioma": "Português",
  "condicao": "bom",
  "tipo": "doacao",
  
  "localizacao": "São Paulo - SP"
}
```
