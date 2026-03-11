# My Broker — Simulador de Propostas

App de geração e compartilhamento de propostas de crédito patrimonial programado (consórcio).

## Como fazer o deploy na Vercel (gratuito)

### Opção A — Upload direto (mais fácil, sem precisar de código)

1. Acesse https://vercel.com e crie uma conta gratuita (pode usar conta Google)
2. No painel, clique em **"Add New Project"**
3. Escolha **"Browse"** ou arraste a pasta `mybroker-simulador`
4. A Vercel detecta automaticamente que é um projeto Vite/React
5. Clique em **"Deploy"** — pronto!
6. Você receberá um link como: `mybroker-simulador.vercel.app`

### Opção B — Via GitHub (recomendado para atualizações futuras)

1. Crie uma conta em https://github.com
2. Crie um repositório chamado `mybroker-simulador`
3. Faça upload dos arquivos desta pasta
4. Acesse https://vercel.com → "Add New Project" → importe o repositório
5. Clique em Deploy

## Como usar o app

### Você (consultor):
- Acesse o link do app
- Clique em **+ Nova** para criar uma proposta
- Preencha os dados do cliente, produto e simulação
- Na etapa Simulação, importe a proposta Citybens (imagem/PDF) — a IA preenche tudo automaticamente
- Clique em **Gerar Proposta** → copie o **código único** (ex: MB-A3F2K1)
- Envie o código ao cliente pelo WhatsApp

### O cliente:
- Acessa o mesmo link
- Clica em **🔍 Ver Proposta**
- Digita o código recebido
- Visualiza a proposta e pode imprimir / salvar PDF

## Estrutura de arquivos

```
mybroker-simulador/
├── index.html          # Página principal
├── package.json        # Dependências
├── vite.config.js      # Configuração do bundler
└── src/
    ├── main.jsx        # Ponto de entrada React
    ├── App.jsx         # App completo (toda a lógica e UI)
    └── storage.js      # Adaptador de armazenamento (localStorage)
```

## Tecnologias

- React 18
- Vite 5
- CSS puro (sem frameworks)
- API Anthropic para leitura automática das propostas Citybens

## Observação sobre armazenamento

As propostas ficam salvas no **localStorage do navegador** de quem criou.
Para que o cliente acesse pelo código, você e o cliente precisam usar o **mesmo dispositivo/navegador**, OU você precisará de um backend com banco de dados.

Para a versão com banco de dados compartilhado, entre em contato para upgrade.
