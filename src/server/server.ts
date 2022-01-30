import * as fs from "fs";
import * as path from "path";
import express from "express";
import { respondError } from "./util";
import { handleProxy } from "./pages/proxy";
import { handleSearch } from "./pages/search";
import { handleFetch, handlePlayback, handleWatch } from "./pages/watch";

export function createServer(){
  const app = express();
  app
    .get("/style.css", (req, res) => {
      try{
        const style = fs.readFileSync(path.join(__dirname, "../common/style.css"), {encoding: "utf-8"});
        res.writeHead(200, {"Content-Type": "text/css; charset=UTF-8"});
        res.end(style);
      }
      catch(e){
        respondError(res, e.toString(), 500);
      }
    })
    .get("/common.js", (req, res) => {
      try{
        const script = fs.readFileSync(path.join(__dirname, "../common/common.js"), {encoding: "utf-8"});
        res.writeHead(200, {"Content-Type": "text/javascript; charset=UTF-8"});
        res.end(script);
      }
      catch(e){
        respondError(res, e.toString(), 500);
      }
    })
    .get("/proxy", (req, res) => handleProxy(req, res))
    .get("/search", (req, res) => handleSearch(req, res))
    .get("/watch", (req, res) => handleWatch(req, res))
    .get("/video_fetch", (req, res) => handleFetch(req, res))
    .get("/video", (req, res) => handlePlayback(req, res))
    .use("/", (req, res) => {
      if(req.url === "/" || req.url === "/index.html"){
        try{
          const html = fs.readFileSync(path.join(__dirname, "../common/index.html"), {encoding:"utf-8"});
          res.writeHead(200, {"Content-Type": "text/html; charset=UTF-8"});
          res.end(html);
        }
        catch(e){
          respondError(res, e.toString(), 500);
        }
      }else{
        res.writeHead(404, {"Location": "/"});
        res.end();
      }
    })
  return app;
}