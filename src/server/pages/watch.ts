import * as fs from "fs";
import * as path from "path";
import { Readable, Writable, pipeline } from "stream";
import * as zlib from "zlib";
import { http, https } from "follow-redirects";
import { Request, Response } from "express";
import { FFmpeg } from "prism-media";
import LineTransformStream from "line-transform-stream";
import * as ytdl from "ytdl-core";
import { base64url, CalcHourMinSec, generateHash, generateRandomNumber, insertAnchers, parseCookie, respondError, searchCardTemplate, ytUserAgent } from "../util";
import { SessionManager } from "../session";
import { downloadParallel } from "../components/parallel-dl";
import { enc } from "crypto-js";

const tempalte = fs.readFileSync(path.join(__dirname, "../../common/watch.html"), {encoding:"utf-8"});

export async function handleWatch(req:Request, res:Response){
  try{
    const vid = req.query["v"]?.toString();
    const sid = req.query["sid"]?.toString();
    const hr = req.query["hr"]?.toString() === "on";
    const cookie = req.headers.cookie && parseCookie(req.headers.cookie);
    const key = cookie && cookie.A_SID;
    const sval = req.query["sval"]?.toString();
    const session = key && SessionManager.instance.update(key);
    const SID_CACHE = session && session.watch;
    if(!sval || !session || session.value !== sval){
      respondError(res, "セッションが切れているか、URLが無効です。", 401);
      return;
    }
    SessionManager.instance.revokeToken(key);
    if(vid){
      const hash = generateHash(vid).toString();
      SID_CACHE[hash] = {
        vid,
        info: ytdl.getInfo(`https://www.youtube.com/watch?v=${vid}`, {
        }).catch(e => e.toString()),
        key: generateHash(generateRandomNumber().toString()),
        format: null,
        vformat: null,
        aformat: null,
      };
      res.writeHead(301, {
        "Location": "/watch?sid=" + hash + "&sval=" + sval + (hr ? "&hr=on" : ""),
        "Cache-Control": "no-store",
      });
      res.end();
    }else if(sid && SID_CACHE[sid]){
      const { info } = SID_CACHE[sid];
      const result = await info;
      if(typeof result === "string"){
        respondError(res, result, 500);
        return;
      }
      const html = generateHtml(tempalte, result, result.related_videos, hr, sval);
      res.writeHead(200, {"Content-Type": "text/html; charset=UTF-8"});
      res.end(html);
    }else{
      respondError(res, "不正なアクセスです", 403);
    }
  }
  catch(e){
    respondError(res, e.toString());
  }
}

function generateHtml(template:string, info:ytdl.videoInfo, items:ytdl.relatedVideo[], hr:boolean, sval:string){
  const cardHtml = searchCardTemplate;
  let cards = "";
  for(let i = 0; i < items.length; i++){
    const item = items[i];
    const duration = (function(duration){
      if(duration){
        const [hour, min, sec] = CalcHourMinSec(duration);
        if(hour === "0")
          return `${min}:${sec}`;
        else
          return `${hour}:${min}:${sec}`;
      }else{
        return "不明";
      }
    })(item.length_seconds);
    const description = (()=>{
      if(item.isLive)
        return "長さ:ライブストリーム, " + item.view_count + "人が視聴中";
      else
        return "長さ:" + duration + ", " + item.view_count + "回視聴" + (item.published ? ", " + item.published : "");
    })();
    cards += cardHtml
      .replace(/{url}/g, "/watch?v=" + item.id + "&sval=" + sval + (hr ? "&hr=on" : ""))
      .replace(/{thumb}/, "proxy?url=" + encodeURIComponent(item.thumbnails[0].url) + "&sval=" + sval)
      .replace(/{title}/, item.title)
      .replace(/{channel_thumb}/, "proxy?url=" + encodeURIComponent(typeof item.author === "string" ? "" : item.author.thumbnails[0].url) + "&sval=" + sval)
      .replace(/{channel}/, typeof item.author === "string" ? item.author : item.author.name)
      .replace(/{description}/, description.length > 200 ? description.substring(0, 200) : description)
    ;
  }
  const subscriber = (function(count){
    if(!count) return "";
    const str = count.toString();
    if(str.length <= 4){
      return str;
    }else if(5 <= str.length && str.length <= 8){
      return (Math.floor(count / 1000) / 10).toString() + "万";
    }else{
      return (Math.floor(count / 10000000) / 10).toString() + "億";
    }
  })(info.videoDetails.author.subscriber_count);
  const result = template
    .replace(/{sval}/g, sval)
    .replace(/{title}/, info.videoDetails.title)
    .replace(/{channel_url}/, `/channel?cid=${encodeURIComponent(info.videoDetails.author.channel_url)}&sval=${sval}`)
    .replace(/{channel_thumb}/, "/proxy?url=" + encodeURIComponent(info.videoDetails.author.thumbnails[0].url) + "&sval=" + sval)
    .replace(/{channel}/, info.videoDetails.author.name)
    .replace(/{channel_subscribe}/, info.videoDetails.author.channel_url + "?sub_confirmation=1")
    .replace(/{channel_subscriber}/, subscriber)
    .replace(/{summary}/, insertAnchers(info.videoDetails.description || "", sval).replace(/\r\n/g, "\r").replace(/\r/g, "\n").replace(/\n/g, "<br>"))
    .replace(/{meta_info}/, (info.videoDetails.viewCount || "不明") + "回視聴, " + (info.videoDetails.uploadDate || "アップロード時不明") + `<br>URL: <a href="${info.videoDetails.video_url}" class="no_link" target="_blank">${info.videoDetails.video_url}</a>`)
    .replace(/{related_content}/, cards)
  ;
  return result;
}

export async function handleFetch(req:Request, res:Response){
  try{
    const sid = req.query["sid"]?.toString();
    const resolution = req.query["resolution"]?.toString();
    const cookie = req.headers.cookie && parseCookie(req.headers.cookie);
    const key = cookie && cookie.A_SID;
    const sval = req.query["sval"]?.toString();
    const session = key && SessionManager.instance.update(key);
    const SID_CACHE = session && session.watch;
    const ref = req.headers.referer && SID_CACHE && sid && req.headers.referer.includes(`/watch?sid=${sid}&sval=${sval}`);
    if(!sval || !session || session.value !== sval || !ref){
      respondError(res, "セッションが切れているか、URLが無効です。", 401);
      return;
    }
    if(sid && SID_CACHE[sid]){
      const info = await SID_CACHE[sid].info;
      if(info.videoDetails.liveBroadcastDetails && info.videoDetails.liveBroadcastDetails.isLiveNow){
        SID_CACHE[sid].format = ytdl.chooseFormat(info.formats, {isHLS:true} as ytdl.chooseFormatOptions);
        res.writeHead(200, {"Content-Type": "application/json; charset=UTF-8"});
        res.end(JSON.stringify({
          key: SID_CACHE[sid].key,
          format: `application/x-mpegURL`,
          ott: SessionManager.instance.createTokenFor(key),
          mode: "default",
        }));
      }else if(resolution === "high"){
        const videoFormat = ytdl.chooseFormat(info.formats, {
          filter: f => f.hasVideo && !f.hasAudio && f.container === "webm",
          quality: "highest",
        });
        const audioFormat = ytdl.chooseFormat(info.formats, {
          filter : f => !f.hasVideo && f.hasAudio && f.container === "webm",
        });
        if(!videoFormat || !audioFormat){
          respondError(res, "指定された画質で再生できない動画です。", 400);
          return;
        }
        SID_CACHE[sid].vformat = videoFormat;
        SID_CACHE[sid].aformat = audioFormat;
        res.writeHead(200, {"Content-Type": "application/json; charset=UTF-8"});
        res.end(JSON.stringify({
          key: SID_CACHE[sid].key,
          format: "application/dash+xml",
          ott: SessionManager.instance.createTokenFor(key),
          mode: "diy",
          length: Number(info.videoDetails.lengthSeconds) || undefined,
          vcodec: videoFormat.videoCodec,
          acodec: audioFormat.audioCodec,
          vbitrate: videoFormat.bitrate,
          abitrate: audioFormat.bitrate,
          vlength: videoFormat.contentLength,
          alength: audioFormat.contentLength,
          vindexrange: `${videoFormat.indexRange.start}-${videoFormat.indexRange.end}`,
          aindexrange: `${audioFormat.indexRange.start}-${audioFormat.indexRange.end}`,
          vinitrange: `${videoFormat.initRange.start}-${videoFormat.initRange.end}`,
          ainitrange: `${audioFormat.initRange.start}-${audioFormat.initRange.end}`,
        }));
      }else if(resolution === "audio"){
        const audioFormat = ytdl.chooseFormat(info.formats, {
          filter: "audioonly",
          quality: "highest",
        });
        SID_CACHE[sid].aformat = audioFormat;
        res.writeHead(200, {"Content-Type": "application/json; charset=UTF-8"});
        res.end(JSON.stringify({
          key: SID_CACHE[sid].key,
          format: audioFormat.mimeType,
          ott: SessionManager.instance.createTokenFor(key),
          mode: "default",
          length: Number(info.videoDetails.lengthSeconds) || undefined,
        }));
      }else{
        // format seletion
        let format = null as ytdl.videoFormat;
        if(info.formats.some(f => f.isDashMPD)){
          format = SID_CACHE[sid].format = ytdl.chooseFormat(info.formats, {
            filter: f => f.isDashMPD, 
            quality: "highest"
          });
        }else{
          const formats = ytdl.filterFormats(info.formats, "videoandaudio");
          format = SID_CACHE[sid].format = formats.sort((a,b) => a.bitrate && b.bitrate ? b.bitrate - a.bitrate : 0)[0];
        }
        if(format.isDashMPD){
          res.writeHead(200, {"Content-Type": "application/json; charset=UTF-8"});
          res.end(JSON.stringify({
            key: SID_CACHE[sid].key,
            format: `application/dash+xml`,
            ott: SessionManager.instance.createTokenFor(key),
            mode: "default",
          }))
        }else{
          res.writeHead(200, {"Content-Type": "application/json; charset=UTF-8"});
          res.end(JSON.stringify({
            key: SID_CACHE[sid].key,
            format: format.mimeType,
            ott: SessionManager.instance.createTokenFor(key),
            mode: "default",
          }));
        }
      }
    }else{
      respondError(res, "不正なアクセスです", 403);
    }
  }
  catch(e){
    respondError(res, e.toString());
  }
}

export async function handlePlayback(req:Request, res:Response){
  try{
    const sid = req.query["sid"]?.toString();
    const key = req.query["key"]?.toString();
    const type = req.query["type"]?.toString();
    const ott = req.query["ott"]?.toString();
    const cookie = req.headers.cookie && parseCookie(req.headers.cookie);
    const skey = cookie && cookie.A_SID;
    const sval = req.query["sval"]?.toString();
    const session = skey && SessionManager.instance.update(skey);
    const SID_CACHE = session && session.watch;
    // if(!sval || !session || session.value !== sval || !SessionManager.instance.validateToken(skey, ott)){
    //   respondError(res, "セッションが切れているか、URLが無効です。", 401);
    //   return;
    // }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    if(sid && SID_CACHE[sid] && key && SID_CACHE[sid].key === key){
      const { info:pinfo, format, vformat, aformat } = SID_CACHE[sid];
      if(!req.headers.referer || !req.headers.referer.includes("sid=" + sid) || !req.headers.referer.includes("/watch")){
        respondError(res, "不正なアクセスです", 403);
        return;
      }
      const info = await pinfo;
      let headers = {} as {[key:string]:string};
      if(req.headers.range) headers["Range"] = req.headers.range;
      if(req.headers.accept) headers["Accept"] = req.headers.accept;
      if(req.headers["accept-encoding"]) headers["Accept-Encoding"] = req.headers["accept-encoding"] as string;
      if(req.headers.connection) headers["Connection"] = req.headers.connection;
      if(!type || type === "normal" || info.videoDetails.liveBroadcastDetails?.isLiveNow){
        const isLive = info.videoDetails.liveBroadcastDetails?.isLiveNow;

        if(isLive || format.isDashMPD){
          const url = new URL(format.url);
          ({"http:": http, "https:": https})[url.protocol].request(url, {
            headers: {
              "User-Agent": ytUserAgent,
              ...headers
            }
          }, remoteRes => {
            // prepare header
            const headers = Object.assign({}, remoteRes.headers);
            if(headers["set-cookie"]) delete headers["set-cookie"];

            if(isLive){
              if(headers["content-length"]) delete headers["content-length"];
              res.writeHead(remoteRes.statusCode, headers);
              const filter = new LineTransformStream((text) => {
                if(text.startsWith("https"))
                  return `/proxy/${base64url.encode(text)}/sval/${sval}`;
                else
                  return text;
              });
              const streams:(Readable|Writable)[] = [
                remoteRes,
              ];
              const encodings = (remoteRes.headers["content-encoding"]?.split(",").map(d => d.trim()).reverse() || []);
              encodings.forEach(encoding => {
                if(encoding === "br"){
                  streams.push(zlib.createBrotliDecompress());
                }else if(encoding === "gzip"){
                  streams.push(zlib.createGunzip());
                }else if(encoding === "deflate"){
                  streams.push(zlib.createInflate());
                }
              });
              streams.push(filter);
              encodings.reverse().forEach(encoding => {
                if(encoding === "br"){
                  streams.push(zlib.createBrotliCompress());
                }else if(encoding === "gzip"){
                  streams.push(zlib.createGzip());
                }else if(encoding === "deflate"){
                  streams.push(zlib.createDeflate());
                }
              });
              streams.push(res);
              pipeline(streams, console.error);
            }else if(format.isDashMPD){
              if(headers["content-length"]) delete headers["content-length"];
              if(headers["content-encoding"]) delete headers["content-encoding"];
              headers["content-type"] = "application/dash+xml";
              const chunks = [] as Buffer[];
              const decodeStreams:Readable[] = [remoteRes];
              const encodings = (remoteRes.headers["content-encoding"]?.split(",").map(d => d.trim()).reverse() || []);
              encodings.forEach(encoding => {
                if(encoding === "br"){
                  decodeStreams.push(zlib.createBrotliDecompress());
                }else if(encoding === "gzip"){
                  decodeStreams.push(zlib.createGunzip());
                }else if(encoding === "deflate"){
                  decodeStreams.push(zlib.createInflate());
                }
              });
              pipeline(decodeStreams, () => {})
                .on("data", (chunk) => chunks.push(Buffer.from(chunk)))
                .on("end", () => {
                  const mpd = Buffer.concat(chunks).toString("utf-8")
                    .replace(/<BaseURL>(.+?)<\/BaseURL>/g, baseUrl => {
                      const encoded = base64url.encode(baseUrl.match(/<BaseURL>(?<url>.+?)<\/BaseURL>/).groups["url"]);
                      return `<BaseURL>${new URL(req.headers.referer).origin}/proxy/${encoded}/sval/${sval}/</BaseURL>`
                    });
                  res.end(mpd);
                })
                .on("error", () => decodeStreams.forEach(s => s.destroy()))
                ;
              res.writeHead(remoteRes.statusCode, headers);
            }
          })
          .on("error", (e) => {
            console.log(e);
            res.end();
          }).end();
        }else{
          downloadParallel(format.url, headers, 512 * 1024, res);
        }
      }else if(type === "video" && vformat){
        downloadParallel(vformat.url, headers, 512 * 1024, res);
      }else if(type === "audio" && aformat){
        const url = new URL(aformat.url);
        ({"http:": http, "https:": https})[url.protocol].request(url, {
          headers: {
            "User-Agent": ytUserAgent,
            ...headers
          },
        }, remoteRes => {
          const headers = Object.assign({}, remoteRes.headers);
          if(headers["set-cookie"]) delete headers["set-cookie"];
          res.writeHead(remoteRes.statusCode, headers);
          remoteRes.pipe(res);
        })
          .on("error", (e) => {
            console.log(e);
            res.end();
          })
          .end()
        ;
      }else{
        respondError(res, "パラメーターが不正です");
      }
    }else{
      respondError(res, "不正アクセスです");
    }
  }
  catch(e){
    try{
      console.log(e);
      res.end();
    }
    catch{}
  }
}