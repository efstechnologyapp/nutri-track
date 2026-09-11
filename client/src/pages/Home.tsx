import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Activity, ArrowDownRight, ArrowUpRight, CalendarDays, Check, ChevronDown,
  CircleHelp, Clock3, Droplets, Flame, History, Leaf, LogIn, Plus, RotateCcw,
  Settings2, Sparkles, Trash2, Utensils, Wheat, X
} from "lucide-react";
import { signIn, signInSilently, signOut } from "@/lib/googleAuth";
import { fetchProfile, findOrCreateSpreadsheet, pullData, pushData } from "@/lib/googleSheets";

type NutrientKey = "calories" | "protein" | "carbs" | "fat" | "fiber";
type Nutrients = Record<NutrientKey, number>;
type Meal = Nutrients & { id: number; date: string; name: string; description: string; time: string; detected: string[] };
type DetectedFood = { label: string; amount: string; values: Nutrients };

const nutrientMeta: Record<NutrientKey, { label: string; unit: string; color: string; soft: string; icon: typeof Flame }> = {
  calories: { label: "Calorias", unit: "kcal", color: "#eb7a55", soft: "#fff0e9", icon: Flame },
  protein: { label: "Proteína", unit: "g", color: "#5b8c78", soft: "#e9f3ed", icon: Activity },
  carbs: { label: "Carboidratos", unit: "g", color: "#d29a45", soft: "#fff5df", icon: Wheat },
  fat: { label: "Gorduras", unit: "g", color: "#b27691", soft: "#f8edf2", icon: Droplets },
  fiber: { label: "Fibras", unit: "g", color: "#71945c", soft: "#eef5e9", icon: Leaf },
};
const defaultGoals: Nutrients = { calories: 1600, protein: 150, carbs: 130, fat: 53, fiber: 30 };
const emptyNutrients: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}
const todayKey = () => new Date().toISOString().slice(0, 10);
const formatNumber = (value: number, digits = 0) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
const pct = (value: number, goal: number) => goal ? Math.min(100, Math.max(0, (value / goal) * 100)) : 0;
const addNutrients = (a: Nutrients, b: Nutrients): Nutrients => ({ calories: a.calories + b.calories, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat, fiber: a.fiber + b.fiber });
const scale = (values: Nutrients, multiplier: number): Nutrients => Object.fromEntries((Object.keys(values) as NutrientKey[]).map((key) => [key, values[key] * multiplier])) as Nutrients;

const foodLibrary: { terms: string[]; label: string; baseAmount: string; values: Nutrients; grams?: number; ml?: number; count?: number }[] = [
  // Pães, massas e carboidratos
  { terms: ["pao frances", "pao de sal", "pao frances comum"], label: "Pão francês", baseAmount: "1 unidade (50 g)", values: { calories: 135, protein: 4.5, carbs: 28, fat: 1.5, fiber: 1.2 }, grams: 50 },
  { terms: ["pao de forma tradicional", "pao de forma"], label: "Pão de forma", baseAmount: "2 fatias (50 g)", values: { calories: 130, protein: 4, carbs: 24, fat: 1.6, fiber: 1.4 }, grams: 50 },
  { terms: ["pao de forma integral", "pao integral"], label: "Pão de forma integral", baseAmount: "2 fatias (50 g)", values: { calories: 120, protein: 5, carbs: 22, fat: 1.6, fiber: 3.2 }, grams: 50 },
  { terms: ["pao de queijo"], label: "Pão de queijo", baseAmount: "1 unidade (30 g)", values: { calories: 100, protein: 2.3, carbs: 9, fat: 6, fiber: 0.2 }, grams: 30 },
  { terms: ["tapioca"], label: "Tapioca", baseAmount: "1 unidade (60 g)", values: { calories: 130, protein: 0.2, carbs: 32, fat: 0.1, fiber: 0.3 }, grams: 60 },
  { terms: ["macarrao cozido", "macarrao", "massa"], label: "Macarrão cozido", baseAmount: "100 g", values: { calories: 158, protein: 5.8, carbs: 31, fat: 0.9, fiber: 1.8 }, grams: 100 },
  { terms: ["batata inglesa", "batata cozida", "batata"], label: "Batata inglesa cozida", baseAmount: "100 g", values: { calories: 87, protein: 1.9, carbs: 20, fat: 0.1, fiber: 1.8 }, grams: 100 },
  { terms: ["batata doce"], label: "Batata doce cozida", baseAmount: "100 g", values: { calories: 86, protein: 1.6, carbs: 20, fat: 0.1, fiber: 3 }, grams: 100 },
  { terms: ["mandioca", "aipim", "macaxeira"], label: "Mandioca cozida", baseAmount: "100 g", values: { calories: 125, protein: 0.6, carbs: 30, fat: 0.3, fiber: 1.6 }, grams: 100 },
  { terms: ["arroz integral"], label: "Arroz integral cozido", baseAmount: "100 g", values: { calories: 124, protein: 2.6, carbs: 25.8, fat: 1, fiber: 2.7 }, grams: 100 },
  { terms: ["arroz branco", "arroz cozido", "arroz"], label: "Arroz branco cozido", baseAmount: "100 g", values: { calories: 130, protein: 2.5, carbs: 28, fat: 0.3, fiber: 0.4 }, grams: 100 },
  { terms: ["aveia em flocos", "aveia"], label: "Aveia em flocos", baseAmount: "2 colheres de sopa (30 g)", values: { calories: 117, protein: 4, carbs: 20, fat: 2.4, fiber: 3 }, grams: 30 },
  { terms: ["granola"], label: "Granola", baseAmount: "30 g", values: { calories: 120, protein: 3, carbs: 19, fat: 4, fiber: 2.5 }, grams: 30 },
  { terms: ["cuscuz"], label: "Cuscuz", baseAmount: "100 g", values: { calories: 112, protein: 2.5, carbs: 23, fat: 0.6, fiber: 1.4 }, grams: 100 },
  // Proteínas
  { terms: ["ovo frito", "ovo de galinha frito", "ovo"], label: "Ovo frito", baseAmount: "1 unidade", values: { calories: 90, protein: 6.3, carbs: 0.4, fat: 7, fiber: 0 }, count: 1 },
  { terms: ["ovo cozido"], label: "Ovo cozido", baseAmount: "1 unidade", values: { calories: 78, protein: 6.3, carbs: 0.6, fat: 5.3, fiber: 0 }, count: 1 },
  { terms: ["omelete"], label: "Omelete", baseAmount: "2 ovos", values: { calories: 190, protein: 13, carbs: 1.5, fat: 15, fiber: 0 }, count: 2 },
  { terms: ["peito de frango", "frango grelhado", "frango"], label: "Peito de frango", baseAmount: "100 g", values: { calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 }, grams: 100 },
  { terms: ["picanha", "picanha bovina"], label: "Picanha", baseAmount: "100 g", values: { calories: 289, protein: 26, carbs: 0, fat: 20, fiber: 0 }, grams: 100 },
  { terms: ["carne moida refogada", "carne moida"], label: "Carne moída refogada", baseAmount: "100 g", values: { calories: 212, protein: 26, carbs: 0, fat: 11, fiber: 0 }, grams: 100 },
  { terms: ["bife de patinho", "carne bovina magra", "patinho"], label: "Bife de patinho grelhado", baseAmount: "100 g", values: { calories: 205, protein: 32, carbs: 0, fat: 8, fiber: 0 }, grams: 100 },
  { terms: ["file de tilapia", "peixe grelhado", "tilapia"], label: "Filé de tilápia grelhado", baseAmount: "100 g", values: { calories: 128, protein: 26, carbs: 0, fat: 2.7, fiber: 0 }, grams: 100 },
  { terms: ["salmao grelhado", "salmao"], label: "Salmão grelhado", baseAmount: "100 g", values: { calories: 208, protein: 22, carbs: 0, fat: 13, fiber: 0 }, grams: 100 },
  { terms: ["atum em lata", "atum"], label: "Atum em lata", baseAmount: "100 g", values: { calories: 116, protein: 26, carbs: 0, fat: 1, fiber: 0 }, grams: 100 },
  { terms: ["camarao cozido", "camarao"], label: "Camarão cozido", baseAmount: "100 g", values: { calories: 99, protein: 24, carbs: 0.2, fat: 0.3, fiber: 0 }, grams: 100 },
  { terms: ["lombo suino", "carne de porco", "lombo assado"], label: "Lombo suíno assado", baseAmount: "100 g", values: { calories: 211, protein: 27, carbs: 0, fat: 11, fiber: 0 }, grams: 100 },
  { terms: ["linguica"], label: "Linguiça", baseAmount: "100 g", values: { calories: 300, protein: 13, carbs: 2, fat: 27, fiber: 0 }, grams: 100 },
  { terms: ["bacon"], label: "Bacon", baseAmount: "30 g", values: { calories: 150, protein: 10, carbs: 0, fat: 12, fiber: 0 }, grams: 30 },
  { terms: ["peito de peru", "presunto de peru"], label: "Peito de peru fatiado", baseAmount: "2 fatias (30 g)", values: { calories: 35, protein: 6, carbs: 1, fat: 1, fiber: 0 }, grams: 30 },
  { terms: ["presunto"], label: "Presunto", baseAmount: "2 fatias (30 g)", values: { calories: 60, protein: 8, carbs: 1, fat: 3, fiber: 0 }, grams: 30 },
  // Laticínios
  { terms: ["queijo minas"], label: "Queijo minas", baseAmount: "30 g", values: { calories: 72, protein: 5.6, carbs: 0.9, fat: 5.4, fiber: 0 }, grams: 30 },
  { terms: ["queijo mussarela", "mussarela", "muçarela"], label: "Queijo mussarela", baseAmount: "30 g", values: { calories: 90, protein: 6.6, carbs: 0.6, fat: 6.9, fiber: 0 }, grams: 30 },
  { terms: ["requeijao"], label: "Requeijão", baseAmount: "1 colher de sopa (20 g)", values: { calories: 55, protein: 1.5, carbs: 1, fat: 5, fiber: 0 }, grams: 20 },
  { terms: ["leite integral", "leite"], label: "Leite integral", baseAmount: "1 copo (200 ml)", values: { calories: 122, protein: 6.4, carbs: 9.6, fat: 6.6, fiber: 0 }, ml: 200 },
  { terms: ["leite desnatado"], label: "Leite desnatado", baseAmount: "1 copo (200 ml)", values: { calories: 70, protein: 6.8, carbs: 9.8, fat: 0.2, fiber: 0 }, ml: 200 },
  { terms: ["iogurte natural", "iogurte"], label: "Iogurte natural", baseAmount: "1 pote (170 g)", values: { calories: 100, protein: 6, carbs: 8, fat: 5, fiber: 0 }, grams: 170 },
  { terms: ["iogurte grego"], label: "Iogurte grego", baseAmount: "100 g", values: { calories: 97, protein: 9, carbs: 4, fat: 5, fiber: 0 }, grams: 100 },
  { terms: ["whey protein", "whey"], label: "Whey protein", baseAmount: "1 dose (30 g)", values: { calories: 120, protein: 24, carbs: 3, fat: 1.5, fiber: 0 }, grams: 30 },
  // Leguminosas e vegetais
  { terms: ["feijao", "feijao cozido"], label: "Feijão cozido", baseAmount: "100 g", values: { calories: 76, protein: 4.8, carbs: 13.6, fat: 0.5, fiber: 8.4 }, grams: 100 },
  { terms: ["lentilha"], label: "Lentilha cozida", baseAmount: "100 g", values: { calories: 116, protein: 9, carbs: 20, fat: 0.4, fiber: 8 }, grams: 100 },
  { terms: ["grao de bico"], label: "Grão de bico cozido", baseAmount: "100 g", values: { calories: 164, protein: 8.9, carbs: 27, fat: 2.6, fiber: 7.6 }, grams: 100 },
  { terms: ["brocolis"], label: "Brócolis cozido", baseAmount: "100 g", values: { calories: 35, protein: 2.8, carbs: 7, fat: 0.4, fiber: 3.3 }, grams: 100 },
  { terms: ["couve refogada", "couve"], label: "Couve refogada", baseAmount: "100 g", values: { calories: 35, protein: 2, carbs: 4, fat: 2, fiber: 3 }, grams: 100 },
  { terms: ["tomate"], label: "Tomate", baseAmount: "1 unidade (100 g)", values: { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2 }, grams: 100 },
  { terms: ["cenoura"], label: "Cenoura crua", baseAmount: "100 g", values: { calories: 41, protein: 0.9, carbs: 10, fat: 0.2, fiber: 2.8 }, grams: 100 },
  { terms: ["alface"], label: "Alface", baseAmount: "50 g", values: { calories: 7, protein: 0.7, carbs: 1.2, fat: 0.1, fiber: 0.7 }, grams: 50 },
  { terms: ["salada mista", "salada"], label: "Salada mista", baseAmount: "100 g", values: { calories: 25, protein: 1.2, carbs: 4, fat: 0.5, fiber: 1.8 }, grams: 100 },
  // Frutas
  { terms: ["banana"], label: "Banana", baseAmount: "1 unidade", values: { calories: 90, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6 }, count: 1 },
  { terms: ["maca"], label: "Maçã", baseAmount: "1 unidade (130 g)", values: { calories: 68, protein: 0.3, carbs: 18, fat: 0.2, fiber: 3 }, count: 1 },
  { terms: ["mamao"], label: "Mamão", baseAmount: "100 g", values: { calories: 40, protein: 0.6, carbs: 10, fat: 0.1, fiber: 1.8 }, grams: 100 },
  { terms: ["morango"], label: "Morango", baseAmount: "100 g", values: { calories: 32, protein: 0.7, carbs: 7.7, fat: 0.3, fiber: 2 }, grams: 100 },
  { terms: ["abacaxi"], label: "Abacaxi", baseAmount: "100 g", values: { calories: 50, protein: 0.5, carbs: 13, fat: 0.1, fiber: 1.4 }, grams: 100 },
  { terms: ["manga"], label: "Manga", baseAmount: "1 unidade (200 g)", values: { calories: 120, protein: 1.6, carbs: 30, fat: 0.6, fiber: 3.4 }, count: 1 },
  { terms: ["melancia"], label: "Melancia", baseAmount: "1 fatia (150 g)", values: { calories: 46, protein: 0.9, carbs: 11, fat: 0.2, fiber: 0.6 }, grams: 150 },
  { terms: ["uva"], label: "Uva", baseAmount: "100 g", values: { calories: 69, protein: 0.7, carbs: 18, fat: 0.2, fiber: 0.9 }, grams: 100 },
  { terms: ["abacate"], label: "Abacate", baseAmount: "100 g", values: { calories: 160, protein: 2, carbs: 8.5, fat: 14.7, fiber: 6.7 }, grams: 100 },
  // Bebidas e outros
  { terms: ["suco de laranja", "suco laranja"], label: "Suco de laranja", baseAmount: "300 ml", values: { calories: 135, protein: 2, carbs: 31, fat: 0.3, fiber: 0.5 }, ml: 300 },
  { terms: ["cafe com leite"], label: "Café com leite", baseAmount: "1 xícara (200 ml)", values: { calories: 60, protein: 3, carbs: 6, fat: 2.5, fiber: 0 }, ml: 200 },
  { terms: ["refrigerante", "coca cola", "coca"], label: "Refrigerante", baseAmount: "1 lata (350 ml)", values: { calories: 140, protein: 0, carbs: 37, fat: 0, fiber: 0 }, ml: 350 },
  { terms: ["cerveja"], label: "Cerveja", baseAmount: "1 lata (350 ml)", values: { calories: 150, protein: 1.6, carbs: 12, fat: 0, fiber: 0 }, ml: 350 },
  { terms: ["agua de coco"], label: "Água de coco", baseAmount: "1 copo (200 ml)", values: { calories: 40, protein: 0.6, carbs: 9, fat: 0.1, fiber: 0 }, ml: 200 },
  { terms: ["chocolate ao leite", "chocolate"], label: "Chocolate ao leite", baseAmount: "1 barra pequena (25 g)", values: { calories: 130, protein: 1.9, carbs: 15, fat: 7.3, fiber: 0.8 }, grams: 25 },
  { terms: ["barra de cereal"], label: "Barra de cereal", baseAmount: "1 unidade (25 g)", values: { calories: 95, protein: 1.3, carbs: 18, fat: 2, fiber: 1.2 }, grams: 25 },
  { terms: ["castanha do para", "castanha"], label: "Castanha-do-pará", baseAmount: "5 unidades (15 g)", values: { calories: 92, protein: 2, carbs: 1.7, fat: 9.3, fiber: 1 }, grams: 15 },
  { terms: ["amendoim"], label: "Amendoim", baseAmount: "30 g", values: { calories: 170, protein: 7.3, carbs: 6, fat: 14.5, fiber: 2.5 }, grams: 30 },
  { terms: ["pipoca"], label: "Pipoca", baseAmount: "30 g", values: { calories: 110, protein: 2.3, carbs: 22, fat: 1.5, fiber: 4 }, grams: 30 },
];

function mergeMeals(local: Meal[], remote: Meal[]): Meal[] {
  const byId = new Map<number, Meal>();
  for (const meal of local) byId.set(meal.id, meal);
  for (const meal of remote) if (!byId.has(meal.id)) byId.set(meal.id, meal);
  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function amountForFood(text: string, position: number, food: typeof foodLibrary[number]) {
  const window = text.slice(Math.max(0, position - 38), position + 12);
  const before = text.slice(Math.max(0, position - 38), position);
  const grams = before.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gramas?|gramos?)\s*(?:de\s*)?$/i);
  const ml = before.match(/(\d+(?:[.,]\d+)?)\s*(?:ml|mililitros?)\s*(?:de\s*)?$/i);
  const units = before.match(/(\d+(?:[.,]\d+)?)\s*(?:unidades?|unid\.?|ovos?|pães?|paes?)\s*(?:de\s*)?$/i);
  const numberOnly = before.match(/(?:^|[\s,;])(?:um|uma|um copo de)?\s*(\d+(?:[.,]\d+)?)\s*$/i);
  const numberWord = /(?:^|[\s,;])(um|uma)\s*$/.test(before);
  const number = (match: RegExpMatchArray | null) => match ? Number(match[1].replace(",", ".")) : null;
  if (food.grams && grams) { const value = number(grams)!; return { multiplier: value / food.grams, amount: `${formatNumber(value, 0)} g` }; }
  if (food.ml && ml) { const value = number(ml)!; return { multiplier: value / food.ml, amount: `${formatNumber(value, 0)} ml` }; }
  if (units) { const value = number(units)!; return { multiplier: value / (food.count || 1), amount: `${formatNumber(value, 0)} unidade${value > 1 ? "s" : ""}` }; }
  if (numberOnly && (food.grams || food.ml)) { const value = number(numberOnly)!; return { multiplier: value / (food.grams || food.ml || 1), amount: `${formatNumber(value, 0)} ${food.grams ? "g" : "ml"}` }; }
  if (numberWord || /\bum\b|\buma\b/.test(before)) return { multiplier: 1, amount: food.baseAmount };
  return { multiplier: 1, amount: food.baseAmount };
}

function detectFoods(description: string): DetectedFood[] {
  const text = normalizeText(description);
  const found: DetectedFood[] = [];
  const occupied: { start: number; end: number }[] = [];
  for (const food of foodLibrary) {
    const term = [...food.terms].sort((a, b) => b.length - a.length).find((candidate) => text.includes(normalizeText(candidate)));
    if (!term) continue;
    const normalizedTerm = normalizeText(term);
    const position = text.indexOf(normalizedTerm);
    if (occupied.some((range) => position >= range.start && position < range.end)) continue;
    const { multiplier, amount } = amountForFood(text, position, food);
    found.push({ label: food.label, amount, values: scale(food.values, multiplier) });
    occupied.push({ start: position, end: position + normalizedTerm.length });
  }
  return found;
}

export default function Home() {
  const [goals, setGoals] = useState<Nutrients>(() => readStorage("nutri-track-goals", defaultGoals));
  const [meals, setMeals] = useState<Meal[]>(() => readStorage("nutri-track-meals", []));
  const [mealName, setMealName] = useState("");
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<DetectedFood[]>([]);
  const [showGoals, setShowGoals] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [account, setAccount] = useState<{ email: string; name: string; picture?: string } | null>(() => readStorage<{ email: string; name: string; picture?: string } | null>("nutri-track-google-account", null));
  const [syncing, setSyncing] = useState(false);
  const spreadsheetIdRef = useRef<string | null>(null);
  const pushTimer = useRef<number | null>(null);
  const today = todayKey();
  const todayMeals = useMemo(() => meals.filter((meal) => meal.date === today), [meals, today]);
  const consumed = useMemo(() => todayMeals.reduce((sum, meal) => addNutrients(sum, meal), emptyNutrients), [todayMeals]);
  const remaining = useMemo(() => Object.fromEntries((Object.keys(goals) as NutrientKey[]).map((key) => [key, goals[key] - consumed[key]])) as Nutrients, [goals, consumed]);
  const mealTotal = useMemo(() => preview.reduce((sum, food) => addNutrients(sum, food.values), emptyNutrients), [preview]);
  const historyDays = useMemo(() => Array.from(new Set(meals.map((meal) => meal.date))).sort().reverse(), [meals]);

  useEffect(() => localStorage.setItem("nutri-track-goals", JSON.stringify(goals)), [goals]);
  useEffect(() => localStorage.setItem("nutri-track-meals", JSON.stringify(meals)), [meals]);

  // Ao abrir o app, tenta retomar a sessão do Google em silêncio (sem popup) se já esteve conectado antes.
  useEffect(() => {
    if (localStorage.getItem("nutri-track-google-connected") !== "1") return;
    (async () => {
      setSyncing(true);
      try {
        const token = await signInSilently();
        if (!token) return;
        const profile = await fetchProfile();
        setAccount(profile);
        localStorage.setItem("nutri-track-google-account", JSON.stringify(profile));
        const spreadsheetId = await findOrCreateSpreadsheet(`nutri-track-sheet-${profile.email}`);
        spreadsheetIdRef.current = spreadsheetId;
        const remote = await pullData(spreadsheetId);
        setMeals((current) => mergeMeals(current, remote.meals));
        if (remote.goals) setGoals(remote.goals);
      } catch {
        // Sem sessão válida agora; o app segue funcionando normalmente offline.
      } finally {
        setSyncing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Envia as alterações para a planilha do Google sempre que meals/goals mudam (com um pequeno atraso).
  useEffect(() => {
    if (!account || !spreadsheetIdRef.current) return;
    if (pushTimer.current) window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => {
      pushData(spreadsheetIdRef.current!, meals, goals).catch(() => {
        toast.error("Não consegui sincronizar com o Google agora. Vou tentar de novo na próxima alteração.");
      });
    }, 1000);
    return () => { if (pushTimer.current) window.clearTimeout(pushTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meals, goals, account]);

  const connectGoogle = async () => {
    setSyncing(true);
    try {
      const token = await signIn();
      if (!token) { toast.error("Não foi possível conectar com o Google."); return; }
      const profile = await fetchProfile();
      const spreadsheetId = await findOrCreateSpreadsheet(`nutri-track-sheet-${profile.email}`);
      spreadsheetIdRef.current = spreadsheetId;
      const remote = await pullData(spreadsheetId);
      const mergedMeals = mergeMeals(meals, remote.meals);
      const mergedGoals = remote.goals || goals;
      setMeals(mergedMeals);
      setGoals(mergedGoals);
      await pushData(spreadsheetId, mergedMeals, mergedGoals);
      setAccount(profile);
      localStorage.setItem("nutri-track-google-account", JSON.stringify(profile));
      localStorage.setItem("nutri-track-google-connected", "1");
      toast.success(`Conectado como ${profile.email}. Seus dados agora sincronizam entre aparelhos.`);
    } catch {
      toast.error("Falha ao conectar com o Google. Tente novamente.");
    } finally {
      setSyncing(false);
    }
  };

  const disconnectGoogle = () => {
    signOut();
    setAccount(null);
    spreadsheetIdRef.current = null;
    localStorage.removeItem("nutri-track-google-connected");
    localStorage.removeItem("nutri-track-google-account");
    toast.success("Desconectado do Google. Seus dados continuam salvos neste aparelho.");
  };

  const analyze = () => {
    if (!description.trim()) { toast.error("Descreva o que você comeu para eu calcular."); return; }
    const found = detectFoods(description);
    setPreview(found);
    if (!found.length) toast.error("Não identifiquei alimentos conhecidos. Tente informar pão, ovo, frango, arroz, patinho, banana ou suco de laranja.");
    else toast.success(`${found.length} alimento${found.length > 1 ? "s" : ""} identificado${found.length > 1 ? "s" : ""}.`);
  };
  const saveMeal = () => {
    if (!mealName.trim()) { toast.error("Informe o nome da refeição."); return; }
    if (!preview.length) { toast.error("Analise a descrição antes de salvar a refeição."); return; }
    const now = new Date();
    setMeals((current) => [...current, { ...mealTotal, id: Date.now(), date: today, name: mealName.trim(), description: description.trim(), detected: preview.map((food) => food.label), time: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) }]);
    setMealName(""); setDescription(""); setPreview([]); toast.success("Refeição registrada no histórico.");
  };
  const clearCurrentDay = () => {
    if (todayMeals.length === 0) return;
    if (!window.confirm("Apagar todas as refeições registradas hoje? O histórico de dias anteriores será mantido.")) return;
    setMeals((current) => current.filter((meal) => meal.date !== today));
    toast.success("Os registros de hoje foram removidos; o histórico anterior foi preservado.");
  };
  const updateGoal = (key: NutrientKey, value: string) => setGoals((current) => ({ ...current, [key]: Math.max(0, Number(value) || 0) }));
  const dateLabel = (date: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`));

  return <div className="min-h-screen bg-[#f8f7f2] text-[#18352d]"><div className="mx-auto max-w-[1440px] px-5 pb-14 sm:px-8 lg:px-12">
    <header className="flex items-center justify-between py-6 lg:py-8"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1c4d3e] text-[#e7f5c7] shadow-[0_8px_24px_rgba(28,77,62,0.18)]"><Leaf size={21} /></div><div><div className="font-display text-xl font-semibold tracking-[-0.03em]">Nutri<span className="text-[#78a55b]">Track</span></div><div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#779087]">seu dia, no seu ritmo</div></div></div><div className="flex items-center gap-2 sm:gap-3">{account ? <button className="hidden items-center gap-2 rounded-full border border-[#cde4bd] bg-[#eef6e4] px-4 py-2.5 text-sm font-medium text-[#4b7048] transition hover:bg-[#e3f0d6] sm:flex" onClick={disconnectGoogle} title="Clique para desconectar"><Check size={15} /> {account.email}</button> : <button className="hidden items-center gap-2 rounded-full border border-[#dce5db] bg-white/70 px-4 py-2.5 text-sm font-medium text-[#557268] transition hover:bg-white disabled:opacity-60 sm:flex" onClick={connectGoogle} disabled={syncing}><LogIn size={16} /> {syncing ? "Conectando..." : "Entrar com Google"}</button>}<button className="flex h-10 w-10 items-center justify-center rounded-full border border-[#dce5db] bg-white/70 text-[#557268] disabled:opacity-60 sm:hidden" onClick={account ? disconnectGoogle : connectGoogle} disabled={syncing} title={account ? account.email : "Entrar com Google"}><LogIn size={17} /></button><button className="hidden items-center gap-2 rounded-full border border-[#dce5db] bg-white/70 px-4 py-2.5 text-sm font-medium text-[#557268] transition hover:bg-white sm:flex" onClick={() => setShowGoals((value) => !value)}><Settings2 size={16} /> Metas do dia</button><button className="flex h-10 w-10 items-center justify-center rounded-full border border-[#dce5db] bg-white/70 text-[#557268] sm:hidden" onClick={() => setShowGoals((value) => !value)}><Settings2 size={17} /></button><button className="flex items-center gap-2 rounded-full bg-[#1c4d3e] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(28,77,62,0.15)] transition hover:-translate-y-0.5" onClick={clearCurrentDay}><RotateCcw size={15} /> <span className="hidden sm:inline">Zerar hoje</span></button></div></header>
    <main><section className="mb-8 grid gap-7 lg:grid-cols-[1.2fr_0.8fr] lg:items-end"><div><div className="mb-4 flex items-center gap-2 text-sm font-medium text-[#789087]"><CalendarDays size={16} /> {dateLabel(today)}</div><h1 className="max-w-2xl font-display text-[clamp(2.7rem,6vw,5.3rem)] font-medium leading-[0.96] tracking-[-0.065em] text-[#1b3f34]">Alimente o que <span className="italic text-[#77a45c]">importa.</span></h1><p className="mt-5 max-w-lg text-[15px] leading-7 text-[#71857e]">Descreva sua refeição do jeito que você fala. Nós estimamos os nutrientes, registramos e mostramos quanto ainda cabe no seu dia.</p></div><div className="relative overflow-hidden rounded-[28px] bg-[#e6f1dc] p-6 sm:p-7"><div className="absolute -right-8 -top-10 h-36 w-36 rounded-full border-[18px] border-[#cde4bd]/80"/><div className="relative"><div className="flex items-center gap-2 text-sm font-semibold text-[#587a50]"><Sparkles size={16} /> Seu resumo de hoje</div><div className="mt-5 flex items-end justify-between gap-5"><div><div className="font-display text-4xl font-semibold tracking-[-0.06em] text-[#1d4b3d]">{formatNumber(Math.max(0, remaining.calories))}</div><div className="mt-1 text-sm text-[#6f8d67]">kcal restantes</div></div><div className="text-right"><div className="text-2xl font-semibold tracking-[-0.04em] text-[#1d4b3d]">{formatNumber(consumed.calories)}</div><div className="mt-1 text-sm text-[#6f8d67]">de {formatNumber(goals.calories)} kcal</div></div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/70"><div className="h-full rounded-full bg-[#6f9b59] transition-all" style={{ width: `${pct(consumed.calories, goals.calories)}%` }}/></div></div></div></section>
    {showGoals && <section className="mb-7 rounded-[24px] border border-[#dce8dc] bg-white p-5 shadow-[0_12px_35px_rgba(43,73,53,0.06)]"><div className="mb-4 flex items-start justify-between"><div><h2 className="font-display text-xl font-semibold">Metas máximas diárias</h2><p className="mt-1 text-sm text-[#7c8c86]">A primeira meta é o limite de calorias; as demais orientam a composição.</p></div><button className="rounded-full p-2 text-[#81918a] hover:bg-[#f3f6f1]" onClick={() => setShowGoals(false)}><X size={17}/></button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{(Object.keys(nutrientMeta) as NutrientKey[]).map((key) => { const meta = nutrientMeta[key]; return <label key={key} className="rounded-2xl bg-[#f7f9f5] p-3.5"><span className="mb-2 flex justify-between text-xs font-semibold text-[#688077]"><span>{meta.label}</span><span>{meta.unit}</span></span><input type="number" min="0" step="any" value={goals[key]} onChange={(event) => updateGoal(key, event.target.value)} className="w-full bg-transparent font-display text-2xl font-semibold text-[#214c3d] outline-none"/></label>})}</div></section>}
    <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{(Object.keys(nutrientMeta) as NutrientKey[]).map((key) => { const meta = nutrientMeta[key]; const Icon = meta.icon; const over = consumed[key] > goals[key]; return <div key={key} className="rounded-[22px] border border-[#e5e9e1] bg-white p-5 shadow-[0_10px_28px_rgba(43,73,53,0.045)]"><div className="flex items-center justify-between"><div className="flex items-center gap-2.5"><div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: meta.soft, color: meta.color }}><Icon size={17}/></div><span className="text-sm font-semibold text-[#31564a]">{meta.label}</span></div><span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9aa9a1]">{meta.unit}</span></div><div className="mt-4 flex items-end justify-between gap-2"><div><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa9a1]">Consumido</div><div className="mt-0.5 flex items-baseline gap-1"><span className="font-display text-[28px] font-semibold text-[#214c3d]">{formatNumber(consumed[key], key === "calories" ? 0 : 1)}</span><span className="text-xs text-[#93a199]">{meta.unit}</span></div></div><div className="text-right"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa9a1]">Meta diária</div><div className="mt-1 text-sm font-semibold text-[#6e857c]">{formatNumber(goals[key], key === "calories" ? 0 : 1)} {meta.unit}</div></div></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#edf1ec]"><div className="h-full rounded-full transition-all" style={{ width: `${pct(consumed[key], goals[key])}%`, background: over ? "#d76c54" : meta.color }}/></div><div className={`mt-2 flex items-center gap-1 text-xs font-medium ${over ? "text-[#c35e4b]" : "text-[#789087]"}`}>{over ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>} {over ? `${formatNumber(consumed[key] - goals[key], key === "calories" ? 0 : 1)} ${meta.unit} acima da meta` : `${formatNumber(Math.max(0, remaining[key]), key === "calories" ? 0 : 1)} ${meta.unit} restantes`}</div></div>})}</section>
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_410px]"><aside className="rounded-[26px] bg-[#1c4d3e] p-5 text-white shadow-[0_18px_40px_rgba(28,77,62,0.16)] sm:p-7"><div className="flex items-start justify-between"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#a9c9a1]"><Sparkles size={14}/> Nova refeição</div><h2 className="mt-2 font-display text-2xl font-semibold">O que você vai comer?</h2><p className="mt-2 text-sm leading-5 text-[#b5cfc1]">Escreva naturalmente. Ex.: “1 pão francês, 1 ovo frito e 300 ml de suco de laranja”.</p></div></div><div className="mt-6 space-y-3"><input value={mealName} onChange={(event) => setMealName(event.target.value)} placeholder="Nome: café da manhã" className="w-full rounded-xl border border-white/10 bg-white/[0.09] px-3.5 py-3 text-sm text-white outline-none placeholder:text-[#9fb5aa] focus:border-[#c5dfa9]"/><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descreva os alimentos e quantidades..." rows={4} className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.09] px-3.5 py-3 text-sm leading-6 text-white outline-none placeholder:text-[#9fb5aa] focus:border-[#c5dfa9]"/><button onClick={analyze} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#b8d69c]/30 bg-white/[0.08] px-4 py-3 text-sm font-semibold text-[#e3f2d3] transition hover:bg-white/[0.14]"><Sparkles size={16}/> Calcular refeição</button></div>{preview.length > 0 && <div className="mt-5 rounded-2xl bg-white/[0.09] p-4"><div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.12em] text-[#b8d4ba]"><span>Alimentos identificados</span><Check size={15}/></div><div className="space-y-2">{preview.map((food) => <div key={`${food.label}-${food.amount}`} className="flex justify-between text-sm"><span className="text-[#eff6e9]">{food.label} <span className="text-xs text-[#9fbeb0]">· {food.amount}</span></span><span className="text-[#d5e8c4]">{formatNumber(food.values.calories)} kcal</span></div>)}</div><div className="mt-3 border-t border-white/10 pt-3"><div className="flex items-end justify-between"><span className="text-sm font-semibold text-[#f0f7eb]">Total da refeição</span><span className="font-display text-2xl font-semibold text-[#d9efbd]">{formatNumber(mealTotal.calories)} kcal</span></div><div className="mt-1 text-right text-xs text-[#a9c6b7]">P {formatNumber(mealTotal.protein, 1)} · C {formatNumber(mealTotal.carbs, 1)} · G {formatNumber(mealTotal.fat, 1)} · F {formatNumber(mealTotal.fiber, 1)}</div></div><button onClick={saveMeal} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#d3e9b9] px-4 py-3 text-sm font-bold text-[#1c4d3e] transition hover:bg-[#e0f2ca]"><Check size={16}/> Salvar no histórico</button></div>}</aside><div className="rounded-[26px] border border-[#e5e9e1] bg-white p-5 shadow-[0_10px_28px_rgba(43,73,53,0.045)] sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#9aa9a1]"><Utensils size={14}/> Refeições de hoje</div><h2 className="mt-2 font-display text-2xl font-semibold">O que você comeu</h2></div><button className="flex items-center gap-2 rounded-full bg-[#f2f6ef] px-3 py-1.5 text-xs font-semibold text-[#6e8d69]" onClick={() => setShowHistory((value) => !value)}><History size={14}/> Histórico ({historyDays.length})</button></div><div className="mt-6 divide-y divide-[#edf0eb]">{todayMeals.length === 0 ? <div className="flex min-h-[185px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#d9e4d8] bg-[#fafcf8] px-5 text-center"><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#e9f3e6] text-[#76a162]"><Plus size={20}/></div><p className="font-medium text-[#557268]">Nenhuma refeição registrada hoje</p><p className="mt-1 text-sm text-[#96a49d]">Descreva a primeira refeição no formulário ao lado.</p></div> : todayMeals.map((meal) => <div key={meal.id} className="group flex items-start justify-between gap-3 py-4 first:pt-1"><div className="flex min-w-0 gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f5f7f2] text-[#6c8d68]"><Utensils size={16}/></div><div className="min-w-0"><div className="truncate text-sm font-semibold text-[#31564a]">{meal.name}</div><div className="mt-1 text-xs text-[#9aa9a1]"><Clock3 size={11} className="mr-1 inline"/>{meal.time} · {meal.detected.join(", ")}</div></div></div><div className="flex shrink-0 items-center gap-3"><div className="text-right"><div className="text-sm font-semibold text-[#3d6355]">{formatNumber(meal.calories)} kcal</div><div className="mt-1 text-[11px] text-[#9aa9a1]">P {formatNumber(meal.protein, 1)} · C {formatNumber(meal.carbs, 1)} · G {formatNumber(meal.fat, 1)}</div></div><button aria-label="Remover refeição" className="flex h-8 w-8 items-center justify-center rounded-full text-[#b4c0b8] opacity-0 transition hover:bg-[#fff0ed] hover:text-[#ca6a58] group-hover:opacity-100 focus:opacity-100" onClick={() => setMeals((current) => current.filter((item) => item.id !== meal.id))}><Trash2 size={15}/></button></div></div>)}</div>{showHistory && <div className="mt-5 rounded-2xl bg-[#f7f9f5] p-4"><div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b9187]">Histórico salvo</div>{historyDays.length === 0 ? <p className="text-sm text-[#94a49d]">Suas refeições aparecerão aqui depois do primeiro registro.</p> : historyDays.map((date) => { const dayMeals = meals.filter((meal) => meal.date === date); const dayTotal = dayMeals.reduce((sum, meal) => sum + meal.calories, 0); return <div key={date} className="border-b border-[#e8eee5] py-3 last:border-0"><div className="flex items-center justify-between"><span className="text-sm font-medium text-[#557268]">{dateLabel(date)}</span><span className="text-xs text-[#8a9c93]">{formatNumber(dayTotal)} kcal · {dayMeals.length} refeição{dayMeals.length > 1 ? "ões" : ""}</span></div><div className="mt-2 space-y-1.5">{dayMeals.map((meal) => <div key={meal.id} className="flex items-center justify-between text-xs text-[#7e9287]"><span>{meal.name}</span><span>{formatNumber(meal.calories)} kcal</span></div>)}</div></div>; })}</div>}</div></section><div className="mt-7 flex items-start gap-2 text-xs leading-5 text-[#92a099]"><CircleHelp size={15} className="mt-0.5 shrink-0 text-[#9db69a]"/><p>Os valores são estimativas. O reconhecimento automático funciona com alimentos conhecidos e pode ser refinado com uma base nutricional maior.</p></div></main>
  </div></div>;
}
