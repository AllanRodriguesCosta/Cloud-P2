# Roadmap — Migração Google Drive para Azure Blob Storage

## Objetivo
Criar uma aplicação web que copie arquivos de uma pasta do Google Drive para o contêiner `Aluno_Allan` no Azure Blob Storage, permita listar origem e destino e mostre o resultado de cada transferência.

## Escopo da entrega
- Interface gráfica com os botões **Listar origem**, **Listar destino** e **Sincronizar**.
- Console do servidor informando sucesso ou erro por arquivo.
- Tela com tabela de arquivos e status da transferência.
- Repositório com código-fonte, sem credenciais.
- Aplicação publicada e URL informada na entrega.

## Arquitetura sugerida
- **Frontend:** React com Vite.
- **Backend:** Node.js com Express.
- **Google Drive:** pacote `googleapis`, usando Service Account com acesso compartilhado à pasta.
- **Azure:** pacote `@azure/storage-blob`, usando Connection String ou Service Principal apenas no backend.
- **Configuração:** `.env` e arquivo de chave da Service Account fora do Git.

## Endpoints
- `GET /api/source`: lista arquivos da pasta do Google Drive.
- `GET /api/destination`: lista blobs do contêiner Azure.
- `POST /api/sync`: copia arquivos pendentes e devolve o resultado por item.

## Etapas
1. Criar a estrutura frontend/backend e adicionar `.gitignore`.
2. Configurar variáveis de ambiente e validar acesso ao Drive e ao Blob Storage.
3. Implementar `listDriveFiles` e `listBlobs`.
4. Implementar `syncFiles` com download/upload em streaming.
5. Registrar no console: nome do arquivo, início, sucesso ou erro.
6. Criar a interface de gerenciamento com tabela de status.
7. Testar com poucos arquivos, incluindo repetição e erro controlado.
8. Publicar frontend e backend; incluir a URL final no README.

## Regras de segurança
- Nunca versionar `.env`, Connection String, SAS ou JSON da Service Account.
- Não enviar credenciais ao navegador.
- Para Google Docs, Sheets e Slides, definir o formato de exportação antes do upload.
