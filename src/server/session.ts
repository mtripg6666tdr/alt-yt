import type * as ytdl from "ytdl-core";
import type * as ytsr from "ytsr";
import type * as ytpl from "ytpl";

import { generateHash, generateRandomNumber } from "./util";
import { ytChannelAbout } from "./@types/yt-channel";

type SessionData = {
  lastAccess:Date;
  value:string;
  token:string[];
  search:{[sid:string]:{
    search:Promise<ytsr.Result>,
    query:string,
  }};
  watch:{[sid:string]:{
    vid:string;
    info:Promise<ytdl.videoInfo>;
    format:ytdl.videoFormat;
    vformat:ytdl.videoFormat;
    aformat:ytdl.videoFormat;
    key:string;
  }};
  channel:{[sid:string]:{
    cid:string;
    continuation:ytpl.Continuation;
    items:ytpl.Item[];
    channelUrl:string;
    channel:ytChannelAbout;
    channelName:string;
    channelThumb:string;
  }};
};
export class SessionManager {
  private constructor(){
    setInterval(() => {
      (Object.keys(this.sessions) as (keyof typeof this.sessions)[]).forEach(key => {
        if(this.sessions[key].lastAccess.getTime() - Date.now() >= 10 * 60 * 1000){
          delete this.sessions[key];
        }
      })
    }, 5 * 60 * 1000);
  }
  private static _instance = null as SessionManager;
  private sessions = {} as {[key:string]:SessionData};

  static get instance():SessionManager{
    return SessionManager._instance || (SessionManager._instance = new SessionManager());
  }

  register(){
    const key = generateHash(generateRandomNumber().toString());
    this.sessions[key] = {
      lastAccess: new Date(),
      value: generateHash(generateRandomNumber().toString()),
      token: [],
      watch: Object.create(null),
      search: Object.create(null),
      channel: Object.create(null),
    };
    return key;
  }
  
  get(key:string):SessionData|undefined{
    if(!this.sessions[key]) return undefined;
    if(this.sessions[key].lastAccess.getTime() - Date.now() >= 10 * 60 * 1000){
      delete this.sessions[key];
    }
    return this.sessions[key];
  }

  unregister(key:string):boolean{
    if(!this.sessions[key]) return false;
    delete this.sessions[key];
    return true;
  }

  update(key:string):SessionData|undefined{
    if(!this.sessions[key]) {
      return undefined;
    }else if(this.sessions[key].lastAccess.getTime() - Date.now() >= 1 * 60 * 60 * 1000){
      delete this.sessions[key];
      return undefined;
    }
    this.sessions[key].lastAccess = new Date();
    return this.sessions[key];
  }

  createTokenFor(key:string):string|null{
    const session = this.get(key);
    if(!session) return null;
    const token = generateHash(generateRandomNumber().toString());
    session.token.push(token);
    return token;
  }

  revokeToken(key:string):boolean{
    const session = this.get(key);
    if(!session) return false;
    session.token = [];
    return true;
  }

  validateToken(key:string, token:string){
    const session = this.get(key);
    return session && session.token.findIndex(t => t === token) >= 0;
  }
}