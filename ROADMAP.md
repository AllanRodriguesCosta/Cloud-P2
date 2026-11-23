# Roadmap de implementação — P2 Cloud

## Resultado esperado
Uma aplicação web que:
1. lista arquivos de uma pasta do Google Drive;
2. lista os blobs do contêiner Azure `P2_Allan_ribeiro`;
3. copia arquivos do Drive para o Blob Storage;
4. mostra na tela e no console o resultado individual de cada transferência;
5. pode ser publicada no Render com uma única URL.

## Regra de trabalho para o Copilot
Implemente **todo o código, testes, configuração e documentação descritos abaixo**. Não solicite, crie, adicione ou grave credenciais reais. Use somente variáveis de ambiente e valores fictícios nos exemplos.

## Stack e estrutura
- Node.js 20+ e npm.
- Backend: Express.
- Frontend: React + Vite.
- SDKs: `googleapis`, `@azure/storage-blob`, `dotenv`.
- Testes: Vitest (frontend) e Vitest ou Jest (backend).
- Estrutura recomendada:

```text
client/                  # React/Vite
server/
  src/
    config/
    services/
      googleDriveService.js
      azureBlobService.js
      syncService.js
    routes/
    app.js
    server.js
  tests/
.github/
  copilot-instructions.md
.env.example
.gitignore
README.md
render.yaml
```

É permitido usar outra estrutura se ela preservar claramente a separação entre interface, rotas, serviços de integração e testes.

## Variáveis de ambiente
Criar `.env.example`, sem valores secretos:

```dotenv
PORT=3000
GOOGLE_DRIVE_FOLDER_ID=COLE_O_ID_DA_PASTA
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=
# Alternativa local: GOOGLE_APPLICATION_CREDENTIALS=./secrets/service-account.json
AZURE_STORAGE_CONNECTION_STRING=
AZURE_STORAGE_CONTAINER=P2_Allan_ribeiro
CORS_ORIGIN=http://localhost:5173
```

Regras:
- `.env`, `secrets/`, `*.json` de credenciais e arquivos de chave devem constar em `.gitignore`.
- O frontend nunca recebe Connection String, SAS, chave JSON ou token.
- Em produção, preferir `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` como secret de ambiente; decodificar somente em memória.
- Não registrar segredos no console nem nas respostas HTTP.

## Backend a implementar

### Configuração
- Validar todas as variáveis obrigatórias no início da aplicação.
- Centralizar a leitura de ambiente em `server/src/config`.
- Usar porta `process.env.PORT` e bind em `0.0.0.0`, para compatibilidade com Render.
- Adicionar CORS restrito a `CORS_ORIGIN` para desenvolvimento; se frontend e backend forem servidos juntos em produção, permitir a mesma origem.

### Serviço Google Drive
Implementar `listDriveFiles()` e `downloadDriveFile(fileId)`.

Requisitos:
- Listar somente arquivos não removidos diretamente da pasta configurada.
- Paginar até obter todos os resultados.
- Retornar, no mínimo: `id`, `name`, `mimeType`, `size`, `modifiedTime`, `webViewLink`.
- Baixar arquivos binários por streaming.
- Para arquivos nativos do Google, exportar para formatos previsíveis:
  - Google Docs -> DOCX;
  - Google Sheets -> XLSX;
  - Google Slides -> PPTX.
- Retornar nome final e MIME type corretos após a exportação.
- Traduzir erros de permissão e pasta inexistente em mensagens claras, sem vazar dados confidenciais.

### Serviço Azure Blob Storage
Implementar `listBlobs()`, `blobExists(name)` e `uploadStream(name, stream, contentType, metadata)`.

Requisitos:
- Usar `AZURE_STORAGE_CONNECTION_STRING` somente no backend.
- Obter/criar o contêiner `P2_Allan_ribeiro` de forma segura.
- Listar ao menos: `name`, `contentLength`, `contentType`, `lastModified`.
- Enviar em streaming, preservando o nome e o MIME type.
- Salvar metadados úteis quando possível: ID original do Drive e data de origem.
- Não sobrescrever blobs existentes por padrão; marcar como `skipped`. Aceitar `overwrite: true` no corpo da sincronização para substituição consciente.

### Serviço de sincronização
Implementar `syncFiles({ overwrite })`.

Requisitos:
- Obter arquivos do Drive e processá-los com concorrência limitada a 3.
- Para cada arquivo, verificar se já existe no Blob.
- Resultado por arquivo: `name`, `status` (`success`, `skipped` ou `error`), `message`, `blobName`.
- Registrar no console início e resultado de cada transferência.
- Um erro em um arquivo não pode interromper os demais.
- Responder um resumo: total, sucesso, ignorados, erros e detalhes.

### API HTTP
- `GET /api/health`: responde `{ "status": "ok" }`.
- `GET /api/source`: retorna lista do Google Drive.
- `GET /api/destination`: retorna lista do Blob Storage.
- `POST /api/sync`: aceita opcionalmente `{ "overwrite": false }` e retorna o resumo.
- Retornar códigos HTTP coerentes e objetos de erro no formato `{ "error": "mensagem segura" }`.

## Frontend a implementar
Uma página única, em português, com:
- título do projeto e indicação do contêiner `P2_Allan_ribeiro`;
- botões **Listar origem**, **Listar destino** e **Sincronizar**;
- checkbox opcional **Sobrescrever arquivos existentes**;
- estados de carregamento e botões desabilitados durante chamadas;
- tabela da origem (nome, tipo, tamanho, modificação);
- tabela do destino (nome, tipo, tamanho, modificação);
- painel de resultados da sincronização com status visual por arquivo;
- mensagens de erro claras;
- layout responsivo e acessível.

O frontend deve chamar caminhos relativos `/api/*` em produção. Em desenvolvimento, configurar proxy do Vite para o backend.

## Testes obrigatórios
Criar testes sem credenciais reais:
- validação de ambiente;
- serviço de sincronização: sucesso, blob já existente, erro de download e erro de upload;
- rotas: health, source, destination e sync com serviços mockados;
- componente/interface: carregamento, exibição de tabelas e resultados.
- Incluir os comandos de teste no `package.json` e documentá-los no README.

## README obrigatório
Documentar:
1. pré-requisitos;
2. instalação e execução local;
3. criação de `.env` a partir de `.env.example`;
4. execução dos testes;
5. comportamento de arquivos duplicados e nativos do Google;
6. como publicar no Render;
7. aviso explícito de que segredos não devem ser enviados ao GitHub.

## Publicação preparada pelo código
Incluir `render.yaml` ou instruções que permitam criar um Web Service no Render.
- Build: instalar dependências e gerar o frontend.
- Start: iniciar Express.
- O backend deve servir o build do React em produção, deixando uma única URL final.
- Não colocar nenhum secret no `render.yaml`.

## Critérios de aceite
Antes de declarar o trabalho concluído, o Copilot deve:
- executar lint, build e testes;
- garantir que não há segredo rastreado pelo Git;
- verificar os quatro endpoints com mocks;
- confirmar que `npm run build` funciona;
- atualizar o README com os comandos realmente existentes;
- fazer commits pequenos e descritivos no branch principal, ou abrir PR se essa for a configuração do repositório.

## Ações que não podem ser concluídas só pelo Copilot
Essas tarefas precisam ser feitas pelo proprietário das contas após o código estar pronto:
1. criar/obter a Service Account no Google Cloud;
2. compartilhar a pasta do Drive com o e-mail dessa Service Account;
3. obter o ID da pasta;
4. adicionar credenciais como secrets no Render;
5. testar contra os recursos reais;
6. publicar e copiar a URL final para a entrega.
