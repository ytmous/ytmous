const m3u8stream = require("m3u8stream");
const ytdl = require("ytdl-core");
const ytsr = require("ytsr");
const ytpl = require("ytpl");
const miniget = require("miniget");
const express = require("express");
const ejs = require("ejs");
const app = express();

//        CONFIGURATION        //

// Result Limit
// By default, ytsr & ytpl result limit is 100.
// For ytmous, The search result default is 50.
// Change it as many as you want. 0 for all result without limit.
// The smaller, The faster.
const limit = process.env.LIMIT || 50;

// User Agent
// This is where we fake our request to youtube.
const user_agent =
  process.env.USER_AGENT || "googlebot";

//     END OF CONFIGURATION    //

let infos = {};

function getSize(url, opt) {
  return new Promise((resolv, reject) => {
    let req = miniget(url, opt)
      .on("response", res => {
         req.destroy();
         resolv(res.headers["content-length"]);
       })
      .on("error", reject);
  });
}

app.set("views", __dirname + "/views");
app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));

// Home page
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

// Search page
app.get("/s", async (req, res) => {
  let query = req.query.q;
  let page = Number(req.query.p || 1);
  if (!query) return res.redirect("/");
  try {
    res.render("search.ejs", {
      res: await ytsr(query, { limit, pages: page }),
      query: query,
      page,
    });
  } catch (error) {
    console.error(error);
    try {
      res.status(500).render("error.ejs", {
        title: "ytsr Error",
        content: error,
      });
    } catch (error) {
      console.error(error);
    }
  }
});

// Watch Page
app.get("/w/:id", async (req, res) => {
  if (!ytdl.validateID(req.params.id))
    return res.status(400).render("error.ejs", {
      title: "Invalid video ID",
      content: "Your requested video is invalid. Check your URL and try again.",
    });
  try {
    let info = await ytdl.getInfo(req.params.id);

    if (!info.formats.length) {
      return res.status(500).render("error.ejs", {
        title: "Region Lock",
        content: "Sorry. This video is not available for this server country.",
      });
    }

    infos[req.params.id] = info;
    res.render("watch.ejs", {
      id: req.params.id,
      info, q: req.query
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("error.ejs", {
      title: "ytdl Error",
      content: error,
    });
  }
});

// Embed Page
// From now on, This endpoint will just redirect to stream page
app.get("/e/:id", async (req, res) => {
  if (!req.params.id) return res.redirect("/");
  res.redirect("/s/" + req.params.id);
});

// Playlist page
app.get("/p/:id", async (req, res) => {
  if (!ytpl.validateID(req.params.id))
    return res.status(400).render("error.ejs", {
      title: "Invalid playlist ID",
      content:
        "Your requested playlist is invalid. Check your URL and try again.",
    });
  let page = Number(req.query.p || 1);
  try {
    res.render("playlist.ejs", {
      playlist: await ytpl(req.params.id, { limit, pages: page }),
      page,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("error.ejs", {
      title: "ytpl Error",
      content: error,
    });
  }
});

// Channel page
app.get("/c/:id", async (req, res) => {
  if (!ytpl.validateID(req.params.id))
    return res.status(400).render("error.ejs", {
      title: "Invalid channel ID",
      content:
        "Your requested channel is invalid. Check your URL and try again.",
    });
  let page = Number(req.query.p || 1);
  try {
    res.render("channel.ejs", {
      channel: await ytpl(req.params.id, { limit, pages: page }),
      page,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("error.ejs", {
      title: "ytpl Error",
      content: error,
    });
  }
});

// Proxy Area
// This is where we make everything became anonymous

// Video Streaming
app.get("/s/:id", async (req, res) => {
  if (!ytdl.validateID(req.params.id)) return res.redirect("/");
  try {
    let info = infos[req.params.id];
    if (!info) {
      info = await ytdl.getInfo(req.params.id);
      infos[req.params.id] = info;
    }

    info.formats = info.formats.filter(
      (format) => req.query.itag ? req.query.itag == format.itag : (format.hasVideo && format.hasAudio)
    );

    if (!info.formats.length) {
      return res
        .status(500)
        .send("This stream is unavailable.");
    }


    let headers = {
      "user-agent": user_agent,
    };

    // If user is seeking a video
    if (req.headers.range) {
      headers.range = req.headers.range;
    } else {
      headers.range = "bytes=0-"
    }

    if (info.videoDetails.isLiveContent && info.formats[0].type == "video/ts") {
      return m3u8stream(info.formats[0].url)
        .on("error", (err) => {
          res.status(500).end(err.toString());
          console.error(err);
        })
        .pipe(res);
    }

      let h = headers.range ? headers.range.split(",")[0].split("-") : ["bytes=0"];

      let headersSetted = false;
      if (!info.streamSize) info.streamSize = await getSize(info.formats[0].url, { headers: { "user-agent": headers["user-agent"] }});

      let streamSize = info.streamSize - (h[0].slice(6));
      let isSeeking = false;

      if (streamSize != info.streamSize) isSeeking = true;
      let sentSize = 0;
      let lastConnErr = 0;

      res.status(isSeeking ? 206 : 200).setHeader("content-length", streamSize);
      function getChunk(beginRange) {
        let endRange = Number(beginRange) + Number(process.env.DLCHUNKSIZE || (1024 * 1024));
        if (endRange > streamSize || endRange > info.streamSize) endRange = info.streamSize;
        headers.range = `bytes=${beginRange}-${endRange}`
        let s = miniget(info.formats[0].url, { headers })
          .on('response', r => {
            if (headersSetted) return;

            if (isSeeking && r.headers["content-range"]) res.setHeader("content-range", r.headers["content-range"]);
            ["accept-ranges", "content-type", "cache-control"].forEach(hed => {
              let head = r.headers[hed];
              if (!head) res.setHeader(hed, head)
              headersSetted = true;
            });

            lastConnErr = 0;
          })

          .on('error', (err) => {
            console.error(err);
            if (req.connection.destroyed || req.connection.ended || req.connection.closed) return;
            if (lastConnErr > 3 || sentSize >= streamSize) return res.end();
            getChunk(endRange + 1);
            lastConnErr++;
          })

          .on('data', c => {
            if (req.connection.destroyed || req.connection.ended || req.connection.closed) return s.destroy();
            res.write(c);
            sentSize += c.length;
          })

          .on('end', _ => {
            if (req.connection.destroyed || req.connection.ended || req.connection.closed) return;
            if (sentSize >= streamSize) {
              return res.end();
            }

            getChunk(endRange + 1);
          })
      }

      getChunk(h[0].slice(6));

      res.on('error', err => {
        console.error(err);
      });
  } catch (error) {
    res.status(500).end(error.toString());
  }
});

// Proxy to i.ytimg.com, Where Video Thumbnail is stored here.
app.get("/vi*", (req, res) => {
  let stream = miniget(`https://i.ytimg.com/${req.url.slice(1)}`, {
    headers: {
      "user-agent": user_agent,
    },
  });
  stream.on("error", (err) => {
    console.log(err);
    res.status(500).end(err.toString());
  });

  stream.on("response", (origin) => {
    res.setHeader("content-type", origin.headers["content-type"]);
    res.setHeader("content-length", origin.headers["content-length"]);
    stream.pipe(res);
  });
});

// Proxy to yt3.ggpht.com, Where User avatar is being stored on that host.
app.get(["/yt3/*", "/ytc/*"], (req, res) => {
  if (req.url.startsWith("/yt3/")) req.url = req.url.slice(4);
  let stream = miniget(`https://yt3.ggpht.com/${req.url.slice(1)}`, {
    headers: {
      "user-agent": user_agent,
    },
  });
  stream.on("error", (err) => {
    console.log(err);
    res.status(500).end(err.toString());
  });

  stream.on("response", (origin) => {
    res.setHeader("content-type", origin.headers["content-type"]);
    res.setHeader("content-length", origin.headers["content-length"]);
    stream.pipe(res);
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).render("error.ejs", {
    title: "404 Not found",
    content: "A resource that you tried to get is not found or deleted.",
  });
});

app.on('error', console.error);

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Your app is now listening on port", listener.address().port);
});

// Handle any unhandled promise rejection.
process.on("unhandledRejection", console.error);
