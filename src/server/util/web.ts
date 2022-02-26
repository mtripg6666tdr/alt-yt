import * as ytdl from "ytdl-core";

export function parseCookie(cookie:string){
  const cookies = {} as {[key:string]:string};
  cookie.split(";").map(kv => kv.split("=").map(k => k.trim())).forEach(keyval => {
    cookies[keyval[0]] = keyval[1];
  })
  return cookies;
}

export function insertAnchers(html:string, sval:string){
  return html.replace(/https?(:\/\/[\w\/:%#\$&@\?~\.=\+\-]+)/g, url => {
    let result = url;
    let match = null as RegExpMatchArray;
    if(ytdl.validateURL(url)){
      result = `/watch?v=${ytdl.getURLVideoID(url)}&sval=${sval}`;
    }else if(match = url.match(/^https?:\/\/(www)?\.youtube\.com\/((channel|c|user)\/)?(?<id>[^/]+)$/)){
      result = `/channel?cid=${encodeURIComponent("https://www.youtube.com/c/" + match.groups.id)}&sval=${sval}`;
    }
    return `<a href="${result}" class="no_link" ${result !== url ? "" : `target="_blank" referrerpolicy="no-referrer" rel="noreferrer noopener"`}>${url}</a>`;
  });
}