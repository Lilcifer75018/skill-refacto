# Versions

## 1.3.1, le 1er octobre 2026

Ajout d'une règle anti-AI slop dans le skill : pas de remplissage, pas de chiffres inventés, pas de commentaires qui paraphrasent le code, relecture de la sortie avant de rendre.

## 1.3.0, le 30 septembre 2026

Audit des outils : chaque correction ferme un cas où un changement pouvait passer inaperçu, ou un cas où l'outil annonçait une vérification qui n'avait pas eu lieu.

- Captures : deux états dont le nom ne diffère que par un symbole (« + » et « − ») écrivaient la même image. Chaque état a désormais son fichier.
- Styles : 69 propriétés relevées au lieu de 42, dont les bordures côté par côté et `pointer-events`. Une ancienne référence se compare avec sa propre liste, et l'outil dit ce qu'elle ne couvre pas.
- Bilan : il ne cite que ce qui a été comparé. Une référence sans captures n'est plus annoncée identique aux pixels.
- Erreurs JavaScript : enregistrées avec la référence. Une erreur déjà présente ne fait plus échouer la comparaison, une erreur apparue ou disparue est un écart.
- Exploration : stockage vidé entre deux éléments, IndexedDB comprise, et envois de données bloqués.
- `sorties.mjs` : un fichier que la commande n'écrit plus, resté sur le disque, est signalé.
- `code-mort.mjs` : règle suivant un `@import` et règles imbriquées lues, fichiers TypeScript et JSX pris en compte.
- `verifier-syntaxe.mjs` : les fichiers qu'il ne sait pas lire sont comptés et signalés, `python3` est essayé, les cartes d'import sont contrôlées.
- Auto-test : 49 contrôles.
- Les références enregistrées avec une version antérieure sont à enregistrer à nouveau pour profiter de ces contrôles.

## 1.2.0, le 28 septembre 2026

- Animations neutralisées aussi sur les pages qui rangent leurs règles dans des couches CSS : la feuille de neutralisation passe dans une couche déclarée la première. Jusqu'ici, le « mouvement réduit » d'une appli Tailwind v4 l'emportait.
- Règle de sécurité stricte (Content-Security-Policy) : quand elle bloque la neutralisation, la mesure s'arrête et le dit, au lieu de produire des captures instables. Nouvelle option `--contourner-csp` pour lever la règle dans le navigateur de test.
- Souris ramenée dans un coin avant chaque relevé : un clic du scénario ne laisse plus de survol sur l'écran suivant. `capturer(nom, { garderSouris: true })` conserve un survol voulu.
- Auto-test : 36 contrôles.
- Une référence enregistrée avec une version antérieure peut montrer des écarts de survol ou d'animation : l'enregistrer à nouveau avant de commencer.

## 1.1.0, le 27 septembre 2026

- Exploration automatique (`--explorer`) : chaque bouton, onglet, menu déroulant et lien interne est ouvert et capturé, sans jamais cliquer une action destructive ni un envoi de formulaire.
- Accessibilité : l'arbre lu par les lecteurs d'écran est comparé dans chaque état.
- Poids et vitesse : requêtes, poids brut et compressé, temps d'affichage, avec la variation en comparaison.
- Rapport visuel : captures avant et après, image des différences, poids, bruit de rendu et états identiques, dans une page autonome.
- Seuil de bruit de rendu (`--seuil-pixel`), capture à l'écran pour les applis à défilement interne, adresse du serveur de test retirée des styles relevés.
- Auto-test : 29 contrôles.

## 1.0.1, le 27 septembre 2026

- Documentation réécrite : principe, éléments comparés, familles de constats, déroulé complet, outils, installation et limites, avec schémas.
- Mode d'emploi du skill au vouvoiement.

## 1.0.0, le 27 septembre 2026

Première version publique.

- Cinq outils : empreinte d'une page ou d'un site entier, sorties d'un script, vérification de la syntaxe, inventaire du code mort, auto-test.
- Une grille de lecture pour HTML, CSS, JavaScript, les scripts Node et Python, et les nœuds Code n8n.
- Installation par plugin dans Claude Code.
