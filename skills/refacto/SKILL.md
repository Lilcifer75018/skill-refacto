---
name: refacto
description: "Refactorisation prouvée de tout ce qui contient du code : pages HTML, mini-applis, sites statiques, démos, scripts Node ou Python, nœuds Code n8n. Rend le code plus simple à lire et à modifier SANS rien changer pour l'utilisateur, et le prouve par mesure : empreinte avant/après (DOM, styles calculés de chaque élément, arbre d'accessibilité, focus, pixels) à 375 et 1440 px, en thème clair et sombre, état par état ; ou sorties identiques à l'octet pour un script. Ouverture automatique des menus et onglets, rapport visuel avant/après, poids et vitesse de chargement. Inventaire outillé du code mort et des doublons, rangement par lots vérifiés un à un, nettoyage, rapport. Les bugs et les choix douteux trouvés en route sont soumis à l'utilisateur, jamais corrigés en silence. Trigger : /refacto [fichier, dossier ou projet], ou « refactorise », « nettoie le code », « simplifie le code de cette page », « range ce script »."
---

# Refactorisation prouvée

## Mode d'emploi (à afficher au lancement)

Quand ce skill est invoqué, afficher d'abord ce court mode d'emploi, puis enchaîner directement si la cible est déjà donnée :

> **/refacto : du code plus simple, rien de changé à l'écran**
> - `/refacto [fichier ou dossier]` : je range le code d'une page, d'une application ou d'un script
> - Je relève d'abord une empreinte de ce que voit l'utilisateur (téléphone et ordinateur, thème clair et sombre, chaque menu ouvert). Je range ensuite le code par petits lots et, après chaque lot, je vérifie que tout est identique au pixel près
> - Je range seul ce qui ne change rien pour l'utilisateur. Un bug trouvé en route, ou un choix qui ressemble à une décision, vous est soumis : je n'y touche pas
> - À la fin, un rapport visuel montre les captures avant et après, les écarts entourés, et le poids de la page
> - Rien n'est commité, poussé ni mis en ligne sans votre accord

## La règle d'or

Refactoriser, c'est changer la façon dont le code est écrit sans changer ce qu'il fait. Ici, cela se **prouve par mesure**, jamais par relecture. Une refactorisation n'est finie que quand l'empreinte d'après est identique à celle d'avant ; « j'ai relu, ça devrait être pareil » ne compte pas.

Trois conséquences :
- On mesure AVANT de toucher au code. Sans empreinte de référence, pas de refactorisation.
- Tout ce qui changerait quelque chose pour l'utilisateur (bug, accessibilité, affichage mobile, texte) n'est PAS de la refactorisation. C'est une correction : elle se liste, se soumet à l'utilisateur et se fait dans un lot à part, jamais mélangée au rangement.
- Un choix qui paraît étrange est peut-être une décision. Chercher sa justification (README, notes de passation, historique git, commentaires) avant d'y toucher, et dans le doute, demander.

## Les outils du skill

Cinq scripts dans le dossier `scripts/` de ce skill. Il faut Node 18 ou plus, et Puppeteer pour `empreinte.mjs` (`npm install -g puppeteer`, une fois). Les fichiers qu'ils produisent (empreintes, captures) vont dans un dossier temporaire, jamais dans le projet.

| Script | Sert à | Commande |
|---|---|---|
| `verifier-syntaxe.mjs` | Tout le code se lit-il sans erreur ? Fichiers .js/.mjs/.cjs, scripts écrits dans les pages HTML (modules compris), JSON-LD, .json, .py | `node verifier-syntaxe.mjs <dossier>` |
| `code-mort.mjs` | Inventaire des suspects : classes et identifiants jamais posés, variables CSS et @keyframes inutilisées, déclarations CSS en double, fonctions jamais appelées, fichiers orphelins | `node code-mort.mjs <dossier> --exclure <fichier généré>` |
| `empreinte.mjs` | Preuve pour une page ou une appli : DOM, style calculé de chaque élément et de ses pseudo-éléments, arbre d'accessibilité, focus, débordement horizontal, pixels, dans chaque état, à 375 et 1440 px, en clair et en sombre. Relève aussi le poids et la vitesse de chargement, et écrit un rapport visuel | `node empreinte.mjs <page> <ref.json> --etats etats.mjs --explorer` |
| `sorties.mjs` | Preuve pour un script : code de sortie, texte affiché (dates et durées masquées), fichiers produits à l'octet près | `node sorties.mjs <ref.json> --commande "node build.mjs" --produit dist` |
| `auto-test.mjs` | Vérifie que les quatre outils voient ce qu'ils doivent voir, et rien quand il n'y a rien (36 contrôles sur un site de test) | `node auto-test.mjs` |

`empreinte.mjs` et `sorties.mjs` fonctionnent de la même façon : si la référence n'existe pas, elle est créée ; si elle existe, elle sert de comparaison. Code de sortie 0 si tout est identique, 1 sinon, et chaque écart est montré en clair (élément, propriété, avant, après, nombre de pixels et zone touchée).

Pour un site entier, `empreinte.mjs <dossier> <ref.json> --toutes-pages --exclure build` trouve seul toutes les pages. Ainsi, une page ajoutée entre dans la mesure sans rien déclarer : un outil dont la liste de pages est écrite à la main finit toujours par en oublier.

`exemple-etats.mjs` est le modèle du scénario d'états. Chaque état que l'utilisateur peut voir doit y être capturé : menu ouvert, onglet, feuille, message d'erreur, formulaire rempli, lien direct vers une ancre. **Un état non capturé est un état non protégé.**

Avant chaque capture, `empreinte.mjs` fige les animations, les transitions et le curseur de saisie, puis ramène la souris dans le coin supérieur gauche : un clic du scénario (`page.click`) ne laisse ainsi aucun survol sur l'écran suivant. Pour capturer un survol voulu (menu qui s'ouvre au survol, infobulle), appeler `await page.hover(sel)` puis `await capturer(nom, { garderSouris: true })`.

**Page protégée par une règle de sécurité stricte** (`Content-Security-Policy` sans `'unsafe-inline'` pour les styles, en en-tête ou en balise `<meta>`) : la règle interdit la feuille qui fige les animations. `empreinte.mjs` s'en aperçoit dès le premier état, s'arrête sans écrire de référence et demande l'option `--contourner-csp`, qui lève la règle dans le navigateur de test, et là seulement. La mesure a alors un angle mort : un changement que la règle bloquerait en ligne (balise `<style>` ou script écrit dans la page, attribut `onclick`, ressource d'un autre domaine) échappe à la mesure, puis casse la page publiée. Avec cette option, vérifier donc aussi dans le diff qu'aucun code n'a été écrit dans la page et qu'aucune ressource d'un autre domaine n'a été ajoutée, puis lancer les tests du projet qui ouvrent la page avec sa règle, s'il en a. C'est aussi pourquoi l'option n'est jamais active par défaut.

Ce que `empreinte.mjs` apporte en plus de la comparaison :
- **`--explorer`** : l'outil ouvre seul, un par un, chaque bouton, onglet, menu déroulant, élément `<summary>` et lien interne de la page, à partir d'une page rechargée et d'un stockage vide, puis capture l'état obtenu. Un état oublié dans le scénario reste ainsi protégé. Il ne clique jamais un bouton destructif (supprimer, effacer, réinitialiser, se déconnecter) ni un bouton d'envoi de formulaire, et ne suit pas un lien qui mène à une autre page : il les liste. Le scénario reste nécessaire pour les états à plusieurs étapes (formulaire rempli, parcours complet). Sur un site entier, limiter le coût avec `--max-etats` et `--largeurs 375`, ou n'explorer que les pages qui ont des éléments interactifs.
- **Accessibilité** : l'arbre que lit un lecteur d'écran (rôles, noms, états déplié ou coché) est relevé dans chaque état. Un bouton dont le nom accessible change, un titre qui perd son niveau ou un menu qui ne dit plus s'il est ouvert sont des écarts, même si l'écran est identique.
- **Poids et vitesse** : au chargement de chaque page, le nombre de requêtes, le poids brut et compressé (gzip recalculé) et les temps d'affichage. En comparaison, la variation est donnée en pourcentage. C'est une information, jamais un écart : elle sert à chiffrer le gain d'une refactorisation ou le coût d'une extraction (voir l'étape 2). Les temps mesurés en local sont indicatifs.
- **Rapport visuel** : en comparaison, `<référence>.rapport.html` est écrit à côté de la référence. Pour chaque état en écart, il montre la capture d'avant, celle d'après et une image des différences (pixels changés en rouge, zone entourée), puis le poids et la vitesse, le bruit de rendu et la liste des états identiques. Il se lit sans connexion, en clair comme en sombre, sur téléphone comme sur ordinateur. C'est la preuve à montrer à quelqu'un qui ne lit pas le code.

Lancer `auto-test.mjs` au premier usage et après toute modification d'un script. Un outil de preuve qui ment est pire que pas d'outil du tout.

## Déroulé

### Étape 0 : situer le code

Avant tout :
- Lire ce qui documente le projet (README, notes de passation, conventions) avant la première modification.
- Qu'est-ce qui est source, qu'est-ce qui est généré ? Une page assemblée par un script (`dist`, `build`, page « compilée ») ne se refactorise pas à la main : on refactorise la source, puis on reconstruit. Les fichiers générés sont exclus de l'inventaire (`--exclure`).
- Comment la page se lance-t-elle ? Écran d'ouverture à sauter, clé de stockage à poser, bannière de cookies : tout cela va dans la fonction `preparer()` du scénario.
- Sauvegarde : dans un dépôt git, l'état de départ suffit (rien n'est commité sans demande). Hors git, copier les fichiers concernés dans un dossier temporaire avant la première modification.
- Des modifications non commitées traînent déjà ? Mesurer la référence sur un export du dernier commit (`git worktree add` ou `git archive HEAD`), pas sur la copie de travail. Sinon, on compare à un état qui n'a jamais été en ligne.
- Fins de ligne : si le dépôt mélange CRLF et LF, le bruit noie les vrais écarts. Sur un site réel, 17 pages « modifiées » sur 25 ne l'étaient que par leurs fins de ligne, et elles cachaient 8 vraies dérives. Normaliser d'abord, idéalement avec un `.gitattributes` en `eol=lf`.

### Étape 1 : poser le filet de sécurité

Dans cet ordre, avant de modifier une seule ligne :
1. `verifier-syntaxe.mjs` sur le projet. Une erreur existe déjà ? La signaler, et ne pas refactoriser par-dessus.
2. Les tests du projet, s'il en a. Ils doivent être verts. S'ils sont rouges avant de commencer, le dire et s'arrêter là.
3. L'empreinte de référence :
   - page ou appli : écrire le scénario d'états (copie de `exemple-etats.mjs`), puis lancer `empreinte.mjs` avec `--explorer`. Lire la liste des éléments non ouverts qu'il affiche : un état important qui en fait partie va dans le scénario. Relancer aussitôt en comparaison, SANS rien avoir modifié : s'il trouve des écarts, la page n'est pas stable (visuel posé au hasard, date, animation). Neutraliser la source d'instabilité dans le scénario, au lieu d'ignorer les écarts ;
   - script, construction de site : `sorties.mjs` avec les mêmes entrées qu'en usage réel ;
   - nœud Code n8n : récupérer les éléments d'entrée d'une exécution réelle et les rejouer dans un petit harnais local, où `$input.all()` renvoie ces éléments, puis passer ce harnais à `sorties.mjs`. Un secret en clair trouvé en route se signale ; il ne se « range » pas.

### Étape 2 : faire l'inventaire

1. `code-mort.mjs` sur les sources, sans les fichiers générés. Chaque ligne est un suspect. Avant de supprimer, le confirmer par une recherche dans tout le projet, dans les autres pages du site et dans les outils tiers.
2. Lecture du code avec la grille de `references/catalogue.md` (HTML, CSS, JavaScript, scripts, n8n). Ne charger que la section du langage concerné.
3. Classer chaque constat dans l'une des trois familles :
   - **Rangement**, sans effet visible : doublon, code mort confirmé, valeur répétée à passer en variable, texte écrit en dur à sortir dans un fichier de données, fonction trop longue. Il se fait sans demander, puisque l'utilisateur a demandé une refactorisation ;
   - **Correction**, qui change quelque chose pour l'utilisateur : bug, défaut d'accessibilité, débordement à 375 px, couleur codée en dur qui casse le thème sombre. On la liste sans la faire ;
   - **Décision**, un choix qui a peut-être une raison (texte, ordre, comportement inhabituel) : on cherche sa justification, et on la liste si on ne la trouve pas.

Mesurer avant d'extraire. Mettre en commun ce qui se répète a un coût : une feuille de styles partagée, c'est une requête bloquante de plus pour chaque visiteur. Chiffrer ce coût en Ko compressés (la ligne « Poids et vitesse » d'`empreinte.mjs` le donne, page par page) et le comparer au gain. Et ne mettre en commun que ce qui est **strictement identique** : deux règles au même nom mais aux valeurs différentes sont des faux jumeaux, pas des doublons. Sur un site réel, 29 sélecteurs l'étaient, `:root` portait 10 palettes différentes, et seules 11 règles étaient vraiment identiques partout. Ce qui est écarté après mesure s'écrit dans le rapport avec ses chiffres, pour que la prochaine session ne refasse pas l'analyse.

Point d'arrêt : s'il y a des corrections ou des décisions, les soumettre à l'utilisateur sous forme de questions à choix, avec une recommandation. Les formuler en langage concret (« le menu ne se ferme pas avec Échap sur téléphone »), jamais en jargon. Le rangement, lui, continue pendant ce temps.

### Étape 3 : ranger par lots vérifiés

Ordre des lots, du moins risqué au plus risqué :
1. Code mort confirmé.
2. Doublons : règles CSS, fonctions, gabarits HTML répétés.
3. Valeurs répétées passées en variables : couleurs en variables de thème (avec leur valeur sombre), échelle de tailles de texte, espacements, durées d'animation.
4. Textes et données sortis du code vers un seul fichier. Bonus : plus aucune apostrophe à échapper.
5. Fonctions trop longues découpées, noms clairs, état centralisé. Un nom qui ment se renomme : sur un site réel, `--au` voulait dire « aubergine » partout, sauf sur une page où il était vert. Renommer sans toucher à aucune valeur, ce que prouve un diff équilibré (autant de lignes ajoutées que retirées).
6. Même bloc copié dans plusieurs pages (en-tête, pied de page, script de thème) : des morceaux communs, assemblés par un petit script de construction. Ce lot a ses propres pièges, décrits dans la section dédiée plus bas.
7. Réorganisation des fichiers en dernier, et seulement si elle apporte quelque chose.

Après CHAQUE lot : `verifier-syntaxe.mjs`, les tests du projet, puis la comparaison d'empreinte ou de sorties. Et si un écart apparaît ?
- Il n'était pas voulu : annuler le lot, comprendre, refaire plus petit.
- Il est voulu, expliqué et sans effet visible (exemple réel : la couleur d'une étiquette masquée) : le noter pour le rapport. On ne régénère JAMAIS la référence pour faire disparaître un écart qu'on ne sait pas expliquer.

Garder le style du code en place : mêmes conventions de nommage, même densité de commentaires, même langue que le projet pour les noms.

### Étape 4 : les corrections validées, à part

Les corrections validées par l'utilisateur se font APRÈS le rangement, dans un lot distinct, et leur effet se vérifie à l'écran, à 375 px et sur ordinateur. L'empreinte montre alors des écarts attendus : vérifier qu'ils ne touchent que ce qui devait changer.

### Étape 5 : nettoyer

La passe de nettoyage fait partie du travail :
- plus aucune règle CSS, variable, fonction ou image devenue morte à cause du rangement (relancer `code-mort.mjs` et comparer au premier inventaire) ;
- aucun échafaudage laissé dans le projet : scripts jetables, `console.log` de débogage, fichiers de référence, captures ;
- aucun commentaire ni aucune documentation qui décrive encore l'état d'avant ;
- si la page est construite par un script, la reconstruire et vérifier que la page générée correspond.

Puis une dernière comparaison complète, avec la même exigence que pendant le rangement.

### Étape 6 : rendre compte

- Le détail va dans la documentation du projet : ce qui a été rangé, lot par lot ; les chiffres (lignes avant et après, poids de la page, nombre d'états et de contrôles comparés) ; les écarts expliqués ; les corrections et décisions en attente.
- À l'utilisateur, le résultat en une phrase (« rangé, 86 états identiques au pixel près »), puis ce qui l'attend : une question, ou le feu vert pour la mise en ligne. Lui proposer le rapport visuel de la dernière comparaison, avec son chemin : c'est la preuve qu'il peut montrer.
- Aucun commit, aucun push, aucune mise en ligne sans demande explicite. Après une mise en ligne validée, refaire la comparaison sur le site en ligne (`empreinte.mjs` accepte une adresse publique).

## Code copié dans plusieurs pages : les morceaux communs

Méthode éprouvée sur lilian-barty.fr, où 32 pages portaient le même script de thème et le même bouton clair/sombre :
- les sources éditables vivent à part (`build/pages/`), avec des marqueurs `<!--#include nav.html-->`. Un script de construction local fabrique les pages servies, qui restent celles qu'on commite. Rien ne change côté hébergeur ;
- quand un morceau varie légitimement d'une page à l'autre (la liste des liens du menu), la page déclare sa valeur (`<!--#def liens-->...<!--#enddef-->`) et le morceau la reprend (`<!--#use liens-->`). Un `use` sans `def` est une erreur de construction, jamais un trou silencieux ;
- les inclusions se résolvent en boucle, avec une limite de 10 passes. En une seule passe, un morceau qui en contenait un autre laissait un marqueur non résolu, et le bouton de thème avait disparu de 21 pages ;
- ne pas forcer l'unité. Des pieds de page qui vont de 75 octets à 2,7 Ko ne sont pas des variantes d'un même gabarit, ce sont des familles différentes : un morceau par famille, et les familles se font valider avant d'écrire le code.

Le piège le plus coûteux : **chaque page existe alors en deux exemplaires**, la source et la page servie, et on finit toujours par éditer celle qu'on voit. Sur ce site, 8 pages ont dérivé pendant trois semaines, et une construction lancée à ce moment-là aurait remis en ligne une version périmée sans avertissement. D'où deux protections : un mode `--check` qui compare sources et pages servies avant toute construction, et une sortie de secours qui rejoue la construction à l'envers et n'écrit rien si une seule page ne retombe pas juste à l'octet près.

## Pièges déjà rencontrés

- **L'attribut `hidden` battu par une règle `display`** : un élément « caché » reste affiché si une règle CSS lui donne `display:flex` ou `block`. Garder ou ajouter `[hidden]{display:none!important}` quand on range des règles `display`.
- **Une apostrophe non protégée dans un texte** casse tout le script de la page, sans aucun message visible. D'où `verifier-syntaxe.mjs` avant chaque test, et les textes sortis dans un fichier de données.
- **Écran d'ouverture, visite guidée, bannière de cookies** : ils couvrent la page et faussent l'empreinte. Les sauter dans `preparer()`, en posant la clé de stockage qu'ils consultent.
- **Éléments posés au défilement ou au hasard** (visuels de fond, citations tournantes) : ils changent d'une exécution à l'autre. Les neutraliser dans le scénario, après avoir constaté l'instabilité par une double mesure à vide.
- **Fichiers générés dans le dossier inventorié** : tout y apparaît en double, donc toujours `--exclure`. Même chose pour un serveur de test local, qui ne respecte pas les fichiers d'exclusion de l'hébergeur (`.vercelignore`) : les sources d'un build y sont servies comme des pages.
- **Images chargées par concaténation** (`'illustration-' + cle + '.webp'`) : elles n'apparaissent nulle part en clair. Sur un site réel, 9 des 14 images « orphelines » étaient utilisées. Ne jamais supprimer un fichier sur la foi d'une recherche ; chercher aussi le préfixe de son nom.
- **Page qui fabrique ses noms de classe** (`'m-' + modele`) : toute détection de CSS mort y donne des faux positifs. L'exclure des passes de nettoyage, et le noter dans la documentation du projet.
- **Mesure dans une iframe** : une iframe qui ne s'affiche pas renvoie des styles périmés (un faux diagnostic de 33 contrastes en échec en est venu). `empreinte.mjs` ouvre une vraie page, une à la fois.
- **Éléments animés en continu** (bandeau qui défile, compteur) : même neutralisés, ils laissent parfois des écarts de moins de 3 px, dans un sens ou dans l'autre. Les signaler comme tels dans le rapport au lieu de les passer sous silence.
- **Polices pas encore chargées** : le texte est alors mesuré dans la police de secours, et toutes les largeurs sont fausses (2 693 faux écarts une fois). `empreinte.mjs` attend `document.fonts.ready`.
- **Capture pleine page d'une appli qui défile à l'intérieur** (fil de cartes en hauteur 100 %) : la capture « au-delà de l'écran » rend visibles toutes les cartes à la fois et déclenche leurs IntersectionObserver. Sur une appli réelle, la carte affichée sautait à la dernière du fil, une visite guidée sautait une bulle, et le scénario s'arrêtait. `empreinte.mjs` capture donc à l'écran quand le document ne dépasse pas l'écran. Un scénario qui s'interrompt signale souvent un outil qui modifie ce qu'il mesure : rejouer l'étape seule, sans capture, puis avec, avant d'accuser la page.
- **Images de fond dans le style calculé** : une image écrite en chemin relatif se lit en adresse complète, port du serveur de test compris, et ce port change à chaque lancement. Sur une appli réelle, la double mesure à vide sortait tous les états en écart. `empreinte.mjs` retire donc l'adresse du serveur des valeurs relevées.
- **Photos redimensionnées** : elles ne se décodent pas toujours au même niveau près d'une mesure à l'autre (jusqu'à 22 sur 255 relevé). `empreinte.mjs` ne compte comme écart qu'un pixel qui change de plus de 40 sur 255 (`--seuil-pixel`) ; le reste est signalé comme « bruit de rendu », jamais caché. Dans le scénario, attendre que les images affichées soient décodées et que l'écran soit immobile avant chaque capture.
- **Une règle `!important` rangée dans une couche CSS bat une feuille qui n'est dans aucune couche** : pour `!important`, l'ordre des couches s'inverse. La première couche déclarée l'emporte sur toutes les autres, et le CSS hors couche passe en dernier. Sur une appli réelle construite avec Tailwind v4, la règle de « mouvement réduit », écrite dans `@layer base` (1 ms `!important`), prenait le dessus : les animations tournaient encore malgré `empreinte.mjs`, et une section passée un instant dans sa propre couche de rendu décalait une ligne de texte d'un pixel d'une mesure à l'autre. `empreinte.mjs` range donc sa feuille dans une couche déclarée la première, en tête du `<head>`. Ne pas remplacer la durée nulle par `animation-name:none` : un élément qui n'apparaît que par une animation « forwards », depuis un style de base invisible, resterait invisible (l'auto-test le vérifie).
- **Règle de sécurité `style-src 'self'`** : sur la même appli, elle bloquait la feuille qui fige animations et curseur. Le curseur de saisie restait visible et les captures variaient. `empreinte.mjs` le détecte et s'arrête : relancer avec `--contourner-csp`, en sachant ce que la mesure ne voit plus alors (section « Les outils du skill »).
- **La souris laissée par un clic du scénario** (`page.click`, avant une saisie par exemple) survole l'élément qui apparaît sous elle sur l'écran suivant, et ce survol dépend du moment où le navigateur le recalcule. Sur la même appli, la bordure au survol d'un bouton apparaissait ou non d'une mesure à l'autre. `empreinte.mjs` ramène donc la souris en (0, 0) avant chaque relevé ; un survol voulu se capture avec `{ garderSouris: true }`.
- **Décisions actées déguisées en dette** : du CSS écrit dans chaque page plutôt que dans une feuille commune, un petit script en tête de page qui semble faire doublon. Chercher la raison dans la documentation du projet avant de « corriger » ce qui ressemble à une duplication.
- **PowerShell sous Windows** écrit par défaut en UTF-16 et casse les accents : écrire les fichiers avec les outils d'édition, pas avec le shell.

## Modèle et effort

Une refactorisation est du code non trivial : effort élevé au minimum, très élevé pour une appli entière ou un chantier de plus d'une demi-heure.

## Exhaustivité

- Chaque suspect de l'inventaire est confirmé ou écarté, chaque état visible est dans le scénario, chaque lot est vérifié. Compter les entrées et les sorties avant de rendre.
- Aucun « et ainsi de suite », aucun échantillon présenté comme complet, aucun TODO laissé dans le code rendu.
- Le rangement sans effet visible va jusqu'au bout sans interruption. Les points d'arrêt du skill (corrections et décisions soumises à l'utilisateur, tests rouges au départ) priment sur cette règle.
