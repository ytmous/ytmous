<div align="center">
  <h1>ytmous</h1>
  <p>Anonymous youtube proxy</p>
</div>

### Search, Click, and watch
ytmous is a lightweight, and Anonymous Youtube Proxy. Designed for device with limited resource.

### There's no tracker and ads
Only a simple webpage, ready for you to watch some videos in a second

### Less JavaScript in frontend
There's only 1 script that doing it's job for quality selection. While most pages were rendered in server (backend), You can still use ytmous without JavaScript enabled.

### Completely open source
ytmous is licensed under BSD 3 Clause and it's code is free. You can also host your own ytmous.

**DISCLAIMER:** ytmous could fetch, stream or download videos from YouTube, even copyrighted ones. Please respect all copyright laws.

## Screenshots
![ytmous_homepage.png](https://raw.githubusercontent.com/Yonle/ytmous/nightly/screenshots/ytmous_homepage.png)
![ytmous_mobile_search.png](https://raw.githubusercontent.com/Yonle/ytmous/nightly/screenshots/ytmous_mobile_search.png)
![ytmous_mobile_channel.png](https://raw.githubusercontent.com/Yonle/ytmous/nightly/screenshots/ytmous_mobile_channel.png)
![ytmous_mobile_playlists.png](https://raw.githubusercontent.com/Yonle/ytmous/nightly/screenshots/ytmous_mobile_playlists.png)
![ytmous_mobile_watch.png](https://raw.githubusercontent.com/Yonle/ytmous/nightly/screenshots/ytmous_mobile_watch.png)
![ytmous_desktop_watch.png](https://raw.githubusercontent.com/Yonle/ytmous/nightly/screenshots/ytmous_desktop_watch.png)

## Server Requirement
- Node v10+ (Node v14 Recommended)
- Git installed
- Fast server network connection

## Configuration
The code is reading the provided configuration from Environment Variable that comes from your system. These variable is **optional**.

- `LIMIT`: Search / Video result from playlist, channel, or search result limit. The smaller, The faster.
- `VIDINFO_LIMIT`: Video information caching limit, Mostly used for streaming after watch page has been loaded. Default is `20`.
- `USER_AGENT`: This variable is where we fake our user agent to request youtube.
- `DLCHUNKSIZE`: Download Chunk Size. Default is 1 MB (1024 * 1024)
- `NO_API_ENDPOINTS`: Disable API endpoints. By default, API Endpoints is enabled.
- `PORT`: Server port to listen to.

## Customizing frontend
You can customize your frontend by creating `local` directory to replace files from `views` or `public` directory.

- `local/views/` for backend rendering (`views`)
- `local/public/` for static page (`public`)

## Starting the server
If this is your first time running this server, You may need to install it's dependencies first by executing `npm install`. 

Therefore, you can start the server by executing:
```sh
npm start
```
or
```
PORT=3000 npm start
```

## API
You can use ytmous API endpoints for your applications. The following endpoints are supported:

### `/api/search`
Endpoint to search videos.

#### Queries
- `q` (String) **(Required)**
  String to search with.

- `page` (Number)
  Next page listing.

### `/api/getPlaylistInfo/[playlistID]`
Endpoint to list videos from playlist / channel.

#### Parameters
- `playlistID` **(Required)**
  String of Playlist or Channel ID.

## `/api/getVideoInfo/[videoID]`
Endpoint to give information of an YouTube video.

#### Parameters
- `videoID` **(Required)**
  String of YouTube video ID
