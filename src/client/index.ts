(function(){
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
    // 高画質の警告
    const hrCheckbox = document.getElementById("hr") as HTMLInputElement;
    if(hrCheckbox){
      hrCheckbox.addEventListener("change", () => {
        if(hrCheckbox.checked) window.alert("高画質モードが選択されました。\r\n高画質モードでは、バッファリングが長くなったり、シークができなくなったりすることがあるため、高画質モードはおすすめしていません。続行しますか。");
      });
    }
    // パラメーター解析
    const searchParams = {} as {[key:string]:string};
    location.search
      .substring(1)
      .split("&")
      .map(p => p.split("=").map(t => decodeURIComponent(t)))
      .forEach(q => searchParams[q[0]] = q[1]);
    // 再生ページの処理
    if(location.pathname.startsWith("/watch") || location.pathname.startsWith("/common/watch")){
      const detailedButton = document.getElementsByClassName("detailed_button")[0];
      const detailedModal = document.getElementsByClassName("detailed_modal")[0];
      const detailedModalBg = document.getElementsByClassName("detailed_modal_bg")[0];
      const initPlayer = (src:string, format:string, length:number = 0) => {
        if(!videojs) return;
        // @ts-ignore
        const videoPlayer = videojs("video_player") as videojs.VideoJsPlayer;
        const loopButton = videoPlayer.controlBar.addChild("button");
        const loopButtonElem = loopButton.el() as HTMLElement;
        const loopIcon = document.createElement("span");
        loopIcon.style.fontSize = "1.8em";
        loopIcon.style.lineHeight = "1.67";
        loopIcon.innerHTML = "&#8635";
        loopButtonElem.style.cursor = "pointer";
        loopButtonElem.style.flex = "none";
        loopButtonElem.appendChild(loopIcon);
        loopButton.on("click", () => {
          const old = videoPlayer.loop();
          videoPlayer.loop(!old);
          loopIcon.classList[old ? "remove" : "add"]("loop_enable");
        });
        videoPlayer.src({src, type: format});
        videoPlayer.one("play", () => {
          if(length > 0){
            videoPlayer.duration(length);
          }
        });
        // かさね要素
        const videoCover = document.createElement("div");
        videoCover.classList.add("video_cover");
        videoCover.addEventListener("click", ()=>{
          if(videoPlayer.userActive()){
            if(videoPlayer.paused()) 
              videoPlayer.play();
            else 
              videoPlayer.pause();
          }else{
            videoPlayer.userActive(true);
          }
        });
        document.getElementById("video_player").appendChild(videoCover);
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
        document.getElementsByClassName("detailed_modal")[0].appendChild(button);
        button.addEventListener("click", () => {
          if(bufShow){
            clearInterval(interval);
            bufElem.style.display = "none";
            button.textContent = "バッファ情報を隠す";
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
            button.textContent = "バッファ情報を表示";
            bufShow = true;
          }
        })
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
      if(location.search.length > 0){
        window.fetch(`/video_fetch?sid=${searchParams.sid}` + "&sval=" + searchParams.sval + (searchParams.hr === "on" ? "&hr=on" : ""))
        .then(res => { 
          if(res.status !== 200){
            throw "動画の取得中に問題が発生しました: " + res.status
          }
          return res.json();
        })
        .then(json => {
          const playbackUrl = `/video?sid=${searchParams.sid}&key=${json.key}&sval=${searchParams.sval}&&ott=${json.ott}` + (searchParams.hr === "on" ? "&hr=on" : "");
          initPlayer(playbackUrl, json.format, json.length);
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
      }, 10 * 60 * 1000);
    }
  });
})();