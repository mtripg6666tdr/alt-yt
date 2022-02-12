import * as fs from "fs";
import * as path from "path";
import { Response } from "express";
import { SHA256 } from "crypto-js";
import * as ytdl from "ytdl-core";

export const errorTemplate = fs.readFileSync(path.join(__dirname, "../common/error.html"), {encoding:"utf-8"});

export const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.99 Safari/537.36";

export const ytUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.101 Safari/537.36";

export function respondError(res:Response, message:string, status:number = 500){
  res.writeHead(status, {"Content-Type": "text/html; charset=UTF-8"});
  res.end(errorTemplate.replace(/{message}/, status + "<br>" + message));
}

export function CalcHourMinSec(seconds:number){
  const sec = seconds % 60;
  const min = (seconds - sec) / 60 % 60;
  const hor = ((seconds - sec) / 60 - min) / 60;
  return [hor.toString(), AddZero(min.toString(), 2), AddZero(sec.toString(), 2)];
}

export function AddZero(str:string, length:number){
  if(str.length >= length) return str;
  while(str.length < length){
    str = "0" + str;
  }
  return str;
}

export function generateRandomNumber(){
  return Math.floor(new Date().getTime() * Math.random());
}

export function parseCookie(cookie:string){
  const cookies = {} as {[key:string]:string};
  cookie.split(";").map(kv => kv.split("=").map(k => k.trim())).forEach(keyval => {
    cookies[keyval[0]] = keyval[1];
  })
  return cookies;
}

export function insertAnchers(html:string, sval:string){
  return html.replace(/https?(:\/\/[\w\/:%#\$&@\?~\.=\+\-]+)/g, url => {
    const replace = ytdl.validateURL(url);
    return `<a href="${replace ? `/watch?v=${ytdl.getURLVideoID(url)}&sval=${sval}` : url}" class="no_link" ${replace ? "" : `target="_blank" referrerpolicy="no-referrer" rel="noreferrer noopener"`}>${url}</a>`;
  });
}

export function generateHash(text:string){
  return SHA256(SHA256(text).toString()).toString();
}
