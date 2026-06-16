import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, ResponsiveContainer,
  Tooltip, ReferenceLine, CartesianGrid,
} from "recharts";
import {
  Dumbbell, UtensilsCrossed, TrendingUp, Settings, Plus, Trash2,
  ChevronDown, ChevronRight, Check, X, Scale, Flame, BookOpen,
  Pencil, Play, Target, Search, Barcode, Camera, ChevronLeft,
  Lock, Crown,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Persistance                                                         */
/* ------------------------------------------------------------------ */
const KEY = "fitdiete-v1";

// Persistance navigateur (localStorage) — fonctionne sur une vraie page web déployée.
async function loadState() {
  try {
    const v = localStorage.getItem(KEY);
    return v ? JSON.parse(v) : null;
  } catch (e) {
    return null;
  }
}
async function saveState(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    /* quota plein ou navigation privée : on garde en mémoire */
  }
}

/* ------------------------------------------------------------------ */
/* Thèmes & accents                                                    */
/* ------------------------------------------------------------------ */
const ACCENTS = [
  { id: "ember", label: "Braise", v: "#FF5C38" },
  { id: "lime", label: "Citron", v: "#B6F500" },
  { id: "cyan", label: "Cyan", v: "#22D3EE" },
  { id: "violet", label: "Violet", v: "#A78BFA" },
  { id: "magenta", label: "Magenta", v: "#F472B6" },
  { id: "gold", label: "Or", v: "#F5B301" },
];

const THEMES = {
  dark: {
    bg: "#0D1014", surface: "#151A21", raised: "#1C232C", border: "#283039",
    text: "#E7ECF3", muted: "#8A95A4", faint: "#5A6573", grid: "#222a33",
  },
  light: {
    bg: "#F3F5F8", surface: "#FFFFFF", raised: "#FFFFFF", border: "#E3E7ED",
    text: "#0F151C", muted: "#5C6675", faint: "#9AA3B0", grid: "#E8ECF1",
  },
};

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/* ------------------------------------------------------------------ */
/* Données par défaut                                                  */
/* ------------------------------------------------------------------ */
const DEFAULT_MEAL_NAMES = ["Petit-déjeuner", "Déjeuner", "Dîner"];

const EXERCISE_LIBRARY = [
  "Développé couché", "Développé incliné", "Développé militaire", "Dips",
  "Élévations latérales", "Extension triceps", "Squat", "Soulevé de terre",
  "Presse à cuisses", "Fentes", "Leg curl", "Mollets debout",
  "Tractions", "Rowing barre", "Tirage vertical", "Curl biceps",
  "Face pull", "Gainage", "Course à pied",
];

const DEFAULT_STATE = {
  settings: { theme: "dark", accent: "#FF5C38", name: "", pro: false, layout: "mobile" },
  profile: {
    startWeight: null, goalWeight: null,
    calorieTarget: 2200, proteinTarget: 150, carbTarget: 230, fatTarget: 70,
  },
  programs: [
    {
      id: uid(), name: "Push",
      exercises: [
        { id: uid(), name: "Développé couché", sets: 4, reps: 8, weight: 50 },
        { id: uid(), name: "Développé militaire", sets: 4, reps: 10, weight: 30 },
        { id: uid(), name: "Dips", sets: 3, reps: 12, weight: 0 },
        { id: uid(), name: "Élévations latérales", sets: 3, reps: 15, weight: 8 },
      ],
    },
  ],
  workoutLogs: [],
  weightLogs: [],
  recipes: [
    { id: uid(), name: "Bol riz / poulet", kcal: 620, protein: 48, carbs: 70, fat: 12 },
    { id: uid(), name: "Œufs + avoine", kcal: 410, protein: 26, carbs: 38, fat: 16 },
  ],
  foodLogs: {},
};

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}
function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}
function round1(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : Math.round(n * 10) / 10;
}

/* --- Source des aliments : Open Food Facts + base locale -------------- */
const OFF = "https://world.openfoodfacts.org";

function offToProduct(p, code) {
  const n = p.nutriments || {};
  let kcal = n["energy-kcal_100g"];
  if (kcal == null && n["energy_100g"] != null) kcal = n["energy_100g"] / 4.184; // kJ -> kcal
  const base = (p.product_name || "").trim();
  const brand = p.brands ? p.brands.split(",")[0].trim() : "";
  const name = base || brand;
  if (!name) return null;
  return {
    name: brand && base && !base.toLowerCase().includes(brand.toLowerCase()) ? `${base} · ${brand}` : name,
    code: code || p.code,
    complete: kcal != null,
    per100: { kcal: kcal != null ? Math.round(kcal) : 0, protein: round1(n.proteins_100g), carbs: round1(n.carbohydrates_100g), fat: round1(n.fat_100g) },
  };
}
async function offByBarcode(code) {
  const r = await fetch(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,nutriments,code`);
  const j = await r.json();
  if (j.status !== 1 || !j.product) return null;
  return offToProduct(j.product, code);
}
async function offSearch(q) {
  const r = await fetch(`${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&fields=product_name,brands,nutriments,code`);
  const j = await r.json();
  return (j.products || []).map((p) => offToProduct(p, p.code)).filter((x) => x && x.complete);
}
function scaleFood(per100, grams) {
  const f = num(grams) / 100;
  return { kcal: Math.round(per100.kcal * f), protein: round1(per100.protein * f), carbs: round1(per100.carbs * f), fat: round1(per100.fat * f) };
}
const LOCAL_FOODS = [
  { name: "Œuf", per100: { kcal: 143, protein: 13, carbs: 1, fat: 10 } },
  { name: "Blanc de poulet", per100: { kcal: 165, protein: 31, carbs: 0, fat: 4 } },
  { name: "Riz blanc cuit", per100: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 } },
  { name: "Pâtes cuites", per100: { kcal: 158, protein: 6, carbs: 31, fat: 0.9 } },
  { name: "Flocons d'avoine", per100: { kcal: 389, protein: 17, carbs: 66, fat: 7 } },
  { name: "Banane", per100: { kcal: 89, protein: 1.1, carbs: 23, fat: 0.3 } },
  { name: "Pomme", per100: { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 } },
  { name: "Pain complet", per100: { kcal: 247, protein: 13, carbs: 41, fat: 3.4 } },
  { name: "Saumon", per100: { kcal: 208, protein: 20, carbs: 0, fat: 13 } },
  { name: "Thon au naturel", per100: { kcal: 116, protein: 26, carbs: 0, fat: 1 } },
  { name: "Yaourt nature", per100: { kcal: 61, protein: 3.5, carbs: 4.7, fat: 3.3 } },
  { name: "Fromage blanc 0%", per100: { kcal: 47, protein: 8, carbs: 4, fat: 0.2 } },
  { name: "Amandes", per100: { kcal: 579, protein: 21, carbs: 22, fat: 50 } },
  { name: "Lentilles cuites", per100: { kcal: 116, protein: 9, carbs: 20, fat: 0.4 } },
  { name: "Pomme de terre cuite", per100: { kcal: 87, protein: 2, carbs: 20, fat: 0.1 } },
  { name: "Huile d'olive", per100: { kcal: 884, protein: 0, carbs: 0, fat: 100 } },
];
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return res();
    const s = document.createElement("script");
    s.src = src; s.async = true; s.dataset.src = src;
    s.onload = () => res(); s.onerror = () => rej(new Error("script"));
    document.head.appendChild(s);
  });
}

/* ------------------------------------------------------------------ */
/* Abonnement Pro                                                      */
/* ------------------------------------------------------------------ */
const FREE_LIMITS = { programs: 1, recipes: 3, meals: 3 };

const PRO_FEATURES = [
  "Scan de code-barres par caméra",
  "Recherche d'aliments en ligne (Open Food Facts)",
  "Programmes d'entraînement illimités",
  "Recettes illimitées",
  "4ᵉ repas et plus",
  "Couleur d'accent personnalisée",
];

/*
 * ===================== POINT DE BRANCHEMENT UNIQUE =====================
 * Aujourd'hui : déblocage local par code de licence (démo, contournable).
 * Demain : remplace le CORPS de cette fonction par un appel à TON serveur,
 * c'est le seul endroit à changer pour passer à un vrai verrou payant :
 *
 *   const r = await fetch("https://api.tonapp.com/me", {
 *     headers: { Authorization: `Bearer ${token}` },
 *   });
 *   const { is_pro } = await r.json();
 *   return is_pro;
 *
 * Côté serveur : Stripe Checkout -> webhook -> base (is_pro = true).
 * Pense aussi à faire transiter les appels Open Food Facts par ton serveur
 * authentifié : ainsi un utilisateur qui "débloque" la caméra côté navigateur
 * n'obtient quand même aucune donnée produit sans abonnement actif.
 * =======================================================================
 */
async function verifyLicense(code) {
  const DEMO_CODES = ["ATHLETE-PRO", "OS-PREMIUM"];
  return DEMO_CODES.includes((code || "").trim().toUpperCase());
}

function ProPill({ accent }) {
  return (
    <span style={{
      fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: 1,
      color: "#0b0d10", background: accent, borderRadius: 5, padding: "2px 5px",
      display: "inline-flex", alignItems: "center", gap: 3,
    }}><Crown size={10} /> PRO</span>
  );
}

function LockPanel({ t, accent, title, desc, onUpgrade }) {
  return (
    <div style={{
      border: `1px dashed ${t.border}`, borderRadius: 12, padding: 18,
      display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8,
    }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: t.raised, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Lock size={20} color={accent} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
      {desc && <div style={{ fontSize: 12.5, color: t.muted, maxWidth: 280 }}>{desc}</div>}
      <Btn t={t} accent={accent} kind="solid" onClick={onUpgrade} style={{ marginTop: 4 }}>
        <Crown size={15} /> Passer à Pro
      </Btn>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */
export default function App() {
  const [state, setState] = useState(DEFAULT_STATE);
  const [tab, setTab] = useState("muscu");
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    loadState().then((s) => {
      if (s) setState({ ...DEFAULT_STATE, ...s, settings: { ...DEFAULT_STATE.settings, ...s.settings }, profile: { ...DEFAULT_STATE.profile, ...s.profile } });
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveState(state), 500);
  }, [state, loaded]);

  const t = THEMES[state.settings.theme];
  const accent = state.settings.accent;
  const wide = state.settings.layout === "tablet";
  const maxW = wide ? 900 : 480;

  const update = (fn) => setState((s) => fn(structuredClone(s)));

  const ctx = { state, update, t, accent, pro: !!state.settings.pro, setTab, wide };

  const tabs = [
    { id: "muscu", label: "Muscu", icon: Dumbbell },
    { id: "diete", label: "Diète", icon: UtensilsCrossed },
    { id: "suivi", label: "Suivi", icon: TrendingUp },
    { id: "reglages", label: "Réglages", icon: Settings },
  ];

  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { width: 0; height: 0; }
        input, select, textarea { font-family: inherit; }
        input:focus, select:focus, textarea:focus { outline: 2px solid ${accent}55; }
        button { cursor: pointer; border: none; font-family: inherit; }
        @media (prefers-reduced-motion: reduce){ *{ transition: none !important } }
      `}</style>

      <header style={{ maxWidth: maxW, margin: "0 auto", padding: "calc(env(safe-area-inset-top, 0px) + 14px) 18px 12px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: t.faint, textTransform: "uppercase" }}>
            {state.settings.name ? state.settings.name : "Tableau de bord"}
          </div>
          <h1 style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>
            Athlète <span style={{ color: accent }}>OS</span>
          </h1>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: t.muted, textAlign: "right" }}>
          {new Date().toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })}
        </div>
      </header>

      <main style={{ padding: "0 14px 110px", maxWidth: maxW, margin: "0 auto" }}>
        {tab === "muscu" && <Muscu {...ctx} />}
        {tab === "diete" && <Diete {...ctx} />}
        {tab === "suivi" && <Suivi {...ctx} />}
        {tab === "reglages" && <Reglages {...ctx} />}
      </main>

      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "center",
        background: t.surface, borderTop: `1px solid ${t.border}`,
        paddingBottom: "env(safe-area-inset-bottom, 6px)",
      }}>
        <div style={{ display: "flex", width: "100%", maxWidth: maxW }}>
        {tabs.map((x) => {
          const on = tab === x.id;
          const Icon = x.icon;
          return (
            <button key={x.id} onClick={() => setTab(x.id)} style={{
              flex: 1, background: "none", padding: "10px 0 8px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              color: on ? accent : t.muted, position: "relative",
            }}>
              {on && <span style={{ position: "absolute", top: 0, width: 28, height: 2, borderRadius: 2, background: accent }} />}
              <Icon size={21} strokeWidth={on ? 2.4 : 1.8} />
              <span style={{ fontSize: 10.5, fontWeight: on ? 700 : 500 }}>{x.label}</span>
            </button>
          );
        })}
        </div>
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */
function Card({ t, accent, topline, children, style }) {
  return (
    <div style={{
      background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16,
      borderTop: topline ? `2px solid ${accent}` : `1px solid ${t.border}`,
      padding: 16, ...style,
    }}>
      {children}
    </div>
  );
}
function Stat({ t, accent, label, value, unit }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: t.faint }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: t.text, fontVariantNumeric: "tabular-nums", lineHeight: 1.1, marginTop: 4 }}>
        {value}<span style={{ fontSize: 12, color: t.muted, marginLeft: 3 }}>{unit}</span>
      </div>
    </div>
  );
}
function SectionTitle({ t, children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "22px 4px 10px" }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: t.muted, margin: 0 }}>{children}</h2>
      {right}
    </div>
  );
}
function Field({ t, accent, label, value, onChange, type = "text", placeholder, suffix, style }) {
  return (
    <label style={{ display: "block", ...style }}>
      {label && <div style={{ fontSize: 11, color: t.muted, marginBottom: 5 }}>{label}</div>}
      <div style={{ display: "flex", alignItems: "center", background: t.raised, border: `1px solid ${t.border}`, borderRadius: 10, padding: "0 10px" }}>
        <input
          type={type} value={value ?? ""} placeholder={placeholder}
          inputMode={type === "number" ? "decimal" : undefined}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, background: "none", border: "none", color: t.text, padding: "11px 0", fontSize: 15, fontFamily: type === "number" ? MONO : "inherit", minWidth: 0 }}
        />
        {suffix && <span style={{ color: t.faint, fontSize: 12, fontFamily: MONO }}>{suffix}</span>}
      </div>
    </label>
  );
}
function Btn({ t, accent, children, onClick, kind = "ghost", style }) {
  const styles = {
    solid: { background: accent, color: "#0b0d10", fontWeight: 700 },
    ghost: { background: t.raised, color: t.text, border: `1px solid ${t.border}` },
    danger: { background: "none", color: "#ff6b6b", border: `1px solid ${t.border}` },
  };
  return (
    <button onClick={onClick} style={{
      borderRadius: 10, padding: "11px 14px", fontSize: 14, display: "inline-flex",
      alignItems: "center", justifyContent: "center", gap: 7, ...styles[kind], ...style,
    }}>{children}</button>
  );
}

/* ------------------------------------------------------------------ */
/* MUSCU                                                               */
/* ------------------------------------------------------------------ */
function Muscu({ state, update, t, accent, pro, setTab, wide }) {
  const [editing, setEditing] = useState(null); // programId
  const [session, setSession] = useState(null);  // {programId, entries}

  if (session) return <SessionRunner {...{ state, update, t, accent, session, setSession }} />;

  const gridCols = { display: "grid", gap: 12, gridTemplateColumns: wide ? "repeat(2, minmax(0,1fr))" : "1fr" };
  const locked = !pro && state.programs.length >= FREE_LIMITS.programs;
  const addProgram = () => {
    if (locked) { setTab("reglages"); return; }
    const id = uid();
    update((s) => { s.programs.push({ id, name: "Nouveau programme", exercises: [] }); return s; });
    setEditing(id);
  };

  return (
    <div>
      <SectionTitle t={t} right={
        <Btn t={t} accent={accent} kind="solid" onClick={addProgram} style={{ padding: "7px 11px", fontSize: 13 }}>
          {locked ? <Lock size={14} /> : <Plus size={15} />} Programme
        </Btn>
      }>Mes programmes</SectionTitle>

      {state.programs.length === 0 && (
        <Card t={t}><p style={{ color: t.muted, margin: 0, fontSize: 14 }}>Aucun programme. Crée ton premier split d'entraînement.</p></Card>
      )}

      <div style={gridCols}>
        {state.programs.map((p) =>
          editing === p.id ? (
            <div key={p.id} style={{ gridColumn: wide ? "1 / -1" : undefined }}>
              <ProgramEditor {...{ state, update, t, accent, program: p, done: () => setEditing(null) }} />
            </div>
          ) : (
            <Card key={p.id} t={t} accent={accent} topline>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: t.muted, marginTop: 2 }}>
                    {p.exercises.length} exos · {p.exercises.reduce((a, e) => a + num(e.sets), 0)} séries
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setEditing(p.id)} style={iconBtn(t)}><Pencil size={16} color={t.muted} /></button>
                  <Btn t={t} accent={accent} kind="solid" onClick={() => setSession({ programId: p.id, entries: startEntries(p) })} style={{ padding: "8px 12px" }}>
                    <Play size={15} /> Lancer
                  </Btn>
                </div>
              </div>
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {p.exercises.map((e) => (
                  <span key={e.id} style={{ fontSize: 12, color: t.muted, background: t.raised, border: `1px solid ${t.border}`, borderRadius: 8, padding: "4px 8px", fontFamily: MONO }}>
                    {e.name} <span style={{ color: t.faint }}>{e.sets}×{e.reps}</span>
                  </span>
                ))}
              </div>
            </Card>
          )
        )}
      </div>

      {state.workoutLogs.length > 0 && (
        <>
          <SectionTitle t={t}>Dernières séances</SectionTitle>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: wide ? "repeat(2, minmax(0,1fr))" : "1fr" }}>
            {[...state.workoutLogs].reverse().slice(0, 6).map((w) => (
              <Card key={w.id} t={t} style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{w.programName}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: t.muted }}>{fmtDate(w.date)} · {w.totalVolume} kg vol.</div>
                </div>
                <button onClick={() => update((s) => { s.workoutLogs = s.workoutLogs.filter((x) => x.id !== w.id); return s; })} style={iconBtn(t)}>
                  <Trash2 size={15} color={t.faint} />
                </button>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function startEntries(p) {
  return p.exercises.map((e) => ({
    exerciseId: e.id, name: e.name, target: { sets: e.sets, reps: e.reps, weight: e.weight },
    sets: Array.from({ length: num(e.sets) || 1 }, () => ({ reps: e.reps, weight: e.weight, done: false })),
  }));
}

function ProgramEditor({ state, update, t, accent, program, done }) {
  const set = (fn) => update((s) => { const p = s.programs.find((x) => x.id === program.id); fn(p); return s; });
  const [pick, setPick] = useState(false);

  return (
    <Card t={t} accent={accent} topline>
      <input
        value={program.name}
        onChange={(e) => set((p) => (p.name = e.target.value))}
        style={{ background: "none", border: "none", color: t.text, fontSize: 18, fontWeight: 700, width: "100%", marginBottom: 10 }}
      />
      <div style={{ display: "grid", gap: 8 }}>
        {program.exercises.map((e) => (
          <div key={e.id} style={{ background: t.raised, border: `1px solid ${t.border}`, borderRadius: 10, padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <input value={e.name} onChange={(ev) => set((p) => { p.exercises.find((x) => x.id === e.id).name = ev.target.value; })}
                style={{ background: "none", border: "none", color: t.text, fontSize: 14, fontWeight: 600, flex: 1 }} />
              <button onClick={() => set((p) => (p.exercises = p.exercises.filter((x) => x.id !== e.id)))} style={iconBtn(t)}>
                <Trash2 size={15} color={t.faint} />
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[["sets", "Séries"], ["reps", "Reps"], ["weight", "Charge kg"]].map(([k, lbl]) => (
                <Field key={k} t={t} accent={accent} type="number" label={lbl}
                  value={e[k]} onChange={(v) => set((p) => (p.exercises.find((x) => x.id === e.id)[k] = v))} style={{ flex: 1 }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {pick ? (
        <div style={{ marginTop: 10, background: t.raised, border: `1px solid ${t.border}`, borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 12, color: t.muted, marginBottom: 8 }}>Choisir un exercice</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {EXERCISE_LIBRARY.map((name) => (
              <button key={name} onClick={() => { set((p) => p.exercises.push({ id: uid(), name, sets: 4, reps: 10, weight: 0 })); setPick(false); }}
                style={{ fontSize: 12.5, color: t.text, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: "6px 9px" }}>
                {name}
              </button>
            ))}
            <button onClick={() => { set((p) => p.exercises.push({ id: uid(), name: "Exercice", sets: 4, reps: 10, weight: 0 })); setPick(false); }}
              style={{ fontSize: 12.5, color: accent, background: "none", border: `1px dashed ${accent}`, borderRadius: 8, padding: "6px 9px" }}>
              + Personnalisé
            </button>
          </div>
        </div>
      ) : (
        <Btn t={t} accent={accent} onClick={() => setPick(true)} style={{ marginTop: 10, width: "100%" }}>
          <Plus size={16} /> Ajouter un exercice
        </Btn>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Btn t={t} accent={accent} kind="solid" onClick={done} style={{ flex: 1 }}><Check size={16} /> Terminé</Btn>
        <Btn t={t} accent={accent} kind="danger"
          onClick={() => { if (confirm("Supprimer ce programme ?")) update((s) => { s.programs = s.programs.filter((x) => x.id !== program.id); return s; }); done(); }}>
          <Trash2 size={16} />
        </Btn>
      </div>
    </Card>
  );
}

function SessionRunner({ state, update, t, accent, session, setSession }) {
  const program = state.programs.find((p) => p.id === session.programId);
  const [entries, setEntries] = useState(session.entries);

  const toggle = (ei, si) => setEntries((es) => es.map((e, i) =>
    i !== ei ? e : { ...e, sets: e.sets.map((s, j) => (j !== si ? s : { ...s, done: !s.done })) }));
  const edit = (ei, si, k, v) => setEntries((es) => es.map((e, i) =>
    i !== ei ? e : { ...e, sets: e.sets.map((s, j) => (j !== si ? s : { ...s, [k]: v })) }));

  const totalVolume = useMemo(() =>
    entries.reduce((a, e) => a + e.sets.reduce((b, s) => b + (s.done ? num(s.reps) * num(s.weight) : 0), 0), 0), [entries]);
  const doneSets = entries.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);

  const finish = () => {
    update((s) => {
      s.workoutLogs.push({
        id: uid(), date: today(), programId: program.id, programName: program.name,
        totalVolume: Math.round(totalVolume), doneSets,
        entries: entries.map((e) => ({ name: e.name, sets: e.sets })),
      });
      return s;
    });
    setSession(null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 4px 14px" }}>
        <div>
          <div style={{ fontSize: 11, color: t.faint, letterSpacing: 1, textTransform: "uppercase" }}>Séance en cours</div>
          <h2 style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 700 }}>{program.name}</h2>
        </div>
        <button onClick={() => setSession(null)} style={iconBtn(t)}><X size={20} color={t.muted} /></button>
      </div>

      <Card t={t} accent={accent} topline style={{ display: "flex", marginBottom: 14 }}>
        <Stat t={t} accent={accent} label="Volume" value={Math.round(totalVolume)} unit="kg" />
        <Stat t={t} accent={accent} label="Séries faites" value={doneSets} unit="" />
      </Card>

      <div style={{ display: "grid", gap: 12 }}>
        {entries.map((e, ei) => (
          <Card key={ei} t={t}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{e.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: t.faint }}>cible {e.target.reps}×{e.target.weight}kg</span>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {e.sets.map((s, si) => (
                <div key={si} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: t.faint, width: 18 }}>{si + 1}</span>
                  <input value={s.reps} onChange={(ev) => edit(ei, si, "reps", ev.target.value)} inputMode="decimal"
                    style={miniInput(t)} /><span style={{ color: t.faint, fontSize: 12 }}>reps</span>
                  <input value={s.weight} onChange={(ev) => edit(ei, si, "weight", ev.target.value)} inputMode="decimal"
                    style={miniInput(t)} /><span style={{ color: t.faint, fontSize: 12 }}>kg</span>
                  <button onClick={() => toggle(ei, si)} style={{
                    marginLeft: "auto", width: 34, height: 34, borderRadius: 9,
                    background: s.done ? accent : t.raised, border: `1px solid ${s.done ? accent : t.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Check size={18} color={s.done ? "#0b0d10" : t.faint} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setEntries((es) => es.map((x, i) => i !== ei ? x : { ...x, sets: [...x.sets, { reps: x.target.reps, weight: x.target.weight, done: false }] }))}
              style={{ marginTop: 8, background: "none", color: t.muted, fontSize: 12.5, display: "flex", alignItems: "center", gap: 4 }}>
              <Plus size={13} /> Série
            </button>
          </Card>
        ))}
      </div>

      <Btn t={t} accent={accent} kind="solid" onClick={finish} style={{ width: "100%", marginTop: 16, padding: "14px" }}>
        <Check size={18} /> Terminer & enregistrer
      </Btn>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DIÈTE                                                               */
/* ------------------------------------------------------------------ */
function Diete({ state, update, t, accent, pro, setTab, wide }) {
  const [date, setDate] = useState(today());
  const [view, setView] = useState("jour"); // jour | recettes

  const ensure = (s) => {
    if (!s.foodLogs[date]) s.foodLogs[date] = { meals: DEFAULT_MEAL_NAMES.map((n) => ({ id: uid(), name: n, items: [] })) };
    return s.foodLogs[date];
  };

  // Crée l'entrée du jour avec des identifiants stables dès l'ouverture
  useEffect(() => {
    if (!state.foodLogs[date]) update((s) => { ensure(s); return s; });
  }, [date]); // eslint-disable-line

  const log = state.foodLogs[date] || { meals: DEFAULT_MEAL_NAMES.map((n) => ({ id: "tmp-" + n, name: n, items: [] })) };

  const totals = log.meals.reduce((a, m) => {
    m.items.forEach((it) => { a.kcal += num(it.kcal); a.p += num(it.protein); a.c += num(it.carbs); a.f += num(it.fat); });
    return a;
  }, { kcal: 0, p: 0, c: 0, f: 0 });

  const tgt = state.profile.calorieTarget || 2200;
  const pct = Math.min(1, totals.kcal / tgt);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, margin: "16px 0 12px" }}>
        {[["jour", "Journée"], ["recettes", "Recettes"]].map(([id, lbl]) => (
          <button key={id} onClick={() => setView(id)} style={{
            flex: 1, padding: "9px", borderRadius: 10, fontSize: 13.5, fontWeight: 600,
            background: view === id ? accent : t.surface, color: view === id ? "#0b0d10" : t.muted,
            border: `1px solid ${view === id ? accent : t.border}`,
          }}>{lbl}</button>
        ))}
      </div>

      {view === "recettes" ? (
        <Recettes {...{ state, update, t, accent, pro, setTab, wide }} />
      ) : (
        <>
          {/* Sélecteur de date */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <button onClick={() => setDate(shiftDate(date, -1))} style={iconBtn(t)}><ChevronRight size={18} color={t.muted} style={{ transform: "rotate(180deg)" }} /></button>
            <div style={{ flex: 1, textAlign: "center", fontFamily: MONO, fontSize: 14, color: t.text }}>
              {date === today() ? "Aujourd'hui" : new Date(date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" })}
            </div>
            <button onClick={() => date < today() && setDate(shiftDate(date, 1))} style={iconBtn(t)}><ChevronRight size={18} color={date < today() ? t.muted : t.faint} /></button>
          </div>

          {/* Anneau calories */}
          <Card t={t} accent={accent} topline style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
            <Ring pct={pct} accent={accent} t={t} value={Math.round(totals.kcal)} target={tgt} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: t.muted }}>Restant</span>
                <span style={{ fontFamily: MONO, fontWeight: 700, color: tgt - totals.kcal < 0 ? "#ff6b6b" : accent }}>
                  {Math.round(tgt - totals.kcal)} kcal
                </span>
              </div>
              <Macro t={t} label="Protéines" v={totals.p} tgt={state.profile.proteinTarget} c="#22D3EE" />
              <Macro t={t} label="Glucides" v={totals.c} tgt={state.profile.carbTarget} c="#F5B301" />
              <Macro t={t} label="Lipides" v={totals.f} tgt={state.profile.fatTarget} c="#F472B6" />
            </div>
          </Card>

          {/* Repas */}
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: wide ? "repeat(2, minmax(0,1fr))" : "1fr", alignItems: "start" }}>
            {log.meals.map((m) => (
              <Meal key={m.id} {...{ state, update, t, accent, date, meal: m, ensure, pro, setTab }} />
            ))}
          </div>

          <Btn t={t} accent={accent}
            onClick={() => {
              if (!pro && log.meals.length >= FREE_LIMITS.meals) { setTab("reglages"); return; }
              update((s) => { ensure(s).meals.push({ id: uid(), name: "Collation", items: [] }); return s; });
            }}
            style={{ width: "100%", marginTop: 12 }}>
            {!pro && log.meals.length >= FREE_LIMITS.meals ? <Lock size={15} /> : <Plus size={16} />} Ajouter un repas
          </Btn>
        </>
      )}
    </div>
  );
}

function Meal({ state, update, t, accent, date, meal, ensure, pro, setTab }) {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const sum = meal.items.reduce((a, it) => a + num(it.kcal), 0);

  const setMeal = (fn) => update((s) => { const m = ensure(s).meals.find((x) => x.id === meal.id); fn(m, s); return s; });

  return (
    <Card t={t} style={{ padding: 0, overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: "none", padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {open ? <ChevronDown size={16} color={t.muted} /> : <ChevronRight size={16} color={t.muted} />}
          <span style={{ fontWeight: 700, fontSize: 15, color: t.text }}>{meal.name}</span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 13, color: t.muted }}>{Math.round(sum)} kcal</span>
      </button>

      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          {meal.items.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", padding: "8px 0", borderTop: `1px solid ${t.border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: t.text }}>{it.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: t.faint }}>P{Math.round(num(it.protein))} · G{Math.round(num(it.carbs))} · L{Math.round(num(it.fat))}</div>
              </div>
              <span style={{ fontFamily: MONO, fontSize: 13, color: t.text, marginRight: 8 }}>{Math.round(num(it.kcal))}</span>
              <button onClick={() => setMeal((m) => (m.items = m.items.filter((x) => x.id !== it.id)))} style={iconBtn(t)}>
                <X size={15} color={t.faint} />
              </button>
            </div>
          ))}

          {adding ? (
            <AddFood {...{ state, t, accent, pro, setTab }} onAdd={(item) => { setMeal((m) => m.items.push({ id: uid(), ...item })); setAdding(false); }} onCancel={() => setAdding(false)} />
          ) : (
            <button onClick={() => setAdding(true)} style={{ marginTop: 8, background: "none", color: accent, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
              <Plus size={15} /> Ajouter un aliment
            </button>
          )}

          {meal.name !== DEFAULT_MEAL_NAMES[0] && meal.name !== DEFAULT_MEAL_NAMES[1] && meal.name !== DEFAULT_MEAL_NAMES[2] && (
            <button onClick={() => setMeal((m, s) => { s.foodLogs[date].meals = s.foodLogs[date].meals.filter((x) => x.id !== meal.id); })}
              style={{ marginTop: 8, marginLeft: 14, background: "none", color: t.faint, fontSize: 12 }}>Supprimer ce repas</button>
          )}
        </div>
      )}
    </Card>
  );
}

function BarcodeScanner({ t, accent, onResult }) {
  const [status, setStatus] = useState("idle"); // idle | loading | scanning | error
  const [msg, setMsg] = useState("");
  const idRef = useRef("scan-" + Math.random().toString(36).slice(2, 8));
  const scannerRef = useRef(null);

  const stop = async () => {
    try {
      if (scannerRef.current) { await scannerRef.current.stop(); scannerRef.current.clear(); }
    } catch (e) { /* ignore */ }
    scannerRef.current = null;
  };
  useEffect(() => () => { stop(); }, []);

  const start = async () => {
    setStatus("loading"); setMsg("");
    try {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js");
      const H = window.Html5Qrcode;
      const F = window.Html5QrcodeSupportedFormats;
      if (!H) throw new Error("lib");
      const fmts = F ? [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128].filter((x) => x != null) : undefined;
      const scanner = new H(idRef.current, fmts ? { formatsToSupport: fmts, verbose: false } : { verbose: false });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 130 } },
        async (text) => { await stop(); setStatus("idle"); onResult(String(text).trim()); },
        () => {}
      );
      setStatus("scanning");
    } catch (e) {
      setStatus("error");
      setMsg("Caméra indisponible ici. Tape le code-barres à la main juste en dessous.");
    }
  };

  return (
    <div>
      <div id={idRef.current} style={{ width: "100%", borderRadius: 10, overflow: "hidden", marginBottom: status === "scanning" ? 10 : 0 }} />
      {status === "idle" && (
        <Btn t={t} accent={accent} kind="solid" onClick={start} style={{ width: "100%" }}>
          <Camera size={16} /> Activer la caméra
        </Btn>
      )}
      {status === "loading" && <div style={{ fontSize: 13, color: t.muted, textAlign: "center", padding: 8 }}>Démarrage de la caméra…</div>}
      {status === "scanning" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: accent }}>Vise le code-barres…</span>
          <button onClick={async () => { await stop(); setStatus("idle"); }} style={{ background: "none", color: t.muted, fontSize: 12 }}>Arrêter</button>
        </div>
      )}
      {status === "error" && <div style={{ fontSize: 12.5, color: "#ff8a6b", padding: "4px 2px" }}>{msg}</div>}
    </div>
  );
}

function FoundPreview({ t, accent, product, onAdd, onBack }) {
  const [g, setG] = useState(100);
  const sc = scaleFood(product.per100, g);
  return (
    <div style={{ marginTop: 10, background: t.raised, border: `1px solid ${t.border}`, borderRadius: 10, padding: 12 }}>
      <button onClick={onBack} style={{ background: "none", color: t.muted, fontSize: 12, display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
        <ChevronLeft size={14} /> Retour
      </button>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{product.name}</div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: t.faint, margin: "2px 0 10px" }}>
        100 g : {product.per100.kcal} kcal · P{product.per100.protein} G{product.per100.carbs} L{product.per100.fat}
        {product.code ? `  ·  ${product.code}` : ""}
      </div>
      <Field t={t} accent={accent} type="number" label="Quantité consommée" value={g} onChange={setG} suffix="g" />
      <div style={{ display: "flex", gap: 12, margin: "12px 2px 4px" }}>
        <Stat t={t} accent={accent} label="Kcal" value={sc.kcal} unit="" />
        <Stat t={t} accent={accent} label="Prot." value={sc.protein} unit="g" />
        <Stat t={t} accent={accent} label="Gluc." value={sc.carbs} unit="g" />
        <Stat t={t} accent={accent} label="Lip." value={sc.fat} unit="g" />
      </div>
      <Btn t={t} accent={accent} kind="solid" onClick={() => num(g) > 0 && onAdd({ name: product.name, ...sc })} style={{ width: "100%", marginTop: 8 }}>
        <Plus size={16} /> Ajouter au repas
      </Btn>
    </div>
  );
}

function AddFood({ state, t, accent, pro, setTab, onAdd, onCancel }) {
  const [mode, setMode] = useState(pro ? "search" : "local"); // local | search | scan | manual
  const [found, setFound] = useState(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [ean, setEan] = useState("");
  const [m, setM] = useState({ name: "", kcal: "", protein: "", carbs: "", fat: "" });

  const localMatches = (s) => {
    const k = s.trim().toLowerCase();
    return (k ? LOCAL_FOODS.filter((f) => f.name.toLowerCase().includes(k)) : LOCAL_FOODS).slice(0, 8);
  };

  const runSearch = async () => {
    if (!q.trim()) return;
    setBusy(true); setNote(""); setResults([]);
    try {
      const res = await offSearch(q);
      if (res.length) setResults(res);
      else { setResults(localMatches(q)); setNote("Aucun résultat en ligne — voici la base locale."); }
    } catch (e) {
      setResults(localMatches(q));
      setNote("Hors-ligne : recherche dans la base locale.");
    } finally { setBusy(false); }
  };

  const lookupBarcode = async (code) => {
    setBusy(true); setNote("");
    try {
      const p = await offByBarcode(code);
      if (p && p.complete) {
        setFound(p);
      } else if (p) {
        // Produit trouvé mais sans calories : on pré-remplit la saisie manuelle
        setM({ name: p.name, kcal: "", protein: "", carbs: "", fat: "" });
        setMode("manual");
        setNote("Produit trouvé mais sans valeurs nutritionnelles sur Open Food Facts — complète-les à la main.");
      } else {
        setM({ name: "", kcal: "", protein: "", carbs: "", fat: "" });
        setMode("manual");
        setNote(`Code ${code} absent d'Open Food Facts. Saisis l'aliment à la main.`);
      }
    } catch (e) {
      setMode("manual");
      setNote("Réseau indisponible. Saisis l'aliment à la main ou utilise la base locale.");
    } finally { setBusy(false); }
  };

  if (found) return <FoundPreview t={t} accent={accent} product={found} onAdd={onAdd} onBack={() => setFound(null)} />;

  const tabs = [
    ["local", "Base", BookOpen, false],
    ["search", "En ligne", Search, true],
    ["scan", "Scan", Barcode, true],
    ["manual", "Manuel", Pencil, false],
  ];

  return (
    <div style={{ marginTop: 10, background: t.raised, border: `1px solid ${t.border}`, borderRadius: 10, padding: 12 }}>
      {state.recipes.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: t.muted, marginBottom: 6 }}>Depuis une recette</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {state.recipes.map((r) => (
              <button key={r.id} onClick={() => onAdd({ name: r.name, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat })}
                style={{ fontSize: 12, color: t.text, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: "6px 9px" }}>
                {r.name} <span style={{ color: t.faint, fontFamily: MONO }}>{r.kcal}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
        {tabs.map(([id, lbl, Icon, proOnly]) => {
          const locked = proOnly && !pro;
          return (
            <button key={id} onClick={() => { setMode(id); setNote(""); }} style={{
              flex: 1, padding: "8px 2px", borderRadius: 9, fontSize: 11.5, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              background: mode === id ? accent : t.surface, color: mode === id ? "#0b0d10" : t.muted,
              border: `1px solid ${mode === id ? accent : t.border}`,
            }}>{locked ? <Lock size={12} /> : <Icon size={13} />} {lbl}</button>
          );
        })}
      </div>

      {mode === "local" && (
        <div>
          <Field t={t} accent={accent} label="Base d'aliments" value={q} onChange={setQ} placeholder="Filtrer : œuf, riz, banane…" />
          <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
            {localMatches(q).map((f) => (
              <button key={f.name} onClick={() => setFound(f)} style={{
                textAlign: "left", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10,
                padding: "9px 11px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 13.5, color: t.text, flex: 1 }}>{f.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 11.5, color: t.faint, whiteSpace: "nowrap" }}>{f.per100.kcal}/100g</span>
              </button>
            ))}
          </div>
          {!pro && (
            <div style={{ marginTop: 12, fontSize: 12, color: t.faint, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Lock size={12} /> Recherche en ligne & scan disponibles avec
              <button onClick={() => setTab("reglages")} style={{ background: "none", color: accent, fontWeight: 700, padding: 0 }}>Pro</button>
            </div>
          )}
        </div>
      )}

      {mode === "search" && (!pro ? (
        <LockPanel t={t} accent={accent} title="Recherche en ligne" desc="Trouve n'importe quel produit dans la base Open Food Facts avec ses calories et macros." onUpgrade={() => setTab("reglages")} />
      ) : (
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <Field t={t} accent={accent} label="Nom du produit" value={q} onChange={setQ} placeholder="Ex. yaourt grec, banane…" style={{ flex: 1 }} />
            <Btn t={t} accent={accent} kind="solid" onClick={runSearch} style={{ height: 44 }}><Search size={16} /></Btn>
          </div>
          {busy && <div style={{ fontSize: 12.5, color: t.muted, padding: "8px 2px" }}>Recherche…</div>}
          {note && <div style={{ fontSize: 12, color: t.faint, padding: "6px 2px" }}>{note}</div>}
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {results.map((p, i) => (
              <button key={i} onClick={() => setFound(p)} style={{
                textAlign: "left", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10,
                padding: "9px 11px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 13.5, color: t.text, flex: 1 }}>{p.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 11.5, color: t.faint, whiteSpace: "nowrap" }}>{p.per100.kcal}/100g</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {mode === "scan" && (!pro ? (
        <LockPanel t={t} accent={accent} title="Scan de code-barres" desc="Scanne un produit avec la caméra : ses calories et macros se remplissent automatiquement." onUpgrade={() => setTab("reglages")} />
      ) : (
        <div>
          <BarcodeScanner t={t} accent={accent} onResult={lookupBarcode} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
            <div style={{ flex: 1, height: 1, background: t.border }} /><span style={{ fontSize: 11, color: t.faint }}>ou à la main</span><div style={{ flex: 1, height: 1, background: t.border }} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <Field t={t} accent={accent} label="Code-barres (EAN)" value={ean} onChange={setEan} placeholder="3017620422003" style={{ flex: 1 }} />
            <Btn t={t} accent={accent} kind="solid" onClick={() => ean.trim() && lookupBarcode(ean.trim())} style={{ height: 44 }}><Search size={16} /></Btn>
          </div>
          {busy && <div style={{ fontSize: 12.5, color: t.muted, padding: "8px 2px" }}>Recherche du produit…</div>}
          {note && <div style={{ fontSize: 12, color: "#ff8a6b", padding: "6px 2px" }}>{note}</div>}
        </div>
      ))}

      {mode === "manual" && (
        <div>
          {note && <div style={{ fontSize: 12, color: accent, padding: "0 2px 10px" }}>{note}</div>}
          <Field t={t} accent={accent} label="Aliment" value={m.name} onChange={(v) => setM({ ...m, name: v })} placeholder="Ex. Banane" />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Field t={t} accent={accent} type="number" label="Kcal" value={m.kcal} onChange={(v) => setM({ ...m, kcal: v })} style={{ flex: 1 }} />
            <Field t={t} accent={accent} type="number" label="P" value={m.protein} onChange={(v) => setM({ ...m, protein: v })} style={{ flex: 1 }} />
            <Field t={t} accent={accent} type="number" label="G" value={m.carbs} onChange={(v) => setM({ ...m, carbs: v })} style={{ flex: 1 }} />
            <Field t={t} accent={accent} type="number" label="L" value={m.fat} onChange={(v) => setM({ ...m, fat: v })} style={{ flex: 1 }} />
          </div>
          <Btn t={t} accent={accent} kind="solid" onClick={() => m.name && onAdd(m)} style={{ width: "100%", marginTop: 10 }}>Ajouter</Btn>
        </div>
      )}

      <button onClick={onCancel} style={{ background: "none", color: t.muted, fontSize: 12.5, marginTop: 12, width: "100%", padding: 4 }}>Annuler</button>
    </div>
  );
}

function Recettes({ state, update, t, accent, pro, setTab, wide }) {
  const [m, setM] = useState({ name: "", kcal: "", protein: "", carbs: "", fat: "" });
  const locked = !pro && state.recipes.length >= FREE_LIMITS.recipes;
  const add = () => {
    if (locked) { setTab("reglages"); return; }
    if (!m.name) return;
    update((s) => { s.recipes.push({ id: uid(), ...m }); return s; });
    setM({ name: "", kcal: "", protein: "", carbs: "", fat: "" });
  };
  return (
    <div>
      {locked ? (
        <Card t={t} style={{ marginBottom: 14 }}>
          <LockPanel t={t} accent={accent} title="Recettes illimitées"
            desc={`Le palier gratuit est limité à ${FREE_LIMITS.recipes} recettes. Passe à Pro pour en enregistrer autant que tu veux.`}
            onUpgrade={() => setTab("reglages")} />
        </Card>
      ) : (
      <Card t={t} accent={accent} topline style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
          <BookOpen size={16} color={accent} /><span style={{ fontWeight: 700 }}>Nouvelle recette</span>
        </div>
        <Field t={t} accent={accent} label="Nom" value={m.name} onChange={(v) => setM({ ...m, name: v })} placeholder="Ex. Poulet patate douce" />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Field t={t} accent={accent} type="number" label="Kcal" value={m.kcal} onChange={(v) => setM({ ...m, kcal: v })} style={{ flex: 1.2 }} />
          <Field t={t} accent={accent} type="number" label="P" value={m.protein} onChange={(v) => setM({ ...m, protein: v })} style={{ flex: 1 }} />
          <Field t={t} accent={accent} type="number" label="G" value={m.carbs} onChange={(v) => setM({ ...m, carbs: v })} style={{ flex: 1 }} />
          <Field t={t} accent={accent} type="number" label="L" value={m.fat} onChange={(v) => setM({ ...m, fat: v })} style={{ flex: 1 }} />
        </div>
        <Btn t={t} accent={accent} kind="solid" onClick={add} style={{ width: "100%", marginTop: 12 }}><Plus size={16} /> Enregistrer la recette</Btn>
      </Card>
      )}

      <div style={{ display: "grid", gap: 8, gridTemplateColumns: wide ? "repeat(2, minmax(0,1fr))" : "1fr" }}>
        {state.recipes.map((r) => (
          <Card key={r.id} t={t} style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: t.muted }}>{r.kcal} kcal · P{r.protein} G{r.carbs} L{r.fat}</div>
            </div>
            <button onClick={() => update((s) => { s.recipes = s.recipes.filter((x) => x.id !== r.id); return s; })} style={iconBtn(t)}>
              <Trash2 size={15} color={t.faint} />
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SUIVI                                                               */
/* ------------------------------------------------------------------ */
function Suivi({ state, update, t, accent }) {
  const [w, setW] = useState("");
  const logs = [...state.weightLogs].sort((a, b) => a.date.localeCompare(b.date));
  const start = state.profile.startWeight ?? (logs[0] && logs[0].weight);
  const goal = state.profile.goalWeight;
  const current = logs.length ? logs[logs.length - 1].weight : null;
  const deltaStart = current != null && start != null ? current - start : null;

  const addWeight = () => {
    const v = num(w);
    if (!v) return;
    update((s) => {
      s.weightLogs = s.weightLogs.filter((x) => x.date !== today());
      s.weightLogs.push({ id: uid(), date: today(), weight: v });
      if (s.profile.startWeight == null) s.profile.startWeight = v;
      return s;
    });
    setW("");
  };

  const weightData = logs.map((l) => ({ date: fmtDate(l.date), poids: l.weight }));

  // Calories 7 derniers jours
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = shiftDate(today(), -(6 - i));
    const lg = state.foodLogs[d];
    const k = lg ? lg.meals.reduce((a, m) => a + m.items.reduce((b, it) => b + num(it.kcal), 0), 0) : 0;
    return { date: fmtDate(d), kcal: Math.round(k) };
  });

  // Volume d'entraînement
  const volData = [...state.workoutLogs].sort((a, b) => a.date.localeCompare(b.date)).slice(-12)
    .map((wl) => ({ date: fmtDate(wl.date), volume: wl.totalVolume }));

  return (
    <div>
      <SectionTitle t={t}>Poids</SectionTitle>
      <Card t={t} accent={accent} topline style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 14, marginBottom: 4 }}>
          <Stat t={t} accent={accent} label="Actuel" value={current ?? "—"} unit="kg" />
          <Stat t={t} accent={accent} label="Départ" value={start ?? "—"} unit="kg" />
          <Stat t={t} accent={accent} label="Δ départ"
            value={deltaStart == null ? "—" : (deltaStart > 0 ? "+" : "") + deltaStart.toFixed(1)} unit="kg" />
          <Stat t={t} accent={accent} label="Objectif" value={goal ?? "—"} unit="kg" />
        </div>
      </Card>

      <Card t={t} style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <Field t={t} accent={accent} type="number" label="Pesée du jour" value={w} onChange={setW} suffix="kg" style={{ flex: 1 }} />
          <Btn t={t} accent={accent} kind="solid" onClick={addWeight} style={{ height: 44 }}><Scale size={16} /> Noter</Btn>
        </div>
      </Card>

      {weightData.length > 0 ? (
        <Card t={t} style={{ marginBottom: 8 }}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weightData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: t.faint, fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fill: t.faint, fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle(t)} />
              {start != null && <ReferenceLine y={start} stroke={t.faint} strokeDasharray="4 4" label={{ value: "départ", fill: t.faint, fontSize: 10, position: "insideTopLeft" }} />}
              {goal != null && <ReferenceLine y={goal} stroke={accent} strokeDasharray="4 4" label={{ value: "objectif", fill: accent, fontSize: 10, position: "insideBottomLeft" }} />}
              <Line type="monotone" dataKey="poids" stroke={accent} strokeWidth={2.5} dot={{ r: 3, fill: accent }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      ) : (
        <Card t={t}><p style={{ margin: 0, color: t.muted, fontSize: 14 }}>Ajoute ta première pesée pour démarrer la courbe.</p></Card>
      )}

      <SectionTitle t={t}>Calories · 7 jours</SectionTitle>
      <Card t={t}>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={last7} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: t.faint, fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: t.faint, fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle(t)} cursor={{ fill: t.grid }} />
            <ReferenceLine y={state.profile.calorieTarget} stroke={t.faint} strokeDasharray="4 4" />
            <Bar dataKey="kcal" fill={accent} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {volData.length > 0 && (
        <>
          <SectionTitle t={t}>Volume d'entraînement</SectionTitle>
          <Card t={t}>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={volData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: t.faint, fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: t.faint, fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle(t)} />
                <Line type="monotone" dataKey="volume" stroke={accent} strokeWidth={2.5} dot={{ r: 3, fill: accent }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* RÉGLAGES                                                            */
/* ------------------------------------------------------------------ */
function Reglages({ state, update, t, accent, pro, setTab }) {
  const setP = (k, v) => update((s) => { s.profile[k] = v === "" ? null : num(v); return s; });
  const setS = (k, v) => update((s) => { s.settings[k] = v; return s; });
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  const activate = async () => {
    const ok = await verifyLicense(code);
    if (ok) { update((s) => { s.settings.pro = true; return s; }); setErr(""); setCode(""); }
    else setErr("Code invalide.");
  };

  return (
    <div>
      <SectionTitle t={t}>Abonnement</SectionTitle>
      <Card t={t} accent={accent} topline style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Crown size={18} color={accent} /><span style={{ fontWeight: 700, fontSize: 16 }}>Athlète OS Pro</span>
          </div>
          <span style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "3px 8px",
            background: pro ? accent : t.raised, color: pro ? "#0b0d10" : t.muted, border: `1px solid ${pro ? accent : t.border}`,
          }}>{pro ? "ACTIF" : "GRATUIT"}</span>
        </div>

        <div style={{ display: "grid", gap: 7, marginBottom: 14 }}>
          {PRO_FEATURES.map((f) => (
            <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: t.text }}>
              <Check size={15} color={pro ? accent : t.faint} /> {f}
            </div>
          ))}
        </div>

        {pro ? (
          <button onClick={() => update((s) => { s.settings.pro = false; return s; })}
            style={{ background: "none", color: t.faint, fontSize: 12, padding: 0 }}>
            Revenir au palier gratuit (test)
          </button>
        ) : (
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <Field t={t} accent={accent} label="Code de licence" value={code} onChange={setCode} placeholder="ATHLETE-PRO" style={{ flex: 1 }} />
              <Btn t={t} accent={accent} kind="solid" onClick={activate} style={{ height: 44 }}>Activer</Btn>
            </div>
            {err && <div style={{ fontSize: 12, color: "#ff6b6b", marginTop: 6 }}>{err}</div>}
            <div style={{ fontSize: 11.5, color: t.faint, marginTop: 8, lineHeight: 1.5 }}>
              Démo : code <span style={{ fontFamily: MONO, color: t.muted }}>ATHLETE-PRO</span>. À remplacer par
              Stripe + ton serveur (un seul point de code à modifier, voir <span style={{ fontFamily: MONO, color: t.muted }}>verifyLicense</span>).
            </div>
          </div>
        )}
      </Card>

      <SectionTitle t={t}>Apparence</SectionTitle>
      <Card t={t} style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: t.muted, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          Couleur d'accent {!pro && <ProPill accent={accent} />}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          {ACCENTS.map((a) => (
            <button key={a.id} onClick={() => setS("accent", a.v)} title={a.label} style={{
              width: 38, height: 38, borderRadius: 11, background: a.v,
              border: accent === a.v ? `3px solid ${t.text}` : `1px solid ${t.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{accent === a.v && <Check size={18} color="#0b0d10" />}</button>
          ))}
          <label style={{ width: 38, height: 38, borderRadius: 11, border: `1px dashed ${t.border}`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", opacity: pro ? 1 : 0.5 }}>
            {pro ? <Pencil size={15} color={t.muted} /> : <Lock size={14} color={t.faint} />}
            {pro && <input type="color" value={accent} onChange={(e) => setS("accent", e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />}
          </label>
        </div>
        {!pro && (
          <div style={{ fontSize: 11.5, color: t.faint, marginTop: -8, marginBottom: 14 }}>
            6 couleurs incluses. La couleur 100 % personnalisée est réservée à Pro.
          </div>
        )}
        <div style={{ fontSize: 12, color: t.muted, marginBottom: 8 }}>Thème</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[["dark", "Sombre"], ["light", "Clair"]].map(([id, lbl]) => (
            <button key={id} onClick={() => setS("theme", id)} style={{
              flex: 1, padding: "11px", borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: state.settings.theme === id ? accent : t.raised,
              color: state.settings.theme === id ? "#0b0d10" : t.muted,
              border: `1px solid ${state.settings.theme === id ? accent : t.border}`,
            }}>{lbl}</button>
          ))}
        </div>

        <div style={{ fontSize: 12, color: t.muted, margin: "16px 0 8px" }}>Affichage</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[["mobile", "Mobile"], ["tablet", "Tablette"]].map(([id, lbl]) => {
            const on = (state.settings.layout || "mobile") === id;
            return (
              <button key={id} onClick={() => setS("layout", id)} style={{
                flex: 1, padding: "11px", borderRadius: 10, fontSize: 14, fontWeight: 600,
                background: on ? accent : t.raised, color: on ? "#0b0d10" : t.muted,
                border: `1px solid ${on ? accent : t.border}`,
              }}>{lbl}</button>
            );
          })}
        </div>
        <div style={{ fontSize: 11.5, color: t.faint, marginTop: 8 }}>
          Tablette : l'app s'élargit et passe en deux colonnes. Mobile : colonne étroite.
        </div>
      </Card>

      <SectionTitle t={t}>Profil & objectifs</SectionTitle>
      <Card t={t} style={{ marginBottom: 14 }}>
        <Field t={t} accent={accent} label="Prénom" value={state.settings.name} onChange={(v) => setS("name", v)} placeholder="Ton prénom" style={{ marginBottom: 10 }} />
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <Field t={t} accent={accent} type="number" label="Poids de départ" value={state.profile.startWeight} onChange={(v) => setP("startWeight", v)} suffix="kg" style={{ flex: 1 }} />
          <Field t={t} accent={accent} type="number" label="Objectif" value={state.profile.goalWeight} onChange={(v) => setP("goalWeight", v)} suffix="kg" style={{ flex: 1 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "6px 0 8px" }}>
          <Target size={15} color={accent} /><span style={{ fontSize: 12, color: t.muted }}>Objectifs nutritionnels journaliers</span>
        </div>
        <Field t={t} accent={accent} type="number" label="Calories" value={state.profile.calorieTarget} onChange={(v) => setP("calorieTarget", v)} suffix="kcal" style={{ marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <Field t={t} accent={accent} type="number" label="Protéines" value={state.profile.proteinTarget} onChange={(v) => setP("proteinTarget", v)} suffix="g" style={{ flex: 1 }} />
          <Field t={t} accent={accent} type="number" label="Glucides" value={state.profile.carbTarget} onChange={(v) => setP("carbTarget", v)} suffix="g" style={{ flex: 1 }} />
          <Field t={t} accent={accent} type="number" label="Lipides" value={state.profile.fatTarget} onChange={(v) => setP("fatTarget", v)} suffix="g" style={{ flex: 1 }} />
        </div>
      </Card>

      <SectionTitle t={t}>Données</SectionTitle>
      <Card t={t}>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: t.muted }}>
          Tout est sauvegardé automatiquement sur cet appareil entre les sessions.
        </p>
        <Btn t={t} accent={accent} kind="danger" onClick={() => {
          if (confirm("Tout effacer ? Cette action est irréversible.")) {
            update(() => structuredClone(DEFAULT_STATE));
          }
        }} style={{ width: "100%" }}><Trash2 size={16} /> Réinitialiser toutes les données</Btn>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Petits composants visuels                                           */
/* ------------------------------------------------------------------ */
function Ring({ pct, accent, t, value, target }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: 86, height: 86, flexShrink: 0 }}>
      <svg width="86" height="86" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="43" cy="43" r={r} fill="none" stroke={t.border} strokeWidth="8" />
        <circle cx="43" cy="43" r={r} fill="none" stroke={accent} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset .5s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 18, color: t.text }}>{value}</span>
        <span style={{ fontSize: 9, color: t.faint, fontFamily: MONO }}>/ {target}</span>
      </div>
    </div>
  );
}
function Macro({ t, label, v, tgt, c }) {
  const pct = tgt ? Math.min(1, v / tgt) : 0;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: t.muted }}>{label}</span>
        <span style={{ fontFamily: MONO, color: t.faint }}>{Math.round(v)}/{tgt || "—"}g</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: t.border, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct * 100}%`, background: c, borderRadius: 3, transition: "width .4s ease" }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers de style                                                    */
/* ------------------------------------------------------------------ */
function iconBtn(t) {
  return { background: t.raised, border: `1px solid ${t.border}`, borderRadius: 9, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center" };
}
function miniInput(t) {
  return { width: 52, background: t.raised, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, padding: "7px 6px", fontSize: 14, fontFamily: MONO, textAlign: "center" };
}
function tooltipStyle(t) {
  return { background: t.raised, border: `1px solid ${t.border}`, borderRadius: 10, color: t.text, fontSize: 12, fontFamily: MONO };
}
function shiftDate(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
