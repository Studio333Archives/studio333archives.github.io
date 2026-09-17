const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>`${Math.floor((n||0)/60)}:${String(Math.floor((n||0)%60)).padStart(2,'0')}`;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const compactText=(value='')=>String(value||'').replace(/\s+/g,' ').trim();
function smartTruncate(value,max){
  const text=compactText(value);if(!text||text.length<=max)return text;
  const sample=text.slice(0,max+1);
  const floor=Math.floor(max*.62);
  let cut=-1;
  for(let i=max;i>=floor;i--){if(/[.!?;:]/.test(sample[i]||'')&&/\s/.test(sample[i+1]||' ')){cut=i+1;break}}
  if(cut<0){const word=sample.lastIndexOf(' ',max);cut=word>0?word:max}
  return sample.slice(0,cut).trim().replace(/[.!?\s,;:\-–—]+$/,'')+'…';
}
function sectionIntroParts(page){
  const full=compactText(page?.text||'');
  const excerpt=compactText(page?.excerpt||'');
  const lead=page?.intro_lead||smartTruncate(excerpt||full,520);
  const leadPlain=String(lead||'').replace(/…$/,'').trim();
  let bodySource=full;
  if(full&&leadPlain&&full.toLocaleLowerCase().startsWith(leadPlain.toLocaleLowerCase())) bodySource=full.slice(leadPlain.length).trim();
  const body=page?.intro_body||smartTruncate(bodySource,680);
  return {lead,body};
}
function sectionRest(page){
  if(!page)return'';
  const override=state.curation.overrides?.[page.id]||{};
  if(Object.prototype.hasOwnProperty.call(override,'text')){
    const full=compactText(override.text||'');const intro=sectionIntroParts({...page,...override});
    let rest=full;for(const piece of [intro.lead,intro.body]){const plain=String(piece||'').replace(/…$/,'').trim();if(plain&&rest.toLocaleLowerCase().startsWith(plain.toLocaleLowerCase()))rest=rest.slice(plain.length).trim()}
    return rest?`<div class="section-body-rich section-body-plain">${paragraphs(rest)}</div>`:'';
  }
  return page.section_rest_html?`<div class="section-body-rich">${page.section_rest_html}</div>`:'';
}
const icon=(name,cls='icon')=>{
  const paths={
    play:'<path d="M8 5.5 18 12 8 18.5Z" fill="currentColor"/>',
    pause:'<path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z" fill="currentColor"/>',
    prev:'<path d="M7 5v14" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m17.5 6.5-8 5.5 8 5.5z" fill="currentColor"/>',
    next:'<path d="M17 5v14" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m6.5 6.5 8 5.5-8 5.5z" fill="currentColor"/>',
    up:'<path d="m6 15 6-6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    down:'<path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    close:'<path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    arrow:'<path d="M5 12h13M13 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    upRight:'<path d="M8 16 16 8M9 8h7v7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name]||''}</svg>`;
};

const state={
  catalog:null,sections:[],build:{version:'—'},releases:[],curation:{hiddenIds:[],featuredTrackIds:[],heroImageIds:[],sectionImageIds:{},sectionVideoIds:{},overrides:{}},
  pages:[],tracks:[],images:[],videos:[],embeds:[],byId:new Map(),out:new Map(),inc:new Map(),pageTrackCount:new Map(),visualPlan:null,
  route:'home',item:null,index:false,playerOpen:false,cinemaOpen:false,buildInfoOpen:false,activeVideo:null,archiveMode:'grid',query:'',activeTrack:null,playing:false,time:0,duration:0,audioError:'',
  archiveAudioId:null,archiveAudioPlaying:false,archiveAudioTime:0,archiveAudioDuration:0,archiveAudioError:'',
  palette:Number(localStorage.getItem('redroom-palette')||0)%4,collectionId:''
};
const audio=new Audio();audio.preload='metadata';audio.setAttribute('playsinline','');
const archiveAudio=new Audio();archiveAudio.preload='metadata';archiveAudio.setAttribute('playsinline','');
let smooth=null,observer=null;

async function json(url,fallback){try{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(String(r.status));return await r.json()}catch{return fallback}}
function visibilityIds(value){const e=typeof value==='object'&&value?value:state.byId?.get(value);const id=typeof value==='string'?value:e?.id;return [...new Set([id,...(e?.alias_ids||[])].filter(Boolean))]}
const hidden=value=>visibilityIds(value).some(id=>state.curation.hiddenIds?.includes(id));
const over=e=>({...e,...(state.curation.overrides?.[e.id]||{})});
function rawSectionLandingIds(){
  const ids=new Set(),all=state.catalog?.entities||[];
  for(const sec of state.sections||[]){const p=all.find(x=>x.kind==='page'&&x.section_id===sec.id)||all.find(x=>x.kind==='page'&&x.slug===sec.id);if(p)ids.add(p.id)}
  return ids;
}
function pageAudioRelationCount(pageId){
  const ids=new Set();
  for(const r of state.out.get(pageId)||[]){const e=state.byId.get(r.to);if(e?.media_kind==='audio')ids.add(e.id)}
  for(const r of state.inc.get(pageId)||[]){if(r.type!=='parent')continue;const e=state.byId.get(r.from);if(e?.media_kind==='audio')ids.add(e.id)}
  return ids.size;
}
function relatedPagesForEntity(e){
  if(!e)return[];if(e.kind==='page')return[e];const found=new Map();
  for(const r of state.out.get(e.id)||[]){const p=state.byId.get(r.to);if(p?.kind==='page'&&r.type==='parent')found.set(p.id,p)}
  for(const r of state.inc.get(e.id)||[]){const p=state.byId.get(r.from);if(p?.kind==='page')found.set(p.id,p)}
  return [...found.values()];
}
function hiddenCollectionPageForEntity(e){
  if(!e||e.kind==='page')return false;const landings=rawSectionLandingIds();
  for(const p of relatedPagesForEntity(e)){
    if(!hidden(p.id)||landings.has(p.id))continue;
    // A hidden multi-recording project/album/session page is a curation owner even
    // when WordPress attachment-parent metadata happens to point at another page.
    if(pageAudioRelationCount(p.id)>=2)return true;
    for(const r of state.out.get(e.id)||[])if(r.type==='parent'&&r.to===p.id)return true;
  }
  return false;
}
function effectivelyHidden(e){
  if(!e||hidden(e))return true;if(e.kind==='page')return false;
  if(hiddenCollectionPageForEntity(e))return true;
  const rel=relatedPagesForEntity(e);return rel.length>0&&rel.every(p=>hidden(p.id));
}

function derive(){
  state.byId=new Map(state.catalog.entities.map(e=>[e.id,e]));state.out=new Map();state.inc=new Map();
  for(const r of state.catalog.relationships||[]){
    if(!state.out.has(r.from))state.out.set(r.from,[]);state.out.get(r.from).push(r);
    if(!state.inc.has(r.to))state.inc.set(r.to,[]);state.inc.get(r.to).push(r);
  }
  state.pages=state.catalog.entities.filter(e=>e.kind==='page'&&!hidden(e.id)).map(over);
  const imageUrls=new Set();
  state.images=state.catalog.entities.filter(e=>{
    if(e.media_kind!=='image'||!e.media_url||effectivelyHidden(e))return false;
    const key=String(e.media_url).replace(/#.*$/,'');
    if(imageUrls.has(key))return false;
    imageUrls.add(key);return true;
  }).map(over);
  state.videos=state.catalog.entities.filter(e=>e.media_kind==='video'&&!effectivelyHidden(e)&&(e.embed_url||e.media_url)).map(over);
  state.embeds=state.catalog.entities.filter(e=>e.media_kind==='embed'&&!effectivelyHidden(e)&&e.embed_url).map(over);

  state.pageTrackCount=new Map();
  for(const p of state.pages){
    const n=(state.out.get(p.id)||[]).filter(r=>state.byId.get(r.to)?.media_kind==='audio').length;
    state.pageTrackCount.set(p.id,n);
  }

  state.tracks=state.catalog.entities.filter(e=>e.media_kind==='audio'&&e.media_url&&!effectivelyHidden(e)).map(raw=>{
    const e=over(raw),pages=[],seen=new Set();
    const add=p=>{if(p?.kind==='page'&&!hidden(p.id)&&!seen.has(p.id)){seen.add(p.id);pages.push(over(p))}};

    // Attachment parent, when present, is the strongest project-level relationship.
    for(const r of state.out.get(e.id)||[])if(r.type==='parent')add(state.byId.get(r.to));
    // Then pages that actually embed/reference this recording.
    for(const r of state.inc.get(e.id)||[])add(state.byId.get(r.from));

    pages.sort((a,b)=>{
      const ac=state.pageTrackCount.get(a.id)||9999,bc=state.pageTrackCount.get(b.id)||9999;
      if(ac!==bc)return ac-bc;
      const ai=imagesForPage(a,20).length,bi=imagesForPage(b,20).length;
      if(ai!==bi)return bi-ai;
      return (a.title||'').localeCompare(b.title||'');
    });
    return {...e,pages,art:null};
  });
  state.tracks=assignTrackArtwork(state.tracks);
  const featured=new Map((state.curation.featuredTrackIds||[]).map((id,i)=>[id,i]));
  state.tracks.sort((a,b)=>{
    const af=featured.has(a.id),bf=featured.has(b.id);if(af!==bf)return af?-1:1;
    if(af&&bf)return featured.get(a.id)-featured.get(b.id);
    return (b.date||'').localeCompare(a.date||'');
  });
  if(!state.tracks.some(t=>t.id===state.activeTrack))state.activeTrack=state.tracks[0]?.id||null;
  state.visualPlan=buildVisualPlan();
}
function imageForPage(page){
  if(!page)return null;const imgs=imagesForPage(page,20);return imgs[0]||null;
}
function imageKey(im){
  const raw=typeof im==='string'?im:(im?.media_url||'');
  try{
    const u=new URL(raw,location.origin),parts=u.pathname.split('/');
    let f=parts.pop()||'';
    // WordPress often leaves generated size/scaled variants in old migrations.
    // Treat them as one visual asset so the same photograph is never tiled repeatedly.
    f=f.replace(/-scaled(?=\.[^.]+$)/i,'').replace(/-\d{2,5}x\d{2,5}(?=\.[^.]+$)/i,'');
    return [...parts,f].join('/').toLowerCase();
  }catch{return String(raw).toLowerCase()}
}
function imagesForPage(page,limit=20){
  if(!page)return[];
  const out=[],seen=new Set();
  const add=m=>{
    if(m?.media_kind!=='image'||!m.media_url||effectivelyHidden(m))return;
    const k=imageKey(m);if(seen.has(k))return;seen.add(k);out.push(over(m));
  };
  add(state.byId.get(page.featured_media_id));
  // Images embedded/referenced by the page.
  for(const r of state.out.get(page.id)||[])add(state.byId.get(r.to));
  // WordPress attachments point from media -> parent page. Include those too.
  for(const r of state.inc.get(page.id)||[])if(r.type==='parent')add(state.byId.get(r.from));
  return out.slice(0,limit);
}
function hashIndex(s,n){let h=2166136261;for(const c of String(s||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return n?Math.abs(h>>>0)%n:0}
function uniqueImages(items){const seen=new Set();return (items||[]).filter(im=>{if(!im?.media_url)return false;const k=imageKey(im);if(seen.has(k))return false;seen.add(k);return true})}
function relatedImagesForTrack(track){const out=[];for(const p of track.pages||[])out.push(...imagesForPage(p,40));return uniqueImages(out)}
function assignTrackArtwork(tracks){
  // Never plaster one generic archive image over dozens of recordings. A related
  // image is used once in the listening grid; when a project has fewer images
  // than tracks the remaining tracks deliberately fall back to the 333 mark.
  const used=new Set();
  return tracks.map(t=>{
    const candidates=relatedImagesForTrack(t);
    const art=candidates.find(im=>!used.has(imageKey(im)))||null;
    if(art)used.add(imageKey(art));
    return {...t,art};
  });
}
function imageDeck(seed='archive'){
  return [...state.images].sort((a,b)=>hashIndex(`${seed}:${a.id}`,2147483647)-hashIndex(`${seed}:${b.id}`,2147483647));
}
function takeUnused(pool,used,count=1){const out=[];for(const im of uniqueImages(pool)){const k=imageKey(im);if(used.has(k))continue;used.add(k);out.push(im);if(out.length>=count)break}return out}
function semanticImagesForSection(id){
  const terms={
    studio:['studio','333','control','recording','console','microphone','speaker'],
    archives:['archive','collection','tape','record','master'],
    artist:['bartlomiej','bartłomiej','kuzniak','kuźniak','portrait'],
    works:['work','project','installation','performance','composition'],
    spaces:['space','room','acoustic','architecture','crete'],
    gallery:['gallery','sound','exhibition','installation']
  }[id]||[];
  if(!terms.length)return[];
  return uniqueImages(state.images.filter(im=>{
    const hay=`${im.title||''} ${im.media_url||''}`.toLowerCase();
    return terms.some(t=>hay.includes(t));
  }));
}
function buildVisualPlan(){
  const selected=(id)=>{const im=state.byId.get(id);return im?.media_kind==='image'&&im.media_url&&!effectivelyHidden(im)?over(im):null};
  const explicitHero=(state.curation.heroImageIds||[]).map(selected).filter(Boolean)[0]||null;
  const studioRelated=uniqueImages([...imagesForPage(sectionPage('studio'),60),...sectionImages('studio'),...semanticImagesForSection('studio')]);
  const hero=explicitHero||studioRelated[0]||state.images[0]||null;

  // Homepage uses one visual chapter per editorial section. No global/random image
  // pool is used to fill empty sections: media must belong to, match, or be curated
  // for that section.
  const used=new Set(hero?[imageKey(hero)]:[]),sectionCovers=new Map();
  for(const sec of state.sections){
    const forced=selected(state.curation.sectionImageIds?.[sec.id]);
    const related=uniqueImages([...imagesForPage(sectionPage(sec.id),60),...sectionImages(sec.id),...semanticImagesForSection(sec.id)]);
    let image=null;
    if(forced)image=forced;
    else image=related.find(im=>!used.has(imageKey(im)))||null;
    // Studio 333 owns the homepage hero. Reusing that identity image on the
    // Studio section page is intentional, but not repeated within the page.
    if(!image&&sec.id==='studio')image=hero;
    if(image)used.add(imageKey(image));
    sectionCovers.set(sec.id,image||null);
  }
  return {hero,sectionCovers};
}
function sectionCoverImage(id){
  const forced=state.byId.get(state.curation.sectionImageIds?.[id]);
  if(forced?.media_kind==='image'&&forced.media_url&&!effectivelyHidden(forced))return over(forced);
  return state.visualPlan?.sectionCovers?.get(id)||null;
}
function sectionPage(id){return state.pages.find(p=>p.section_id===id)||state.pages.find(p=>p.slug===id)||null}
function sectionPages(id){return state.pages.filter(p=>p.section_id===id)}
function sectionImages(id){const out=[];for(const p of sectionPages(id)){out.push(...imagesForPage(p,60))}return uniqueImages(out).slice(0,60)}
function videosForPage(page){
  if(!page)return[];const found=new Map();const add=v=>{if(v?.media_kind==='video'&&!effectivelyHidden(v))found.set(v.id,over(v))};
  for(const r of state.out.get(page.id)||[])add(state.byId.get(r.to));
  for(const r of state.inc.get(page.id)||[])if(r.type==='parent')add(state.byId.get(r.from));
  return [...found.values()];
}
function sectionVideos(id){const found=new Map();for(const p of sectionPages(id))for(const v of videosForPage(p))found.set(v.id,v);return [...found.values()]}
function embedsForPage(page){
  if(!page)return[];const found=new Map();const add=e=>{if(e?.media_kind==='embed'&&!effectivelyHidden(e))found.set(e.id,over(e))};
  for(const r of state.out.get(page.id)||[])if(r.type==='references_embed')add(state.byId.get(r.to));
  return [...found.values()];
}
function sectionEmbeds(id){const found=new Map();for(const p of sectionPages(id))for(const e of embedsForPage(p))found.set(e.id,e);return [...found.values()]}
function archiveAudioSource(e){return e?.audio_url||''}
function archiveEmbedBlock(items,label='ARCHIVE.ORG / LISTENING OBJECT'){
  if(!items?.length)return'';
  return `<section class="archive-embed-stack reveal"><header><span>${esc(label)}</span><strong>${items.length===1?'1 LISTENING OBJECT':`${items.length} LISTENING OBJECTS`}</strong></header><div class="archive-listening-grid">${items.map(e=>{
    const playable=!!archiveAudioSource(e),cover=e.cover_url?`<img src="${esc(e.cover_url)}" alt="" loading="lazy">`:'<span>333</span>';
    return `<article class="archive-listening-card" data-archive-card="${esc(e.id)}"><figure class="archive-listening-cover">${cover}</figure><div class="archive-listening-copy"><small>ARCHIVE.ORG / ${esc(e.archive_id||'OPEN ARCHIVE')}</small><strong>${esc(e.title||e.archive_file||'Listening object')}</strong>${e.archive_file?`<em>${esc(e.archive_file)}</em>`:''}</div>${playable?`<button class="archive-listening-toggle" data-archive-play="${esc(e.id)}" aria-label="Play Archive.org recording">${icon('play')}</button><div class="archive-listening-progress"><input type="range" min="0" max="1" step="0.1" value="0" data-archive-seek="${esc(e.id)}" aria-label="Seek Archive.org recording"><time data-archive-time>0:00 / 0:00</time></div>`:`<div class="archive-listening-unavailable">SOURCE PLAYER</div>`}<a class="archive-listening-source" href="${esc(e.source_url||e.embed_url)}" target="_blank" rel="noopener noreferrer">OPEN SOURCE ${icon('upRight','icon icon-xs')}</a></article>`
  }).join('')}</div></section>`
}
function archiveEntity(id){return state.embeds.find(e=>e.id===id)||null}
function toggleArchiveAudio(e){
  if(!e)return;const src=archiveAudioSource(e);if(!src){if(e.source_url)window.open(e.source_url,'_blank','noopener');return}
  const href=new URL(src,location.origin).href;
  if(state.archiveAudioId!==e.id||archiveAudio.src!==href){archiveAudio.pause();archiveAudio.src=href;archiveAudio.load();state.archiveAudioId=e.id;state.archiveAudioTime=0;state.archiveAudioDuration=0;state.archiveAudioError=''}
  if(!audio.paused)audio.pause();
  if(archiveAudio.paused){const promise=archiveAudio.play();if(promise?.catch)promise.catch(err=>{state.archiveAudioPlaying=false;state.archiveAudioError=err?.name||'media error';renderArchivePlayers()})}else archiveAudio.pause();
  renderArchivePlayers();
}
function renderArchivePlayers(){
  $$('.archive-listening-card').forEach(card=>{const id=card.dataset.archiveCard,active=id===state.archiveAudioId;card.classList.toggle('active',active&&state.archiveAudioPlaying);const b=$('[data-archive-play]',card);if(b){b.innerHTML=icon(active&&state.archiveAudioPlaying?'pause':'play');b.setAttribute('aria-label',active&&state.archiveAudioPlaying?'Pause Archive.org recording':'Play Archive.org recording')}const seek=$('[data-archive-seek]',card);if(seek){seek.max=active&&state.archiveAudioDuration?state.archiveAudioDuration:1;seek.value=active?Math.min(state.archiveAudioTime,state.archiveAudioDuration||0):0}const time=$('[data-archive-time]',card);if(time)time.textContent=active?`${fmt(state.archiveAudioTime)} / ${fmt(state.archiveAudioDuration)}`:'0:00 / 0:00'})
}
archiveAudio.addEventListener('play',()=>{state.archiveAudioPlaying=true;state.archiveAudioError='';renderArchivePlayers()});
archiveAudio.addEventListener('pause',()=>{state.archiveAudioPlaying=false;renderArchivePlayers()});
archiveAudio.addEventListener('timeupdate',()=>{state.archiveAudioTime=archiveAudio.currentTime||0;state.archiveAudioDuration=archiveAudio.duration||0;renderArchivePlayers()});
archiveAudio.addEventListener('loadedmetadata',()=>{state.archiveAudioDuration=archiveAudio.duration||0;renderArchivePlayers()});
archiveAudio.addEventListener('ended',()=>{state.archiveAudioPlaying=false;state.archiveAudioTime=state.archiveAudioDuration||0;renderArchivePlayers()});
archiveAudio.addEventListener('error',()=>{state.archiveAudioPlaying=false;state.archiveAudioError='media error';renderArchivePlayers()});
function videoPages(video){const out=[],seen=new Set();const add=p=>{if(p?.kind==='page'&&!hidden(p.id)&&!seen.has(p.id)){seen.add(p.id);out.push(over(p))}};for(const r of state.inc.get(video.id)||[])add(state.byId.get(r.from));for(const r of state.out.get(video.id)||[])if(r.type==='parent')add(state.byId.get(r.to));return out}
function sectionVideo(id){const forced=state.byId.get(state.curation.sectionVideoIds?.[id]);if(forced?.media_kind==='video'&&!effectivelyHidden(forced))return over(forced);return sectionVideos(id)[0]||null}
function videoSrc(v,background=false){
  if(!v)return'';
  if(v.provider==='youtube'){const id=v.video_id||'';return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&mute=${background?1:0}&controls=${background?0:1}&loop=${background?1:0}&playlist=${encodeURIComponent(id)}&playsinline=1&modestbranding=1&rel=0`}
  if(v.provider==='youtube_playlist'){const id=v.video_id||'';return `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(id)}&autoplay=1&mute=${background?1:0}&controls=${background?0:1}&loop=${background?1:0}&playsinline=1&modestbranding=1&rel=0`}
  if(v.provider==='vimeo'){const id=v.video_id||'';return `https://player.vimeo.com/video/${encodeURIComponent(id)}?autoplay=1&muted=${background?1:0}&loop=${background?1:0}&background=${background?1:0}`}
  if(v.provider==='dailymotion'){const id=v.video_id||'';return `https://www.dailymotion.com/embed/video/${encodeURIComponent(id)}?autoplay=1&mute=${background?1:0}&controls=${background?0:1}&loop=${background?1:0}`}
  return v.embed_url||v.media_url||'';
}
function videoMedia(v,background=false){if(!v)return'';const src=videoSrc(v,background);if(['local','direct'].includes(v.provider)){const poster=v.poster_url?` poster="${esc(v.poster_url)}"`:'';return `<video ${background?'autoplay muted loop':''} ${background?'':'controls'} playsinline preload="metadata"${poster} src="${esc(src)}"></video>`}return `<iframe src="${esc(src)}" title="${esc(v.title||'Studio 333 video')}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>`}
function providerPreviewSrc(v){
  if(!v)return'';
  const id=encodeURIComponent(v.video_id||'');
  if(v.provider==='vimeo'&&id)return `https://player.vimeo.com/video/${id}?autoplay=0&muted=1&controls=0&title=0&byline=0&portrait=0&dnt=1`;
  if(v.provider==='youtube_playlist'&&id)return `https://www.youtube-nocookie.com/embed/videoseries?list=${id}&autoplay=0&mute=1&controls=0&playsinline=1&modestbranding=1&rel=0`;
  return'';
}
function videoCover(v){
  if(!v)return'<span>VIDEO</span>';
  if(v.poster_url)return `<img src="${esc(v.poster_url)}" alt="" loading="lazy">`;
  const providerPreview=providerPreviewSrc(v);
  if(providerPreview)return `<iframe class="provider-cover" src="${esc(providerPreview)}" title="${esc(v.title||'Video preview')}" loading="lazy" tabindex="-1" aria-hidden="true" allow="autoplay; encrypted-media"></iframe>`;
  if(['local','direct'].includes(v.provider)&&(v.embed_url||v.media_url))return `<video class="motion-cover" src="${esc(videoSrc(v,false))}#t=0.1" muted playsinline preload="metadata" aria-hidden="true"></video>`;
  return `<span>${esc((v.provider||'video').toUpperCase())}</span>`;
}
function videoArchive(videos,primaryId=null){const rest=(videos||[]).filter(v=>v.id!==primaryId);if(!rest.length)return'';return `<section class="video-archive reveal"><header><span>MOVING IMAGE ARCHIVE</span><strong>${String(rest.length).padStart(2,'0')} MORE</strong></header><div class="video-archive-grid">${rest.map((v,i)=>`<button data-cinema="${esc(v.id)}" class="video-archive-card"><figure>${videoCover(v)}<i>${icon('play')}</i></figure><div><small>${String(i+1).padStart(2,'0')} / ${esc((v.provider||'video').replace('_',' ').toUpperCase())}</small><strong>${esc(v.title||'Moving image')}</strong><em>${esc(videoPages(v)[0]?.title||'Studio 333')}</em></div></button>`).join('')}</div></section>`}
function heroImages(){return [state.visualPlan?.hero].filter(Boolean)}
function active(){return state.tracks.find(t=>t.id===state.activeTrack)||state.tracks[0]}
function sectionLandingIds(){const ids=new Set();for(const sec of state.sections){const p=sectionPage(sec.id);if(p)ids.add(p.id)}return ids}
function collectionType(p){const hay=`${p?.title||''} ${p?.slug||''} ${(p?.terms||[]).map(t=>`${t.taxonomy||''} ${t.name||''}`).join(' ')}`.toLowerCase();if(/\b(album|release|record|ep|lp)\b/.test(hay))return'ALBUM';if(/\b(session|live|concert|performance)\b/.test(hay))return'SESSION';return'PROJECT'}
function archiveCollections(){
  const collections=[],folderCounts=new Map();
  for(const t of state.tracks){const c=t.audioteka_collection;if(c)folderCounts.set(c,(folderCounts.get(c)||0)+1)}
  for(const [label,count] of folderCounts)collections.push({id:`audioteka:${label}`,label,count,type:'PROJECT',year:'—',source:'AUDIOTEKA'});
  // Keep only explicitly album/session-like editorial collections in addition to
  // the authoritative audioteka folders; generic WP project pages would duplicate
  // the folder groups and create noisy filters.
  const counts=new Map(),pages=new Map(),landing=sectionLandingIds();
  for(const t of state.tracks)for(const p of t.pages||[]){if(!p?.id||landing.has(p.id)||hidden(p.id))continue;const type=collectionType(p);if(type==='PROJECT')continue;pages.set(p.id,p);counts.set(p.id,(counts.get(p.id)||0)+1)}
  for(const p of pages.values())collections.push({id:p.id,label:p.title||'Untitled collection',count:counts.get(p.id)||0,type:collectionType(p),year:year(p),source:'EDITORIAL'});
  return collections.filter(x=>x.count>0).sort((a,b)=>b.count-a.count||String(a.label).localeCompare(String(b.label)));
}
function filteredTracks(){let list=state.tracks;if(state.collectionId){if(state.collectionId.startsWith('audioteka:')){const c=state.collectionId.slice('audioteka:'.length);list=list.filter(t=>t.audioteka_collection===c)}else list=list.filter(t=>(t.pages||[]).some(p=>p.id===state.collectionId))}const q=state.query.trim().toLowerCase();if(!q)return list;return list.filter(t=>`${t.title||''} ${t.audioteka_collection||''} ${(t.pages||[]).map(p=>`${p.title||''} ${(p.terms||[]).map(x=>x.name||'').join(' ')}`).join(' ')}`.toLowerCase().includes(q))}
function trackContext(t){return t?.audioteka_collection||t?.pages?.[0]?.title||'Studio 333 Archive'}
function year(x){return x?.date?.slice(0,4)||'—'}

function readRoute(){const raw=location.hash.replace(/^#\/?/,'');if(!raw){state.route='home';state.item=null;return}const [r,...rest]=raw.split('/');state.route=r||'home';state.item=rest.length?decodeURIComponent(rest.join('/')):null}
function routeTo(route,item=null){state.route=route;state.item=item;state.index=false;history.pushState(null,'',route==='home'?'#/':`#/${route}${item?'/'+encodeURIComponent(item):''}`);render();setTimeout(()=>scrollTo(0,0),0)}

function mediaHref(t){return new URL(t.media_url,location.origin).href}
function play(t){
  if(!t)return;
  if(!archiveAudio.paused)archiveAudio.pause();
  state.activeTrack=t.id;state.audioError='';
  const href=mediaHref(t);
  if(audio.src!==href){audio.src=href;audio.load()}
  const promise=audio.play();
  if(promise?.catch)promise.catch(err=>{state.playing=false;state.audioError=`Playback unavailable — ${err?.name||'media error'}`;renderPlayer()});
  renderPlayer();mediaSession();
}
function toggle(){
  const t=active();if(!t)return;
  if(audio.paused){
    state.audioError='';
    if(!audio.src){audio.src=mediaHref(t);audio.load()}
    const promise=audio.play();
    if(promise?.catch)promise.catch(err=>{state.playing=false;state.audioError=`Playback unavailable — ${err?.name||'media error'}`;renderPlayer()});
  }else audio.pause();
}
function step(n){const t=active();if(!t||!state.tracks.length)return;let pool=filteredTracks();if(!pool.length||!pool.some(x=>x.id===t.id))pool=state.tracks;const i=pool.findIndex(x=>x.id===t.id);play(pool[(i+n+pool.length)%pool.length])}
function mediaSession(){if(!('mediaSession'in navigator))return;const t=active();if(!t)return;try{navigator.mediaSession.metadata=new MediaMetadata({title:t.title||'Studio 333',artist:t.pages?.[0]?.title||'Bartłomiej Kuźniak / Studio 333',album:'Studio 333 Archive',artwork:t.art?[{src:t.art.media_url}]:[]});navigator.mediaSession.setActionHandler('play',toggle);navigator.mediaSession.setActionHandler('pause',toggle);navigator.mediaSession.setActionHandler('previoustrack',()=>step(-1));navigator.mediaSession.setActionHandler('nexttrack',()=>step(1))}catch{}}
audio.addEventListener('play',()=>{state.playing=true;state.audioError='';renderPlayer()});audio.addEventListener('pause',()=>{state.playing=false;renderPlayer()});audio.addEventListener('timeupdate',()=>{state.time=audio.currentTime;state.duration=audio.duration||0;renderPlayer()});audio.addEventListener('loadedmetadata',()=>{state.duration=audio.duration||0;state.audioError='';renderPlayer()});audio.addEventListener('error',()=>{state.playing=false;const code=audio.error?.code||0;state.audioError=`Playback unavailable — media error ${code}`;renderPlayer()});audio.addEventListener('ended',()=>step(1));

function shell(){
  document.body.dataset.palette=String(state.palette);
  document.body.innerHTML=`<div class="site">
    <header class="mast"><div class="logo"><button class="logo-home" data-route="home" aria-label="Studio 333 home"><strong>333</strong></button><button class="build-version" data-build-info aria-label="Open build information"><small>v${esc(state.build.version||'—')}</small></button></div><div class="mast-copy"><span>STUDIO 333</span><span>BARTŁOMIEJ KUŹNIAK</span></div></header>
    <main id="view"></main>
    ${siteCredit()}${floatingNav()}${indexOverlay()}${buildInfoOverlay()}${player()}${cinemaOverlay()}
  </div>`;
  bind();render();
}
function siteCredit(){return `<footer class="site-credit"><a href="https://mojoworks.xyz/" target="_blank" rel="noopener">MADE BY WORKWORK.FUN</a></footer>`}
function buildInfoOverlay(){
  const recent=(state.releases||[]).slice(0,7);
  return `<aside class="build-info-overlay" aria-hidden="${state.buildInfoOpen?'false':'true'}"><header class="build-info-head"><div><span>REDROOM / BUILD INFO</span><strong>v${esc(state.build.version||'—')}</strong></div><button data-build-info-close aria-label="Close build information">CLOSE ${icon('close','icon icon-xs')}</button></header><div class="build-info-intro"><div><span>BUILT BY</span><a href="https://mojoworks.xyz/" target="_blank" rel="noopener">WORKWORK.FUN ${icon('upRight','icon icon-xs')}</a></div><nav><a href="https://github.com/Studio333Archives/redroom" target="_blank" rel="noopener"><span>SOURCE</span><strong>Studio333Archives/redroom</strong>${icon('upRight','icon icon-xs')}</a><a href="https://github.com/Studio333Archives/studio333archives.github.io" target="_blank" rel="noopener"><span>MIRROR</span><strong>studio333archives.github.io</strong>${icon('upRight','icon icon-xs')}</a><a href="https://archives.studio333.art/" target="_blank" rel="noopener"><span>PUBLIC MIRROR</span><strong>archives.studio333.art</strong>${icon('upRight','icon icon-xs')}</a></nav></div><section class="build-history"><header><span>RECENT CHANGES</span><em>${recent.length} RELEASES</em></header>${recent.map((r,i)=>`<article><div><span>${esc(r.date||'—')}</span><strong>v${esc(r.version||'—')}</strong></div><ul>${(r.changes||[]).slice(0,4).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><em>${String(i+1).padStart(2,'0')}</em></article>`).join('')}</section></aside>`
}
function floatingNav(){return `<nav class="fluid-nav"><div class="fluid-pill"><button data-route="home">HOME</button><button data-route="archive">LISTEN</button><button data-index>INDEX</button><button data-palette-control aria-label="Change colour scheme">●</button></div></nav>`}
function indexOverlay(){return `<aside class="index-overlay"><div class="index-bar"><span>STUDIO 333 / INDEX</span><button data-index aria-label="Close index">CLOSE ${icon('close','icon icon-xs')}</button></div><div class="index-list">${state.sections.map((s,i)=>`<button class="index-line" data-route="section" data-item="${esc(s.id)}"><em>${String(i+1).padStart(2,'0')}</em><strong>${esc(s.label)}</strong><span>${esc(smartTruncate(sectionPage(s.id)?.excerpt||'',130)||'Open archive section')}</span><i class="index-arrow">${icon('upRight','icon')}</i></button>`).join('')}<button class="index-line" data-route="archive"><em>∞</em><strong>Listening archive</strong><span>${state.tracks.length} public recordings</span><i class="index-arrow">${icon('upRight','icon')}</i></button></div><footer class="index-footer"><span>REDROOM v${esc(state.build.version||'—')}</span><a href="https://red.studio333.art/editor/">EDITOR ↗</a></footer></aside>`}
function player(){const t=active(),sub=state.audioError||trackContext(t);return `<footer class="player ${state.audioError?'has-error':''}"><button class="p-thumb" data-player aria-label="Open queue">${t?.art?`<img src="${esc(t.art.media_url)}" alt="">`:'<span>333</span>'}</button><button class="p-toggle icon-button" data-toggle aria-label="${state.playing?'Pause':'Play'}">${icon(state.playing?'pause':'play')}</button><div class="p-info"><button class="p-title" data-player><strong>${esc(t?.title||'LISTENING SPACE')}</strong><span>${esc(sub)}</span></button><time class="p-time">${fmt(state.time)} / ${fmt(state.duration)}</time><label class="p-seek-wrap" aria-label="Seek through track"><span class="p-seek-rail"><span class="p-seek-fill"></span></span><input class="p-seek" aria-label="Seek" type="range" min="0" max="${state.duration||1}" step="0.1" value="${Math.min(state.time,state.duration||0)}"></label></div><button class="p-prev icon-button" data-prev aria-label="Previous track">${icon('prev')}</button><button class="p-next icon-button" data-next aria-label="Next track">${icon('next')}</button><button class="p-queue icon-button" data-player aria-label="${state.playerOpen?'Close queue':'Open queue'}">${icon(state.playerOpen?'down':'up')}</button></footer><aside class="player-drawer ${state.playerOpen?'open':''}">${playerDrawer()}</aside>`}
function playerDrawer(){
  const t=active(),collections=archiveCollections();if(state.collectionId&&!collections.some(x=>x.id===state.collectionId))state.collectionId='';
  const list=filteredTracks().slice(0,100),selected=collections.find(x=>x.id===state.collectionId)||null;
  const options=collections.map(x=>`<option value="${esc(x.id)}" ${state.collectionId===x.id?'selected':''}>${esc(x.type)} — ${esc(x.label)} (${x.count})</option>`).join('');
  return `<div class="drawer-filter-bar"><div class="drawer-filter-meta"><span>QUEUE / SEARCH</span><strong>${String(list.length).padStart(3,'0')} / ${String(state.tracks.length).padStart(3,'0')}</strong></div><input id="drawer-track-search" placeholder="SEARCH TITLE / PROJECT" value="${esc(state.query)}"><label><span>PROJECT / ALBUM / SESSION</span><select id="drawer-collection-filter"><option value="">ALL CONNECTED RECORDINGS</option>${options}</select></label><em>${selected?`${esc(selected.type)} / ${esc(selected.label)}`:'ALL COLLECTIONS'}</em></div><div class="drawer-now">${t?.art?`<img src="${esc(t.art.media_url)}" alt="">`:'<div class="drawer-mark">333</div>'}<div><span>NOW PLAYING</span><h2>${esc(t?.title||'—')}</h2><p>${esc(t?.audioteka_collection||t?.pages?.map(p=>p.title).join(' / ')||'Studio 333')}</p></div></div><div class="drawer-list">${list.map((x,i)=>`<button class="queue-row ${x.id===t?.id?'active':''}" data-track="${esc(x.id)}"><span>${String(i+1).padStart(3,'0')}</span><strong>${esc(x.title)}</strong><em>${esc(trackContext(x))}</em></button>`).join('')}${!list.length?'<div class="drawer-empty">NO RECORDINGS MATCH THIS FILTER</div>':''}</div>`
}
function renderDrawer(){const d=$('.player-drawer');if(!d)return;d.innerHTML=playerDrawer();d.classList.toggle('open',state.playerOpen)}
function cinemaOverlay(){const v=state.videos.find(x=>x.id===state.activeVideo)||null;return `<aside class="cinema-overlay ${state.cinemaOpen&&v?'open':''}"><div class="cinema-bar"><span>STUDIO 333 / CINEMA</span><button data-cinema-close aria-label="Close cinema">CLOSE ${icon('close','icon icon-xs')}</button></div><div class="cinema-stage">${v?videoMedia(v,false):''}</div>${v?`<div class="cinema-caption"><strong>${esc(v.title||'Studio 333 video')}</strong><span>${esc((videoPages(v)[0]?.title)||'Studio 333')}</span></div>`:''}</aside>`}
function openCinema(v){if(!v)return;state.activeVideo=v.id;state.cinemaOpen=true;render();}

function homepageVideo(){for(const sec of state.sections){const v=sectionVideo(sec.id);if(v)return v}return state.videos[0]||null}
function cinemaShowcase(){const v=homepageVideo();if(!v)return'';return `<section class="cinema-showcase reveal"><div class="cinema-bg">${videoMedia(v,true)}</div><div class="cinema-shade"></div><div class="cinema-copy"><span>MOVING IMAGE / ARCHIVE SIGNAL</span><h2>${esc(v.title||'STUDIO 333 / CINEMA')}</h2><button data-cinema="${esc(v.id)}">CINEMA MODE ${icon('arrow','icon icon-xs')}</button></div></section>`}
function home(){
  const hero=state.visualPlan?.hero||null;
  const publicSections=state.sections.filter(sec=>sec.id!=='contact');
  return `<section class="hero">
    ${hero?`<figure class="hero-media"><img src="${esc(hero.media_url)}" alt="${esc(hero.title||'Studio 333 archive')}" fetchpriority="high"><div class="hero-scrim"></div></figure>`:''}
    <div class="hero-title"><div class="micro">SOUND / SPACE / RECORDING / RESEARCH</div><h1><span>STUDIO</span><span>333</span></h1><p>Bartłomiej Kuźniak — recordings, spaces, collaborations and works held in one connected archive.</p></div>
    <div class="scroll-cue">SCROLL ↓</div>
  </section>
  <section class="statement reveal"><p>The archive is organised as works, people, spaces and recordings. Media appears where it belongs rather than as decorative filler.</p><div><span>ARCHIVE</span><span>LABORATORY</span><span>LISTENING SPACE</span></div></section>
  ${cinemaShowcase()}
  <section class="section-chapters">${publicSections.map((sec,i)=>sectionChapter(sec,i)).join('')}</section>
  <section class="listen-entry reveal"><button data-route="archive"><span>LISTENING ARCHIVE</span><strong>${String(state.tracks.length).padStart(3,'0')} RECORDINGS</strong><em>Persistent playback across the entire Redroom.</em>${icon('arrow')}</button></section>`;
}
function sectionChapter(sec,i){
  const p=sectionPage(sec.id),im=sectionCoverImage(sec.id),count=sectionImages(sec.id).length;
  return `<article class="section-chapter ${im?'has-media':'no-media'} reveal"><button data-route="section" data-item="${esc(sec.id)}">${im?`<figure><img src="${esc(im.media_url)}" alt="${esc(im.title||sec.label)}" loading="lazy"></figure>`:''}<div class="chapter-meta"><span>${String(i+1).padStart(2,'0')} / ${esc(sec.label)}</span><em>${String(count).padStart(2,'0')} IMAGES</em></div><div class="chapter-title"><h2>${esc(sec.label)}</h2><p>${esc(smartTruncate(p?.excerpt||'',220)||'Enter section')}</p>${icon('arrow')}</div></button></article>`;
}

function archive(){
  const collections=archiveCollections();if(state.collectionId&&!collections.some(x=>x.id===state.collectionId))state.collectionId='';
  const list=filteredTracks(),grid=state.archiveMode==='grid',selected=collections.find(x=>x.id===state.collectionId)||null;
  const options=collections.map(x=>`<option value="${esc(x.id)}" ${state.collectionId===x.id?'selected':''}>${esc(x.type)} — ${esc(x.label)} (${x.count})</option>`).join('');
  return `<section class="archive-page"><header class="archive-hero reveal"><div><span>LISTENING ARCHIVE</span><h1>${String(list.length).padStart(3,'0')}<br>RECORDINGS</h1></div><p>Search recordings or move through projects, albums and sessions recovered from the archive relationships.</p></header><div class="archive-toolbar"><input id="track-search" placeholder="SEARCH TITLE / PROJECT" value="${esc(state.query)}"><div class="archive-view-toggle"><button data-archive-mode="grid" class="${grid?'on':''}">GRID</button><button data-archive-mode="list" class="${!grid?'on':''}">LIST</button></div></div><div class="archive-collection-bar"><label><span>PROJECT / ALBUM / SESSION</span><select id="collection-filter"><option value="">ALL CONNECTED RECORDINGS (${state.tracks.length})</option>${options}</select></label><em>${selected?`${esc(selected.type)} / ${esc(selected.label)} / ${selected.count} RECORDINGS`:`${collections.length} MULTI-TRACK COLLECTIONS FOUND IN METADATA`}</em></div>${grid?`<div class="audio-grid">${list.map((t,i)=>trackCard(t,i)).join('')}</div>`:`<div class="audio-list">${list.map((t,i)=>trackRow(t,i)).join('')}</div>`}</section>`}
function trackCard(t,i){return `<button class="audio-card reveal ${t.id===active()?.id?'active':''}" data-track="${esc(t.id)}"><figure>${t.art?`<img src="${esc(t.art.media_url)}" alt="" loading="lazy">`:`<span>333</span>`}<i>${icon(t.id===active()?.id&&state.playing?'pause':'play')}</i></figure><div><small>${String(i+1).padStart(3,'0')} / ${esc(year(t))}</small><strong>${esc(t.title)}</strong><em>${esc(trackContext(t))}</em></div></button>`}
function trackRow(t,i){return `<button class="audio-row ${t.id===active()?.id?'active':''}" data-track="${esc(t.id)}"><span>${String(i+1).padStart(3,'0')}</span><strong>${esc(t.title)}</strong><em>${esc(trackContext(t))}</em><time>${esc(year(t))}</time><i>${icon(t.id===active()?.id&&state.playing?'pause':'play')}</i></button>`}

function cinemaBlock(v,label='CINEMA'){if(!v)return'';return `<section class="section-cinema reveal"><div class="section-cinema-media">${videoMedia(v,true)}</div><div class="section-cinema-scrim"></div><div class="section-cinema-copy"><span>${esc(label)} / ${esc((v.provider||'VIDEO').toUpperCase())}</span><h2>${esc(v.title||'Moving image')}</h2><button data-cinema="${esc(v.id)}">OPEN FULLSCREEN ${icon('arrow','icon icon-xs')}</button></div></section>`}
function sectionView(id){
  const sec=state.sections.find(x=>x.id===id)||{label:id};const p=sectionPage(id);const intro=sectionIntroParts(p);const cover=sectionCoverImage(id);const all=sectionImages(id);const coverKey=cover?imageKey(cover):null;const imageLimit=id==='artist'?14:6;const imgs=all.filter(im=>imageKey(im)!==coverKey).slice(0,imageLimit);const pages=sectionPages(id).filter(x=>x.id!==p?.id);const tracks=state.tracks.filter(t=>t.pages?.some(x=>x.section_id===id));const vid=sectionVideo(id);const vids=sectionVideos(id);const embeds=sectionEmbeds(id);
  return `<section class="section-page"><header class="section-cover ${cover?'has-media':'no-media'}"><div class="section-kicker">${esc(sec.label)} / ${String(tracks.length).padStart(2,'0')} AUDIO / ${String(all.length).padStart(2,'0')} IMAGES / ${String(vids.length).padStart(2,'0')} VIDEO</div><h1>${esc(sec.label)}</h1>${cover?`<figure><img src="${esc(cover.media_url)}" alt="${esc(cover.title||sec.label)}" fetchpriority="high"></figure>`:''}</header><div class="section-intro reveal"><p>${esc(intro.lead)}</p><span>${esc(intro.body)}</span></div>${sectionRest(p)}${archiveEmbedBlock(embeds,`${sec.label} / ARCHIVE.ORG`)}${cinemaBlock(vid,`${sec.label} / CINEMA`)}${videoArchive(vids,vid?.id)}<div class="section-gallery">${imgs.map((im,i)=>`<figure class="g${i%6} reveal"><img src="${esc(im.media_url)}" alt="${esc(im.title||'')}" loading="lazy"><figcaption>${esc(im.title||'ARCHIVE IMAGE')}</figcaption></figure>`).join('')}</div>${tracks.length?`<section class="section-listen"><header><span>LISTEN</span><strong>${tracks.length} RECORDINGS</strong></header>${tracks.slice(0,24).map((t,i)=>trackRow(t,i)).join('')}</section>`:''}${pages.length?`<section class="related-grid"><header>RELATED OBJECTS</header>${pages.slice(0,12).map((x,i)=>{const im=imageForPage(x);return `<button data-route="item" data-item="${esc(x.id)}">${im?`<img src="${esc(im.media_url)}" alt="" loading="lazy">`:''}<span>${String(i+1).padStart(2,'0')}</span><strong>${esc(x.title)}</strong><em>${esc(smartTruncate(x.excerpt||'',120))}</em></button>`}).join('')}</section>`:''}</section>`;
}

function itemView(id){
  const p=state.pages.find(x=>x.id===id);if(!p)return sectionView('archives');const imgs=uniqueImages(imagesForPage(p,24)).slice(0,10);const tracks=state.tracks.filter(t=>t.pages?.some(x=>x.id===p.id));const vids=videosForPage(p);const embeds=embedsForPage(p);
  return `<section class="object-page"><header class="object-head"><button data-route="home">← HOME</button><span>${esc(year(p))} / ARCHIVE OBJECT</span><h1>${esc(p.title)}</h1></header>${imgs[0]?`<figure class="object-hero"><img src="${esc(imgs[0].media_url)}" alt="${esc(imgs[0].title||'')}" fetchpriority="high"></figure>`:''}<div class="object-copy reveal">${paragraphs(p.text||p.excerpt||'')}</div>${archiveEmbedBlock(embeds,`${p.title} / ARCHIVE.ORG`)}${cinemaBlock(vids[0],`${p.title} / CINEMA`)}${videoArchive(vids,vids[0]?.id)}<div class="object-gallery">${imgs.slice(1,14).map((im,i)=>`<figure class="o${i%5} reveal"><img src="${esc(im.media_url)}" alt="${esc(im.title||'')}" loading="lazy"><figcaption>${esc(im.title||'')}</figcaption></figure>`).join('')}</div>${tracks.length?`<section class="object-audio"><header>LISTENING OBJECTS</header>${tracks.map((t,i)=>trackRow(t,i)).join('')}</section>`:''}</section>`;
}

function paragraphs(text){return String(text||'').split(/\n\s*\n/).filter(Boolean).slice(0,12).map(x=>`<p>${esc(x)}</p>`).join('')}

function render(){
  const v=$('#view');if(!v)return;
  if(state.route==='home')v.innerHTML=home();else if(state.route==='archive')v.innerHTML=archive();else if(state.route==='images')v.innerHTML=home();else if(state.route==='section')v.innerHTML=sectionView(state.item||state.sections[0]?.id);else if(state.route==='item')v.innerHTML=itemView(state.item);else v.innerHTML=home();
  $('.index-overlay')?.classList.toggle('open',state.index);document.body.classList.toggle('index-open',state.index);const build=$('.build-info-overlay');build?.classList.toggle('open',state.buildInfoOpen);build?.setAttribute('aria-hidden',state.buildInfoOpen?'false':'true');document.body.classList.toggle('build-info-open',state.buildInfoOpen);renderDrawer();renderPlayer();renderArchivePlayers();renderCinema();requestAnimationFrame(enhance);
}
function renderPlayer(){const f=$('.player');if(!f)return;const t=active();f.classList.toggle('has-error',!!state.audioError);const toggleBtn=$('.p-toggle',f);toggleBtn.innerHTML=icon(state.playing?'pause':'play');toggleBtn.setAttribute('aria-label',state.playing?'Pause':'Play');$('.p-title strong',f).textContent=t?.title||'LISTENING SPACE';$('.p-title span',f).textContent=state.audioError||trackContext(t);const seek=$('.p-seek',f);seek.max=state.duration||1;seek.value=Math.min(state.time,state.duration||0);const ratio=state.duration?clamp(state.time/state.duration,0,1):0;f.style.setProperty('--seek-progress',`${ratio*100}%`);$('time',f).textContent=`${fmt(state.time)} / ${fmt(state.duration)}`;const thumb=$('.p-thumb',f);thumb.innerHTML=t?.art?`<img src="${esc(t.art.media_url)}" alt="">`:'<span>333</span>';const q=$('.p-queue',f);q.innerHTML=icon(state.playerOpen?'down':'up');q.setAttribute('aria-label',state.playerOpen?'Close queue':'Open queue');const drawer=$('.player-drawer');drawer?.classList.toggle('open',state.playerOpen);$$('.queue-row',drawer||document).forEach(row=>row.classList.toggle('active',row.dataset.track===t?.id))}

function renderCinema(){const old=$('.cinema-overlay');if(!old)return;old.outerHTML=cinemaOverlay();document.body.classList.toggle('cinema-open',state.cinemaOpen)}

function bind(){
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-build-info]')){state.buildInfoOpen=true;render();return}
    if(e.target.closest('[data-build-info-close]')){state.buildInfoOpen=false;render();return}
    const r=e.target.closest('[data-route]');if(r){routeTo(r.dataset.route,r.dataset.item||null);return}
    if(e.target.closest('[data-index]')){state.index=!state.index;render();return}
    if(e.target.closest('button[data-palette-control]')){state.palette=(state.palette+1)%4;localStorage.setItem('redroom-palette',String(state.palette));document.body.dataset.palette=String(state.palette);return}
    const cinemaId=e.target.closest('[data-cinema]')?.dataset.cinema;if(cinemaId){openCinema(state.videos.find(v=>v.id===cinemaId));return}
    if(e.target.closest('[data-cinema-close]')){state.cinemaOpen=false;state.activeVideo=null;renderCinema();return}
    const archiveId=e.target.closest('[data-archive-play]')?.dataset.archivePlay;if(archiveId){toggleArchiveAudio(archiveEntity(archiveId));return}
    const tid=e.target.closest('[data-track]')?.dataset.track;if(tid){play(state.tracks.find(x=>x.id===tid));return}
    if(e.target.closest('[data-toggle]'))toggle();if(e.target.closest('[data-prev]'))step(-1);if(e.target.closest('[data-next]'))step(1);
    if(e.target.closest('[data-player]')){state.playerOpen=!state.playerOpen;render();return}
    const mode=e.target.closest('[data-archive-mode]')?.dataset.archiveMode;if(mode){state.archiveMode=mode;render();return}
  });
  document.addEventListener('input',e=>{if(e.target.matches('.p-seek'))audio.currentTime=Number(e.target.value);if(e.target.matches('[data-archive-seek]')&&e.target.dataset.archiveSeek===state.archiveAudioId)archiveAudio.currentTime=Number(e.target.value);if(e.target.id==='track-search'||e.target.id==='drawer-track-search'){state.query=e.target.value;const pos=e.target.selectionStart,id=e.target.id;render();const n=$(`#${id}`);n?.focus();n?.setSelectionRange(pos,pos)}});document.addEventListener('change',e=>{if(e.target.id==='collection-filter'||e.target.id==='drawer-collection-filter'){state.collectionId=e.target.value||'';render()}});
  addEventListener('hashchange',()=>{readRoute();render()});
  addEventListener('keydown',e=>{if(e.key==='Escape'&&state.cinemaOpen){state.cinemaOpen=false;state.activeVideo=null;renderCinema();return}if(e.key==='Escape'&&state.buildInfoOpen){state.buildInfoOpen=false;render();return}if(e.key==='Escape'&&state.index){state.index=false;render();return}if(e.code==='Space'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){e.preventDefault();toggle()}});
}

function enhance(){
  observer?.disconnect();const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;if(reduce){$$('.reveal').forEach(x=>x.classList.add('in'));return}
  observer=new IntersectionObserver(entries=>entries.forEach(x=>{if(x.isIntersecting)x.target.classList.add('in')}),{threshold:.08,rootMargin:'0px 0px -7%'});$$('.reveal').forEach(x=>observer.observe(x));
  $$('.project-panel figure img,.object-hero img,.section-cover figure img').forEach(img=>{img.closest('figure')?.addEventListener('pointermove',e=>{const r=e.currentTarget.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;img.style.transform=`scale(1.035) translate3d(${x*-10}px,${y*-10}px,0)`});img.closest('figure')?.addEventListener('pointerleave',()=>img.style.transform='')});
  initSmooth();
}
function initSmooth(){
  if(smooth||matchMedia('(prefers-reduced-motion: reduce)').matches||matchMedia('(pointer: coarse)').matches)return;
  let target=scrollY,current=scrollY,raf=0;
  const tick=()=>{current+=(target-current)*.105;if(Math.abs(target-current)<.35)current=target;scrollTo(0,current);if(current!==target)raf=requestAnimationFrame(tick);else raf=0};
  const wheel=e=>{if(state.index||state.playerOpen||e.ctrlKey||e.metaKey)return;const inside=e.target.closest('.drawer-list,.index-overlay');if(inside)return;e.preventDefault();target=clamp(target+e.deltaY*1.02,0,document.documentElement.scrollHeight-innerHeight);if(!raf)raf=requestAnimationFrame(tick)};
  addEventListener('wheel',wheel,{passive:false});addEventListener('scroll',()=>{if(!raf){current=target=scrollY}},{passive:true});
  smooth={reset(){current=target=scrollY}};
}

async function loadCuration(){const live=await json('/api/curation',null);if(live)return live;return await json('./data/curation.json',{hiddenIds:[],featuredTrackIds:[],heroImageIds:[],sectionImageIds:{},sectionVideoIds:{},overrides:{}})}
async function refreshCuration(){
  const next=await loadCuration();if(!next)return;const before=JSON.stringify(state.curation||{}),after=JSON.stringify(next);if(before===after)return;
  const previous=state.activeTrack;state.curation=next;derive();if(previous&&!state.tracks.some(t=>t.id===previous)){audio.pause();audio.removeAttribute('src');audio.load();state.time=0;state.duration=0}render();
}
addEventListener('focus',()=>{if(state.catalog)refreshCuration()});addEventListener('visibilitychange',()=>{if(!document.hidden&&state.catalog)refreshCuration()});

Promise.all([json('./data/catalog.json',null),json('./data/build-content.json',{}),json('./data/releases.json',[]),loadCuration()]).then(([catalog,build,releases,curation])=>{if(!catalog)throw new Error('catalog unavailable');state.catalog=catalog;state.sections=catalog.sections||[];state.build=build||{};state.releases=Array.isArray(releases)?releases:[];state.curation=curation||state.curation;readRoute();derive();shell();mediaSession()}).catch(err=>{document.body.innerHTML=`<main class="fatal"><strong>REDROOM / DATA SIGNAL LOST</strong><span>${esc(String(err))}</span></main>`});
