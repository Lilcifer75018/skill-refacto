// Empreinte d'une page ou d'une appli HTML, pour prouver qu'une refactorisation ne change rien à l'écran.
// Avant de toucher au code : on enregistre. Après : on compare, et chaque écart est montré avec son contexte.
//
// Ce qui est relevé, pour chaque état x largeur x thème :
//   - le DOM rendu (scripts retirés) ;
//   - le style calculé de chaque élément visible, pseudo-éléments ::before et ::after compris, et sa boîte ;
//   - l'arbre d'accessibilité, tel que le lit un lecteur d'écran (rôles, noms, états) ;
//   - l'élément qui a le focus, les erreurs JavaScript, un éventuel débordement horizontal ;
//   - une capture, comparée pixel par pixel quand elle change.
// Et, au chargement de chaque page : le poids (brut et compressé), le nombre de requêtes et les temps d'affichage.
// En comparaison, un rapport visuel est écrit à côté de la référence : captures avant, après, et écarts entourés.
//
// Usage :
//   node empreinte.mjs <cible> <reference.json> [options]
//   <cible>            fichier .html, dossier (ouvre index.html) ou adresse http(s) ;
//                      avec --toutes-pages, un dossier dont chaque page .html est mesurée (site entier)
//   <reference.json>   absent : il est créé (enregistrement). Présent : la page est comparée à lui.
// Options :
//   --racine <dossier>     dossier servi en local (défaut : celui du fichier ; utile si la page charge ../quelque-chose)
//   --etats <module.mjs>   scénario qui ouvre les menus, feuilles, onglets... (voir exemple-etats.mjs)
//   --explorer             ouvre seul chaque bouton, onglet, menu déroulant et lien interne de la page, et capture
//                          l'état obtenu : un état oublié dans le scénario reste protégé
//   --max-etats 25         avec --explorer, nombre maximal d'éléments ouverts par page et par combinaison
//   --largeurs 375,1440    largeurs d'écran (défaut 375 et 1440)
//   --themes clair,sombre  thèmes (défaut : les deux si la page gère le thème sombre, sinon clair)
//   --garder-animations    ne neutralise pas animations et transitions (déconseillé : rend les captures instables)
//   --contourner-csp       lève la règle de sécurité de la page (Content-Security-Policy) dans ce navigateur de test,
//                          quand elle interdit la feuille qui fige animations et curseur (l'outil s'arrête et le dit) ;
//                          la mesure ne voit plus alors ce que cette règle bloquerait en ligne
//   --sans-captures        ne fait pas de captures (plus rapide, compare DOM, styles et accessibilité seulement)
//   --seuil-pixel 40       écart de couleur (sur 255) au-delà duquel un pixel compte comme différent (défaut 40) ;
//                          en dessous, c'est du bruit de rendu (photo redimensionnée), signalé en note, jamais caché
//   --toutes-pages         trouve seul toutes les pages .html du dossier cible : une page ajoutée entre sans rien
//                          déclarer (un outil dont la liste de pages est écrite à la main finit par en oublier)
//   --exclure <morceau>    avec --toutes-pages, écarte les chemins qui contiennent ce morceau (répétable) :
//                          sources d'un build, brouillons, outils internes
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

// Puppeteer installé dans le projet, sinon celui installé globalement (npm install -g puppeteer)
let puppeteer;
try { puppeteer = (await import("puppeteer")).default; }
catch (e) {
  try { puppeteer = createRequire(execSync("npm root -g").toString().trim() + "/")("puppeteer"); }
  catch (e2) { console.log("Puppeteer introuvable. L'installer une fois : npm install -g puppeteer"); process.exit(2); }
}

const args = process.argv.slice(2);
const option = (nom, defaut = null) => { const i = args.indexOf("--" + nom); return i >= 0 ? args[i + 1] : defaut; };
const drapeau = (nom) => args.includes("--" + nom);
const exclus = args.flatMap((a, i) => (a === "--exclure" ? [args[i + 1]] : []));
const valeursOptions = new Set([...["racine", "etats", "largeurs", "themes", "seuil-pixel", "max-etats"].map((n) => option(n)).filter(Boolean), ...exclus]);
const positionnels = args.filter((a) => !a.startsWith("--") && !valeursOptions.has(a));
const [cible, reference] = positionnels;
if (!cible || !reference) {
  console.log("Usage : node empreinte.mjs <fichier.html | dossier | https://...> <reference.json> [--etats scenario.mjs] [--explorer] [--largeurs 375,1440] [--themes clair,sombre] [--racine dossier]");
  process.exit(2);
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const largeurs = (option("largeurs") || "375,1440").split(",").map(Number);
const hauteurPour = (l) => (l < 768 ? 812 : 900);
const comparer = fs.existsSync(reference);
const base = reference.replace(/\.json$/i, "");
const dossierCaptures = base + (comparer ? ".apres" : ".avant");
const dossierAvant = base + ".avant";
const dossierEcarts = base + ".ecarts";
const fichierRapport = base + ".rapport.html";
const avecCaptures = !drapeau("sans-captures");
const explorer = drapeau("explorer");
const contournerCsp = drapeau("contourner-csp");
const NOTE_CSP = "Règle de sécurité de la page (Content-Security-Policy) levée pendant la mesure (--contourner-csp) : un changement qu'elle bloquerait en ligne, comme un style ou un script écrit dans la page ou une ressource d'un autre domaine, n'est pas vu ici.";
const NOTE_ENVOIS = () => `Exploration : ${envoisBloques.size} envoi(s) de données bloqué(s), rien n'est parti (${[...envoisBloques].join(" ; ")}). L'état capturé est celui d'un envoi qui échoue.`;
const MAX_ETATS = Number(option("max-etats", "25"));
// Les dossiers que l'outil écrit repartent de zéro : une capture d'une mesure précédente n'y traîne pas
if (avecCaptures) { fs.rmSync(dossierCaptures, { recursive: true, force: true }); fs.mkdirSync(dossierCaptures, { recursive: true }); }
if (comparer) fs.rmSync(dossierEcarts, { recursive: true, force: true });

// Serveur local : les pages ouvertes en file:// se comportent autrement (modules, fetch, service worker)
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif", ".woff2": "font/woff2", ".woff": "font/woff", ".ico": "image/x-icon", ".mp4": "video/mp4" };
async function servir(racine) {
  const serveur = http.createServer((q, r) => {
    let p;
    try { p = decodeURIComponent(q.url.split("?")[0].split("#")[0]); } catch (e) { r.writeHead(400); r.end(); return; }
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(racine, p);
    if (!(f + path.sep).startsWith(racine + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "Content-Type": TYPES[path.extname(f).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((ok) => serveur.listen(0, ok));
  return { port: serveur.address().port, fermer: () => new Promise((ok) => serveur.close(ok)) };
}

let pages = [], serveur = null;
if (/^https?:\/\//i.test(cible)) {
  pages = [{ nom: "", adresse: cible }];
} else if (drapeau("toutes-pages")) {
  const racine = path.resolve(option("racine") || cible);
  const trouvees = [];
  const IGNORES = new Set(["node_modules", ".git", ".vercel", ".next"]);
  (function parcourir(d) {
    for (const n of fs.readdirSync(d)) {
      const f = path.join(d, n);
      if (IGNORES.has(n) || exclus.some((x) => f.includes(x))) continue;
      if (fs.statSync(f).isDirectory()) parcourir(f);
      else if (/\.html?$/i.test(n)) trouvees.push(f);
    }
  })(path.resolve(cible));
  serveur = await servir(racine);
  pages = trouvees.sort().map((f) => {
    const rel = path.relative(racine, f).split(path.sep).join("/");
    return { nom: rel, adresse: `http://localhost:${serveur.port}/${rel.split("/").map(encodeURIComponent).join("/")}` };
  });
  console.log(`${pages.length} page(s) trouvée(s) dans ${racine}`);
} else {
  const absolu = path.resolve(cible);
  if (!fs.existsSync(absolu)) { console.log("Cible introuvable : " + absolu); process.exit(2); }
  const estDossier = fs.statSync(absolu).isDirectory();
  const racine = path.resolve(option("racine") || (estDossier ? absolu : path.dirname(absolu)));
  const page = estDossier ? path.join(absolu, "index.html") : absolu;
  const relatif = path.relative(racine, page).split(path.sep).map(encodeURIComponent).join("/");
  if (relatif.startsWith("..")) { console.log("La page doit être dans la racine servie (--racine)."); process.exit(2); }
  serveur = await servir(racine);
  pages = [{ nom: "", adresse: `http://localhost:${serveur.port}/${relatif}` }];
}

// Scénario d'états (facultatif) : export default async (page, outils) => { await outils.capturer("nom"); ... }
let scenario = async (p, o) => { await o.capturer("chargement"); };
let preparerPage = null;
const fichierEtats = option("etats");
if (fichierEtats) {
  const m = await import(pathToFileURL(path.resolve(fichierEtats)).href);
  scenario = m.default;
  preparerPage = m.preparer || null;
}

// Animations, transitions et curseur de saisie figés, dans une couche CSS déclarée la première (la feuille est placée en
// tête du <head>) : pour une règle !important, la première couche déclarée l'emporte sur toutes les autres et sur le CSS
// hors couche. Hors couche, elle perdait contre le « mouvement réduit » d'une appli Tailwind v4 (1 ms !important dans
// @layer base) et contre toute règle !important plus précise que « * ». La durée tombe à zéro, mais l'animation garde
// son nom pour finir sur son image de fin : animation-name:none laisserait invisible un élément qui n'apparaît que par
// une animation « forwards » depuis un style de base à opacity:0.
const NEUTRALISER = "@layer refacto-neutraliser{*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}}";
const PROPRIETES = ["display", "visibility", "position", "top", "right", "bottom", "left", "z-index", "box-sizing", "margin", "padding", "border-top", "border-right", "border-bottom", "border-left", "border-radius", "outline", "color", "background-color", "background-image", "opacity", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-align", "text-transform", "text-decoration-line", "white-space", "overflow", "flex-direction", "flex-wrap", "justify-content", "align-items", "gap", "grid-template-columns", "grid-template-rows", "transform", "filter", "box-shadow", "cursor", "object-fit", "aspect-ratio",
  // Ce qui ne se voit pas sur une capture mais change l'usage (un bouton qui ne reçoit plus le clic), puis ce qui ne
  // se verrait que sur une capture, pour que --sans-captures le voie aussi. « border » est relevé côté par côté : le
  // raccourci se lit vide dès que les quatre côtés diffèrent
  "pointer-events", "user-select", "touch-action", "scroll-snap-type", "overscroll-behavior",
  "background-size", "background-position", "background-repeat", "text-decoration-color", "text-shadow", "text-overflow", "text-indent", "word-spacing", "vertical-align", "list-style-type", "fill", "stroke", "stroke-width", "clip-path", "backdrop-filter", "mix-blend-mode", "object-position", "outline-offset", "accent-color"];

// Une référence se compare avec la liste de propriétés qui l'a produite (relue sur son premier élément) : la liste
// peut s'allonger d'une version à l'autre sans que chaque élément d'une ancienne référence sorte en écart
const refFichier = comparer ? JSON.parse(fs.readFileSync(reference, "utf8")) : null;
const premierReleve = refFichier && Object.values(Object.values(refFichier.etats)[0]?.styles || {})[0];
const proprietes = premierReleve ? Object.keys(premierReleve).filter((k) => k !== "boite" && !k.startsWith("::")) : PROPRIETES;
const proprietesAbsentes = PROPRIETES.filter((x) => !proprietes.includes(x));

function releverDansPage(proprietes) {
  const cle = (e) => {
    const morceaux = [];
    for (let n = e; n && n !== document.body; n = n.parentElement) {
      let i = 1; for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) i++;
      morceaux.unshift(n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + ":" + i);
    }
    return morceaux.join(">") || "body";
  };
  const styles = {};
  const tous = [document.body, ...document.body.querySelectorAll("*")].filter((e) => !["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(e.tagName));
  for (const e of tous) {
    const cs = getComputedStyle(e);
    if (cs.display === "none" && e !== document.body) continue;
    const r = e.getBoundingClientRect();
    const s = { boite: [r.x, r.y + scrollY, r.width, r.height].map((v) => Math.round(v)).join(" ") };
    // L'adresse du serveur de test (son port change à chaque lancement) sort des valeurs : une image de fond écrite
    // en chemin relatif se lit en adresse complète, et ferait passer chaque mesure pour un écart
    for (const p of proprietes) s[p] = cs.getPropertyValue(p).split(location.origin).join("");
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(e, pseudo);
      if (ps.content && ps.content !== "none" && ps.content !== "normal") s[pseudo] = [ps.content, ps.display, ps.color, ps.backgroundColor, ps.width, ps.height, ps.transform].join(" | ");
    }
    styles[cle(e)] = s;
  }
  const c = document.body.cloneNode(true);
  c.querySelectorAll("script").forEach((s) => s.remove());
  const a = document.activeElement;
  const focus = !a || a === document.body ? "(corps)" : cle(a);
  return { dom: c.innerHTML, focus, styles, deborde: document.documentElement.scrollWidth > window.innerWidth + 1 ? document.documentElement.scrollWidth : 0 };
}

// Arbre d'accessibilité aplati en lignes lisibles : « bouton "Menu" déplié=false », indenté selon la profondeur
function aplatir(n, niveau = 0, lignes = []) {
  if (!n) return lignes;
  const details = [];
  if (n.value !== undefined && n.value !== "") details.push(`valeur=${n.value}`);
  for (const k of ["checked", "pressed", "expanded", "selected", "disabled", "required", "level"]) if (n[k] !== undefined && n[k] !== false) details.push(`${k}=${n[k]}`);
  if (n.role !== "RootWebArea") lignes.push(`${"  ".repeat(niveau)}${n.role} "${(n.name || "").replace(/\s+/g, " ").trim()}"${details.length ? " " + details.join(" ") : ""}`);
  for (const f of n.children || []) aplatir(f, n.role === "RootWebArea" ? niveau : niveau + 1, lignes);
  return lignes;
}

// Éléments qu'un visiteur peut ouvrir, décrits par leur nom visible (stable d'une mesure à l'autre).
// Sans argument : rend la liste, et ce qui est écarté. Avec un nom : clique cet élément et rend vrai s'il l'a trouvé.
// Une seule fonction pour les deux usages, pour que la liste et le clic désignent toujours le même élément.
function elementsOuvrables(nomCherche = null) {
  const DESTRUCTIF = /supprim|effac|vider|réinitialis|reinitialis|recommenc|déconnex|deconnex|désinscri|delete|remove|reset|clear|log ?out|sign ?out|unsubscribe/i;
  const vus = new Map(), liste = [], ecartes = [];
  for (const e of document.querySelectorAll('button, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], summary, [aria-expanded], [aria-haspopup], a[href^="#"]:not([href="#"])')) {
    if (!e.getClientRects().length || e.disabled || e.getAttribute("aria-disabled") === "true") continue;
    const texte = (e.getAttribute("aria-label") || e.innerText || e.title || e.value || "").replace(/\s+/g, " ").trim().slice(0, 50);
    let nom = `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""} « ${texte || "sans nom"} »`;
    const n = (vus.get(nom) || 0) + 1; vus.set(nom, n);
    if (n > 1) nom += ` n°${n}`;
    let refus = null;
    if (DESTRUCTIF.test(texte)) refus = "action destructive";
    else if (e.type === "submit" && e.form) refus = "envoi de formulaire";
    if (nomCherche !== null) { if (nom === nomCherche && !refus) { e.click(); return true; } continue; }
    if (refus) ecartes.push(`${nom} (${refus})`); else liste.push(nom);
  }
  return nomCherche !== null ? false : { liste, ecartes };
}

const navigateur = await puppeteer.launch({ headless: "new" });
const etats = {};
const mesures = {};
// Les erreurs JavaScript de la page sont comparées à celles de la référence ; celles du scénario sont toujours un échec
const erreursPage = new Set();
const erreurs = [];
const ecartesExploration = new Set();
const envoisBloques = new Set();

// Thèmes : les deux si la page déclare une règle prefers-color-scheme lisible
async function themesDeLaPage(adresse) {
  if (option("themes")) return option("themes").split(",");
  const ctx = await navigateur.createBrowserContext();
  const p = await ctx.newPage();
  await p.goto(adresse, { waitUntil: "networkidle0" }).catch(() => {});
  const sombre = await p.evaluate(() => {
    const cherche = (regles) => [...regles].some((r) => (r.conditionText || r.media?.mediaText || "").includes("prefers-color-scheme") || (r.cssRules && cherche(r.cssRules)));
    return [...document.styleSheets].some((f) => { try { return cherche(f.cssRules); } catch (e) { return false; } });
  }).catch(() => false);
  await ctx.close();
  return sombre ? ["clair", "sombre"] : ["clair"];
}

// Poids et vitesse du chargement : chaque réponse est pesée brute et compressée (gzip recalculé, comme le ferait
// un hébergeur qui compresse), puis les temps d'affichage du navigateur. Les temps en local sont indicatifs.
function surveillerChargement(p) {
  const reponses = [];
  const ecoute = (r) => { if (!r.url().startsWith("data:")) reponses.push(r.buffer().then((b) => ({ type: r.request().resourceType(), brut: b.length, compresse: zlib.gzipSync(b).length })).catch(() => null)); };
  p.on("response", ecoute);
  return async () => {
    p.off("response", ecoute);
    const liste = (await Promise.all(reponses)).filter(Boolean);
    const parType = {};
    for (const r of liste) parType[r.type] = (parType[r.type] || 0) + r.compresse;
    const temps = await p.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] || {};
      const fcp = performance.getEntriesByType("paint").find((x) => x.name === "first-contentful-paint");
      return { dcl: Math.round(nav.domContentLoadedEventEnd || 0), charge: Math.round(nav.loadEventEnd || 0), fcp: Math.round(fcp ? fcp.startTime : 0) };
    });
    return { requetes: liste.length, brut: liste.reduce((s, r) => s + r.brut, 0), compresse: liste.reduce((s, r) => s + r.compresse, 0), parType, ...temps };
  };
}

async function capturerEtat(p, cleEtat, { garderSouris = false } = {}) {
  if (await p.evaluate(() => window.__refactoNeutralisation === "bloquee")) {
    console.log(`${cleEtat} : la règle de sécurité de la page (Content-Security-Policy) interdit la feuille qui fige animations et curseur de saisie, les captures ne seraient pas stables. Relancer avec --contourner-csp (le SKILL.md dit ce que la mesure ne voit plus alors). Mesure arrêtée, référence non modifiée.`);
    await navigateur.close();
    if (serveur) await serveur.fermer();
    process.exit(2);
  }
  // La souris laissée par un clic du scénario survolerait l'élément qui prend sa place sur l'écran suivant, selon le
  // moment où le navigateur recalcule le survol : elle repart dans le coin. Un survol voulu : { garderSouris: true }
  if (!garderSouris) await p.mouse.move(0, 0);
  await pause(300);
  etats[cleEtat] = await p.evaluate(releverDansPage, proprietes);
  try { etats[cleEtat].a11y = aplatir(await p.accessibility.snapshot({ interestingOnly: true })).join("\n"); }
  catch (e) { etats[cleEtat].a11y = "(arbre d'accessibilité illisible : " + e.message + ")"; }
  if (avecCaptures) {
    // Pleine page seulement si le document dépasse l'écran. Une appli à défilement interne (hauteur 100 %) se
    // capture à l'écran : la capture « au-delà de l'écran » rend visibles toutes ses cartes à la fois et
    // déclenche ses IntersectionObserver (sur une appli réelle, la carte affichée sautait à la dernière du fil).
    const depasse = await p.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
    const png = await p.screenshot({ fullPage: depasse });
    etats[cleEtat].capture = crypto.createHash("sha256").update(png).digest("hex");
    fs.writeFileSync(path.join(dossierCaptures, nomFichier(cleEtat)), png);
  }
}

const themesVus = new Set();
for (const { nom: nomPage, adresse } of pages) {
  const prefixe = nomPage ? nomPage + " | " : "";
  const themesPage = await themesDeLaPage(adresse);
  themesPage.forEach((t) => themesVus.add(t));
  for (const largeur of largeurs) {
    for (const theme of themesPage) {
      const combinaison = `${largeur}-${theme}`;
      const ctx = await navigateur.createBrowserContext();
      const p = await ctx.newPage();
      // L'adresse du serveur de test sort du message : son port change à chaque lancement
      p.on("pageerror", (e) => erreursPage.add(`${prefixe}${combinaison} : ${e.message.split(new URL(adresse).origin).join("")}`));
      // Avant tout chargement : la règle de sécurité se lit à l'arrivée sur la page
      if (contournerCsp) await p.setBypassCSP(true);
      const mobile = largeur < 768;
      await p.setViewport({ width: largeur, height: hauteurPour(largeur), deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
      await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme === "sombre" ? "dark" : "light" }, { name: "prefers-reduced-motion", value: "reduce" }]);
      // En tête du <head>, pour que la couche de NEUTRALISER soit la première déclarée (la feuille devient
      // document.styleSheets[0]). Une règle de sécurité qui interdit les styles écrits dans la page la bloque : c'est
      // noté, et capturerEtat arrête la mesure au lieu de relever une page encore animée
      if (!drapeau("garder-animations")) await p.evaluateOnNewDocument((css) => { document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.prepend(s); window.__refactoNeutralisation = s.sheet ? "active" : "bloquee"; }); }, NEUTRALISER);
      if (preparerPage) await preparerPage(p);
      const finChargement = surveillerChargement(p);
      await p.goto(adresse, { waitUntil: "networkidle0" });
      // Sans attendre les polices, le texte est mesuré dans la fonte de repli et toutes les largeurs sont fausses
      await p.evaluate(() => document.fonts && document.fonts.ready);
      mesures[`${prefixe}${combinaison}`] = { page: nomPage || "page", combinaison, ...(await finChargement()) };
      await pause(400);
      const outils = {
        pause,
        capturer: (nom, options) => capturerEtat(p, `${prefixe}${nom} @ ${combinaison}`, options),
        clic: (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error("introuvable : " + s); e.click(); }, sel),
        saisir: (sel, valeur) => p.evaluate((s, v) => { const e = document.querySelector(s); if (!e) throw new Error("introuvable : " + s); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }, sel, valeur),
        touche: async (t) => { await p.keyboard.press(t); await pause(200); },
        defiler: (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error("introuvable : " + s); e.scrollIntoView({ block: "start" }); }, sel),
        recharger: () => p.reload({ waitUntil: "networkidle0" }),
        largeur, theme, page: nomPage,
      };
      try { await scenario(p, outils); } catch (e) { erreurs.push(`${prefixe}${combinaison} : scénario interrompu, ${e.message}`); }

      // Exploration : chaque élément ouvrable, à partir d'une page rechargée et d'un stockage vide à chaque fois
      if (explorer) {
        // Un clic de l'exploration ne doit rien envoyer (compteur, formulaire géré en JavaScript, paiement) : toute
        // requête qui n'est pas une simple lecture est bloquée, et dite
        await p.setRequestInterception(true);
        p.on("request", (q) => {
          if (q.isInterceptResolutionHandled()) return;
          if (["GET", "HEAD", "OPTIONS"].includes(q.method())) { q.continue(); return; }
          envoisBloques.add(`${prefixe}${q.method()} ${q.url().split("?")[0].split(new URL(adresse).origin).join("")}`);
          q.abort();
        });
        const cdp = await p.createCDPSession();
        const recharger = async () => {
          // Stockage vidé en entier, bases IndexedDB et caches compris, pour que l'état ouvert par un élément ne
          // dépende pas de ceux ouverts avant lui. Les cookies restent : preparer() a pu en poser
          await p.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
          await cdp.send("Storage.clearDataForOrigin", { origin: new URL(adresse).origin, storageTypes: "local_storage,indexeddb,cache_storage,service_workers,websql,file_systems" }).catch(() => {});
          await p.goto(adresse, { waitUntil: "networkidle0" });
          await p.evaluate(() => document.fonts && document.fonts.ready);
          await pause(300);
        };
        await recharger();
        const { liste, ecartes } = await p.evaluate(elementsOuvrables);
        ecartes.forEach((x) => ecartesExploration.add(`${prefixe}${x}`));
        if (liste.length > MAX_ETATS) ecartesExploration.add(`${prefixe}${liste.length - MAX_ETATS} élément(s) au-delà de --max-etats ${MAX_ETATS}`);
        for (const nom of liste.slice(0, MAX_ETATS)) {
          await recharger();
          const avant = await p.evaluate(() => location.pathname + location.search);
          const trouve = await p.evaluate(elementsOuvrables, nom).catch(() => false);
          await pause(400);
          const apres = await p.evaluate(() => location.pathname + location.search).catch(() => "(page fermée)");
          if (!trouve) { erreurs.push(`${prefixe}${combinaison} : exploration, élément introuvable au second passage : ${nom}`); continue; }
          if (apres !== avant) { ecartesExploration.add(`${prefixe}${nom} (mène à une autre page : ${apres})`); continue; }
          await capturerEtat(p, `${prefixe}ouvert : ${nom} @ ${combinaison}`);
        }
      }
      await ctx.close();
    }
  }
}
const themes = [...themesVus];

// Le nom lisible perd les accents et les symboles : deux états « + » et « − » tomberaient sur le même fichier, et la
// comparaison de pixels porterait sur la mauvaise capture. L'empreinte du nom complet les sépare
function nomFichier(cleEtat) { return cleEtat.replace(/[^a-z0-9._-]+/gi, "_") + "-" + crypto.createHash("sha1").update(cleEtat).digest("hex").slice(0, 8) + ".png"; }

// Comparaison de deux captures pixel par pixel, dans le navigateur (aucune dépendance à installer). Rend aussi une
// image des différences : la capture d'après en gris pâle, les pixels qui changent nettement en rouge.
const SEUIL_PIXEL = Number(option("seuil-pixel", "40"));
async function pixelsDifferents(a, b) {
  const p = await navigateur.newPage();
  const res = await p.evaluate(async (da, db, seuil) => {
    const charge = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
    const [ia, ib] = await Promise.all([charge(da), charge(db)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { taille: `${ia.width}x${ia.height} -> ${ib.width}x${ib.height}` };
    const lire = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
    const pa = lire(ia), pb = lire(ib);
    const toile = document.createElement("canvas"); toile.width = ia.width; toile.height = ia.height;
    const ctx = toile.getContext("2d"); const sortie = ctx.createImageData(ia.width, ia.height); const d = sortie.data;
    // Deux comptes : tout pixel qui diffère, et ceux qui diffèrent nettement (plus de seuil sur 255 sur une couleur).
    // Une photo redimensionnée ne se décode pas toujours au même niveau près d'une mesure à l'autre (jusqu'à 22 sur
    // 255 relevé sur une appli réelle) ; un vrai changement déplace du texte ou change une couleur, bien au-delà.
    let n = 0, nets = 0, max = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let i = 0; i < pa.length; i += 4) {
      const gris = 225 + Math.round((pb[i] + pb[i + 1] + pb[i + 2]) / 3 / 255 * 30);
      d[i] = d[i + 1] = d[i + 2] = gris; d[i + 3] = 255;
      const ecart = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]), Math.abs(pa[i + 3] - pb[i + 3]));
      if (!ecart) continue;
      n++; if (ecart > max) max = ecart;
      if (ecart > seuil) {
        nets++; const k = i / 4, x = k % ia.width, y = Math.floor(k / ia.width);
        d[i] = 220; d[i + 1] = 20; d[i + 2] = 60;
        if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
      }
    }
    ctx.putImageData(sortie, 0, 0);
    if (nets) { ctx.strokeStyle = "rgb(220,20,60)"; ctx.lineWidth = 3; ctx.strokeRect(Math.max(0, x0 - 6), Math.max(0, y0 - 6), x1 - x0 + 12, y1 - y0 + 12); }
    return { pixels: n, nets, max, zone: nets ? `x ${x0}-${x1}, y ${y0}-${y1}` : "", image: nets ? toile.toDataURL("image/png") : null };
  }, "data:image/png;base64," + fs.readFileSync(a).toString("base64"), "data:image/png;base64," + fs.readFileSync(b).toString("base64"), SEUIL_PIXEL);
  await p.close();
  return res;
}

// Différence de deux listes de lignes (arbre d'accessibilité) : ce qui a disparu, ce qui est apparu
function diffLignes(a, b, max = 8) {
  const compte = new Map();
  for (const l of b.split("\n")) compte.set(l, (compte.get(l) || 0) + 1);
  const disparues = [];
  for (const l of a.split("\n")) { if (compte.get(l)) compte.set(l, compte.get(l) - 1); else disparues.push(l); }
  const apparues = [...compte].flatMap(([l, n]) => Array(n).fill(l));
  return [...disparues.slice(0, max).map((l) => `accessibilité, disparu : ${l.trim()}`), ...apparues.slice(0, max).map((l) => `accessibilité, apparu : ${l.trim()}`),
    ...(disparues.length + apparues.length > 2 * max ? [`accessibilité : … et d'autres lignes`] : [])];
}

const ko = (o) => (o / 1024).toFixed(1).replace(".", ",") + " Ko";
// Une combinaison par page suffit pour le poids : la première largeur, le premier thème
function tableauPoids(avant) {
  const premiere = `${largeurs[0]}-${themes[0]}`;
  const variation = (x, y) => {
    if (!y) return "";
    if (x === y) return "identique";
    const pc = (x - y) / y * 100;
    return `${pc > 0 ? "+" : ""}${(Math.abs(pc) < 1 ? pc.toFixed(1) : Math.round(pc).toString()).replace(".", ",")} %`;
  };
  return Object.entries(mesures).filter(([, m]) => m.combinaison === premiere).map(([k, m]) => {
    const a = avant && avant[k];
    let texte = `${m.page} : ${m.requetes} requête(s), ${ko(m.compresse)} compressés, ${ko(m.brut)} bruts, premier affichage ${m.fcp} ms, chargement ${m.charge} ms`;
    if (a) texte += ` ; avant : ${a.requetes} requête(s), ${ko(a.compresse)} compressés (${variation(m.compresse, a.compresse)})`;
    return { ...m, avant: a, texte };
  });
}

const noms = Object.keys(etats);
if (!comparer) {
  fs.writeFileSync(reference, JSON.stringify({ pages: pages.map((x) => x.nom || x.adresse), largeurs, themes, date: new Date().toISOString(), etats, mesures, erreurs: [...erreursPage].sort() }));
  console.log(`Empreinte enregistrée : ${noms.length} états (${largeurs.join(", ")} px ; ${themes.join(", ")}) dans ${reference}`);
  if (contournerCsp) console.log(NOTE_CSP);
  if (avecCaptures) console.log(`Captures : ${dossierCaptures}`);
  console.log(`Poids et vitesse (${largeurs[0]} px, ${themes[0]}) :\n   - ` + tableauPoids(null).map((l) => l.texte).join("\n   - "));
  if (ecartesExploration.size) console.log(`Exploration, non ouverts :\n   - ` + [...ecartesExploration].join("\n   - "));
  if (envoisBloques.size) console.log(NOTE_ENVOIS());
  if (erreursPage.size) console.log("Attention : erreurs JavaScript déjà présentes AVANT la refactorisation, à signaler :\n   - " + [...erreursPage].sort().join("\n   - "));
  for (const [k, v] of Object.entries(etats)) if (v.deborde) console.log(`Note : ${k} déborde horizontalement (${v.deborde} px de large), défaut déjà présent avant refactorisation.`);
} else {
  const ref = refFichier.etats;
  // Ce qui est réellement comparé dépend de ce que la référence contient : le dire, ne jamais l'annoncer à tort
  const a11yComparee = Object.values(ref).every((a) => a.a11y !== undefined);
  const pixelsCompares = avecCaptures && Object.values(ref).every((a) => a.capture);
  const compare = ["DOM", "styles", ...(a11yComparee ? ["accessibilité"] : []), "focus", ...(pixelsCompares ? ["pixels"] : [])].join(", ");
  const reserves = [];
  if (avecCaptures && !pixelsCompares) reserves.push("Pixels NON comparés : la référence a été enregistrée sans captures. La réenregistrer sans --sans-captures pour les comparer.");
  if (!a11yComparee) reserves.push("Accessibilité NON comparée : la référence ne la contient pas. La réenregistrer.");
  if (proprietesAbsentes.length) reserves.push(`Référence enregistrée par une version antérieure de l'outil : ${proprietesAbsentes.length} propriété(s) de style ne sont pas comparées (${proprietesAbsentes.join(", ")}). La réenregistrer pour les couvrir.`);
  let ecarts = 0;
  const MAX = 25;
  const bruits = [];
  const resultats = [];
  for (const k of new Set([...Object.keys(ref), ...noms])) {
    const a = ref[k], b = etats[k];
    if (!a || !b) { ecarts++; console.log(`ÉTAT ${a ? "disparu" : "nouveau"} : ${k}`); resultats.push({ k, lignes: [`état ${a ? "disparu" : "nouveau"}`] }); continue; }
    const lignes = [];
    let image = null;
    if (a.focus !== b.focus) lignes.push(`focus : ${a.focus} -> ${b.focus}`);
    if (a.deborde !== b.deborde) lignes.push(`débordement horizontal : ${a.deborde || "aucun"} -> ${b.deborde || "aucun"}`);
    if (a.dom !== b.dom) {
      let i = 0; while (i < a.dom.length && a.dom[i] === b.dom[i]) i++;
      lignes.push(`DOM, premier écart au caractère ${i}\n      avant : …${a.dom.slice(Math.max(0, i - 80), i + 80)}…\n      après : …${b.dom.slice(Math.max(0, i - 80), i + 80)}…`);
    }
    if (a.a11y !== undefined && a.a11y !== b.a11y) lignes.push(...diffLignes(a.a11y, b.a11y));
    let nStyles = 0;
    for (const el of new Set([...Object.keys(a.styles), ...Object.keys(b.styles)])) {
      const sa = a.styles[el], sb = b.styles[el];
      if (!sa || !sb) { nStyles++; if (nStyles <= MAX) lignes.push(`élément ${sa ? "disparu" : "apparu"} : ${el}`); continue; }
      for (const prop of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
        if (sa[prop] !== sb[prop]) { nStyles++; if (nStyles <= MAX) lignes.push(`${el} { ${prop} : ${sa[prop] ?? "(rien)"} -> ${sb[prop] ?? "(rien)"} }`); }
      }
    }
    if (nStyles > MAX) lignes.push(`… et ${nStyles - MAX} autre(s) écart(s) de style`);
    if (avecCaptures && a.capture && b.capture && a.capture !== b.capture) {
      const fa = path.join(dossierAvant, nomFichier(k)), fb = path.join(dossierCaptures, nomFichier(k));
      if (fs.existsSync(fa) && fs.existsSync(fb)) {
        const d = await pixelsDifferents(fa, fb);
        if (d.taille) lignes.push(`capture : taille changée ${d.taille}`);
        else if (d.nets) {
          lignes.push(`capture : ${d.nets} pixel(s) différent(s) nettement (plus de ${SEUIL_PIXEL} sur 255), zone ${d.zone}`);
          fs.mkdirSync(dossierEcarts, { recursive: true });
          image = path.join(dossierEcarts, nomFichier(k));
          fs.writeFileSync(image, Buffer.from(d.image.split(",")[1], "base64"));
        } else if (d.pixels) bruits.push(`${k} : ${d.pixels} pixel(s), ${d.max} sur 255 au plus`);
      } else lignes.push("capture différente (fichiers de capture introuvables pour mesurer l'écart : référence d'une version antérieure, ou dossier .avant déplacé)");
    }
    resultats.push({ k, lignes, image });
    if (lignes.length) { ecarts++; console.log(`\nÉCART ${k}\n   - ` + lignes.join("\n   - ")); }
  }
  // Le bruit de rendu n'est pas un écart, mais il se dit : état par état, avec son ampleur
  if (bruits.length) console.log(`\nBruit de rendu, sans effet visible (aucun pixel au-delà de ${SEUIL_PIXEL} sur 255), dans ${bruits.length} état(s) :\n   - ` + bruits.join("\n   - "));
  const poids = tableauPoids(refFichier.mesures || null);
  console.log(`\nPoids et vitesse (${largeurs[0]} px, ${themes[0]}), à titre d'information, jamais compté comme écart :\n   - ` + poids.map((l) => l.texte).join("\n   - "));
  if (ecartesExploration.size) console.log(`Exploration, non ouverts :\n   - ` + [...ecartesExploration].join("\n   - "));
  if (envoisBloques.size) console.log(NOTE_ENVOIS());
  if (contournerCsp) console.log(NOTE_CSP);
  // Une erreur JavaScript apparue ou disparue est un changement de comportement ; une erreur déjà là à
  // l'enregistrement n'en est pas un
  const avantErr = refFichier.erreurs, apresErr = [...erreursPage].sort();
  let erreursChangees = [];
  if (!avantErr) erreursChangees = apresErr.map((e) => "erreur JavaScript (la référence, plus ancienne, ne dit pas si elle existait déjà) : " + e);
  else {
    erreursChangees = [...apresErr.filter((e) => !avantErr.includes(e)).map((e) => "erreur JavaScript apparue : " + e), ...avantErr.filter((e) => !apresErr.includes(e)).map((e) => "erreur JavaScript disparue : " + e)];
    const memes = apresErr.filter((e) => avantErr.includes(e));
    if (memes.length) console.log("Erreurs JavaScript déjà présentes à l'enregistrement, inchangées :\n   - " + memes.join("\n   - "));
  }
  if (erreursChangees.length) console.log("\nÉCART erreurs JavaScript\n   - " + erreursChangees.join("\n   - "));
  if (reserves.length) console.log("\n" + reserves.join("\n"));
  console.log(`\n${noms.length} états comparés à ${reference} : ${ecarts ? ecarts + " état(s) avec écart" : `identiques (${compare})`}`);
  ecrireRapport(resultats, ecarts, bruits, poids, compare, [...reserves, ...erreursChangees]);
  console.log(`Rapport visuel : ${fichierRapport}`);
  process.exitCode = ecarts || erreursChangees.length ? 1 : 0;
}
if (erreurs.length) { console.log("Erreurs de scénario : " + erreurs.join(" | ")); process.exitCode = 1; }
await navigateur.close();
if (serveur) await serveur.fermer();

// Rapport visuel autonome (aucune ressource externe), lisible en clair et en sombre, sur téléphone comme sur ordinateur
function ecrireRapport(resultats, ecarts, bruits, poids, compare, reserves) {
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const lien = (f) => path.relative(path.dirname(path.resolve(fichierRapport)), path.resolve(f)).split(path.sep).map(encodeURIComponent).join("/");
  const figure = (f, legende) => (f && fs.existsSync(f) ? `<figure><a href="${lien(f)}"><img src="${lien(f)}" alt="${esc(legende)}" loading="lazy"></a><figcaption>${esc(legende)}</figcaption></figure>` : "");
  const avecEcart = resultats.filter((r) => r.lignes.length);
  const identiques = resultats.filter((r) => !r.lignes.length);
  const cartes = avecEcart.map((r) => `<article class="carte">
  <h3>${esc(r.k)}</h3>
  <ul class="ecarts">${r.lignes.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
  <div class="images">${figure(path.join(dossierAvant, nomFichier(r.k)), "Avant")}${figure(path.join(dossierCaptures, nomFichier(r.k)), "Après")}${figure(r.image, "Différences")}</div>
</article>`).join("\n");
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rapport de refactorisation</title>
<style>
:root{--fond:#f7f7f5;--carte:#ffffff;--texte:#1d1d1f;--doux:#5f6368;--bord:#e2e2df;--ok:#1e7a46;--ok-fond:#e6f4ec;--ko:#b3261e;--ko-fond:#fbe9e7;--code:#f0f0ed}
@media (prefers-color-scheme:dark){:root{--fond:#131314;--carte:#1e1f20;--texte:#e8eaed;--doux:#a8abb0;--bord:#34363a;--ok:#7fd3a0;--ok-fond:#16301f;--ko:#f2a49c;--ko-fond:#3a1a17;--code:#26282b}}
*{box-sizing:border-box}
body{margin:0;background:var(--fond);color:var(--texte);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:1.6rem;margin:0 0 4px}
h2{font-size:1.2rem;margin:32px 0 12px}
h3{font-size:1rem;margin:0 0 8px;word-break:break-word}
.sous-titre{color:var(--doux);margin:0 0 20px}
.bilan{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.bilan div{background:var(--carte);border:1px solid var(--bord);border-radius:10px;padding:12px 14px}
.bilan strong{display:block;font-size:1.6rem}
.verdict{border-radius:10px;padding:14px 16px;margin:16px 0 0;font-weight:600}
.verdict.ok{background:var(--ok-fond);color:var(--ok)}
.verdict.ko{background:var(--ko-fond);color:var(--ko)}
.carte{background:var(--carte);border:1px solid var(--bord);border-radius:12px;padding:16px;margin:0 0 16px}
.ecarts{margin:0 0 12px;padding-left:18px;font:13px/1.45 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word}
.images{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
figure{margin:0}
img{display:block;width:100%;height:auto;border:1px solid var(--bord);border-radius:6px;background:var(--code)}
figcaption{color:var(--doux);font-size:.85rem;margin-top:4px}
table{width:100%;border-collapse:collapse;background:var(--carte);border:1px solid var(--bord);border-radius:10px;overflow:hidden;font-size:.9rem}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--bord);vertical-align:top}
.tableau{overflow-x:auto}
details{background:var(--carte);border:1px solid var(--bord);border-radius:10px;padding:10px 14px}
summary{cursor:pointer;font-weight:600}
details li{word-break:break-word}
.note{color:var(--doux);font-size:.9rem}
</style>
</head>
<body>
<main>
<h1>Rapport de refactorisation</h1>
<p class="sous-titre">Comparaison du ${esc(new Date().toLocaleString("fr-FR"))} à la référence du ${esc(new Date(refFichier.date).toLocaleString("fr-FR"))}</p>
<div class="bilan">
  <div><strong>${resultats.length}</strong>états comparés</div>
  <div><strong>${identiques.length}</strong>identiques</div>
  <div><strong>${ecarts}</strong>avec écart</div>
  <div><strong>${largeurs.join(" et ")} px</strong>thème ${esc(themes.join(" et "))}</div>
</div>
<p class="verdict ${ecarts ? "ko" : "ok"}">${ecarts ? `${ecarts} état(s) diffèrent de la référence : détail ci-dessous.` : `Tout est identique à la référence (${esc(compare)}).`}</p>
${reserves.map((x) => `<p class="verdict ko">${esc(x)}</p>`).join("\n")}
${contournerCsp ? `<p class="note">${esc(NOTE_CSP)}</p>` : ""}
${envoisBloques.size ? `<p class="note">${esc(NOTE_ENVOIS())}</p>` : ""}
${avecEcart.length ? `<h2>États avec écart</h2>\n${cartes}` : ""}
<h2>Poids et vitesse</h2>
<p class="note">Mesurés au chargement, à ${largeurs[0]} px en thème ${esc(themes[0])}. Poids compressé recalculé en gzip. Les temps mesurés en local sont indicatifs. Ces chiffres ne comptent jamais comme un écart.</p>
<div class="tableau"><table>
<thead><tr><th>Page</th><th>Requêtes</th><th>Compressé</th><th>Brut</th><th>Premier affichage</th><th>Chargement</th></tr></thead>
<tbody>${poids.map((l) => `<tr><td>${esc(l.page)}</td><td>${l.requetes}${l.avant ? ` <span class="note">(avant ${l.avant.requetes})</span>` : ""}</td><td>${ko(l.compresse)}${l.avant ? ` <span class="note">(avant ${ko(l.avant.compresse)})</span>` : ""}</td><td>${ko(l.brut)}${l.avant ? ` <span class="note">(avant ${ko(l.avant.brut)})</span>` : ""}</td><td>${l.fcp} ms</td><td>${l.charge} ms</td></tr>`).join("")}</tbody>
</table></div>
${bruits.length ? `<h2>Bruit de rendu</h2><p class="note">Pixels qui diffèrent de moins de ${SEUIL_PIXEL} sur 255 : sans effet visible, signalés pour mémoire.</p><details><summary>${bruits.length} état(s)</summary><ul>${bruits.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></details>` : ""}
${ecartesExploration.size ? `<h2>Exploration : éléments non ouverts</h2><details><summary>${ecartesExploration.size} élément(s)</summary><ul>${[...ecartesExploration].map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}
${identiques.length ? `<h2>États identiques</h2><details><summary>${identiques.length} état(s)</summary><ul>${identiques.map((r) => `<li>${avecCaptures && fs.existsSync(path.join(dossierCaptures, nomFichier(r.k))) ? `<a href="${lien(path.join(dossierCaptures, nomFichier(r.k)))}">${esc(r.k)}</a>` : esc(r.k)}</li>`).join("")}</ul></details>` : ""}
</main>
</body>
</html>
`;
  fs.writeFileSync(fichierRapport, html);
}
