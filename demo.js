import { signal, computed, effect, html, render, each, batch, untrack } from "./framework.js";

// ---------- Demo 1: Contador ----------
const count = signal(0);
const doble = computed(() => count() * 2);

const counterView = html`
  <section class="card">
    <h2>1 · Contador granular</h2>
    <p>Cuenta: <strong>${count}</strong> · Doble: <strong>${doble}</strong></p>
    <button onclick=${() => count.set((c) => c + 1)}>+1</button>
    <button onclick=${() => count.set((c) => c - 1)}>-1</button>
    <button onclick=${() => batch(() => { count.set(0); })}>reset</button>
  </section>`;

// ---------- Demo 2: Lista de tareas (keyed) ----------
let nextId = 4;
const tareas = signal([
  { id: 1, texto: "Aprender signals", hecho: true },
  { id: 2, texto: "Evitar VDOM", hecho: false },
  { id: 3, texto: "Reconciliar con clave", hecho: false },
]);
const filtro = signal("todas"); // todas | activas | hechas
const visibles = computed(() => {
  const f = filtro();
  const t = tareas();
  return f === "activas" ? t.filter((x) => !x.hecho)
       : f === "hechas"  ? t.filter((x) => x.hecho) : t;
});
const pendientes = computed(() => tareas().filter((t) => !t.hecho).length);

function toggle(id) {
  tareas.set((ts) => ts.map((t) => (t.id === id ? { ...t, hecho: !t.hecho } : t)));
}
function remove(id) {
  tareas.set((ts) => ts.filter((t) => t.id !== id));
}

const inputRef = { el: null };
function add(e) {
  e.preventDefault();
  const v = inputRef.el.value.trim();
  if (!v) return;
  tareas.set((ts) => [...ts, { id: nextId++, texto: v, hecho: false }]);
  inputRef.el.value = "";
}

const todoView = html`
  <section class="card">
    <h2>2 · Tareas con clave</h2>
    <p>Pendientes: <strong>${pendientes}</strong></p>
    <form onsubmit=${add}>
      <input placeholder="Nueva tarea…" ref=${null} />
      <button>Añadir</button>
    </form>
    <div class="filters">
      <button onclick=${() => filtro.set("todas")}>Todas</button>
      <button onclick=${() => filtro.set("activas")}>Activas</button>
      <button onclick=${() => filtro.set("hechas")}>Hechas</button>
      <span>Filtro: <strong>${filtro}</strong></span>
    </div>
    <ul>${each(visibles, (t) => t.id, (t) => html`
      <li class=${() => (t.hecho ? "hecho" : "")}>
        <input type="checkbox" checked=${t.hecho} onchange=${() => toggle(t.id)} />
        <span>${t.texto} <small>#${t.id}</small></span>
        <button onclick=${() => remove(t.id)}>✕</button>
      </li>`)}
    </ul>
  </section>`;

// ---------- Demo 3: Buscador con debounce ----------
const DATOS = ["react", "signal", "computed", "effect", "virtual dom",
  "reconciliación", "granularidad", "plantillas", "debounce", "svelte",
  "solid", "lit", "vue", "angular", "keyed list", "template literals"];
const query = signal("");
const debounced = signal("");
const buscando = signal(false);
let timer = null;
effect(() => {
  const q = query(); // dependencia rastreada
  buscando.set(true);
  clearTimeout(timer);
  timer = setTimeout(() => batch(() => { debounced.set(q); buscando.set(false); }), 300);
});
const resultados = computed(() => {
  const q = debounced().trim().toLowerCase();
  if (!q) return DATOS;
  return DATOS.filter((d) => d.includes(q));
});

const searchView = html`
  <section class="card">
    <h2>3 · Buscador con debounce (300 ms)</h2>
    <input placeholder="Escribe: signal, dom, list…" oninput=${(e) => query.set(e.target.value)} />
    <p>Directo: <code>${query}</code> · Debounced: <code>${debounced}</code>
       ${() => (buscando() ? "⏳ buscando…" : "✓ listo")}</p>
    <ul>${each(resultados, (x) => x, (x) => html`<li>${x}</li>`)}</ul>
  </section>`;

// ---------- App ----------
const app = html`
  <h1>⚡ Mini-reactivo <small>· sin dependencias</small></h1>
  ${counterView}${todoView}${searchView}
  <footer>Abre la consola: verás que escribir NO re-renderiza el contador.</footer>
`;

render(app, document.getElementById("app"));

// Captura el <input> del form de tareas (sin querySelector en el framework)
inputRef.el = document.querySelector("form input");

// Log: demuestra granularidad (sólo se dispara lo suscrito)
effect(() => untrack(() => null)); // warmup
effect(() => console.log("[granular] count =", count()));
effect(() => console.log("[granular] tareas =", tareas().length, "| filtro =", filtro()));
effect(() => console.log("[granular] debounce =", JSON.stringify(debounced())));
