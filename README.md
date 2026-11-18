# ⚡ Mini-reactivo

Micro-framework reactivo **sin dependencias** en **258 líneas** (`framework.js`).

- **Señales**: `signal()` / `computed()` / `effect()` con rastreo automático de dependencias.
- **Render granular**: plantillas con template literals (`html\`…\``) que actualizan solo el nodo
  afectado — nunca re-renderizan el árbol entero.
- **Listas con clave**: `each(lista, keyFn, rowFn)` con reconciliación mínima
  (reutiliza, mueve, crea/destruye solo lo necesario).
- **Demos**: contador, lista de tareas y buscador con debounce (`demo.js` + `index.html`).

## Uso

```js
import { signal, computed, html, render, each } from "./framework.js";

const count = signal(0);
const doble = computed(() => count() * 2);

render(html`
  <p>${count} × 2 = ${doble}</p>
  <button onclick=${() => count.set(c => c + 1)}>+1</button>
  <ul>${each(items, t => t.id, t => html`<li>${t.texto}</li>`)}</ul>
`, document.getElementById("app"));
```

Reglas de plantilla:

| Sintaxis | Comportamiento |
|---|---|
| `${signal}` en texto | Actualiza solo ese nodo de texto |
| `${signal}` / `${() => …}` en atributo | Actualiza solo ese atributo |
| `onclick=${fn}` | Listener nativo (se registra una vez) |
| `${() => cond() ? html\`…\` : html\`…\`}` | Re-renderiza **solo ese slot** |
| `${each(...)}` | Lista reconciliada por clave |

> Nota: las filas de `each` se recrean solo si la **referencia** del item cambia
> (actualizaciones inmutables por fila); los reordenamientos con referencias
> estables reutilizan el DOM. `batch(fn)` agrupa notificaciones en una sola pasada.

## Comparativa con el VDOM de React

| Aspecto | Este framework | React (VDOM) |
|---|---|---|
| **Unidad de actualización** | Suscripción fina: cada binding (`Texto`, atributo, fila) se suscribe a sus señales y se actualiza a sí mismo. | Re-render del componente + diff del VDOM contra el snapshot anterior. |
| **Cuándo se ejecuta código de UI** | Solo cuando cambian las dependencias exactas de ese binding. Escribir en el buscador no toca el contador (ver consola). | Todo componente cuyo estado/props cambie se re-ejecuta, aunque gran parte del output sea idéntico. |
| **Diffing** | No hay diff: el comentario-marcador `<!--sN-->` sabe exactamente qué nodo actualizar. Coste O(1) por cambio. | Reconciliación O(n) del subárbol renderizado en cada update. |
| **Listas** | Mapa clave→nodos: reordena moviendo nodos reales, crea/destruye solo diffs; fila inmutable cambiada se recrea aislada. | Reconciliación por `key` sobre VDOM + parcheo posterior al DOM real (doble representación). |
| **Memoria** | Sin árbol virtual: solo el DOM + micro-suscripciones (`Set` por señal). | Mantiene VDOM actual + anterior (o fibras) además del DOM. |
| **Modelo mental** | Push reactivo (Solid/Svelte 5): el dato empuja el cambio al DOM. | Pull + diff (UI = f(estado)): se recalcula y luego se compara. |
| **Costes / contrapartidas** | API de bajo nivel; thunks manuales para ramas; sin diff heurístico que te salve de plantillas ingenuas; ecosistema cero. | JSX + ecosistema + Concurrent/Suspense; paga diff y re-renders defensivos (`memo`, `useMemo`) para recuperar granularidad. |

**Cuándo elegir cada uno**: este enfoque gana en widgets con alta frecuencia de
actualización y DOM grande y estable (dashboards, editores, listas vivas), donde
el VDOM re-diferencia demasiado. React gana en apps grandes con mucho estado
compartido, equipos y necesidad de ecosistema, donde el coste del diff se
amortiza en productividad.

## Probar

```bash
npx serve .   # o: python3 -m http.server
# abrir index.html
```
