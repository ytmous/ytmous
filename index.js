const ytdl = require("ytdl-core");
const ytsr = require("ytsr");
const ytpl = require("ytpl");
const get = require("miniget");
const express = require("express");
const ejs = require("ejs");
const app = express();

//        CONFIGURATION        //

// Protocol (For livestream)
// For Heroku / etc, We use https to keep everything anonymous.
// Simply change this as "http" if you're running this code locally
const protocol = process.env.PROTOCOL || "https";

// Result Limit
// By default, ytsr & ytpl result limit is 100.
// For ytmous, The search result default is 80. 
// Change it as many as you want. 0 for all result without limit.
// The smaller, The faster.
const limit = process.env.LIMIT || 80;

// User Agent
// This is where we fake our request to youtube. 
const user_agent = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

//     EMD OF CONFIGURATION    //


app.use(express.static(__dirname + "/public"));

// Home page 
app.get("/", (req, res) => {
	res.sendFile(__dirname + "/views/index.html");
});

// Search page
app.get("/s", async (req, res) => {
	let query = req.query.q;
	if (!query) return res.redirect("/");
	try {
		res.render("search.ejs", {
			res: await ytsr(query, { limit }),
			query: query
		});
	} catch (error) {
		console.error(error);
		try {
			res.send(error)
		} catch (error) {
			console.error(error);
		}
	}
});

// Watch Page
app.get("/w/:id", async (req, res) => {
	if (!req.params.id) return res.redirect("/");
	try {
		res.render("watch.ejs", {
			id: req.params.id,
			info: await ytdl.getInfo("https://www.youtube.com/watch?v=" + req.params.id)
		});
	} catch (error) {
		console.error(error);
		res.status(500).send(error.toString());
	}
});

// Playlist page
app.get("/p/:id", async (req, res) => {
	if (!req.params.id) return res.redirect("/");
	try {
		res.render("playlist.ejs", {
			playlist: await ytpl(req.params.id, { limit })
		});
	} catch (error) {
		console.error(error);
		res.status(500).send(error.toString());
	}
});

// Channel page
app.get("/c/:id", async (req, res) => {
	if (!req.params.id) return res.redirect("/");
	try {
		res.render("channel.ejs", {
			channel: await ytpl(req.params.id, { limit })
		});
	} catch (error) {
		console.error(error);
		res.status(500).send(error.toString());
	}
});

// CDN
app.get("/s/:id", (req, res) => {
	let stream = ytdl(req.params.id, { filter: "videoandaudio", quality: "highest", dlChunkSize: 1024 * 64 });
	stream.on('info', info => {
		if (info.formats[0].contentLength) res.setHeader("content-length", info.formats[0].contentLength);
		res.setHeader("content-type", info.formats[0].mimeType);
		stream.pipe(res);
	});

	stream.on('error', (err) => {
		console.error(err);
		res.status(500).send(err.toString());
	});
});;

// Proxy to i.ytimg.com, Where Video Thumbnail is stored here.
app.get("/vi*", (req, res) => {
	let stream = get(`https://i.ytimg.com/${req.url.split("?")[0]}`, {
		headers: {
			"user-agent": user_agent
		}
	})
	stream.on('error', err => {
		console.log(err);
		res.status(500).send(err.toString());
	});
	stream.pipe(res);
});

// Proxy to yt3.ggpht.com, Where User avatar is being stored on that host.
app.get("/ytc/*", (req, res) => {
	let stream = get(`https://yt3.ggpht.com/${req.url}`, {
		headers: {
			"user-agent": user_agent
		}
	})
	stream.on('error', err => {
		console.log(err);
		res.status(500).send(err.toString());
	});
	stream.pipe(res);
});

const listener = app.listen(process.env.PORT || 3000, () => {
	console.log("Your app is now listening on port", listener.address().port);
});

// Handle any unhandled promise rejection.
process.on("unhandledRejection", console.error);
