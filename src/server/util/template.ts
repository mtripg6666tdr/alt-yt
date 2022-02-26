export const searchCardTemplate = 
`
<div class="search_card">
  <a href="{url}">
    <div class="search_thumb">
      <img src="{thumb}">
    </div>
  </a>
    <div class="search_detail">
      <div class="search_title">
        <a href="{url}">
          <p>{title}</p>
        </a>
      </div>
      <div class="search_channel">
        <a href="{channel_url}">
          <p>
            <img src="{channel_thumb}" class="channel_a">
            <span>{channel}</span>
          </p>
        </a>
        </p>
      </div>
        <div class="search_description">
          <a href="{url}">
            <p>{description}</p>
          </a>
        </div>
    </div>
</div>`;