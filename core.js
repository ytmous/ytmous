const ytsr = require("ytsr");
const ytpl = require("ytpl");

module.exports.search = (str, page) => {
	return new Promise(async (resolve, reject) => {
		try {
			let res = await ytsr(str, { limit: Infinity, pages: Infinity });
			resolve(parse(res.items.filter(c => c.type == "video")));
		} catch (error) {
			reject(error);
		}
	});
}

module.exports.playlist = id => {
	return new Promise(async (resolve, reject) => {
		try {
			let res = await ytpl(id);
			resolve({
				title: res.title,
				description: res.description || "No Description",
				lastUpdated: res.lastUpdated,
				author: res.author,
				items: parse(res.items)
			});
		} catch (error) {
			reject(error);
		}
	});
}

module.exports.channel = id => {
	return new Promise(async (resolve, reject) => {
		try {
			let ch = await module.exports.playlist(id);
			let chInfo = ch.author;
			chInfo.description = ch.description;
			chInfo.items = ch.items;
			resolve(chInfo);
		} catch (error) {
			reject(error);
		}
	});
}

function parse(item) {
	return item.filter(c => c.isPlayable || (c.type && !c.type.isUpcoming)).map(v => {
		return {
			title: v.title,
			thumbnail: v.bestThumbnail.url.slice(19),
			id: v.id,
			url: v.url,
			author: v.author,
			duration: v.duration || v.durationSec,
			uploadedAt: v.uploadedAt,
			description: v.description,
			views: v.views
		}
	});
}


module.exports.parse = parse;
