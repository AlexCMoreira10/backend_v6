# API de Livros - Uso no Postman

## 1. Visão geral

- Base URL: `http://localhost:3000/api`
- Essa API é o backend do aplicativo de troca/venda/doação de livros.
- O Postman pode usar um environment com a variável `{{baseUrl}}` definida para `http://localhost:3000`.
- Todas as rotas (exceto públicas) exigem autenticação via Firebase.
  Cabeçalho: Authorization: Bearer {{token}}

## 2. Configuração sugerida no Postman

1. Crie um novo environment chamado `Local`.
2. Adicione variável:
   - `baseUrl = http://localhost:3000`
3. Use `{{baseUrl}}` nos endpoints do Postman.

## 3. Rotas da API

### 3.1 Listar todos os livros

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros/api/livros?page={valor}&limit={valor}`
- Resposta: `200 OK`
- Exemplo de uso:
  - Request: `GET http://localhost:3000/api/livros?page=1&limit=10`

### 3.2 Criar um novo livro

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
  - `usuarioId` obrigatório

### 3.3 Buscar livro por ID

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros/:id`
- Exemplo: `GET http://localhost:3000/api/livros/abc123`
- Resposta:
  - `200 OK` com o livro
  - `404 Not Found` se não existir

### 3.4 Atualizar livro

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

### 3.5 Deletar livro

- Método: `DELETE`
- Endpoint: `{{baseUrl}}/api/livros/:id`
- Exemplo: `DELETE http://localhost:3000/api/livros/abc123`
- Resposta:
  - `204 No Content` em caso de sucesso
  - `404 Not Found` se não existir

### 3.6 Buscar por título

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros/busca/titulo`
- Query string: `titulo`
- Exemplo:
  - `GET http://localhost:3000/api/livros/busca/titulo?titulo=pequeno`
- Observação:
  - agora a busca encontra o termo em qualquer posição do título
  - por exemplo, `pequeno` encontra `O Pequeno Príncipe`

### 3.7 Busca avançada combinando filtros

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

### 3.8 Buscar por gênero

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros/busca/genero`
- Query string: `genero`
- Exemplo:
  - `GET http://localhost:3000/api/livros/busca/genero?genero=fantasia`

### 3.8 Buscar por editora

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros/busca/editora`
- Query string: `editora`
- Exemplo:
  - `GET http://localhost:3000/api/livros/busca/editora?editora=agir`

### 3.9 Buscar por autor

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros/busca/autor`
- Query string: `autor`
- Exemplo:
  - `GET http://localhost:3000/api/livros/busca/autor?autor=antoine`

### 3.10 Filtrar por tipo de livro

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros/filtro/tipo`
- Query string: `ehDoacao`
- Exemplo:
  - `GET http://localhost:3000/api/livros/filtro/tipo?ehDoacao=true`

- Observação:
  - aceita `true` ou `false`
  - retorna livros de doação quando `true`
  - retorna livros de troca/venda quando `false`

### 3.11 Notificações

#### Listar notificações do usuário

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/notificacoes`
- Cabeçalho: `Authorization: Bearer {{token}}`
- Descrição: retorna as notificações associadas ao usuário autenticado.
- Exemplo:
  - `GET http://localhost:3000/api/notificacoes`
- Resposta:
  - `200 OK` com um array de notificações
  - `401 Unauthorized` se o token estiver ausente ou inválido

#### Marcar notificação como lida

- Método: `PUT`
- Endpoint: `{{baseUrl}}/api/notificacoes/:id/lida`
- Cabeçalho: `Authorization: Bearer {{token}}`
- Descrição: atualiza o status da notificação para lida.
- Exemplo:
  - `PUT http://localhost:3000/api/notificacoes/abc123/lida`
- Resposta:
  - `200 OK` com `{ mensagem: 'Notificação marcada como lida' }`
  - `401 Unauthorized` se o token estiver ausente ou inválido

### 3.12 Mensagens

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

## 4. Erros comuns no Postman

- `400 Bad Request`
  - body inválido
  - falta de campo obrigatório
  - `preco` enviado com `tipo` diferente de `venda`
  - query string ausente em endpoints de busca

- `404 Not Found`
  - ID de livro inexistente

- `500 Internal Server Error`
  - problema no servidor ou no Firebase

## 5. Recomendações para criar o collection

- Crie uma coleção `API Livros`
- Adicione requests:
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

Use esse documento como base de referência para testar todas as rotas do backend no Postman.
