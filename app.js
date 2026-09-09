const express = require("express");
const { getCatalogue } = require("./server.js");

const app = express();
const PORT = Number(process.env.PORT || 7860);

app.get("/", (_req, res) => {
  res.json({
    name: "FS15 Clone",
    status: "ok"
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/catalog", async (_req, res) => {
  try {
    const catalogue = await getCatalogue();
    res.json(catalogue);
  } catch (error) {
    console.error("Erreur catalogue FS23:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FS15 Clone démarré sur le port ${PORT}`);
});
