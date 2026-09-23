# Comment un déplacement est décidé, et ce qui rend un élément navigable

## Comment un déplacement est décidé

Pour une direction, en partant de `document.activeElement` (`src/spatial/spatial.ts`) :

1. **Redirection.** Si l'élément focalisé porte `data-snav-<direction>`, le sélecteur est résolu
   sur tout le document et le déplacement s'arrête là.
2. **Géométrie.** Les candidats sont collectés dans le conteneur déclaré le plus proche. Un
   conteneur imbriqué compte pour un seul candidat, évalué comme un unique rectangle et non comme
   l'ensemble de ses enfants. Le candidat le mieux aligné gagne ; à égalité, l'ordre du DOM
   tranche, parce que les candidats sont collectés dans l'ordre du document et que c'est le
   départage que la spécification demande.
3. **Rebouclage.** Si le conteneur reboucle sur cet axe, le déplacement atterrit sur le bord opposé.
4. **Défilement et nouveau balayage.** Si quelque chose peut encore défiler dans cette direction,
   le moteur fait défiler d'un pas — quatre cinquièmes de la fenêtre du défileur lui-même — et
   réessaie une fois à l'image suivante. Une seule fois, sinon une liste sans fin atteignable
   défilerait jusqu'en bas sur une seule pression.
5. **Sortie.** Le parcours passe au conteneur parent et recommence à l'étape 2 — sauf si le
   conteneur piège, bloque cette direction, ou est la racine. Il est borné à seize niveaux.

Quand le parcours se termine sans rien, `onBoundsHit(direction)` est déclenché et le déplacement
renvoie `false`.

`@standarx/nav/spatial` publie les deux fonctions qui parcourent cette liste — `containerOf` et
`collectNavNodes` — pour qu'un diagnostic évalue exactement ce que le moteur évalue, et non quelque
chose qui y ressemble. Les attributs que le parcours lit sont dans [attributes.md](attributes.md).

## Rendre votre élément navigable

- Le moteur voit ce que la plateforme voit : il collecte les éléments correspondant au sélecteur
  des focalisables — `input`, `select`, `textarea`, `button`, `a[href]`, `area[href]`, `iframe`,
  `object`, `embed`, `audio[controls]`, `video[controls]`, `summary`, `[contenteditable]`,
  `[tabindex]` (`src/tabbable.ts`).
- Un `div` avec un `onclick` n'est pas focalisable. Donnez-lui `tabindex="0"`, ou utilisez un vrai
  `button`.
- `aria-hidden` n'est délibérément **pas** filtré : il cache un élément à un lecteur d'écran, pas
  à la croix directionnelle. `isFocusable` rejette un sélecteur non correspondant, un élément
  désactivé, un élément caché et un élément inerte, et rien d'autre. Utilisez `data-snav-ignore`,
  `inert`, ou `display: none`.
- Désactivé veut dire ce que le navigateur entend par là : un contrôle de formulaire portant
  `disabled`, ou placé dans un `<fieldset disabled>` ailleurs que dans sa première `<legend>`. Un
  lien ou un élément à `tabindex` dans ce fieldset reste un candidat, comme il reste focalisable
  dans le navigateur. Tests : « drops what a disabled fieldset disables, and keeps its first legend
  and its links » (`src/tabbable.browser.test.ts`) et « steps over the controls of a disabled
  fieldset » (`src/spatial/spatial.browser.test.ts`).
- Une exception va plus loin que le navigateur : `disabled` sur un élément qui n'est pas un
  contrôle de formulaire, comme `<div tabindex="0" disabled>` ou `<a href disabled>`, l'écarte
  alors que le navigateur le focalise encore. C'est l'échappatoire d'un élément `aria-disabled`
  ([ADR-0009](../adr/0009-hidden-candidates.md), règle 6). Test : « still rejects disabled on an
  element the browser would focus, ADR-0009 rule 6 » (`src/tabbable.browser.test.ts`).
- `aria-disabled` reste un candidat, à dessein, parce que l'APG veut que les éléments désactivés
  restent atteignables. Les ancêtres `inert` et les éléments cachés selon `checkVisibility` sont
  écartés.
- Un élément dont **l'une ou l'autre** dimension est à zéro est écarté — le filtre des candidats
  teste `rect.width === 0 || rect.height === 0`, donc un élément de 0 sur 40 n'est pas un
  candidat. C'est le filtre C1 d'[ADR-0009](../adr/0009-hidden-candidates.md) : il inverse un `&&`
  hérité de l'implémentation antérieure ([ADR-0002](../adr/0002-license-and-copyright.md)), qui
  exigeait les deux dimensions à la fois et laissait passer cet élément de 0 sur 40. Un tel
  rectangle ne peint rien, et sa projection sur l'axe transversal est vide, donc la passe
  d'alignement ne peut jamais le déclarer aligné. La règle est zéro, pas petit — un séparateur
  d'un pixel ou un contrôle volontairement fin reste atteignable. Un candidat à `opacity: 0`
  n'est **pas** filtré : cela lirait un style calculé par candidat dans la boucle chaude et
  manquerait de toute façon l'opacité héritée d'un ancêtre, donc le filtre C2 est refusé pour la
  v0 et reporté à la v1.
- Les racines shadow ne sont pas traversées lors de la collecte des candidats : `getFocusables`
  ne voit que le DOM léger en v0, délibérément, et une fixture pour l'autre comportement est
  garée sous forme de test ignoré. Le raisonnement et la destination en v1 sont dans
  [ADR-0008](../adr/0008-shadow-dom.md).

Quand un déplacement vous surprend, lisez la liste évaluée avec `explainMove` de
`@standarx/nav/debug` (`src/debug.ts`).
