import { Request, Response } from "express";
import { SessionManager } from "../session";
import { parseCookie, respondError } from "../util";

export function handleAlive(req:Request, res:Response){
  try{
    const cookie = req.headers.cookie && parseCookie(req.headers.cookie);
    const key = cookie && cookie.A_SID;
    const sval = req.query["sval"]?.toString();
    const session = key && SessionManager.instance.update(key);
    if(sval && session){
      res.writeHead(204);
      res.end();
    }else{
      res.writeHead(400);
      res.end();
    }
  }
  catch(e){
    respondError(res, e.toString());
  }
}