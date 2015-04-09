var http = require("http"),
    express = require("express"),
    redis = require("redis"),
    bodyParser = require("body-parser"),
    app = express(),
    client = redis.createClient(),
    nextKey = 0;

// Loads index.html inside /client folder
app.use(express.static(__dirname + "/client"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
// Start the server
http.createServer(app).listen(3000);


// When server establishes connection with Redis server, generate a starting key
client.on("connect", function(){
	"use strict";

	console.log("Connected to Redis server");
	// Initialize key value, assuming one hasn't been set already
	client.exists("nextKey", function(err, result){
		if (err){
			console.log("EXIST ERROR: " + err);
		} else if (result === 0){ // Doesn't exist
			nextKey = 10 * Math.pow(36, 5);
			client.set("nextKey", nextKey);
		} else { // Exists
			client.get("nextKey", function(err, key){
				nextKey = parseInt(key);
			});
		}
	});
});

// Helper function that returns the next key and creates a new one
function getNextKey(){
	"use strict";
	// Make copy of nextKey to return
	var aliasKey = nextKey;
	// Generate next key and increase values in database
	var incrNext = Math.floor(Math.random() * 100) + 1;
	nextKey += incrNext;
	client.incrby("nextKey", incrNext);
	return aliasKey.toString(36);
}

// When user wishes to navigate to a page on the website, most likely a shortened URL
app.get("/:url", function(req, res){
	"use strict";
	var url = req.params.url;
	client.exists(url.toString(), function(err, result){
		if (err){
			console.log("EXIST ERROR: " + err);
		} else if (result === 0){ // Doesn't exist
			res.send("NO URL EXISTS!");
		} else { // Exists
			client.get(url, function(error, longUrl){
				if (error){
					console.log("GET ERROR: " + error);
				} else { // Get the short URL version and send to user
					client.zincrby("urlhits", 1, url);
					res.redirect(longUrl);
				}
			});
		}
	});
});

// Upon arriving to home page, user is requesting the popular links
app.post("/hits", function(req, res){
	"use strict";
	client.zrevrange("urlhits", 0, 9, "WITHSCORES", function(err, result){
		if (err){
			console.log("ZREVRANGE ERROR: " + err);
		} else {
			// Sends result as array [SHORTURL1, HITS1, SHORTURL2, HITS2, ...]
			res.send(result);
		}
	});
});

// User submits a URL to be shortened or obtain the original URL
app.post("/shorter", function (req, res){
	"use strict";
	// Get URL inside textbox
	var url = req.body.url;
	// Gets the address URL of the requester
	var base_url = req.headers.origin;
	// If the user inputted a shortened URL, it should follow the template "#{base_url}/(ALPHA_NUM_CHARS)"
	var base_url_regex = new RegExp(base_url + "\/(.+)");
	// See if the input DOES match the above template (null otherwise)
	var key = url.match(base_url_regex);
	// Use regular expression to test if inputted URL is requesting for unshortened URL
	if (key !== null){
		// Get the shorthand key in the URL (should be at index 1 of match() result)
		key = key[1];
		// Return the real URL
		client.exists(key, function(e, r){
			if (e){
				console.log("EXIST ERROR: " + e);
			} else if (r === 0){ // Doesnt exist, invalid URL
				res.json({"type": "2", "url": ""});
			} else { // Exists
				client.get(key, function(err, origUrl){
					if (err){
						console.log("GET ERROR: " + err);
					} else { // Get the original URL and send to user
						res.json({"type": "1", "url": origUrl});
					}
				});
			}
		});
	} else { // Did not match; must be shortening a URL
		// Check if the database doesn't have a key for this URL already
		client.exists(url, function(err, result){
			if (err){
				console.log("EXIST ERROR: " + err);
			} else if (result === 0){ // Doesn't exist, make new key
				// Make key, set values in database, and send short URL to user
				key = getNextKey();
				client.setnx(key, url);
				client.set(url, key);
				res.json({"type": "0", "url": base_url + "/" + key});
			} else { // Exists, return database value
				client.get(url, function(error, shortUrl){
					if (error){
						console.log("GET ERROR: " + error);
					} else { // Get the short URL version and send to user
						res.json({"type": "0", "url": base_url + "/" + shortUrl});
					}
				});
			}
		});
	}
});

console.log("Server listening on port 3000...");