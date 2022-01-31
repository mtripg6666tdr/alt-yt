import http from "http";
import https from "https";
import type { Request, Response } from "express";
import { allowedDomains } from "../allowedDomain";
import { parseCookie, respondError, userAgent } from "../util";
import { SessionManager } from "../session";

export function handleProxy(req:Request, res:Response){
  try{
    const url = decodeURIComponent(req.query["url"].toString());
    const durl = new URL(url);
    const cookie = req.headers.cookie && parseCookie(req.headers.cookie);
    const key = cookie && cookie.A_SID;
    const sval = req.query["sval"]?.toString();
    const session = key && SessionManager.instance.update(key);
    if(!sval || !session || session.value !== sval){
      respondError(res, "セッションが切れているか、URLが無効です。", 401);
      return;
    }
    if(allowedDomains.includes(durl.host)){
      ({"http:": http, "https:": https})[durl.protocol].request({
        protocol: durl.protocol,
        host: durl.host,
        path: durl.pathname,
        method: "GET",
        headers: {
          "User-Agent": userAgent
        }
      }, (reqres) => {
        const headers = reqres.headers;
        if(headers["set-cookie"]){
          delete headers["set-cookie"];
        }
        res.writeHead(reqres.statusCode, headers);
        reqres
        .on("data", (chunk) => {
          res.write(chunk);
        })
        .on("end", () => {
          res.end();
        })
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