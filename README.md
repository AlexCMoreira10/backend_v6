# API de Livros - Uso no Postman

## Configuração do Firebase

Crie um arquivo `.env` na raiz usando `.env.example` como referência e preencha `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` com os dados da conta de serviço do Firebase. Na chave privada, mantenha as quebras de linha como `\n`. Configure `PUBLIC_APP_URL` com a origem pública do frontend (sem `/api`); em produção, configure essa variável também nas variáveis de ambiente do projeto da Vercel.

Para salvar as imagens de livros, configure `FIREBASE_STORAGE_BUCKET` com o nome do bucket do Firebase Storage (por exemplo, `babel-5dcbd.firebasestorage.app`) localmente e na Vercel. A conta de serviço usada pelo backend precisa ter permissão de criar e excluir objetos nesse bucket.

Para proteger os CPFs dos colaboradores, gere uma chave dedicada com `openssl rand -base64 32` e configure o resultado como `SUBACCOUNT_ENCRYPTION_KEY` no `.env` local e nas variáveis do projeto Vercel. Mantenha essa chave persistente e faça backup seguro: ela protege CPFs criptografados e seus índices de unicidade. Não troque a chave sem migrar os CPFs e índices existentes.

Este repositório inclui `vercel.json` para publicar o servidor Express como função da Vercel. Para que a API hospedada gere QR Codes e consulte o histórico, o projeto da Vercel precisa estar conectado a este repositório (`AlexCMoreira10/backend_v6`) e usar um deploy que inclua o serviço de QR Code. Configure `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` e `PUBLIC_APP_URL` nas variáveis de ambiente da Vercel e faça um novo deploy. `PUBLIC_APP_URL` deve ser a URL HTTPS do frontend, não a URL da API.

### Melhor Envio (sandbox)

Para testar cotações, cadastre o aplicativo no painel Sandbox e configure `MELHOR_ENVIO_CLIENT_ID`, `MELHOR_ENVIO_CLIENT_SECRET`, `MELHOR_ENVIO_REDIRECT_URI`, `MELHOR_ENVIO_BASE_URL`, `MELHOR_ENVIO_SUPPORT_EMAIL` e `MELHOR_ENVIO_OWNER_UID` no `.env` e na Vercel. `MELHOR_ENVIO_OWNER_UID` é o UID Firebase do responsável autorizado a conectar a conta de frete compartilhada da plataforma. Use o callback exatamente como cadastrado no aplicativo: `https://babel-be-lovat.vercel.app/api/melhor-envio/callback`. O endereço `app-sandbox.melhorenvio.com.br` é o painel de cadastro; para testes, defina `MELHOR_ENVIO_BASE_URL=https://sandbox.melhorenvio.com.br`.

Gere uma chave exclusiva para criptografar os tokens OAuth salvos no Firestore com `openssl rand -base64 32` e configure-a como `MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY` localmente e na Vercel. Não compartilhe nem altere essa chave sem migrar os tokens já salvos. O segredo do aplicativo e os tokens nunca devem ser enviados ao frontend.

As rotas `POST /api/melhor-envio/authorize` e `GET /api/melhor-envio/status` exigem autenticação Firebase. A conta compartilhada é autorizada uma única vez pelo UID definido em `MELHOR_ENVIO_OWNER_UID`; vendedores e compradores não precisam conectar suas próprias contas. O callback grava os tokens criptografados da plataforma no Firestore. `POST /api/livros/:id/frete` exige autenticação e usa o token compartilhado, o CEP de origem do livro ou do perfil do vendedor, o CEP de destino informado pelo comprador e as dimensões cadastradas no livro. Para produção, defina `MELHOR_ENVIO_BASE_URL=https://melhorenvio.com.br` e configure as credenciais e o callback do aplicativo de produção antes de publicar.

## 1. Visão geral

- Base URL: `http://localhost:3000/api`
- Essa API é o backend do aplicativo de troca/venda/doação de livros.

### 🔐 Autenticação

- As rotas exigem autenticação via Firebase, exceto o cadastro de usuário, a listagem pública de livros (`GET /livros`) e a consulta pública do histórico pelo QR Code.
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
- Autenticação: não exige token.
- Descrição: retorna livros públicos do catálogo; aceita paginação e filtros por query string.

### 3.2 Listar todos os livros

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros`
- Autenticação: não exige token.
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
- Para anúncios de venda, o body pode incluir `dimensoes` com as dimensões do pacote em centímetros e o peso em gramas. Os quatro valores devem ser números maiores que zero. O campo é opcional para manter compatibilidade com anúncios e integrações existentes:

```json
{
  "dimensoes": {
    "altura": 4,
    "largura": 14,
    "comprimento": 21,
    "peso": 450
  }
}
```

- O campo `dimensoes` também pode ser atualizado com `PUT /api/livros/:id` e é replicado para o registro correspondente na estante.
- `localizacao` pode receber o CEP de origem. Ao criar um livro com o usuário autenticado, o backend copia a geolocalização GeoJSON previamente cadastrada pelo próprio usuário, quando disponível. As coordenadas não são incluídas nas respostas públicas do catálogo nem do histórico por QR Code.
- O servidor cria o QR Code automaticamente. A resposta inclui `qrUrl` e `qrCode` (Data URI PNG). O QR abre `{PUBLIC_APP_URL}/html/rastreio.html?token={token}`, onde o usuário pode solicitar a negociação.
- A publicação grava o livro em `livros` e cria, na mesma transação, um registro em `estante` para o proprietário atual.

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

### 3.6 Remover anúncio

- Método: `DELETE`
- Endpoint: `{{baseUrl}}/api/livros/:id`
- Exemplo: `DELETE http://localhost:3000/api/livros/abc123`
- Ação: retira o anúncio do catálogo público e mantém o livro na estante do proprietário. Não apaga o histórico nem os dados do livro.
- Resposta:
  - `200 OK` se o anúncio for retirado
  - `404 Not Found` se não existir
  - `403 Forbidden` se o usuário não for o proprietário atual
  - `409 Conflict` se houver uma aquisição pendente ou o livro não tiver um anúncio ativo

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

- `GET {{baseUrl}}/api/me/estante` lista os livros atualmente pertencentes ao usuário autenticado a partir da coleção `estante`. Aceita `page`, `limit`, `titulo` e `estadoAcervo`. Registros antigos são migrados para essa coleção na primeira consulta. A coleção é atualizada junto com os anúncios em alterações de dados, retirada do catálogo e transferências de propriedade.
- `PUT {{baseUrl}}/api/me/estante/:id/estado` atualiza o estado de um livro próprio. Body: `{ "estadoAcervo": "roubado" }`, `{ "estadoAcervo": "perdido" }`, `{ "estadoAcervo": "danificado" }` ou `{ "estadoAcervo": "normal" }`. A marcação de roubado/perdido pode ser desativada enviando `normal`; a de danificado não pode ser removida por essa rota.
- `GET {{baseUrl}}/api/livros/:id/qrcode` retorna o QR Code e sua URL ao proprietário atual.
- Livros marcados como roubados ou perdidos não podem ser adquiridos e não aparecem nos resultados de anúncios.

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

Após confirmar, atualize a tela e a estante. A estante é carregada com `GET /me/estante`; para marcar um livro como roubado, perdido ou danificado, envie `PUT /me/estante/:id/estado` com `{ "estadoAcervo": "roubado" }`, `{ "estadoAcervo": "perdido" }` ou `{ "estadoAcervo": "danificado" }`. A marcação de roubado/perdido pode ser desativada com `{ "estadoAcervo": "normal" }`. `DELETE /livros/:id` retira apenas um anúncio ativo do catálogo e preserva o livro na estante do proprietário.

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

> **Status:** envio, histórico, conversas, marcação de leitura, exclusão de mensagens recebidas e atendimento por colaboradores estão implementados.

Colaboradores autenticados com a permissão `mensagens.gerenciar` acessam as mensagens do sebo associado à subconta. Respostas são enviadas em nome do sebo. A permissão é incluída nos tipos padrão de colaborador; subcontas personalizadas precisam recebê-la pelo gestor.

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

#### Apagar mensagem ou ocultá-la da própria caixa de entrada

- Método: `DELETE`
- Endpoint: `{{baseUrl}}/api/mensagens/:id`
- Cabeçalho: `Authorization: Bearer <token>`
- Descrição: se o usuário autenticado for o remetente, remove a mensagem para os dois participantes. Se for o destinatário, oculta a mensagem somente da sua caixa de entrada.
- Para colaboradores com `mensagens.gerenciar`, o participante é o sebo associado à subconta.
- Resposta:
  - `200 OK` com `{ "mensagem": "Mensagem apagada para todos os participantes", "apagadaParaTodos": true }` para o remetente ou `{ "mensagem": "Mensagem apagada da sua caixa de entrada", "apagadaParaTodos": false }` para o destinatário
  - `401 Unauthorized` se o token estiver ausente ou inválido
  - `403 Forbidden` se o usuário não for participante da conversa ou o colaborador não tiver permissão
  - `404 Not Found` se a mensagem não existir

#### Ocultar todas as conversas para o usuário autenticado

- Método: `DELETE`
- Endpoint: `{{baseUrl}}/api/mensagens`
- Cabeçalho: `Authorization: Bearer <token>`
- Body: `{ "senha": "senha-atual-do-funcionario" }`
- Descrição: exige a senha atual do funcionário antes de ocultar todo o histórico de mensagens do sebo, recebidas e enviadas, somente na caixa de entrada do sebo. O outro participante continua vendo as mensagens normalmente. A API valida a senha da subconta e marca somente mensagens em que o sebo associado é remetente ou destinatário como ocultas para o sebo.
- Resposta: `200 OK` com `{ "mensagem": "Conversas ocultadas para este usuário", "ocultadas": 12 }`
- `400 Bad Request` se a senha não for informada; `403 Forbidden` se a senha estiver incorreta ou a conta não for de funcionário.

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

## 7. Sebos parceiros

Os perfis de sebos são gravados em `sebos/{uid}`. O UID vem do Firebase Authentication e é usado como `_id`; o cliente não pode escolher esse identificador. O CNPJ é validado no servidor e normalizado para um formato canônico. Para impedir duplicidade mesmo em cadastros simultâneos, o backend também mantém internamente `sebos_cnpj/{cnpj-normalizado}`.

Depois de publicar estas alterações no repositório conectado à Vercel, os endpoints também ficam disponíveis na API hospedada.

O cadastro e a consulta usam o ID token do Firebase no cabeçalho `Authorization: Bearer <FIREBASE_ID_TOKEN>`. Crie/autentique a conta no Firebase Authentication (e-mail/senha ou Google) antes de chamar a API. A senha nunca é enviada ao backend nem salva no Firestore. O e-mail informado no perfil deve corresponder ao e-mail da conta autenticada.

### Criar cadastro de sebo

- Método: `POST`
- Endpoint local: `http://localhost:3000/api/sebos/cadastro`
- Endpoint publicado: `https://babel-be-lovat.vercel.app/api/sebos/cadastro`
- Autenticação: obrigatória.
- Cabeçalho: `Content-Type: application/json`

Exemplo de body:

```json
{
  "nome": "Sebo Fatec",
  "email": "sebo@email.com",
  "cnpj": "20.182.807/0004-42",
  "telefone": ["(11) 99999-9999", "(11) 88888-8888"],
  "endereco": {
    "rua": "Praça da Sé",
    "numero": "1",
    "complemento": "Loja 2",
    "bairro": "Sé",
    "cidade": "São Paulo",
    "estado": "SP",
    "cep": "01001-000"
  },
  "horario_funcionamento": {
    "segunda": { "abre": "08:00", "fecha": "18:00" },
    "terca": { "abre": "08:00", "fecha": "18:00" },
    "quarta": { "abre": "08:00", "fecha": "18:00" },
    "quinta": { "abre": "08:00", "fecha": "18:00" },
    "sexta": { "abre": "08:00", "fecha": "18:00" },
    "sabado": null,
    "domingo": null
  },
  "geocode": {
    "type": "Point",
    "coordinates": [-46.6333, -23.5505]
  }
}
```

Regras:

- `nome`, `email`, `cnpj`, `telefone`, `endereco` e `horario_funcionamento` são obrigatórios.
- O CNPJ aceita o formato numérico tradicional e o alfanumérico novo; os dois dígitos verificadores são conferidos no servidor. A resposta armazena o CNPJ formatado.
- Cada telefone deve conter DDD e 10 ou 11 dígitos.
- O endereço exige rua, número, bairro, cidade, UF e CEP. O preenchimento automático do frontend consulta o ViaCEP; a API valida os dados recebidos sem depender do ViaCEP.
- O objeto de horário deve conter `segunda`, `terca`, `quarta`, `quinta`, `sexta`, `sabado` e `domingo`. Cada dia é `null` quando fechado ou `{ "abre": "HH:MM", "fecha": "HH:MM" }` quando aberto. Deve haver pelo menos um dia aberto, e o horário de fechamento deve ser posterior ao de abertura.
- `geocode` é opcional e deve ser um GeoJSON Point com `[longitude, latitude]`. `geoJson` também é aceito como nome alternativo.
- Ao cadastrar livros pelo sebo, a API copia automaticamente o `geocode` da loja para cada livro criado, inclusive nas importações em massa. A ordem segue GeoJSON: `coordinates[0]` é longitude e `coordinates[1]` é latitude. Se o sebo não tiver coordenadas cadastradas, o livro permanece sem `geocode`.
- `_id` e `uid` são derivados do token. A senha não deve ser enviada.
- Resposta: `201 Created`; `400 Bad Request` para dados inválidos; `401 Unauthorized` para token inválido/ausente; `409 Conflict` para CNPJ ou conta já cadastrados.

### Consultar o perfil autenticado

- Método: `GET`
- Endpoint local: `http://localhost:3000/api/sebos/me`
- Endpoint publicado: `https://babel-be-lovat.vercel.app/api/sebos/me`
- Autenticação: obrigatória.
- Retorna o cadastro associado ao UID do token ou `404 Not Found` quando a conta ainda não tem perfil de sebo.

### Cadastrar livro para um sebo

- Método: `POST`
- Endpoint: `{{baseUrl}}/api/sebos/livros`
- Autenticação: gestor do sebo ou subconta com a permissão `acervo.cadastrar`.
- Requer `titulo`, `autor`, `tipo` (`venda`, `troca` ou `doacao`), `localizacao` (posição do livro no estabelecimento) e `quantidadeEstoque` (inteiro maior que zero). `anoPublicacao`, quando informado, deve estar entre 1500 e o ano atual. Para venda, `preco` também é obrigatório.

Exemplo de body:

```json
{
  "titulo": "O Pequeno Príncipe",
  "autor": "Antoine de Saint-Exupéry",
  "descricao": "Edição em bom estado",
  "editora": "Agir",
  "anoPublicacao": 1943,
  "generos": ["Infantil", "Fantasia"],
  "idioma": "Português",
  "condicao": "bom",
  "tipo": "venda",
  "preco": 35.9,
  "localizacao": "Loja Centro, estante A, prateleira 2",
  "quantidadeEstoque": 3
}
```

O sebo e o proprietário são identificados pelo token; o servidor associa o nome do sebo e não aceita que o cliente escolha outro proprietário. A criação também registra o livro na estante e gera os dados do QR Code. Subcontas sem a permissão recebem `403 Forbidden`.

As imagens podem ser enviadas antes do cadastro do livro:

- `POST /api/sebos/livros/imagens`: envia o conteúdo binário de uma imagem com `Content-Type: image/jpeg`, `image/png` ou `image/webp`; máximo de 4 MB por arquivo. Retorna `url` para incluir em `fotos` e `path` para permitir a limpeza se o cadastro falhar.
- `DELETE /api/sebos/livros/imagens`: recebe `{ "paths": ["sebos/<seboId>/livros/<arquivo>"] }` para remover uploads temporários. O servidor só permite excluir imagens dentro do diretório do sebo autenticado.

As duas rotas exigem gestor ou subconta com `acervo.cadastrar`. O formulário aceita até cinco imagens por livro, combinando uploads e URLs HTTPS públicas informadas diretamente; o backend valida e armazena as URLs, mas não baixa nem hospeda imagens externas. URLs precisam apontar diretamente para uma imagem acessível. Links externos podem expirar ou deixar de funcionar. O formulário remove os uploads temporários se a criação do livro falhar.

`GET /api/sebos/livros` lista os anúncios do sebo autenticado, com paginação e os filtros de `status`, `tipo` e `titulo` disponíveis. Cada livro inclui `qrUrl` e `qrCode` (Data URI PNG) para rastreamento; o token privado não é retornado. Gestores têm acesso; subcontas precisam da permissão `acervo.consultar`. A consulta sempre usa o ID do sebo derivado do token.

### Anunciar livros em massa

- `GET /api/sebos/livros/importacao/modelo`: baixa um modelo Excel com as abas `Livros` e `Instruções`.
- `POST /api/sebos/livros/importacao`: recebe o arquivo `.xlsx` binário e retorna outra planilha `.xlsx` com uma linha por registro, resultado, ID do livro salvo ou motivo da rejeição.
- Ambas as rotas exigem gestor ou subconta com `acervo.cadastrar`.
- O arquivo pode ter até 4 MB e conter até 100 livros. Cada linha válida é criada independentemente; falhas em outras linhas não desfazem os cadastros concluídos.
- O modelo documenta os campos aceitos. Gêneros múltiplos devem ser separados por ponto e vírgula; tipo de anúncio aceita `venda`, `troca` ou `doacao`. Imagens não são importadas pela planilha.

## 8. Gestão de subcontas de colaboradores

Apenas a conta proprietária/gestora autenticada do sebo pode criar, listar, editar, redefinir senhas, reativar ou revogar colaboradores. Cada colaborador tem login exclusivo, telefone opcional, CPF válido, senha temporária e permissões individuais. Login e telefone são identificadores únicos globalmente. O colaborador entra informando seu login ou telefone e a senha; e-mail/Google continuam sendo o acesso do gestor.

O backend cria uma sessão de Firebase Authentication por custom token depois de conferir a senha armazenada com hash scrypt. Os tokens de colaboradores são marcados como `accountType: "sebo_staff"` e rejeitados pelas rotas existentes do aplicativo de usuários. Nas rotas de sebo, a API verifica em cada requisição se a subconta continua ativa e se pertence ao sebo indicado pelo token. A revogação desativa a conta sem remover o histórico; uma conta inativa não consegue autenticar ou usar tokens já emitidos.

O CPF é validado no servidor, armazenado criptografado com AES-256-GCM e indexado por HMAC com `SUBACCOUNT_ENCRYPTION_KEY`. A API retorna somente o CPF mascarado para a interface de gestão. A senha temporária é armazenada somente como hash scrypt; o colaborador precisa defini-la novamente no primeiro login. O gestor também pode redefinir a senha, o que volta a exigir a troca no próximo acesso.

### Login de colaborador

- Método: `POST`
- Endpoint: `{{baseUrl}}/api/sebos/subcontas/login`
- Autenticação: não exige ID token; exige login/telefone e senha.

```json
{
  "identificador": "ana.livros",
  "senha": "SenhaTemporaria123"
}
```

O identificador também pode ser o telefone com DDD. A resposta inclui `customToken` (para `signInWithCustomToken` do Firebase Client SDK) e os dados públicos da subconta. Login e senha inválidos retornam a mesma mensagem `401 Unauthorized`.

### Consultar a sessão e a equipe

- `GET /api/sebos/sessao`: exige o Firebase ID token do gestor ou colaborador e retorna o perfil e o tipo de conta. Permite consultar uma sessão ainda obrigada a trocar senha, mas não libera outras operações da subconta nesse estado.
- `GET /api/sebos/subcontas`: lista colaboradores do sebo do token; somente gestor.

Cabeçalho nas rotas autenticadas:

```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

### Criar colaborador

- Método: `POST`
- Endpoint: `{{baseUrl}}/api/sebos/subcontas`
- Autenticação: gestor do sebo.

```json
{
  "nome": "Ana Colaboradora",
  "login": "ana.livros",
  "telefone": "(11) 99999-9999",
  "cpf": "529.982.247-25",
  "tipo": "cadastrador_acervo",
  "permissoes": [
    "acervo.consultar",
    "acervo.cadastrar",
    "acervo.editar"
  ],
  "senhaTemporaria": "SenhaTemporaria123"
}
```

`telefone` é opcional. Se `permissoes` for omitido, a API aplica o conjunto padrão do tipo; se for enviado, ele substitui o padrão e pode ser personalizado:

| Tipo (`tipo`) | Permissões iniciais |
|---|---|
| `cadastrador_acervo` | `acervo.consultar`, `acervo.cadastrar`, `acervo.editar`, `acervo.excluir` |
| `operador_negociacoes` | `negociacoes.consultar`, `negociacoes.gerenciar` |
| `gestor_financeiro` | `financeiro.consultar`, `financeiro.relatorios` |
| `personalizado` | Nenhuma; marque as permissões necessárias |

O login deve ter 3 a 32 caracteres e usar letras, números, ponto, hífen ou sublinhado. A senha temporária deve ter de 10 a 128 caracteres. A resposta não contém a senha nem o CPF completo. Duplicidade de login, telefone ou CPF retorna `409 Conflict`.

### Editar, redefinir senha e revogar

- `PATCH /api/sebos/subcontas/:id`: atualiza nome, login, telefone, tipo, permissões e/ou estado `ativo`.
- `PATCH /api/sebos/subcontas/:id/senha`: recebe `{ "senhaTemporaria": "..." }`, define nova senha temporária e exige que a pessoa escolha nova senha ao entrar.
- `DELETE /api/sebos/subcontas/:id`: revoga o acesso sem apagar o registro.
- Para reativar, use `PATCH /api/sebos/subcontas/:id` com `{ "ativo": true }`.
- O próprio colaborador troca a senha inicial por `PATCH /api/sebos/subcontas/minha-senha`, com `{ "novaSenha": "..." }` e seu ID token. Até a troca, qualquer outra rota autenticada de sebo responde `403 Forbidden`.

As permissões são verificadas por rotas de domínio no servidor com o middleware `exigirPermissaoSebo`. O cadastro de livros do sebo usa `acervo.cadastrar`; gestores sempre podem executar essa operação. Outras operações de acervo comercial, vendas/trocas de sebo ou relatórios financeiros ainda precisam de endpoints próprios que apliquem as chaves correspondentes. As rotas atuais dos usuários não dão acesso a colaboradores.
