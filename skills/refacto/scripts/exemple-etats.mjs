// Modèle de scénario pour empreinte.mjs : copier ce fichier dans le dossier de travail de la session, l'adapter à la
// page, puis lancer : node empreinte.mjs page.html reference.json --etats etats.mjs
// Le scénario est rejoué à l'identique avant et après la refactorisation, pour chaque largeur et chaque thème.
// Règle : capturer chaque état que l'utilisateur peut voir (menu ouvert, onglet, feuille, message d'erreur, formulaire
// rempli), pas seulement l'arrivée sur la page. Un état non capturé est un état non protégé.
// L'option --explorer ouvre déjà seule chaque bouton, onglet et menu déroulant, un par un : ce scénario sert surtout
// aux états à plusieurs étapes (formulaire rempli puis envoyé, parcours complet, préparation avant chargement).

// Facultatif : exécuté avant le chargement de la page (clés de stockage, écran d'ouverture à sauter...)
export async function preparer(page) {
  await page.evaluateOnNewDocument(() => {
    try { sessionStorage.setItem("exemple:ouverture-vue", "1"); } catch (e) {}
  });
}

export default async function (page, { capturer, clic, saisir, touche, defiler, pause, recharger, largeur, theme, page: nomPage }) {
  await capturer("chargement");

  // Un menu qui s'ouvre, puis se ferme au clavier
  if (await page.$("#menu-bouton")) {
    await clic("#menu-bouton"); await capturer("menu-ouvert");
    await touche("Escape"); await capturer("menu-ferme");
  }

  // Un formulaire : vide envoyé (message d'erreur), puis rempli
  if (await page.$("form")) {
    await clic("form [type=submit]"); await capturer("formulaire-erreur");
    await saisir("form input[type=email]", "test@exemple.fr"); await capturer("formulaire-rempli");
  }

  // Une section plus bas dans la page
  if (await page.$("#tarifs")) { await defiler("#tarifs"); await capturer("tarifs"); }
}
