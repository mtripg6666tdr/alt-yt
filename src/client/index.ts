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
        document.getElementById("video_player").appendChild(videoCover);
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