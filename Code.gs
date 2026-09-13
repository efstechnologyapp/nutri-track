// ===== CONFIGURAÇÃO =====
const ABA_USUARIOS = "Usuarios";
const NOME_APP = "NutriTrack";
const CODIGO_VALIDADE_MIN = 30;

// Mesmo Client ID usado no front-end (não é segredo). O Client Secret NUNCA fica aqui no código —
// fica guardado nas Propriedades do Script (Editor do Apps Script → ⚙️ Configurações do projeto →
// Propriedades do script → adicionar "GOOGLE_CLIENT_SECRET" com o valor copiado do Google Cloud
// Console em APIs e serviços → Credenciais → clicar no OAuth Client ID do NutriTrack).
const GOOGLE_CLIENT_ID = "324458100746-em71t2toc30d96up3adov613eljubt6h.apps.googleusercontent.com";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_SPREADSHEET_TITLE = "NutriTrack Dados";

// O app fala com este backend por GET (os dados vão dentro do parâmetro "data" da própria URL, em
// JSON). Isso porque o redirecionamento interno do Apps Script devolve os cabeçalhos de CORS que o
// navegador exige para GET, mas não para POST — então POST fica bloqueado pelo navegador. doPost
// continua aqui só como alternativa, caso algum dia seja chamado por outra via (ex.: outro servidor).
function doGet(e) {
  try {
    const dados = JSON.parse((e.parameter && e.parameter.data) || "{}");
    return processarAcao(dados);
  } catch (err) {
    return responder({ ok: false, erro: String(err) });
  }
}

function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents);
    return processarAcao(dados);
  } catch (err) {
    return responder({ ok: false, erro: String(err) });
  }
}

function processarAcao(dados) {
  try {
    garantirEstrutura();
    const acao = dados.acao;
    switch (acao) {
      case "cadastrar": return responder(cadastrar(dados));
      case "confirmarEmail": return responder(confirmarEmail(dados));
      case "reenviarCodigo": return responder(reenviarCodigo(dados));
      case "login": return responder(login(dados));
      case "atualizarPerfil": return responder(atualizarPerfil(dados));
      case "atualizarFoto": return responder(atualizarFoto(dados));
      case "conectarGoogle": return responder(conectarGoogle(dados));
      case "desconectarGoogle": return responder(desconectarGoogle(dados));
      case "carregarDadosGoogle": return responder(carregarDadosGoogle(dados));
      case "salvarRefeicaoGoogle": return responder(salvarRefeicaoGoogle(dados));
      case "removerRefeicaoGoogle": return responder(removerRefeicaoGoogle(dados));
      case "zerarHojeGoogle": return responder(zerarHojeGoogle(dados));
      case "atualizarMetasGoogle": return responder(atualizarMetasGoogle(dados));
      case "salvarMedidaGoogle": return responder(salvarMedidaGoogle(dados));
      case "removerMedidaGoogle": return responder(removerMedidaGoogle(dados));
      default: return responder({ ok: false, erro: "Ação desconhecida." });
    }
  } catch (err) {
    return responder({ ok: false, erro: String(err) });
  }
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// A planilha (deste backend, com a lista de contas) é criada automaticamente, na primeira vez que for
// necessária, na conta que executa o script (a mesma da implantação, em "Executar como"). O ID dela
// fica guardado nas Propriedades do Script, então não precisa configurar nenhum ID manualmente. Isso
// evita o erro "You do not have permission to access the requested document", que acontece quando a
// planilha pertence a uma conta do Google diferente da que roda o script.
function planilha() {
  const props = PropertiesService.getScriptProperties();
  const idSalvo = props.getProperty("SHEET_ID");
  if (idSalvo) {
    try {
      return SpreadsheetApp.openById(idSalvo);
    } catch (err) {
      // ID salvo não abre mais (planilha apagada, por exemplo) — cria uma nova abaixo.
    }
  }
  const ss = SpreadsheetApp.create(NOME_APP + " - Dados");
  props.setProperty("SHEET_ID", ss.getId());
  return ss;
}
function abaUsuarios() { return planilha().getSheetByName(ABA_USUARIOS); }

// Cria a aba e o cabeçalho automaticamente na primeira execução, se ainda não existir.
function garantirEstrutura() {
  const ss = planilha();
  const definicoes = {};
  definicoes[ABA_USUARIOS] = ["nome", "email", "senhaHash", "salt", "confirmado", "codigo", "codigoExpira", "criadoEm", "fotoBase64", "googleRefreshToken", "googleEmail"];

  Object.keys(definicoes).forEach(function (nomeAba) {
    var aba = ss.getSheetByName(nomeAba);
    if (!aba) {
      aba = ss.insertSheet(nomeAba);
      aba.getRange(1, 1, 1, definicoes[nomeAba].length).setValues([definicoes[nomeAba]]);
      aba.setFrozenRows(1);
    }
  });

  // Migrações: planilhas criadas antes de cada coluna existir ganham a coluna agora.
  var abaUsu = ss.getSheetByName(ABA_USUARIOS);
  if (abaUsu.getRange(1, 9).getValue() !== "fotoBase64") {
    abaUsu.getRange(1, 9).setValue("fotoBase64");
  }
  if (abaUsu.getRange(1, 10).getValue() !== "googleRefreshToken") {
    abaUsu.getRange(1, 10).setValue("googleRefreshToken");
  }
  if (abaUsu.getRange(1, 11).getValue() !== "googleEmail") {
    abaUsu.getRange(1, 11).setValue("googleEmail");
  }

  var sheets = ss.getSheets();
  if (sheets.length > Object.keys(definicoes).length) {
    sheets.forEach(function (sheet) {
      var nome = sheet.getName();
      if (!definicoes.hasOwnProperty(nome) && sheet.getLastRow() === 0) {
        ss.deleteSheet(sheet);
      }
    });
  }
}

function gerarSalt() { return Utilities.getUuid(); }

function hashSenha(senha, salt) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, senha + ":" + salt);
  return digest.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, "0")).join("");
}

function gerarCodigo() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function buscarUsuario(email) {
  const dados = abaUsuarios().getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][1]).toLowerCase() === String(email).toLowerCase()) {
      return {
        linha: i + 1, nome: dados[i][0], email: dados[i][1], senhaHash: dados[i][2], salt: dados[i][3],
        confirmado: dados[i][4], codigo: dados[i][5], codigoExpira: dados[i][6], foto: dados[i][8] || "",
        googleRefreshToken: dados[i][9] || "", googleEmail: dados[i][10] || "",
      };
    }
  }
  return null;
}

function cadastrar(dados) {
  const { nome, email, senha } = dados;
  if (!nome || !email || !senha) return { ok: false, erro: "Preencha nome, e-mail e senha." };
  if (senha.length < 6) return { ok: false, erro: "A senha precisa ter pelo menos 6 caracteres." };

  const existente = buscarUsuario(email);
  if (existente && existente.confirmado) return { ok: false, erro: "Já existe uma conta confirmada com esse e-mail." };

  const salt = gerarSalt();
  const senhaHash = hashSenha(senha, salt);
  const codigo = gerarCodigo();
  const expira = new Date(Date.now() + CODIGO_VALIDADE_MIN * 60000).toISOString();

  const aba = abaUsuarios();
  if (existente) {
    aba.getRange(existente.linha, 1, 1, 7).setValues([[nome, email, senhaHash, salt, false, codigo, expira]]);
  } else {
    aba.appendRow([nome, email, senhaHash, salt, false, codigo, expira, new Date()]);
  }

  enviarEmailConfirmacao(email, nome, codigo);
  return { ok: true, mensagem: "Cadastro recebido. Confira seu e-mail para o código de confirmação." };
}

function enviarEmailConfirmacao(email, nome, codigo) {
  const assunto = `Confirme seu e-mail — ${NOME_APP}`;
  const corpo =
    `Olá, ${nome}!\n\nSeu código de confirmação do ${NOME_APP} é:\n\n   ${codigo}\n\n` +
    `Digite esse código na tela de confirmação do app. Ele vale por ${CODIGO_VALIDADE_MIN} minutos.\n\n` +
    `Se você não pediu esse cadastro, pode ignorar este e-mail.`;
  MailApp.sendEmail(email, assunto, corpo);
}

function confirmarEmail(dados) {
  const { email, codigo } = dados;
  const usuario = buscarUsuario(email);
  if (!usuario) return { ok: false, erro: "E-mail não encontrado." };
  if (usuario.confirmado) return { ok: true, mensagem: "E-mail já confirmado." };
  if (String(usuario.codigo) !== String(codigo)) return { ok: false, erro: "Código incorreto." };
  if (new Date(usuario.codigoExpira) < new Date()) return { ok: false, erro: "Código expirado. Peça um novo." };

  abaUsuarios().getRange(usuario.linha, 5).setValue(true);
  return { ok: true, mensagem: "E-mail confirmado com sucesso!" };
}

function reenviarCodigo(dados) {
  const { email } = dados;
  const usuario = buscarUsuario(email);
  if (!usuario) return { ok: false, erro: "E-mail não encontrado." };
  if (usuario.confirmado) return { ok: false, erro: "Essa conta já está confirmada." };

  const codigo = gerarCodigo();
  const expira = new Date(Date.now() + CODIGO_VALIDADE_MIN * 60000).toISOString();
  abaUsuarios().getRange(usuario.linha, 6, 1, 2).setValues([[codigo, expira]]);
  enviarEmailConfirmacao(email, usuario.nome, codigo);
  return { ok: true, mensagem: "Novo código enviado." };
}

function login(dados) {
  const { email, senha } = dados;
  const usuario = buscarUsuario(email);
  if (!usuario) return { ok: false, erro: "E-mail ou senha incorretos." };
  if (!usuario.confirmado) return { ok: false, erro: "Confirme seu e-mail antes de entrar.", precisaConfirmar: true };

  const senhaHash = hashSenha(senha, usuario.salt);
  if (senhaHash !== usuario.senhaHash) return { ok: false, erro: "E-mail ou senha incorretos." };

  return { ok: true, nome: usuario.nome, email: usuario.email, foto: usuario.foto || "" };
}

function atualizarPerfil(dados) {
  const { email, senhaAtual, novoNome, novaSenha } = dados;
  const usuario = buscarUsuario(email);
  if (!usuario) return { ok: false, erro: "E-mail não encontrado." };

  const hashAtual = hashSenha(senhaAtual, usuario.salt);
  if (hashAtual !== usuario.senhaHash) return { ok: false, erro: "Senha atual incorreta." };

  const aba = abaUsuarios();
  const nomeFinal = novoNome && novoNome.trim() ? novoNome.trim() : usuario.nome;
  aba.getRange(usuario.linha, 1).setValue(nomeFinal);

  if (novaSenha) {
    if (novaSenha.length < 6) return { ok: false, erro: "A nova senha precisa ter pelo menos 6 caracteres." };
    const novoSalt = gerarSalt();
    const novoHash = hashSenha(novaSenha, novoSalt);
    aba.getRange(usuario.linha, 3, 1, 2).setValues([[novoHash, novoSalt]]);
  }

  return { ok: true, nome: nomeFinal };
}

// Atualiza só a foto do perfil — não pede senha (o app já confia na sessão logada), igual ao
// Custódia Digital faz com "update_photo".
function atualizarFoto(dados) {
  const { email, foto } = dados;
  const usuario = buscarUsuario(email);
  if (!usuario) return { ok: false, erro: "E-mail não encontrado." };
  abaUsuarios().getRange(usuario.linha, 9).setValue(foto || "");
  return { ok: true };
}

/* ======================================================================================
 * Conexão permanente com o Google Drive/Sheets da PRÓPRIA pessoa (não deste backend).
 *
 * O front-end nunca guarda nem renova nenhum token do Google sozinho: a única vez que a tela
 * de autorização do Google aparece é quando a pessoa clica em "Conectar Google" no app, o que
 * gera um "código de autorização" de uso único. Esse código chega aqui em conectarGoogle(), é
 * trocado por um access_token (curta duração) + um refresh_token (permanente, só expira se a
 * pessoa revogar o acesso), e o refresh_token fica guardado nesta planilha junto da conta —
 * exatamente como já guardamos a senha. A partir daí, toda vez que o app precisar ler ou
 * escrever na planilha pessoal da pessoa no Drive dela, quem faz isso é este backend (usando o
 * refresh_token para gerar um access_token novo na hora), nunca o navegador. Por isso reabrir o
 * app, trocar de aparelho ou fazer login de novo NUNCA aciona nada do Google.
 * ====================================================================================== */

function segredoGoogle() {
  const segredo = PropertiesService.getScriptProperties().getProperty("GOOGLE_CLIENT_SECRET");
  if (!segredo) throw new Error("GOOGLE_CLIENT_SECRET não configurado nas Propriedades do Script.");
  return segredo;
}

// Função "isca": não é chamada por nada, serve só para você rodar manualmente uma vez pelo editor
// (menu de funções ao lado do botão "Executar") e forçar a tela "Autorização necessária" a aparecer,
// pedindo a permissão de "se conectar a um serviço externo" que o restante do código já usa. Depois de
// autorizar uma vez, pode deixar essa função aqui parada — ela não afeta nada do app.
function autorizarChamadasExternas() {
  UrlFetchApp.fetch("https://www.google.com");
}

// Faz uma chamada autenticada (com o access_token da PESSOA, não do backend) à API do Google
// Sheets/Drive, e devolve o JSON já decodificado.
function googleFetch(url, accessToken, method, payload) {
  const options = {
    method: method || "get",
    headers: { Authorization: "Bearer " + accessToken },
    muteHttpExceptions: true,
  };
  if (payload !== undefined) {
    options.contentType = "application/json";
    options.payload = JSON.stringify(payload);
  }
  const resp = UrlFetchApp.fetch(url, options);
  const codigo = resp.getResponseCode();
  const texto = resp.getContentText();
  const corpo = texto ? JSON.parse(texto) : {};
  if (codigo >= 300) {
    throw new Error("Google API " + codigo + ": " + (corpo.error && corpo.error.message || texto));
  }
  return corpo;
}

// Troca o código de autorização (do clique em "Conectar Google") por tokens. redirect_uri é o valor
// especial "postmessage", usado pelo Google quando o código veio do fluxo de popup do JS (não de um
// redirecionamento de página de verdade).
function trocarCodigoPorTokens(code) {
  const resp = UrlFetchApp.fetch(GOOGLE_TOKEN_URL, {
    method: "post",
    payload: {
      code: code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: segredoGoogle(),
      redirect_uri: "postmessage",
      grant_type: "authorization_code",
    },
    muteHttpExceptions: true,
  });
  const dados = JSON.parse(resp.getContentText());
  if (!dados.access_token) {
    throw new Error(dados.error_description || dados.error || "Não foi possível conectar ao Google.");
  }
  return dados; // { access_token, refresh_token, expires_in, ... }
}

// Usa o refresh_token guardado para gerar um access_token novo, válido por ~1h.
function renovarAccessTokenGoogle(refreshToken) {
  const resp = UrlFetchApp.fetch(GOOGLE_TOKEN_URL, {
    method: "post",
    payload: {
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: segredoGoogle(),
      grant_type: "refresh_token",
    },
    muteHttpExceptions: true,
  });
  const dados = JSON.parse(resp.getContentText());
  if (!dados.access_token) {
    throw new Error("Não foi possível renovar o acesso ao Google. Pode ser necessário conectar de novo.");
  }
  return dados.access_token;
}

// Devolve { id, accessToken } da planilha "NutriTrack Dados" na conta do Google da PESSOA (cria se
// ainda não existir). O ID fica em cache nas Propriedades do Script para não precisar buscar no Drive
// toda vez.
// Verifica quais das 3 abas (Refeicoes, Metas, Medidas) já existem na planilha da pessoa e cria (com
// cabeçalho) só as que ainda faltarem. Isso cobre o caso de uma planilha criada antes de alguma dessas
// abas existir no código (ex.: pessoa conectou o Google antes da função de medidas ser adicionada).
function garantirAbasPlanilhaUsuario(id, accessToken) {
  const definicoes = {
    Refeicoes: ["id", "date", "name", "description", "time", "calories", "protein", "carbs", "fat", "fiber", "detected"],
    Metas: ["calories", "protein", "carbs", "fat", "fiber", "altura"],
    Medidas: ["id", "date", "time", "tipo", "valor"],
  };
  const meta = googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "?fields=sheets.properties.title", accessToken);
  const existentes = (meta.sheets || []).map(function (s) { return s.properties.title; });
  const faltando = Object.keys(definicoes).filter(function (nome) { return existentes.indexOf(nome) === -1; });
  if (!faltando.length) return;

  googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + ":batchUpdate", accessToken, "post", {
    requests: faltando.map(function (nome) { return { addSheet: { properties: { title: nome } } }; }),
  });
  faltando.forEach(function (nome) {
    const ultimaColuna = String.fromCharCode(64 + definicoes[nome].length);
    googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/" + nome + "!A1:" + ultimaColuna + "1?valueInputOption=RAW", accessToken, "put",
      { values: [definicoes[nome]] });
  });
}

function planilhaUsuarioGoogle(usuario) {
  if (!usuario.googleRefreshToken) throw new Error("Conta não conectada ao Google.");
  const accessToken = renovarAccessTokenGoogle(usuario.googleRefreshToken);
  const props = PropertiesService.getScriptProperties();
  const chaveCache = "SPREADSHEET_" + usuario.email.toLowerCase();
  let id = props.getProperty(chaveCache);
  if (id) {
    garantirAbasPlanilhaUsuario(id, accessToken);
    return { id: id, accessToken: accessToken };
  }

  const query = encodeURIComponent("name='" + GOOGLE_SPREADSHEET_TITLE + "' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  const lista = googleFetch("https://www.googleapis.com/drive/v3/files?q=" + query + "&fields=files(id,name)", accessToken);
  if (lista.files && lista.files.length) {
    id = lista.files[0].id;
    garantirAbasPlanilhaUsuario(id, accessToken);
  } else {
    const criada = googleFetch("https://sheets.googleapis.com/v4/spreadsheets", accessToken, "post", {
      properties: { title: GOOGLE_SPREADSHEET_TITLE },
      sheets: [{ properties: { title: "Refeicoes" } }, { properties: { title: "Metas" } }, { properties: { title: "Medidas" } }],
    });
    id = criada.spreadsheetId;
    googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Refeicoes!A1:K1?valueInputOption=RAW", accessToken, "put",
      { values: [["id", "date", "name", "description", "time", "calories", "protein", "carbs", "fat", "fiber", "detected"]] });
    googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Metas!A1:F1?valueInputOption=RAW", accessToken, "put",
      { values: [["calories", "protein", "carbs", "fat", "fiber", "altura"]] });
    googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Medidas!A1:E1?valueInputOption=RAW", accessToken, "put",
      { values: [["id", "date", "time", "tipo", "valor"]] });
  }
  props.setProperty(chaveCache, id);
  return { id: id, accessToken: accessToken };
}

function conectarGoogle(dados) {
  const { email, code } = dados;
  const usuario = buscarUsuario(email);
  if (!usuario) return { ok: false, erro: "Usuário não encontrado." };
  try {
    const tokens = trocarCodigoPorTokens(code);
    const perfil = googleFetch("https://www.googleapis.com/oauth2/v3/userinfo", tokens.access_token);
    const aba = abaUsuarios();
    if (tokens.refresh_token) aba.getRange(usuario.linha, 10).setValue(tokens.refresh_token);
    aba.getRange(usuario.linha, 11).setValue(perfil.email || "");
    // Limpa o cache de planilha (se a pessoa reconectar com outra conta Google, deve procurar de novo).
    PropertiesService.getScriptProperties().deleteProperty("SPREADSHEET_" + usuario.email.toLowerCase());
    const usuarioAtualizado = buscarUsuario(email);
    const dadosCarregados = carregarDadosGoogleInterno(usuarioAtualizado);
    return Object.assign({ ok: true, googleEmail: perfil.email || "" }, dadosCarregados);
  } catch (err) {
    return { ok: false, erro: "Não foi possível conectar ao Google: " + err.message };
  }
}

function desconectarGoogle(dados) {
  const { email } = dados;
  const usuario = buscarUsuario(email);
  if (!usuario) return { ok: false, erro: "Usuário não encontrado." };
  if (usuario.googleRefreshToken) {
    try {
      UrlFetchApp.fetch(GOOGLE_REVOKE_URL + "?token=" + encodeURIComponent(usuario.googleRefreshToken), { method: "post", muteHttpExceptions: true });
    } catch (err) { /* revogação é best-effort — mesmo se falhar, removemos o token salvo abaixo */ }
  }
  const aba = abaUsuarios();
  aba.getRange(usuario.linha, 10, 1, 2).setValues([["", ""]]);
  PropertiesService.getScriptProperties().deleteProperty("SPREADSHEET_" + usuario.email.toLowerCase());
  return { ok: true };
}

function carregarDadosGoogleInterno(usuario) {
  const { id, accessToken } = planilhaUsuarioGoogle(usuario);
  const mealsRes = googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Refeicoes!A2:K10000", accessToken);
  const goalsRes = googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Metas!A2:F2", accessToken);
  const medidasRes = googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Medidas!A2:E10000", accessToken);
  const meals = (mealsRes.values || []).map(r => ({
    id: Number(r[0]), date: r[1] || "", name: r[2] || "", description: r[3] || "", time: r[4] || "",
    calories: Number(r[5]) || 0, protein: Number(r[6]) || 0, carbs: Number(r[7]) || 0, fat: Number(r[8]) || 0, fiber: Number(r[9]) || 0,
    detected: String(r[10] || "").split(";").filter(Boolean),
  })).filter(m => m.id && m.date);
  const goalsRow = goalsRes.values && goalsRes.values[0];
  const goals = goalsRow ? { calories: Number(goalsRow[0]) || 0, protein: Number(goalsRow[1]) || 0, carbs: Number(goalsRow[2]) || 0, fat: Number(goalsRow[3]) || 0, fiber: Number(goalsRow[4]) || 0 } : null;
  const altura = goalsRow && goalsRow[5] ? Number(goalsRow[5]) || null : null;
  const medidas = (medidasRes.values || []).map(r => ({ id: Number(r[0]), date: r[1] || "", time: r[2] || "", tipo: r[3] || "", valor: r[4] || "" })).filter(m => m.id && m.date && m.tipo);
  return { meals, goals, altura, medidas };
}

function carregarDadosGoogle(dados) {
  const { email } = dados;
  const usuario = buscarUsuario(email);
  if (!usuario || !usuario.googleRefreshToken) return { ok: false, erro: "Conta não conectada ao Google." };
  try {
    const resultado = carregarDadosGoogleInterno(usuario);
    return Object.assign({ ok: true, googleEmail: usuario.googleEmail || "" }, resultado);
  } catch (err) {
    return { ok: false, erro: "Não foi possível carregar os dados do Google agora." };
  }
}

function salvarRefeicaoGoogle(dados) {
  const { email, refeicao } = dados;
  const usuario = buscarUsuario(email);
  if (!usuario || !usuario.googleRefreshToken) return { ok: false };
  try {
    const { id, accessToken } = planilhaUsuarioGoogle(usuario);
    const linha = [refeicao.id, refeicao.date, refeicao.name, refeicao.description, refeicao.time, refeicao.calories, refeicao.protein, refeicao.carbs, refeicao.fat, refeicao.fiber, (refeicao.detected || []).join(";")];
    googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Refeicoes!A2:append?valueInputOption=RAW", accessToken, "post", { values: [linha] });
    return { ok: true };
  } catch (err) { return { ok: false, erro: String(err) }; }
}

function removerRefeicaoGoogle(dados) {
  const { email, id: idRefeicao } = dados;
  const usuario = buscarUsuario(email);
  if (!usuario || !usuario.googleRefreshToken) return { ok: false };
  try {
    const { id, accessToken } = planilhaUsuarioGoogle(usuario);
    const atuais = googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Refeicoes!A2:K10000", accessToken);
    const linhas = (atuais.values || []).filter(r => Number(r[0]) !== Number(idRefeicao));
    googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Refeicoes!A2:K10000:clear", accessToken, "post", {});
    if (linhas.length) googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Refeicoes!A2?valueInputOption=RAW", accessToken, "put", { values: linhas });
    return { ok: true };
  } catch (err) { return { ok: false, erro: String(err) }; }
}

function zerarHojeGoogle(dados) {
  const { email, date } = dados;
  const usuario = buscarUsuario(email);
  if (!usuario || !usuario.googleRefreshToken) return { ok: false };
  try {
    const { id, accessToken } = planilhaUsuarioGoogle(usuario);
    const atuais = googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Refeicoes!A2:K10000", accessToken);
    const linhas = (atuais.values || []).filter(r => String(r[1]) !== String(date));
    googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Refeicoes!A2:K10000:clear", accessToken, "post", {});
    if (linhas.length) googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Refeicoes!A2?valueInputOption=RAW", accessToken, "put", { values: linhas });
    return { ok: true };
  } catch (err) { return { ok: false, erro: String(err) }; }
}

function atualizarMetasGoogle(dados) {
  const { email, goals, altura } = dados;
  const usuario = buscarUsuario(email);
  if (!usuario || !usuario.googleRefreshToken) return { ok: false };
  try {
    const { id, accessToken } = planilhaUsuarioGoogle(usuario);
    googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Metas!A2:F2?valueInputOption=RAW", accessToken, "put",
      { values: [[goals.calories, goals.protein, goals.carbs, goals.fat, goals.fiber, altura || ""]] });
    return { ok: true };
  } catch (err) { return { ok: false, erro: String(err) }; }
}

function salvarMedidaGoogle(dados) {
  const { email, medida } = dados;
  const usuario = buscarUsuario(email);
  if (!usuario || !usuario.googleRefreshToken) return { ok: false };
  try {
    const { id, accessToken } = planilhaUsuarioGoogle(usuario);
    const linha = [medida.id, medida.date, medida.time, medida.tipo, medida.valor];
    googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Medidas!A2:append?valueInputOption=RAW", accessToken, "post", { values: [linha] });
    return { ok: true };
  } catch (err) { return { ok: false, erro: String(err) }; }
}

function removerMedidaGoogle(dados) {
  const { email, id: idMedida } = dados;
  const usuario = buscarUsuario(email);
  if (!usuario || !usuario.googleRefreshToken) return { ok: false };
  try {
    const { id, accessToken } = planilhaUsuarioGoogle(usuario);
    const atuais = googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Medidas!A2:E10000", accessToken);
    const linhas = (atuais.values || []).filter(r => Number(r[0]) !== Number(idMedida));
    googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Medidas!A2:E10000:clear", accessToken, "post", {});
    if (linhas.length) googleFetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/Medidas!A2?valueInputOption=RAW", accessToken, "put", { values: linhas });
    return { ok: true };
  } catch (err) { return { ok: false, erro: String(err) }; }
}
