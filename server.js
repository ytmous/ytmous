const compression = require("compression");
const m3u8stream = require("m3u8stream");
const ytdl = require("ytdl-core");
const ytsr = require("ytsr");
const ytpl = require("ytpl");
const ytcs = require("@freetube/yt-comment-scraper");
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
const urlreg = /(https?:\/\/[^\s]+)/g;

// User Agent
// This is where we fake our request to youtube.
const user_agent = process.env.USER_AGENT || "googlebot";

//     END OF CONFIGURATION    //

let infos = {
  timeouts: {},
  HLSOrigin: {},
};

function clearListener(s, events = ["response", "error", "data", "end"]) {
  events.forEach(i => s.removeAllListeners(i));
}

function getSize(url, opt) {
  return new Promise((resolv, reject) => {
    let req = miniget(url, opt)
      .on("response", (res) => {
        req.destroy();
        resolv(res.headers["content-length"]);
      })
      .on("error", reject);
  });
}

function getChunk(beginRange, req, res, headers, info, formats, streamSize, isSeeking = false, h, headersSetted = false, sentSize = 0, lastConnErr = 0) {
  beginRange = parseInt(beginRange);

  let endRange = beginRange + parseInt(process.env.DLCHUNKSIZE || 1024 * 1024);
  if (endRange > parseInt(h[1]))
    endRange = parseInt(h[1]);
  if (endRange >= info.streamSize[formats[0].itag])
    endRange = "";

  headers.Range = `bytes=${beginRange}-${endRange}`;

  const s = miniget(formats[0].url, { headers })
    .on("response", (r) => {
      if (headersSetted) return;

      ["Accept-Ranges", "Content-Type", "Cache-Control"].forEach((hed) => {
        let head = r.headers[hed.toLowerCase()];
        if (head) res.setHeader(hed, head);
        headersSetted = true;
      });

      lastConnErr = 0;
    })

    .on("error", (err) => {
      clearListener(s);
      console.error(err);
      if (
        req.connection.destroyed ||
        req.connection.ended ||
        req.connection.closed
      )
        return;
      if (
        lastConnErr > 3 ||
        sentSize >= streamSize ||
        sentSize >= info.streamSize[formats[0].itag] ||
        beginRange >= endRange
      )
        return res.end();
      getChunk(beginRange + sentSize + 1, req, res, headers, info, formats, streamSize, isSeeking, h, headersSetted, sentSize, lastConnErr);
      lastConnErr++;
    })

    .on("data", (c) => {
      if (
        req.connection.destroyed ||
        req.connection.ended ||
        req.connection.closed
      ) {
        clearListener(s);
        return s.destroy();
      }
      res.write(c);
      res.flush();
      sentSize += c.length;
    })
    .on("end", (_) => {
      clearListener(s);
      if (
        req.connection.destroyed ||
        req.connection.ended ||
        req.connection.closed
      )
        return;
      if (sentSize >= streamSize) {
        return res.end();
      }

      getChunk(endRange + 1, req, res, headers, info, formats, streamSize, isSeeking, h, headersSetted, sentSize, lastConnErr);
    });
}

function getCaptions(id, sub) {
  try {
    let captions =
      infos[id].player_response.captions.playerCaptionsTracklistRenderer
        .captionTracks;
    if (!captions || !captions.length) return [];
    if (!sub) return captions;

    return captions.filter((c) => c.vssId === sub);
  } catch {
    return [];
  }
}

async function getComments(opt) {
  try {
    return await ytcs.getComments(opt);
  } catch (err) {
    console.error(err);
    return null;
  }
}

async function getCommentReplies(opt) {
  try {
    return await ytcs.getCommentReplies(opt);
  } catch (err) {
    console.error(err);
    return null;
  }
}

async function putInfoToCache(info) {
  if (process.env.NO_CACHE) return;

  let id = info.videoDetails.videoId;
  let timeout = info.player_response.streamingData.expiresInSeconds;

  infos[id] = JSON.parse(JSON.stringify(info));

  if (infos.timeouts[id]) clearTimeout(infos.timeouts[id]);
  infos.timeouts[id] = setTimeout(() => {
    delete infos[id];
  }, parseInt(timeout));

  infos[id].comments = await getComments({ videoId: id });

  return;
}

app.use(compression());

// Add some security header response
app.use(function (req, res, next) {
  res.setHeader('X-Frame-Options', "SAMEORIGIN");
  res.setHeader('X-Content-Type-Options', "nosniff");
  next();
});

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

    await putInfoToCache(info);

    res.render("watch.ejs", {
      id: req.params.id,
      info,
      q: req.query,
      captions: getCaptions(req.params.id).map((i) => {
        return {
          name: i.name.simpleText,
          languangeCode: i.languangeCode,
          vssId: i.vssId,
        };
      }),

      comments: infos[req.params.id].comments,
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

app.get("/cm/:id", async (req, res) => {
  if (!ytdl.validateID(req.params.id))
    return res.status(400).render("error.ejs", {
      title: "Invalid video ID",
      content:
        "Your requested video comment is invalid. Check your URL and try again.",
    });

  try {
    let opt = {
      videoId: req.params.id,
    };

    if (req.query.continuation) opt.continuation = req.query.continuation;

    let comments;

    if (!req.query.replyToken) {
      comments = await getComments(opt);
    } else {
      opt.replyToken = req.query.replyToken;
      comments = await getCommentReplies(opt);
    }

    comments.comments = comments.comments.map((ch) => {
      ch.authorThumb.map((t) => {
        t.url = "/yt3" + new URL(t.url).pathname;
        return t;
      });

      return ch;
    });

    res.render("comments.ejs", {
      id: req.params.id,
      comments: comments,
      prev: req.params.prev,
      replyToken: req.query.replyToken,
      thisID: req.query.continuation || req.query.replyToken,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("error.ejs", {
      title: "FreeTube YouTube comment scraper Error",
      content: error,
    });
  }
});

// API Endpoints
if (!process.env.NO_API_ENDPOINTS) {
  app.get("/api/", (req, res) => {
    res.json(["/api/search", "/api/getPlaylistInfo", "/api/getVideoInfo"]);
  });

  app.get("/api/search", async (req, res) => {
    try {
      let result = await ytsr(req.query.q, {
        limit,
        pages: req.query.page || 1,
      });
      delete result.continuation;

      let json = JSON.stringify(result).replace(
        RegExp("https://i.ytimg.com/", "g"),
        "/"
      );
      json = json.replace(RegExp("https://yt3.ggpht.com", "g"), "/yt3");

      // Just make it simple. As long it works.
      res.json(JSON.parse(json));
    } catch (e) {
      res.status(500).end(
        JSON.stringify({
          error: {
            description: e.toString(),
            code: 2,
          },
        })
      );
    }
  });

  app.get("/api/getPlaylistInfo/:id", async (req, res) => {
    if (!ytpl.validateID(req.params.id))
      return res
        .status(400)
        .end(JSON.stringify({ error: { description: "Invalid ID", code: 1 } }));
    try {
      let result = await ytpl(req.params.id, {
        limit,
        pages: req.query.page || 1,
      });
      delete result.continuation;

      let json = JSON.stringify(result).replace(
        RegExp("https://i.ytimg.com/", "g"),
        "/"
      );
      json = json.replace(RegExp("https://yt3.ggpht.com", "g"), "/yt3");

      // Just make it simple. As long it works.
      res.json(JSON.parse(json));
    } catch (e) {
      res.status(500).end(
        JSON.stringify({
          error: {
            description: e.toString(),
            code: 2,
          },
        })
      );
    }
  });

  app.get("/api/getVideoInfo/:id", async (req, res) => {
    if (!ytdl.validateID(req.params.id))
      return res
        .status(400)
        .end(JSON.stringify({ error: { description: "Invalid ID", code: 1 } }));
    try {
      let info = await ytdl.getInfo(req.params.id);
      putInfoToCache(info);

      let json = JSON.stringify({
        ...info.videoDetails,
        related_videos: info.related_videos,
        streams: info.formats.map((i) => {
          i.url = "/s/" + req.params.id + "?itag=" + i.itag;
          return i;
        }),
        captions: getCaptions(req.params.id).map((i) => {
          return {
            name: i.name.simpleText,
            languangeCode: i.languangeCode,
            vssId: i.vssId,
            url: "/cc/" + req.params.id + "?vssId=" + i.vssId,
          };
        }),
      });

      json = json.replace(RegExp("https://i.ytimg.com/", "g"), "/");
      json = json.replace(RegExp("https://yt3.ggpht.com", "g"), "/yt3");

      // Just make it simple. As long it works.
      res.json(JSON.parse(json));
    } catch (e) {
      return res.status(500).end(
        JSON.stringify({
          error: {
            description: e.toString(),
            code: 2,
          },
        })
      );
    }
  });

  app.get("/api/getComments/:id", async (req, res) => {
    if (!ytdl.validateID(req.params.id))
      return res
        .status(400)
        .end(JSON.stringify({ error: { description: "Invalid ID", code: 1 } }));
    let comments = infos[req.params.id] && infos[req.params.id].comments;

    if (!comments || req.query.continuation || req.query.replyToken) {
      try {
        let opt = {
          videoId: req.params.id,
        };

        if (req.query.continuation) opt.continuation = req.query.continuation;

        if (!req.query.replyToken) {
          comments = await getComments(opt);
        } else {
          opt.replyToken = req.query.replyToken;
          comments = await getCommentReplies(opt);
        }

        comments.comments = comments.comments.map((ch) => {
          ch.authorThumb.map((t) => {
            t.url = "/yt3" + new URL(t.url).pathname;
            return t;
          });

          return ch;
        });

        res.json(comments);
      } catch (err) {
        return res.status(500).end(
          JSON.stringify({
            error: {
              description: err.toString(),
              code: 2,
            },
          })
        );
      }
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
      putInfoToCache(info);
    }

    let formats = info.formats.filter((format) =>
      req.query.itag
        ? req.query.itag == format.itag
        : format.hasVideo && format.hasAudio
    );

    if (!formats.length) {
      return res.status(500).send("This stream is unavailable.");
    }

    let headers = {
      "User-Agent": user_agent,
    };

    // If user is seeking a video
    if (req.headers.range) {
      headers.Range = req.headers.range;
    } else {
      headers.Range = "bytes=0-";
    }

    if (formats[0].isHLS) {
      let request = miniget(formats[0].url, {
        headers: {
          "User-Agent": headers["User-Agent"],
        },
      }).on("response", async (r) => {
        ["Content-Type", "Cache-Control"].forEach((hed) => {
          let head = r.headers[hed.toLowerCase()];
          if (head) res.setHeader(hed, head);
        });

        let body = await request.text();

        // Get the URLs
        let urls = body.match(urlreg);
        if (!urls)
          return res.status(500).end(
            JSON.stringify({
              error: {
                description: "No URL for m3u8 chunks",
                code: 2,
              },
            })
          );

        infos.HLSOrigin[req.params.id] = [];

        urls.forEach((url) => {
          // We just need the initial host, But not the Segment path
          let splitted = url.split("index.m3u8");

          if (!infos.HLSOrigin[req.params.id].includes(splitted[0]))
            infos.HLSOrigin[req.params.id].push(splitted[0]);

          body = body.replace(
            splitted[0],
            `/hs/${req.params.id}/${infos.HLSOrigin[req.params.id].length - 1}/`
          );
        });

        res.end(body);
      });

      return;
    }

    if (formats[0].isDashMPD) {
      return m3u8stream(formats[0].url, {
        chunkReadahead: +info.live_chunk_readahead,
        requestOptions: { headers: { "User-Agent": headers["User-Agent"] } },
        parser: formats[0].isDashMPD ? "dash-mpd" : "m3u8",
        id: formats[0].itag,
      })
        .on("error", (err) => {
          res.status(500).end(err.toString());
          console.error(err);
        })
        .pipe(res);
    }

    let h = headers.Range
      ? headers.Range.split(",")[0].split("-")
      : ["bytes=0"];

    if (!info.streamSize) info.streamSize = {};
    if (!info.streamSize[formats[0].itag]) {
      info.streamSize[formats[0].itag] = await getSize(formats[0].url, {
        headers: { "User-Agent": headers["User-Agent"] },
      });
    }

    let beginRange = h[0].startsWith("bytes=") ? h[0].slice(6) : h[0];

    let streamSize = h[1] ? (((parseInt(h[1])+1)-beginRange) || 1) : (info.streamSize[formats[0].itag] - beginRange);
    let isSeeking = req.headers.range ? true : false;

    if (streamSize != info.streamSize[formats[0].itag]) isSeeking = true;
    if (parseInt(h[1])) isSeeking = true;

    if (info.streamSize[formats[0].itag]) {
      if (!streamSize || parseInt(h[1]) >= info.streamSize[formats[0].itag])
        return res.status(416).end("416 Range Not Satisfiable");
      res
        .status(isSeeking ? 206 : 200)
        .setHeader("Content-Length", streamSize);

      if (isSeeking) res.setHeader("Content-Range", `bytes ${beginRange}-${h[1] || info.streamSize[formats[0].itag]-1}/${info.streamSize[formats[0].itag]}`);

      getChunk(beginRange, req, res, headers, info, formats, streamSize, isSeeking, h);
    } else {
      let s = miniget(formats[0].url, { headers })
        .on("error", (err) => {
          if (
            req.connection.destroyed ||
            req.connection.ended ||
            req.connection.closed
          )
            return;
          res.end();
        })
        .on("response", (r) => {
          res.status(r.statusCode);
          [
            "Accept-Ranges",
            "Content-Type",
            "Content-Range",
            "Content-Length",
            "Cache-Control",
          ].forEach((hed) => {
            let head = r.headers[hed.toLowerCase()];
            if (head) res.setHeader(hed, head);
          });

          s.pipe(res);
        });
    }

    res.on("error", (err) => {
      console.error(err);
    });
  } catch (error) {
    res.status(500).end(error.toString());
  }
});

// Proxy to subtitles
app.get("/cc/:id", async (req, res) => {
  if (!ytdl.validateID(req.params.id))
    return res
      .status(400)
      .end(JSON.stringify({ error: { description: "Invalid ID", code: 1 } }));

  try {
    if (!infos[req.params.id]) {
      let info = await ytdl.getInfo(req.params.id);
      putInfoToCache(info);
    }

    if (!req.query.vssId)
      return res.json(
        getCaptions(req.params.id).map((i) => {
          return {
            name: i.name.simpleText,
            languangeCode: i.languangeCode,
            vssId: i.vssId,
            url: "/cc/" + req.params.id + "?vssId=" + i.vssId,
          };
        })
      );

    let caption = getCaptions(req.params.id, req.query.vssId)[0];
    if (!caption)
      return res.status(500).end(
        JSON.stringify({
          error: {
            description: "No subtitle found.",
            code: 3,
          },
        })
      );

    miniget(caption.baseUrl + (req.query.fmt ? "&fmt=" + req.query.fmt : ""), {
      headers: {
        "User-Agent": user_agent,
      },
    })
      .on("error", (err) => {
        console.log(err);
        res.status(500).end(err.toString());
      })
      .pipe(res);
  } catch (err) {
    return res.status(500).end(
      JSON.stringify({
        error: {
          description: e.toString(),
          code: 2,
        },
      })
    );
  }
});

// Proxy for HLS chunks
app.get("/hs/:id/:on/*", (req, res) => {
  let origin = infos.HLSOrigin[req.params.id];
  if (!origin || !origin[req.params.on])
    return res.status(400).end(
      JSON.stringify({
        error: {
          description: "No origin chunk url for " + req.params.id,
          code: 3,
        },
      })
    );

  if (!req.params[0])
    return res.status(400).end(
      JSON.stringify({
        error: {
          description: "No fullpath provided",
          code: 1,
        },
      })
    );

  const stream = miniget(
    origin[req.params.on] + req.url.split("/").slice(4).join("/"),
    {
      headers: {
        "User-Agent": user_agent,
        Range: req.headers.range || "bytes=0-",
      },
    }
  );

  stream.on("error", (err) => {
    console.log(err);
    res.status(500).end(err.toString());
  });

  stream.on("response", (origin) => {
    ["Accept-Ranges", "Content-Range", "Content-Type", "Cache-Control"].forEach(
      (hed) => {
        let head = origin.headers[hed.toLowerCase()];
        if (head) res.setHeader(hed, head);
      }
    );
    stream.pipe(res);
  });
});

// Proxy to i.ytimg.com, Where Video Thumbnail is stored here.
app.get(["/vi*", "/sb/*"], (req, res) => {
  const stream = miniget("https://i.ytimg.com" + req.url, {
    headers: {
      "User-Agent": user_agent,
      Range: req.headers.range || "bytes=0-",
    },
  });
  stream.on("error", (err) => {
    console.log(err);
    res.status(500).end(err.toString());
  });

  stream.on("response", (origin) => {
    res.setHeader("Content-Type", origin.headers["content-type"]);
    res.setHeader("Content-Length", origin.headers["content-length"]);
    stream.pipe(res);
  });
});

// Proxy to yt3.ggpht.com, Where User avatar is being stored on that host.
app.get(["/yt3/*", "/ytc/*"], (req, res) => {
  if (req.url.startsWith("/yt3/")) req.url = req.url.slice(4);
  const stream = miniget("https://yt3.ggpht.com" + req.url, {
    headers: {
      "User-Agent": user_agent,
      Range: req.headers.range || "bytes=0-",
    },
  });

  stream.on("error", (err) => {
    console.log(err);
    res.status(500).end(err.toString());
  });

  stream.on("response", (origin) => {
    res.setHeader("Content-Type", origin.headers["content-type"]);
    res.setHeader("Content-Length", origin.headers["content-length"]);
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

app.on("error", console.error);

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Your app is now listening on port", listener.address().port);
});

// Handle any unhandled promise rejection.
process.on("unhandledRejection", console.error);

let lastMemoryUsage = null;
setInterval(() => {
  const { rss, external } = process.memoryUsage();
  let memoryUsage = (rss + external) / 1024 / 1024;

  if (Math.ceil(memoryUsage) == Math.ceil(lastMemoryUsage)) return;
  console.log(
    new Date().toLocaleTimeString(),
    "Memory Usage:",
    memoryUsage.toFixed(2) + "M"
  );

  if (
    !process.env.NO_AUTO_KILL &&
    Math.ceil(memoryUsage) > process.env.MAX_SPACE_SIZE
  ) {
    console.warn(
      new Date().toLocaleTimeString(),
      `WARN: Memory usage used more than ${process.env.MAX_SPACE_SIZE} MB.`
    );

    console.warn(new Date().toLocaleTimeString(), "KILL: Accho!!");

    process.exit(0);
  }

  lastMemoryUsage = memoryUsage;
}, 1000);
