const express = require("express");
const path = require("path");

const { getCatalogue } = require("./src/provider");

const app = express();
const PORT = Number(process.env.PORT || 7860);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


/* =========================================================
   FS23
   ========================================================= */

const FS23 = "https://fs23.lol";


/* =========================================================
   SOURCES REELLES
   ========================================================= */

const SOURCES = {

  films:
    `${FS23}/index.php?category=films&do=cat`,

  series:
    `${FS23}/index.php?category=s-tv&do=cat`,

  topFilms:
    `${FS23}/index.php?category=top-film&do=cat`,

  communityFilms:
    `${FS23}/index.php?category=film-commu&do=cat`

};


/* =========================================================
   GENRES PROPRES
   ========================================================= */

const KNOWN_GENRES = [

  "Action",
  "Animation",
  "Aventure",
  "Comédie",
  "Crime",
  "Documentaire",
  "Drame",
  "Famille",
  "Fantastique",
  "Histoire",
  "Horreur",
  "Musique",
  "Mystère",
  "Romance",
  "Science-Fiction",
  "Thriller",
  "Guerre",
  "Western"

];


/* =========================================================
   CATALOGUE LOCAL
   ========================================================= */

async function localCatalogue(query = {}) {

  let items =
    [...await getCatalogue()];

  const {
    type,
    genre,
    language,
    year,
    q,
    sort
  } = query;


  /* -------------------------------------------------------
     TYPE
     ------------------------------------------------------- */

  if (type) {

    items =
      items.filter(
        item =>
          item.type === type
      );

  }


  /* -------------------------------------------------------
     GENRE
     ------------------------------------------------------- */

  if (genre) {

    const wanted =
      String(genre)
        .trim()
        .toLowerCase();

    items =
      items.filter(item => {

        if (!Array.isArray(item.genres)) {
          return false;
        }

        return item.genres.some(
          g =>
            String(g)
              .trim()
              .toLowerCase() === wanted
        );

      });

  }


  /* -------------------------------------------------------
     LANGUE
     ------------------------------------------------------- */

  if (language) {

    const wanted =
      String(language)
        .trim()
        .toLowerCase();

    items =
      items.filter(item =>

        String(
          item.language || ""
        )
        .toLowerCase()
        .includes(wanted)

      );

  }


  /* -------------------------------------------------------
     ANNEE
     ------------------------------------------------------- */

  if (year) {

    items =
      items.filter(
        item =>
          String(
            item.year || ""
          ) === String(year)
      );

  }


  /* -------------------------------------------------------
     RECHERCHE
     ------------------------------------------------------- */

  if (q) {

    const search =
      String(q)
        .trim()
        .toLowerCase();

    items =
      items.filter(item =>

        String(
          item.title || ""
        )
        .toLowerCase()
        .includes(search)

        ||

        String(
          item.synopsis || ""
        )
        .toLowerCase()
        .includes(search)

      );

  }


  /* -------------------------------------------------------
     TRI
     ------------------------------------------------------- */

  switch (sort) {

    case "rating":

      items.sort(
        (a, b) =>
          Number(b.rating || 0) -
          Number(a.rating || 0)
      );

      break;


    case "comments":

      items.sort(
        (a, b) =>
          Number(b.comments || 0) -
          Number(a.comments || 0)
      );

      break;


    case "views":

      items.sort(
        (a, b) =>
          Number(b.views || 0) -
          Number(a.views || 0)
      );

      break;


    case "year":

      items.sort(
        (a, b) =>
          Number(b.year || 0) -
          Number(a.year || 0)
      );

      break;


    case "new":

    default:

      break;

  }


  return items;

}


/* =========================================================
   CATALOGUE
   ========================================================= */

app.get(
  "/api/catalog",
  async (req, res) => {

    try {

      const items =
        await localCatalogue(
          req.query
        );

      res.json({

        items,

        count:
          items.length

      });

    }

    catch (error) {

      console.error(
        "Erreur catalogue :",
        error
      );

      res.status(500).json({

        error:
          "Erreur catalogue"

      });

    }

  }
);


/* =========================================================
   PAGES PRINCIPALES
   ========================================================= */

app.get(
  "/api/page/:page",
  async (req, res) => {

    try {

      const page =
        req.params.page;


      const configs = {

        nouveautes: {
          type: null,
          sort: "new"
        },

        films: {
          type: "movie",
          sort: "new"
        },

        series: {
          type: "series",
          sort: "new"
        },

        notes: {
          type: "movie",
          sort: "rating"
        },

        commentes: {
          type: "movie",
          sort: "comments"
        },

        regardes: {
          type: "movie",
          sort: "views"
        }

      };


      const config =
        configs[page];


      if (!config) {

        return res
          .status(404)
          .json({

            error:
              "Page inconnue"

          });

      }


      const items =
        await localCatalogue(
          config
        );


      let source;


      if (page === "notes") {

        source =
          SOURCES.topFilms;

      }

      else if (page === "commentes") {

        source =
          SOURCES.communityFilms;

      }

      else if (page === "films") {

        source =
          SOURCES.films;

      }

      else if (page === "series") {

        source =
          SOURCES.series;

      }

      else {

        source =
          SOURCES.films;

      }


      res.json({

        page,

        source,

        items,

        count:
          items.length

      });

    }

    catch (error) {

      console.error(
        "Erreur page :",
        error
      );

      res.status(500).json({

        error:
          "Erreur page"

      });

    }

  }
);


/* =========================================================
   CATEGORIES
   ========================================================= */

app.get(
  "/api/categories",
  async (_req, res) => {

    try {

      /*
       * IMPORTANT :
       * Les genres du menu ne sont PLUS
       * récupérés depuis les textes de FS23.
       *
       * On utilise uniquement notre liste
       * propre afin d'éviter les commentaires,
       * URLs, noms de personnes, etc.
       */

      const genres =
        [...KNOWN_GENRES];


      /*
       * Les années restent calculées
       * depuis le catalogue.
       */

      const items =
        await getCatalogue();


      const years =
        [
          ...new Set(

            items

              .map(
                item =>
                  String(
                    item.year || ""
                  )
              )

              .filter(Boolean)

          )

        ]

        .sort(
          (a, b) =>
            Number(b) -
            Number(a)
        );


      res.json({

        sources: SOURCES,

        types: [

          "movie",
          "series"

        ],

        languages: [

          "VF",
          "VF+VOSTFR",
          "VOSTFR",
          "VO"

        ],

        genres,

        years

      });

    }

    catch (error) {

      console.error(
        "Erreur catégories :",
        error
      );

      res.status(500).json({

        error:
          "Erreur catégories"

      });

    }

  }
);


/* =========================================================
   RECHERCHE
   ========================================================= */

app.get(
  "/api/search",
  async (req, res) => {

    try {

      const q =
        String(
          req.query.q || ""
        ).trim();


      if (!q) {

        return res.json({

          items: [],

          count: 0

        });

      }


      const items =
        await localCatalogue({

          q,

          sort: "new"

        });


      res.json({

        items,

        count:
          items.length

      });

    }

    catch (error) {

      console.error(
        "Erreur recherche :",
        error
      );

      res.status(500).json({

        error:
          "Erreur recherche"

      });

    }

  }
);


/* =========================================================
   FICHE
   ========================================================= */

app.get(
  "/api/item/:id",
  async (req, res) => {

    try {

      const items =
        await getCatalogue();


      const item =
        items.find(
          entry =>
            String(entry.id) ===
            String(req.params.id)
        );


      if (!item) {

        return res
          .status(404)
          .json({

            error:
              "Fiche introuvable"

          });

      }


      res.json(item);

    }

    catch (error) {

      console.error(
        "Erreur fiche :",
        error
      );

      res.status(500).json({

        error:
          "Erreur fiche"

      });

    }

  }
);


/* =========================================================
   SOURCES FS23
   ========================================================= */

app.get(
  "/api/fs23/sources",
  (_req, res) => {

    res.json({

      base: FS23,

      sources: SOURCES

    });

  }
);


/* =========================================================
   HEALTH
   ========================================================= */

app.get(
  "/api/health",
  (_req, res) => {

    res.json({

      status: "ok",

      service:
        "fs15-clone",

      source:
        "fs23.lol"

    });

  }
);


/* =========================================================
   START
   ========================================================= */

app.listen(
  PORT,
  () => {

    console.log(
      `FS23 Clone lancé sur le port ${PORT}`
    );

  }
);
