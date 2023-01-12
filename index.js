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

function getCaptions(id, sub) {
  try {
    let captions = infos[id].player_response.captions.playerCaptionsTracklistRenderer.captionTracks
    if (!captions || !captions.length) return [];
    if (!sub) return captions;

    return captions.filter(c => c.vssId === sub);
  } catch {
    return [];
  }
}

app.set("views", [__dirname + "/local/views", __dirname + "/views"]);
app.set("view engine", "ejs");

app.use(express.static(__dirname + "/local/public"));
app.use(express.static(__dirname + "/public"));

// Trigger to limit caching
app.use(["/w/*", "/s/*"], (req, res, next) => {
  let IDs = Object.keys(infos);
  if (IDs.length > (process.env.VIDINFO_LIMIT || 20)) {
    delete infos[IDs.shift()];
  }

  next();
});

// Home page
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

// Search page
app.get("/s", async (req, res) => {
  let query = req.query.q;
  let page = parseInt(req.query.p || 1);
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
      info, q: req.query,
      captions: getCaptions(req.params.id).map(i => {
        return {
          name: i.name.simpleText,
          languangeCode: i.languangeCode,
          vssId: i.vssId
        }
      })
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
  let page = parseInt(req.query.p || 1);
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
  let page = parseInt(req.query.p || 1);
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

// API Endpoints
if (!process.env.NO_API_ENDPOINTS) {
  app.get("/api/", (req, res) => {
    res.json([
      "/api/search", "/api/getPlaylistInfo", "/api/getVideoInfo"
    ]);
  });

  app.get("/api/search", async (req, res) => {
    try {
      let result = await ytsr(req.query.q, { limit, pages: (req.query.page || 1) });
      delete result.continuation;

      let json = JSON.stringify(result).replace(RegExp("https://i.ytimg.com/", "g"), "/");
      json = json.replace(RegExp("https://yt3.ggpht.com", "g"), "/yt3");

      // Just make it simple. As long it works.
      res.json(JSON.parse(json));
    } catch (e) {
      res.status(500).end(JSON.stringify({
        error: {
          description: e.toString(),
          code: 2
        }
      }));
    }
  });

  app.get("/api/getPlaylistInfo/:id", async (req, res) => {
    if (!ytpl.validateID(req.params.id)) return res.status(400).end(JSON.stringify({ error: { description: "Invalid ID", code: 1 } }));
    try {
      let result = await ytpl(req.params.id, { limit, pages: (req.query.page || 1) })
      delete result.continuation;

      let json = JSON.stringify(result).replace(RegExp("https://i.ytimg.com/", "g"), "/");
      json = json.replace(RegExp("https://yt3.ggpht.com", "g"), "/yt3");

      // Just make it simple. As long it works.
      res.json(JSON.parse(json));
    } catch (e) {
      res.status(500).end(JSON.stringify({
        error: {
          description: e.toString(),
          code: 2
        }
      }));
    }
  });

  app.get("/api/getVideoInfo/:id", async (req, res) => {
    if (!ytdl.validateID(req.params.id)) return res.status(400).end(JSON.stringify({ error: { description: "Invalid ID", code: 1 } }));
    try {
      let info = await ytdl.getInfo(req.params.id);
      infos[req.params.id] = info;

      let json = JSON.stringify({
        ...info.videoDetails,
        related_videos: info.related_videos,
        streams: info.formats.map(i => {
          i.url = "/s/" + req.params.id + "?itag=" + i.itag;
          return i;
        }),
        captions: getCaptions(req.params.id).map(i => {
          return {
            name: i.name.simpleText,
            languangeCode: i.languangeCode,
            vssId: i.vssId,
            url: "/cc/" + req.params.id + "?vssId=" + i.vssId
          }
        })
      });

      json = json.replace(RegExp("https://i.ytimg.com/", "g"), "/");
      json = json.replace(RegExp("https://yt3.ggpht.com", "g"), "/yt3");

      // Just make it simple. As long it works.
      res.json(JSON.parse(json));
    } catch (e) {
      return res.status(500).end(JSON.stringify({
        error: {
          description: e.toString(),
          code: 2
        }
      }));
    }
  });
}

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

    let formats = info.formats.filter(
      (format) => req.query.itag ? req.query.itag == format.itag : (format.hasVideo && format.hasAudio)
    );

    if (!formats.length) {
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

    if (formats[0].isHLS || formats[0].isDashMPD) {
      return m3u8stream(formats[0].url, {
        chunkReadahead: +info.live_chunk_readahead,
        requestOptions: { headers: { "user-agent": headers["user-agent"] } },
        parser: formats[0].isDashMPD ? 'dash-mpd' : 'm3u8',
        id: formats[0].itag
      })
        .on("error", (err) => {
          res.status(500).end(err.toString());
          console.error(err);
        })
        .pipe(res);
    }

      let h = headers.range ? headers.range.split(",")[0].split("-") : ["bytes=0"];

      let headersSetted = false;
      if (!info.streamSize) info.streamSize = {};
      if (!info.streamSize[formats[0].itag]) {
        info.streamSize[formats[0].itag] = await getSize(formats[0].url, { headers: { "user-agent": headers["user-agent"] }});
      }

      let streamSize = info.streamSize[formats[0].itag] - (h[0].slice(6));
      let isSeeking = false;

      if (streamSize != info.streamSize[formats[0].itag]) isSeeking = true;
      let sentSize = 0;
      let lastConnErr = 0;

      res.status(isSeeking ? 206 : 200).setHeader("content-length", streamSize);

      if (!streamSize) return res.end();

      function getChunk(beginRange) {
        beginRange = parseInt(beginRange);

        let endRange = beginRange + parseInt(process.env.DLCHUNKSIZE || (1024 * 1024));
        if ((endRange > streamSize) || (endRange > info.streamSize[formats[0].itag])) endRange = info.streamSize[formats[0].itag];

        headers.range = `bytes=${beginRange}-${endRange}`

        let s = miniget(formats[0].url, { headers })
          .on('response', r => {
            if (headersSetted) return;

            if (isSeeking && r.headers["content-range"]) res.setHeader("content-range", r.headers["content-range"]);
            ["accept-ranges", "content-type", "cache-control"].forEach(hed => {
              let head = r.headers[hed];
              if (head) res.setHeader(hed, head)
              headersSetted = true;
            });

            lastConnErr = 0;
          })

          .on('error', (err) => {
            console.error(err);
            if (req.connection.destroyed || req.connection.ended || req.connection.closed) return;
            if (lastConnErr > 3 || sentSize >= streamSize || sentSize >= info.streamSize[formats[0].itag]) return res.end();
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

// Proxy to subtitles
app.get("/cc/:id", async (req, res) => {
  if (!ytdl.validateID(req.params.id)) return res.status(400).end(JSON.stringify({ error: { description: "Invalid ID", code: 1 } }));

  try {
    if (!infos[req.params.id]) {
      let info = await ytdl.getInfo(req.params.id);
      infos[req.params.id] = info;
    }

    if (!req.query.vssId) return res.json(
      getCaptions(req.params.id).map(i => {
        return {
          name: i.name.simpleText,
          languangeCode: i.languangeCode,
          vssId: i.vssId,
          url: "/cc/" + req.params.id + "?vssId=" + i.vssId
        }
      })
    )

    let caption = getCaptions(req.params.id, req.query.vssId)[0];
    if (!caption) return res.status(500).end(JSON.stringify({
      error: {
        description: "No subtitle found.",
        code: 3
      }
    }));

    miniget(caption.baseUrl + (req.query.fmt ? ("&fmt=" + req.query.fmt) : ""), {
      headers: {
        "user-agent": user_agent
      }
    }).on("error", err => {
      console.log(err);
      res.status(500).end(err.toString());
    }).pipe(res);
  } catch (err) {
    return res.status(500).end(JSON.stringify({
      error: {
        description: e.toString(),
        code: 2
      }
    }));
  }
});

// Proxy to i.ytimg.com, Where Video Thumbnail is stored here.
app.get(["/vi*", "/sb/*"], (req, res) => {
  let stream = miniget("https://i.ytimg.com" + req.url, {
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
  let stream = miniget("https://yt3.ggpht.com" + req.url, {
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
