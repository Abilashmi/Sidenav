(function(){
"use strict";
var R="#fsn-root",SID="fsn-sidebar",TID="fsn-toggle",
PH="https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1.png",
SK="fsn-expanded";

function root(){return document.querySelector(R);}
function getShop(){var r=root();return r?r.dataset.shop:null;}
function getPageType(){var r=root();return r?(r.dataset.pageType||"index"):"index";}
function getPageHandle(){var r=root();return r?(r.dataset.pageHandle||""):"";}

function getContextualCollections(data){
  var m=data.mappings;
  if(!m||!Object.keys(m).length)return data.collections||[];
  var pt=getPageType(),h=getPageHandle();
  if(pt!=="collection"||!h)return data.collections||[];
  if(m[h])return m[h].items||[];
  var ks=Object.keys(m);
  for(var i=0;i<ks.length;i++){
    var items=m[ks[i]].items||[];
    if(items.some(function(x){return x.handle===h;}))return items;
  }
  return data.collections||[];
}

function filterActiveItem(data){
  var h=getPageHandle(),pt=getPageType();
  if(!h)return data;
  var cols=(data.collections||[])
    .filter(function(c){return!(pt==="collection"&&c.handle===h);})
    .map(function(c){
      if(!c.children||!c.children.length)return c;
      return Object.assign({},c,{children:c.children.filter(function(ch){return!(pt==="collection"&&ch.handle===h);})});
    });
  var prods=(data.products||[]).filter(function(p){return!(pt==="product"&&p.handle===h);});
  return Object.assign({},data,{collections:cols,products:prods});
}

function fetchSidebarData(shop){
  return new Promise(function(resolve){
    var u=window.FSN_APP_URL;
    if(!u){console.warn("[FSN] No app URL.");resolve(null);return;}
    if(u.indexOf("://")===-1)u="https://"+u;
    var x=new XMLHttpRequest();
    x.open("GET",u+"/api/sidebar-data?shop="+encodeURIComponent(shop));
    x.setRequestHeader("Accept","application/json");
    x.timeout=8000;
    x.onload=function(){
      if(x.status>=200&&x.status<300){try{resolve(JSON.parse(x.responseText));}catch(e){resolve(null);}}
      else resolve(null);
    };
    x.onerror=function(){console.warn("[FSN] Network error.");resolve(null);};
    x.ontimeout=function(){console.warn("[FSN] Timeout.");resolve(null);};
    x.send();
  });
}

function applyRootVars(s){
  var d=document.documentElement;
  d.style.setProperty("--fsn-icon-size",(s.iconSize||56)+"px");
  d.style.setProperty("--fsn-width",(s.sidebarWidth||280)+"px");
  d.style.setProperty("--fsn-top-margin",(s.topMargin||20)+"px");
  d.style.setProperty("--fsn-bottom-margin",(s.bottomMargin||20)+"px");
}

function detectHeaderHeight(){
  var sels=["header","#shopify-section-header",".site-header",".header","[data-section-type='header']",".announcement-bar","#shopify-section-announcement-bar"];
  var t=0;
  sels.forEach(function(s){var el=document.querySelector(s);if(el){var h=el.getBoundingClientRect().height;if(h>t)t=h;}});
  return t;
}

var _sy=0;
function lockBodyScroll(){
  if(!window.matchMedia("(max-width:768px)").matches)return;
  _sy=window.scrollY;
  document.body.style.cssText+="position:fixed;top:-"+_sy+"px;left:0;right:0;overflow-y:scroll;";
}
function unlockBodyScroll(){
  document.body.style.position="";document.body.style.top="";
  document.body.style.left="";document.body.style.right="";
  document.body.style.overflowY="";
  if(_sy)window.scrollTo(0,_sy);
}

function mkSvg(cls,d){
  var s=document.createElementNS("http://www.w3.org/2000/svg","svg");
  s.setAttribute("class",cls);s.setAttribute("viewBox","0 0 24 24");
  s.setAttribute("fill","none");s.setAttribute("stroke","currentColor");
  s.setAttribute("stroke-width","2.5");s.setAttribute("stroke-linecap","round");
  s.innerHTML=d;return s;
}

function buildToggle(isR,bg,text,z,shadow,accent,hover,badge){
  var b=document.createElement("button");
  b.id=TID;b.type="button";b.className=isR?"fsn-right":"fsn-left";
  if(shadow)b.classList.add("fsn-shadow");
  b.setAttribute("aria-label","Toggle collection sidebar");
  b.setAttribute("aria-expanded","false");
  b.style.setProperty("--fsn-bg",bg);b.style.setProperty("--fsn-text",text);b.style.setProperty("--fsn-z",String(z));
  b.style.setProperty("--fsn-accent",accent||text);b.style.setProperty("--fsn-hover",hover||"#f1f2f3");
  b.style.setProperty("--fsn-badge",badge||"#e53e3e");
  b.appendChild(mkSvg("fsn-icon-bars",'<line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="21" y2="17"/>'));
  b.appendChild(mkSvg("fsn-icon-x",'<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>'));
  return b;
}

function mkImg(src,alt){
  var i=document.createElement("img");
  i.src=src||PH;i.alt=alt;i.loading="lazy";i.decoding="async";
  i.onerror=function(){this.src=PH;};return i;
}
function mkSpan(cls,txt){var s=document.createElement("span");s.className=cls;s.textContent=txt;return s;}

function buildCollectionItem(col,shop){
  var a=document.createElement("a");
  a.className="fsn-item";a.href="https://"+shop+"/collections/"+col.handle;
  a.setAttribute("aria-label",col.label||col.title);
  var icon=document.createElement("div");icon.className="fsn-icon";
  var img=mkImg(col.image,col.label||col.title);img.width=80;img.height=80;
  icon.appendChild(img);a.appendChild(icon);
  a.appendChild(mkSpan("fsn-label",col.label||col.title));
  return a;
}

function buildChildItem(child,shop){
  var ah=getPageHandle(),isA=getPageType()==="collection"&&child.handle===ah;
  var a=document.createElement("a");
  a.className="fsn-child-item"+(isA?" fsn-active-child":"");
  a.href="https://"+shop+"/collections/"+child.handle;
  a.setAttribute("aria-label",child.label||child.title);
  a.setAttribute("aria-current",isA?"page":"false");
  var icon=document.createElement("div");icon.className="fsn-child-icon";
  icon.appendChild(mkImg(child.image,child.label||child.title));
  a.appendChild(icon);a.appendChild(mkSpan("fsn-child-label",child.label||child.title));
  return a;
}

function buildCollectionGroup(col,shop){
  var children=col.children||[];
  if(!children.length)return buildCollectionItem(col,shop);
  var ah=getPageHandle();
  var hasActive=children.some(function(c){return getPageType()==="collection"&&c.handle===ah;});
  var group=document.createElement("div");group.className="fsn-group";
  var btn=document.createElement("div");
  btn.className="fsn-item fsn-parent-toggle"+(hasActive?" fsn-parent-open":"");
  btn.setAttribute("role","button");btn.setAttribute("tabindex","0");
  btn.setAttribute("aria-expanded",hasActive?"true":"false");
  btn.setAttribute("aria-label",(col.label||col.title)+" — toggle sub-categories");
  var icon=document.createElement("div");icon.className="fsn-icon";
  var img=mkImg(col.image,col.label||col.title);img.width=80;img.height=80;
  icon.appendChild(img);btn.appendChild(icon);
  btn.appendChild(mkSpan("fsn-label",col.label||col.title));
  var chev=mkSpan("fsn-chevron","▾");chev.setAttribute("aria-hidden","true");btn.appendChild(chev);
  var cEl=document.createElement("div");
  cEl.className="fsn-children"+(hasActive?" fsn-expanded":"");
  children.forEach(function(c){cEl.appendChild(buildChildItem(c,shop));});
  function tog(e){
    if(e.type==="keydown"&&e.key!=="Enter"&&e.key!==" ")return;
    e.preventDefault();var o=cEl.classList.toggle("fsn-expanded");
    btn.setAttribute("aria-expanded",String(o));btn.classList.toggle("fsn-parent-open",o);
  }
  btn.addEventListener("click",tog);btn.addEventListener("keydown",tog);
  group.appendChild(btn);group.appendChild(cEl);return group;
}

function buildProductItem(prod,shop){
  var a=document.createElement("a");
  a.className="fsn-item fsn-item-product";a.href="https://"+shop+"/products/"+prod.handle;
  a.setAttribute("aria-label",prod.label||prod.title);
  var icon=document.createElement("div");icon.className="fsn-icon";
  var img=mkImg(prod.image,prod.label||prod.title);img.width=80;img.height=80;
  icon.appendChild(img);
  var meta=document.createElement("div");meta.className="fsn-product-meta";
  meta.appendChild(mkSpan("fsn-label",prod.label||prod.title));
  if(prod.price){meta.appendChild(mkSpan("fsn-price","$"+prod.price));}
  if(prod.badge){
    var bt=prod.badge.trim().toUpperCase();
    var bdg=mkSpan("fsn-badge",bt);
    if(bt==="SALE")bdg.classList.add("fsn-badge-sale");
    if(bt==="NEW")bdg.classList.add("fsn-badge-new");
    meta.appendChild(bdg);
  }
  a.appendChild(icon);a.appendChild(meta);return a;
}

function buildDivider(){var d=document.createElement("div");d.className="fsn-divider";return d;}

function populateItems(sb,data){
  var cols=data.collections||[],prods=data.products||[],shop=getShop();
  cols.forEach(function(c){sb.appendChild(buildCollectionGroup(c,shop));});
  if(cols.length&&prods.length)sb.appendChild(buildDivider());
  prods.forEach(function(p){sb.appendChild(buildProductItem(p,shop));});
}

function removeExistingSidebar(){
  document.querySelectorAll("#"+SID+",#"+TID).forEach(function(el){el.remove();});
  document.body.classList.remove("fsn-static-left","fsn-static-right");
}

function makeSetOpen(sb,tg){
  return function(open){
    if(open){sb.classList.add("fsn-open");tg.classList.add("fsn-open");tg.setAttribute("aria-expanded","true");lockBodyScroll();}
    else{sb.classList.remove("fsn-open");tg.classList.remove("fsn-open");tg.setAttribute("aria-expanded","false");unlockBodyScroll();}
    try{localStorage.setItem(SK,String(open));}catch(_){}
  };
}

function extractSettings(s){
  return{
    isR:s.position==="right",bg:s.backgroundColor||"#ffffff",text:s.textColor||"#1a1a1a",
    accent:s.accentColor||s.textColor||"#1a1a1a",hover:s.hoverColor||"#f1f2f3",badge:s.badgeColor||"#e53e3e",
    radius:s.borderRadius!=null?s.borderRadius:12,iconSize:s.iconSize!=null?s.iconSize:56,
    z:s.zIndex!=null?s.zIndex:9999,opacity:s.opacity!=null?s.opacity:1,shadow:!!s.shadow
  };
}

function applySidebarStyles(sb,e){
  sb.style.setProperty("--fsn-bg",e.bg);sb.style.setProperty("--fsn-text",e.text);
  sb.style.setProperty("--fsn-accent",e.accent);sb.style.setProperty("--fsn-hover",e.hover);
  sb.style.setProperty("--fsn-badge",e.badge);
  sb.style.setProperty("--fsn-radius",e.radius+"px");sb.style.setProperty("--fsn-icon-size",e.iconSize+"px");
  sb.style.setProperty("--fsn-z",String(e.z));sb.style.setProperty("--fsn-opacity",String(e.opacity));
}

function renderHamburger(data){
  var s=data.settings,e=extractSettings(s);
  var sb=document.createElement("div");sb.id=SID;
  sb.setAttribute("role","navigation");sb.setAttribute("aria-label","Site Navigation");
  sb.className=e.isR?"fsn-right":"fsn-left";
  if(e.shadow)sb.classList.add("fsn-shadow");
  if(s.mobileOnly)sb.classList.add("fsn-mobile-only");
  applySidebarStyles(sb,e);
  var anim=s.animationStyle||"slide";
  if(anim!=="slide")sb.classList.add("fsn-anim-"+anim);
  populateItems(sb,data);
  var tg=buildToggle(e.isR,e.bg,e.text,e.z,e.shadow,e.accent,e.hover,e.badge);
  if(s.mobileOnly)tg.classList.add("fsn-mobile-only");
  var setOpen=makeSetOpen(sb,tg);
  var isOpen;try{isOpen=localStorage.getItem(SK)==="true";}catch(_){isOpen=false;}
  tg.addEventListener("click",function(){setOpen(!sb.classList.contains("fsn-open"));});
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&sb.classList.contains("fsn-open"))setOpen(false);});
  document.body.appendChild(tg);document.body.appendChild(sb);setOpen(isOpen);
}

function renderStatic(data){
  var s=data.settings,e=extractSettings(s);
  var sb=document.createElement("div");sb.id=SID;
  sb.setAttribute("role","navigation");sb.setAttribute("aria-label","Site Navigation");
  sb.className=(e.isR?"fsn-right":"fsn-left")+" fsn-static";
  if(e.shadow)sb.classList.add("fsn-shadow");
  applySidebarStyles(sb,e);
  populateItems(sb,data);
  document.body.appendChild(sb);
  var mob=window.matchMedia("(max-width:768px)").matches;
  if(mob){
    var tg=buildToggle(e.isR,e.bg,e.text,e.z,e.shadow,e.accent,e.hover,e.badge);tg.classList.add("fsn-static-toggle");
    var setOpen=makeSetOpen(sb,tg);
    var wasOpen;try{wasOpen=localStorage.getItem(SK)==="true";}catch(_){wasOpen=false;}
    tg.addEventListener("click",function(){setOpen(!sb.classList.contains("fsn-open"));});
    document.addEventListener("keydown",function(ev){if(ev.key==="Escape"&&sb.classList.contains("fsn-open"))setOpen(false);});
    document.body.appendChild(tg);setOpen(wasOpen);
  }
  window.matchMedia("(max-width:768px)").addEventListener("change",function(ev){
    if(!ev.matches)unlockBodyScroll();
  });
}

function isPageAllowed(s){
  if(!s.pageVisibilityMode||s.pageVisibilityMode==="all")return true;
  var pt=getPageType();
  var m={index:s.showOnHome,collection:s.showOnCollection,product:s.showOnProduct,
    blog:s.showOnBlog,article:s.showOnArticle,cart:s.showOnCart,search:s.showOnSearch};
  return(pt in m)?!!m[pt]:!!s.showOnOtherPages;
}

// Phase 3 — Feature 1: Schedule check
// No schedules = always show. Schedules defined = show only during an active window.
function getActiveSchedules(data){
  var ss=data.schedules;
  if(!ss||!ss.length)return null;
  var now=Date.now();
  var active=[];
  for(var i=0;i<ss.length;i++){
    var s=ss[i];if(!s.enabled)continue;
    if(now>=new Date(s.startDate).getTime()&&now<=new Date(s.endDate).getTime())active.push(s);
  }
  return active;
}

function filterCollectionsByIds(cols,ids){
  var out=[];
  (cols||[]).forEach(function(c){
    var children=filterCollectionsByIds(c.children||[],ids);
    if(ids[c.id])out.push(c);
    else if(children.length)out.push(Object.assign({},c,{children:children}));
  });
  return out;
}

function applyScheduleItems(data,activeSchedules){
  if(!activeSchedules||!activeSchedules.length)return data;
  var cIds={},pIds={},hasSelection=false;
  activeSchedules.forEach(function(s){
    (s.collectionIds||[]).forEach(function(id){cIds[id]=true;hasSelection=true;});
    (s.productIds||[]).forEach(function(id){pIds[id]=true;hasSelection=true;});
  });
  if(!hasSelection)return data;
  return Object.assign({},data,{
    collections:filterCollectionsByIds(data.collections||[],cIds),
    products:(data.products||[]).filter(function(p){return !!pIds[p.id];})
  });
}

// Phase 3 — Feature 2: Device detection + settings override
function getDeviceType(){
  var w=window.innerWidth||document.documentElement.clientWidth;
  return w<=768?"mobile":w<=1024?"tablet":"desktop";
}

// Returns null if sidebar should be hidden on this device; otherwise returns data
// with settings merged from the device-specific override.
function applyDeviceOverrides(data){
  var ds=data.deviceSettings;if(!ds||!ds.length)return data;
  var dt=getDeviceType(),match=null;
  for(var i=0;i<ds.length;i++){if(ds[i].deviceType===dt&&ds[i].enabled){match=ds[i];break;}}
  if(!match)return data;
  try{
    var ov=JSON.parse(match.settingsJson);
    if(ov.showOnDevice===false)return null;
    var ms=Object.assign({},data.settings);
    if(ov.sidebarMode&&ov.sidebarMode!=="inherit")ms.sidebarMode=ov.sidebarMode;
    if(ov.position&&ov.position!=="inherit")ms.position=ov.position;
    if(ov.overrideWidth&&ov.sidebarWidth)ms.sidebarWidth=ov.sidebarWidth;
    return Object.assign({},data,{settings:ms});
  }catch(e){return data;}
}

// Phase 3 — Feature 3: Automatic navigation mode
// Collections are synced from Shopify via the Admin API (server-side) and
// embedded in the page via the shop metafield. No API keys exposed to visitors.
function getAutoCollections(data){
  var nm=data.navigationMode;
  if(!nm||nm.mode!=="automatic")return null;
  var rules={};try{rules=JSON.parse(nm.settingsJson);}catch(e){}
  var pt=getPageType(),h=getPageHandle(),cols=data.collections||[];
  if(pt!=="collection"||!h)return rules.fallbackToDefault!==false?cols:[];
  for(var i=0;i<cols.length;i++){
    if(cols[i].handle===h&&(cols[i].children||[]).length){
      if(rules.autoShowChildren!==false)return cols[i].children;
    }
  }
  for(var j=0;j<cols.length;j++){
    var ch=cols[j].children||[];
    if(ch.some(function(c){return c.handle===h;})){
      if(rules.autoShowSiblings!==false)return ch;
    }
  }
  return rules.fallbackToDefault!==false?cols:[];
}

function renderSidebar(rawData){
  // Phase 3 Feature 2: apply device-specific overrides first
  var data=applyDeviceOverrides(rawData);
  if(!data){console.warn("[FSN] Sidebar hidden on this device type.");return;}
  var s=data.settings;
  if(!s.enabled){console.warn("[FSN] Sidebar disabled in settings.");return;}
  if(!isPageAllowed(s)){console.warn("[FSN] Sidebar hidden on page:",getPageType());return;}
  // Phase 3 Feature 1: schedule gate
  var activeSchedules=getActiveSchedules(data);
  if(activeSchedules&&activeSchedules.length===0){console.warn("[FSN] No active schedule window.");return;}
  // Phase 3 Feature 3: auto mode uses synced collections embedded in page data (no API calls)
  var autoCols=getAutoCollections(data);
  if(autoCols!==null){data=Object.assign({},data,{collections:autoCols});}
  else{data=Object.assign({},data,{collections:getContextualCollections(data)});}
  data=filterActiveItem(data);
  data=applyScheduleItems(data,activeSchedules);
  if(!(data.collections||[]).length&&!(data.products||[]).length)return;
  removeExistingSidebar();
  applyRootVars(s);
  // Phase 3 Feature 4: dynamic header-height adjustment (theme conflict protection)
  var hh=detectHeaderHeight();
  if(hh>0)document.documentElement.style.setProperty("--fsn-top-margin",Math.max(s.topMargin||20,hh+8)+"px");
  (s.sidebarMode||"hamburger")==="static"?renderStatic(data):renderHamburger(data);
}

var _cache=null;

async function init(){
  var shop=getShop();if(!shop)return;
  if(document.getElementById(SID))return;
  if(window.FSN_DATA){if(!_cache)_cache=window.FSN_DATA;renderSidebar(window.FSN_DATA);return;}
  if(_cache){renderSidebar(_cache);return;}
  var data=await fetchSidebarData(shop);
  if(!data||data.error){console.warn("[FSN] Not rendered:",data?data.error:"fetch failed");return;}
  _cache=data;renderSidebar(data);
}

function rerender(){
  removeExistingSidebar();
  unlockBodyScroll();
  var d=_cache||window.FSN_DATA||null;if(d)renderSidebar(d);else init();
}

function reinit(){
  if(!document.getElementById(SID)){var d=_cache||window.FSN_DATA||null;if(d)renderSidebar(d);else init();}
}

// Phase 3 Feature 4: re-check header height on resize (handles sticky/dynamic headers)
var _rszTimer;
window.addEventListener("resize",function(){
  clearTimeout(_rszTimer);
  _rszTimer=setTimeout(function(){
    var sb=document.getElementById(SID);if(!sb)return;
    var d=_cache||window.FSN_DATA||null;if(!d)return;
    var s=d.settings;if(!s)return;
    var hh=detectHeaderHeight();
    if(hh>0)document.documentElement.style.setProperty("--fsn-top-margin",Math.max(s.topMargin||20,hh+8)+"px");
  },150);
},{passive:true});

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();

document.addEventListener("page:load",rerender);
document.addEventListener("turbo:load",rerender);
document.addEventListener("shopify:section:load",reinit);
window.addEventListener("popstate",rerender);

if(window.MutationObserver){
  new MutationObserver(function(muts){
    if(muts.some(function(m){return Array.from(m.removedNodes).some(function(n){return n.id===SID||n.id===TID;});}))reinit();
  }).observe(document.body,{childList:true});
}
})();
