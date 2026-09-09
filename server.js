const express = require("express");
const path = require("path");

const { getCatalogue } = require("./src/provider");

const app = express();
const PORT = Number(process.env.PORT || 7860);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


/* =========================================================
   FILTRAGE / TRI
   ========================================================= */

async function filtered(query = {}) {
  let items = [...await getCatalogue()];

  const {
    type,
    genre,
    language,
    q,
    sort,
    year
  } = query;


  /* TYPE */

  if (type) {
    items = items.filter(
      item => item.type === type
    );
  }


  /* GENRE */

  if (genre) {

    const wanted =
      String(genre).toLowerCase();

    items = items.filter(item =>
      Array.isArray(item.genres) &&
      item.genres.some(
        g =>
          String(g).toLowerCase() === wanted
      )
    );
  }


  /* LANGUE */

  if (language) {

    const wanted =
      String(language).toLowerCase();

    items = items.filter(item =>
      String(item.language || "")
        .toLowerCase()
        .includes(wanted)
    );
  }


  /* ANNEE */

  if (year) {

    items = items.filter(
      item =>
        String(item.year || "") ===
        String(year)
    );
  }


  /* RECHERCHE */

  if (q) {

    const search =
      String(q).toLowerCase();

    items = items.filter(item =>

      String(item.title || "")
        .toLowerCase()
        .includes(search)

      ||

      String(item.synopsis || "")
        .toLowerCase()
        .includes(search)
    );
  }


  /* TRI */

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
        await filtered(req.query);

      res.json({
        items,
        count: items.length
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error: "Erreur catalogue"
      });
    }
  }
);


/* =========================================================
   PAGES FS15
   ========================================================= */

app.get(
  "/api/page/:page",
  async (req, res) => {

    try {

      const pages = {

        nouveautes: {},

        notes: {
          sort: "rating"
        },

        commentes: {
          sort: "comments"
        },

        regardes: {
          sort: "views"
        },

        films: {
          type: "movie"
        },

        series: {
          type: "series"
        }
      };


      const config =
        pages[req.params.page];


      if (!config) {

        return res.status(404).json({
          error: "Page inconnue"
        });
      }


      const items =
        await filtered(config);


      res.json({

        page:
          req.params.page,

        items,

        count:
          items.length
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error: "Erreur page"
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

      const items =
        await getCatalogue();


      const genres =
        [...new Set(

          items.flatMap(
            item =>
              Array.isArray(item.genres)
                ? item.genres
                : []
          )

        )]
        .filter(Boolean)
        .sort(
          (a, b) =>
            a.localeCompare(
              b,
              "fr"
            )
        );


      const years =
        [...new Set(

          items
            .map(
              item =>
                String(
                  item.year || ""
                )
            )
            .filter(Boolean)

        )]
        .sort(
          (a, b) =>
            Number(b) -
            Number(a)
        );


      res.json({

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

        years,

        countries:
          [...new Set(

            items.flatMap(
              item =>
                Array.isArray(
                  item.country
                )
                  ? item.country
                  : []
            )

          )]
          .filter(Boolean)
          .sort(),

        themes:
          [...new Set(

            items.flatMap(
              item =>
                Array.isArray(
                  item.themes
                )
                  ? item.themes
                  : []
            )

          )]
          .filter(Boolean)
          .sort()
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error: "Erreur catégories"
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
        await filtered({
          q
        });


      res.json({
        items,
        count: items.length
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error: "Erreur recherche"
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

        return res.status(404).json({
          error: "Fiche introuvable"
        });
      }


      res.json(item);

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error: "Erreur fiche"
      });
    }
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
      service: "fs15-clone"
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
      `FS15 Clone lancé sur le port ${PORT}`
    );

  }
);
