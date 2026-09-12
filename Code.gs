// ===== CONFIGURAÇÃO =====
const ABA_USUARIOS = "Usuarios";
const ABA_REFEICOES = "Refeicoes";
const ABA_METAS = "Metas";
const NOME_APP = "NutriTrack";
const CODIGO_VALIDADE_MIN = 30;

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
      case "pullDados": return responder(pullDados(dados));
      case "pushDados": return responder(pushDados(dados));
      default: return responder({ ok: false, erro: "Ação desconhecida." });
    }
  } catch (err) {
    return responder({ ok: false, erro: String(err) });
  }
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// A planilha é criada automaticamente, na primeira vez que for necessária, na conta que executa o
// script (a mesma da implantação, em "Executar como"). O ID dela fica guardado nas Propriedades do
// Script, então não precisa configurar nenhum ID de planilha manualmente. Isso evita o erro "You do
// not have permission to access the requested document", que acontece quando a planilha pertence a
// uma conta do Google diferente da que roda o script.
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
function abaRefeicoes() { return planilha().getSheetByName(ABA_REFEICOES); }
function abaMetas() { return planilha().getSheetByName(ABA_METAS); }

// Cria as abas e cabeçalhos automaticamente na primeira execução, se ainda não existirem.
function garantirEstrutura() {
  const ss = planilha();
  const definicoes = {};
  definicoes[ABA_USUARIOS] = ["nome", "email", "senhaHash", "salt", "confirmado", "codigo", "codigoExpira", "criadoEm", "fotoBase64"];
  definicoes[ABA_REFEICOES] = ["email", "id", "date", "name", "description", "time", "calories", "protein", "carbs", "fat", "fiber", "detected"];
  definicoes[ABA_METAS] = ["email", "calories", "protein", "carbs", "fat", "fiber"];

  Object.keys(definicoes).forEach(function (nomeAba) {
    var aba = ss.getSheetByName(nomeAba);
    if (!aba) {
      aba = ss.insertSheet(nomeAba);
      aba.getRange(1, 1, 1, definicoes[nomeAba].length).setValues([definicoes[nomeAba]]);
      aba.setFrozenRows(1);
    }
  });

  // Migração: planilhas criadas antes da coluna de foto existir ganham a coluna agora.
  var abaUsu = ss.getSheetByName(ABA_USUARIOS);
  if (abaUsu.getRange(1, 9).getValue() !== "fotoBase64") {
    abaUsu.getRange(1, 9).setValue("fotoBase64");
  }

  var sheets = ss.getSheets();
  if (sheets.length > 3) {
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
      return { linha: i + 1, nome: dados[i][0], email: dados[i][1], senhaHash: dados[i][2], salt: dados[i][3], confirmado: dados[i][4], codigo: dados[i][5], codigoExpira: dados[i][6], foto: dados[i][8] || "" };
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

function pullDados(dados) {
  const { email } = dados;
  const linhasR = abaRefeicoes().getDataRange().getValues();
  const meals = [];
  for (let i = 1; i < linhasR.length; i++) {
    const l = linhasR[i];
    if (String(l[0]).toLowerCase() === String(email).toLowerCase()) {
      meals.push({ id: l[1], date: l[2], name: l[3], description: l[4], time: l[5], calories: l[6], protein: l[7], carbs: l[8], fat: l[9], fiber: l[10], detected: String(l[11] || "").split(";").filter(Boolean) });
    }
  }

  const linhasM = abaMetas().getDataRange().getValues();
  let goals = null;
  for (let i = 1; i < linhasM.length; i++) {
    const l = linhasM[i];
    if (String(l[0]).toLowerCase() === String(email).toLowerCase()) {
      goals = { calories: l[1], protein: l[2], carbs: l[3], fat: l[4], fiber: l[5] };
      break;
    }
  }

  return { ok: true, meals, goals };
}

function pushDados(dados) {
  const { email, meals, goals } = dados;

  const abaR = abaRefeicoes();
  const linhasR = abaR.getDataRange().getValues();
  for (let i = linhasR.length - 1; i >= 1; i--) {
    if (String(linhasR[i][0]).toLowerCase() === String(email).toLowerCase()) abaR.deleteRow(i + 1);
  }
  (meals || []).forEach(m => {
    abaR.appendRow([email, m.id, m.date, m.name, m.description, m.time, m.calories, m.protein, m.carbs, m.fat, m.fiber, (m.detected || []).join(";")]);
  });

  const abaM = abaMetas();
  const linhasM = abaM.getDataRange().getValues();
  let linhaExistente = -1;
  for (let i = 1; i < linhasM.length; i++) {
    if (String(linhasM[i][0]).toLowerCase() === String(email).toLowerCase()) { linhaExistente = i + 1; break; }
  }
  const linhaGoals = [email, goals.calories, goals.protein, goals.carbs, goals.fat, goals.fiber];
  if (linhaExistente > 0) abaM.getRange(linhaExistente, 1, 1, 6).setValues([linhaGoals]);
  else abaM.appendRow(linhaGoals);

  return { ok: true };
}
