const shortid = require("shortid");
const urlModel = require("../model/urlModel");
const redis = require("redis");

const { promisify } = require("util");
//--------------------------------Connect to redis------------------------------------
const redisClient = redis.createClient(
  13190,
  "redis-13190.c301.ap-south-1-1.ec2.cloud.redislabs.com",
  { no_ready_check: true }
);
redisClient.auth("gkiOIPkytPI3ADi14jHMSWkZEo2J5TDG", function (error) {
  if (error) throw error;
});

redisClient.on("connect", async function () {
  console.log("Connected to Redis..");
});

//Connection setup for redis

const SET_ASYNC = promisify(redisClient.SET).bind(redisClient);
const GET_ASYNC = promisify(redisClient.GET).bind(redisClient);

//------------------------------------validation---------------------------------------
const isValid = function (value) {
  if (typeof value === "undefined" || typeof value === "null") {
    return false;
  }
  if (value.trim().length == 0) {
    return false;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return true;
  }
};
const createurl = async function (req, res) {
  try {
    if (Object.keys(req.body).length == 0) {
      return res.status(400).send({
        status: false,
        message: "Invalid request parameters. Please provide URL details",
      });
    }

    if (!isValid(req.body.longUrl)) {
      return res
        .status(400)
        .send({ status: false, message: " Please provide LONG URL" });
    }

    const longUrl = req.body.longUrl.trim();


    if (!(/(:?^((https|http|HTTP|HTTPS){1}:\/\/)(([w]{3})[\.]{1})?([a-zA-Z0-9]{1,}[\.])[\w]*((\/){1}([\w@?^=%&amp;~+#-_.]+))*)$/.test(longUrl))
    ) {
      return res.status(400).send({
        status: false,
        message: "Invalid URL Format",
      });
    }

    //------------------------findInCache------------
    const findInCache = await GET_ASYNC(`${longUrl}`);
    if (findInCache) {
      let data = JSON.parse(findInCache);
      let finaldata= {
        longUrl:data.longUrl,
        shortUrl:data.shortUrl,
        urlCode:data.urlCode
      }
      return res
        .status(200)
        .send({
          status: true,
          msg: `longUrl is already registered and coming from cache`,
          data: finaldata,
        });

    }
  //if url is not find in cashe memory
    let url = await urlModel
      .findOne({ longUrl })
      .select({ shortUrl: 1, _id: 0 });
     


    if (url) {
      await SET_ASYNC(`${longUrl}`, JSON.stringify(url));
      return res.status(201).send({
        status: true,
        msg: `${longUrl} is already registered is coming from DB`,
        data: url
      });
    }
    //if we not get shoturl link in DB then we create new shortUrl link 
    const baseUrl = "http://localhost:3000";
    
    let urlCode = shortid
      .generate()
      .match(/[a-z\A-Z]/g)
      .join("");
    urlCode = urlCode.toLowerCase();

    const shortUrl = baseUrl + "/" + urlCode;
    const urlData = { urlCode, longUrl, shortUrl };
    const newurl = await urlModel.create(urlData);
    //SET in cashe memory 
    await SET_ASYNC(`${longUrl}`, JSON.stringify(newurl));
    await SET_ASYNC(`${urlCode}`, JSON.stringify(newurl));

    let currentUrl = {
      longUrl: newurl.longUrl,
      shortUrl: newurl.shortUrl,
      urlCode: newurl.urlCode,
    };
    return res.status(201).send({ status: true, msg: "shortUrl successful generated ",data: currentUrl });
  } catch (err) {
    console.log(err);
    res.status(500).send({ status: false, msg: "Server Error" });
  }
};

//------------------------------------------geturl-------------------------------------------
const geturl = async function (req, res) {
  try {
    let urlData = req.params.urlCode;
    const urlCode = urlData
      .split("")
      .map((a) => a.trim())
      .join("");
    if (!urlCode) {
      res.status(400).send({ status: false, msg: "please provide UrlCode" });
    }
    let cachedUrlDataTwo = await GET_ASYNC(`${urlCode}`);
    let cachedUrlDataThree = JSON.parse(cachedUrlDataTwo);
    if (cachedUrlDataThree) {
      res.redirect(302, cachedUrlDataThree["longUrl"]);
    } else {
      let checkUrlCodevalid = await urlModel.findOne({ urlCode: urlCode })
        .select({ longUrl: 1 });
      if (!checkUrlCodevalid) {
        return res.status(404).send({ status: false, msg: "shortUrl not found" });
      }
      await SET_ASYNC(`${urlCode}`, JSON.stringify(checkUrlCodevalid));
      res.redirect(302, checkUrlCodevalid.longUrl);
    }
  } catch (error) {
    res.status(500).send({ status: false, msg: "Server Error" });
  }
};

module.exports = {
  createurl,
  geturl,
};
