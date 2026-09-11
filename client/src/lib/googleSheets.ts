import { getToken } from "./googleAuth";

const SHEET_MEALS = "Refeicoes";
const SHEET_GOALS = "Metas";
const SPREADSHEET_TITLE = "NutriTrack Dados";

type Nutrients = { calories: number; protein: number; carbs: number; fat: number; fiber: number };
type Meal = Nutrients & { id: number; date: string; name: string; description: string; time: string; detected: string[] };

async function apiFetch(url: string, options: RequestInit = {}) {
  const token = getToken();
  if (!token) throw new Error("Sem sessão do Google ativa.");
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google API ${response.status}: ${text}`);
  }
  return response.status === 204 ? null : response.json();
}

export async function fetchProfile(): Promise<{ email: string; name: string; picture?: string }> {
  return apiFetch("https://www.googleapis.com/oauth2/v3/userinfo");
}

// Procura a planilha "NutriTrack Dados" no Drive do usuário; cria se não existir.
export async function findOrCreateSpreadsheet(cacheKey: string): Promise<string> {
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached;

  const query = encodeURIComponent(
    `name='${SPREADSHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
  );
  const list = await apiFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`);
  if (list?.files?.length) {
    localStorage.setItem(cacheKey, list.files[0].id);
    return list.files[0].id;
  }

  const created = await apiFetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    body: JSON.stringify({
      properties: { title: SPREADSHEET_TITLE },
      sheets: [{ properties: { title: SHEET_MEALS } }, { properties: { title: SHEET_GOALS } }],
    }),
  });
  const id = created.spreadsheetId as string;

  await apiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${SHEET_MEALS}!A1:K1?valueInputOption=RAW`,
    {
      method: "PUT",
      body: JSON.stringify({
        values: [["id", "date", "name", "description", "time", "calories", "protein", "carbs", "fat", "fiber", "detected"]],
      }),
    }
  );
  await apiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${SHEET_GOALS}!A1:E1?valueInputOption=RAW`,
    {
      method: "PUT",
      body: JSON.stringify({ values: [["calories", "protein", "carbs", "fat", "fiber"]] }),
    }
  );

  localStorage.setItem(cacheKey, id);
  return id;
}

export async function pullData(spreadsheetId: string): Promise<{ meals: Meal[]; goals: Nutrients | null }> {
  const [mealsRes, goalsRes] = await Promise.all([
    apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_MEALS}!A2:K10000`),
    apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_GOALS}!A2:E2`),
  ]);

  const meals: Meal[] = (mealsRes?.values || [])
    .map((row: string[]) => ({
      id: Number(row[0]),
      date: row[1] || "",
      name: row[2] || "",
      description: row[3] || "",
      time: row[4] || "",
      calories: Number(row[5]) || 0,
      protein: Number(row[6]) || 0,
      carbs: Number(row[7]) || 0,
      fat: Number(row[8]) || 0,
      fiber: Number(row[9]) || 0,
      detected: (row[10] || "").split(";").filter(Boolean),
    }))
    .filter((meal: Meal) => meal.id && meal.date);

  const goalsRow = goalsRes?.values?.[0];
  const goals = goalsRow
    ? {
        calories: Number(goalsRow[0]) || 0,
        protein: Number(goalsRow[1]) || 0,
        carbs: Number(goalsRow[2]) || 0,
        fat: Number(goalsRow[3]) || 0,
        fiber: Number(goalsRow[4]) || 0,
      }
    : null;

  return { meals, goals };
}

export async function pushData(spreadsheetId: string, meals: Meal[], goals: Nutrients) {
  const mealRows = meals.map((meal) => [
    meal.id,
    meal.date,
    meal.name,
    meal.description,
    meal.time,
    meal.calories,
    meal.protein,
    meal.carbs,
    meal.fat,
    meal.fiber,
    (meal.detected || []).join(";"),
  ]);

  await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_MEALS}!A2:K10000:clear`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (mealRows.length) {
    await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_MEALS}!A2?valueInputOption=RAW`,
      { method: "PUT", body: JSON.stringify({ values: mealRows }) }
    );
  }

  await apiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_GOALS}!A2:E2?valueInputOption=RAW`,
    {
      method: "PUT",
      body: JSON.stringify({ values: [[goals.calories, goals.protein, goals.carbs, goals.fat, goals.fiber]] }),
    }
  );
}
