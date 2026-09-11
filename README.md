# 👻 Vanish

Effet "disparition Thanos" (Avengers: Infinity War) sur n'importe quel
élément du DOM — capture l'élément en image ([html2canvas](https://html2canvas.hertzen.com/)),
le décompose en dizaines de fragments de pixels qui s'envolent et
s'estompent en éventail (balayage gauche → droite, comme la poussière
originale), plutôt qu'un simple fondu uniforme.

Inspiré du [CodePen de Szymon](https://codepen.io/scorpsy93/pen/qwzELx),
réécrit ici en petite bibliothèque autonome, indépendante de tout
framework — extrait à l'origine du mode examen de
[Ghost School](https://github.com/Back2CodeLabs/GhostCards).

## Démo

Ouvre `demo/index.html` dans un navigateur (aucun serveur ni build
nécessaire — c'est un simple fichier HTML avec un `<script type="module">`
qui importe `src/vanish.js` directement).

## Utilisation

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script type="module">
  import { vanish } from "./src/vanish.js";

  document.querySelector(".ma-carte").addEventListener("click", (e) => {
    vanish(e.currentTarget, {
      onDone: () => e.currentTarget.remove(),
    });
  });
</script>
```

`vanish()` cherche `html2canvas` sur `window` par défaut (pratique pour un
usage sans build, via CDN) ; dans un projet avec bundler, importe-le
toi-même et passe-le explicitement :

```js
import html2canvas from "html2canvas";
import { vanish } from "vanish-fx";

vanish(element, { html2canvas, onDone: () => element.remove() });
```

### Options

| Option | Défaut | Description |
|---|---|---|
| `onDone` | — | Appelé une fois l'effet terminé (fragments retirés, `element` remis visible). |
| `backgroundColor` | `null` | Couleur de fond à peindre derrière `element` avant capture — **voir piège ci-dessous**. |
| `numFragments` | `40` | Nombre de fragments de pixels générés. |
| `repetitionCount` | `2` | Nombre de fragments auxquels chaque pixel est assigné. |
| `staggerSeconds` | `1.35` | Étalement du déclenchement entre le 1er et le dernier fragment. |
| `transitionSeconds` | `1` | Durée d'envol/fondu de chaque fragment une fois déclenché. |
| `driftDistance` | `70` | Distance horizontale max (px) parcourue par un fragment. |
| `driftLift` | `25` | Décalage vertical (px) vers le haut : la poussière s'envole plus qu'elle ne tombe. |
| `rotation` | `20` | Rotation max (deg) appliquée à un fragment en s'envolant. |
| `html2canvas` | `window.html2canvas` | Injecte ta propre instance (utile en test, ou avec un bundler). |

## ⚠️ Deux pièges à connaître

**Fond transparent** — `html2canvas` ne capture que ce qui est peint sur
`element` lui-même. Si le fond visuel de ta page vient d'un ancêtre plus
haut dans l'arbre (courant : un `<body>` ou un wrapper global avec la
couleur de fond, plutôt que chaque bloc individuellement), les zones
transparentes de `element` capturé le resteront dans les fragments —
l'effet aura l'air "troué" plutôt qu'un vrai bloc de contenu qui se
désintègre. Passe la couleur de fond réelle via `backgroundColor`.

**Frameworks (React/Vue/etc.) : réutilisation de nœud DOM** — si le
contenu affiché à la place d'`element` après l'effet est un élément du
MÊME TYPE au MÊME ENDROIT dans l'arbre (ex. deux `<div>` dans les deux
branches d'un `v-if`/rendu conditionnel), le framework risque de
RÉUTILISER le même nœud DOM plutôt que d'en créer un nouveau — le
`visibility: hidden` posé par Vanish resterait alors collé sur le nouveau
contenu, même si Vanish le remet lui-même à vide juste avant `onDone`
(la réutilisation peut survenir après). Donne à ces deux branches une
clé/condition distincte pour garantir un nœud DOM neuf (ex. `key` en
React).

## Comment ça marche

1. `html2canvas(element)` capture un rendu pixel-perfect de l'élément.
2. Le canvas obtenu est décomposé en `numFragments` fragments : chaque
   pixel est assigné aléatoirement à l'un d'eux (`repetitionCount` fois),
   avec un biais sur sa position x — les pixels de gauche atterrissent
   plutôt dans les premiers fragments (déclenchés tôt), ceux de droite
   dans les derniers (déclenchés tard), d'où le balayage.
3. Les fragments sont empilés dans un calque `position: fixed` collé sur
   `document.body` — **entièrement en dehors de tout arbre qu'un
   framework pourrait gérer**, contrairement au CodePen d'origine qui les
   insère comme frère du nœud dans le DOM de la page. Ça évite de
   perturber la réconciliation d'un composant qui se démonte/re-rend
   pendant l'animation.
4. `element` original passe en `visibility: hidden`.
5. Après un forçage de reflow (sans ça la transition CSS ne se joue pas),
   chaque fragment reçoit sa position finale (translation aléatoire +
   rotation + opacité 0) — la transition CSS, avec un délai échelonné par
   fragment, anime l'envol.
6. Une fois le dernier fragment terminé, le calque est retiré, `element`
   redevient visible, et `onDone` est appelé.

## Licence

[AGPL-3.0](LICENSE).
