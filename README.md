# /refacto : refactoriser avec Claude Code, preuve à l'appui

`/refacto` est un skill pour Claude Code. Il range le code d'une page web, d'une petite application ou d'un script sans rien changer à ce que voit l'utilisateur, et il le prouve par une mesure.

Refactoriser consiste à réécrire du code pour le rendre plus simple à lire et à maintenir, sans modifier son comportement. Toute la difficulté est dans la fin de la phrase. Relire le code ou regarder la page ne suffit pas à garantir que rien n'a bougé : un élément décalé de quelques pixels, un menu qui ne s'ouvre plus sur téléphone ou une couleur qui disparaît en thème sombre passent facilement inaperçus. Ce skill remplace cette vérification à l'œil par une comparaison mesurée, avant et après chaque modification.

![Rapport visuel d'une comparaison : captures avant et après, et image des différences](docs/rapport-exemple.png)

## Sommaire

- [Le principe](#le-principe)
- [Ce que la mesure compare](#ce-que-la-mesure-compare)
- [Les états de la page](#les-états-de-la-page)
- [Le rapport visuel](#le-rapport-visuel)
- [Poids et vitesse](#poids-et-vitesse)
- [Rangement, correction, décision](#rangement-correction-décision)
- [Le déroulé complet](#le-déroulé-complet)
- [Les outils fournis](#les-outils-fournis)
- [Installation](#installation)
- [Utilisation](#utilisation)
- [Limites](#limites)
- [Structure du dépôt](#structure-du-dépôt)
- [Auteur](#auteur)
- [English summary](#english-summary)

## Le principe

Avant toute modification, le skill relève une **empreinte de référence** de la page. Il range ensuite le code par petits lots. Après chaque lot, il relève une nouvelle empreinte et la compare à la référence. Si un écart apparaît, le lot est annulé et refait plus petit.

```mermaid
flowchart TD
    A["Empreinte de référence<br/>avant toute modification"] --> B["Inventaire<br/>code mort, doublons, valeurs répétées"]
    B --> C["Rangement d'un petit lot"]
    C --> D["Nouvelle empreinte<br/>comparée à la référence"]
    D -->|Identique| E{"Reste-t-il<br/>des lots ?"}
    D -->|Écart| F["Lot annulé,<br/>puis refait plus petit"]
    F --> C
    E -->|Oui| C
    E -->|Non| G["Nettoyage<br/>et comparaison finale"]
    G --> H["Rapport visuel"]
```

La règle est simple : une refactorisation n'est terminée que lorsque l'empreinte finale est identique à la référence.

## Ce que la mesure compare

L'empreinte est relevée dans un vrai navigateur (Chromium, piloté par Puppeteer), page par page.

| Élément comparé | Ce qui est relevé | Ce que cela détecte |
|---|---|---|
| Structure de la page | Le DOM rendu, scripts exclus | Un élément ajouté, supprimé ou déplacé, même invisible |
| Styles | Le style calculé de chaque élément visible (42 propriétés) et de ses pseudo-éléments `::before` et `::after`, ainsi que sa position et sa taille | Une marge, une couleur ou une police modifiée |
| Accessibilité | L'arbre lu par les lecteurs d'écran : rôle, nom et état (déplié, coché, désactivé) de chaque élément | Un bouton renommé pour les lecteurs d'écran, un titre qui perd son niveau, un menu qui n'annonce plus s'il est ouvert |
| Focus | L'élément qui a le focus clavier | Une navigation au clavier cassée |
| Débordement | La largeur réelle de la page | Un défilement horizontal apparu sur téléphone |
| Rendu | Une capture de la page, comparée pixel par pixel | Tout écart visible, avec le nombre de pixels touchés et la zone |

Chaque relevé est répété dans toutes les combinaisons suivantes :

| Largeur d'écran | Thème clair | Thème sombre |
|---|---|---|
| 375 px (téléphone) | Mesuré | Mesuré |
| 1440 px (ordinateur) | Mesuré | Mesuré |

Soit quatre relevés pour chaque état de chaque page. Les largeurs se règlent avec l'option `--largeurs`. Le thème sombre n'est mesuré que si la page le prend en charge ; le skill le détecte seul.

Pour que deux mesures successives soient comparables, les animations et transitions sont neutralisées, et le relevé attend le chargement complet des polices. Le skill mesure d'ailleurs la page deux fois avant toute modification : si ces deux mesures diffèrent, la page n'est pas stable et la source d'instabilité est traitée avant de commencer. Les très faibles variations de couleur, typiques d'une photo redimensionnée, sont signalées comme « bruit de rendu » sans compter comme un écart.

### Exemple : une marge modifiée

Sur une page de démonstration, la marge intérieure des cartes passe de 18 à 26 pixels. Extrait du résultat affiché :

```
ÉCART chargement @ 375-clair
   - section#offres:2>article:1 { padding : 18px -> 26px }
   - section#offres:2>article:1 { boite : 20 334 335 95 -> 20 334 335 111 }
   - section#offres:2>article:1>h2:1 { boite : 39 353 297 27 -> 47 361 281 27 }
   - capture : 10513 pixel(s) différent(s) nettement (plus de 40 sur 255), zone x 39-296, y 360-664
```

L'écart est localisé (quel élément, quelle propriété, quelle valeur avant et après) et chiffré à l'écran. L'image en tête de cette page montre le rapport visuel de la même comparaison.

## Les états de la page

Une page ne se résume pas à son affichage au chargement : un menu ouvert, un onglet sélectionné ou un message d'erreur sont autant d'états qu'une modification peut casser. Le skill les trouve de deux façons.

- **L'exploration automatique** (option `--explorer`). L'outil ouvre seul, un par un, chaque bouton, onglet, menu déroulant et lien interne de la page, à partir d'une page rechargée à chaque fois, et capture l'état obtenu. Il ne clique jamais un bouton destructif (supprimer, effacer, réinitialiser, se déconnecter) ni un bouton d'envoi de formulaire, et il ne suit pas un lien qui mène à une autre page : il les liste dans son résultat.
- **Le scénario.** Les états qui demandent plusieurs actions, comme un formulaire rempli puis envoyé ou un parcours complet, sont décrits dans un court fichier, rejoué à l'identique avant et après. Un modèle est fourni (`exemple-etats.mjs`).

Sur une application réelle, l'exploration a ouvert seule 18 états (onglets, feuilles, carrousels), et deux mesures successives sans modification sont ressorties identiques.

## Le rapport visuel

À chaque comparaison, le skill écrit une page HTML à côté de la référence. Pour chaque état en écart, elle montre la capture d'avant, celle d'après et une image des différences : les pixels modifiés en rouge sur la capture pâlie, la zone touchée entourée. Suivent le poids et la vitesse de la page, le bruit de rendu éventuel et la liste des états identiques.

Cette page est autonome (aucune ressource externe), lisible en thème clair comme en thème sombre, sur téléphone comme sur ordinateur. C'est la preuve à montrer à une personne qui ne lit pas le code : un client, un responsable, ou vous-même dans trois mois.

## Poids et vitesse

Au chargement de chaque page, le skill relève le nombre de requêtes, le poids brut et le poids compressé (recalculé en gzip), ainsi que les temps d'affichage. En comparaison, il donne la variation en pourcentage.

Ces chiffres ne comptent jamais comme un écart : ils servent à chiffrer ce qu'une refactorisation fait gagner, ou ce que coûterait une décision, par exemple l'ajout d'une feuille de styles commune à plusieurs pages. Les temps mesurés sur votre machine sont indicatifs.

## Rangement, correction, décision

Le skill classe chaque constat dans l'une de trois familles. Seule la première est traitée sans votre accord.

| Famille | Définition | Exemples | Traitement |
|---|---|---|---|
| **Rangement** | Modifie le code sans rien changer pour l'utilisateur | Code mort, règles CSS en double, couleur répétée à passer en variable, textes écrits en dur à regrouper dans un fichier de données | Effectué, puis vérifié par l'empreinte |
| **Correction** | Change quelque chose pour l'utilisateur | Bug, défaut d'accessibilité, débordement sur téléphone, couleur qui casse le thème sombre | Listé et soumis à votre validation, puis traité dans un lot séparé |
| **Décision** | Choix inhabituel qui a peut-être une raison | Code qui semble dupliqué volontairement, ordre de chargement particulier | Justification recherchée dans la documentation du projet, puis question posée si elle est introuvable |

Cette séparation évite qu'une correction de bug se glisse dans un rangement et fausse la preuve.

## Le déroulé complet

| Étape | Contenu |
|---|---|
| 0. Situer le code | Lecture de la documentation du projet, distinction entre fichiers sources et fichiers générés, sauvegarde de l'état de départ |
| 1. Poser le filet de sécurité | Vérification de la syntaxe, lancement des tests du projet s'il en a, relevé de l'empreinte de référence avec exploration automatique des états |
| 2. Faire l'inventaire | Recherche automatique du code mort et des doublons, lecture du code avec une grille par langage, classement en rangement, correction ou décision |
| 3. Ranger par lots | Du moins risqué au plus risqué : code mort, doublons, variables, données, découpage des fonctions, morceaux communs à plusieurs pages. Comparaison après chaque lot |
| 4. Corrections validées | Uniquement celles que vous avez acceptées, dans un lot à part, vérifiées sur téléphone et sur ordinateur |
| 5. Nettoyage | Suppression de ce que le rangement a rendu inutile et des fichiers de travail, puis comparaison finale |
| 6. Rapport | Le rapport visuel de la comparaison finale, ce qui a été rangé, les chiffres (lignes, poids, états comparés), les écarts expliqués, les points en attente |

Aucun commit, aucun envoi vers un dépôt distant et aucune mise en ligne n'a lieu sans votre accord explicite.

## Les outils fournis

Le skill s'appuie sur cinq scripts Node, dans `skills/refacto/scripts/`. Ils fonctionnent aussi seuls, en ligne de commande.

| Script | Rôle | Commande type |
|---|---|---|
| `empreinte.mjs` | Relève et compare l'empreinte d'une page, d'une application ou d'un site entier, explore ses états, mesure son poids et écrit le rapport visuel | `node empreinte.mjs page.html reference.json --explorer` |
| `sorties.mjs` | Pour un script (construction de site, export) : compare le code de sortie, le texte affiché et les fichiers produits, à l'octet près | `node sorties.mjs reference.json --commande "node build.mjs" --produit dist` |
| `verifier-syntaxe.mjs` | Vérifie la syntaxe des fichiers JavaScript, des scripts écrits dans les pages HTML, des blocs JSON-LD, des fichiers JSON et Python | `node verifier-syntaxe.mjs mon-projet/` |
| `code-mort.mjs` | Liste les suspects : classes CSS jamais utilisées, variables et animations inutilisées, déclarations en double, fonctions jamais appelées, fichiers orphelins | `node code-mort.mjs mon-projet/ --exclure dist` |
| `auto-test.mjs` | Vérifie que les quatre outils précédents fonctionnent sur votre machine (29 contrôles sur un site de test) | `node auto-test.mjs` |

`empreinte.mjs` et `sorties.mjs` suivent la même logique : au premier lancement, la référence est enregistrée ; aux lancements suivants, la mesure est comparée à cette référence. Le code de sortie vaut 0 si tout est identique et 1 sinon, ce qui permet de les utiliser dans une chaîne d'intégration continue.

Principales options d'`empreinte.mjs` :

| Option | Effet |
|---|---|
| `--etats scenario.mjs` | Rejoue un scénario d'états (formulaire rempli, parcours) |
| `--explorer` | Ouvre seul chaque bouton, onglet, menu déroulant et lien interne |
| `--max-etats 25` | Limite le nombre d'éléments ouverts par l'exploration |
| `--toutes-pages` | Mesure toutes les pages HTML d'un dossier, trouvées seules |
| `--exclure dist` | Écarte des chemins, par exemple les fichiers générés |
| `--largeurs 375,1440` | Choisit les largeurs d'écran |
| `--themes clair,sombre` | Choisit les thèmes, au lieu de la détection automatique |
| `--sans-captures` | Compare sans captures, plus rapidement ; le rapport visuel est alors sans images |
| `--seuil-pixel 40` | Écart de couleur, sur 255, à partir duquel un pixel compte comme modifié |

Le skill comprend aussi une grille de lecture par langage (`references/catalogue.md`) : HTML, CSS, JavaScript, scripts Node et Python, nœuds Code de n8n. Pour chaque situation, elle indique quoi faire, dans quelle famille la classer, et le piège à éviter.

## Installation

### Prérequis

- [Claude Code](https://claude.com/claude-code)
- Node.js 18 ou plus récent
- Puppeteer, pour les relevés dans le navigateur :

```
npm install -g puppeteer
```

### Par le gestionnaire de plugins de Claude Code

```
/plugin marketplace add Lilcifer75018/skill-refacto
/plugin install refacto@lilian-barty-refacto
```

Redémarrez ensuite Claude Code.

### Installation manuelle

Copiez le dossier `skills/refacto` dans `~/.claude/skills/`.

### Vérification

```
node ~/.claude/skills/refacto/scripts/auto-test.mjs
```

Le résultat attendu est « 29 contrôles, 0 échec(s) ». Après une installation par plugin, le script se trouve dans `~/.claude/plugins/cache/lilian-barty-refacto/refacto/<version>/skills/refacto/scripts/`.

## Utilisation

Dans Claude Code :

```
/refacto ma-page.html
/refacto mon-site/
```

Une demande formulée librement fonctionne aussi : « refactorise ce script », « nettoie le code de cette page ».

Au lancement, le skill affiche un court mode d'emploi, puis déroule les étapes décrites plus haut. Il vous sollicite dans trois cas seulement : une correction ou une décision à valider, des tests déjà en échec avant de commencer, et l'accord final avant tout commit ou mise en ligne. À la fin, il vous indique où trouver le rapport visuel.

Le skill couvre les pages HTML, les sites statiques, les petites applications web en JavaScript, les scripts Node et Python, ainsi que le code des nœuds Code de n8n.

## Limites

- Le skill garantit que le code rangé se comporte exactement comme avant. Il ne rend pas le code meilleur sur le fond : un bug présent au départ est toujours là à la fin, mais il vous est signalé.
- Il ne modifie pas le design. L'objectif est précisément que rien ne change à l'écran.
- La preuve couvre les états ouverts par l'exploration automatique et ceux décrits dans le scénario. Un état qui demande plusieurs actions et qui ne figure pas dans le scénario n'est pas protégé.
- Sur un site de plusieurs dizaines de pages, l'exploration rallonge nettement la mesure : la limiter avec `--max-etats` et `--largeurs`, ou la réserver aux pages interactives.
- Les éléments animés en continu (bandeau qui défile, compteur) peuvent laisser des écarts de moins de 3 pixels. Ils sont signalés comme tels dans le rapport.
- Les temps d'affichage mesurés sur votre machine sont indicatifs et ne remplacent pas une mesure en conditions réelles.
- Le skill fonctionne dans Claude Code, sur votre machine. Il ne fonctionne pas dans l'application Claude sur le web, qui ne dispose ni de Node ni d'un navigateur piloté.
- Le skill est rédigé en français.

## Structure du dépôt

```
skill-refacto/
├── .claude-plugin/          manifestes du plugin et de la marketplace
├── docs/
│   └── rapport-exemple.png  capture d'un rapport visuel
├── skills/refacto/
│   ├── SKILL.md             instructions suivies par Claude
│   ├── references/
│   │   └── catalogue.md     grille de lecture par langage
│   └── scripts/             les cinq outils et un modèle de scénario d'états
├── CHANGELOG.md
├── LICENSE
└── README.md
```

## Auteur

Lilian Barty-Christophe, consultant freelance en IA à Paris. J'installe des outils IA chez des indépendants et dans des entreprises, puis je forme les équipes qui s'en servent.

Ce skill vient de mes propres projets. Sur mon site, une modification de code avait fait disparaître le bouton de changement de thème de 21 pages, alors que la page d'accueil, seule page épargnée, semblait parfaitement en ordre. La méthode décrite ici a depuis servi à refondre le code du site, puis celui d'une application web, vérifiée sur 86 écrans, tous identiques avant et après.

Site : [lilian-barty.fr](https://www.lilian-barty.fr/)

## English summary

`/refacto` is a Claude Code skill for cleaning up the code of web pages, small apps and scripts without breaking them.

Before touching anything, it takes a snapshot of the page: the DOM, the computed style of each element, the accessibility tree, the focused element and a screenshot. It does this at 375 and 1440 px, in light and dark mode, and in every state of the page: it opens each button, tab and menu by itself, and replays a short script for multi-step states. After each small batch of changes, it takes the snapshot again and compares, pixel by pixel. If it finds a bug on the way, it tells you and leaves it alone.

Each comparison writes a visual report (before, after, and the differences circled in red) and the page weight. It also comes with a dead-code finder and a self-test. The skill is in French. MIT license.

## Licence

[MIT](LICENSE)
