/* eslint-disable -- run with Claude in Chrome's javascript_tool (REPL): top-level await, and the last expression is the result */
const LEARNING="en", NATIVE="ja"; // the learning track; the native human track and YouTube's translation (tlang)
await new Promise(r=>setTimeout(r,4000));
if(!window.__tqHooked){window.__tqHooked=true; window.__tqUrls=[]; const o=XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open=function(m,u,...r){ try{ if(String(u).includes("/api/timedtext")) window.__tqUrls.push(String(u)); }catch{} return o.call(this,m,u,...r)}; const f=window.fetch; window.fetch=function(i,...r){ try{const s=typeof i==="string"?i:i.url; if(s&&s.includes("/api/timedtext")) window.__tqUrls.push(s);}catch{} return f.call(this,i,...r)};}
const p=document.getElementById("movie_player");
const pr=p.getPlayerResponse(); const vid=pr.videoDetails.videoId;
const tracks=pr.captions?.playerCaptionsTracklistRenderer?.captionTracks||[];
const enM=tracks.find(t=>t.vssId==="."+LEARNING||t.vssId.startsWith("."+LEARNING+"-")||t.vssId.startsWith("."+LEARNING+"."));
const enA=tracks.find(t=>t.vssId==="a."+LEARNING);
const ja=tracks.find(t=>t.vssId==="."+NATIVE||t.vssId.startsWith("."+NATIVE+"."));
const findUrl=()=>window.__tqUrls.filter(n=>n.includes("v="+vid)).pop();
let u=findUrl();
if(!u){ p.loadModule("captions"); await new Promise(r=>setTimeout(r,2000)); const tl=p.getOption("captions","tracklist")||[]; const en=tl.find(t=>t.languageCode.startsWith(LEARNING)&&!t.kind)||tl.find(t=>t.languageCode.startsWith(LEARNING)); if(en){p.setOption("captions","track",{}); await new Promise(r=>setTimeout(r,300)); p.setOption("captions","track",en);} else { const b=document.querySelector(".ytp-subtitles-button"); if(b?.getAttribute("aria-pressed")==="true") b.click(); await new Promise(r=>setTimeout(r,300)); b?.click(); }
  for(let i=0;i<60&&!u;i++){await new Promise(r=>setTimeout(r,250)); u=findUrl();} }
let result;
if(!enM&&!enA) result="no "+LEARNING+" track: "+tracks.map(t=>t.vssId).join(",");
else if(!u) result="no url";
else {
const get=async (tr,tlang)=>{const x=new URL(u,location.href); for(const k of ["lang","name","kind","tlang"]) x.searchParams.delete(k); const b=new URL(tr.baseUrl,location.href).searchParams; for(const k of ["lang","name","kind"]) if(b.get(k)) x.searchParams.set(k,b.get(k)); x.searchParams.set("fmt","json3"); if(tlang)x.searchParams.set("tlang",tlang); const r=await fetch(x); const t=await r.text(); return t?{events:JSON.parse(t).events}:null;};
const enTrack=enM||enA; const enKind=enTrack.kind||null;
const out={id:vid,title:pr.videoDetails.title,channel:pr.videoDetails.author,lengthSeconds:pr.videoDetails.lengthSeconds,learningLang:LEARNING,nativeLang:NATIVE,trackKind:enKind||"manual",vss:enTrack.vssId,hasNative:!!ja,tracks:tracks.map(t=>t.vssId).join(",")};
out[LEARNING]=await get(enTrack);
out[NATIVE]= ja? await get(ja): null;
out.tlang=await get(enTrack,NATIVE);
p.unloadModule("captions"); p.pauseVideo();
document.getElementById("__tqta")?.remove(); const ta=document.createElement("textarea"); ta.id="__tqta"; ta.style.cssText="position:fixed;top:0;left:0;width:200px;height:50px;z-index:2147483647"; ta.value=JSON.stringify(out); document.body.appendChild(ta); ta.focus(); ta.select();
result={id:vid,title:out.title,trackKind:out.trackKind,hasNative:out.hasNative,[LEARNING]:out[LEARNING]?.events?.length,[NATIVE]:out[NATIVE]?.events?.length,tlang:out.tlang?.events?.length,size:ta.value.length};
}
result
