import * as fs from "fs";
import * as path from "path";
import express from "express";
import { parseCookie, respondError } from "./util";
import { handleProxy } from "./pages/proxy";
import { handleSearch } from "./pages/search";
import { handleFetch, handlePlayback, handleWatch } from "./pages/watch";
import { SessionManager } from "./session";
import { handleAlive } from "./pages/alive";
import { handleChannel } from "./pages/channel";

const topPageTemplate = fs.readFileSync(path.join(__dirname, "../common/index.html"), {encoding:"utf-8"});
const authPageTemplate = fs.readFileSync(path.join(__dirname, "../common/auth.html"), {encoding: "utf-8"});
const style = fs.readFileSync(path.join(__dirname, "../common/style.css"), {encoding: "utf-8"});
const script = fs.readFileSync(path.join(__dirname, "../common/common.js"), {encoding: "utf-8"});

export function createServer(){
  const app = express();
  app
    .use(express.urlencoded({extended:true}))
    .get("/style.css", (req, res) => {
      try{
        res.writeHead(200, {
          "Content-Type": "text/css; charset=UTF-8",
          "Cache-Control": "max-age=86400, private"
        });
        res.end(style);
      }
      catch(e){
        respondError(res, e.toString(), 500);
      }
    })
    .get("/common.js", (req, res) => {
      try{
        res.writeHead(200, {
          "Content-Type": "text/javascript; charset=UTF-8",
          "Cache-Control": "max-age=86400, private"
        });
        res.end(script);
      }
      catch(e){
        respondError(res, e.toString(), 500);
      }
    })
    .get("/robots.txt", (req, res) => {
      try{
        res.writeHead(200, {
          "Content-Type": "text/plain",
          "Cache-Control": "max-age=86400",
        });
        res.end("User-agent: *\r\nDisallow: /");
      }catch(e){
        respondError(res, e.toString(), 500);
      }
    })
    .get("/proxy", (req, res) => handleProxy(req, res))
    .use("/proxy/:url/sval/:sval", (req, res, next) => {
      if(req.method === "GET") 
        handleProxy(req, res);
      else
        next();
    })
    .get("/search", (req, res) => handleSearch(req, res))
    .get("/channel", (req, res) => handleChannel(req, res))
    .get("/watch", (req, res) => handleWatch(req, res))
    .get("/video_fetch", (req, res) => handleFetch(req, res))
    .get("/video", (req, res) => handlePlayback(req, res))
    .get("/alive", (req, res) => handleAlive(req, res))
    .use("/", (req, res) => {
      if((req.url === "/" || req.url.startsWith("/?sval=")) && !req.headers["user-agent"].toLowerCase().includes("bot")){
        const sval = req.query["sval"]?.toString();
        const cookie = req.headers.cookie && parseCookie(req.headers.cookie);
        const key = cookie && cookie.A_SID;      
        if(sval && SessionManager.instance.get(key)?.value === sval && SessionManager.instance.update(key)){
          try{
            res.writeHead(200, {"Content-Type": "text/html; charset=UTF-8",});
            res.end(topPageTemplate.replace(/{sval}/g, SessionManager.instance.get(key).value));
          }
          catch(e){
            respondError(res, e.toString());
          }
        }else if(req.method.toLowerCase() === "post" && req.body.key === process.env.PW){
          const cookie = req.headers.cookie && parseCookie(req.headers.cookie);
          let ur = false;
          if(cookie && cookie.A_SID){
            ur = SessionManager.instance.unregister(cookie.A_SID);
          }
          const session = SessionManager.instance.register();
          res.writeHead(301, {
            "Location": "/?sval=" + SessionManager.instance.get(session).value,
            "Set-Cookie": `A_SID=${session}; HttpOnly`,
            "X-Revoked-Auth": +ur
          });
          res.end();
        }else{
          const cookie = req.headers.cookie && parseCookie(req.headers.cookie);
          let ur = false;
          if(cookie && cookie.A_SID){
            ur = SessionManager.instance.unregister(cookie.A_SID);
          }
          res.writeHead(200, {
            "Content-Type": "text/html; charset=UTF-8",
            "X-Revoked-Auth": +ur
          });
          res.end(authPageTemplate.replace(/{revokeResult}/, ur ? "✅セッションを終了しました" : ""));
        }
      }else{
        res.writeHead(403);
        res.end("Forbidden");
      }
    })
  return app;
}