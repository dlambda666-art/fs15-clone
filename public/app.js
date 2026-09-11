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
  "Musique"
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

menuButton.addEventListener("click", openMenu);
closeMenu.addEventListener("click", closeSideMenu);
menuOverlay.addEventListener("click", closeSideMenu);


/* =========================================================
   API
   ========================================================= */

async function api(url) {

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}


/* =========================================================
   GENRES
   ========================================================= */

function loadCategories() {

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

    genreList.appendChild(button);

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


  const query =
    params.toString();


  /*
   * IMPORTANT :
   *
   * On construit réellement l'URL.
   *
   * Exemple :
   *
   * /api/catalog?genre=Action&sort=new
   *
   * et non :
   *
   * /api/catalog?${query}
   */

  const url =
    query
      ? `/api/catalog?${query}`
      : "/api/catalog";


  console.log(
    "FS15 URL catalogue:",
    url
  );


  return url;
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
          ? `Aucun film trouvé dans le genre « ${state.genre} ».`
          : "Aucun résultat.";

      empty.classList.remove(
        "hidden"
      );

      return;

    }


    /* =========================================================
   TRI NOUVEAUTÉS
   =========================================================
   Les années les plus récentes passent en premier.
   Exemple : 2026 → 2025 → 2024 → etc.
   ========================================================= */

data.items.sort((a, b) => {

  const yearA =
    Number(a.year) || 0;

  const yearB =
    Number(b.year) || 0;

  return yearB - yearA;

});


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
     * DEBUG :
     *
     * Permet de voir dans la console
     * quel genre est actuellement demandé.
     */

    console.log(
      "FS15 genre actif:",
      state.genre || "aucun"
    );

  }

  catch (error) {

    console.error(
      "Erreur catalogue :",
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
      "Erreur fiche :",
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
    item.title;


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


/* =========================================================
   INITIALISATION
   ========================================================= */

async function init() {

  loadCategories();

  await loadCatalog();

}


init();
