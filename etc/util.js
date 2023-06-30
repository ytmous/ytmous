const undici = require("undici");
const videoIDRegex = /^[a-zA-Z0-9-_]{11}$/;

function clearListener(s, events = ["response", "error", "data", "end"]) {
  events.forEach(i => s.removeAllListeners(i));
}

async function getSize(url, ua) {
  const request = await undici.request(url, {
    method: "HEAD",
    headers: {
      "User-Agent": ua
    }
  });
  const length = request.headers["content-length"];

  return length;
}

async function getChunk(beginRange, req, res, headers, streamingData, streamSize, isSeeking = false, h, headersSetted = false, sentSize = 0, lastConnErr = 0) {
  beginRange = parseInt(beginRange);

  let endRange = beginRange + parseInt(process.env.DLCHUNKSIZE || 1024 * 1024 * 10);
  if (endRange > parseInt(h[1])) endRange = parseInt(h[1]);
  if (endRange >= streamingData.content_length) endRange = "";
  if (beginRange >= streamingData.content_length) return res.end();

  headers.Range = `bytes=${beginRange}-${endRange}`;
  try {
    const request = await undici.request(streamingData.url, { headers })
    if (!headersSetted) {
      for (hed of ["Accept-Ranges", "Content-Type", "Cache-Control"]) {
        const head = request.headers[hed.toLowerCase()];
        if (head) res.setHeader(hed, head);
        headersSetted = true;
      };
    }

    lastConnErr = 0;

    for await (const data of request.body) {
      res.write(data);
      res.flush();
      sentSize += data.length;
      if (sentSize >= streamSize) {
        res.end();
        break;
      }
    }

    getChunk(endRange + 1, req, res, headers, streamingData, streamSize, isSeeking, h, headersSetted, sentSize, lastConnErr);
  } catch (err) {
    lastConnErr++;

    if (lastConnErr >= 5) return res.end();
    getChunk(sentSize + 1, req, res, headers, streamingData, streamSize, isSeeking, h, headersSetted, sentSize, lastConnErr);
  }
}

async function proxy(url, req, res, ua) {
  try {
    const request = await undici.request(url, {
      headers: {
        "User-Agent": ua,
        Range: req.headers.range || "bytes=0-",
      },
    })

    for (h of ["Accept-Ranges", "Content-Type", "Content-Range", "Content-Length", "Cache-Control"]) {
      const headerValue = request.headers[h.toLowerCase()];
      if (headerValue) res.setHeader(h, headerValue);
    }

    for await (const data of request.body) {
      res.write(data);
    }

    res.end();
  } catch (err) {
    console.log(err);
    res.status(500).end(err.toString());
  }
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

module.exports = { clearListener, getSize, getChunk, getCaptions, sendError, validateID, sendInvalidIDError, filterFormat, getComments, proxy };
