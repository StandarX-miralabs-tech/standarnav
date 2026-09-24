# Auto-montage

`@standarx/nav/auto` est l'utilitaire de démarrage pour une page sans framework et sans crochet de
montage auquel accrocher un système. Ce n'est pas un adaptateur — le cœur *est* déjà l'API vanilla,
et `createInputSystem` tient en un appel. Ce sous-chemin ajoute exactement deux choses à cet appel,
et si vous ne voulez ni l'une ni l'autre, ne l'importez pas.

```html
<html data-snav-mode="app">
  <body>
    <div data-snav="container">
      <button type="button">One</button>
      <button type="button">Two</button>
    </div>
    <script type="module">
      import { autoMount } from "@standarx/nav/auto";
      import { spatialPlugin } from "@standarx/nav/spatial";
      import { gamepadPlugin } from "@standarx/nav/gamepad";

      const nav = autoMount({
        plugins: ({ mode }) => [gamepadPlugin(), spatialPlugin({ mode })],
      });

      // Later, if the page tears itself down:
      // nav.destroy();
    </script>
  </body>
</html>
```

**1. Il attend le document.** Si `document.readyState` vaut encore `"loading"`, `autoMount` diffère
tout jusqu'à `DOMContentLoaded` et vous rend immédiatement une poignée utilisable — `nav.system`
vaut `null` jusque-là. Un `<script type="module">` est différé par la plateforme et ne prend jamais
cette branche ; un `<script>` classique dans le `<head>`, si, et sans cette attente le moteur
spatial recevrait un document dont le `<body>` n'existe pas encore. Appeler `destroy()` avant que
le document soit prêt annule tout et ne construit rien.

**2. La page choisit le mode de navigation.** `data-snav-mode` sur l'élément racine est lu une
fois, avant toute construction, et passé à votre fabrique de plugins. `app` sélectionne `app` ;
**tout le reste — une faute de frappe, une valeur vide, `APP`, ou pas d'attribut du tout — donne
`composite`**, qui est le défaut sûr pour une page web ordinaire
([ADR-0007](../adr/0007-navigation-modes.md)). C'est le seul attribut du paquet qu'aucun moteur ne
lit : une page qui le pose sans jamais appeler `autoMount` obtient le silence, pas un
avertissement.

**`plugins` accepte une fabrique, et c'est tout l'intérêt.** Un tableau fonctionne aussi —
`plugins: [spatialPlugin({ mode: "app" })]` — mais alors le balisage ne configure rien : vous avez
déjà figé le mode dans l'instance, et l'attribut n'a plus rien à quoi s'appliquer. La fabrique
tourne une fois, après que le document est prêt, et reçoit `{ doc, root, mode }`.

Les moteurs restent des imports plutôt que des attributs, délibérément. Un interrupteur dans le
balisage capable de tirer le moteur de manette mettrait ce moteur dans le graphe de toute page qui
importe ce sous-chemin, ce qui est précisément ce que la disposition par sous-chemin existe pour
empêcher ([ADR-0011](../adr/0011-package-layout-and-adapters.md)).

| Export | Ce que c'est |
|---|---|
| `autoMount(options?)` | Construit un système d'entrée et renvoie `{ system, destroy }`. Jamais un import à effet de bord : le paquet est `sideEffects: false`, donc un `import "@standarx/nav/auto"` nu est un module qu'un bundler a le droit de supprimer. |
| `AutoConfig` | Ce que reçoit la fabrique : `doc`, `root`, et le `mode` analysé. |
| `AutoPlugins` | `readonly InputPlugin[]` ou `(config: AutoConfig) => readonly InputPlugin[]`. |
| `AutoMountOptions` | `plugins`, `root`, `doc`, `keymap`, `allowVerticalInText` — les deux derniers sont transmis à `createInputSystem` sans retouche. |
| `AutoMount` | La poignée : `system`, `null` tant que le document n'est pas prêt et de nouveau après `destroy` ; et `destroy()`, qui est idempotent. |

Tout le reste de ce qu'une page peut dire de sa navigation est déjà un attribut que le moteur
spatial lit dans le balisage sans aucune aide d'ici — les conteneurs, `data-snav-enter`, `-wrap`,
`-block`, `-trap`, `-scroll`, `-ignore` et les quatre redirections de direction
([Attributs](attributes.md)). `autoMount` ne déplace pas non plus le focus : le voler au
chargement est une régression sur une page ordinaire, et une télévision qui le veut appelle
`focusFirst()` sur le plugin spatial qu'elle tient déjà.

L'utilitaire ne fait **pas** tourner la suite de parité partagée des adaptateurs, et c'est
délibéré plutôt qu'un oubli. Cette suite affirme ce qu'un *fournisseur* de framework doit faire —
un seul système et pas pendant le premier rendu, l'ordre des portées à travers un rerendu, une
portée relâchée quand seul son propre sous-arbre est démonté. Il n'y a ici ni rendu ni fournisseur
pour la satisfaire. `/auto` porte à la place quatorze cas navigateur qui lui sont propres ; Vue,
Svelte et Angular sont des adaptateurs et font tourner la suite
([ADR-0023](../adr/0023-vanilla-auto-mount.md)).
