import type { Request, Response } from "express";
import * as path from "path";
import * as fs from "fs";
import * as ytdl from "ytdl-core";
import * as ytsr from "ytsr";
import sha256 from 'crypto-js/sha256';
import { parseCookie, respondError } from "../util";
import { SessionManager } from "../session";

const template = fs.readFileSync(path.join(__dirname, "../../common/search.html"), {encoding:"utf-8"});

export async function handleSearch(req:Request, res:Response){
  try{
    const query = req.query["q"]?.toString();
    const sid = req.query["sid"]?.toString();
    const hr = req.query["hr"]?.toString() === "on";
    const cookie = req.headers.cookie && parseCookie(req.headers.cookie);
    const key = cookie && cookie.A_SID;
    const sval = req.query["sval"]?.toString();
    const session = key && SessionManager.instance.update(key);
    let SID_CACHE = session && session.search;
    if(!sval || !session || session.value !== sval){
      respondError(res, "セッションが切れているか、URLが無効です。", 401);
      return;
    }
    SessionManager.instance.revokeToken(key);
    if(query){
      if(ytdl.validateURL(query)){
        const id = ytdl.getURLVideoID(query);
        res.writeHead(301, {
          "Location": "/watch?v=" + id + "&sval=" + sval + (hr ? "&hr=on" : ""),
        });
        res.end();
        return;
      }
      SID_CACHE = session.search = {};
      const hash = sha256(query).toString();
      SID_CACHE[hash] = {
        search: ytsr.default(query, {gl: "JP", hl: "ja", limit: 30}).catch(e => e.toString()),
        query
      };
      res.writeHead(301, {
        "Location": "/search?sid=" + hash + "&sval=" + sval + (hr ? "&hr=on" : ""),
        "Cache-Control": "no-store",
      });
      res.end();
    }else if(sid && SID_CACHE[sid]){
      const { search, query } = SID_CACHE[sid];
      const result = await search;
      if(typeof result === "string"){
        respondError(res, result, 500);
        return;
      }
      const items = result.items.filter(i => i.type === "video" && !i.isUpcoming);
      const html = generateHtml(template, query, items, hr, sval);
      res.writeHead(200, {"Cotent-Type": "text/html; charset=UTF-8"});
      res.end(html);
    }else{
      respondError(res, "不正なアクセスです", 403);
    }
  }
  catch(e){
    respondError(res, e.toString());
  }
}

function generateHtml(template:string, query:string, items:ytsr.Item[], hr:boolean, sval:string){
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
    const item = items[i] as ytsr.Video;
    const description = (()=>{
      if(item.isLive || item.badges.includes("ライブ配信中"))
        return "長さ:ライブストリーム, " + item.views + "人が視聴中<br>" + (item.description?.replace(/\r\n/g, "\r").replace(/\r/g, "\n").replace(/\n/g, " ") || "")
      else
        return "長さ:" + item.duration + ", " + item.views + "回視聴, " + item.uploadedAt + "<br>" + (item.description?.replace(/\r\n/g, "\r").replace(/\r/g, "\n").replace(/\n/g, " ") || "");
    })();
    cards += cardHtml
      .replace(/{url}/, "/watch?v=" + item.id + "&sval=" + sval + (hr ? "&hr=on" : ""))
      .replace(/{thumb}/, "proxy?url=" + encodeURIComponent(item.thumbnails[0].url) + "&sval=" + sval)
      .replace(/{title}/, item.title)
      .replace(/{channel_thumb}/, "proxy?url=" + encodeURIComponent(item.author.avatars[0].url) + "&sval=" + sval)
      .replace(/{channel}/, item.author.name)
      .replace(/{description}/, description.length > 200 ? description.substring(0, 200) : description)
    ;
  }
  const result = template
    .replace(/{query}/, query)
    .replace(/{current_query}/, query)
    .replace(/{hr}/, hr ? "checked": "")
    .replace(/{sval}/, sval)
    .replace(/{search_result}/, cards)
  ;
  return result;
}