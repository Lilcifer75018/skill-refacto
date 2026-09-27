// Empreinte d'une page ou d'une appli HTML, pour prouver qu'une refactorisation ne change rien à l'écran.
// Avant de toucher au code : on enregistre. Après : on compare, et chaque écart est montré avec son contexte.
//
// Ce qui est relevé, pour chaque état x largeur x thème :
//   - le DOM rendu (scripts retirés) ;
//   - le style calculé de chaque élément visible, pseudo-éléments ::before et ::after compris, et sa boîte ;
//   - l'élément qui a le focus, les erreurs JavaScript, un éventuel débordement horizontal ;
//   - une capture pleine page, comparée pixel par pixel quand elle change.
//
// Usage :
//   node empreinte.mjs <cible> <reference.json> [options]
//   <cible>            fichier .html, dossier (ouvre index.html) ou adresse http(s) ;
//                      avec --toutes-pages, un dossier dont chaque page .html est mesurée (site entier)
//   <reference.json>   absent : il est créé (enregistrement). Présent : la page est comparée à lui.
// Options :
//   --racine <dossier>     dossier servi en local (défaut : celui du fichier ; utile si la page charge ../quelque-chose)
//   --etats <module.mjs>   scénario qui ouvre les menus, feuilles, onglets... (voir exemple-etats.mjs)
//   --largeurs 375,1440    largeurs d'écran (défaut 375 et 1440)
//   --themes clair,sombre  thèmes (défaut : les deux si la page gère le thème sombre, sinon clair)
//   --garder-animations    ne neutralise pas animations et transitions (déconseillé : rend les captures instables)
//   --sans-captures        ne fait pas de captures (plus rapide, compare DOM et styles seulement)
//   --toutes-pages         trouve seul toutes les pages .html du dossier cible : une page ajoutée entre sans rien
//                          déclarer (un outil dont la liste de pages est écrite à la main finit par en oublier)
//   --exclure <morceau>    avec --toutes-pages, écarte les chemins qui contiennent ce morceau (répétable) :
//                          sources d'un build, brouillons, outils internes
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
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
const valeursOptions = new Set([...["racine", "etats", "largeurs", "themes"].map((n) => option(n)).filter(Boolean), ...exclus]);
const positionnels = args.filter((a) => !a.startsWith("--") && !valeursOptions.has(a));
const [cible, reference] = positionnels;
if (!cible || !reference) {
  console.log("Usage : node empreinte.mjs <fichier.html | dossier | https://...> <reference.json> [--etats scenario.mjs] [--largeurs 375,1440] [--themes clair,sombre] [--racine dossier]");
  process.exit(2);
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const largeurs = (option("largeurs") || "375,1440").split(",").map(Number);
const hauteurPour = (l) => (l < 768 ? 812 : 900);
const comparer = fs.existsSync(reference);
const dossierCaptures = reference.replace(/\.json$/i, "") + (comparer ? ".apres" : ".avant");
const dossierAvant = reference.replace(/\.json$/i, "") + ".avant";
const avecCaptures = !drapeau("sans-captures");
if (avecCaptures) fs.mkdirSync(dossierCaptures, { recursive: true });

// Serveur local : les pages ouvertes en file:// se comportent autrement (modules, fetch, service worker)
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif", ".woff2": "font/woff2", ".woff": "font/woff", ".ico": "image/x-icon", ".mp4": "video/mp4" };
async function servir(racine) {
  const serveur = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split("?")[0].split("#")[0]);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(racine, p);
    if (!f.startsWith(racine) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
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

const NEUTRALISER = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}";
const PROPRIETES = ["display", "visibility", "position", "top", "right", "bottom", "left", "z-index", "box-sizing", "margin", "padding", "border", "border-radius", "outline", "color", "background-color", "background-image", "opacity", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-align", "text-transform", "text-decoration-line", "white-space", "overflow", "flex-direction", "flex-wrap", "justify-content", "align-items", "gap", "grid-template-columns", "grid-template-rows", "transform", "filter", "box-shadow", "cursor", "object-fit", "aspect-ratio"];

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
    for (const p of proprietes) s[p] = cs.getPropertyValue(p);
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

const navigateur = await puppeteer.launch({ headless: "new" });
const etats = {};
const erreurs = [];

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
      p.on("pageerror", (e) => erreurs.push(`${prefixe}${combinaison} : ${e.message}`));
      const mobile = largeur < 768;
      await p.setViewport({ width: largeur, height: hauteurPour(largeur), deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
      await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme === "sombre" ? "dark" : "light" }, { name: "prefers-reduced-motion", value: "reduce" }]);
      if (!drapeau("garder-animations")) await p.evaluateOnNewDocument((css) => { document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); }); }, NEUTRALISER);
      if (preparerPage) await preparerPage(p);
      await p.goto(adresse, { waitUntil: "networkidle0" });
      // Sans attendre les polices, le texte est mesuré dans la fonte de repli et toutes les largeurs sont fausses
      await p.evaluate(() => document.fonts && document.fonts.ready);
      await pause(400);
      const outils = {
        pause,
        capturer: async (nom) => {
          await pause(300);
          const cleEtat = `${prefixe}${nom} @ ${combinaison}`;
          etats[cleEtat] = await p.evaluate(releverDansPage, PROPRIETES);
          if (avecCaptures) {
            const png = await p.screenshot({ fullPage: true });
            etats[cleEtat].capture = crypto.createHash("sha256").update(png).digest("hex");
            fs.writeFileSync(path.join(dossierCaptures, nomFichier(cleEtat)), png);
          }
        },
        clic: (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error("introuvable : " + s); e.click(); }, sel),
        saisir: (sel, valeur) => p.evaluate((s, v) => { const e = document.querySelector(s); if (!e) throw new Error("introuvable : " + s); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }, sel, valeur),
        touche: async (t) => { await p.keyboard.press(t); await pause(200); },
        defiler: (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error("introuvable : " + s); e.scrollIntoView({ block: "start" }); }, sel),
        recharger: () => p.reload({ waitUntil: "networkidle0" }),
        largeur, theme, page: nomPage,
      };
      try { await scenario(p, outils); } catch (e) { erreurs.push(`${prefixe}${combinaison} : scénario interrompu, ${e.message}`); }
      await ctx.close();
    }
  }
}
const themes = [...themesVus];

function nomFichier(cleEtat) { return cleEtat.replace(/[^a-z0-9._-]+/gi, "_") + ".png"; }

// Comparaison de deux captures pixel par pixel, dans le navigateur (aucune dépendance à installer)
async function pixelsDifferents(a, b) {
  const p = await navigateur.newPage();
  const res = await p.evaluate(async (da, db) => {
    const charge = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
    const [ia, ib] = await Promise.all([charge(da), charge(db)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { taille: `${ia.width}x${ia.height} -> ${ib.width}x${ib.height}` };
    const lire = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
    const pa = lire(ia), pb = lire(ib);
    let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let i = 0; i < pa.length; i += 4) {
      if (pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2] || pa[i + 3] !== pb[i + 3]) {
        n++; const k = i / 4, x = k % ia.width, y = Math.floor(k / ia.width);
        if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
      }
    }
    return { pixels: n, zone: n ? `x ${x0}-${x1}, y ${y0}-${y1}` : "" };
  }, "data:image/png;base64," + fs.readFileSync(a).toString("base64"), "data:image/png;base64," + fs.readFileSync(b).toString("base64"));
  await p.close();
  return res;
}

const noms = Object.keys(etats);
if (!comparer) {
  fs.writeFileSync(reference, JSON.stringify({ pages: pages.map((x) => x.nom || x.adresse), largeurs, themes, date: new Date().toISOString(), etats }));
  console.log(`Empreinte enregistrée : ${noms.length} états (${largeurs.join(", ")} px ; ${themes.join(", ")}) dans ${reference}`);
  if (avecCaptures) console.log(`Captures : ${dossierCaptures}`);
  for (const [k, v] of Object.entries(etats)) if (v.deborde) console.log(`Note : ${k} déborde horizontalement (${v.deborde} px de large), défaut déjà présent avant refactorisation.`);
} else {
  const ref = JSON.parse(fs.readFileSync(reference, "utf8")).etats;
  let ecarts = 0;
  const MAX = 25;
  for (const k of new Set([...Object.keys(ref), ...noms])) {
    const a = ref[k], b = etats[k];
    if (!a || !b) { ecarts++; console.log(`ÉTAT ${a ? "disparu" : "nouveau"} : ${k}`); continue; }
    const lignes = [];
    if (a.focus !== b.focus) lignes.push(`focus : ${a.focus} -> ${b.focus}`);
    if (a.deborde !== b.deborde) lignes.push(`débordement horizontal : ${a.deborde || "aucun"} -> ${b.deborde || "aucun"}`);
    if (a.dom !== b.dom) {
      let i = 0; while (i < a.dom.length && a.dom[i] === b.dom[i]) i++;
      lignes.push(`DOM, premier écart au caractère ${i}\n      avant : …${a.dom.slice(Math.max(0, i - 80), i + 80)}…\n      après : …${b.dom.slice(Math.max(0, i - 80), i + 80)}…`);
    }
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
        else if (d.pixels) lignes.push(`capture : ${d.pixels} pixel(s) différent(s), zone ${d.zone}`);
      } else lignes.push("capture différente (fichiers de capture introuvables pour mesurer l'écart)");
    }
    if (lignes.length) { ecarts++; console.log(`\nÉCART ${k}\n   - ` + lignes.join("\n   - ")); }
  }
  console.log(`\n${noms.length} états comparés à ${reference} : ${ecarts ? ecarts + " état(s) avec écart" : "identiques (DOM, styles, focus" + (avecCaptures ? ", pixels)" : ")")}`);
  if (avecCaptures && ecarts) console.log(`Captures avant : ${dossierAvant}\nCaptures après : ${dossierCaptures}`);
  process.exitCode = ecarts ? 1 : 0;
}
if (erreurs.length) { console.log("Erreurs JavaScript ou de scénario : " + erreurs.join(" | ")); process.exitCode = 1; }
await navigateur.close();
if (serveur) await serveur.fermer();
