const miniget = require("miniget");
const videoIDRegex = /^[a-zA-Z0-9-_]{11}$/;

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

function getChunk(beginRange, req, res, headers, streamingData, streamSize, isSeeking = false, h, headersSetted = false, sentSize = 0, lastConnErr = 0) {
  beginRange = parseInt(beginRange);

  let endRange = beginRange + parseInt(process.env.DLCHUNKSIZE || 1024 * 1024);
  if (endRange > parseInt(h[1]))
    endRange = parseInt(h[1]);
  if (endRange >= streamingData.content_length)
    endRange = "";

  headers.Range = `bytes=${beginRange}-${endRange}`;

  const s = miniget(streamingData.url, { headers })
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
        sentSize >= streamingData.content_length ||
        beginRange >= endRange
      )
        return res.end();
      lastConnErr++;
      getChunk(sentSize + 1, req, res, headers, streamingData, streamSize, isSeeking, h, headersSetted, sentSize, lastConnErr);
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

      getChunk(endRange + 1, req, res, headers, streamingData, streamSize, isSeeking, h, headersSetted, sentSize, lastConnErr);
    });
}

function getCaptions(info, sub) {
  try {
    let captions =
      info.captions.caption_tracks;
    if (!captions || !captions.length) return [];
    if (!sub) return captions;

    return captions.filter((c) => c.vss_id === sub);
  } catch {
    return [];
  }
}

function sendError(res, error, title = "YouTubeJS error", status = 500, isAPI, code = 2) {
  if (code !== 1) console.error(error);
  try {
    if (isAPI) {
      res.status(status).end(JSON.stringify({
        error: {
          title,
          description: error.toString(),
          code
        }
      }));
    } else {
      res.status(status).render("error.ejs", {
        title,
        content: error,
      });
    }
  } catch (error) {
    console.error(error);
  }
}

function validateID(id) {
  return videoIDRegex.test(id.trim());
}

function sendInvalidIDError(res, isAPI) {
  return module.exports.sendError(res, "Your requested video is invalid. Check your URL and try again.", "Invalid Video ID", 400, isAPI, 1);
}

async function getInfo(client, id) {
  let res = await client.getInfo(id);
  res.comments = await client.getComments(id);

  return res;
}

function filterFormat(formats, itag) {
  return formats.filter((format) =>
    itag ? itag == format.itag : format.has_video && format.has_audio
  ).pop();
}

async function getComments(client, id) {
  try {
    return await client.getComments(id);
  } catch {
    return null;
  }
}

module.exports = { clearListener, getSize, getChunk, getCaptions, sendError, validateID, sendInvalidIDError, filterFormat, getComments };
