import http from "http";
import https from "https";
import type { Request, Response } from "express";
import { allowedDomains } from "../allowedDomain";
import { base64url, parseCookie, respondError, userAgent } from "../util";
import { SessionManager } from "../session";

export function handleProxy(req:Request, res:Response){
  try{
    const url = (()=>{
      if(req.query["url"]){
        return decodeURIComponent(req.query["url"].toString() || "")
      }else if(req.params["url"]){
        return base64url.decode(req.params["url"]) + (req.path.length > 1 ? req.path.substring(1) : "");
      }else
        throw null;
    })();
    const durl = new URL(url);
    const cookie = req.headers.cookie && parseCookie(req.headers.cookie);
    const key = cookie && cookie.A_SID;
    const sval = (req.query["sval"] || req.params["sval"])?.toString();
    const session = key && SessionManager.instance.update(key);
    if(!sval || !session || session.value !== sval){
      respondError(res, "セッションが切れているか、URLが無効です。", 401);
      return;
    }
    if(!req.headers.referer || !req.headers.referer.includes("sid=")){
      respondError(res, "不正なアクセスです", 403);
      return;
    }
    if(allowedDomains.some(regex => new RegExp(regex).test(durl.host))){
      const httpLib = {"http:": http, "https:": https};
      const headers:{[key:string]:string|string[]} = {
        "User-Agent": userAgent,
        "Accept": req.headers.accept || "*/*",
        "Accept-Encoding": req.headers["accept-encoding"],
        "Accept-Language": req.headers["accept-language"],
      };
      if(req.headers.range) headers["Range"] = req.headers.range;
      httpLib[durl.protocol as keyof typeof httpLib].request(url, {
        method: "GET",
        headers,
        agent: req.headers.connection === "keep-alive" ? new httpLib[durl.protocol as keyof typeof httpLib].Agent({keepAlive:true}) : undefined
      }, (reqres) => {
        const headers = Object.assign({}, reqres.headers);
        if(headers["set-cookie"]) delete headers["set-cookie"];
        if(headers["location"]) headers["Location"] = `/proxy/${base64url.encode(headers.location)}/sval/${sval}`;
        res.writeHead(reqres.statusCode, Object.assign({}, headers, {
          "X-AYP": "1",
          "Cache-Control": "max-age=86400, private"
        }));
        reqres
          .on("error", () => res.end())
          .pipe(res)
          .on("close", () => reqres.destroy())
      }).on("error", (e) => {
        respondError(res, e.toString());
      }).end();
    }else{
      console.log("Proxy: rejected host: " + durl.host);
      respondError(res, "Disallowed domain", 403);
    }
  }
  catch(e){
    respondError(res, e.toString());
  }
}