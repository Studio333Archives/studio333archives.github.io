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
  const leadSource=excerpt||full;
  const lead=smartTruncate(leadSource,520);
  const leadPlain=lead.replace(/…$/,'').trim();
  let bodySource=full;
  if(full&&leadPlain&&full.toLocaleLowerCase().startsWith(leadPlain.toLocaleLowerCase())) bodySource=full.slice(leadPlain.length).trim();
  const body=smartTruncate(bodySource,680);
  return {lead,body};
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
  catalog:null,sections:[],build:{version:'—'},curation:{hiddenIds:[],featuredTrackIds:[],heroImageIds:[],sectionImageIds:{},sectionVideoIds:{},overrides:{}},
  pages:[],tracks:[],images:[],videos:[],byId:new Map(),out:new Map(),inc:new Map(),pageTrackCount:new Map(),visualPlan:null,
  route:'home',item:null,index:false,playerOpen:false,cinemaOpen:false,activeVideo:null,archiveMode:'grid',query:'',activeTrack:null,playing:false,time:0,duration:0,audioError:'',
  palette:Number(localStorage.getItem('redroom-palette')||0)%4,collectionId:''
};
const audio=new Audio();audio.preload='metadata';audio.setAttribute('playsinline','');
let smooth=null,observer=null;

async function json(url,fallback){try{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(String(r.status));return await r.json()}catch{return fallback}}
const hidden=id=>state.curation.hiddenIds?.includes(id);
const over=e=>({...e,...(state.curation.overrides?.[e.id]||{})});
function relatedPagesForEntity(e){
  if(!e)return[];if(e.kind==='page')return[e];const owners=new Map(),refs=new Map();
  for(const r of state.out.get(e.id)||[]){const p=state.byId.get(r.to);if(p?.kind==='page'&&r.type==='parent')owners.set(p.id,p)}
  if(owners.size)return [...owners.values()];
  for(const r of state.inc.get(e.id)||[]){const p=state.byId.get(r.from);if(p?.kind==='page')refs.set(p.id,p)}
  return [...refs.values()];
}
function effectivelyHidden(e){
  if(!e||hidden(e.id))return true;if(e.kind==='page')return false;
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
  const counts=new Map(),pages=new Map(),landing=sectionLandingIds();
  for(const t of state.tracks)for(const p of t.pages||[]){if(!p?.id||landing.has(p.id)||hidden(p.id))continue;pages.set(p.id,p);counts.set(p.id,(counts.get(p.id)||0)+1)}
  return [...pages.values()].map(p=>({id:p.id,label:p.title||'Untitled project',count:counts.get(p.id)||0,type:collectionType(p),year:year(p)})).filter(x=>x.count>=2||x.type!=='PROJECT').sort((a,b)=>b.count-a.count||String(a.label).localeCompare(String(b.label)));
}
function filteredTracks(){let list=state.tracks;if(state.collectionId)list=list.filter(t=>(t.pages||[]).some(p=>p.id===state.collectionId));const q=state.query.trim().toLowerCase();if(!q)return list;return list.filter(t=>`${t.title||''} ${(t.pages||[]).map(p=>`${p.title||''} ${(p.terms||[]).map(x=>x.name||'').join(' ')}`).join(' ')}`.toLowerCase().includes(q))}
function year(x){return x?.date?.slice(0,4)||'—'}

function readRoute(){const raw=location.hash.replace(/^#\/?/,'');if(!raw){state.route='home';state.item=null;return}const [r,...rest]=raw.split('/');state.route=r||'home';state.item=rest.length?decodeURIComponent(rest.join('/')):null}
function routeTo(route,item=null){state.route=route;state.item=item;state.index=false;history.pushState(null,'',route==='home'?'#/':`#/${route}${item?'/'+encodeURIComponent(item):''}`);render();setTimeout(()=>scrollTo(0,0),0)}

function mediaHref(t){return new URL(t.media_url,location.origin).href}
function play(t){
  if(!t)return;
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
function step(n){const t=active();if(!t||!state.tracks.length)return;const i=state.tracks.findIndex(x=>x.id===t.id);play(state.tracks[(i+n+state.tracks.length)%state.tracks.length])}
function mediaSession(){if(!('mediaSession'in navigator))return;const t=active();if(!t)return;try{navigator.mediaSession.metadata=new MediaMetadata({title:t.title||'Studio 333',artist:t.pages?.[0]?.title||'Bartłomiej Kuźniak / Studio 333',album:'Studio 333 Archive',artwork:t.art?[{src:t.art.media_url}]:[]});navigator.mediaSession.setActionHandler('play',toggle);navigator.mediaSession.setActionHandler('pause',toggle);navigator.mediaSession.setActionHandler('previoustrack',()=>step(-1));navigator.mediaSession.setActionHandler('nexttrack',()=>step(1))}catch{}}
audio.addEventListener('play',()=>{state.playing=true;state.audioError='';renderPlayer()});audio.addEventListener('pause',()=>{state.playing=false;renderPlayer()});audio.addEventListener('timeupdate',()=>{state.time=audio.currentTime;state.duration=audio.duration||0;renderPlayer()});audio.addEventListener('loadedmetadata',()=>{state.duration=audio.duration||0;state.audioError='';renderPlayer()});audio.addEventListener('error',()=>{state.playing=false;const code=audio.error?.code||0;state.audioError=`Playback unavailable — media error ${code}`;renderPlayer()});audio.addEventListener('ended',()=>step(1));

function shell(){
  document.body.dataset.palette=String(state.palette);
  document.body.innerHTML=`<div class="site">
    <header class="mast"><button class="logo" data-route="home"><strong>333</strong><small>v${esc(state.build.version||'—')}</small></button><div class="mast-copy"><span>STUDIO 333</span><span>BARTŁOMIEJ KUŹNIAK</span></div></header>
    <main id="view"></main>
    ${siteCredit()}${floatingNav()}${indexOverlay()}${player()}${cinemaOverlay()}
  </div>`;
  bind();render();
}
function siteCredit(){return `<footer class="site-credit"><a href="https://mojoworks.xyz/" target="_blank" rel="noopener">MADE BY WORKWORK.FUN</a></footer>`}
function floatingNav(){return `<nav class="fluid-nav"><div class="fluid-pill"><button data-route="home">HOME</button><button data-route="archive">LISTEN</button><button data-index>INDEX</button><button data-palette-control aria-label="Change colour scheme">●</button></div></nav>`}
function indexOverlay(){return `<aside class="index-overlay"><div class="index-bar"><span>STUDIO 333 / INDEX</span><button data-index aria-label="Close index">CLOSE ${icon('close','icon icon-xs')}</button></div><div class="index-list">${state.sections.map((s,i)=>`<button class="index-line" data-route="section" data-item="${esc(s.id)}"><em>${String(i+1).padStart(2,'0')}</em><strong>${esc(s.label)}</strong><span>${esc(smartTruncate(sectionPage(s.id)?.excerpt||'',130)||'Open archive section')}</span><i class="index-arrow">${icon('upRight','icon')}</i></button>`).join('')}<button class="index-line" data-route="archive"><em>∞</em><strong>Listening archive</strong><span>${state.tracks.length} public recordings</span><i class="index-arrow">${icon('upRight','icon')}</i></button></div><footer class="index-footer"><span>REDROOM v${esc(state.build.version||'—')}</span><a href="https://red.studio333.art/editor/">EDITOR ↗</a></footer></aside>`}
function player(){const t=active(),sub=state.audioError||t?.pages?.[0]?.title||'STUDIO 333 ARCHIVE';return `<footer class="player ${state.audioError?'has-error':''}"><button class="p-thumb" data-player aria-label="Open queue">${t?.art?`<img src="${esc(t.art.media_url)}" alt="">`:'<span>333</span>'}</button><button class="p-toggle icon-button" data-toggle aria-label="${state.playing?'Pause':'Play'}">${icon(state.playing?'pause':'play')}</button><div class="p-info"><button class="p-title" data-player><strong>${esc(t?.title||'LISTENING SPACE')}</strong><span>${esc(sub)}</span></button><time class="p-time">${fmt(state.time)} / ${fmt(state.duration)}</time><label class="p-seek-wrap" aria-label="Seek through track"><span class="p-seek-rail"><span class="p-seek-fill"></span></span><input class="p-seek" aria-label="Seek" type="range" min="0" max="${state.duration||1}" step="0.1" value="${Math.min(state.time,state.duration||0)}"></label></div><button class="p-prev icon-button" data-prev aria-label="Previous track">${icon('prev')}</button><button class="p-next icon-button" data-next aria-label="Next track">${icon('next')}</button><button class="p-queue icon-button" data-player aria-label="${state.playerOpen?'Close queue':'Open queue'}">${icon(state.playerOpen?'down':'up')}</button></footer><aside class="player-drawer ${state.playerOpen?'open':''}">${playerDrawer()}</aside>`}
function playerDrawer(){const t=active();return `<div class="drawer-now">${t?.art?`<img src="${esc(t.art.media_url)}" alt="">`:'<div class="drawer-mark">333</div>'}<div><span>NOW PLAYING</span><h2>${esc(t?.title||'—')}</h2><p>${esc(t?.pages?.map(p=>p.title).join(' / ')||'Studio 333')}</p></div></div><div class="drawer-list">${state.tracks.slice(0,100).map((x,i)=>`<button class="queue-row ${x.id===t?.id?'active':''}" data-track="${esc(x.id)}"><span>${String(i+1).padStart(3,'0')}</span><strong>${esc(x.title)}</strong><em>${esc(x.pages?.[0]?.title||'Archive')}</em></button>`).join('')}</div>`}
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
function trackCard(t,i){return `<button class="audio-card reveal ${t.id===active()?.id?'active':''}" data-track="${esc(t.id)}"><figure>${t.art?`<img src="${esc(t.art.media_url)}" alt="" loading="lazy">`:`<span>333</span>`}<i>${icon(t.id===active()?.id&&state.playing?'pause':'play')}</i></figure><div><small>${String(i+1).padStart(3,'0')} / ${esc(year(t))}</small><strong>${esc(t.title)}</strong><em>${esc(t.pages?.[0]?.title||'Studio 333')}</em></div></button>`}
function trackRow(t,i){return `<button class="audio-row ${t.id===active()?.id?'active':''}" data-track="${esc(t.id)}"><span>${String(i+1).padStart(3,'0')}</span><strong>${esc(t.title)}</strong><em>${esc(t.pages?.[0]?.title||'Studio 333')}</em><time>${esc(year(t))}</time><i>${icon(t.id===active()?.id&&state.playing?'pause':'play')}</i></button>`}

function cinemaBlock(v,label='CINEMA'){if(!v)return'';return `<section class="section-cinema reveal"><div class="section-cinema-media">${videoMedia(v,true)}</div><div class="section-cinema-scrim"></div><div class="section-cinema-copy"><span>${esc(label)} / ${esc((v.provider||'VIDEO').toUpperCase())}</span><h2>${esc(v.title||'Moving image')}</h2><button data-cinema="${esc(v.id)}">OPEN FULLSCREEN ${icon('arrow','icon icon-xs')}</button></div></section>`}
function sectionView(id){
  const sec=state.sections.find(x=>x.id===id)||{label:id};const p=sectionPage(id);const intro=sectionIntroParts(p);const cover=sectionCoverImage(id);const all=sectionImages(id);const coverKey=cover?imageKey(cover):null;const imgs=all.filter(im=>imageKey(im)!==coverKey).slice(0,6);const pages=sectionPages(id).filter(x=>x.id!==p?.id);const tracks=state.tracks.filter(t=>t.pages?.some(x=>x.section_id===id));const vid=sectionVideo(id);const vids=sectionVideos(id);
  return `<section class="section-page"><header class="section-cover ${cover?'has-media':'no-media'}"><div class="section-kicker">${esc(sec.label)} / ${String(tracks.length).padStart(2,'0')} AUDIO / ${String(all.length).padStart(2,'0')} IMAGES / ${String(vids.length).padStart(2,'0')} VIDEO</div><h1>${esc(sec.label)}</h1>${cover?`<figure><img src="${esc(cover.media_url)}" alt="${esc(cover.title||sec.label)}" fetchpriority="high"></figure>`:''}</header><div class="section-intro reveal"><p>${esc(intro.lead)}</p><span>${esc(intro.body)}</span></div>${cinemaBlock(vid,`${sec.label} / CINEMA`)}${videoArchive(vids,vid?.id)}<div class="section-gallery">${imgs.map((im,i)=>`<figure class="g${i%6} reveal"><img src="${esc(im.media_url)}" alt="${esc(im.title||'')}" loading="lazy"><figcaption>${esc(im.title||'ARCHIVE IMAGE')}</figcaption></figure>`).join('')}</div>${tracks.length?`<section class="section-listen"><header><span>LISTEN</span><strong>${tracks.length} RECORDINGS</strong></header>${tracks.slice(0,24).map((t,i)=>trackRow(t,i)).join('')}</section>`:''}${pages.length?`<section class="related-grid"><header>RELATED OBJECTS</header>${pages.slice(0,12).map((x,i)=>{const im=imageForPage(x);return `<button data-route="item" data-item="${esc(x.id)}">${im?`<img src="${esc(im.media_url)}" alt="" loading="lazy">`:''}<span>${String(i+1).padStart(2,'0')}</span><strong>${esc(x.title)}</strong><em>${esc(smartTruncate(x.excerpt||'',120))}</em></button>`}).join('')}</section>`:''}</section>`;
}

function itemView(id){
  const p=state.pages.find(x=>x.id===id);if(!p)return sectionView('archives');const imgs=uniqueImages(imagesForPage(p,24)).slice(0,10);const tracks=state.tracks.filter(t=>t.pages?.some(x=>x.id===p.id));const vids=videosForPage(p);
  return `<section class="object-page"><header class="object-head"><button data-route="home">← HOME</button><span>${esc(year(p))} / ARCHIVE OBJECT</span><h1>${esc(p.title)}</h1></header>${imgs[0]?`<figure class="object-hero"><img src="${esc(imgs[0].media_url)}" alt="${esc(imgs[0].title||'')}" fetchpriority="high"></figure>`:''}<div class="object-copy reveal">${paragraphs(p.text||p.excerpt||'')}</div>${cinemaBlock(vids[0],`${p.title} / CINEMA`)}${videoArchive(vids,vids[0]?.id)}<div class="object-gallery">${imgs.slice(1,14).map((im,i)=>`<figure class="o${i%5} reveal"><img src="${esc(im.media_url)}" alt="${esc(im.title||'')}" loading="lazy"><figcaption>${esc(im.title||'')}</figcaption></figure>`).join('')}</div>${tracks.length?`<section class="object-audio"><header>LISTENING OBJECTS</header>${tracks.map((t,i)=>trackRow(t,i)).join('')}</section>`:''}</section>`;
}

function paragraphs(text){return String(text||'').split(/\n\s*\n/).filter(Boolean).slice(0,12).map(x=>`<p>${esc(x)}</p>`).join('')}

function render(){
  const v=$('#view');if(!v)return;
  if(state.route==='home')v.innerHTML=home();else if(state.route==='archive')v.innerHTML=archive();else if(state.route==='images')v.innerHTML=home();else if(state.route==='section')v.innerHTML=sectionView(state.item||state.sections[0]?.id);else if(state.route==='item')v.innerHTML=itemView(state.item);else v.innerHTML=home();
  $('.index-overlay')?.classList.toggle('open',state.index);document.body.classList.toggle('index-open',state.index);renderPlayer();renderCinema();requestAnimationFrame(enhance);
}
function renderPlayer(){const f=$('.player');if(!f)return;const t=active();f.classList.toggle('has-error',!!state.audioError);const toggleBtn=$('.p-toggle',f);toggleBtn.innerHTML=icon(state.playing?'pause':'play');toggleBtn.setAttribute('aria-label',state.playing?'Pause':'Play');$('.p-title strong',f).textContent=t?.title||'LISTENING SPACE';$('.p-title span',f).textContent=state.audioError||t?.pages?.[0]?.title||'STUDIO 333 ARCHIVE';const seek=$('.p-seek',f);seek.max=state.duration||1;seek.value=Math.min(state.time,state.duration||0);const ratio=state.duration?clamp(state.time/state.duration,0,1):0;f.style.setProperty('--seek-progress',`${ratio*100}%`);$('time',f).textContent=`${fmt(state.time)} / ${fmt(state.duration)}`;const thumb=$('.p-thumb',f);thumb.innerHTML=t?.art?`<img src="${esc(t.art.media_url)}" alt="">`:'<span>333</span>';const q=$('.p-queue',f);q.innerHTML=icon(state.playerOpen?'down':'up');q.setAttribute('aria-label',state.playerOpen?'Close queue':'Open queue');$('.player-drawer')?.classList.toggle('open',state.playerOpen)}

function renderCinema(){const old=$('.cinema-overlay');if(!old)return;old.outerHTML=cinemaOverlay();document.body.classList.toggle('cinema-open',state.cinemaOpen)}

function bind(){
  document.addEventListener('click',e=>{
    const r=e.target.closest('[data-route]');if(r){routeTo(r.dataset.route,r.dataset.item||null);return}
    if(e.target.closest('[data-index]')){state.index=!state.index;render();return}
    if(e.target.closest('button[data-palette-control]')){state.palette=(state.palette+1)%4;localStorage.setItem('redroom-palette',String(state.palette));document.body.dataset.palette=String(state.palette);return}
    const cinemaId=e.target.closest('[data-cinema]')?.dataset.cinema;if(cinemaId){openCinema(state.videos.find(v=>v.id===cinemaId));return}
    if(e.target.closest('[data-cinema-close]')){state.cinemaOpen=false;state.activeVideo=null;renderCinema();return}
    const tid=e.target.closest('[data-track]')?.dataset.track;if(tid){play(state.tracks.find(x=>x.id===tid));return}
    if(e.target.closest('[data-toggle]'))toggle();if(e.target.closest('[data-prev]'))step(-1);if(e.target.closest('[data-next]'))step(1);
    if(e.target.closest('[data-player]')){state.playerOpen=!state.playerOpen;render();return}
    const mode=e.target.closest('[data-archive-mode]')?.dataset.archiveMode;if(mode){state.archiveMode=mode;render();return}
  });
  document.addEventListener('input',e=>{if(e.target.matches('.p-seek'))audio.currentTime=Number(e.target.value);if(e.target.id==='track-search'){state.query=e.target.value;const pos=e.target.selectionStart;render();const n=$('#track-search');n?.focus();n?.setSelectionRange(pos,pos)}});document.addEventListener('change',e=>{if(e.target.id==='collection-filter'){state.collectionId=e.target.value||'';render()}});
  addEventListener('hashchange',()=>{readRoute();render()});
  addEventListener('keydown',e=>{if(e.key==='Escape'&&state.cinemaOpen){state.cinemaOpen=false;state.activeVideo=null;renderCinema();return}if(e.key==='Escape'&&state.index){state.index=false;render()}if(e.code==='Space'&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){e.preventDefault();toggle()}});
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

Promise.all([json('./data/catalog.json',null),json('./data/build-content.json',{}),loadCuration()]).then(([catalog,build,curation])=>{if(!catalog)throw new Error('catalog unavailable');state.catalog=catalog;state.sections=catalog.sections||[];state.build=build||{};state.curation=curation||state.curation;readRoute();derive();shell();mediaSession()}).catch(err=>{document.body.innerHTML=`<main class="fatal"><strong>REDROOM / DATA SIGNAL LOST</strong><span>${esc(String(err))}</span></main>`});
