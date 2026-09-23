# Comment un déplacement est décidé, et ce qui rend un élément navigable

## Comment un déplacement est décidé

Pour une direction, en partant de `document.activeElement` (`src/spatial/spatial.ts`) :

1. **Redirection.** Si l'élément focalisé porte `data-snav-<direction>`, le sélecteur est résolu
   sur tout le document et le déplacement s'arrête là. Un sélecteur qui ne correspond à rien, ou
   dont la première correspondance n'est pas focalisable — désactivée, cachée, inerte — est
   ignoré, et le déplacement passe à l'étape 2 comme si l'attribut était absent. Test : « ignores
   a redirection to a target that cannot take the focus » (`src/spatial/spatial.browser.test.ts`).
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

Le navigateur a le dernier mot sur l'atterrissage. Si l'élément choisi ne devient pas l'élément
actif après `focus()` — un second `<summary>` dans un `<details>` en est un sur chromium, firefox
et webkit (Playwright, 2026-09-23) — le déplacement renvoie `false` et n'écrit rien :
`data-snav-focused` reste où il était, et aucun conteneur ne mémorise l'élément refusé. Tests :
« writes nothing when the focus does not land » et « reports a move whose target refused the
focus as not made » (`src/spatial/spatial.browser.test.ts`).

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
- `[contenteditable]` ne compte que s'il rend l'élément éditable : `contenteditable="false"`, et
  `inherit` ou une valeur invalide sous un parent non éditable, ne sont pas des candidats, puisque
  le navigateur ne les focalise pas non plus. Un hôte d'édition — un élément éditable dont le
  parent ne l'est pas — est un arrêt de tabulation pour `isTabbable` bien que son `tabIndex` vaille
  -1, sauf s'il porte `tabindex="-1"` ; ce qui est éditable à l'intérieur d'un hôte ne l'est pas.
  Tests : « drops a contenteditable attribute that does not make its element editable » et
  « counts an editing host as a Tab stop, and not what is editable inside it »
  (`src/tabbable.browser.test.ts`).
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

## Radios et curseurs natifs en mode `app`

En mode `app`, le moteur prend toutes les flèches du clavier, si bien qu'un groupe de radios
natifs et un curseur (`range`) perdent les leurs : ArrowDown déplace le focus vers la radio
suivante sans la cocher, et ArrowRight fait quitter le curseur au focus sans le faire avancer. Le
moteur ne devine jamais quels contrôles laisser tranquilles
([ADR-0026](../adr/0026-native-handler-answer.md)) ; c'est une portée qui le dit, en répondant
`"native"`. Le parcours s'arrête alors avant le moteur et la touche est laissée au navigateur :

```ts
const group = document.querySelector<HTMLElement>("#size")!;

const dispose = input.pushScope(
  (event) =>
    event.source === "keyboard" &&
    (event.intent === "moveUp" || event.intent === "moveDown") &&
    group.contains(document.activeElement)
      ? "native"
      : false,
  { within: group },
);
```

- **Le clavier seulement.** Une manette n'a pas de comportement natif pour une direction : un
  `"native"` pour elle arrêterait le parcours sans rien déplacer. La manette continue de se
  déplacer spatialement, et règle un curseur par le mode engagé (`pushEngageScope`).
- **L'axe propre du contrôle seulement.** Haut et bas pour un groupe de radios vertical, gauche et
  droite pour un curseur. Les flèches d'une télécommande de télévision arrivent dans la page sous
  les mêmes touches `ArrowUp` à `ArrowRight`, donc `event.source` ne la distingue pas d'un clavier ;
  et un groupe de radios natif boucle sur chromium et firefox, si bien qu'une télécommande dont
  toutes les flèches lui reviendraient ne pourrait jamais en sortir. L'autre axe reste au moteur,
  qui laisse toujours une sortie.
- **`within` sur le contrôle**, pour que la réponse atteigne encore la portée quand le contrôle se
  trouve dans une boîte de dialogue piégeante qui nomme sa surface
  ([ADR-0025](../adr/0025-trap-within-its-surface.md)).

Tests, avec de vraies frappes sur chromium, firefox et webkit :
`src/native-answer.browser.test.ts` — ArrowDown coche la radio suivante, ArrowRight quitte le
groupe, ArrowRight et ArrowLeft font avancer et reculer un curseur et ArrowDown le quitte, et sans
la portée le moteur se déplace comme avant.
