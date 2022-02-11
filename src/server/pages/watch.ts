import * as fs from "fs";
import * as path from "path";
import { http, https } from "follow-redirects";
import { Request, Response } from "express";
import { FFmpeg } from "prism-media";
import LineTransformStream from "line-transform-stream";
import * as ytdl from "ytdl-core";
import { CalcHourMinSec, generateHash, generateRandomNumber, insertAnchers, parseCookie, respondError, ytUserAgent } from "../util";
import { SessionManager } from "../session";
import { downloadParallel } from "../components/parallel-dl";

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
  const cardHtml = `
  <div class="search_card">
    <a href="{url}">
      <div class="search_thumb">
        <img src="{thumb}">
      </div>
      <div class="search_detail">
        <div class="search_title">
          <p>{title}</p>
        </div>
        <div class="search_channel">
          <p>
            <img src="{channel_thumb}">
            <span>{channel}</span>
          </p>
        </div>
        <div class="search_description">
          <p>{description}</p>
        </div>
      </div>
    </a>
  </div>`;
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
      .replace(/{url}/, "/watch?v=" + item.id + "&sval=" + sval + (hr ? "&hr=on" : ""))
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
    .replace(/{sval}/, sval)
    .replace(/{title}/, info.videoDetails.title)
    .replace(/{channel_url}/, info.videoDetails.author.channel_url)
    .replace(/{channel_thumb}/, "proxy?url=" + encodeURIComponent(info.videoDetails.author.thumbnails[0].url) + "&sval=" + sval)
    .replace(/{channel}/, info.videoDetails.author.name)
    .replace(/{channel_subscribe}/, info.videoDetails.author.channel_url + "?sub_confirmation=1")
    .replace(/{channel_subscriber}/, subscriber)
    .replace(/{summary}/, insertAnchers(info.videoDetails.description || "").replace(/\r\n/g, "\r").replace(/\r/g, "\n").replace(/\n/g, "<br>"))
    .replace(/{meta_info}/, (info.videoDetails.viewCount || "不明") + "回視聴, " + (info.videoDetails.uploadDate || "アップロード時不明") + `<br>URL: <a href="${info.videoDetails.video_url}" class="no_link" target="_blank">${info.videoDetails.video_url}</a>`)
    .replace(/{related_content}/, cards)
  ;
  return result;
}

export async function handleFetch(req:Request, res:Response){
  try{
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
    if(sid && SID_CACHE[sid]){
      const info = await SID_CACHE[sid].info;
      if(hr){
        const vformat = SID_CACHE[sid].vformat = ytdl.chooseFormat(info.formats.filter(f => f.container === "webm"), {
          filter: "video", quality: "highestvideo"
        });
        res.writeHead(200, {"Content-Type": "application/json; charset=UTF-8"});
        res.end(JSON.stringify({
          key: SID_CACHE[sid].key,
          format: `video/${vformat.container}`,
          length: Number(info.videoDetails.lengthSeconds),
          ott: SessionManager.instance.createToken(key)
        }));
      }else if(info.videoDetails.liveBroadcastDetails && info.videoDetails.liveBroadcastDetails.isLiveNow){
        SID_CACHE[sid].format = ytdl.chooseFormat(info.formats, {isHLS:true} as ytdl.chooseFormatOptions);
        res.writeHead(200, {"Content-Type": "application/json; charset=UTF-8"});
        res.end(JSON.stringify({
          key: SID_CACHE[sid].key,
          format: `application/x-mpegURL`,
          ott: SessionManager.instance.createToken(key)
        }));
      }else{
        // format seletion
        let format = null as ytdl.videoFormat;
        if(info.formats.some(f => f.isDashMPD)){
          format = SID_CACHE[sid].format = ytdl.chooseFormat(info.formats, {
            filter: f => f.isDashMPD, quality: "highest"
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
            ott: SessionManager.instance.createToken(key)
          }))
        }else{
          res.writeHead(200, {"Content-Type": "application/json; charset=UTF-8"});
          res.end(JSON.stringify({
            key: SID_CACHE[sid].key,
            format: `video/${format.container}`,
            ott: SessionManager.instance.createToken(key)
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
    const hr = req.query["hr"]?.toString() === "on";
    const ott = req.query["ott"]?.toString();
    const cookie = req.headers.cookie && parseCookie(req.headers.cookie);
    const skey = cookie && cookie.A_SID;
    const sval = req.query["sval"]?.toString();
    const session = skey && SessionManager.instance.update(skey);
    const SID_CACHE = session && session.watch;
    if(!sval || !session || session.value !== sval || !SessionManager.instance.validateToken(skey, ott)){
      respondError(res, "セッションが切れているか、URLが無効です。", 401);
      return;
    }
    if(sid && SID_CACHE[sid] && key && SID_CACHE[sid].key === key){
      const { info:pinfo, format, vformat } = SID_CACHE[sid];
      if(!req.headers.referer || !req.headers.referer.includes("sid=" + sid) || !req.headers.referer.includes("/watch")){
        respondError(res, "不正なアクセスです", 403);
        return;
      }
      const info = await pinfo;
      if(!hr){
        const isLive = info.videoDetails.liveBroadcastDetails && info.videoDetails.liveBroadcastDetails.isLiveNow;
        let headers = {} as {[key:string]:string};
        if(req.headers.range) headers["Range"] = req.headers.range;
        if(req.headers.accept) headers["Accept"] = req.headers.accept;
        if(req.headers.connection) headers["Connection"] = req.headers.connection;

        if(isLive || format.isDashMPD){
          const url = new URL(format.url);
          ({"http:": http, "https:": https})[url.protocol].request({
            protocol: url.protocol,
            host: url.host,
            path: url.pathname + url.search + url.hash,
            method: "GET",
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
                  return `/proxy/${Buffer.from(text).toString("base64")}/sval/${sval}`;
                else
                  return text;
              });
              remoteRes
                .on("error", () => [filter, res].forEach(s => s.destroy()))
                .pipe(filter)
                .pipe(res)
                .on("error", () => [filter, remoteRes].forEach(s => s.destroy()))
                .on("close", () => [filter, remoteRes].forEach(s => s.destroy()))
              ;
            }else if(format.isDashMPD){
              if(headers["content-length"]) delete headers["content-length"];
              headers["content-type"] = "application/dash+xml";
              const chunks = [] as Buffer[];
              remoteRes
                .on("data", (chunk) => chunks.push(Buffer.from(chunk)))
                .on("end", () => {
                  const mpd = Buffer.concat(chunks).toString("utf-8")
                    .replace(/<BaseURL>(.+?)<\/BaseURL>/g, baseUrl => {
                      const encoded = Buffer.from(baseUrl.match(/<BaseURL>(?<url>.+?)<\/BaseURL>/).groups["url"]).toString("base64");
                      return `<BaseURL>${new URL(req.headers.referer).origin}/proxy/${encoded}/sval/${sval}/</BaseURL>`
                    });
                  res.end(mpd);
                })
                .on("error", () => [remoteRes, res].forEach(s => s.destroy()))
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
      }else{
        const aformat = ytdl.chooseFormat(info.formats, {
          filter: "audio", quality: "highestaudio"
        });
        const ffmpeg = new FFmpeg({args: [
          '-reconnect', '1', 
          '-reconnect_streamed', '1', 
          '-reconnect_on_network_error', '1', 
          '-reconnect_on_http_error', '4xx,5xx', 
          '-reconnect_delay_max', '30', 
          '-analyzeduration', '0', 
          '-loglevel', '0', 
          '-y',
          '-user_agent', ytUserAgent,
          '-i', vformat.url,
          '-i', aformat.url,
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-vcodec', 'copy',
          '-f', vformat.container
        ]});
        res.writeHead(200, {"Content-Type": `video/${vformat.container}`});
        res.flushHeaders();
        ffmpeg
          .on("error", () => ffmpeg.destroy())
          .pipe(res)
          .on("error", () => ffmpeg.destroy())
          .on("close", () => ffmpeg.destroy())
          ;
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