# Publicar o NutriTrack no GitHub e instalar no Chrome

## 1. Salvar no GitHub

Na pasta do projeto, crie um repositório vazio no GitHub e execute:

```bash
git init
git add .
git commit -m "Publica NutriTrack como PWA"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/NOME_DO_REPOSITORIO.git
git push -u origin main
```

## 2. Publicar com GitHub Pages

No repositório, abra **Settings → Pages**. Em **Build and deployment**, selecione **GitHub Actions**. Depois, crie um workflow que execute `pnpm install`, `pnpm build` e publique a pasta `dist/public` como artefato do Pages. O build já usa caminhos relativos, compatíveis com site de projeto em `usuario.github.io/nome-do-repositorio/`.

Se preferir publicar por outro serviço estático, basta usar o mesmo comando `pnpm build` e disponibilizar a pasta `dist/public`.

## 3. Instalar no Chrome

Abra o endereço publicado no Chrome usando HTTPS. No computador, clique no ícone de instalação na barra de endereço ou abra o menu **⋮ → Salvar e compartilhar → Instalar página como app**. No celular Android, abra o menu **⋮ → Adicionar à tela inicial** ou use o aviso “Instalar o NutriTrack” quando ele aparecer.

O app salva metas e histórico no armazenamento local do navegador. Se os dados forem importantes, mantenha o mesmo navegador e evite limpar os dados do site.
