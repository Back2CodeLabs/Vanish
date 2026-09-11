/**
 * Vanish — effet "disparition Thanos" (Avengers: Infinity War) sur
 * n'importe quel élément du DOM.
 *
 * Capture l'élément en image (html2canvas), le décompose en dizaines de
 * fragments de pixels qui s'envolent et s'estompent en éventail plutôt
 * qu'un simple fondu uniforme — inspiré du CodePen de Szymon
 * (scorpsy93/pen/qwzELx), réécrit ici en bibliothèque autonome,
 * indépendante de tout framework (vanilla JS, aucune dépendance hormis
 * html2canvas).
 *
 * Contrairement au CodePen d'origine (qui insère les fragments comme
 * frère du nœud d'origine, dans le DOM géré par la page statique), Vanish
 * les ajoute dans un calque à part collé sur `document.body`, entièrement
 * en dehors de tout arbre qu'un framework (React, Vue...) pourrait gérer —
 * pour ne jamais perturber sa réconciliation si le composant qui a
 * déclenché l'effet se démonte/re-rend pendant l'animation.
 */

const DEFAULTS = {
  numFragments: 40,
  repetitionCount: 2, // chaque pixel est assigné à ce nombre de fragments
  staggerSeconds: 1.35, // étalement du déclenchement entre le 1er et le dernier fragment
  transitionSeconds: 1, // durée d'envol/fondu de chaque fragment une fois déclenché
  backgroundColor: null, // voir README — mets la vraie couleur de fond de l'écran si elle n'est pas portée par `element` lui-même
  driftDistance: 70, // distance horizontale max (px) parcourue par un fragment
  driftLift: 25, // décalage vertical (px) ajouté vers le haut : la poussière s'envole plus qu'elle ne tombe
  rotation: 20, // rotation max (deg) appliquée à un fragment en s'envolant
  timeoutMs: 4000, // si html2canvas ne répond pas (mobile sous-puissant...), abandonne l'effet plutôt que de bloquer indéfiniment
};

// Firefox (constaté sur Android) rend `getImageData` vide/transparent si
// le canvas produit par html2canvas n'a jamais été posé dans le DOM —
// bug connu d'html2canvas sur Firefox (niklasvh/html2canvas#2254), Chrome
// n'a pas ce problème. On le colle donc brièvement hors champ (pas en
// `display:none`, qui déclenche le même bug que ne pas l'ajouter du tout)
// le temps de lire ses pixels, puis on le retire aussitôt.
function readImageData(sourceCanvas) {
  const { width, height } = sourceCanvas;
  sourceCanvas.style.cssText = "position:fixed; left:-99999px; top:0; opacity:0; pointer-events:none;";
  document.body.appendChild(sourceCanvas);
  try {
    return sourceCanvas.getContext("2d").getImageData(0, 0, width, height);
  } finally {
    sourceCanvas.remove();
  }
}

// Découpe le canvas source en `count` fragments : chaque pixel est
// assigné aléatoirement à l'un d'eux, mais avec un biais sur sa position
// x — les pixels de gauche atterrissent plutôt dans les premiers
// fragments (déclenchés tôt), ceux de droite dans les derniers
// (déclenchés tard), d'où le balayage gauche → droite façon Thanos.
function splitIntoFragments(sourceCanvas, count, repetitionCount) {
  const { width, height } = sourceCanvas;
  const ctx = sourceCanvas.getContext("2d");
  const original = readImageData(sourceCanvas);
  const imageDatas = Array.from({ length: count }, () => ctx.createImageData(width, height));

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      for (let r = 0; r < repetitionCount; r++) {
        const fragmentIndex = Math.min(
          count - 1,
          Math.floor((count * (Math.random() + (2 * x) / width)) / 3),
        );
        const pixelIndex = (y * width + x) * 4;
        for (let offset = 0; offset < 4; offset++) {
          imageDatas[fragmentIndex].data[pixelIndex + offset] = original.data[pixelIndex + offset];
        }
      }
    }
  }

  return imageDatas.map((data) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").putImageData(data, 0, 0);
    return canvas;
  });
}

/**
 * Déclenche l'effet sur `element`.
 *
 * `element` est masqué (`visibility: hidden`) pendant l'opération, puis
 * remis visible juste avant que `onDone` soit appelé — c'est à l'appelant
 * de démonter/remplacer son contenu à ce moment-là. N'échoue jamais
 * bruyamment : si html2canvas plante (élément trop complexe, police
 * externe non chargée, image cross-origin sans CORS...), on retombe
 * silencieusement sur `onDone` immédiat plutôt que de bloquer la suite.
 *
 * ⚠️ Piège avec React/Vue/etc. : si le contenu affiché à la place
 * d'`element` après l'effet est un élément du MÊME TYPE au MÊME ENDROIT
 * dans l'arbre (ex. deux `<div>` dans les deux branches d'un ternaire),
 * le framework risque de RÉUTILISER le même nœud DOM plutôt que d'en
 * créer un nouveau — le `visibility: hidden` posé par Vanish resterait
 * alors collé sur le nouveau contenu même après le nettoyage. Donne à ces
 * deux branches une `key` (React) ou un `key`/`v-if` (Vue) distincts pour
 * garantir un nœud DOM neuf.
 *
 * @param {HTMLElement} element
 * @param {object} [options]
 * @param {() => void} [options.onDone] Appelé une fois l'effet terminé (fragments retirés, `element` remis visible).
 * @param {string|null} [options.backgroundColor] Couleur de fond à peindre derrière `element` avant capture (voir README).
 * @param {number} [options.numFragments]
 * @param {number} [options.repetitionCount]
 * @param {number} [options.staggerSeconds]
 * @param {number} [options.transitionSeconds]
 * @param {number} [options.driftDistance]
 * @param {number} [options.driftLift]
 * @param {number} [options.rotation]
 * @param {number} [options.timeoutMs] Si html2canvas ne répond pas dans ce délai, abandonne l'effet et appelle `onDone` plutôt que de bloquer indéfiniment.
 * @param {typeof html2canvas} [options.html2canvas] Injecte ta propre instance d'html2canvas (utile en test) — sinon `window.html2canvas` doit déjà être chargé.
 */
export async function vanish(element, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const finish = () => opts.onDone?.();
  const html2canvas = opts.html2canvas || window.html2canvas;

  if (!html2canvas) {
    console.warn(
      "Vanish : html2canvas introuvable (charge-le avant d'appeler vanish(), ou passe-le via options.html2canvas).",
    );
    finish();
    return;
  }

  try {
    const rect = element.getBoundingClientRect();
    const sourceCanvas = await Promise.race([
      html2canvas(element, { backgroundColor: opts.backgroundColor, scale: window.devicePixelRatio || 1 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("html2canvas timeout")), opts.timeoutMs)),
    ]);

    const overlay = document.createElement("div");
    overlay.style.cssText = `position:fixed; left:${rect.left}px; top:${rect.top}px; width:${rect.width}px; height:${rect.height}px; pointer-events:none; z-index:9999; overflow:visible;`;
    document.body.appendChild(overlay);

    const fragments = splitIntoFragments(sourceCanvas, opts.numFragments, opts.repetitionCount);
    fragments.forEach((fragment, i) => {
      fragment.style.cssText = `position:absolute; left:0; top:0; width:100%; height:100%; opacity:1; transform:translate(0,0) rotate(0deg); transition: transform ${opts.transitionSeconds}s ease-out, opacity ${opts.transitionSeconds}s ease-out; transition-delay:${(opts.staggerSeconds * i) / fragments.length}s;`;
      overlay.appendChild(fragment);
    });

    element.style.visibility = "hidden";

    // Force le reflow avant de fixer l'état final : sans ça le navigateur
    // fusionne les deux changements de style et la transition ne se joue
    // pas (même piège que dans le CodePen d'origine).
    void overlay.offsetLeft;

    fragments.forEach((fragment) => {
      const angle = 2 * Math.PI * (Math.random() - 0.5);
      const dx = opts.driftDistance * Math.cos(angle);
      const dy = (opts.driftDistance / 1.75) * Math.sin(angle) - opts.driftLift;
      const rotation = opts.rotation * (Math.random() - 0.5);
      fragment.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotation}deg)`;
      fragment.style.opacity = "0";
    });

    setTimeout(() => {
      overlay.remove();
      element.style.visibility = "";
      finish();
    }, (opts.staggerSeconds + opts.transitionSeconds) * 1000);
  } catch (e) {
    console.warn("Vanish : effet indisponible, on continue sans.", e);
    finish();
  }
}
