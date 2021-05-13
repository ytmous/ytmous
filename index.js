const ytdl = require("ytdl-core");
const { get } = require("https");
const express = require("express");
const ejs = require("ejs");
const app = express();
const { search, playlist, channel } = require("./core.js");

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
			res: await search(query),
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
	try {
		res.render("watch.ejs", {
			id: req.params.id,
			info: await ytdl.getInfo("https://www.youtube.com/watch?v=" + req.params.id)
		});
	} catch (error) {
		console.error(error);
		res.redirect('/');
	}
});

// Playlist page
app.get("/p", (res, rej) => {
	// Coming soon. So we just redirect to main page
	res.redirect("/");
});

// Channel page
app.get("/c", (res, rej) => {
	// Coming soon. So we just redirect to main page
	res.redirect("/");
});

// CDN
app.get("/stream/:id", (req, res) => {
	let stream = ytdl("https://www.youtube.com/watch?v=" + req.params.id, { filter: "videoandaudio", quality: "highest" });
	stream.on('info', () => {
		stream.pipe(res);
	});

	stream.on('error', (err) => {
		console.error(err);
		response.send(err.toString());
	});
});

// Proxy to i.ytimg.com
app.get("/vi*", (req, res) => {
	get({
		hostname: "i.ytimg.com",
		path: req.url.split("?")[0],
		headers: {
			"user-agent": req.headers["user-agent"] || "ytmous - ytimg"
		}
	}, stream => {
		stream.pipe(res);
		stream.on("error", (err) => {
			console.error(err);
			try {
				res.send(err.toString());
			} catch (error) {
				console.error(error);
			}
		});
	}).on('error', (err) => {
		console.error(err);
		try {
			res.send(err.toString());
		} catch (error) {
			console.error(error);
		}
	});
});

// Proxy to yt3.ggpht.com
app.get("/ytc/*", (req, res) => {
	get({
		hostname: "yt3.ggpht.com",
		path: req.url,
		headers: {
			"user-agent": req.headers["user-agent"] || "ytmous - ytimg"
		}
	}, stream => {
		stream.pipe(res);
		stream.on('error', (err) => {
			console.error(err);
			try {
				res.send(err.toString());
			} catch (error) {
				console.error(error);
			}
		});
	}).on('error', (err) => {
		console.error(err);
		try {
			res.send(err.toString());
		} catch (error) {
			console.error(error);
		}
	});
});

const listener = app.listen(process.env.PORT || 3000, () => {
	console.log("Your app is now listening on port", listener.address().port);
});

process.on("unhandledRejection", console.error);
