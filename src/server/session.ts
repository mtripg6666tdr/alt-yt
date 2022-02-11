import * as ytdl from "ytdl-core";
import * as ytsr from "ytsr";
import { generateHash, generateRandomNumber } from "./util";

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
    key:string;
  }};
};
export class SessionManager {
  private constructor(){
    //
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
      watch: {},
      search: {},
    };
    return key;
  }
  
  get(key:string):SessionData|undefined{
    if(this.sessions[key].lastAccess.getTime() - Date.now() >= 1 * 60 * 60 * 1000){
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

  createToken(key:string):string|null{
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