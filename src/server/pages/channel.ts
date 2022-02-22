import { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import * as ytpl from "ytpl";
import * as miniget from "miniget";
import { SessionManager } from "../session";
import { generateHash, parseCookie, respondError, searchCardTemplate } from "../util";

const template = fs.readFileSync(path.join(__dirname, "../../common/channel.html"), {encoding:"utf-8"});

export async function handleChannel(req:Request, res:Response){
  const channelId = req.query["cid"]?.toString();
  const sid = req.query["sid"]?.toString();
  const from = Number(req.query["from"]?.toString() || 0) || 0;
  const cookie = req.headers.cookie && parseCookie(req.headers.cookie);
  const key = cookie && cookie.A_SID;
  const sval = req.query["sval"]?.toString();
  const session = key && SessionManager.instance.update(key);
  let SID_CACHE = session && session.channel;
  if(!sval || !session || session.value !== sval){
    respondError(res, "セッションが切れているか、URLが無効です。", 401);
    return;
  }
  SessionManager.instance.revokeToken(key);
  session.watch = {};
  if(channelId){
    SID_CACHE = session.channel = {};
    const hash = generateHash(channelId);
    SID_CACHE[hash] = {
      cid: channelId,
      continuation: null,
      items:[],
      channelUrl:null,
      channel:null,
      channelName:null,
      channelThumb:null,
    };
    res.writeHead(301, {
      "Location": `/channel?sid=${hash}&sval=${sval}`,
      "Cache-Control": "no-store"
    });
    res.end();
  }else if(sid && SID_CACHE[sid]){
    if(SID_CACHE[sid].items.length === 0){
      if(from){
        res.writeHead(301, {
          "Location": `/channel?sid=${sid}&sval=${sval}`,
          "Cache-Control": "no-store"
        });
        res.end();
        return;
      }
      const result = await ytpl.default(SID_CACHE[sid].cid, {gl:"JP", hl:"ja", limit:30, pages:1}).catch(() => null);
      if(!result) {
        respondError(res, `<a href="${SID_CACHE[sid].cid}" target="_blank" referrerpolicy="no-referrer" rel="noreferrer noopener">指定されたチャンネル</a>は見つかりませんでした。`, 404);
        return;
      }
      SID_CACHE[sid].continuation = result.continuation;
      SID_CACHE[sid].channelUrl = "https://www.youtube.com/channel/" + result.author.channelID;
      SID_CACHE[sid].channelName = result.author.name;
      SID_CACHE[sid].channelThumb = result.author.bestAvatar.url;
      const html = await miniget.default(SID_CACHE[sid].channelUrl + "/about").text();
      const json = html.match(/<script nonce=".+?">var\s*ytInitialData\s*=\s*(?<json>\{.+?\});<\/script>/).groups?.json;
      json && (SID_CACHE[sid].channel = JSON.parse(json));
      SID_CACHE[sid].items.push(...result.items);
    }else if(SID_CACHE[sid].continuation && from && SID_CACHE[sid].items.length < from + 20){
      const result = await ytpl.continueReq(SID_CACHE[sid].continuation);
      SID_CACHE[sid].continuation = result.continuation;
      SID_CACHE[sid].items.push(...result.items);
      if(SID_CACHE[sid].items.length < from){
        res.writeHead(301, {
          "Location": `/channel?sid=${sid}&sval=${sval}`,
          "Cache-Control": "no-store"
        });
        res.end();
        return;
      }
    }
    const { items, channel, channelName, channelThumb, continuation} = SID_CACHE[sid];
    const subscriber = channel && channel.header.c4TabbedHeaderRenderer.subscriberCountText?.simpleText;
    const views = channel && channel.contents.twoColumnBrowseResultsRenderer.tabs[5]?.tabRenderer?.content?.sectionListRenderer.contents[0]?.itemSectionRenderer.contents[0]?.channelAboutFullMetadataRenderer.viewCountText.simpleText;
    const description = channel && channel.contents.twoColumnBrowseResultsRenderer.tabs[5]?.tabRenderer?.content?.sectionListRenderer.contents[0]?.itemSectionRenderer.contents[0]?.channelAboutFullMetadataRenderer.description.simpleText;
    const banner = channel && channel.header.c4TabbedHeaderRenderer.banner?.thumbnails[0]?.url;
    res.writeHead(200, {"Cotent-Type": "text/html; charset=UTF-8"});
    res.end(generateHtml(template, sid, items, from, channelName, channelThumb, subscriber, description, views, banner, sval, !!continuation || from + 20 < items.length));
  }
}

function generateHtml(template:string, sid:string, items:ytpl.Item[], from:number, channel:string, channel_thumb:string, subscriber:string, description:string, views:string, banner:string, sval:string, cont:boolean){
  const cardHtml = searchCardTemplate;
  let cards = "";
  let cardnum = 0;
  for(let i = from; i < items.length && i < from + 20; i++){
    const item = items[i];
    const description = (()=>{
      if(item.isLive)
        return "長さ: ライブストリーム";
      else
        return "長さ: " + item.duration;
    })();
    cards += cardHtml
      .replace(/{url}/g, "/watch?v=" + item.id + "&sval=" + sval)
      .replace(/{thumb}/, "/proxy?url=" + encodeURIComponent(item.thumbnails[0].url) + "&sval=" + sval)
      .replace(/{title}/, item.title)
      .replace(/{channel_thumb}/, "/proxy?url=" + encodeURIComponent(channel_thumb) + "&sval=" + sval)
      .replace(/{channel}/, item.author.name)
      .replace(/{description}/, description.length > 200 ? description.substring(0, 200) : description)
    ;
    cardnum++;
  }
  const result = template
    .replace(/{channel_banner}/, banner ? `<img src="/proxy?url=${encodeURIComponent(banner)}&sval=${sval}" class="channel_banner">` : "")
    .replace(/{channel_thumb}/, `/proxy?url=${encodeURIComponent(channel_thumb)}&sval=${sval}`)
    .replace(/{channel}/, channel)
    .replace(/{sval}/, sval)
    .replace(/{pages}/, `<p>${from + 1}～${from + cardnum}件目を表示しています。</p>`)
    .replace(/{channel_videos}/, cards)
    .replace(/{summary}/, (description || "").replace(/\r\n/g, "\r").replace(/\r/g, "\n").replace(/\n/g, "<br>"))
    .replace(/{views}/, views)
    .replace(/{subs}/ ,(subscriber || ""))
    .replace(/{continue}/, cont ? `<a class="no_link" href="/channel?sid=${sid}&sval=${sval}&from=${from + 20}">さらに読み込む</a>` : "")
  ;
  return result;
}