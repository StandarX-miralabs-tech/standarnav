# Le contrat de balisage

Deux tables. La première est ce que l'application écrit et que le moteur lit ; la seconde est ce
que le moteur écrit et sur quoi l'application peut styler. Les deux sont le contrat propre de ce
dépôt, fixé par [ADR-0001](../adr/0001-name-scope-and-attribute-prefix.md), et les deux font partie
de ce qui n'est pas gelé avant la v1 : tant que le majeur est 0, une mineure peut en renommer un,
et le CHANGELOG le dit quand c'est le cas.

## Lu par le moteur

| Attribut | Posé sur | Valeur | Effet |
|---|---|---|---|
| `data-snav="container"` | n'importe quel élément | fixe | Déclare un conteneur de navigation ; les déplacements sont d'abord évalués à l'intérieur. |
| `data-snav-enter` | un conteneur | `last` \| `first` \| `nearest` | Quel élément prend le focus quand un déplacement entre. Par défaut `last`, qui retombe sur `nearest` quand l'élément mémorisé a disparu. |
| `data-snav-wrap` | un conteneur | `x` \| `y` \| `both`, ou nu | Reboucle sur le bord opposé au lieu de quitter le conteneur. |
| `data-snav-block` | un conteneur | des directions séparées par des espaces, ou nu | Bloque ces sorties ; nu, bloque toutes. |
| `data-snav-trap` | un conteneur | nu | Un déplacement ne quitte jamais ce conteneur. |
| `data-snav-scroll` | un conteneur | `center` | Fait défiler un élément nouvellement focalisé au centre plutôt qu'au plus proche (`nearest`). |
| `data-snav-ignore` | n'importe quel élément | nu | Exclut l'élément de la liste des candidats. |
| `data-snav-up` / `-down` / `-left` / `-right` | un élément focalisable | un sélecteur CSS | Envoie cette direction vers la première correspondance dans le document, avant toute géométrie. |

Un conteneur est n'importe quel élément portant `data-snav="container"`, et `body` est le conteneur
par défaut quand aucun ancêtre n'en déclare ([ADR-0006](../adr/0006-declarative-first.md)). Un
conteneur imbriqué compte pour un seul candidat aux yeux de son parent, évalué comme un unique
rectangle et non comme l'ensemble de ses enfants. La façon dont le moteur parcourt ces attributs
lors d'un déplacement est décrite dans [navigation.md](navigation.md).

## Écrit par le moteur

| Attribut | Écrit sur | Valeurs |
|---|---|---|
| `data-snav-focused` | l'élément focalisé | nu |
| `data-snav-active` | chaque conteneur sur le chemin vers l'élément focalisé | nu |
| `data-snav-input` | `<html>` | `keyboard` \| `pointer` \| `touch` \| `gamepad` |
| `data-snav-focus-ring` | l'élément de superposition de l'anneau de focus, quand le plugin d'anneau est monté | nu |
| `data-snav-editing` | le champ sur lequel le clavier virtuel est ouvert, quand le plugin clavier est monté | nu |
| `data-snav-keyboard` | la boîte du clavier virtuel | l'identifiant de la disposition |
| `data-snav-keyboard-row` | chaque rangée de touches de cette boîte ; `[data-snav-keyboard-row] button` est une touche | nu |
| `data-snav-keyboard-preview` | la rangée d'aperçu en bas de la boîte, qui reflète le champ et déplace son curseur | nu |
| `data-snav-keyboard-caret` | le curseur dessiné dans la rangée d'aperçu | nu |

Les constantes d'attributs vivent dans `src/spatial/containers.ts`, `src/modality.ts`,
`src/focus-ring/focus-ring.ts` et `src/keyboard/keyboard.ts`. Les noms des attributs de navigation
restent privés et ne font pas partie de l'API publique : les tables ci-dessus sont le contrat, pas
les modules.
