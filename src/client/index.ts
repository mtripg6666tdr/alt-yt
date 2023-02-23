type Resolution = "high"|"normal"|"audio";
type VideoFetchInfo = {
  key: string,
  format: string,
  vcodec?:string,
  acodec?:string,
  vbitrate?:string,
  abitrate?:string,
  vlength?:string,
  alength?:string,
  vindexrange?:string,
  vinitrange?:string,
  aindexrange?:string,
  ainitrange?:string,
  ott: string,
  mode: "default"|"diy"|"upcoming",
  startIn: number,
  length?:number,
  request?:"ignore"|"ok",
}

(function(){
  const mpdTemplate = `
  <?xml version="1.0" encoding="UTF-8"?>
  <MPD xmlns="urn:mpeg:dash:schema:mpd:2011"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="urn:mpeg:dash:schema:mpd:2011 https://raw.githubusercontent.com/Dash-Industry-Forum/MPEG-Conformance-and-reference-source/master/conformance/MPDValidator/schemas/DASH-MPD.xsd"
    mediaPresentationDuration="PT$LENGTHS"
    minBufferTime="PT8.34S"
    type="static"
    profiles="urn:mpeg:dash:profile:isoff-on-demand:2011">
    <Period>
      <AdaptationSet
        mimeType="video/webm"
        segmentAlignment="true"
        startWithSAP="1">
        <Representation id="video/main" bandwidth="$VBITRATE" codecs="$VCODEC">
          <BaseURL>$VIDEO</BaseURL>
          <SegmentBase indexRange="$VINDEXRANGE">
            <Initialization range="$VINITRANGE" />
          </SegmentBase>
        </Representation>
      </AdaptationSet>
      <AdaptationSet
        mimeType="audio/webm"
        segmentAlignment="true"
        startWithSAP="1">
        <Representation id="audio/main" bandwidth="$ABITRATE" codecs="$ACODEC">
          <BaseURL>$AUDIO</BaseURL>
          <SegmentBase indexRange="$AINDEXRANGE">
            <Initialization range="$AINITRANGE" />
          </SegmentBase>
        </Representation>
      </AdaptationSet>
    </Period>
  </MPD>
  `
  window.addEventListener("load", () => {
    // 二重送信防止
    const inputs = [...document.getElementsByTagName("button")];
    let submited = false;
    [...document.getElementsByTagName("form")].forEach(form => {
      form.addEventListener("submit", () => inputs.forEach(input => input.disabled = true));
      if(!submited){
        submited = true;
        return true;
      }else{
        return false;
      }
    });
    [...document.getElementsByClassName("channel_a")].forEach((elem => {
      elem.addEventListener("click", (e:MouseEvent) => {
        e.preventDefault();
        window.location.href = elem.dataset.url!;
        return false;
      });
    }) as ((elem:HTMLBodyElement)=>void) as any)
    // 高画質の警告
    const hrCheckbox = document.getElementById("hr") as HTMLInputElement;
    if(hrCheckbox){
      hrCheckbox.addEventListener("change", () => {
        if(hrCheckbox.checked) window.alert("高画質モードが選択されました。\r\n高画質モードでは、バッファリングが長くなったり、シークができなくなったりすることがあるため、高画質モードはおすすめしていません。続行しますか。");
      });
    }
    // パラメーター解析
    const searchParams = Object.create(null) as {[key:string]:string};
    window.location.search
      .substring(1)
      .split("&")
      .map(p => p.split("=").map(t => decodeURIComponent(t)))
      .forEach(q => searchParams[q[0]] = q[1]);
    // 再生ページの処理
    if(window.location.pathname.startsWith("/watch") || window.location.pathname.startsWith("/common/watch")){
      const detailedButton = document.getElementsByClassName("detailed_button")[0];
      const detailedModal = document.getElementsByClassName("detailed_modal")[0];
      const detailedModalBg = document.getElementsByClassName("detailed_modal_bg")[0];
      const controlsContainer = document.getElementById("v_controls")!;
      // get resolution setting from search param
      let currentResolution:Resolution = searchParams.resolution as Resolution;
      const localStorageResolutionKey = "_vid_resolution";
      // if not defined, then try to get it from the local storage
      if(!currentResolution){
        currentResolution = window.localStorage.getItem(localStorageResolutionKey) as Resolution;
      }
      // fallback to the default value.
      if(!["high", "normal", "audio"].includes(currentResolution)){
        currentResolution = "normal";
      }
      window.localStorage.setItem(localStorageResolutionKey, currentResolution);
      const initPlayer = (src:string, format:string, requestResult?:"ignore"|"ok", length:number = 0) => {
        // 画質切り替え
        const resolutionSelect = document.createElement("select");
        const highOption = document.createElement("option");
        highOption.value = "high";
        highOption.textContent = "高画質";
        if("MediaSource" in window && (!window.MediaSource.isTypeSupported("video/webm; codecs=vp9") || !window.MediaSource.isTypeSupported("video/webm; codecs=opus"))){
          highOption.disabled = true;
        }
        const normalOption = document.createElement("option");
        normalOption.value = "normal";
        normalOption.textContent = "通常";
        const audioOption = document.createElement("option");
        audioOption.value = "audio";
        audioOption.textContent = "オーディオのみ";
        resolutionSelect.append(highOption, normalOption, audioOption);
        resolutionSelect.value = currentResolution;
        controlsContainer.appendChild(resolutionSelect);
        resolutionSelect.addEventListener("change", () => {
          console.log(resolutionSelect.value);
          const newQuery = Object.assign(Object.create(null), searchParams);
          newQuery.resolution = resolutionSelect.value;
          const queryString = Object.keys(newQuery).map(key => `${key}=${encodeURIComponent(newQuery[key])}`).join("&");
          window.location.search = "?" + queryString;
        });
        let resDes = "対応している動画に対して設定が適用されます。";
        if(requestResult === "ignore"){
          resDes += "なお、この動画は非対応です。";
        }
        const resDesp = document.createElement("p");
        resDesp.textContent = resDes;
        controlsContainer.appendChild(resDesp);
        // 動画準備
        if(!videojs) return;
        // @ts-ignore
        const videoPlayer = videojs("video_player") as videojs.VideoJsPlayer;
        // ループボタンのセットアップ
        const loopButton = videoPlayer.controlBar.addChild("button");
        const loopButtonElem = loopButton.el() as HTMLElement;
        const loopIcon = document.createElement("span");
        loopIcon.style.fontSize = "1.8em";
        loopIcon.style.lineHeight = "1.67";
        loopIcon.innerHTML = "&#8635";
        loopButtonElem.style.cursor = "pointer";
        loopButtonElem.style.flex = "none";
        loopButtonElem.appendChild(loopIcon);
        const localStorageLoopKey = "_vid_loop";
        loopButton.on("click", () => {
          const old = videoPlayer.loop();
          videoPlayer.loop(!old);
          loopIcon.classList[old ? "remove" : "add"]("loop_enable");
          window.localStorage.setItem(localStorageLoopKey, old ? "off" : "on");
        });
        const loopEnabledBefore = window.localStorage.getItem(localStorageLoopKey) === "on";
        if(loopEnabledBefore){
          loopButtonElem.click();
        }
        // 再生準備
        videoPlayer.src({src, type: format});
        videoPlayer.one("play", () => {
          if(length > 0){
            videoPlayer.duration(length);
          }
          if(format.startsWith("audio/")){
            videoPlayer.userActive(true);
            const rawPlayerContainer = document.getElementsByClassName("player")[0] as HTMLDivElement;
            videoPlayer.options_.inactivityTimeout = 0;
            if(rawPlayerContainer){
              rawPlayerContainer.style.height = rawPlayerContainer.clientHeight + "px";
              rawPlayerContainer.style.transition = "height 0.3s ease-in-out";
              rawPlayerContainer.style.height = document.getElementsByClassName("vjs-control-bar")[0].clientHeight + "px";
            }
          }
        });
        // かさね要素
        const videoCover = document.createElement("div");
        videoCover.classList.add("video_cover");
        videoCover.addEventListener("click", ()=>{
          if(format.startsWith("audio/")) return;
          if(videoPlayer.userActive()){
            if(videoPlayer.paused()) 
              videoPlayer.play();
            else 
              videoPlayer.pause();
          }else{
            videoPlayer.userActive(true);
          }
        });
        document.getElementById("video_player")!.appendChild(videoCover);
        // バッファ情報表示
        const rawVideoPlayer = document.getElementsByTagName("video")[0];
        let bufShow = false;
        let interval = -1;
        let bufElem = document.createElement("div");
        document.body.appendChild(bufElem);
        bufElem.style.position = "fixed";
        bufElem.style.top = "0px"
        bufElem.style.right = "0px";
        bufElem.style.zIndex = "999";
        bufElem.style.display = "none";
        bufElem.textContent = "Buffered: -s";
        const button = document.createElement("button");
        button.textContent = "バッファ情報を表示";
        button.style.fontSize = "50%";
        controlsContainer.appendChild(button);
        button.addEventListener("click", () => {
          if(bufShow){
            clearInterval(interval);
            bufElem.style.display = "none";
            button.textContent = "バッファ情報を表示";
            bufShow = false;
          }else{
            // @ts-ignore
            interval = setInterval(()=>{
              const current = rawVideoPlayer.currentTime;
              for(let i = 0; i < rawVideoPlayer.buffered.length; i++){
                const start = rawVideoPlayer.buffered.start(i);
                const end = rawVideoPlayer.buffered.end(i);
                if(start <= current && current <= end){
                  bufElem.textContent = "Buffered: " + Math.floor((end - current) * 100) / 100 + "s";
                  break;
                }
              }
            }, 1000);
            bufElem.style.display = "block";
            button.textContent = "バッファ情報を隠す";
            bufShow = true;
          }
        });
      };
      let detailedOpened = false;
      if(detailedButton){
        [detailedButton, detailedModalBg].forEach(elem => {
          elem.addEventListener("click", () => {
            [detailedButton, detailedModal, detailedModalBg].forEach(elem => {
              elem.classList[detailedOpened ? "remove" : "add"]("opened");
            });
            const span = detailedButton.children[0];
            if(span){
              span.textContent = detailedOpened ? "▲詳細情報" : "▼詳細情報を閉じる";
            }
            detailedOpened = !detailedOpened;
          });
        });
      }
      if(window.location.search.length > 0){
        window.fetch(`/video_fetch?sid=${searchParams.sid}&sval=${searchParams.sval}&resolution=${currentResolution}`)
        .then(res => { 
          if(res.status !== 200){
            throw "動画の取得中に問題が発生しました: " + res.status
          }
          return res.json();
        })
        .then((json:VideoFetchInfo) => {
          if(json.mode === "default"){
            const playbackUrl = `/video?sid=${searchParams.sid}&key=${json.key}&sval=${searchParams.sval}&ott=${json.ott}&type=${currentResolution}`;
            initPlayer(playbackUrl, json.format, json.request, json.length);
          }else if(json.mode === "upcoming"){
            const container = document.getElementById("video_player")!;
            const p = document.createElement("div");
            const target = new Date(Date.now() + json.startIn);
            p.textContent = `${target.getFullYear()}/${target.getMonth() + 1}/${target.getDate()} ${target.getHours()}:${target.getMinutes()}:${target.getSeconds()} 公開予定`;
            p.style.lineHeight = container.clientHeight + "px";
            p.style.fontSize = "1rem";
            container.appendChild(p);
            const button = (document.getElementsByClassName("vjs-big-play-button")[0] as HTMLDivElement|undefined);
            if(button){
              button.style.opacity = "0.4";
              button.style.pointerEvents = "none";
            }
            const timeout = Math.max(json.startIn, 10000);
            setTimeout(() => {
              location.href = `/watch?v=${json.key}&sval=${searchParams.sval}`;
            }, timeout);
            console.log(timeout / 1000 + "秒後にリロードされます。");
            const videoCover = document.createElement("div");
            videoCover.style.top = "0";
            videoCover.classList.add("video_cover");
            document.getElementById("video_player")!.appendChild(videoCover);
          }else{
            const playbackUrlBase = `${window.location.origin}/video?sid=${searchParams.sid}&amp;key=${json.key}&amp;sval=${searchParams.sval}&amp;ott=${json.ott}&amp;type=`;
            const mpdManifest = mpdTemplate
              .replace(/\$BASE/, playbackUrlBase)
              .replace(/\$VBITRATE/, json.vbitrate!)
              .replace(/\$VCODEC/, json.vcodec!)
              .replace(/\$ABITRATE/, json.abitrate!)
              .replace(/\$ACODEC/, json.acodec!)
              .replace(/\$LENGTH/, json.length!.toString())
              .replace(/\$VIDEO/, playbackUrlBase + "video")
              .replace(/\$AUDIO/, playbackUrlBase + "audio")
              .replace(/\$VLENGTH/, json.vlength!)
              .replace(/\$ALENGTH/, json.alength!)
              .replace(/\$VINDEXRANGE/, json.vindexrange!)
              .replace(/\$VINITRANGE/, json.vinitrange!)
              .replace(/\$AINDEXRANGE/, json.aindexrange!)
              .replace(/\$AINITRANGE/, json.ainitrange!)
              .trim()
            ;
            initPlayer(URL.createObjectURL(new Blob([mpdManifest], {type: json.format})), json.format, json.request, json.length);
          }
        })
        .catch(e => {
          window.alert("エラーが発生しました: " + e);
        });
      }
      // セッション維持
      const interval = setInterval(() => {
        window.fetch(`/alive?sval=${searchParams.sval}`).then(res => {
          if(res.status !== 204){
            clearInterval(interval);
          }
        }).catch(()=>null);
      }, 5 * 60 * 1000);
    }
  });
})();