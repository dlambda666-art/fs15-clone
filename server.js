const express = require("express");
const path = require("path");

const {
  getCatalogue,
  refreshCache,
  PAGE_SIZE,
  PAGES
} = require("./src/provider");


/* =========================================================
   CONFIGURATION
   ========================================================= */

const app = express();

const PORT =
  Number(process.env.PORT || 7860);


/* =========================================================
   MIDDLEWARE
   ========================================================= */

app.use(
  express.json()
);


/* =========================================================
   PUBLIC
   ========================================================= */

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);


/* =========================================================
   OUTILS
   ========================================================= */

function number(value, fallback) {

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;

}


function getPage(req) {

  /*
   * Accepte :
   *
   * ?page=2
   *
   * ?skip=18
   *
   * /api/page/2
   *
   * La valeur page est prioritaire.
   */

  if (
    req.params &&
    req.params.page !== undefined
  ) {

    const page =
      number(
        req.params.page,
        1
      );

    return Math.max(
      1,
      Math.floor(page)
    );

  }


  if (
    req.query &&
    req.query.page !== undefined
  ) {

    const page =
      number(
        req.query.page,
        1
      );

    return Math.max(
      1,
      Math.floor(page)
    );

  }


  if (
    req.query &&
    req.query.skip !== undefined
  ) {

    const skip =
      number(
        req.query.skip,
        0
      );

    return (
      Math.floor(
        Math.max(0, skip) /
        PAGE_SIZE
      ) + 1
    );

  }


  return 1;

}


/* =========================================================
   CATALOGUE
   ========================================================= */

async function catalogueResponse(
  req,
  res
) {

  try {

    const page =
      getPage(req);


    const type =
      req.query.type ||
      undefined;


    const genre =
      req.query.genre ||
      undefined;


    /*
     * IMPORTANT
     *
     * On transmet explicitement PAGE.
     *
     * Le provider ne doit donc jamais
     * retomber sur la page 1 lorsque
     * /api/catalog?page=2 est appelé.
     */

    const items =
      await getCatalogue({

        type,

        genre,

        page

      });


    /*
     * Informations de pagination
     */

    const response = {

      success: true,

      page,

      pageSize:
        PAGE_SIZE,

      maxPages:
        PAGES,

      hasNextPage:
        page < PAGES,

      hasPreviousPage:
        page > 1,

      count:
        items.length,

      items

    };


    console.log(
      `API catalogue: page=${page} type=${type || "all"} genre=${genre || "all"} -> ${items.length} éléments`
    );


    res.json(
      response
    );

  }
  catch (error) {

    console.error(
      "API catalogue:",
      error
    );


    res.status(500).json({

      success: false,

      error:
        error.message ||
        "Erreur catalogue"

    });

  }

}


/* =========================================================
   API CATALOGUE
   ========================================================= */

/*
 * /api/catalog
 *
 * Exemple :
 *
 * /api/catalog?page=1
 * /api/catalog?page=2
 * /api/catalog?page=3
 */

app.get(
  "/api/catalog",
  catalogueResponse
);


/*
 * /api/catalog?page=2
 *
 * est également compatible avec
 * les appels utilisant skip.
 */


/* =========================================================
   API PAGINATION DIRECTE
   ========================================================= */

/*
 * /api/page/1
 * /api/page/2
 * /api/page/3
 *
 * etc.
 */

app.get(
  "/api/page/:page",
  catalogueResponse
);


/* =========================================================
   API CATEGORIES
   ========================================================= */

app.get(
  "/api/categories",
  async (req, res) => {

    try {

      const {
        KNOWN_GENRES
      } =
        require("./src/provider");


      res.json({

        success: true,

        categories:
          KNOWN_GENRES

      });

    }
    catch (error) {

      console.error(
        "API categories:",
        error
      );


      res.status(500).json({

        success: false,

        error:
          error.message ||
          "Erreur catégories"

      });

    }

  }
);


/* =========================================================
   API SEARCH
   ========================================================= */

app.get(
  "/api/search",
  async (req, res) => {

    try {

      const query =
        String(
          req.query.q ||
          ""
        )
        .trim()
        .toLowerCase();


      if (!query) {

        return res.json({

          success: true,

          query: "",

          count: 0,

          items: []

        });

      }


      /*
       * Pour la recherche on récupère
       * le catalogue complet.
       */

      const all =
        await getCatalogue({

          page: 1

        });


      /*
       * Le provider renvoie une page.
       *
       * Pour éviter de limiter la recherche
       * à la première page, on parcourt les
       * pages disponibles.
       */

      const pages = [];


      for (
        let page = 1;
        page <= PAGES;
        page++
      ) {

        const items =
          await getCatalogue({

            page

          });


        pages.push(
          ...items
        );


        if (
          items.length <
          PAGE_SIZE
        ) {

          break;

        }

      }


      const unique =
        new Map();


      for (
        const item of pages
      ) {

        if (
          !item ||
          !item.id
        ) {
          continue;
        }


        if (
          unique.has(item.id)
        ) {
          continue;
        }


        const title =
          String(
            item.title ||
            ""
          )
          .toLowerCase();


        if (
          title.includes(query)
        ) {

          unique.set(
            item.id,
            item
          );

        }

      }


      const results =
        [...unique.values()];


      res.json({

        success: true,

        query,

        count:
          results.length,

        items:
          results

      });

    }
    catch (error) {

      console.error(
        "API search:",
        error
      );


      res.status(500).json({

        success: false,

        error:
          error.message ||
          "Erreur recherche"

      });

    }

  }
);


/* =========================================================
   API ITEM
   ========================================================= */

app.get(
  "/api/item/:id",
  async (req, res) => {

    try {

      const wantedId =
        String(
          req.params.id ||
          ""
        );


      let found =
        null;


      /*
       * On parcourt les pages du catalogue.
       */

      for (
        let page = 1;
        page <= PAGES;
        page++
      ) {

        const items =
          await getCatalogue({

            page

          });


        found =
          items.find(
            item =>
              String(
                item.id
              ) === wantedId
          );


        if (found) {
          break;
        }


        if (
          items.length <
          PAGE_SIZE
        ) {
          break;
        }

      }


      if (!found) {

        return res
          .status(404)
          .json({

            success: false,

            error:
              "Élément introuvable"

          });

      }


      res.json({

        success: true,

        item:
          found

      });

    }
    catch (error) {

      console.error(
        "API item:",
        error
      );


      res.status(500).json({

        success: false,

        error:
          error.message ||
          "Erreur élément"

      });

    }

  }
);


/* =========================================================
   REFRESH
   ========================================================= */

app.get(
  "/api/refresh",
  async (req, res) => {

    try {

      const catalogue =
        await refreshCache();


      res.json({

        success: true,

        count:
          catalogue.length,

        message:
          "Catalogue actualisé"

      });

    }
    catch (error) {

      console.error(
        "API refresh:",
        error
      );


      res.status(500).json({

        success: false,

        error:
          error.message ||
          "Erreur actualisation"

      });

    }

  }
);


/* =========================================================
   HEALTH
   ========================================================= */

app.get(
  "/api/health",
  (req, res) => {

    res.json({

      status:
        "ok",

      service:
        "fs15-clone",

      pageSize:
        PAGE_SIZE,

      maxPages:
        PAGES,

      timestamp:
        new Date().toISOString()

    });

  }
);


/* =========================================================
   ROOT
   ========================================================= */

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );

  }
);


/* =========================================================
   404 API
   ========================================================= */

app.use(
  "/api",
  (req, res) => {

    res.status(404).json({

      success: false,

      error:
        "API endpoint introuvable"

    });

  }
);


/* =========================================================
   ERREUR GLOBALE
   ========================================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      "Erreur serveur:",
      error
    );


    if (
      res.headersSent
    ) {

      return next(error);

    }


    res.status(500).json({

      success: false,

      error:
        error.message ||
        "Erreur interne"

    });

  }
);


/* =========================================================
   START
   ========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "=========================================="
    );

    console.log(
      "FS15 CLONE"
    );

    console.log(
      `Port : ${PORT}`
    );

    console.log(
      `Pages : ${PAGES}`
    );

    console.log(
      `Page size : ${PAGE_SIZE}`
    );

    console.log(
      "=========================================="
    );

  }
);
