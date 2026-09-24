# Angular

`@standarx/nav/angular` est le même système à une instance par arbre, avec un fournisseur autour,
pour Angular 20.0 et au-delà. Les moteurs ne sont délibérément pas importés par l'adaptateur, si
bien qu'une application qui ne mentionne jamais de manette ne paie pas un octet pour elle — vous
construisez les plugins et vous les passez.

```sh
bun add @standarx/nav @angular/core
```

`@angular/core` est une dépendance pair **optionnelle** en `>=20.0.0`, et la seule d'Angular ; rien
en dehors de `src/angular/` ne l'importe, et l'adaptateur est mesuré avec Angular en externe.
L'adaptateur n'est que des fonctions `provide*` et `inject*` posées sur le runtime public
d'Angular — aucun composant, aucune directive, aucun décorateur —, il ne livre donc aucun code
Angular compilé et n'a besoin d'aucun compilateur Angular à lui, et vos composants, compilés par
votre propre build, l'appellent. Ce que React et Vue écrivent comme une balise `<NavProvider>` est
ici une liste de fournisseurs : `provideNav`.

```ts
// main.ts
import { bootstrapApplication } from "@angular/platform-browser";
import { provideNav } from "@standarx/nav/angular";
import { gamepadPlugin } from "@standarx/nav/gamepad";
import { spatialPlugin } from "@standarx/nav/spatial";
import { App } from "./app";

const plugins = [gamepadPlugin(), spatialPlugin({ mode: "app" })];

bootstrapApplication(App, { providers: [provideNav({ plugins })] });
```

```ts
// dialog.ts
import { Component, ElementRef, inject, output } from "@angular/core";
import { injectIntent } from "@standarx/nav/angular";
import { Level } from "./level";

@Component({
  selector: "app-dialog",
  imports: [Level],
  template: `<div data-snav="container" data-snav-trap><app-level /></div>`,
})
export class Dialog {
  readonly closed = output();

  constructor() {
    injectIntent(
      (event) => {
        if (event.intent !== "back") return false;
        this.closed.emit();
        return true;
      },
      { trapped: true, within: inject(ElementRef) },
    );
  }
}
```

```ts
// level.ts
import { Component, ElementRef, inject, signal } from "@angular/core";
import { injectIntent } from "@standarx/nav/angular";

@Component({
  selector: "app-level",
  template: `<div role="radiogroup">…</div>`,
})
export class Level {
  readonly level = signal(0);

  constructor() {
    injectIntent(
      (event) => {
        if (event.intent !== "moveDown" && event.intent !== "moveUp") return false;
        const step = event.intent === "moveDown" ? 1 : -1;
        this.level.update((level) => Math.max(0, Math.min(2, level + step)));
        return true;
      },
      { within: inject(ElementRef) },
    );
  }
}
```

**Un piège nomme sa surface, et un composite à l'intérieur nomme son propre élément.** `Level` est
créé dans le même rendu que `Dialog`. Angular exécute les crochets d'après rendu d'un même rendu
parent d'abord, donc l'adaptateur ouvre les portées d'un rendu dans l'ordre du DOM de leurs
éléments hôtes, les enfants avant les parents : la portée du groupe radio est ouverte la première
et se retrouve *sous* le piège du dialogue, comme elle le serait avec React ou Vue, que `Level` soit
dans le template de `Dialog`, comme ici, ou projeté dedans. Un piège fait taire ce qui est sous lui,
et sans `within` le dialogue ferait taire son propre groupe radio
([issue #14](https://github.com/StandarX-miralabs-tech/standarnav/issues/14)). Avec `within` des
deux côtés, une portée sous le piège dont l'élément se trouve dans la surface du piège est quand
même interrogée — après le piège, parce que l'inclusion ne réordonne pas la pile ; le dialogue ne
revendique donc que ce qui lui appartient (`back` ici) et laisse passer les flèches. Un piège ou
une portée sans `within` se comporte exactement comme avant ; le raisonnement est
[ADR-0025](../adr/0025-trap-within-its-surface.md). `within` accepte un élément, un `ElementRef` —
`inject(ElementRef)` est l'élément hôte du composant — ou un signal ou un accesseur qui rend l'un
ou l'autre. Il est lu à chaque dispatch, donc un élément qui n'existe qu'après le premier rendu est
vu et rien ne rouvre la portée. C'est toujours `data-snav-trap` qui garde le moteur spatial à
l'intérieur du dialogue. Épinglé dans `src/angular/angular.browser.test.ts` par « moves a radio
group mounted with its dialog, both passing their ElementRef », « moves the radio group when its
within is a signal filled after the first render », « moves the radio group when the dialog's
within is an element that existed before », « keeps a radio group that names no element silenced,
as before » et « does not open the scope again when its element fills or change detection runs
again », et l'ordre par « opens a child in its parent's template before its parent » et « opens a
child projected into its parent before its parent » ; `bun run test:browser` les a passés sur
chromium, firefox et webkit le 2026-09-24.

**Où va `provideNav`, et quand il construit.** `provideNav` rend un simple `Provider[]`, qui va à
trois endroits :

- Les fournisseurs de l'application, comme ci-dessus, ou `ApplicationConfig.providers`. Le
  fournisseur est créé avec l'injecteur de l'application, donc un système existe même quand aucun
  composant n'injecte rien — une application avec un plugin spatial et aucune portée navigue.
- Les `providers` d'une route. Le routeur crée un injecteur d'environnement pour la route, et le
  fournisseur est créé avec lui. Le système vit alors aussi longtemps que cet injecteur : le routeur
  garde l'injecteur d'une route après en être parti, sauf si la `RouteReuseStrategy` de la route en
  décide autrement ([ADR-0029](../adr/0029-angular-adapter.md)).
- Les `providers` d'un composant, pour un système qui appartient au sous-arbre de ce composant.
  Angular crée les fournisseurs d'un composant à leur première demande et n'exécute rien au
  démarrage, donc le système est construit dès que quelque chose en dessous le demande — n'importe
  quel `injectIntent` le fait. Quand rien ne le fait, parce que le sous-arbre n'a besoin que d'un
  plugin, le composant qui fournit appelle lui-même `injectInputSystem()`.

Ne l'enveloppez pas dans `makeEnvironmentProviders` : les `providers` d'un composant le refusent
avec NG0207. Épinglé dans `src/angular/angular.browser.test.ts` par « builds a system at bootstrap
when nothing injects anything, for a plugin and no scope », « builds one in an environment injector
created the way a route's is », « builds one in a component's providers once the providing
component asks for it » et « builds nothing in a component's providers that nothing asks for » ;
`bun run test:browser` les a passés sur chromium, firefox et webkit le 2026-09-24.

**Gardez les plugins dans une simple constante.** `options` est un objet, ou un signal ou un
accesseur qui en rend un, relu chaque fois que ce qu'il lit change. Le fournisseur compare la liste
`plugins` élément par élément, donc un accesseur qui rend un nouveau tableau autour des mêmes
instances ne coûte rien — mais un plugin *construit* dans l'accesseur, `provideNav(() => ({
plugins: [gamepadPlugin()] }))`, est un nouvel objet à chaque exécution de l'accesseur : le système
est détruit puis reconstruit, compteur de modalité compris. Un littéral `keymap` n'a pas besoin de
ce soin : il est comparé à un niveau de profondeur. Épinglé dans
`src/angular/angular.browser.test.ts` par « keeps the system when the getter returns a fresh array
around the same plugins », « keeps the system when the getter returns a fresh keymap literal with
the same keys », « rebuilds when the plugins themselves are built in the getter » et « reads a
Signal of options, and rebuilds when its content changes » ; `bun run test:browser` les a passés
sur chromium, firefox et webkit le 2026-09-24.

| Export | Ce que c'est |
|---|---|
| `provideNav(options?)` | `options` est `{ plugins, keymap, allowVerticalInText }`, ou un signal ou un accesseur qui le rend. Rend le `Provider[]` pour une application, une route ou un composant. Construit un système d'entrée après le premier rendu et le détruit avec l'injecteur qui le tient. |
| `injectIntent(handler, options?)` | Ouvre une portée d'intention de la fin du rendu qui a créé le composant appelant à sa destruction. À appeler dans un contexte d'injection : un constructeur ou l'initialiseur d'un champ. `trapped` et `base` acceptent une valeur, un signal ou un accesseur ; un changement rouvre la portée là où elle a été ouverte. `within` — un élément, un `ElementRef`, un signal ou un accesseur — est lu au dispatch et ne la rouvre jamais. La réponse du gestionnaire — `true`, `false`, rien ou `"native"` — atteint le bus sans changement. |
| `injectInputSystem()` | Un `Signal` du système, ou de `null`. |
| `injectIntentScopeHost()` | Un hôte stable pour toute la vie du fournisseur, pour une machine à états qui ouvre ses portées en entrant dans un état. Une portée empilée par lui avant que le système existe est ouverte dès qu'il existe. Son `pushScope` transmet les options telles quelles, donc `within` y est un élément ou un accesseur. `null` sans fournisseur. |
| `injectInputModality()` | Un `Signal` de l'un de `keyboard` \| `pointer` \| `touch` \| `gamepad`, `pointer` jusqu'au premier rendu. Fonctionne sans fournisseur au-dessus. |
| `provideNavDocument(doc)` | `doc` est un `Document`, ou un signal ou un accesseur qui en rend un. Nécessaire seulement quand l'arbre ne vit pas dans le document de la page elle-même — une iframe, une popup, une fixture de test. Va dans les mêmes `providers` que `provideNav`, ou dans un injecteur au-dessus. Relu quand quelque chose de réactif qu'il lit change. |

**Rendu serveur et hydratation.** `injectInputSystem()` répond `null` jusqu'au premier rendu dans
un navigateur, et `null` est ce que rend un serveur : le système est construit par un
`afterRenderEffect`, qu'Angular n'exécute jamais sur un serveur, parce que `createInputSystem` a
besoin d'un document et installe des écouteurs en phase de capture. `injectIntent` ouvre sa portée
depuis un `afterNextRender`, donc rien n'est ouvert sur un serveur non plus, et une portée empilée
par `injectIntentScopeHost` pendant la construction d'un composant est enregistrée puis empilée
quand le système est construit. Les effets de composant, eux, s'exécutent sur un serveur : celui que
crée l'adaptateur, qui rouvre une portée quand `trapped` ou `base` change, n'y trouve rien d'ouvert
et ne touche à aucun document. `injectIntent` n'avertit en développement que lorsqu'il n'y a
réellement aucun fournisseur au-dessus, et seulement après un rendu dans un navigateur. Épinglé par
« renders every function's first answer with no document, and builds nothing » et « builds nothing
from a provider given to the application either » dans `src/angular/angular.test.ts`, qui rendent
avec `renderApplication` de `@angular/platform-server` dans Node, où il n'y a aucun `document`, un
fournisseur au niveau d'un composant et un au niveau de l'application, chaque fonction, et un
`provideNavDocument` dont l'accesseur lève une erreur ; `bun run test:unit` les a passés le
2026-09-24, et le côté client de la même promesse par « renders once with no system, then builds
one after the first render and hands it down » dans `src/angular/angular.browser.test.ts`.

**Zone.js ou sans zone.** L'adaptateur n'a besoin ni de l'un ni de l'autre : il ne planifie rien
lui-même, et ce qu'il écrit, ce sont des signaux, que la détection de changements sans zone voit.
La suite tourne sans zone, le défaut depuis Angular 21 ; sur Angular 20, le mode sans zone se
demande avec `provideZonelessChangeDetection()`, comme le fait le harnais de test
(`src/angular/angular-harness.ts`). Sous Zone.js, lancé une fois le 2026-09-24 sur une copie de ce
dépôt avec `zone.js` 0.16.3 et `provideZoneChangeDetection()`, et pas en CI : 50 des 53 cas
navigateur sont passés. Les trois autres affirment que le premier rendu du fournisseur ne voit
aucun système, dans un harnais qui crée l'application d'abord et son composant une microtâche plus
tard ; Zone.js lance entre les deux une détection de changements sans rien à rendre, et le système
est déjà construit quand le composant est rendu pour la première fois. Démarré avec
`bootstrapApplication` à la place, le premier rendu n'a vu aucun système, avec le fournisseur au
niveau de l'application comme au niveau d'un composant.

**Les portées gardent l'ordre dans lequel elles ont été ouvertes, y compris à travers une
reconstruction.** Un nouveau plugin, `keymap`, `allowVerticalInText` ou document fait détruire son
système au fournisseur, qui en construit un autre. Chaque portée ouverte par `injectIntent` ou par
`injectIntentScopeHost().pushScope` est enregistrée auprès du fournisseur, dans l'ordre de son
ouverture, et le fournisseur les rouvre toutes sur le nouveau système dans cet ordre, au-dessus des
portées que ses plugins empilent, avant qu'aucun composant ne voie le nouveau système
(`createNav`, `src/angular/angular.ts:163`) — le même registre que celui des adaptateurs React, Vue
et Svelte. Un nouveau `trapped` ou `base` laisse lui aussi la portée à sa place. Chaque
`provideNav` garde son propre ordre. Épinglé dans `src/angular/angular.browser.test.ts` par « keeps
sibling host scopes in the order they were opened », « keeps a host trap above a hook scope opened
before it », « keeps a nested composite under the trap of the dialog around it », « keeps a hook
scope opened over a host trap above that trap » et « re-opens a scope in its place when a signal it
was given for trapped changes », et dans la suite partagée par les trois cas « across a system
rebuild » ; `bun run test:browser` les a passés sur chromium, firefox et webkit le 2026-09-24.

Ce que cela ne change pas, c'est l'ordre du premier rendu, que l'adaptateur aligne sur celui de
React : la portée d'un enfant est ouverte avant celle de son parent dans le même rendu. C'est cet
ordre qui fait passer `within` à la recette du dialogue en haut de cette page.

**Les radios et curseurs natifs gardent leurs flèches en mode `app` quand une portée répond
`"native"`.** En mode `app`, le moteur spatial prend toutes les flèches du clavier, si bien qu'un
groupe de radios natif déplace le focus sans rien cocher. Un gestionnaire peut renvoyer `"native"`
à côté de `true` et `false` : le parcours s'arrête avant le moteur et la touche garde son
comportement natif ([ADR-0026](../adr/0026-native-handler-answer.md)).

```ts
import { Component, ElementRef, inject } from "@angular/core";
import { injectIntent } from "@standarx/nav/angular";

@Component({
  selector: "app-sizes",
  template: `<div role="radiogroup">…</div>`,
})
export class Sizes {
  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    injectIntent(
      (event) =>
        event.source === "keyboard" &&
        (event.intent === "moveUp" || event.intent === "moveDown") &&
        host.nativeElement.contains(document.activeElement)
          ? "native"
          : false,
      { within: host },
    );
  }
}
```

Ne répondez que pour le clavier, puisqu'une manette n'a pas de comportement natif pour une
direction, et seulement sur l'axe propre du contrôle — haut et bas ici, gauche et droite pour un
curseur : les flèches d'une télécommande de télévision arrivent sous les mêmes touches, et un
groupe de radios natif boucle sur chromium et firefox, donc l'autre axe doit rester au moteur pour
qu'un utilisateur de télécommande puisse en sortir. Le raisonnement est dans
[Navigation](navigation.md#radios-et-curseurs-natifs-en-mode-app). Épinglé dans
`src/angular/angular.browser.test.ts` par « lets a real ArrowDown check the next radio through
injectIntent », qui vérifie aussi qu'ArrowRight atteint toujours le bouton à côté du groupe, et
« hands a host scope's native answer back unchanged » ; `bun run test:browser` les a passés sur
chromium, firefox et webkit le 2026-09-24. Sur une page servie par Vite et pilotée avec de vraies
touches sur les trois moteurs le même jour, un dialogue contenant ce groupe a coché la radio
suivante sur ArrowDown et ArrowUp, l'a quittée pour le bouton voisin sur ArrowRight, et s'est fermé
sur Escape ([ADR-0029](../adr/0029-angular-adapter.md), Evidence).

**Le plancher est 20.0.0, et il est exécuté.** `DOCUMENT` est exporté par `@angular/core` depuis
20.0.0, et `effect`, `afterRenderEffect` et la forme à fonction de rappel d'`afterNextRender` y
sont des API publiques. Un job CI installe exactement la 20.0.0 d'`@angular/core` et des paquets
Angular que les tests chargent, par-dessus le 22.2 du lockfile, et lance contre elle la
vérification des types, le projet unitaire et la suite navigateur (`angular-floor`,
`.github/workflows/ci.yml:202-226`) ; sur 19.2 l'adaptateur ne se charge pas, « does not provide
an export named 'DOCUMENT' », et pourquoi le plancher est là où il est, c'est
[ADR-0029](../adr/0029-angular-adapter.md). Angular 20 est en support à long terme jusqu'au
2026-11-28 (https://angular.dev/reference/releases, consulté le 2026-09-24). De 20.0.0 à 20.1.6,
l'effet d'après rendu d'un fournisseur détruit reste relié aux signaux que ses options lisent
jusqu'à ce qu'ils soient collectés, ce qu'Angular a corrigé en 20.1.7 ; rien de ce qu'il tient ne
s'exécute plus.

L'adaptateur est tenu à la suite partagée `src/adapter-parity.ts`, les mêmes 16 cas que React, Vue
et Svelte passent — un seul système et pas pendant le premier rendu, un ordre de portées LIFO, une
portée libérée quand seul son propre sous-arbre est démonté, un piège qui arrête le parcours, une
portée de base atteinte à travers ce piège, un composite imbriqué dans une surface qui piège
atteint quand les deux passent `within` et réduit au silence quand aucun ne le fait, une base
réenregistrée à un nouveau rendu sans quitter sa place, et l'ordre d'ouverture des portées conservé
à travers une reconstruction du système. `runAdapterParitySuite` les exécute à
`src/angular/angular.browser.test.ts:1143`, et `bun run test:browser` les a passés sur chromium,
firefox et webkit le 2026-09-24 ([React](react.md), [Vue](vue.md) et [Svelte](svelte.md) tiennent
le même contrat). Angular est le dernier adaptateur dans l'ordre
d'[ADR-0011](../adr/0011-package-layout-and-adapters.md).
