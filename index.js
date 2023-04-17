const express = require("express");
const compression = require("compression");
const YouTubeJS = require("youtubei.js");

const proxyHandler = require("./etc/proxy");
const util = require("./etc/util");

let app = express();
let client;

app.use(compression());

// https://github.com/ytmous/ytmous/pull/25
app.use(function (req, res, next) {
  res.setHeader('X-Frame-Options', "SAMEORIGIN");
  res.setHeader('X-Content-Type-Options', "nosniff");
  next();
});

app.use(express.static(__dirname + "/local/public"));
app.use(express.static(__dirname + "/public"));

app.set("views", [__dirname + "/local/views", __dirname + "/views"]);
app.set("view engine", "ejs");

// Search page
app.get("/s", async (req, res) => {
  let query = req.query.q;
  let page = parseInt(req.query.p || 1);
  if (!query) return res.redirect("/");
  try {
    res.render("search.ejs", {
      res: await client.search(query),
      query: query,
      page,
    });
  } catch (error) {
    util.sendError(res, error);
  }
});

// Watch Page
app.get("/w/:id", async (req, res) => {
  if (!util.validateID(req.params.id)) return util.sendInvalidIDError(res);
  try {
    let info = await client.getInfo(req.params.id);
    res.render("watch.ejs", {
      id: req.params.id, info,
      comments: await util.getComments(client, req.params.id),
      captions: util.getCaptions(info)
    });
  } catch (error) {
    util.sendError(res, error);
  }
});

// Playlist page
app.get("/p/:id", async (req, res) => {
  res.status(500).render("error.ejs", {
    title: "Sorry. Not implemented yet",
    content: "Viewing playlist is not available in ytmous nightly yet."
  });
});

// Channel page
app.get("/c/:id", async (req, res) => {
  res.status(500).render("error.ejs", {
    title: "Sorry. Not implemented yet",
    content: "Viewing channel is not available in ytmous nightly yet."
  });
});

// Comments
app.get("/cm/:id", async (req, res) => {
  if (!util.validateID(req.params.id)) return util.sendInvalidIDError(res);
  try {
    res.render("comments.ejs", {
      id: req.params.id,
      comments: await client.getComments(req.params.id)
    });
  } catch (error) {
    util.sendError(res, error, "Failed to fetch comments");
  }
})

proxyHandler(app);

// 404 Handler
app.use((req, res) => {
  res.status(404).render("error.ejs", {
    title: "404 Not found",
    content: "A resource that you tried to get is not available.",
  });
});

app.on("error", console.error);

async function initInnerTube() {
  console.log("--- Initializing InnerTube Client...");
  try {
    client = await YouTubeJS.Innertube.create({ location: process.env.GEOLOCATION || "US" });
    console.log("--- InnerTube client ready.");

    proxyHandler.setClient(client);

    const listener = app.listen(process.env.PORT || 3000, () => {
      console.log("-- ytmous is now listening on port", listener.address().port);
    });
  } catch (e) {
    console.error("--- Failed to initialize InnerTube.");
    console.error(e);

    console.log("--- Trying again in 10 seconds....");
    setTimeout(initInnerTube, 10000);
  };
};

// Handle any unhandled promise rejection.
process.on("unhandledRejection", console.error);

initInnerTube();
