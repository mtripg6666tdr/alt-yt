import * as fs from "fs";
import * as path from "path";
import { http, https } from "follow-redirects";
import { Request, Response } from "express";
import { SHA256 } from "crypto-js";
import { FFmpeg } from "prism-media";
import * as ytdl from "ytdl-core";
import { CalcHourMinSec, generateRandomNumber, respondError, ytUserAgent } from "../util";

const SID_CACHE = {} as {[sid:string]:{
  vid:string;
  info:Promise<ytdl.videoInfo>;
  format:ytdl.videoFormat;
  vformat:ytdl.videoFormat;
  key:string;
}};
const tempalte = fs.readFileSync(path.join(__dirname, "../../common/watch.html"), {encoding:"utf-8"});

export async function handleWatch(req:Request, res:Response){
  try{
    const vid = req.query["v"]?.toString();
    const sid = req.query["sid"]?.toString();
    const hr = req.query["hr"]?.toString() === "on";
    if(vid){
      const hash = SHA256(vid).toString();
      SID_CACHE[hash] = {
        vid,
        info: ytdl.getInfo(`https://www.youtube.com/watch?v=${vid}`, {
        }).catch(e => e.toString()),
        key: SHA256(generateRandomNumber().toString()).toString(),
        format: null,
        vformat: null,
      };
      res.writeHead(301, {
        "Location": "/watch?sid=" + hash + (hr ? "&hr=on" : ""),
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
      const html = generateHtml(tempalte, result, result.related_videos);
      res.writeHead(200, {"Content-Type": "text/html; charset=UTF-8"});
      res.end(html);
    }else{
      throw "不正なアクセスです";
    }
  }
  catch(e){
    respondError(res, e.toString(), 500);
  }
}

function generateHtml(template:string, info:ytdl.videoInfo, items:ytdl.relatedVideo[]){
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
    const description = "長さ:" + duration + ", " + (item.view_count || "不明") + "回視聴, アップロード:" + (item.published || "不明");
    cards += cardHtml
      .replace(/{url}/, "/watch?v=" + item.id)
      .replace(/{thumb}/, "proxy?url=" + encodeURIComponent(item.thumbnails[0].url))
      .replace(/{title}/, item.title)
      .replace(/{channel_thumb}/, "proxy?url=" + encodeURIComponent(item.thumbnails[0].url))
      .replace(/{channel}/, typeof item.author === "string" ? item.author : item.author.name)
      .replace(/{description}/, description.length > 200 ? description.substring(0, 200) : description)
    ;
  }
  const subscriber = (function(count){
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
    .replace(/{title}/, info.videoDetails.title)
    .replace(/{channel_url}/, info.videoDetails.author.channel_url)
    .replace(/{channel_thumb}/, info.videoDetails.author.thumbnails[0].url)
    .replace(/{channel}/, info.videoDetails.author.name)
    .replace(/{channel_subscribe}/, info.videoDetails.author.channel_url + "?sub_confirmation=1")
    .replace(/{channel_subscriber}/, subscriber)
    .replace(/{summary}/, info.videoDetails.description.replace(/\r\n/g, "\r").replace(/\r/g, "\n").replace(/\n/g, "<br>"))
    .replace(/{meta_info}/, (info.videoDetails.viewCount || "不明") + "回視聴, " + (info.videoDetails.uploadDate || "アップロード時不明") + `<br>URL: <a href="${info.videoDetails.video_url}" class="no_link" target="_blank">${info.videoDetails.video_url}</a>`)
    .replace(/{related_content}/, cards)
  ;
  return result;
}

export async function handleFetch(req:Request, res:Response){
  try{
    const sid = req.query["sid"]?.toString();
    const hr = req.query["hr"]?.toString() === "on";
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
          length: Number(info.videoDetails.lengthSeconds)
        }));
      }else{
        const format = SID_CACHE[sid].format = ytdl.chooseFormat(info.formats, {
          filter: "audioandvideo", quality: "highest"
        });
        res.writeHead(200, {"Content-Type": "application/json; charset=UTF-8"});
        res.end(JSON.stringify({
          key: SID_CACHE[sid].key,
          format: `video/${format.container}`
        }));
      }
    }else{
      respondError(res, "不正なアクセスです");
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
    if(sid && SID_CACHE[sid] && key && SID_CACHE[sid].key === key){
      const { info:pinfo, format, vformat } = SID_CACHE[sid];
      if(!req.headers.referer || !req.headers.referer.includes("sid=" + sid)){
        respondError(res, "不正なアクセスです");
        return;
      }
      const info = await pinfo;
      if(info.videoDetails.liveBroadcastDetails && info.videoDetails.liveBroadcastDetails.isLiveNow){
        respondError(res, "Live stream is currently not supported");
        return;
      }else if(!hr){
        const url = new URL(format.url);
        ({"http:": http, "https:": https})[url.protocol].request({
          protocol: url.protocol,
          host: url.host,
          path: url.pathname + url.search + url.hash,
          method: "GET",
          headers: {
            "User-Agent": ytUserAgent
          }
        }, remoteRes => {
          res.writeHead(remoteRes.statusCode, remoteRes.headers);
          res.flushHeaders();
          remoteRes
            .on("error", () => res.end())
            .on("close", () => res.end())
            .pipe(res)
            .on("close", () => remoteRes.destroy())
          ;
        })
        .on("error", (e) => {
          respondError(res, e.toString());
        })
        .end();
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
    respondError(res, e.toString());
  }
}