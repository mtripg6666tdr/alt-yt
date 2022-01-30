import http from "http";
import https from "https";
import type { Request, Response } from "express";
import { allowedDomains } from "../allowedDomain";
import { respondError, userAgent } from "../util";

export function handleProxy(req:Request, res:Response){
  try{
    const url = decodeURIComponent(req.query["url"].toString());
    const durl = new URL(url);
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
        res.writeHead(reqres.statusCode, reqres.headers);
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
      respondError(res, "Disallowed domain");
    }
  }
  catch(e){
    respondError(res, e.toString());
  }
}