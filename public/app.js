const catalog = document.getElementById("catalog");
const search = document.getElementById("search");
const sideMenu = document.getElementById("sideMenu");
const menuButton = document.getElementById("menuButton");
const closeMenu = document.getElementById("closeMenu");
const menuOverlay = document.getElementById("menuOverlay");
const genreList = document.getElementById("genreList");
const loading = document.getElementById("loading");
const empty = document.getElementById("empty");

let state = {
sort: "new"
};

/* =========================================================
GENRES

IMPORTANT :
Ces noms doivent correspondre aux genres normalisés
par server.js.
========================================================= */

const KNOWN_GENRES = [
"Action",
"Animation",
"Aventure",
"Arts Martiaux",
"Biopic",
"Comédie",
"Crime",
"Documentaire",
"Drame",
"Famille",
"Fantastique",
"Guerre",
"Histoire",
"Historique",
"Horreur",
"Espionnage",
"Policier",
"Romance",
"Science-Fiction",
"Spectacle",
"Thriller",
"Western",
"Mystère",
"Musique",
"Télé-Réalité",
"K-DRAMA"
];

/* =========================================================
MENU
========================================================= */

function openMenu() {
sideMenu.classList.add("open");
}

function closeSideMenu() {
sideMenu.classList.remove("open");
}

if (menuButton) {
menuButton.addEventListener("click", openMenu);
}

if (closeMenu) {
closeMenu.addEventListener("click", closeSideMenu);
}

if (menuOverlay) {
menuOverlay.addEventListener("click", closeSideMenu);
}

/* =========================================================
API
========================================================= */

async function api(url) {

const response = await fetch(url, {
headers: {
"Accept": "application/json"
}
});

if (!response.ok) {
throw new Error("HTTP ${response.status}");
}

return response.json();
}

/* =========================================================
NORMALISATION GENRE CÔTÉ CLIENT
========================================================= */

function normalizeGenre(value) {

if (!value) {
return "";
}

const normalized =
String(value)
.normalize("NFD")
.replace(/[\u0300-\u036f]/g, "")
.toLowerCase()
.replace(/[-_]+/g, " ")
.replace(/\s+/g, " ")
.trim();

const aliases = {

"science fiction":
  "Science-Fiction",

"science-fiction":
  "Science-Fiction",

"tele realite":
  "Télé-Réalité",

"tele-realite":
  "Télé-Réalité",

"k drama":
  "K-DRAMA",

"k-drama":
  "K-DRAMA",

"mystere":
  "Mystère",

"historique":
  "Historique",

"histoire":
  "Histoire"

};

if (aliases[normalized]) {
return aliases[normalized];
}

for (const genre of KNOWN_GENRES) {

const gn =
  genre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

if (normalized === gn) {
  return genre;
}

}

return "";
}

/* =========================================================
GENRES D'UN ITEM
========================================================= */

function getItemGenres(item) {

if (
!item ||
!Array.isArray(item.genres)
) {
return [];
}

return [
...new Set(
item.genres
.map(normalizeGenre)
.filter(Boolean)
)
];
}

/* =========================================================
GENRES
========================================================= */

async function loadCategories() {

genreList.innerHTML = "";

KNOWN_GENRES.forEach(genre => {

const button =
  document.createElement("button");

button.className =
  "category-button";

button.textContent =
  genre;


button.dataset.genre =
  genre;


button.addEventListener(
  "click",
  () => {

    state = {
      sort: "new",
      genre: genre
    };

    closeSideMenu();

    loadCatalog();

  }
);


genreList.appendChild(
  button
);

});

}

/* =========================================================
URL CATALOGUE
========================================================= */

function buildCatalogUrl() {

const params =
new URLSearchParams();

if (state.type) {

params.set(
  "type",
  state.type
);

}

if (state.language) {

params.set(
  "language",
  state.language
);

}

if (state.genre) {

params.set(
  "genre",
  state.genre
);

}

if (state.q) {

params.set(
  "q",
  state.q
);

}

if (state.sort) {

params.set(
  "sort",
  state.sort
);

}

/*

* PAS DE PAGE.
* 
* Le serveur renvoie le catalogue correspondant
* au filtre demandé.
  */

const query =
params.toString();

return query
? "/api/catalog?${query}"
: "/api/catalog";

}

/* =========================================================
IMAGE
========================================================= */

function createPoster(item) {

if (!item.poster) {

const placeholder =
  document.createElement("div");

placeholder.className =
  "poster";

return placeholder;

}

const image =
document.createElement("img");

image.className =
"poster";

image.loading =
"lazy";

image.alt =
item.title || "";

image.src =
item.poster;

image.onerror = () => {

image.removeAttribute(
  "src"
);

};

return image;

}

/* =========================================================
BADGES
========================================================= */

function createBadges(item) {

const container =
document.createElement("div");

container.className =
"badges";

if (item.language) {

const language =
  document.createElement("span");

language.className =
  "badge";

language.textContent =
  item.language;

container.appendChild(
  language
);

}

if (item.quality) {

const quality =
  document.createElement("span");

quality.className =
  "badge";

quality.textContent =
  item.quality;

container.appendChild(
  quality
);

}

return container;

}

/* =========================================================
CARTE
========================================================= */

function createCard(item) {

const card =
document.createElement("article");

card.className =
"card";

card.dataset.id =
item.id;

const poster =
createPoster(item);

card.appendChild(
poster
);

const badges =
createBadges(item);

card.appendChild(
badges
);

const score =
document.createElement("span");

score.className =
"score";

if (item.rating) {

score.textContent =
  Number(item.rating).toFixed(1);

}

else if (item.year) {

score.textContent =
  item.year;

}

card.appendChild(
score
);

const title =
document.createElement("div");

title.className =
"title";

title.textContent =
item.title ||
"Sans titre";

card.appendChild(
title
);

/*

* Les genres ne sont pas forcément affichés
* sur la carte, mais on les conserve dans le DOM
* pour faciliter le diagnostic.
  */

const genres =
getItemGenres(item);

if (genres.length) {

card.dataset.genres =
  genres.join("|");

}

card.addEventListener(
"click",
() => {

  openItem(
    item.id
  );

}

);

return card;

}

/* =========================================================
CATALOGUE
========================================================= */

async function loadCatalog() {

loading.classList.remove(
"hidden"
);

empty.classList.add(
"hidden"
);

catalog.innerHTML = "";

try {

const url =
  buildCatalogUrl();


console.log(
  "FS15 URL catalogue:",
  url
);


const data =
  await api(url);


loading.classList.add(
  "hidden"
);


if (
  !data.items ||
  !data.items.length
) {

  empty.textContent =
    state.genre
      ? `Aucun film ou série dans le genre « ${state.genre} ».`
      : "Aucun résultat.";

  empty.classList.remove(
    "hidden"
  );

  return;

}


data.items.forEach(
  item => {

    catalog.appendChild(
      createCard(item)
    );

  }
);


console.log(
  `FS15 interface : ${data.items.length} éléments affichés`
);


/*
 * Diagnostic :
 * affiche les genres réellement reçus du serveur.
 */

const receivedGenres = [
  ...new Set(
    data.items
      .flatMap(
        item =>
          getItemGenres(item)
      )
  )
];


console.log(
  "FS15 genres reçus:",
  receivedGenres
);

}

catch (error) {

console.error(
  "Erreur catalogue:",
  error
);


loading.classList.add(
  "hidden"
);


empty.textContent =
  "Impossible de charger le catalogue.";


empty.classList.remove(
  "hidden"
);

}

}

/* =========================================================
FICHE
========================================================= */

async function openItem(id) {

try {

const item =
  await api(
    `/api/item/${encodeURIComponent(id)}`
  );


showItem(item);

}

catch (error) {

console.error(
  "Erreur fiche:",
  error
);

}

}

/* =========================================================
AFFICHAGE FICHE
========================================================= */

function showItem(item) {

const old =
document.getElementById(
"itemModal"
);

if (old) {
old.remove();
}

const modal =
document.createElement("div");

modal.id =
"itemModal";

modal.style.position =
"fixed";

modal.style.inset =
"0";

modal.style.zIndex =
"100";

modal.style.background =
"rgba(0,0,0,.88)";

modal.style.overflowY =
"auto";

const box =
document.createElement("div");

box.style.maxWidth =
"700px";

box.style.margin =
"30px auto";

box.style.padding =
"20px";

box.style.background =
"#202020";

const close =
document.createElement("button");

close.textContent =
"×";

close.style.float =
"right";

close.style.background =
"none";

close.style.border =
"0";

close.style.color =
"#fff";

close.style.fontSize =
"36px";

close.addEventListener(
"click",
() => modal.remove()
);

const title =
document.createElement("h1");

title.textContent =
item.title ||
"Sans titre";

const info =
document.createElement("p");

const details = [];

if (item.year) {
details.push(item.year);
}

if (item.language) {
details.push(item.language);
}

if (item.quality) {
details.push(item.quality);
}

if (item.rating) {

details.push(
  `★ ${Number(item.rating).toFixed(1)}`
);

}

info.textContent =
details.join(" • ");

/*

* GENRES DE LA FICHE
  */

const genres =
getItemGenres(item);

if (genres.length) {

const genreInfo =
  document.createElement("p");

genreInfo.textContent =
  `Genres : ${genres.join(", ")}`;

box.appendChild(
  genreInfo
);

}

if (item.poster) {

const poster =
  document.createElement("img");

poster.src =
  item.poster;

poster.style.width =
  "100%";

poster.style.maxWidth =
  "400px";

poster.style.display =
  "block";

poster.style.margin =
  "20px auto";


box.appendChild(
  poster
);

}

const synopsis =
document.createElement("p");

synopsis.textContent =
item.synopsis ||
"Aucune description disponible.";

synopsis.style.lineHeight =
"1.6";

box.prepend(
close
);

box.appendChild(
title
);

box.appendChild(
info
);

box.appendChild(
synopsis
);

modal.appendChild(
box
);

document.body.appendChild(
modal
);

}

/* =========================================================
NAVIGATION PRINCIPALE
========================================================= */

document
.querySelectorAll(
".nav-button"
)
.forEach(button => {

button.addEventListener(
  "click",
  () => {

    document
      .querySelectorAll(
        ".nav-button"
      )
      .forEach(
        b =>
          b.classList.remove(
            "active"
          )
      );


    button.classList.add(
      "active"
    );


    state = {};


    const action =
      button.dataset.action;


    if (
      action === "new"
    ) {

      state.sort =
        "new";

    }

    else if (
      action === "rating"
    ) {

      state.sort =
        "rating";

    }

    else if (
      action === "comments"
    ) {

      state.sort =
        "comments";

    }

    else if (
      action === "views"
    ) {

      state.sort =
        "views";

    }


    loadCatalog();

  }
);

});

/* =========================================================
CATEGORIES MENU
========================================================= */

document
.querySelectorAll(
".category-button[data-type], .category-button[data-language]"
)
.forEach(button => {

button.addEventListener(
  "click",
  () => {

    state = {
      sort: "new"
    };


    if (
      button.dataset.type
    ) {

      state.type =
        button.dataset.type;

    }


    if (
      button.dataset.language
    ) {

      state.language =
        button.dataset.language;

    }


    closeSideMenu();

    loadCatalog();

  }
);

});

/* =========================================================
RECHERCHE
========================================================= */

let searchTimer =
null;

if (search) {

search.addEventListener(
"input",
() => {

  clearTimeout(
    searchTimer
  );


  searchTimer =
    setTimeout(
      () => {

        state.q =
          search.value.trim();

        loadCatalog();

      },
      250
    );

}

);

}

/* =========================================================
INITIALISATION
========================================================= */

async function init() {

await loadCategories();

await loadCatalog();

}

init();
