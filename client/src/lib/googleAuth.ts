// Login com Google (OAuth) usando Google Identity Services (GIS).
// O Client ID de app Web NÃO é segredo — ele é protegido pelas
// "Origens JavaScript autorizadas" configuradas no Google Cloud Console,
// por isso pode ficar direto no código do front-end.
export const GOOGLE_CLIENT_ID =
  "324458100746-em71t2toc30d96up3adov613eljubt6h.apps.googleusercontent.com";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

type TokenResponse = { access_token?: string; error?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: unknown) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

let tokenClient: TokenClient | null = null;
let currentToken: string | null = null;

function waitForGis(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (window.google?.accounts?.oauth2) resolve();
      else setTimeout(check, 150);
    };
    check();
  });
}

async function ensureClient(onToken: (token: string | null) => void) {
  await waitForGis();
  tokenClient = window.google!.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: GOOGLE_SCOPES,
    callback: (response) => {
      currentToken = response.access_token || null;
      onToken(currentToken);
    },
    error_callback: () => onToken(null),
  });
  return tokenClient;
}

// Pede login com a tela de consentimento do Google (clique do usuário).
export function signIn(): Promise<string | null> {
  return new Promise((resolve) => {
    ensureClient((token) => resolve(token)).then((client) => {
      client.requestAccessToken({ prompt: "consent" });
    });
  });
}

// Tenta renovar a sessão sem mostrar nada na tela (usado ao abrir o app).
export function signInSilently(): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (token: string | null) => {
      if (settled) return;
      settled = true;
      resolve(token);
    };
    ensureClient((token) => finish(token)).then((client) => {
      client.requestAccessToken({ prompt: "" });
      setTimeout(() => finish(currentToken), 4000);
    });
  });
}

export function getToken() {
  return currentToken;
}

export function signOut() {
  currentToken = null;
}
