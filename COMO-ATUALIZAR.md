# NutriTrack — como atualizar (novo jeito, igual ao Custódia Digital)

## O que mudou

O app inteiro agora é **4 arquivos só**, sem build, sem pnpm, sem GitHub Actions:

```
index.html              <- tudo: HTML + CSS + JavaScript, num arquivo só
manifest.webmanifest    <- configuração do PWA (nome, ícone, cores)
sw.js                   <- service worker (deixa o app funcionar instalado/offline)
icons/                  <- ícones do app
```

Não existe mais `client/`, `server/`, `package.json`, `pnpm-lock.yaml`, `vite.config.ts` nem pasta `.github/workflows`. O GitHub Pages passa a servir esses 4 itens diretamente, sem nenhuma etapa de compilação no meio — exatamente como o Custódia Digital.

## Passo a passo para colocar isso no ar (uma vez só)

1. No seu repositório do NutriTrack no GitHub, **apague** todo o conteúdo atual (pastas `client`, `server`, `shared`, `patches`, e os arquivos de configuração `package.json`, `pnpm-lock.yaml`, `tsconfig*.json`, `vite.config.ts`, `components.json`, `.prettierrc`, `.prettierignore`, e a pasta `.github/workflows`).
2. Suba os 4 itens deste pacote (`index.html`, `manifest.webmanifest`, `sw.js`, `icons/`) na raiz do repositório.
3. Faça commit e push.
4. Vá em **Settings → Pages** do repositório. Em "Build and deployment" → "Source", troque de **GitHub Actions** para **Deploy from a branch**. Escolha a branch `main` e a pasta `/ (root)`. Salve.
5. Espere 1-2 minutos e acesse o link do GitHub Pages — o app deve carregar normalmente, com login, cadastro e sincronização com o Google funcionando como antes.

Esse passo 4 só precisa ser feito uma vez. Depois disso, é só repetir os passos 2 e 3 a cada atualização.

## Como fica cada atualização daqui pra frente

Exatamente como no Custódia Digital:

1. Editar o `index.html` (ou eu edito e te devolvo o arquivo atualizado).
2. Subir o arquivo pro GitHub (substituindo o `index.html` que já está lá — pode ser pela interface web do GitHub, sem precisar de terminal).
3. Pronto. O GitHub Pages já serve a versão nova, sem nenhuma etapa de build no meio — não tem mais como dar erro de versão do pnpm ou de ordem do workflow, porque essa etapa simplesmente não existe mais.

## O backend (Apps Script) não muda

O cadastro, login, confirmação de e-mail e a conexão com o Google continuam exatamente como estão — mesma URL do Apps Script, mesma planilha. Só a hospedagem do front-end ficou mais simples. Se um dia você quiser atualizar o `Code.gs`, o processo continua o mesmo de sempre: editar no editor do Apps Script → Implantar → Gerenciar implantações → editar (lápis) → Versão "Nova versão" → Implantar.
