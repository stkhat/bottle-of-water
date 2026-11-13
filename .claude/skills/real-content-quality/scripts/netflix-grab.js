/* eslint-disable -- run with Claude in Chrome's javascript_tool (REPL): top-level await, and the last expression is the result */
const LEARNING="en", NATIVE="ja"; // the languages of the card's two lines
let n=0,last=-1,stable=0; for(let i=0;i<60;i++){ await new Promise(r=>setTimeout(r,1000)); const sr=document.querySelector('lingo-transcript')?.shadowRoot; n=sr?sr.querySelectorAll('[data-cue]').length:0; if(n>50&&n===last){stable++; if(stable>=3)break;} else stable=0; last=n; }
document.querySelector('video')?.pause();
const sr=document.querySelector('lingo-transcript').shadowRoot; const cards=[...sr.querySelectorAll('[data-cue]')].map(c=>({t:c.children[0]?.textContent, [LEARNING]:c.querySelector(`[lang=${LEARNING}]`)?.textContent||'', [NATIVE]:c.querySelector(`[lang=${NATIVE}]`)?.textContent||''}));
const id=location.pathname.split('/').pop(); let title='',show=''; try{const v=netflix.appContext.state.playerApp.getState().videoPlayer.videoMetadata[id]?._metadataObject?.video; show=v?.title||''; for(const s of v?.seasons||[]) for(const e of s.episodes||[]) if(String(e.id)===id) title='S'+s.seq+'E'+e.seq+' '+(e.title||'');}catch{}
const out={id, show, title, cards};
document.getElementById('__tqta')?.remove(); const ta=document.createElement('textarea'); ta.id='__tqta'; ta.style.cssText='position:fixed;top:0;left:0;width:200px;height:50px;z-index:2147483647'; ta.value=JSON.stringify(out); document.body.appendChild(ta); ta.focus(); ta.select();
({id, show, title, n:cards.length, withNative:cards.filter(c=>c[NATIVE]).length, size:ta.value.length, sample:cards[5]?.[LEARNING]})
