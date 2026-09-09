const express = require("express");
const path = require("path");

const {
  getCatalogue
} = require("./src/provider");


const app = express();

const PORT =
  Number(
    process.env.PORT || 7860
  );


app.use(
  express.json()
);


app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);


/* =====================================================
   FILTRAGE
   ===================================================== */

async function filtered(query) {

  let items =
    await getCatalogue();


  const {
    type,
    genre,
    language,
    q,
    sort
  } = query;


  if (type) {

    items =
      items.filter(
        item =>
          item.type === type
      );

  }


  if (genre) {

    items =
      items.filter(
        item =>
          item.genres.some(
            g =>
              g.toLowerCase() ===
              genre.toLowerCase()
          )
      );

  }


  if (language) {

    const wanted =
      language.toLowerCase();

    items =
      items.filter(
        item =>
          String(
            item.language
          )
            .toLowerCase()
            .includes(wanted)
      );

  }


  if (q) {

    const search =
      q.toLowerCase();

    items =
      items.filter(
        item =>
          item.title
            .toLowerCase()
            .includes(search) ||

          item.synopsis
            .toLowerCase()
            .includes(search)
      );

  }


  switch (sort) {

    case "rating":

      items.sort(
        (a, b) =>
          b.rating -
          a.rating
      );

      break;


    case "comments":

      items.sort(
        (a, b) =>
          b.comments -
          a.comments
      );

      break;


    case "views":

      items.sort(
        (a, b) =>
          b.views -
          a.views
      );

      break;


    default:

      items.sort(
        (a, b) =>
          new Date(
            b.addedAt
          ) -
          new Date(
            a.addedAt
          )
      );

  }


  return items;

}


/* =====================================================
   CATALOGUE
   ===================================================== */

app.get(
  "/api/catalog",
  async (req, res) => {

    try {

      const items =
        await filtered(
          req.query
        );

      res.json({
        items,
        count:
          items.length
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          "Erreur catalogue"
      });

    }

  }
);


/* =====================================================
   CATEGORIES
   ===================================================== */

app.get(
  "/api/categories",
  async (_req, res) => {

    try {

      const items =
        await getCatalogue();


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

        genres: [
          ...new Set(
            items.flatMap(
              item =>
                item.genres
            )
          )
        ].sort(),

        countries: [
          ...new Set(
            items.flatMap(
              item =>
                item.country
            )
          )
        ].sort(),

        themes: [
          ...new Set(
            items.flatMap(
              item =>
                item.themes
            )
          )
        ].sort()

      });

    } catch (error) {

      res.status(500).json({
        error:
          "Erreur catégories"
      });

    }

  }
);


/* =====================================================
   FICHE
   ===================================================== */

app.get(
  "/api/item/:id",
  async (req, res) => {

    try {

      const items =
        await getCatalogue();


      const item =
        items.find(
          entry =>
            String(
              entry.id
            ) ===
            String(
              req.params.id
            )
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

    } catch (error) {

      res.status(500).json({
        error:
          "Erreur fiche"
      });

    }

  }
);


/* =====================================================
   SANTE
   ===================================================== */

app.get(
  "/api/health",
  (_req, res) => {

    res.json({
      status: "ok",
      service:
        "fs15-clone"
    });

  }
);


/* =====================================================
   START
   ===================================================== */

app.listen(
  PORT,
  () => {

    console.log(
      `FS15 Clone lancé sur le port ${PORT}`
    );

  }
);
