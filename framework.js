// Micro-framework reactivo sin dependencias (~190 líneas).
// API: signal, computed, effect, batch, untrack, html, render, each.

// ---------- 1. Señales ----------
let ctx = null;              // efecto/computo en ejecución
let batchDepth = 0;
const pending = new Set();
const scopeStack = [];       // scopes para dispose de listas/ramas

function flush() {
  batchDepth++;
  try {
    // Consumir uno a uno (sin snapshot): si un computed re-encola un
    // efecto aún no ejecutado, el Set lo deduplica y corre una sola vez.
    let f;
    while ((f = pending.values().next().value) !== undefined) {
      pending.delete(f);
      if (!f.disposed) f();
    }
  } finally { batchDepth--; }
}

function notify(subs) {
  for (const f of subs) if (!f.disposed) pending.add(f);
  if (batchDepth === 0) flush();
}

export function batch(fn) {
  batchDepth++;
  try { fn(); } finally {
    batchDepth--;
    if (batchDepth === 0 && pending.size) flush();
  }
}

export function untrack(fn) {
  const p = ctx; ctx = null;
  try { return fn(); } finally { ctx = p; }
}

export function effect(fn) {
  const e = () => {
    if (e.disposed) return;
    for (const s of e.deps) s.delete(e);
    e.deps.clear();
    const p = ctx; ctx = e;
    try { e.cleanup?.(); fn(); }
    finally { ctx = p; }
  };
  e.deps = new Set(); e.disposed = false;
  e.dispose = () => { e.disposed = true; for (const s of e.deps) s.delete(e); e.deps.clear(); e.cleanup?.(); };
  e.onCleanup = (f) => (e.cleanup = f);
  if (scopeStack.length) scopeStack[scopeStack.length - 1].add(e.dispose);
  e();
  return e;
}

export function signal(init) {
  let v = init;
  const subs = new Set();
  const get = () => { if (ctx) { subs.add(ctx); ctx.deps.add(subs); } return v; };
  get.peek = () => v;
  get.set = (nv) => {
    nv = typeof nv === "function" ? nv(v) : nv;
    if (Object.is(nv, v)) return;
    v = nv; notify(subs);
  };
  get.__isSignal = true;
  return get;
}

export function computed(fn) {
  const s = signal();
  effect(() => s.set(fn()));
  return s;
}

// ---------- 2. Plantillas granulares ----------
export function html(strings, ...values) {
  return { __isTpl: true, strings, values };
}

const isSignal = (x) => typeof x === "function" && x.__isSignal;

function mountValue(marker, value, scope) {
  const parent = marker.parentNode;
  const insert = (n) => parent.insertBefore(n, marker);
  // Ramas condicionales / thunks: sólo re-renderizan este slot
  if (typeof value === "function" && !isSignal(value)) {
    const start = document.createComment("b");
    parent.insertBefore(start, marker);
    let cur = [], curScope = new Set();
    effect(() => {
      curScope.forEach((d) => d()); curScope.clear();
      cur.forEach((n) => n.remove()); cur = [];
      scopeStack.push(curScope);
      try { cur = materialize(value(), curScope); }
      finally { scopeStack.pop(); }
      const live = marker.parentNode;
      cur.forEach((n) => live.insertBefore(n, marker));
    });
    return;
  }
  if (isSignal(value)) {
    const t = document.createTextNode(String(value.peek() ?? ""));
    insert(t);
    const e = effect(() => { t.data = String(value() ?? ""); });
    scope?.add(e.dispose);
    marker.remove();
    return;
  }
  if (value?.__isEach) { mountEach(marker, value, scope); return; }
  if (value?.__isTpl) {
    mountTpl(value, parent, marker, scope);
    marker.remove();
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => {
      const m = document.createComment("i");
      parent.insertBefore(m, marker);
      mountValue(m, v, scope);
    });
    marker.remove();
    return;
  }
  if (value?.nodeType) { insert(value); marker.remove(); return; }
  if (value == null || value === false) { marker.remove(); return; }
  insert(document.createTextNode(String(value)));
  marker.remove();
}

function materialize(v, scope) {
  const frag = document.createDocumentFragment();
  const m = document.createComment("m");
  frag.appendChild(m);
  mountValue(m, v, scope);
  if (m.parentNode) m.parentNode.removeChild(m);
  return [...frag.childNodes];
}

function mountTpl(tpl, parent, before, scope) {
  const { strings, values } = tpl;
  let h = "";
  for (let i = 0; i < strings.length; i++) {
    h += strings[i];
    if (i < values.length) {
      // ¿dentro de una etiqueta? -> atributo/evento, si no -> hijo
      const inside = strings[i].lastIndexOf("<") > strings[i].lastIndexOf(">");
      h += inside ? `__s${i}__` : `<!--s${i}-->`;
    }
  }
  const t = document.createElement("template");
  t.innerHTML = h;
  const frag = t.content.cloneNode(true);
  // 1. Atributos y eventos granulares
  for (const el of frag.querySelectorAll("*")) {
    for (const a of [...el.attributes]) {
      const m = a.value.match(/^__s(\d+)__$/);
      if (!m) continue;
      const v = values[+m[1]];
      const name = a.name;
      el.removeAttribute(name);
      if (name.startsWith("on") && typeof v === "function" && !isSignal(v)) {
        el.addEventListener(name.slice(2), v);
      } else if (isSignal(v)) {
        const e = effect(() => setAttr(el, name, v()));
        scope?.add(e.dispose);
      } else if (typeof v === "function" && !v.__isTpl) {
        const e = effect(() => setAttr(el, name, v()));
        scope?.add(e.dispose);
      } else setAttr(el, name, v);
    }
  }
  // 2. Slots de hijos (comentarios)
  const walker = document.createTreeWalker(frag, 128); // 128 = SHOW_COMMENT
  const marks = [];
  while (walker.nextNode()) if (/^s\d+$/.test(walker.currentNode.data)) marks.push(walker.currentNode);
  marks.forEach((c) => mountValue(c, values[+c.data.slice(1)], scope));
  // 3. Insertar
  const nodes = [...frag.childNodes];
  nodes.forEach((n) => parent.insertBefore(n, before ?? null));
  return nodes;
}

function setAttr(el, name, v) {
  if (v == null || v === false) el.removeAttribute(name);
  else if (name === "value" || name === "checked" || name === "disabled" || name in el) {
    try { el[name] = v; } catch { el.setAttribute(name, String(v)); }
    if (typeof v !== "function") el.setAttribute(name, name === "value" ? String(v) : v === true ? "" : String(v));
    if (v == null || v === false) el.removeAttribute(name);
  }
  else el.setAttribute(name, String(v));
}

// ---------- 3. Listas con clave ----------
export function each(src, keyFn, rowFn) {
  return { __isEach: true, src, keyFn, rowFn };
}

function mountEach(marker, { src, keyFn, rowFn }, scope) {
  const parent = marker.parentNode;
  const end = document.createComment("end");
  parent.insertBefore(end, marker);
  marker.remove();
  const get = isSignal(src) ? src : typeof src === "function" ? computed(src) : () => src;
  const cache = new Map(); // key -> { nodes, scope, item }
  const e = effect(() => {
    const list = get() ?? [];
    const seen = new Set();
    // Reutiliza o crea, en orden, moviendo nodos (sin destruir)
    batch(() => {
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const k = keyFn ? keyFn(item, i) : i;
        seen.add(k);
        let row = cache.get(k);
        // Si el item cambió de identidad (ej. toggle inmutable), recrear
        // sólo esa fila; el resto se reutiliza.
        if (row && !Object.is(row.item, item)) {
          row.scope.forEach((d) => d());
          row.nodes.forEach((n) => n.remove());
          cache.delete(k);
          row = null;
        }
        if (!row) {
          const sc = new Set();
          scopeStack.push(sc);
          let nodes;
          try { nodes = materialize(untrack(() => rowFn(item, i)), sc); }
          finally { scopeStack.pop(); }
          row = { nodes, scope: sc, item };
          cache.set(k, row);
        }
        // mover en orden antes de `end` (padre resuelto en vivo)
        const live = end.parentNode;
        for (const n of row.nodes) live.insertBefore(n, end);
      }
      for (const [k, row] of cache) {
        if (!seen.has(k)) {
          row.scope.forEach((d) => d());
          row.nodes.forEach((n) => n.remove());
          cache.delete(k);
        }
      }
    });
  });
  scope?.add(() => { e.dispose(); cache.forEach((r) => { r.scope.forEach((d) => d()); }); });
}

export function render(tpl, container) {
  container.textContent = "";
  const scope = new Set();
  scopeStack.push(scope);
  try { mountTpl(tpl, container, null, scope); }
  finally { scopeStack.pop(); }
  return () => scope.forEach((d) => d());
}
