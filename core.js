const ytsr = require("ytsr");

module.exports.search = str => {
	return new Promise(async (resolve, reject) => {
		try {
			let res = await ytsr(str);
			resolve(res.items.filter(c => c.type == "video" && !c.type.isUpcoming).map(v => {
				return {
					title: v.title,
					thumbnail: v.bestThumbnail.url,
					id: v.id,
					url: v.url,
					author: v.author,
					duration: v.duration,
					uploadedAt: v.uploadedAt,
					description: v.description,
					views: v.views
				}
			}));
		} catch (error) {
			reject(error);
		}
	});
}
