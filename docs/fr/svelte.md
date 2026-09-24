# Svelte

`@standarx/nav/svelte` est le même système à une instance par arbre, avec un fournisseur autour,
pour Svelte 5.0 et au-delà. Les moteurs ne sont délibérément pas importés par l'adaptateur, si bien
qu'une application qui ne mentionne jamais de manette ne paie pas un octet pour elle — vous
construisez les plugins et vous les passez.

```sh
bun add @standarx/nav svelte
```

`svelte` est une dépendance pair **optionnelle** en `>=5.0.0` ; rien en dehors de `src/svelte/` ne
l'importe, et l'adaptateur est mesuré avec Svelte en externe. L'adaptateur n'est que des fonctions
posées sur le runtime public de Svelte — aucun composant, aucune rune, aucun fichier `.svelte` —, il
n'a donc besoin d'aucun compilateur Svelte à lui, et vos composants l'appellent depuis leur
`<script>`. Ce que React et Vue écrivent comme une balise `<NavProvider>` est ici une fonction :
`provideNav`, appelée dans le composant dont le sous-arbre reçoit le système.

```svelte
<!-- App.svelte -->
<script lang="ts">
  import { provideNav } from "@standarx/nav/svelte";
  import { gamepadPlugin } from "@standarx/nav/gamepad";
  import { spatialPlugin } from "@standarx/nav/spatial";
  import Dialog from "./Dialog.svelte";

  const plugins = [gamepadPlugin(), spatialPlugin({ mode: "app" })];
  provideNav({ plugins });

  let open = $state(true);
</script>

{#if open}
  <Dialog onclose={() => (open = false)} />
{/if}
```

```svelte
<!-- Dialog.svelte -->
<script lang="ts">
  import { useIntent } from "@standarx/nav/svelte";
  import Level from "./Level.svelte";

  let { onclose }: { onclose: () => void } = $props();
  let surface = $state<HTMLElement | null>(null);
  useIntent(
    (event) => {
      if (event.intent !== "back") return false;
      onclose();
      return true;
    },
    { trapped: true, within: () => surface },
  );
</script>

<div bind:this={surface} data-snav="container" data-snav-trap>
  <Level />
</div>
```

```svelte
<!-- Level.svelte -->
<script lang="ts">
  import { useIntent } from "@standarx/nav/svelte";

  let group = $state<HTMLElement | null>(null);
  let level = $state(0);
  useIntent(
    (event) => {
      if (event.intent !== "moveDown" && event.intent !== "moveUp") return false;
      const step = event.intent === "moveDown" ? 1 : -1;
      level = Math.max(0, Math.min(2, level + step));
      return true;
    },
    { within: () => group },
  );
</script>

<div bind:this={group} role="radiogroup">…</div>
```

**Un piège nomme sa surface, et un composite à l'intérieur nomme son propre élément.** `Level` est
monté avec `Dialog`, et Svelte exécute le `onMount` d'un enfant avant celui de son parent : la
portée du groupe radio est donc ouverte la première et se retrouve *sous* le piège du dialogue. Un
piège fait taire ce qui est sous lui, et sans `within` le dialogue ferait taire son propre groupe
radio ([issue #14](https://github.com/StandarX-miralabs-tech/standarnav/issues/14)). Avec `within`
des deux côtés, une portée sous le piège dont l'élément se trouve dans la surface du piège est
quand même interrogée — après le piège, parce que l'inclusion ne réordonne pas la pile ; le
dialogue ne revendique donc que ce qui lui appartient (`back` ici) et laisse passer les flèches. Un
piège ou une portée sans `within` se comporte exactement comme avant ; le raisonnement est
[ADR-0025](../adr/0025-trap-within-its-surface.md). `within` accepte un élément ou un accesseur ;
avec `bind:this`, passez l'accesseur `() => surface`, lu à chaque dispatch, donc un élément lié au
montage est vu et rien ne rouvre la portée. C'est toujours `data-snav-trap` qui garde le moteur
spatial à l'intérieur du dialogue. Épinglé dans `src/svelte/svelte.browser.test.ts` par « moves a
radio group mounted with its dialog, its within a getter over bind:this », « moves the radio group
when the dialog's within is an element that existed before init », « keeps a radio group that
names no element silenced, as before » et « does not open the scope again when its bound element
fills or the component re-renders » ; `bun run test:browser` les a passés sur chromium, firefox et
webkit le 2026-09-24.

**Un fournisseur pour un sous-arbre est un composant de deux lignes.** `provideNav` fournit au
composant qui l'appelle et à tout ce qui est sous lui. Quand le système appartient à une partie de
la page plutôt qu'à la racine, enveloppez cette partie dans un composant à vous :

```svelte
<!-- Nav.svelte -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { type InputPlugin, type KeymapOverrides, provideNav } from "@standarx/nav/svelte";

  let { plugins, keymap, children }: {
    plugins: readonly InputPlugin[];
    keymap?: KeymapOverrides;
    children: Snippet;
  } = $props();
  provideNav(() => ({ plugins, keymap }));
</script>

{@render children()}
```

C'est l'accesseur qui laisse une prop modifiée atteindre le fournisseur : Svelte passe l'état
réactif à une fonction sous forme d'accesseur, et `provideNav` le relit chaque fois que ce qu'il lit
change.

**Gardez les plugins dans une simple constante.** Le fournisseur compare la liste `plugins` élément
par élément, donc un accesseur qui rend un nouveau tableau autour des mêmes instances ne coûte rien
— mais un plugin *construit* dans l'accesseur, `provideNav(() => ({ plugins: [gamepadPlugin()] }))`,
est un nouvel objet à chaque exécution de l'accesseur : le système est détruit puis reconstruit,
compteur de modalité compris. Ne les mettez pas non plus dans `$state`, qui remettrait au
fournisseur des proxys de ces plugins. Un littéral `keymap` n'a pas besoin de ce soin : il est
comparé à un niveau de profondeur. Épinglé dans `src/svelte/svelte.browser.test.ts` par « keeps the
system when the getter returns a fresh array around the same plugins », « keeps the system when the
getter returns a fresh keymap literal with the same keys » et « rebuilds when the plugins
themselves are built in the getter » ; `bun run test:browser` les a passés sur chromium, firefox et
webkit le 2026-09-24.

| Export | Ce que c'est |
|---|---|
| `provideNav(options?)` | `options` est `{ plugins, keymap, allowVerticalInText }` ou un accesseur qui le rend. Construit un système d'entrée pour le sous-arbre du composant appelant au montage et le détruit à sa destruction. À appeler pendant l'initialisation du composant, dans son `<script>`. |
| `useIntent(handler, options?)` | Ouvre une portée d'intention du montage du composant à sa destruction. `trapped` et `base` acceptent une valeur ou un accesseur comme `() => open` ; un changement rouvre la portée là où elle a été ouverte. `within` — un élément ou un accesseur — est lu au dispatch et ne la rouvre jamais. La réponse du gestionnaire — `true`, `false`, rien ou `"native"` — atteint le bus sans changement. À appeler dans `<script>`. |
| `useInputSystem()` | `{ current }`, le système ou `null`. |
| `useIntentScopeHost()` | Un hôte stable pour toute la vie du fournisseur, pour une machine à états qui ouvre ses portées en entrant dans un état. Une portée empilée par lui avant que le système existe est ouverte dès qu'il existe. Son `pushScope` transmet les options telles quelles, donc `within` y est un élément ou un accesseur. `null` sans fournisseur. |
| `useInputModality()` | `{ current }`, l'un de `keyboard` \| `pointer` \| `touch` \| `gamepad`, `pointer` jusqu'au montage. Fonctionne sans fournisseur au-dessus. |
| `provideNavDocument(doc)` | `doc` est un `Document` ou un accesseur qui en rend un. Nécessaire seulement quand l'arbre ne vit pas dans le document de la page elle-même — une iframe, une popup, une fixture de test. À appeler **avant** `provideNav`, dans le même composant ou dans un composant au-dessus. L'accesseur est relu quand quelque chose de réactif qu'il lit change. |

**`provideNavDocument` vient en premier.** `provideNav` cherche le document au moment où il est
appelé, et un `provideNavDocument` placé après lui dans le même composant est un document qu'il ne
voit jamais. En développement, cet ordre affiche un avertissement. Épinglé par « warns when it comes
after provideNav in the same component, and only then » dans `src/svelte/svelte.browser.test.ts` ;
`bun run test:browser` l'a passé sur chromium, firefox et webkit le 2026-09-24.

**Rendu serveur et hydratation.** `useInputSystem().current` vaut `null` tant que le fournisseur
n'est pas monté, et `null` est ce que rend un serveur : le système est construit dans `onMount`, que
Svelte n'exécute jamais sur un serveur, parce que `createInputSystem` a besoin d'un document et
installe des écouteurs en phase de capture. `useIntent` ouvre lui aussi sa portée au montage, donc
rien n'est ouvert sur un serveur, et une portée empilée par `useIntentScopeHost` pendant
l'initialisation d'un composant est enregistrée puis empilée quand le système est construit. Chaque
`current` garde la réponse du serveur — `null`, et `"pointer"` pour la modalité — jusqu'au montage,
donc un premier rendu d'hydratation lit ce que le serveur a rendu. `useIntent` n'avertit en
développement que lorsqu'il n'y a réellement aucun fournisseur au-dessus, et seulement lors d'un
montage. Épinglé par « renders every function's first answer with no document, and builds
nothing » dans `src/svelte/svelte.test.ts`, qui rend un fournisseur, chaque fonction et un
`provideNavDocument` dont l'accesseur lève une erreur, avec `render` de `svelte/server` dans Node,
où il n'y a aucun `document` ; `bun run test:unit` l'a passé le 2026-09-24, et le côté client de la
même promesse par « renders once with no system, then builds one on mount and hands it down » dans
`src/svelte/svelte.browser.test.ts`. Parce que le paquet déclare `svelte` en dépendance pair,
`@sveltejs/vite-plugin-svelte` l'intègre au build serveur au lieu de le charger depuis
`node_modules`, si bien que l'adaptateur et l'application partagent un seul runtime Svelte (le
`isSemiFrameworkPkgByJson` du plugin, lu dans son archive 7.3.1,
https://registry.npmjs.org/@sveltejs/vite-plugin-svelte/-/vite-plugin-svelte-7.3.1.tgz, le
2026-09-24).

**Les portées gardent l'ordre dans lequel elles ont été ouvertes, y compris à travers une
reconstruction.** Un nouveau plugin, `keymap`, `allowVerticalInText` ou document fait détruire son
système au fournisseur, qui en construit un autre. Chaque portée ouverte par `useIntent` ou par
`useIntentScopeHost().pushScope` est enregistrée auprès du fournisseur, dans l'ordre de son
ouverture, et le fournisseur les rouvre toutes sur le nouveau système dans cet ordre, au-dessus des
portées que ses plugins empilent, avant qu'aucun composant ne voie le nouveau système
(`provideNav`, `src/svelte/svelte.ts:200`) — le même registre que celui des adaptateurs React et
Vue. Un nouveau `trapped` ou `base` laisse lui aussi la portée à sa place. Chaque `provideNav` garde
son propre ordre. Épinglé dans `src/svelte/svelte.browser.test.ts` par « keeps sibling host scopes
in the order they were opened », « keeps a host trap above a hook scope opened before it », « keeps
a nested composite under the trap of the dialog around it », « keeps a hook scope opened over a
host trap above that trap » et « re-opens a scope in its place when a getter it was given for
trapped changes », et dans la suite partagée par les trois cas « across a system rebuild » ; `bun
run test:browser` les a passés sur chromium, firefox et webkit le 2026-09-24.

Ce que cela ne change pas, c'est l'ordre du premier montage, qui est celui de Svelte : un enfant est
monté avant son parent, donc la portée qu'ouvre un composant est ouverte avant celle qu'ouvre son
parent dans le même montage. C'est cet ordre qui fait passer `within` à la recette du dialogue en
haut de cette page.

**Les radios et curseurs natifs gardent leurs flèches en mode `app` quand une portée répond
`"native"`.** En mode `app`, le moteur spatial prend toutes les flèches du clavier, si bien qu'un
groupe de radios natif déplace le focus sans rien cocher. Un gestionnaire peut renvoyer `"native"`
à côté de `true` et `false` : le parcours s'arrête avant le moteur et la touche garde son
comportement natif ([ADR-0026](../adr/0026-native-handler-answer.md)).

```svelte
<script lang="ts">
  import { useIntent } from "@standarx/nav/svelte";

  let group = $state<HTMLElement | null>(null);
  useIntent(
    (event) =>
      event.source === "keyboard" &&
      (event.intent === "moveUp" || event.intent === "moveDown") &&
      group?.contains(document.activeElement) === true
        ? "native"
        : false,
    { within: () => group },
  );
</script>

<div bind:this={group} role="radiogroup">…</div>
```

Ne répondez que pour le clavier, puisqu'une manette n'a pas de comportement natif pour une
direction, et seulement sur l'axe propre du contrôle — haut et bas ici, gauche et droite pour un
curseur : les flèches d'une télécommande de télévision arrivent sous les mêmes touches, et un
groupe de radios natif boucle sur chromium et firefox, donc l'autre axe doit rester au moteur pour
qu'un utilisateur de télécommande puisse en sortir. Le raisonnement est dans
[Navigation](navigation.md#radios-et-curseurs-natifs-en-mode-app). Épinglé dans
`src/svelte/svelte.browser.test.ts` par « lets a real ArrowDown check the next radio through
useIntent » et « hands a host scope's native answer back unchanged » ; `bun run test:browser` les a
passés sur chromium, firefox et webkit le 2026-09-24. Sur une page servie par Vite et pilotée avec
de vraies touches sur les trois moteurs le même jour, un dialogue contenant ce groupe a coché la
radio suivante sur ArrowDown et ArrowUp, l'a quittée pour le bouton voisin sur ArrowRight, et s'est
fermé sur Escape ([ADR-0028](../adr/0028-svelte-adapter.md), Evidence).

**Le plancher est 5.0.0, et il est exécuté.** Tout ce qu'appelle l'adaptateur — `setContext`,
`getContext`, `getAllContexts`, `onMount`, `untrack`, et `writable`, `toStore` et `fromStore` de
`svelte/store` — est dans Svelte 5.0.0, et rien de plus récent n'est utilisé. Un job CI installe
exactement `svelte@5.0.0` par-dessus le 5.57 du lockfile et lance contre lui la vérification des
types, le projet unitaire et la suite navigateur (`svelte-floor`,
`.github/workflows/ci.yml:169-193`) ; Svelte 4 n'a ni `untrack`, ni `toStore`, ni `fromStore`, et
pourquoi le plancher est là où il est, c'est [ADR-0028](../adr/0028-svelte-adapter.md).

L'adaptateur est tenu à la suite partagée `src/adapter-parity.ts`, les mêmes 16 cas que React et
Vue passent — un seul système et pas pendant le premier rendu, un ordre de portées LIFO, une portée
libérée quand seul son propre sous-arbre est démonté, un piège qui arrête le parcours, une portée de
base atteinte à travers ce piège, un composite imbriqué dans une surface qui piège atteint quand
les deux passent `within` et réduit au silence quand aucun ne le fait, une base réenregistrée à un
nouveau rendu sans quitter sa place, et l'ordre d'ouverture des portées conservé à travers une
reconstruction du système. `runAdapterParitySuite` les exécute à
`src/svelte/svelte.browser.test.ts:724`, et `bun run test:browser` les a passés sur chromium,
firefox et webkit le 2026-09-24 ([React](react.md) et [Vue](vue.md) tiennent le même contrat).
[Angular](angular.md) a suivi le même jour, dans l'ordre
d'[ADR-0011](../adr/0011-package-layout-and-adapters.md).
