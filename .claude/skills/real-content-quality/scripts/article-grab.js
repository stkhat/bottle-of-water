/* eslint-disable -- run with Claude in Chrome's javascript_tool (REPL): top-level await, and the last expression is the result */
// Set ID (a short slug like "reuters-fed-rates") on the first line before running.
const ID='__ID__'; await new Promise(r=>setTimeout(r,3000));
const root=document.querySelector('#storytext, .RichTextStoryBody, .RichTextBody, [data-gu-name="body"], #maincontent, article')||document.querySelector('main')||document.body;
const paras=[...root.querySelectorAll('p, h2, li')].filter(p=>!p.closest('nav,footer,aside,figure,figcaption,[class*="Promo"],[class*="Related"],[data-component="links-block"],[data-testid*="promo"]')).map(p=>p.innerText.trim()).filter(t=>t.length>30);
const out={id:ID,url:location.href,title:document.querySelector('h1')?.innerText.trim(),paras, lingo:!!document.querySelector('lingo-article')};
document.getElementById('__tqta')?.remove(); const ta=document.createElement('textarea'); ta.id='__tqta'; ta.style.cssText='position:fixed;top:0;left:0;width:200px;height:50px;z-index:2147483647'; ta.value=JSON.stringify(out); document.body.appendChild(ta); ta.focus(); ta.select();
({title:out.title, n:paras.length, words:paras.join(' ').split(/\s+/).length, lingo:out.lingo, first:paras[0]?.slice(0,80), last:paras.at(-1)?.slice(0,80)})
