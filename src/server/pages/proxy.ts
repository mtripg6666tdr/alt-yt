import http from "http";
import https from "https";
import type { Request, Response } from "express";
import { allowedDomains } from "../allowedDomain";
import { parseCookie, respondError, userAgent } from "../util";
import { SessionManager } from "../session";

export function handleProxy(req:Request, res:Response){
  try{
    const url = (()=>{
      if(req.query["url"]){
        return decodeURIComponent(req.query["url"].toString() || "")
      }else if(req.params["url"]){
        return Buffer.from(req.params["url"], "base64").toString() + (req.path.length > 1 ? req.path.substring(1) : "");
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
      httpLib[durl.protocol as keyof typeof httpLib].request({
        protocol: durl.protocol,
        host: durl.host,
        path: durl.pathname + durl.search + durl.hash,
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          "Accept": req.headers.accept || "*/*",
        },
        agent: req.headers.connection === "keep-alive" ? new httpLib[durl.protocol as keyof typeof httpLib].Agent({keepAlive:true}) : undefined
      }, (reqres) => {
        const headers = Object.assign({}, reqres.headers);
        if(headers["set-cookie"]) delete headers["set-cookie"];
        if(headers["location"]) headers["Location"] = `/proxy/${Buffer.from(headers.location).toString("base64")}/sval/${sval}`;
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