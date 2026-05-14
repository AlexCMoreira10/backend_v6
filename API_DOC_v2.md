# API de Livros - Uso no Postman

## 1. Visão geral

- Base URL: `http://localhost:3000/api`
- Essa API é o backend do aplicativo de troca/venda/doação de livros.

### 🔐 Autenticação

- Todas as rotas (exceto futuras rotas públicas) exigem autenticação via Firebase.
- Cabeçalho obrigatório em todas as requisições protegidas:
  - Authorization: Bearer {{token}}
- O `token` deve ser obtido via login com Google no Firebase.

## 2. Configuração sugerida no Postman

1. Crie um novo environment chamado `Local`.
2. Adicione as variáveis:
   - `baseUrl = http://localhost:3000`
   - `token = COLE_SEU_TOKEN_AQUI`
3. Use `{{baseUrl}}` e `{{token}}` nas requisições.

---

## 3. Rotas da API

### 3.1 Listar livros (com paginação e filtros)

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros`

### 3.1 Listar todos os livros

- Método: `GET`
- Endpoint: `{{baseUrl}}/api/livros/api/livros`
- Resposta: `200 OK`
- Exemplo de uso:
  - Request: `GET http://localhost:3000/api/livros?page=1&limit=10&titulo=pequeno`

- Resposta: 200 OK

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


## 5. Exemplo de uso rápido

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
