(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))n(s);new MutationObserver(s=>{for(const r of s)if(r.type==="childList")for(const o of r.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&n(o)}).observe(document,{childList:!0,subtree:!0});function t(s){const r={};return s.integrity&&(r.integrity=s.integrity),s.referrerPolicy&&(r.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?r.credentials="include":s.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function n(s){if(s.ep)return;s.ep=!0;const r=t(s);fetch(s.href,r)}})();const Id="modulepreload",Pd=function(i,e){return new URL(i,e).href},Qc={},Ld=function(e,t,n){let s=Promise.resolve();if(t&&t.length>0){let l=function(u){return Promise.all(u.map(h=>Promise.resolve(h).then(d=>({status:"fulfilled",value:d}),d=>({status:"rejected",reason:d}))))};const o=document.getElementsByTagName("link"),a=document.querySelector("meta[property=csp-nonce]"),c=a?.nonce||a?.getAttribute("nonce");s=l(t.map(u=>{if(u=Pd(u,n),u in Qc)return;Qc[u]=!0;const h=u.endsWith(".css"),d=h?'[rel="stylesheet"]':"";if(n)for(let g=o.length-1;g>=0;g--){const _=o[g];if(_.href===u&&(!h||_.rel==="stylesheet"))return}else if(document.querySelector(`link[href="${u}"]${d}`))return;const p=document.createElement("link");if(p.rel=h?"stylesheet":Id,h||(p.as="script"),p.crossOrigin="",p.href=u,c&&p.setAttribute("nonce",c),document.head.appendChild(p),h)return new Promise((g,_)=>{p.addEventListener("load",g),p.addEventListener("error",()=>_(new Error(`Unable to preload CSS for ${u}`)))})}))}function r(o){const a=new Event("vite:preloadError",{cancelable:!0});if(a.payload=o,window.dispatchEvent(a),!a.defaultPrevented)throw o}return s.then(o=>{for(const a of o||[])a.status==="rejected"&&r(a.reason);return e().catch(r)})},Dd=60,Dt=1/Dd,oo=.25,fe={LENGTH:18,WIDTH:9,ATTACK_LINE:3,FREE_ZONE:3,LINE_WIDTH:.05,NET_HEIGHT:2.43,NET_BAND:1,NET_OVERHANG:.5},tt={RADIUS:.105,GRAVITY:-9.81,RESTITUTION:.76,GROUND_FRICTION:.98,NET_RESTITUTION:.25,NET_DAMPING:.5,WALL_RESTITUTION:.5,REST_SPEED:.3},Nd=6;function lh(){return{x:0,y:tt.RADIUS,z:0,vx:0,vy:0,vz:0,px:0,py:tt.RADIUS,pz:0}}function Tc(i,e){i.px=i.x,i.py=i.y,i.pz=i.z,i.vy+=tt.GRAVITY*e,i.x+=i.vx*e,i.y+=i.vy*e,i.z+=i.vz*e,Ud(i),Od(i),Fd(i)}function Ud(i){if(!(i.pz>0!=i.z>0&&i.pz!==i.z))return;const t=i.pz/(i.pz-i.z),n=i.px+(i.x-i.px)*t,s=i.py+(i.y-i.py)*t,r=fe.WIDTH/2+fe.NET_OVERHANG,o=fe.NET_HEIGHT-fe.NET_BAND;if(!(Math.abs(n)<=r&&s>=o-tt.RADIUS&&s<=fe.NET_HEIGHT+tt.RADIUS))return;const c=i.pz>0?1:-1;i.x=n,i.y=s,i.z=c*tt.RADIUS,i.vz=-i.vz*tt.NET_RESTITUTION,i.vx*=tt.NET_DAMPING,i.vy*=tt.NET_DAMPING}function Od(i){if(!(i.y>=tt.RADIUS)){if(i.y=tt.RADIUS,i.vy<0){const e=-i.vy*tt.RESTITUTION;i.vy=e<tt.REST_SPEED?0:e}i.vx*=tt.GROUND_FRICTION,i.vz*=tt.GROUND_FRICTION}}function Fd(i){const e=fe.WIDTH/2+fe.FREE_ZONE-tt.RADIUS,t=fe.LENGTH/2+fe.FREE_ZONE-tt.RADIUS;i.x>e&&(i.x=e,i.vx=-Math.abs(i.vx)*tt.WALL_RESTITUTION),i.x<-e&&(i.x=-e,i.vx=Math.abs(i.vx)*tt.WALL_RESTITUTION),i.z>t&&(i.z=t,i.vz=-Math.abs(i.vz)*tt.WALL_RESTITUTION),i.z<-t&&(i.z=-t,i.vz=Math.abs(i.vz)*tt.WALL_RESTITUTION)}const el=[{speed:14,vy:3.5,lane:0},{speed:15,vy:3.2,lane:-1},{speed:12.5,vy:3.8,lane:1},{speed:16,vy:2.8,lane:0}];function kd(){const i={tick:0,time:0,cycle:-1,ball:lh()};return uh(i.ball,0),i.cycle=0,i}function Bd(i){i.tick+=1,i.time=i.tick*Dt;const e=Math.floor(i.time/Nd);e!==i.cycle&&(i.cycle=e,uh(i.ball,e)),Tc(i.ball,Dt)}function uh(i,e){const t=el[e%el.length],n=e%2===0?1:-1;i.x=t.lane*2,i.y=2.55,i.z=n*9.5,i.vx=-t.lane*1.2,i.vy=t.vy,i.vz=-n*t.speed,i.px=i.x,i.py=i.y,i.pz=i.z}const xt={A:1,B:-1};function cn(i){return i==="A"?"B":"A"}const zd=[{lx:3,lz:7},{lx:3,lz:3},{lx:0,lz:3},{lx:-3,lz:3},{lx:-3,lz:7},{lx:0,lz:7}];function _t(i,e,t){const n=xt[i];return{x:n*e,z:n*t}}function Hd(i){return[...i.slice(1),i[0]]}function xo(i,e){const t=zd[e-1];return _t(i,t.lx,t.lz)}function dr(i,e){const t=i.indexOf(e);return t===-1?null:t+1}function vn(i,e){const t=dr(i,e);return t===2||t===3||t===4}function hh(i,e){const t=dr(i,e);return t===1||t===5||t===6}function Vd(i){return _t(i,2,fe.LENGTH/2+.7)}function Gd(i,e){const t=xt[i]*e;return t>=0&&t<=fe.ATTACK_LINE}function dh(i,e){const t=fe.WIDTH/2,n=fe.LENGTH/2;return Math.abs(i)>t||Math.abs(e)>n?null:e>=0?"A":"B"}const fh=25;function Wd({rotationA:i,rotationB:e,servingTeam:t="A",target:n=fh}){return{score:{A:0,B:0},servingTeam:t,target:n,rotations:{A:[...i],B:[...e]},setOver:!1,winner:null}}function _n(i){return i.rotations[i.servingTeam][0]}function Xd(i,e,t){if(i.setOver)return[];const n=[];return n.push({type:"DEAD_BALL",reason:t}),i.score[e]+=1,n.push({type:"SCORE",team:e,score:{...i.score}}),e!==i.servingTeam&&(i.rotations[e]=Hd(i.rotations[e]),i.servingTeam=e,n.push({type:"ROTATE",team:e})),jd(i.score,e,i.target)&&(i.setOver=!0,i.winner=e,n.push({type:"SET_END",winner:e,score:{...i.score}})),n}function jd(i,e,t=fh){const n=i[e],s=i[cn(e)];return n>=t&&n-s>=2}function Kd(i){return i>=4}const bc=["jump","power","reaction","stamina","speed","control","serve","block"];function vo({id:i,name:e,teamId:t,naturalRole:n="outside",currentRole:s="outside",height:r=1.85,attributes:o={},trust:a=50,trustFloor:c=0,techniques:l={}}={}){const u={};for(const h of bc)u[h]=tl(o[h]??50);return{id:i,name:e,teamId:t,naturalRole:n,currentRole:s,height:{current:r,timeline:[]},attributes:u,techniques:{spike:1,jumpServe:1,block:1,receive:1,emergencySet:1,tip:1,floatServe:1,pipe:1,feint:1,dive:1,feintUses:8,...l},trust:{fromSetter:tl(a),floorShare:c}}}function qd(i){const e=i.techniques?.feintUses??8;return Math.min(1.2,.6+e*.05)}function tl(i){return Math.max(0,Math.min(100,i))}function Di(i){return i.height.current*1.31}function ph(i){return .3+i.attributes.jump/100*.65}function Ac(i){return Di(i)+ph(i)}function Yd(i){return Di(i)+ph(i)*.85}function $d(i){return 2.8+i.attributes.speed/100*2.4}function Zd(i){return JSON.stringify(i)}function nl(i){const e=JSON.parse(i);for(const t of["id","teamId","naturalRole","currentRole","height","attributes"])if(e[t]===void 0)throw new Error(`Player 序列化資料缺欄位：${t}`);for(const t of bc)if(typeof e.attributes[t]!="number")throw new Error(`Player.attributes 缺數值欄位：${t}`);if(typeof e.height.current!="number"||!Array.isArray(e.height.timeline))throw new Error("Player.height 結構不合法（需 current:number 與 timeline:array）");return e}const Qs=9.81;function mh(i,e,t){const n=Math.max(i.y,e.y)+.15,s=Math.max(t,n),r=Math.sqrt(2*Qs*(s-i.y)),o=r/Qs,a=Math.sqrt(2*(s-e.y)/Qs),c=o+a;return{vx:(e.x-i.x)/c,vy:r,vz:(e.z-i.z)/c,time:c}}function Jd(i,e,t){return{vx:(e.x-i.x)/t,vy:(e.y-i.y)/t+.5*Qs*t,vz:(e.z-i.z)/t,time:t}}const Qd=fe.NET_HEIGHT+tt.RADIUS+.12;function gh(i,e,t,n){const s=Math.hypot(e.x-i.x,e.y-i.y,e.z-i.z);let r=Math.max(s/t,n);if(i.z>0!=e.z>0){const o=i.z/(i.z-e.z),a=Qd-i.y-o*(e.y-i.y),c=.5*Qs*o*(1-o);a>0&&c>1e-9&&(r=Math.max(r,Math.sqrt(a/c)))}return Jd(i,e,r)}function ef(i,e){if(e.vz===0)return null;const t=-i.z/e.vz;return t>0?i.y+e.vy*t+.5*tt.GRAVITY*t*t:null}function _h(i,e=900){const t={...i};for(let n=1;n<=e;n+=1){const s=t.y;if(Tc(t,Dt),s>tt.RADIUS+1e-9&&t.y<=tt.RADIUS+1e-9)return{x:t.x,z:t.z,ticks:n}}return null}function tf(i){return i>>>0}function nf(i){let e=i+1831565813>>>0,t=e;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),[((t^t>>>14)>>>0)/4294967296,e]}function ao(i){const[e,t]=nf(i.rngState);return i.rngState=t,e}const ei=1e-4,sf=[[4,5],[3,6],[2,1]],rf=[[4,3,2],[5,6,1]];function Bi(i){const e=i.feet.filter(t=>t.grounded);return e.length>0?e:i.feet}const Ro=i=>Math.min(...i.map(e=>e.x)),Co=i=>Math.max(...i.map(e=>e.x)),of=i=>Math.min(...i.map(e=>e.y)),af=i=>Math.max(...i.map(e=>e.y));function il(i,e){const t=[],n={};for(const s of i)n[s.zone]=s;for(const s of i){if(s.isServer)continue;Bi(s).every(a=>a.x<-ei||a.x>fe.WIDTH+ei||a.y<-ei||a.y>fe.LENGTH/2+ei)&&t.push({type:"positional_fault",rule:"7.4",zones:[s.zone],detail:"out_of_court"})}if(e)return{legal:t.length===0,faults:t};for(const[s,r]of sf){const o=Bi(n[s]),a=Bi(n[r]);af(a)<of(o)-ei&&t.push({type:"positional_fault",rule:"7.4.3.1",zones:[s,r],detail:`back_${r}_fully_in_front_of_${s}`})}for(const[s,r,o]of rf){const a=Bi(n[s]),c=Bi(n[r]),l=Bi(n[o]),u=(h,d,p)=>{h||t.push({type:"positional_fault",rule:"7.4.3.2",zones:[d,p],detail:`lateral_order_${d}_${p}`})};u(Ro(a)<=Co(c)+ei,s,r),u(Co(l)>=Ro(c)-ei,o,r),u(Ro(a)<=Co(l)+ei,s,o)}return{legal:t.length===0,faults:t}}function cf(i){const e=i.map(n=>Math.max(0,n.trust)*(n.rowFactor??1)),t=e.reduce((n,s)=>n+s,0);return t<=0?i.map(()=>1/i.length):e.map(n=>n/t)}function lf(i,e,t){let n=0;for(let s=0;s<i.length;s+=1)if(n+=e[s],t<n)return i[s];return i[i.length-1]}function uf(i,e){const t=i.trust.fromSetter+e;return i.trust.fromSetter=Math.max(0,Math.min(100,t)),i.trust.fromSetter}const Us={KILL:5,KILL_STREAK:3,ERR:-6,ERR_STREAK:-4,CLAMP:25};function sl(i,e,t){const n=i.trustStreak[e]??0,s=t?Math.max(1,n+1):Math.min(-1,n-1);i.trustStreak[e]=s;const r=t?Us.KILL+(s>=2?Us.KILL_STREAK:0):Us.ERR+(s<=-2?Us.ERR_STREAK:0),o=(i.trustDyn[e]??0)+r;i.trustDyn[e]=Math.max(-25,Math.min(Us.CLAMP,o))}function hf(i,e){const t=i.trustDyn?.[e.id]??0;return Math.max(0,Math.min(100,e.trust.fromSetter+t))}function df(i,e){const t=i.findIndex(o=>(o.floorShare??0)>0);if(t<0)return e;const n=Math.min(.9,i[t].floorShare);if(e[t]>=n)return e;const s=1-e[t],r=s>0?(1-n)/s:0;return e.map((o,a)=>a===t?n:o*r)}const We={SERVE_DEAD_TICKS:110,REACH_RADIUS:1.3,TOUCH_COOLDOWN:15,SCATTER_MAX:1.7,BLOCK_WINDOW:48,BLOCK_REACH_X:1.1,SERVE_APEX:4.6,POWER_SERVE_APEX:3.5,POWER_SERVE_SCATTER:1.45,FLOAT_APEX_MUL:.8,FLOAT_SCATTER:1.05,FLOAT_RECEIVE_MUL:1.28,DIVE_REACH_MUL:1.8,DIVE_MAX_Y:1.15,DIVE_RECOVER_TICKS:42,RECEIVE_APEX:4.8,SET_APEX:5.2,QUICK_APEX:3.4,SPIKE_SPEED_BASE:9,SPIKE_SPEED_PER:.17,SPIKE_MIN_TIME:.18,TIP_SPEED_MIN:.55,SWEET_LO:.7,SWEET_HI:1.05,OVERCHARGE_T:1.15,SWEET_ACC:.55,OVER_ACC:1.5,PERFECT_RECV_ACC:.5,BLOCK_SWEET_MIN:4,BLOCK_SWEET_MAX:26,BLOCK_LATE_MUL:.6,BLOCK_EARLY_MUL:.55,THETA_MAX_DEG:45,DECEIVE_GAIN:.7,ERROR_GAIN:.5,TAKEOFF_LOOKBACK_TICKS:24};function Aa({seed:i=1,teams:e,setTarget:t,aiProfiles:n,scoutRead:s,liberos:r}={}){const o=e??Eh(),a={},c={};for(const u of["A","B"]){const h=r?.[u]?[r[u]]:[];for(const d of[...o[u],...h])a[d.id]=d,c[d.id]={x:0,z:0,px:0,pz:0,blockUntil:-1,blockStartTick:-9999,lastTouchTick:-9999,divedUntil:-1,zHistory:[]}}const l={tick:0,seed:i,aiProfiles:n??null,scoutRead:s??null,liberos:r?Object.fromEntries(Object.entries(r).filter(([,u])=>u).map(([u,h])=>[u,{liberoId:h.id,replacedId:null}])):null,scoutTally:{},trustDyn:{},trustStreak:{},rngState:tf(i),players:a,actors:c,match:Wd({rotationA:o.A.map(u=>u.id),rotationB:o.B.map(u=>u.id),...t?{target:t}:{}}),phase:"serve",serveReadyTick:0,ball:lh(),rally:{flightId:0,profile:null,touches:0,possession:null,lastTouchTeam:null,lastToucherId:null,deceiveP:0,lastSpikeZone:null,serveStyle:null,touchLockTick:-1},events:[]};return Mh(l),l}function Ys(i,e=[]){if(i.phase==="set_over")return[];const t=[];for(const n of Object.values(i.actors))n.px=n.x,n.pz=n.z,n.zHistory.push(n.z),n.zHistory.length>We.TAKEOFF_LOOKBACK_TICKS&&n.zHistory.shift();for(const n of e){if(n.tick!==i.tick)continue;const s=i.actors[n.playerId];s&&(ff(i,s,n),n.action&&vf(i,n,t))}return xf(i),i.phase==="rally"&&wf(i,t),i.tick+=1,i.events.push(...t),t}function ff(i,e,t){if(i.tick<e.divedUntil)return;let{x:n=0,z:s=0}=t.move??{};const r=Math.hypot(n,s);r>1&&(n/=r,s/=r);const o=i.players[t.playerId],a=$d(o),c=fe.WIDTH/2+fe.FREE_ZONE-.2,l=fe.LENGTH/2+fe.FREE_ZONE-.2,u=xt[o.teamId];e.x=Li(e.x+n*a*Dt,-c,c);const h=e.z+s*a*Dt;e.z=u===1?Li(h,.12,l):Li(h,-l,-.12)}function Li(i,e,t){return Math.max(e,Math.min(t,i))}function pf(i,e,t){if(t<=.45)return"tip";if(Math.abs(e)<1.8)return"middle";const n=i>=0?1:-1;return(e>=0?1:-1)===n?"line":"cross"}function xh(i,e){return i.scoutTally[e]||(i.scoutTally[e]={zones:{line:0,cross:0,middle:0,tip:0},feints:0,spikes:0,serves:{jumps:0,floats:0,total:0}}),i.scoutTally[e]}function mf(i,e){const t=i.scoutRead?.[e],n=i.rally.lastSpikeZone;if(!t||!n||i.rally.lastToucherId!==t.targetId)return 1;const s=t.zones??{},r=(s.line??0)+(s.cross??0)+(s.middle??0)+(s.tip??0);if(r<6)return 1;const o=(s[n]??0)/r;return o>.35?1+(t.read??0)*(o-.35)*1.8:o<.15?Math.max(.6,1-(t.read??0)*.25):1}function gf(i){return i.zHistory.length>0?i.zHistory[0]:i.z}const rl=.55,_f=.08;function xf(i){const e=fe.WIDTH/2+fe.FREE_ZONE-.2,t=fe.LENGTH/2+fe.FREE_ZONE-.2;for(const n of["A","B"]){const s=i.match.rotations[n],r=xt[n],o=r===1?.12:-t,a=r===1?t:-.12;for(let c=0;c<s.length;c+=1)for(let l=c+1;l<s.length;l+=1){const u=i.actors[s[c]],h=i.actors[s[l]];let d=h.x-u.x,p=h.z-u.z,g=Math.hypot(d,p);if(g>=rl)continue;g<1e-6&&(d=1,p=0,g=1);const _=Math.min((rl-g)/2,_f),m=d/g*_,f=p/g*_;u.x=Li(u.x-m,-e,e),h.x=Li(h.x+m,-e,e),u.z=Li(u.z-f,o,a),h.z=Li(h.z+f,o,a)}}}function vf(i,e,t){const{rally:n,ball:s,match:r}=i,o=i.players[e.playerId],a=i.actors[e.playerId];if(e.action==="serve"){if(i.phase!=="serve"||e.playerId!==_n(r)||i.tick<i.serveReadyTick)return;Mf(i,e,t);return}if(i.phase!=="rally")return;if(e.action==="block"){a.blockUntil<i.tick&&(a.blockStartTick=i.tick),a.blockUntil=i.tick+We.BLOCK_WINDOW;return}if(n.touchLockTick===i.tick||i.tick-a.lastTouchTick<We.TOUCH_COOLDOWN||i.tick<a.divedUntil||n.profile==="serve"&&o.teamId===n.lastTouchTeam||s.z*xt[o.teamId]<0||e.action==="spike"&&o.currentRole==="libero"&&s.y>fe.NET_HEIGHT)return;const c=e.action==="dive";if(c&&(o.techniques?.dive??1)<1||(c&&(a.divedUntil=i.tick+We.DIVE_RECOVER_TICKS),Math.hypot(s.x-a.x,s.z-a.z)>We.REACH_RADIUS*(c?We.DIVE_REACH_MUL:1)))return;const u=e.action==="spike"?Ac(o):c?We.DIVE_MAX_Y:Di(o)+.35;s.y>u||s.y<tt.RADIUS||yf(i,e,o,a,t)}function yf(i,e,t,n,s){const{rally:r,ball:o}=i,a=t.teamId,c=a===r.possession?r.touches+1:1;if(Kd(c)){ir(i,cn(a),"FOUR_HITS",s);return}if(e.action==="spike"&&hh(i.match.rotations[a],t.id)&&Gd(a,gf(n))&&o.y>fe.NET_HEIGHT){ir(i,cn(a),"BACK_ROW_ATTACK",s);return}const l={x:o.x,y:o.y,z:o.z},u=e.action==="spike"?Ef(l,e.aim,e.gaze):{deceiveP:0,errorBoost:0};u.deceiveP>0&&(u.deceiveP*=qd(t));const h=e.timing??1,d=r.profile==="serve"&&r.serveStyle==="float"&&(e.action==="receive"||e.action==="dive")?We.FLOAT_RECEIVE_MUL:1,p=e.action==="receive"||e.action==="dive"?Af(l.y,t)*Tf(h)*d:e.action==="spike"?Sf(h):1,g=yh(i,e.aim,t.attributes.control,e.action,u.errorBoost,p),_=h>We.OVERCHARGE_T?Math.min(al(h),.85):al(h);let m;if(e.action==="spike"){const f=vh(t)*(We.TIP_SPEED_MIN+(1-We.TIP_SPEED_MIN)*_);m=gh(l,{x:g.x,y:tt.RADIUS,z:g.z},f,We.SPIKE_MIN_TIME)}else{const f=e.action==="set"?h<.5?We.QUICK_APEX:We.SET_APEX:We.RECEIVE_APEX;m=mh(l,{x:g.x,y:tt.RADIUS,z:g.z},f)}if(o.vx=m.vx,o.vy=m.vy,o.vz=m.vz,o.px=o.x,o.py=o.y,o.pz=o.z,e.action==="spike"){const f=pf(n.x,e.aim.x,_);r.lastSpikeZone=f;const y=xh(i,t.id);y.zones[f]+=1,y.spikes+=1,u.deceiveP>0&&(y.feints+=1)}else r.lastSpikeZone=null;r.touches=c,r.possession=a,r.lastTouchTeam=a,r.lastToucherId=t.id,r.deceiveP=u.deceiveP,r.profile=e.action==="spike"?"spike":"arc",r.flightId+=1,r.touchLockTick=i.tick,n.lastTouchTick=i.tick,s.push({type:"TOUCH",tick:i.tick,team:a,playerId:t.id,kind:e.action,touches:c,ballY:Math.round(l.y*100)/100,power:Math.round(_*100)/100})}function ol(i,e){const t=xt[e],n=_n(i.match);return i.match.rotations[e].map((s,r)=>{const o=i.actors[s];return{zone:r+1,feet:[{x:t*o.x+fe.WIDTH/2,y:t*o.z,grounded:!0}],isServer:s===n&&e===i.match.servingTeam}})}function Mf(i,e,t){const{ball:n,rally:s}=i,r=i.players[e.playerId],o=i.actors[e.playerId],a=r.teamId,c=cn(a),l=il(ol(i,c),!1),u=il(ol(i,a),!0),h=l.legal?u.legal?null:a:c;if(h){t.push({type:"POSITIONAL_FAULT",tick:i.tick,team:h,faults:(h===c?l:u).faults}),ir(i,cn(h),"POSITIONAL_FAULT",t);return}const d=Math.max(Ac(r)*.92,2.2);n.x=o.x,n.y=d,n.z=o.z;const p=(e.timing??1)>1.1,g=!p&&e.style==="float";s.serveStyle=g?"float":null;const _=xh(i,r.id).serves;_.total+=1,p&&(_.jumps+=1),g&&(_.floats+=1);const m=yh(i,e.aim,r.attributes.serve,"serve",0,p?We.POWER_SERVE_SCATTER:g?We.FLOAT_SCATTER:1),f=Math.max(p?We.POWER_SERVE_APEX:g?We.SERVE_APEX*We.FLOAT_APEX_MUL:We.SERVE_APEX,d+.35),y=mh(n,{x:m.x,y:tt.RADIUS,z:m.z},f);n.vx=y.vx,n.vy=y.vy,n.vz=y.vz,n.px=n.x,n.py=n.y,n.pz=n.z,s.touches=0,s.possession=a,s.lastTouchTeam=a,s.lastToucherId=r.id,s.deceiveP=0,s.profile="serve",s.flightId+=1,o.lastTouchTick=i.tick,i.phase="rally",t.push({type:"SERVE",tick:i.tick,team:a,playerId:r.id})}function vh(i){return We.SPIKE_SPEED_BASE+i.attributes.power*We.SPIKE_SPEED_PER}function Ef(i,e,t){const n={theta:0,deceiveP:0,errorBoost:0};if(!t||t.x===e.x&&t.z===e.z||e.x===i.x&&e.z===i.z||t.x===i.x&&t.z===i.z)return n;const s=Math.atan2(e.x-i.x,e.z-i.z),r=Math.atan2(t.x-i.x,t.z-i.z);let o=Math.abs(s-r);o>Math.PI&&(o=Math.PI*2-o);const a=o*180/Math.PI,c=Math.min(a/We.THETA_MAX_DEG,1);return{theta:a,deceiveP:c*We.DECEIVE_GAIN,errorBoost:c*c*We.ERROR_GAIN}}function Sf(i){return i>=We.SWEET_LO&&i<=We.SWEET_HI?We.SWEET_ACC:i>We.OVERCHARGE_T?We.OVER_ACC:1}function Tf(i){return i>=.95?We.PERFECT_RECV_ACC:1}function bf(i){return i<We.BLOCK_SWEET_MIN?We.BLOCK_LATE_MUL:i>We.BLOCK_SWEET_MAX?We.BLOCK_EARLY_MUL:1}function Af(i,e){const t=Di(e)*.62;return i>=t?.7:i<.55?1.35:1}function al(i){return Math.max(0,Math.min(1,i))}function yh(i,e,t,n,s=0,r=1){const o=n==="set"?.55:n==="spike"?1.2:n==="serve"?1.35:1,a=We.SCATTER_MAX*((1-t/100)*o*r+s),c=ao(i)*Math.PI*2,l=ao(i)*a;return{x:e.x+Math.cos(c)*l,z:e.z+Math.sin(c)*l}}function wf(i,e){const t=i.ball,n=t.z,s=t.y;Tc(t,Dt);const r=n>0!=t.z>0&&n!==t.z;let o=!1;if(r){const a=t.z>0?"A":"B";o=i.rally.profile==="spike"&&Rf(i,a,e),o||(i.rally.possession=a,i.rally.touches=0,e.push({type:"BALL_OVER_NET",tick:i.tick,toTeam:a}))}if(!o&&s>tt.RADIUS+1e-9&&t.y<=tt.RADIUS+1e-9){const a=dh(t.x,t.z);if(a)ir(i,cn(a),"BALL_IN",e);else{const c=i.rally.lastTouchTeam??i.match.servingTeam;ir(i,cn(c),"OUT",e)}}}function Rf(i,e,t){const n=i.ball;if(n.y<fe.NET_HEIGHT-.15)return!1;let s=null;for(const c of Object.values(i.players)){if(c.teamId!==e||!Cf(i,e,c.id))continue;const l=i.actors[c.id];if(l.blockUntil<i.tick)continue;const u=Math.abs(l.x-n.x);u>We.BLOCK_REACH_X||n.y>Yd(c)+tt.RADIUS||(!s||u<s.dx||u===s.dx&&c.id<s.p.id)&&(s={p:c,actor:l,dx:u})}if(!s||i.rally.deceiveP>0&&ao(i)<i.rally.deceiveP)return!1;const r=i.tick-s.actor.blockStartTick,o=(.12+s.p.attributes.block*.004)*bf(r)*mf(i,e);if(ao(i)>=o)return!1;n.vz=-n.vz*.35,n.vx*=.6,n.vy=2.2;const a=i.rally;return a.touches=0,a.lastTouchTeam=e,a.lastToucherId=s.p.id,a.deceiveP=0,a.profile="arc",a.flightId+=1,t.push({type:"BLOCK_TOUCH",tick:i.tick,team:e,playerId:s.p.id}),!0}function Cf(i,e,t){const s=i.match.rotations[e].indexOf(t);return s===1||s===2||s===3}function ir(i,e,t,n){const s=i.rally;s.profile==="spike"&&s.lastToucherId&&(t==="BALL_IN"&&s.lastTouchTeam===e?sl(i,s.lastToucherId,!0):t==="OUT"&&s.lastTouchTeam!==e&&sl(i,s.lastToucherId,!1));const r={x:i.ball.x,z:i.ball.z};for(const o of Xd(i.match,e,t))n.push(o.type==="DEAD_BALL"?{tick:i.tick,...o,at:r}:{tick:i.tick,...o});i.match.setOver?i.phase="set_over":Mh(i)}function If(i){if(i.liberos)for(const e of["A","B"]){const t=i.liberos[e];if(!t)continue;const n=i.match.rotations[e],s=n.indexOf(t.liberoId);if(s>=0&&s<=3&&(n[s]=t.replacedId,i.events.push({type:"LIBERO_SWAP",tick:i.tick,team:e,inId:t.replacedId,outId:t.liberoId}),t.replacedId=null),!n.includes(t.liberoId))for(const r of[4,5]){const o=n[r];if(i.players[o].currentRole==="middle"){t.replacedId=o,n[r]=t.liberoId,i.events.push({type:"LIBERO_SWAP",tick:i.tick,team:e,inId:t.liberoId,outId:o});break}}for(const r of Object.values(i.players)){if(r.teamId!==e||n.includes(r.id))continue;const o=i.actors[r.id];o.x=-6.6,o.z=xt[e]*10.6,o.px=o.x,o.pz=o.z}}}function Mh(i){If(i),i.phase="serve",i.serveReadyTick=i.tick+We.SERVE_DEAD_TICKS;for(const o of["A","B"])i.match.rotations[o].forEach((c,l)=>{const u=xo(o,l+1),h=i.actors[c];h.x=u.x,h.z=u.z,h.px=u.x,h.pz=u.z,h.blockUntil=-1,h.divedUntil=-1});const e=_n(i.match),t=Vd(i.match.servingTeam),n=i.actors[e];n.x=t.x,n.z=t.z,n.px=t.x,n.pz=t.z;const s=i.ball;s.x=t.x,s.y=1.6,s.z=t.z,s.vx=0,s.vy=0,s.vz=0,s.px=s.x,s.py=s.y,s.pz=s.z;const r=i.rally;r.flightId+=1,r.profile=null,r.touches=0,r.possession=null,r.lastTouchTeam=null,r.lastToucherId=null,r.deceiveP=0,r.touchLockTick=-1}const Pf=[{role:"setter",height:1.83,trust:20},{role:"outside",height:1.88,trust:60},{role:"middle",height:1.96,trust:20},{role:"opposite",height:1.9,trust:20},{role:"outside",height:1.86,trust:20},{role:"middle",height:1.94,trust:20}];function Eh(){const i=e=>Pf.map((t,n)=>vo({id:`${e}${n+1}`,name:`${e}隊${n+1}號`,teamId:e,naturalRole:t.role,currentRole:t.role,height:t.height,trust:t.trust,attributes:{jump:60,power:62,reaction:60,stamina:60,speed:62,control:68,serve:60,block:58}}));return{A:i("A"),B:i("B")}}const Lf=["serve","receive","set","spike","block","dive"];function co({playerId:i,tick:e,move:t={x:0,z:0},action:n=null,aim:s={x:0,z:0},gaze:r=null,timing:o=1,style:a=null}){if(i===void 0||e===void 0)throw new Error("Intent 必須帶 playerId 與 tick");if(n!==null&&!Lf.includes(n))throw new Error(`未知的 Intent action：${n}`);return{playerId:i,tick:e,move:t,action:n,aim:s,gaze:r??s,timing:o,style:a}}const Ot={SERVE_DELAY:30,ARRIVE_EPS:.06,ATTEMPT_RADIUS:.95,SPIKE_MIN_Y:fe.NET_HEIGHT*.85,SETTER_SPOT:{lx:1.2,lz:1.2},ATTACK_LZ:1.3,BLOCK_LZ:.6,BLOCK_SPREAD:1.5,TIP_RATE:.1,DUMP_RATE:.07,DIG_SHIFT:.35};function wc(i,e){const t=i.aiProfiles?.[e];return{tipRate:t?.tipRate??Ot.TIP_RATE,dumpRate:t?.dumpRate??Ot.DUMP_RATE,jumpServeRate:t?.jumpServeRate??t?.powerServeRate??0,floatServeRate:t?.floatServeRate??0}}function wa(){return{flightId:-1,planTick:0,landing:null,landingTeam:null,claimId:null,attackerId:null,attackKind:null,setterDump:!1,letDrop:!1}}function Sh(i,e,t=[]){Df(i,e);const n=[];for(const s of[...i.match.rotations.A,...i.match.rotations.B]){if(t.includes(s))continue;const r=Hf(i,e,s);r&&n.push(r)}return n}function Df(i,e){if(i.phase!=="rally"||e.flightId===i.rally.flightId)return;e.flightId=i.rally.flightId,e.planTick=i.tick;const t=_h(i.ball);if(e.landing=t,e.landingTeam=t?t.z>=0?"A":"B":null,e.claimId=null,e.letDrop=!1,!t||!e.landingTeam)return;const n=e.landingTeam,s=i.rally;if(!(s.possession===n&&s.touches>=3))if(s.possession===n&&s.touches===1){const r=Yf(i,n),o=r.find(u=>u.currentRole==="setter"&&u.id!==s.lastToucherId),a=r.find(u=>u.currentRole==="opposite"&&u.id!==s.lastToucherId);e.claimId=o?.id??a?.id??Io(i,n,t,s.lastToucherId);const c=Ff(n,t),l=zf(i,n,e.claimId,c);e.attackerId=l?.pid??null,e.attackKind=l?.kind??null,e.setterDump=!!e.claimId&&i.players[e.claimId].currentRole==="setter"&&vn(i.match.rotations[n],e.claimId)&&c==="perfect"&&fr(i.rally.flightId*331+7+(i.seed??0))<wc(i,n).dumpRate}else if(s.possession===n&&s.touches===2){const r=e.attackerId;e.claimId=r&&r!==s.lastToucherId&&i.players[r]?r:Io(i,n,t,s.lastToucherId)}else{const r=Io(i,n,t,s.lastToucherId,s.profile!=="spike"),o=Nf(t);o>0&&r&&o>Uf(i,r)?(e.claimId=null,e.letDrop=!0):e.claimId=r,e.attackerId=null,e.attackKind=null}}function Nf(i){const e=Math.max(0,Math.abs(i.x)-fe.WIDTH/2),t=Math.max(0,Math.abs(i.z)-fe.LENGTH/2);return Math.hypot(e,t)}function Uf(i,e){const n=.55-i.players[e].attributes.reaction*.005,s=(fr(i.rally.flightId*131+Rc(e)+(i.seed??0))-.5)*.3;return Math.max(.08,n+s)}function fr(i){let e=Math.imul(i|0,2654435761);return e^=e>>>16,e=Math.imul(e,73244475),e^=e>>>16,(e>>>0)/4294967296}function Rc(i){let e=0;for(let t=0;t<i.length;t+=1)e=e*31+i.charCodeAt(t);return e}function Io(i,e,t,n,s=!1){const r=i.match.rotations[e];let o=null;for(const a of r){if(a===n)continue;const c=dr(r,a),l=xo(e,c);let u=Math.hypot(l.x-t.x,l.z-t.z);const h=i.players[a].currentRole,d=h==="middle"&&vn(r,a);if(s&&(h==="setter"||d))continue;h==="setter"?u*=3:d&&(u*=1.8);const p=Math.hypot(i.actors[a].x-t.x,i.actors[a].z-t.z);(!o||u<o.zoneDist-1e-9||Math.abs(u-o.zoneDist)<=1e-9&&(p<o.nowDist-1e-9||Math.abs(p-o.nowDist)<=1e-9&&a<o.pid))&&(o={pid:a,zoneDist:u,nowDist:p})}return o?o.pid:null}function Of(i,e,t,n="perfect"){const s=i.match.rotations[e],r=[];for(const o of s){if(o===t)continue;const a=i.players[o],c=vn(s,o),l=a.currentRole;if(c)l==="outside"?r.push({pid:o,kind:"left",rowFactor:1}):l==="middle"&&n==="perfect"?r.push({pid:o,kind:"quick",rowFactor:1}):l==="opposite"&&r.push({pid:o,kind:"right",rowFactor:1});else if(n!=="poor"){if(!((a.techniques?.pipe??1)>=1))continue;l==="outside"?r.push({pid:o,kind:"pipe",rowFactor:.5}):l==="opposite"&&r.push({pid:o,kind:"dball",rowFactor:.5})}}return r}function Ff(i,e){const t=_t(i,Ot.SETTER_SPOT.lx,Ot.SETTER_SPOT.lz),n=Math.hypot(e.x-t.x,e.z-t.z);return n<1.2?"perfect":n<3?"ok":"poor"}function Ra(i,e,t){const n=i.match.rotations[e],s=i.players[t].currentRole;return vn(n,t)?_t(e,s==="outside"?-3:s==="middle"?0:3,3):_t(e,s==="outside"?0:s==="middle"||s==="libero"?-3:3,7)}function kf(i,e,t,n){const s=i.match.rotations[e],r=i.players[t].currentRole,o=i.actors[n],a=xt[e]*o.x,c=xt[e]*o.z;if(vn(s,t))return _t(e,(r==="outside"?-3:r==="middle"?0:3)*.6+a*.3,1.3);if(r==="middle"||r==="libero")return _t(e,0,6.6);const u=Math.max(-4.2,Math.min(4.2,a+(r==="outside"?-1.5:1.5)));return _t(e,u,Math.min(c+1.5,7.5))}function Bf(i,e,t,n){return n==="quick"?{lx:0,lz:1,t:.4}:n==="left"?{lx:-3,lz:1.3,t:.75}:n==="right"?{lx:3,lz:1.3,t:.75}:n==="pipe"?{lx:-1,lz:3.6,t:.75}:n==="dball"?{lx:2.6,lz:3.6,t:.75}:{lx:2,lz:Ot.ATTACK_LZ,t:.75}}function zf(i,e,t,n="perfect"){const s=Of(i,e,t,n);if(s.length===0)return null;const r=s.map(c=>({...c,trust:hf(i,i.players[c.pid]),floorShare:i.players[c.pid].trust.floorShare??0})),o=df(r,cf(r)),a=fr(i.rally.flightId*977+131+(i.seed??0));return lf(r,o,a)}function Hf(i,e,t){const n=i.tick,s=i.players[t],r=i.actors[t],o=s.teamId;if(i.phase==="serve"){if(t===_n(i.match)){if(n>=i.serveReadyTick+Ot.SERVE_DELAY){const{score:u}=i.match,h=wc(i,o),d=fr(u.A*37+u.B*101+Rc(t)+(i.seed??0)),p=d<h.jumpServeRate,g=!p&&d<h.jumpServeRate+h.floatServeRate;return co({playerId:t,tick:n,action:"serve",aim:Xf(i,o),...p?{timing:1.15}:{},...g?{style:"float"}:{}})}return null}return ti(t,n,r,qf(i,o,t))}if(i.phase!=="rally")return null;const a=i.rally;if(e.claimId===t&&e.landing){if(n-e.planTick<jf(s))return null;const u=i.ball;if(Math.hypot(u.x-r.x,u.z-r.z)<=We.REACH_RADIUS*Ot.ATTEMPT_RADIUS&&u.vy<0){const[_,m,f]=Vf(i,e,s,r);if(_&&u.y<=Wf(s,_))return co({playerId:t,tick:n,action:_,aim:m,timing:f??(_==="spike"?1:.75)})}const p=Math.hypot(u.vx,u.vz),g=p>.5?.3:0;return ti(t,n,r,{x:e.landing.x+(g?u.vx/p*g:0),z:e.landing.z+(g?u.vz/p*g:0)})}const c=a.possession&&a.possession!==o,l=e.landingTeam===o&&a.profile!=="spike";if(c&&!l&&vn(i.match.rotations[o],t)){const u=s.currentRole,h=u==="middle"?0:u==="outside"?-1:1,d=xt[o]*h*Ot.BLOCK_SPREAD;if(h!==0&&Math.abs(i.ball.x)>1.8&&Math.sign(d)!==Math.sign(i.ball.x))return ti(t,n,r,{x:d*2,z:xt[o]*2.6});let g=ul(i.ball.x+d);if(h===0){const y=Math.sign(i.ball.x),x=ul(i.ball.x+y*Ot.BLOCK_SPREAD);y!==0&&Math.abs(x-g)<Ot.BLOCK_SPREAD*.9&&(g=x-y*Ot.BLOCK_SPREAD)}const _={x:g,z:xt[o]*Ot.BLOCK_LZ},m=a.profile==="spike"&&e.landingTeam===o?"block":null,f=ti(t,n,r,_);return m&&(f.action="block"),f}if(c&&!l&&!vn(i.match.rotations[o],t)){const u=Ra(i,o,t),h=xt[o]*i.ball.x,d=Math.max(-1.2,Math.min(1.2,h*Ot.DIG_SHIFT));return ti(t,n,r,{x:u.x+xt[o]*d,z:u.z-xt[o]*.8})}return s.currentRole==="setter"&&a.possession!==o&&e.landingTeam===o&&!e.letDrop?ti(t,n,r,_t(o,2.2,1.2)):a.possession===o&&e.attackerId&&e.attackerId!==t&&(a.touches===2&&i.ball.vy<0||a.touches===3&&a.profile==="spike")?ti(t,n,r,kf(i,o,t,e.attackerId)):ti(t,n,r,Ra(i,o,t))}function Vf(i,e,t,n){const s=t.teamId,r=i.rally;if(r.touches===0)return["receive",_t(s,Ot.SETTER_SPOT.lx,Ot.SETTER_SPOT.lz)];if(r.touches===1){if(e.setterDump&&t.currentRole==="setter")return["spike",_t(cn(s),1.5,2.6),.3];const u=Bf(i,s,e.attackerId,e.attackKind);return["set",_t(s,u.lx,u.lz),u.t]}const o=Kf(i,s),a=xt[s]*n.z;if(t.currentRole!=="libero"&&(vn(i.match.rotations[s],t.id)||a>fe.ATTACK_LINE+.05)&&i.ball.y>=Ot.SPIKE_MIN_Y&&Gf(i,t,o)){const{tipRate:u}=wc(i,s),h=fr(i.rally.flightId*563+Rc(t.id)+(i.seed??0));if(h<u){const d=h<u/2?-1.2:1.2;return["spike",_t(cn(s),d,2.3),.35]}return["spike",o]}return["receive",_t(cn(s),0,6.5)]}function Gf(i,e,t){const n=i.ball;if(n.z>0==t.z>0)return!1;const s={x:n.x,y:n.y,z:n.z},r=gh(s,{x:t.x,y:tt.RADIUS,z:t.z},vh(e),We.SPIKE_MIN_TIME),o=ef(s,r);return o!==null&&o>=fe.NET_HEIGHT+tt.RADIUS+.1}function Wf(i,e){return e==="spike"?Ac(i):Di(i)+.35}const cl=[{lx:2.5,lz:7.8},{lx:-2.5,lz:7.8},{lx:0,lz:8.2},{lx:2,lz:6.5}];function Xf(i,e){const{score:t}=i.match,n=cl[(t.A+t.B)%cl.length];return _t(cn(e),n.lx,n.lz)}function jf(i){return Math.max(6,Math.round(24-i.attributes.reaction*.16))}const ll=[{lx:4.1,lz:5},{lx:-4.1,lz:5},{lx:1.5,lz:4.8},{lx:-1.5,lz:4.8},{lx:0,lz:2.3}];function Kf(i,e){const{score:t}=i.match,n=ll[(t.A+t.B+i.rally.flightId)%ll.length];return _t(cn(e),n.lx,n.lz)}function qf(i,e,t){const n=i.match.rotations[e];return xo(e,dr(n,t))}function ti(i,e,t,n){const s=n.x-t.x,r=n.z-t.z,o=Math.hypot(s,r),a=o<Ot.ARRIVE_EPS?{x:0,z:0}:{x:s/o,z:r/o};return co({playerId:i,tick:e,move:a,aim:{x:n.x,z:n.z}})}function ul(i){const e=fe.WIDTH/2-.4;return Math.max(-e,Math.min(e,i))}function Yf(i,e){return i.match.rotations[e].map(t=>i.players[t])}const hl={low:{dpr:1,shadowSize:0,antialias:!1},med:{dpr:1.5,shadowSize:1024,antialias:!0},high:{dpr:0,shadowSize:2048,antialias:!0}};function $f(i=window.location.search){const e=new URLSearchParams(i),t=Object.hasOwn(hl,e.get("quality")??"")?e.get("quality"):"high",n=hl[t],s=Number.parseFloat(e.get("dpr")),r=Number.isFinite(s)&&s>0?Math.min(s,3):n.dpr||Math.min(window.devicePixelRatio||1,3),o=e.has("shadows")?Zf(e.get("shadows"),n.shadowSize):n.shadowSize,a=e.has("aa")?e.get("aa")!=="0":n.antialias,c=Number.parseInt(e.get("players"),10),l=Number.isFinite(c)?Math.min(Math.max(c,1),60):12,u=e.get("model"),h=u&&/^[\w.-]+\.glb$/.test(u)?u:"soldier.glb";return{preset:t,dpr:r,shadowSize:o,antialias:a,players:l,model:h}}function Zf(i,e){if(i==="off"||i==="0")return 0;const t=Number.parseInt(i,10);return[512,1024,2048,4096].includes(t)?t:e}function Jf(i){const e=i.shadowSize===0?"off":`${i.shadowSize}`;return`${i.preset} · dpr ${i.dpr.toFixed(2)} · shadows ${e} · aa ${i.antialias?"on":"off"} · players ${i.players}`}const Cc="178",hs={ROTATE:0,DOLLY:1,PAN:2},os={ROTATE:0,PAN:1,DOLLY_PAN:2,DOLLY_ROTATE:3},Qf=0,dl=1,ep=2,Th=1,bh=2,Wn=3,Jn=0,Zt=1,sn=2,fi=0,ds=1,fl=2,pl=3,ml=4,tp=5,Ii=100,np=101,ip=102,sp=103,rp=104,op=200,ap=201,cp=202,lp=203,Ca=204,Ia=205,up=206,hp=207,dp=208,fp=209,pp=210,mp=211,gp=212,_p=213,xp=214,Pa=0,La=1,Da=2,_s=3,Na=4,Ua=5,Oa=6,Fa=7,Ah=0,vp=1,yp=2,pi=0,Mp=1,Ep=2,Sp=3,wh=4,Tp=5,bp=6,Ap=7,gl="attached",wp="detached",Rh=300,xs=301,vs=302,ka=303,Ba=304,yo=306,Ni=1e3,di=1001,lo=1002,jt=1003,Ch=1004,$s=1005,rn=1006,Jr=1007,qn=1008,Pn=1009,Ih=1010,Ph=1011,sr=1012,Ic=1013,Ui=1014,Tn=1015,pr=1016,Pc=1017,Lc=1018,rr=1020,Lh=35902,Dh=1021,Nh=1022,gn=1023,or=1026,ar=1027,Dc=1028,Nc=1029,Uh=1030,Uc=1031,Oc=1033,Qr=33776,eo=33777,to=33778,no=33779,za=35840,Ha=35841,Va=35842,Ga=35843,Wa=36196,Xa=37492,ja=37496,Ka=37808,qa=37809,Ya=37810,$a=37811,Za=37812,Ja=37813,Qa=37814,ec=37815,tc=37816,nc=37817,ic=37818,sc=37819,rc=37820,oc=37821,io=36492,ac=36494,cc=36495,Oh=36283,lc=36284,uc=36285,hc=36286,Rp=2200,Cp=2201,Ip=2202,cr=2300,lr=2301,Po=2302,as=2400,cs=2401,uo=2402,Fc=2500,Pp=2501,Lp=0,Fh=1,dc=2,Dp=3200,Np=3201,kh=0,Up=1,hi="",wt="srgb",Kt="srgb-linear",ho="linear",ut="srgb",zi=7680,_l=519,Op=512,Fp=513,kp=514,Bh=515,Bp=516,zp=517,Hp=518,Vp=519,fc=35044,xl="300 es",Yn=2e3,fo=2001;class _i{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});const n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){const n=this._listeners;return n===void 0?!1:n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){const n=this._listeners;if(n===void 0)return;const s=n[e];if(s!==void 0){const r=s.indexOf(t);r!==-1&&s.splice(r,1)}}dispatchEvent(e){const t=this._listeners;if(t===void 0)return;const n=t[e.type];if(n!==void 0){e.target=this;const s=n.slice(0);for(let r=0,o=s.length;r<o;r++)s[r].call(this,e);e.target=null}}}const kt=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];let vl=1234567;const er=Math.PI/180,ys=180/Math.PI;function bn(){const i=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(kt[i&255]+kt[i>>8&255]+kt[i>>16&255]+kt[i>>24&255]+"-"+kt[e&255]+kt[e>>8&255]+"-"+kt[e>>16&15|64]+kt[e>>24&255]+"-"+kt[t&63|128]+kt[t>>8&255]+"-"+kt[t>>16&255]+kt[t>>24&255]+kt[n&255]+kt[n>>8&255]+kt[n>>16&255]+kt[n>>24&255]).toLowerCase()}function Ke(i,e,t){return Math.max(e,Math.min(t,i))}function kc(i,e){return(i%e+e)%e}function Gp(i,e,t,n,s){return n+(i-e)*(s-n)/(t-e)}function Wp(i,e,t){return i!==e?(t-i)/(e-i):0}function tr(i,e,t){return(1-t)*i+t*e}function Xp(i,e,t,n){return tr(i,e,1-Math.exp(-t*n))}function jp(i,e=1){return e-Math.abs(kc(i,e*2)-e)}function Kp(i,e,t){return i<=e?0:i>=t?1:(i=(i-e)/(t-e),i*i*(3-2*i))}function qp(i,e,t){return i<=e?0:i>=t?1:(i=(i-e)/(t-e),i*i*i*(i*(i*6-15)+10))}function Yp(i,e){return i+Math.floor(Math.random()*(e-i+1))}function $p(i,e){return i+Math.random()*(e-i)}function Zp(i){return i*(.5-Math.random())}function Jp(i){i!==void 0&&(vl=i);let e=vl+=1831565813;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}function Qp(i){return i*er}function em(i){return i*ys}function tm(i){return(i&i-1)===0&&i!==0}function nm(i){return Math.pow(2,Math.ceil(Math.log(i)/Math.LN2))}function im(i){return Math.pow(2,Math.floor(Math.log(i)/Math.LN2))}function sm(i,e,t,n,s){const r=Math.cos,o=Math.sin,a=r(t/2),c=o(t/2),l=r((e+n)/2),u=o((e+n)/2),h=r((e-n)/2),d=o((e-n)/2),p=r((n-e)/2),g=o((n-e)/2);switch(s){case"XYX":i.set(a*u,c*h,c*d,a*l);break;case"YZY":i.set(c*d,a*u,c*h,a*l);break;case"ZXZ":i.set(c*h,c*d,a*u,a*l);break;case"XZX":i.set(a*u,c*g,c*p,a*l);break;case"YXY":i.set(c*p,a*u,c*g,a*l);break;case"ZYZ":i.set(c*g,c*p,a*u,a*l);break;default:console.warn("THREE.MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+s)}}function Sn(i,e){switch(e.constructor){case Float32Array:return i;case Uint32Array:return i/4294967295;case Uint16Array:return i/65535;case Uint8Array:return i/255;case Int32Array:return Math.max(i/2147483647,-1);case Int16Array:return Math.max(i/32767,-1);case Int8Array:return Math.max(i/127,-1);default:throw new Error("Invalid component type.")}}function at(i,e){switch(e.constructor){case Float32Array:return i;case Uint32Array:return Math.round(i*4294967295);case Uint16Array:return Math.round(i*65535);case Uint8Array:return Math.round(i*255);case Int32Array:return Math.round(i*2147483647);case Int16Array:return Math.round(i*32767);case Int8Array:return Math.round(i*127);default:throw new Error("Invalid component type.")}}const zh={DEG2RAD:er,RAD2DEG:ys,generateUUID:bn,clamp:Ke,euclideanModulo:kc,mapLinear:Gp,inverseLerp:Wp,lerp:tr,damp:Xp,pingpong:jp,smoothstep:Kp,smootherstep:qp,randInt:Yp,randFloat:$p,randFloatSpread:Zp,seededRandom:Jp,degToRad:Qp,radToDeg:em,isPowerOfTwo:tm,ceilPowerOfTwo:nm,floorPowerOfTwo:im,setQuaternionFromProperEuler:sm,normalize:at,denormalize:Sn};class we{constructor(e=0,t=0){we.prototype.isVector2=!0,this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){const t=this.x,n=this.y,s=e.elements;return this.x=s[0]*t+s[3]*n+s[6],this.y=s[1]*t+s[4]*n+s[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=Ke(this.x,e.x,t.x),this.y=Ke(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=Ke(this.x,e,t),this.y=Ke(this.y,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Ke(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const n=this.dot(e)/t;return Math.acos(Ke(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){const n=Math.cos(t),s=Math.sin(t),r=this.x-e.x,o=this.y-e.y;return this.x=r*n-o*s+e.x,this.y=r*s+o*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}}class ln{constructor(e=0,t=0,n=0,s=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=s}static slerpFlat(e,t,n,s,r,o,a){let c=n[s+0],l=n[s+1],u=n[s+2],h=n[s+3];const d=r[o+0],p=r[o+1],g=r[o+2],_=r[o+3];if(a===0){e[t+0]=c,e[t+1]=l,e[t+2]=u,e[t+3]=h;return}if(a===1){e[t+0]=d,e[t+1]=p,e[t+2]=g,e[t+3]=_;return}if(h!==_||c!==d||l!==p||u!==g){let m=1-a;const f=c*d+l*p+u*g+h*_,y=f>=0?1:-1,x=1-f*f;if(x>Number.EPSILON){const A=Math.sqrt(x),w=Math.atan2(A,f*y);m=Math.sin(m*w)/A,a=Math.sin(a*w)/A}const v=a*y;if(c=c*m+d*v,l=l*m+p*v,u=u*m+g*v,h=h*m+_*v,m===1-a){const A=1/Math.sqrt(c*c+l*l+u*u+h*h);c*=A,l*=A,u*=A,h*=A}}e[t]=c,e[t+1]=l,e[t+2]=u,e[t+3]=h}static multiplyQuaternionsFlat(e,t,n,s,r,o){const a=n[s],c=n[s+1],l=n[s+2],u=n[s+3],h=r[o],d=r[o+1],p=r[o+2],g=r[o+3];return e[t]=a*g+u*h+c*p-l*d,e[t+1]=c*g+u*d+l*h-a*p,e[t+2]=l*g+u*p+a*d-c*h,e[t+3]=u*g-a*h-c*d-l*p,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,s){return this._x=e,this._y=t,this._z=n,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){const n=e._x,s=e._y,r=e._z,o=e._order,a=Math.cos,c=Math.sin,l=a(n/2),u=a(s/2),h=a(r/2),d=c(n/2),p=c(s/2),g=c(r/2);switch(o){case"XYZ":this._x=d*u*h+l*p*g,this._y=l*p*h-d*u*g,this._z=l*u*g+d*p*h,this._w=l*u*h-d*p*g;break;case"YXZ":this._x=d*u*h+l*p*g,this._y=l*p*h-d*u*g,this._z=l*u*g-d*p*h,this._w=l*u*h+d*p*g;break;case"ZXY":this._x=d*u*h-l*p*g,this._y=l*p*h+d*u*g,this._z=l*u*g+d*p*h,this._w=l*u*h-d*p*g;break;case"ZYX":this._x=d*u*h-l*p*g,this._y=l*p*h+d*u*g,this._z=l*u*g-d*p*h,this._w=l*u*h+d*p*g;break;case"YZX":this._x=d*u*h+l*p*g,this._y=l*p*h+d*u*g,this._z=l*u*g-d*p*h,this._w=l*u*h-d*p*g;break;case"XZY":this._x=d*u*h-l*p*g,this._y=l*p*h-d*u*g,this._z=l*u*g+d*p*h,this._w=l*u*h+d*p*g;break;default:console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: "+o)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){const n=t/2,s=Math.sin(n);return this._x=e.x*s,this._y=e.y*s,this._z=e.z*s,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){const t=e.elements,n=t[0],s=t[4],r=t[8],o=t[1],a=t[5],c=t[9],l=t[2],u=t[6],h=t[10],d=n+a+h;if(d>0){const p=.5/Math.sqrt(d+1);this._w=.25/p,this._x=(u-c)*p,this._y=(r-l)*p,this._z=(o-s)*p}else if(n>a&&n>h){const p=2*Math.sqrt(1+n-a-h);this._w=(u-c)/p,this._x=.25*p,this._y=(s+o)/p,this._z=(r+l)/p}else if(a>h){const p=2*Math.sqrt(1+a-n-h);this._w=(r-l)/p,this._x=(s+o)/p,this._y=.25*p,this._z=(c+u)/p}else{const p=2*Math.sqrt(1+h-n-a);this._w=(o-s)/p,this._x=(r+l)/p,this._y=(c+u)/p,this._z=.25*p}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<1e-8?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(Ke(this.dot(e),-1,1)))}rotateTowards(e,t){const n=this.angleTo(e);if(n===0)return this;const s=Math.min(1,t/n);return this.slerp(e,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){const n=e._x,s=e._y,r=e._z,o=e._w,a=t._x,c=t._y,l=t._z,u=t._w;return this._x=n*u+o*a+s*l-r*c,this._y=s*u+o*c+r*a-n*l,this._z=r*u+o*l+n*c-s*a,this._w=o*u-n*a-s*c-r*l,this._onChangeCallback(),this}slerp(e,t){if(t===0)return this;if(t===1)return this.copy(e);const n=this._x,s=this._y,r=this._z,o=this._w;let a=o*e._w+n*e._x+s*e._y+r*e._z;if(a<0?(this._w=-e._w,this._x=-e._x,this._y=-e._y,this._z=-e._z,a=-a):this.copy(e),a>=1)return this._w=o,this._x=n,this._y=s,this._z=r,this;const c=1-a*a;if(c<=Number.EPSILON){const p=1-t;return this._w=p*o+t*this._w,this._x=p*n+t*this._x,this._y=p*s+t*this._y,this._z=p*r+t*this._z,this.normalize(),this}const l=Math.sqrt(c),u=Math.atan2(l,a),h=Math.sin((1-t)*u)/l,d=Math.sin(t*u)/l;return this._w=o*h+this._w*d,this._x=n*h+this._x*d,this._y=s*h+this._y*d,this._z=r*h+this._z*d,this._onChangeCallback(),this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){const e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),s=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(s*Math.sin(e),s*Math.cos(e),r*Math.sin(t),r*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}class N{constructor(e=0,t=0,n=0){N.prototype.isVector3=!0,this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(yl.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(yl.setFromAxisAngle(e,t))}applyMatrix3(e){const t=this.x,n=this.y,s=this.z,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6]*s,this.y=r[1]*t+r[4]*n+r[7]*s,this.z=r[2]*t+r[5]*n+r[8]*s,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){const t=this.x,n=this.y,s=this.z,r=e.elements,o=1/(r[3]*t+r[7]*n+r[11]*s+r[15]);return this.x=(r[0]*t+r[4]*n+r[8]*s+r[12])*o,this.y=(r[1]*t+r[5]*n+r[9]*s+r[13])*o,this.z=(r[2]*t+r[6]*n+r[10]*s+r[14])*o,this}applyQuaternion(e){const t=this.x,n=this.y,s=this.z,r=e.x,o=e.y,a=e.z,c=e.w,l=2*(o*s-a*n),u=2*(a*t-r*s),h=2*(r*n-o*t);return this.x=t+c*l+o*h-a*u,this.y=n+c*u+a*l-r*h,this.z=s+c*h+r*u-o*l,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){const t=this.x,n=this.y,s=this.z,r=e.elements;return this.x=r[0]*t+r[4]*n+r[8]*s,this.y=r[1]*t+r[5]*n+r[9]*s,this.z=r[2]*t+r[6]*n+r[10]*s,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=Ke(this.x,e.x,t.x),this.y=Ke(this.y,e.y,t.y),this.z=Ke(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=Ke(this.x,e,t),this.y=Ke(this.y,e,t),this.z=Ke(this.z,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Ke(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){const n=e.x,s=e.y,r=e.z,o=t.x,a=t.y,c=t.z;return this.x=s*c-r*a,this.y=r*o-n*c,this.z=n*a-s*o,this}projectOnVector(e){const t=e.lengthSq();if(t===0)return this.set(0,0,0);const n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return Lo.copy(this).projectOnVector(e),this.sub(Lo)}reflect(e){return this.sub(Lo.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const n=this.dot(e)/t;return Math.acos(Ke(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,n=this.y-e.y,s=this.z-e.z;return t*t+n*n+s*s}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){const s=Math.sin(t)*e;return this.x=s*Math.sin(n),this.y=Math.cos(t)*e,this.z=s*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){const t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),s=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=s,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){const e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}}const Lo=new N,yl=new ln;class Xe{constructor(e,t,n,s,r,o,a,c,l){Xe.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,n,s,r,o,a,c,l)}set(e,t,n,s,r,o,a,c,l){const u=this.elements;return u[0]=e,u[1]=s,u[2]=a,u[3]=t,u[4]=r,u[5]=c,u[6]=n,u[7]=o,u[8]=l,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){const t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){const t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const n=e.elements,s=t.elements,r=this.elements,o=n[0],a=n[3],c=n[6],l=n[1],u=n[4],h=n[7],d=n[2],p=n[5],g=n[8],_=s[0],m=s[3],f=s[6],y=s[1],x=s[4],v=s[7],A=s[2],w=s[5],R=s[8];return r[0]=o*_+a*y+c*A,r[3]=o*m+a*x+c*w,r[6]=o*f+a*v+c*R,r[1]=l*_+u*y+h*A,r[4]=l*m+u*x+h*w,r[7]=l*f+u*v+h*R,r[2]=d*_+p*y+g*A,r[5]=d*m+p*x+g*w,r[8]=d*f+p*v+g*R,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){const e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],o=e[4],a=e[5],c=e[6],l=e[7],u=e[8];return t*o*u-t*a*l-n*r*u+n*a*c+s*r*l-s*o*c}invert(){const e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],o=e[4],a=e[5],c=e[6],l=e[7],u=e[8],h=u*o-a*l,d=a*c-u*r,p=l*r-o*c,g=t*h+n*d+s*p;if(g===0)return this.set(0,0,0,0,0,0,0,0,0);const _=1/g;return e[0]=h*_,e[1]=(s*l-u*n)*_,e[2]=(a*n-s*o)*_,e[3]=d*_,e[4]=(u*t-s*c)*_,e[5]=(s*r-a*t)*_,e[6]=p*_,e[7]=(n*c-l*t)*_,e[8]=(o*t-n*r)*_,this}transpose(){let e;const t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){const t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,s,r,o,a){const c=Math.cos(r),l=Math.sin(r);return this.set(n*c,n*l,-n*(c*o+l*a)+o+e,-s*l,s*c,-s*(-l*o+c*a)+a+t,0,0,1),this}scale(e,t){return this.premultiply(Do.makeScale(e,t)),this}rotate(e){return this.premultiply(Do.makeRotation(-e)),this}translate(e,t){return this.premultiply(Do.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){const t=this.elements,n=e.elements;for(let s=0;s<9;s++)if(t[s]!==n[s])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){const n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}}const Do=new Xe;function Hh(i){for(let e=i.length-1;e>=0;--e)if(i[e]>=65535)return!0;return!1}function ur(i){return document.createElementNS("http://www.w3.org/1999/xhtml",i)}function rm(){const i=ur("canvas");return i.style.display="block",i}const Ml={};function fs(i){i in Ml||(Ml[i]=!0,console.warn(i))}function om(i,e,t){return new Promise(function(n,s){function r(){switch(i.clientWaitSync(e,i.SYNC_FLUSH_COMMANDS_BIT,0)){case i.WAIT_FAILED:s();break;case i.TIMEOUT_EXPIRED:setTimeout(r,t);break;default:n()}}setTimeout(r,t)})}function am(i){const e=i.elements;e[2]=.5*e[2]+.5*e[3],e[6]=.5*e[6]+.5*e[7],e[10]=.5*e[10]+.5*e[11],e[14]=.5*e[14]+.5*e[15]}function cm(i){const e=i.elements;e[11]===-1?(e[10]=-e[10]-1,e[14]=-e[14]):(e[10]=-e[10],e[14]=-e[14]+1)}const El=new Xe().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),Sl=new Xe().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function lm(){const i={enabled:!0,workingColorSpace:Kt,spaces:{},convert:function(s,r,o){return this.enabled===!1||r===o||!r||!o||(this.spaces[r].transfer===ut&&(s.r=Zn(s.r),s.g=Zn(s.g),s.b=Zn(s.b)),this.spaces[r].primaries!==this.spaces[o].primaries&&(s.applyMatrix3(this.spaces[r].toXYZ),s.applyMatrix3(this.spaces[o].fromXYZ)),this.spaces[o].transfer===ut&&(s.r=ps(s.r),s.g=ps(s.g),s.b=ps(s.b))),s},workingToColorSpace:function(s,r){return this.convert(s,this.workingColorSpace,r)},colorSpaceToWorking:function(s,r){return this.convert(s,r,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===hi?ho:this.spaces[s].transfer},getLuminanceCoefficients:function(s,r=this.workingColorSpace){return s.fromArray(this.spaces[r].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,r,o){return s.copy(this.spaces[r].toXYZ).multiply(this.spaces[o].fromXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(s,r){return fs("THREE.ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),i.workingToColorSpace(s,r)},toWorkingColorSpace:function(s,r){return fs("THREE.ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),i.colorSpaceToWorking(s,r)}},e=[.64,.33,.3,.6,.15,.06],t=[.2126,.7152,.0722],n=[.3127,.329];return i.define({[Kt]:{primaries:e,whitePoint:n,transfer:ho,toXYZ:El,fromXYZ:Sl,luminanceCoefficients:t,workingColorSpaceConfig:{unpackColorSpace:wt},outputColorSpaceConfig:{drawingBufferColorSpace:wt}},[wt]:{primaries:e,whitePoint:n,transfer:ut,toXYZ:El,fromXYZ:Sl,luminanceCoefficients:t,outputColorSpaceConfig:{drawingBufferColorSpace:wt}}}),i}const et=lm();function Zn(i){return i<.04045?i*.0773993808:Math.pow(i*.9478672986+.0521327014,2.4)}function ps(i){return i<.0031308?i*12.92:1.055*Math.pow(i,.41666)-.055}let Hi;class um{static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let n;if(e instanceof HTMLCanvasElement)n=e;else{Hi===void 0&&(Hi=ur("canvas")),Hi.width=e.width,Hi.height=e.height;const s=Hi.getContext("2d");e instanceof ImageData?s.putImageData(e,0,0):s.drawImage(e,0,0,e.width,e.height),n=Hi}return n.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){const t=ur("canvas");t.width=e.width,t.height=e.height;const n=t.getContext("2d");n.drawImage(e,0,0,e.width,e.height);const s=n.getImageData(0,0,e.width,e.height),r=s.data;for(let o=0;o<r.length;o++)r[o]=Zn(r[o]/255)*255;return n.putImageData(s,0,0),t}else if(e.data){const t=e.data.slice(0);for(let n=0;n<t.length;n++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[n]=Math.floor(Zn(t[n]/255)*255):t[n]=Zn(t[n]);return{data:t,width:e.width,height:e.height}}else return console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}}let hm=0;class Bc{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:hm++}),this.uuid=bn(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){const t=this.data;return t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight):t!==null?e.set(t.width,t.height,t.depth||0):e.set(0,0,0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];const n={uuid:this.uuid,url:""},s=this.data;if(s!==null){let r;if(Array.isArray(s)){r=[];for(let o=0,a=s.length;o<a;o++)s[o].isDataTexture?r.push(No(s[o].image)):r.push(No(s[o]))}else r=No(s);n.url=r}return t||(e.images[this.uuid]=n),n}}function No(i){return typeof HTMLImageElement<"u"&&i instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&i instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&i instanceof ImageBitmap?um.getDataURL(i):i.data?{data:Array.from(i.data),width:i.width,height:i.height,type:i.data.constructor.name}:(console.warn("THREE.Texture: Unable to serialize Texture."),{})}let dm=0;const Uo=new N;class Ct extends _i{constructor(e=Ct.DEFAULT_IMAGE,t=Ct.DEFAULT_MAPPING,n=di,s=di,r=rn,o=qn,a=gn,c=Pn,l=Ct.DEFAULT_ANISOTROPY,u=hi){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:dm++}),this.uuid=bn(),this.name="",this.source=new Bc(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=n,this.wrapT=s,this.magFilter=r,this.minFilter=o,this.anisotropy=l,this.format=a,this.internalFormat=null,this.type=c,this.offset=new we(0,0),this.repeat=new we(1,1),this.center=new we(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Xe,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=u,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(e&&e.depth&&e.depth>1),this.pmremVersion=0}get width(){return this.source.getSize(Uo).x}get height(){return this.source.getSize(Uo).y}get depth(){return this.source.getSize(Uo).z}get image(){return this.source.data}set image(e=null){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(const t in e){const n=e[t];if(n===void 0){console.warn(`THREE.Texture.setValues(): parameter '${t}' has value of undefined.`);continue}const s=this[t];if(s===void 0){console.warn(`THREE.Texture.setValues(): property '${t}' does not exist.`);continue}s&&n&&s.isVector2&&n.isVector2||s&&n&&s.isVector3&&n.isVector3||s&&n&&s.isMatrix3&&n.isMatrix3?s.copy(n):this[t]=n}}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];const n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==Rh)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case Ni:e.x=e.x-Math.floor(e.x);break;case di:e.x=e.x<0?0:1;break;case lo:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case Ni:e.y=e.y-Math.floor(e.y);break;case di:e.y=e.y<0?0:1;break;case lo:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}}Ct.DEFAULT_IMAGE=null;Ct.DEFAULT_MAPPING=Rh;Ct.DEFAULT_ANISOTROPY=1;class rt{constructor(e=0,t=0,n=0,s=1){rt.prototype.isVector4=!0,this.x=e,this.y=t,this.z=n,this.w=s}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,s){return this.x=e,this.y=t,this.z=n,this.w=s,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){const t=this.x,n=this.y,s=this.z,r=this.w,o=e.elements;return this.x=o[0]*t+o[4]*n+o[8]*s+o[12]*r,this.y=o[1]*t+o[5]*n+o[9]*s+o[13]*r,this.z=o[2]*t+o[6]*n+o[10]*s+o[14]*r,this.w=o[3]*t+o[7]*n+o[11]*s+o[15]*r,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);const t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,s,r;const c=e.elements,l=c[0],u=c[4],h=c[8],d=c[1],p=c[5],g=c[9],_=c[2],m=c[6],f=c[10];if(Math.abs(u-d)<.01&&Math.abs(h-_)<.01&&Math.abs(g-m)<.01){if(Math.abs(u+d)<.1&&Math.abs(h+_)<.1&&Math.abs(g+m)<.1&&Math.abs(l+p+f-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;const x=(l+1)/2,v=(p+1)/2,A=(f+1)/2,w=(u+d)/4,R=(h+_)/4,C=(g+m)/4;return x>v&&x>A?x<.01?(n=0,s=.707106781,r=.707106781):(n=Math.sqrt(x),s=w/n,r=R/n):v>A?v<.01?(n=.707106781,s=0,r=.707106781):(s=Math.sqrt(v),n=w/s,r=C/s):A<.01?(n=.707106781,s=.707106781,r=0):(r=Math.sqrt(A),n=R/r,s=C/r),this.set(n,s,r,t),this}let y=Math.sqrt((m-g)*(m-g)+(h-_)*(h-_)+(d-u)*(d-u));return Math.abs(y)<.001&&(y=1),this.x=(m-g)/y,this.y=(h-_)/y,this.z=(d-u)/y,this.w=Math.acos((l+p+f-1)/2),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=Ke(this.x,e.x,t.x),this.y=Ke(this.y,e.y,t.y),this.z=Ke(this.z,e.z,t.z),this.w=Ke(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=Ke(this.x,e,t),this.y=Ke(this.y,e,t),this.z=Ke(this.z,e,t),this.w=Ke(this.w,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Ke(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}}class fm extends _i{constructor(e=1,t=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:rn,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1},n),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=n.depth,this.scissor=new rt(0,0,e,t),this.scissorTest=!1,this.viewport=new rt(0,0,e,t);const s={width:e,height:t,depth:n.depth},r=new Ct(s);this.textures=[];const o=n.count;for(let a=0;a<o;a++)this.textures[a]=r.clone(),this.textures[a].isRenderTargetTexture=!0,this.textures[a].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview}_setTextureOptions(e={}){const t={minFilter:rn,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),e!==null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let s=0,r=this.textures.length;s<r;s++)this.textures[s].image.width=e,this.textures[s].image.height=t,this.textures[s].image.depth=n,this.textures[s].isArrayTexture=this.textures[s].image.depth>1;this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,n=e.textures.length;t<n;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;const s=Object.assign({},e.textures[t].image);this.textures[t].source=new Bc(s)}return this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}}class Oi extends fm{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}}class Vh extends Ct{constructor(e=null,t=1,n=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:s},this.magFilter=jt,this.minFilter=jt,this.wrapR=di,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}}class pm extends Ct{constructor(e=null,t=1,n=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:s},this.magFilter=jt,this.minFilter=jt,this.wrapR=di,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class Nn{constructor(e=new N(1/0,1/0,1/0),t=new N(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(yn.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(yn.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){const n=yn.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);const n=e.geometry;if(n!==void 0){const r=n.getAttribute("position");if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0)for(let o=0,a=r.count;o<a;o++)e.isMesh===!0?e.getVertexPosition(o,yn):yn.fromBufferAttribute(r,o),yn.applyMatrix4(e.matrixWorld),this.expandByPoint(yn);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),xr.copy(e.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),xr.copy(n.boundingBox)),xr.applyMatrix4(e.matrixWorld),this.union(xr)}const s=e.children;for(let r=0,o=s.length;r<o;r++)this.expandByObject(s[r],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,yn),yn.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(Os),vr.subVectors(this.max,Os),Vi.subVectors(e.a,Os),Gi.subVectors(e.b,Os),Wi.subVectors(e.c,Os),ni.subVectors(Gi,Vi),ii.subVectors(Wi,Gi),Mi.subVectors(Vi,Wi);let t=[0,-ni.z,ni.y,0,-ii.z,ii.y,0,-Mi.z,Mi.y,ni.z,0,-ni.x,ii.z,0,-ii.x,Mi.z,0,-Mi.x,-ni.y,ni.x,0,-ii.y,ii.x,0,-Mi.y,Mi.x,0];return!Oo(t,Vi,Gi,Wi,vr)||(t=[1,0,0,0,1,0,0,0,1],!Oo(t,Vi,Gi,Wi,vr))?!1:(yr.crossVectors(ni,ii),t=[yr.x,yr.y,yr.z],Oo(t,Vi,Gi,Wi,vr))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,yn).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(yn).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(kn[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),kn[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),kn[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),kn[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),kn[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),kn[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),kn[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),kn[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(kn),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}}const kn=[new N,new N,new N,new N,new N,new N,new N,new N],yn=new N,xr=new Nn,Vi=new N,Gi=new N,Wi=new N,ni=new N,ii=new N,Mi=new N,Os=new N,vr=new N,yr=new N,Ei=new N;function Oo(i,e,t,n,s){for(let r=0,o=i.length-3;r<=o;r+=3){Ei.fromArray(i,r);const a=s.x*Math.abs(Ei.x)+s.y*Math.abs(Ei.y)+s.z*Math.abs(Ei.z),c=e.dot(Ei),l=t.dot(Ei),u=n.dot(Ei);if(Math.max(-Math.max(c,l,u),Math.min(c,l,u))>a)return!1}return!0}const mm=new Nn,Fs=new N,Fo=new N;class Un{constructor(e=new N,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){const n=this.center;t!==void 0?n.copy(t):mm.setFromPoints(e).getCenter(n);let s=0;for(let r=0,o=e.length;r<o;r++)s=Math.max(s,n.distanceToSquared(e[r]));return this.radius=Math.sqrt(s),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){const t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){const n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;Fs.subVectors(e,this.center);const t=Fs.lengthSq();if(t>this.radius*this.radius){const n=Math.sqrt(t),s=(n-this.radius)*.5;this.center.addScaledVector(Fs,s/n),this.radius+=s}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(Fo.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(Fs.copy(e.center).add(Fo)),this.expandByPoint(Fs.copy(e.center).sub(Fo))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}}const Bn=new N,ko=new N,Mr=new N,si=new N,Bo=new N,Er=new N,zo=new N;class bs{constructor(e=new N,t=new N(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,Bn)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);const n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){const t=Bn.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(Bn.copy(this.origin).addScaledVector(this.direction,t),Bn.distanceToSquared(e))}distanceSqToSegment(e,t,n,s){ko.copy(e).add(t).multiplyScalar(.5),Mr.copy(t).sub(e).normalize(),si.copy(this.origin).sub(ko);const r=e.distanceTo(t)*.5,o=-this.direction.dot(Mr),a=si.dot(this.direction),c=-si.dot(Mr),l=si.lengthSq(),u=Math.abs(1-o*o);let h,d,p,g;if(u>0)if(h=o*c-a,d=o*a-c,g=r*u,h>=0)if(d>=-g)if(d<=g){const _=1/u;h*=_,d*=_,p=h*(h+o*d+2*a)+d*(o*h+d+2*c)+l}else d=r,h=Math.max(0,-(o*d+a)),p=-h*h+d*(d+2*c)+l;else d=-r,h=Math.max(0,-(o*d+a)),p=-h*h+d*(d+2*c)+l;else d<=-g?(h=Math.max(0,-(-o*r+a)),d=h>0?-r:Math.min(Math.max(-r,-c),r),p=-h*h+d*(d+2*c)+l):d<=g?(h=0,d=Math.min(Math.max(-r,-c),r),p=d*(d+2*c)+l):(h=Math.max(0,-(o*r+a)),d=h>0?r:Math.min(Math.max(-r,-c),r),p=-h*h+d*(d+2*c)+l);else d=o>0?-r:r,h=Math.max(0,-(o*d+a)),p=-h*h+d*(d+2*c)+l;return n&&n.copy(this.origin).addScaledVector(this.direction,h),s&&s.copy(ko).addScaledVector(Mr,d),p}intersectSphere(e,t){Bn.subVectors(e.center,this.origin);const n=Bn.dot(this.direction),s=Bn.dot(Bn)-n*n,r=e.radius*e.radius;if(s>r)return null;const o=Math.sqrt(r-s),a=n-o,c=n+o;return c<0?null:a<0?this.at(c,t):this.at(a,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){const t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;const n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){const n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){const t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,s,r,o,a,c;const l=1/this.direction.x,u=1/this.direction.y,h=1/this.direction.z,d=this.origin;return l>=0?(n=(e.min.x-d.x)*l,s=(e.max.x-d.x)*l):(n=(e.max.x-d.x)*l,s=(e.min.x-d.x)*l),u>=0?(r=(e.min.y-d.y)*u,o=(e.max.y-d.y)*u):(r=(e.max.y-d.y)*u,o=(e.min.y-d.y)*u),n>o||r>s||((r>n||isNaN(n))&&(n=r),(o<s||isNaN(s))&&(s=o),h>=0?(a=(e.min.z-d.z)*h,c=(e.max.z-d.z)*h):(a=(e.max.z-d.z)*h,c=(e.min.z-d.z)*h),n>c||a>s)||((a>n||n!==n)&&(n=a),(c<s||s!==s)&&(s=c),s<0)?null:this.at(n>=0?n:s,t)}intersectsBox(e){return this.intersectBox(e,Bn)!==null}intersectTriangle(e,t,n,s,r){Bo.subVectors(t,e),Er.subVectors(n,e),zo.crossVectors(Bo,Er);let o=this.direction.dot(zo),a;if(o>0){if(s)return null;a=1}else if(o<0)a=-1,o=-o;else return null;si.subVectors(this.origin,e);const c=a*this.direction.dot(Er.crossVectors(si,Er));if(c<0)return null;const l=a*this.direction.dot(Bo.cross(si));if(l<0||c+l>o)return null;const u=-a*si.dot(zo);return u<0?null:this.at(u/o,r)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class He{constructor(e,t,n,s,r,o,a,c,l,u,h,d,p,g,_,m){He.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,n,s,r,o,a,c,l,u,h,d,p,g,_,m)}set(e,t,n,s,r,o,a,c,l,u,h,d,p,g,_,m){const f=this.elements;return f[0]=e,f[4]=t,f[8]=n,f[12]=s,f[1]=r,f[5]=o,f[9]=a,f[13]=c,f[2]=l,f[6]=u,f[10]=h,f[14]=d,f[3]=p,f[7]=g,f[11]=_,f[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new He().fromArray(this.elements)}copy(e){const t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){const t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){const t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){const t=this.elements,n=e.elements,s=1/Xi.setFromMatrixColumn(e,0).length(),r=1/Xi.setFromMatrixColumn(e,1).length(),o=1/Xi.setFromMatrixColumn(e,2).length();return t[0]=n[0]*s,t[1]=n[1]*s,t[2]=n[2]*s,t[3]=0,t[4]=n[4]*r,t[5]=n[5]*r,t[6]=n[6]*r,t[7]=0,t[8]=n[8]*o,t[9]=n[9]*o,t[10]=n[10]*o,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){const t=this.elements,n=e.x,s=e.y,r=e.z,o=Math.cos(n),a=Math.sin(n),c=Math.cos(s),l=Math.sin(s),u=Math.cos(r),h=Math.sin(r);if(e.order==="XYZ"){const d=o*u,p=o*h,g=a*u,_=a*h;t[0]=c*u,t[4]=-c*h,t[8]=l,t[1]=p+g*l,t[5]=d-_*l,t[9]=-a*c,t[2]=_-d*l,t[6]=g+p*l,t[10]=o*c}else if(e.order==="YXZ"){const d=c*u,p=c*h,g=l*u,_=l*h;t[0]=d+_*a,t[4]=g*a-p,t[8]=o*l,t[1]=o*h,t[5]=o*u,t[9]=-a,t[2]=p*a-g,t[6]=_+d*a,t[10]=o*c}else if(e.order==="ZXY"){const d=c*u,p=c*h,g=l*u,_=l*h;t[0]=d-_*a,t[4]=-o*h,t[8]=g+p*a,t[1]=p+g*a,t[5]=o*u,t[9]=_-d*a,t[2]=-o*l,t[6]=a,t[10]=o*c}else if(e.order==="ZYX"){const d=o*u,p=o*h,g=a*u,_=a*h;t[0]=c*u,t[4]=g*l-p,t[8]=d*l+_,t[1]=c*h,t[5]=_*l+d,t[9]=p*l-g,t[2]=-l,t[6]=a*c,t[10]=o*c}else if(e.order==="YZX"){const d=o*c,p=o*l,g=a*c,_=a*l;t[0]=c*u,t[4]=_-d*h,t[8]=g*h+p,t[1]=h,t[5]=o*u,t[9]=-a*u,t[2]=-l*u,t[6]=p*h+g,t[10]=d-_*h}else if(e.order==="XZY"){const d=o*c,p=o*l,g=a*c,_=a*l;t[0]=c*u,t[4]=-h,t[8]=l*u,t[1]=d*h+_,t[5]=o*u,t[9]=p*h-g,t[2]=g*h-p,t[6]=a*u,t[10]=_*h+d}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(gm,e,_m)}lookAt(e,t,n){const s=this.elements;return en.subVectors(e,t),en.lengthSq()===0&&(en.z=1),en.normalize(),ri.crossVectors(n,en),ri.lengthSq()===0&&(Math.abs(n.z)===1?en.x+=1e-4:en.z+=1e-4,en.normalize(),ri.crossVectors(n,en)),ri.normalize(),Sr.crossVectors(en,ri),s[0]=ri.x,s[4]=Sr.x,s[8]=en.x,s[1]=ri.y,s[5]=Sr.y,s[9]=en.y,s[2]=ri.z,s[6]=Sr.z,s[10]=en.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const n=e.elements,s=t.elements,r=this.elements,o=n[0],a=n[4],c=n[8],l=n[12],u=n[1],h=n[5],d=n[9],p=n[13],g=n[2],_=n[6],m=n[10],f=n[14],y=n[3],x=n[7],v=n[11],A=n[15],w=s[0],R=s[4],C=s[8],S=s[12],M=s[1],T=s[5],D=s[9],P=s[13],O=s[2],z=s[6],F=s[10],X=s[14],V=s[3],ee=s[7],re=s[11],ne=s[15];return r[0]=o*w+a*M+c*O+l*V,r[4]=o*R+a*T+c*z+l*ee,r[8]=o*C+a*D+c*F+l*re,r[12]=o*S+a*P+c*X+l*ne,r[1]=u*w+h*M+d*O+p*V,r[5]=u*R+h*T+d*z+p*ee,r[9]=u*C+h*D+d*F+p*re,r[13]=u*S+h*P+d*X+p*ne,r[2]=g*w+_*M+m*O+f*V,r[6]=g*R+_*T+m*z+f*ee,r[10]=g*C+_*D+m*F+f*re,r[14]=g*S+_*P+m*X+f*ne,r[3]=y*w+x*M+v*O+A*V,r[7]=y*R+x*T+v*z+A*ee,r[11]=y*C+x*D+v*F+A*re,r[15]=y*S+x*P+v*X+A*ne,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){const e=this.elements,t=e[0],n=e[4],s=e[8],r=e[12],o=e[1],a=e[5],c=e[9],l=e[13],u=e[2],h=e[6],d=e[10],p=e[14],g=e[3],_=e[7],m=e[11],f=e[15];return g*(+r*c*h-s*l*h-r*a*d+n*l*d+s*a*p-n*c*p)+_*(+t*c*p-t*l*d+r*o*d-s*o*p+s*l*u-r*c*u)+m*(+t*l*h-t*a*p-r*o*h+n*o*p+r*a*u-n*l*u)+f*(-s*a*u-t*c*h+t*a*d+s*o*h-n*o*d+n*c*u)}transpose(){const e=this.elements;let t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){const s=this.elements;return e.isVector3?(s[12]=e.x,s[13]=e.y,s[14]=e.z):(s[12]=e,s[13]=t,s[14]=n),this}invert(){const e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],o=e[4],a=e[5],c=e[6],l=e[7],u=e[8],h=e[9],d=e[10],p=e[11],g=e[12],_=e[13],m=e[14],f=e[15],y=h*m*l-_*d*l+_*c*p-a*m*p-h*c*f+a*d*f,x=g*d*l-u*m*l-g*c*p+o*m*p+u*c*f-o*d*f,v=u*_*l-g*h*l+g*a*p-o*_*p-u*a*f+o*h*f,A=g*h*c-u*_*c-g*a*d+o*_*d+u*a*m-o*h*m,w=t*y+n*x+s*v+r*A;if(w===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const R=1/w;return e[0]=y*R,e[1]=(_*d*r-h*m*r-_*s*p+n*m*p+h*s*f-n*d*f)*R,e[2]=(a*m*r-_*c*r+_*s*l-n*m*l-a*s*f+n*c*f)*R,e[3]=(h*c*r-a*d*r-h*s*l+n*d*l+a*s*p-n*c*p)*R,e[4]=x*R,e[5]=(u*m*r-g*d*r+g*s*p-t*m*p-u*s*f+t*d*f)*R,e[6]=(g*c*r-o*m*r-g*s*l+t*m*l+o*s*f-t*c*f)*R,e[7]=(o*d*r-u*c*r+u*s*l-t*d*l-o*s*p+t*c*p)*R,e[8]=v*R,e[9]=(g*h*r-u*_*r-g*n*p+t*_*p+u*n*f-t*h*f)*R,e[10]=(o*_*r-g*a*r+g*n*l-t*_*l-o*n*f+t*a*f)*R,e[11]=(u*a*r-o*h*r-u*n*l+t*h*l+o*n*p-t*a*p)*R,e[12]=A*R,e[13]=(u*_*s-g*h*s+g*n*d-t*_*d-u*n*m+t*h*m)*R,e[14]=(g*a*s-o*_*s-g*n*c+t*_*c+o*n*m-t*a*m)*R,e[15]=(o*h*s-u*a*s+u*n*c-t*h*c-o*n*d+t*a*d)*R,this}scale(e){const t=this.elements,n=e.x,s=e.y,r=e.z;return t[0]*=n,t[4]*=s,t[8]*=r,t[1]*=n,t[5]*=s,t[9]*=r,t[2]*=n,t[6]*=s,t[10]*=r,t[3]*=n,t[7]*=s,t[11]*=r,this}getMaxScaleOnAxis(){const e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],s=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,s))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){const t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){const n=Math.cos(t),s=Math.sin(t),r=1-n,o=e.x,a=e.y,c=e.z,l=r*o,u=r*a;return this.set(l*o+n,l*a-s*c,l*c+s*a,0,l*a+s*c,u*a+n,u*c-s*o,0,l*c-s*a,u*c+s*o,r*c*c+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,s,r,o){return this.set(1,n,r,0,e,1,o,0,t,s,1,0,0,0,0,1),this}compose(e,t,n){const s=this.elements,r=t._x,o=t._y,a=t._z,c=t._w,l=r+r,u=o+o,h=a+a,d=r*l,p=r*u,g=r*h,_=o*u,m=o*h,f=a*h,y=c*l,x=c*u,v=c*h,A=n.x,w=n.y,R=n.z;return s[0]=(1-(_+f))*A,s[1]=(p+v)*A,s[2]=(g-x)*A,s[3]=0,s[4]=(p-v)*w,s[5]=(1-(d+f))*w,s[6]=(m+y)*w,s[7]=0,s[8]=(g+x)*R,s[9]=(m-y)*R,s[10]=(1-(d+_))*R,s[11]=0,s[12]=e.x,s[13]=e.y,s[14]=e.z,s[15]=1,this}decompose(e,t,n){const s=this.elements;let r=Xi.set(s[0],s[1],s[2]).length();const o=Xi.set(s[4],s[5],s[6]).length(),a=Xi.set(s[8],s[9],s[10]).length();this.determinant()<0&&(r=-r),e.x=s[12],e.y=s[13],e.z=s[14],Mn.copy(this);const l=1/r,u=1/o,h=1/a;return Mn.elements[0]*=l,Mn.elements[1]*=l,Mn.elements[2]*=l,Mn.elements[4]*=u,Mn.elements[5]*=u,Mn.elements[6]*=u,Mn.elements[8]*=h,Mn.elements[9]*=h,Mn.elements[10]*=h,t.setFromRotationMatrix(Mn),n.x=r,n.y=o,n.z=a,this}makePerspective(e,t,n,s,r,o,a=Yn){const c=this.elements,l=2*r/(t-e),u=2*r/(n-s),h=(t+e)/(t-e),d=(n+s)/(n-s);let p,g;if(a===Yn)p=-(o+r)/(o-r),g=-2*o*r/(o-r);else if(a===fo)p=-o/(o-r),g=-o*r/(o-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+a);return c[0]=l,c[4]=0,c[8]=h,c[12]=0,c[1]=0,c[5]=u,c[9]=d,c[13]=0,c[2]=0,c[6]=0,c[10]=p,c[14]=g,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,n,s,r,o,a=Yn){const c=this.elements,l=1/(t-e),u=1/(n-s),h=1/(o-r),d=(t+e)*l,p=(n+s)*u;let g,_;if(a===Yn)g=(o+r)*h,_=-2*h;else if(a===fo)g=r*h,_=-1*h;else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+a);return c[0]=2*l,c[4]=0,c[8]=0,c[12]=-d,c[1]=0,c[5]=2*u,c[9]=0,c[13]=-p,c[2]=0,c[6]=0,c[10]=_,c[14]=-g,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){const t=this.elements,n=e.elements;for(let s=0;s<16;s++)if(t[s]!==n[s])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){const n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}}const Xi=new N,Mn=new He,gm=new N(0,0,0),_m=new N(1,1,1),ri=new N,Sr=new N,en=new N,Tl=new He,bl=new ln;class Ln{constructor(e=0,t=0,n=0,s=Ln.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=n,this._order=s}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,s=this._order){return this._x=e,this._y=t,this._z=n,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){const s=e.elements,r=s[0],o=s[4],a=s[8],c=s[1],l=s[5],u=s[9],h=s[2],d=s[6],p=s[10];switch(t){case"XYZ":this._y=Math.asin(Ke(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(-u,p),this._z=Math.atan2(-o,r)):(this._x=Math.atan2(d,l),this._z=0);break;case"YXZ":this._x=Math.asin(-Ke(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(a,p),this._z=Math.atan2(c,l)):(this._y=Math.atan2(-h,r),this._z=0);break;case"ZXY":this._x=Math.asin(Ke(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-h,p),this._z=Math.atan2(-o,l)):(this._y=0,this._z=Math.atan2(c,r));break;case"ZYX":this._y=Math.asin(-Ke(h,-1,1)),Math.abs(h)<.9999999?(this._x=Math.atan2(d,p),this._z=Math.atan2(c,r)):(this._x=0,this._z=Math.atan2(-o,l));break;case"YZX":this._z=Math.asin(Ke(c,-1,1)),Math.abs(c)<.9999999?(this._x=Math.atan2(-u,l),this._y=Math.atan2(-h,r)):(this._x=0,this._y=Math.atan2(a,p));break;case"XZY":this._z=Math.asin(-Ke(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(d,l),this._y=Math.atan2(a,r)):(this._x=Math.atan2(-u,p),this._y=0);break;default:console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return Tl.makeRotationFromQuaternion(e),this.setFromRotationMatrix(Tl,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return bl.setFromEuler(this),this.setFromQuaternion(bl,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}Ln.DEFAULT_ORDER="XYZ";class zc{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}}let xm=0;const Al=new N,ji=new ln,zn=new He,Tr=new N,ks=new N,vm=new N,ym=new ln,wl=new N(1,0,0),Rl=new N(0,1,0),Cl=new N(0,0,1),Il={type:"added"},Mm={type:"removed"},Ki={type:"childadded",child:null},Ho={type:"childremoved",child:null};class vt extends _i{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:xm++}),this.uuid=bn(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=vt.DEFAULT_UP.clone();const e=new N,t=new Ln,n=new ln,s=new N(1,1,1);function r(){n.setFromEuler(t,!1)}function o(){t.setFromQuaternion(n,void 0,!1)}t._onChange(r),n._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new He},normalMatrix:{value:new Xe}}),this.matrix=new He,this.matrixWorld=new He,this.matrixAutoUpdate=vt.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=vt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new zc,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return ji.setFromAxisAngle(e,t),this.quaternion.multiply(ji),this}rotateOnWorldAxis(e,t){return ji.setFromAxisAngle(e,t),this.quaternion.premultiply(ji),this}rotateX(e){return this.rotateOnAxis(wl,e)}rotateY(e){return this.rotateOnAxis(Rl,e)}rotateZ(e){return this.rotateOnAxis(Cl,e)}translateOnAxis(e,t){return Al.copy(e).applyQuaternion(this.quaternion),this.position.add(Al.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(wl,e)}translateY(e){return this.translateOnAxis(Rl,e)}translateZ(e){return this.translateOnAxis(Cl,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(zn.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?Tr.copy(e):Tr.set(e,t,n);const s=this.parent;this.updateWorldMatrix(!0,!1),ks.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?zn.lookAt(ks,Tr,this.up):zn.lookAt(Tr,ks,this.up),this.quaternion.setFromRotationMatrix(zn),s&&(zn.extractRotation(s.matrixWorld),ji.setFromRotationMatrix(zn),this.quaternion.premultiply(ji.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(Il),Ki.child=e,this.dispatchEvent(Ki),Ki.child=null):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}const t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(Mm),Ho.child=e,this.dispatchEvent(Ho),Ho.child=null),this}removeFromParent(){const e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),zn.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),zn.multiply(e.parent.matrixWorld)),e.applyMatrix4(zn),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(Il),Ki.child=e,this.dispatchEvent(Ki),Ki.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,s=this.children.length;n<s;n++){const o=this.children[n].getObjectByProperty(e,t);if(o!==void 0)return o}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);const s=this.children;for(let r=0,o=s.length;r<o;r++)s[r].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(ks,e,vm),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(ks,ym,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);const t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);const t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);const t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].traverseVisible(e)}traverseAncestors(e){const t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);const t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t){const n=this.parent;if(e===!0&&n!==null&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),t===!0){const s=this.children;for(let r=0,o=s.length;r<o;r++)s[r].updateWorldMatrix(!1,!0)}}toJSON(e){const t=e===void 0||typeof e=="string",n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});const s={};s.uuid=this.uuid,s.type=this.type,this.name!==""&&(s.name=this.name),this.castShadow===!0&&(s.castShadow=!0),this.receiveShadow===!0&&(s.receiveShadow=!0),this.visible===!1&&(s.visible=!1),this.frustumCulled===!1&&(s.frustumCulled=!1),this.renderOrder!==0&&(s.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(s.matrixAutoUpdate=!1),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(s.type="BatchedMesh",s.perObjectFrustumCulled=this.perObjectFrustumCulled,s.sortObjects=this.sortObjects,s.drawRanges=this._drawRanges,s.reservedRanges=this._reservedRanges,s.geometryInfo=this._geometryInfo.map(a=>({...a,boundingBox:a.boundingBox?a.boundingBox.toJSON():void 0,boundingSphere:a.boundingSphere?a.boundingSphere.toJSON():void 0})),s.instanceInfo=this._instanceInfo.map(a=>({...a})),s.availableInstanceIds=this._availableInstanceIds.slice(),s.availableGeometryIds=this._availableGeometryIds.slice(),s.nextIndexStart=this._nextIndexStart,s.nextVertexStart=this._nextVertexStart,s.geometryCount=this._geometryCount,s.maxInstanceCount=this._maxInstanceCount,s.maxVertexCount=this._maxVertexCount,s.maxIndexCount=this._maxIndexCount,s.geometryInitialized=this._geometryInitialized,s.matricesTexture=this._matricesTexture.toJSON(e),s.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(s.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(s.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(s.boundingBox=this.boundingBox.toJSON()));function r(a,c){return a[c.uuid]===void 0&&(a[c.uuid]=c.toJSON(e)),c.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=r(e.geometries,this.geometry);const a=this.geometry.parameters;if(a!==void 0&&a.shapes!==void 0){const c=a.shapes;if(Array.isArray(c))for(let l=0,u=c.length;l<u;l++){const h=c[l];r(e.shapes,h)}else r(e.shapes,c)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(e.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){const a=[];for(let c=0,l=this.material.length;c<l;c++)a.push(r(e.materials,this.material[c]));s.material=a}else s.material=r(e.materials,this.material);if(this.children.length>0){s.children=[];for(let a=0;a<this.children.length;a++)s.children.push(this.children[a].toJSON(e).object)}if(this.animations.length>0){s.animations=[];for(let a=0;a<this.animations.length;a++){const c=this.animations[a];s.animations.push(r(e.animations,c))}}if(t){const a=o(e.geometries),c=o(e.materials),l=o(e.textures),u=o(e.images),h=o(e.shapes),d=o(e.skeletons),p=o(e.animations),g=o(e.nodes);a.length>0&&(n.geometries=a),c.length>0&&(n.materials=c),l.length>0&&(n.textures=l),u.length>0&&(n.images=u),h.length>0&&(n.shapes=h),d.length>0&&(n.skeletons=d),p.length>0&&(n.animations=p),g.length>0&&(n.nodes=g)}return n.object=s,n;function o(a){const c=[];for(const l in a){const u=a[l];delete u.metadata,c.push(u)}return c}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let n=0;n<e.children.length;n++){const s=e.children[n];this.add(s.clone())}return this}}vt.DEFAULT_UP=new N(0,1,0);vt.DEFAULT_MATRIX_AUTO_UPDATE=!0;vt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;const En=new N,Hn=new N,Vo=new N,Vn=new N,qi=new N,Yi=new N,Pl=new N,Go=new N,Wo=new N,Xo=new N,jo=new rt,Ko=new rt,qo=new rt;class mn{constructor(e=new N,t=new N,n=new N){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,s){s.subVectors(n,t),En.subVectors(e,t),s.cross(En);const r=s.lengthSq();return r>0?s.multiplyScalar(1/Math.sqrt(r)):s.set(0,0,0)}static getBarycoord(e,t,n,s,r){En.subVectors(s,t),Hn.subVectors(n,t),Vo.subVectors(e,t);const o=En.dot(En),a=En.dot(Hn),c=En.dot(Vo),l=Hn.dot(Hn),u=Hn.dot(Vo),h=o*l-a*a;if(h===0)return r.set(0,0,0),null;const d=1/h,p=(l*c-a*u)*d,g=(o*u-a*c)*d;return r.set(1-p-g,g,p)}static containsPoint(e,t,n,s){return this.getBarycoord(e,t,n,s,Vn)===null?!1:Vn.x>=0&&Vn.y>=0&&Vn.x+Vn.y<=1}static getInterpolation(e,t,n,s,r,o,a,c){return this.getBarycoord(e,t,n,s,Vn)===null?(c.x=0,c.y=0,"z"in c&&(c.z=0),"w"in c&&(c.w=0),null):(c.setScalar(0),c.addScaledVector(r,Vn.x),c.addScaledVector(o,Vn.y),c.addScaledVector(a,Vn.z),c)}static getInterpolatedAttribute(e,t,n,s,r,o){return jo.setScalar(0),Ko.setScalar(0),qo.setScalar(0),jo.fromBufferAttribute(e,t),Ko.fromBufferAttribute(e,n),qo.fromBufferAttribute(e,s),o.setScalar(0),o.addScaledVector(jo,r.x),o.addScaledVector(Ko,r.y),o.addScaledVector(qo,r.z),o}static isFrontFacing(e,t,n,s){return En.subVectors(n,t),Hn.subVectors(e,t),En.cross(Hn).dot(s)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,s){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[s]),this}setFromAttributeAndIndices(e,t,n,s){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,s),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return En.subVectors(this.c,this.b),Hn.subVectors(this.a,this.b),En.cross(Hn).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return mn.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return mn.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,n,s,r){return mn.getInterpolation(e,this.a,this.b,this.c,t,n,s,r)}containsPoint(e){return mn.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return mn.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){const n=this.a,s=this.b,r=this.c;let o,a;qi.subVectors(s,n),Yi.subVectors(r,n),Go.subVectors(e,n);const c=qi.dot(Go),l=Yi.dot(Go);if(c<=0&&l<=0)return t.copy(n);Wo.subVectors(e,s);const u=qi.dot(Wo),h=Yi.dot(Wo);if(u>=0&&h<=u)return t.copy(s);const d=c*h-u*l;if(d<=0&&c>=0&&u<=0)return o=c/(c-u),t.copy(n).addScaledVector(qi,o);Xo.subVectors(e,r);const p=qi.dot(Xo),g=Yi.dot(Xo);if(g>=0&&p<=g)return t.copy(r);const _=p*l-c*g;if(_<=0&&l>=0&&g<=0)return a=l/(l-g),t.copy(n).addScaledVector(Yi,a);const m=u*g-p*h;if(m<=0&&h-u>=0&&p-g>=0)return Pl.subVectors(r,s),a=(h-u)/(h-u+(p-g)),t.copy(s).addScaledVector(Pl,a);const f=1/(m+_+d);return o=_*f,a=d*f,t.copy(n).addScaledVector(qi,o).addScaledVector(Yi,a)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}}const Gh={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},oi={h:0,s:0,l:0},br={h:0,s:0,l:0};function Yo(i,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?i+(e-i)*6*t:t<1/2?e:t<2/3?i+(e-i)*6*(2/3-t):i}class Ne{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){const s=e;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=wt){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,et.colorSpaceToWorking(this,t),this}setRGB(e,t,n,s=et.workingColorSpace){return this.r=e,this.g=t,this.b=n,et.colorSpaceToWorking(this,s),this}setHSL(e,t,n,s=et.workingColorSpace){if(e=kc(e,1),t=Ke(t,0,1),n=Ke(n,0,1),t===0)this.r=this.g=this.b=n;else{const r=n<=.5?n*(1+t):n+t-n*t,o=2*n-r;this.r=Yo(o,r,e+1/3),this.g=Yo(o,r,e),this.b=Yo(o,r,e-1/3)}return et.colorSpaceToWorking(this,s),this}setStyle(e,t=wt){function n(r){r!==void 0&&parseFloat(r)<1&&console.warn("THREE.Color: Alpha component of "+e+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(e)){let r;const o=s[1],a=s[2];switch(o){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,t);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,t);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,t);break;default:console.warn("THREE.Color: Unknown color model "+e)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(e)){const r=s[1],o=r.length;if(o===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,t);if(o===6)return this.setHex(parseInt(r,16),t);console.warn("THREE.Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=wt){const n=Gh[e.toLowerCase()];return n!==void 0?this.setHex(n,t):console.warn("THREE.Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=Zn(e.r),this.g=Zn(e.g),this.b=Zn(e.b),this}copyLinearToSRGB(e){return this.r=ps(e.r),this.g=ps(e.g),this.b=ps(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=wt){return et.workingToColorSpace(Bt.copy(this),e),Math.round(Ke(Bt.r*255,0,255))*65536+Math.round(Ke(Bt.g*255,0,255))*256+Math.round(Ke(Bt.b*255,0,255))}getHexString(e=wt){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=et.workingColorSpace){et.workingToColorSpace(Bt.copy(this),t);const n=Bt.r,s=Bt.g,r=Bt.b,o=Math.max(n,s,r),a=Math.min(n,s,r);let c,l;const u=(a+o)/2;if(a===o)c=0,l=0;else{const h=o-a;switch(l=u<=.5?h/(o+a):h/(2-o-a),o){case n:c=(s-r)/h+(s<r?6:0);break;case s:c=(r-n)/h+2;break;case r:c=(n-s)/h+4;break}c/=6}return e.h=c,e.s=l,e.l=u,e}getRGB(e,t=et.workingColorSpace){return et.workingToColorSpace(Bt.copy(this),t),e.r=Bt.r,e.g=Bt.g,e.b=Bt.b,e}getStyle(e=wt){et.workingToColorSpace(Bt.copy(this),e);const t=Bt.r,n=Bt.g,s=Bt.b;return e!==wt?`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(s*255)})`}offsetHSL(e,t,n){return this.getHSL(oi),this.setHSL(oi.h+e,oi.s+t,oi.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(oi),e.getHSL(br);const n=tr(oi.h,br.h,t),s=tr(oi.s,br.s,t),r=tr(oi.l,br.l,t);return this.setHSL(n,s,r),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){const t=this.r,n=this.g,s=this.b,r=e.elements;return this.r=r[0]*t+r[3]*n+r[6]*s,this.g=r[1]*t+r[4]*n+r[7]*s,this.b=r[2]*t+r[5]*n+r[8]*s,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}const Bt=new Ne;Ne.NAMES=Gh;let Em=0;class An extends _i{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Em++}),this.uuid=bn(),this.name="",this.type="Material",this.blending=ds,this.side=Jn,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=Ca,this.blendDst=Ia,this.blendEquation=Ii,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Ne(0,0,0),this.blendAlpha=0,this.depthFunc=_s,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=_l,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=zi,this.stencilZFail=zi,this.stencilZPass=zi,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(const t in e){const n=e[t];if(n===void 0){console.warn(`THREE.Material: parameter '${t}' has value of undefined.`);continue}const s=this[t];if(s===void 0){console.warn(`THREE.Material: '${t}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(n):s&&s.isVector3&&n&&n.isVector3?s.copy(n):this[t]=n}}toJSON(e){const t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});const n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==ds&&(n.blending=this.blending),this.side!==Jn&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==Ca&&(n.blendSrc=this.blendSrc),this.blendDst!==Ia&&(n.blendDst=this.blendDst),this.blendEquation!==Ii&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==_s&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==_l&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==zi&&(n.stencilFail=this.stencilFail),this.stencilZFail!==zi&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==zi&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function s(r){const o=[];for(const a in r){const c=r[a];delete c.metadata,o.push(c)}return o}if(t){const r=s(e.textures),o=s(e.images);r.length>0&&(n.textures=r),o.length>0&&(n.images=o)}return n}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;const t=e.clippingPlanes;let n=null;if(t!==null){const s=t.length;n=new Array(s);for(let r=0;r!==s;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}}class on extends An{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Ne(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Ln,this.combine=Ah,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}}const At=new N,Ar=new we;let Sm=0;class Ft{constructor(e,t,n=!1){if(Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:Sm++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=n,this.usage=fc,this.updateRanges=[],this.gpuType=Tn,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let s=0,r=this.itemSize;s<r;s++)this.array[e+s]=t.array[n+s];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)Ar.fromBufferAttribute(this,t),Ar.applyMatrix3(e),this.setXY(t,Ar.x,Ar.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)At.fromBufferAttribute(this,t),At.applyMatrix3(e),this.setXYZ(t,At.x,At.y,At.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)At.fromBufferAttribute(this,t),At.applyMatrix4(e),this.setXYZ(t,At.x,At.y,At.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)At.fromBufferAttribute(this,t),At.applyNormalMatrix(e),this.setXYZ(t,At.x,At.y,At.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)At.fromBufferAttribute(this,t),At.transformDirection(e),this.setXYZ(t,At.x,At.y,At.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=Sn(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=at(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=Sn(t,this.array)),t}setX(e,t){return this.normalized&&(t=at(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=Sn(t,this.array)),t}setY(e,t){return this.normalized&&(t=at(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=Sn(t,this.array)),t}setZ(e,t){return this.normalized&&(t=at(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=Sn(t,this.array)),t}setW(e,t){return this.normalized&&(t=at(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=at(t,this.array),n=at(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,s){return e*=this.itemSize,this.normalized&&(t=at(t,this.array),n=at(n,this.array),s=at(s,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=s,this}setXYZW(e,t,n,s,r){return e*=this.itemSize,this.normalized&&(t=at(t,this.array),n=at(n,this.array),s=at(s,this.array),r=at(r,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=s,this.array[e+3]=r,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){const e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(e.name=this.name),this.usage!==fc&&(e.usage=this.usage),e}}class Wh extends Ft{constructor(e,t,n){super(new Uint16Array(e),t,n)}}class Xh extends Ft{constructor(e,t,n){super(new Uint32Array(e),t,n)}}class Mt extends Ft{constructor(e,t,n){super(new Float32Array(e),t,n)}}let Tm=0;const fn=new He,$o=new vt,$i=new N,tn=new Nn,Bs=new Nn,Lt=new N;class Nt extends _i{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Tm++}),this.uuid=bn(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(Hh(e)?Xh:Wh)(e,1):this.index=e,this}setIndirect(e){return this.indirect=e,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){const t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);const n=this.attributes.normal;if(n!==void 0){const r=new Xe().getNormalMatrix(e);n.applyNormalMatrix(r),n.needsUpdate=!0}const s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(e),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(e){return fn.makeRotationFromQuaternion(e),this.applyMatrix4(fn),this}rotateX(e){return fn.makeRotationX(e),this.applyMatrix4(fn),this}rotateY(e){return fn.makeRotationY(e),this.applyMatrix4(fn),this}rotateZ(e){return fn.makeRotationZ(e),this.applyMatrix4(fn),this}translate(e,t,n){return fn.makeTranslation(e,t,n),this.applyMatrix4(fn),this}scale(e,t,n){return fn.makeScale(e,t,n),this.applyMatrix4(fn),this}lookAt(e){return $o.lookAt(e),$o.updateMatrix(),this.applyMatrix4($o.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter($i).negate(),this.translate($i.x,$i.y,$i.z),this}setFromPoints(e){const t=this.getAttribute("position");if(t===void 0){const n=[];for(let s=0,r=e.length;s<r;s++){const o=e[s];n.push(o.x,o.y,o.z||0)}this.setAttribute("position",new Mt(n,3))}else{const n=Math.min(e.length,t.count);for(let s=0;s<n;s++){const r=e[s];t.setXYZ(s,r.x,r.y,r.z||0)}e.length>t.count&&console.warn("THREE.BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Nn);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new N(-1/0,-1/0,-1/0),new N(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let n=0,s=t.length;n<s;n++){const r=t[n];tn.setFromBufferAttribute(r),this.morphTargetsRelative?(Lt.addVectors(this.boundingBox.min,tn.min),this.boundingBox.expandByPoint(Lt),Lt.addVectors(this.boundingBox.max,tn.max),this.boundingBox.expandByPoint(Lt)):(this.boundingBox.expandByPoint(tn.min),this.boundingBox.expandByPoint(tn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Un);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new N,1/0);return}if(e){const n=this.boundingSphere.center;if(tn.setFromBufferAttribute(e),t)for(let r=0,o=t.length;r<o;r++){const a=t[r];Bs.setFromBufferAttribute(a),this.morphTargetsRelative?(Lt.addVectors(tn.min,Bs.min),tn.expandByPoint(Lt),Lt.addVectors(tn.max,Bs.max),tn.expandByPoint(Lt)):(tn.expandByPoint(Bs.min),tn.expandByPoint(Bs.max))}tn.getCenter(n);let s=0;for(let r=0,o=e.count;r<o;r++)Lt.fromBufferAttribute(e,r),s=Math.max(s,n.distanceToSquared(Lt));if(t)for(let r=0,o=t.length;r<o;r++){const a=t[r],c=this.morphTargetsRelative;for(let l=0,u=a.count;l<u;l++)Lt.fromBufferAttribute(a,l),c&&($i.fromBufferAttribute(e,l),Lt.add($i)),s=Math.max(s,n.distanceToSquared(Lt))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){const e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}const n=t.position,s=t.normal,r=t.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new Ft(new Float32Array(4*n.count),4));const o=this.getAttribute("tangent"),a=[],c=[];for(let C=0;C<n.count;C++)a[C]=new N,c[C]=new N;const l=new N,u=new N,h=new N,d=new we,p=new we,g=new we,_=new N,m=new N;function f(C,S,M){l.fromBufferAttribute(n,C),u.fromBufferAttribute(n,S),h.fromBufferAttribute(n,M),d.fromBufferAttribute(r,C),p.fromBufferAttribute(r,S),g.fromBufferAttribute(r,M),u.sub(l),h.sub(l),p.sub(d),g.sub(d);const T=1/(p.x*g.y-g.x*p.y);isFinite(T)&&(_.copy(u).multiplyScalar(g.y).addScaledVector(h,-p.y).multiplyScalar(T),m.copy(h).multiplyScalar(p.x).addScaledVector(u,-g.x).multiplyScalar(T),a[C].add(_),a[S].add(_),a[M].add(_),c[C].add(m),c[S].add(m),c[M].add(m))}let y=this.groups;y.length===0&&(y=[{start:0,count:e.count}]);for(let C=0,S=y.length;C<S;++C){const M=y[C],T=M.start,D=M.count;for(let P=T,O=T+D;P<O;P+=3)f(e.getX(P+0),e.getX(P+1),e.getX(P+2))}const x=new N,v=new N,A=new N,w=new N;function R(C){A.fromBufferAttribute(s,C),w.copy(A);const S=a[C];x.copy(S),x.sub(A.multiplyScalar(A.dot(S))).normalize(),v.crossVectors(w,S);const T=v.dot(c[C])<0?-1:1;o.setXYZW(C,x.x,x.y,x.z,T)}for(let C=0,S=y.length;C<S;++C){const M=y[C],T=M.start,D=M.count;for(let P=T,O=T+D;P<O;P+=3)R(e.getX(P+0)),R(e.getX(P+1)),R(e.getX(P+2))}}computeVertexNormals(){const e=this.index,t=this.getAttribute("position");if(t!==void 0){let n=this.getAttribute("normal");if(n===void 0)n=new Ft(new Float32Array(t.count*3),3),this.setAttribute("normal",n);else for(let d=0,p=n.count;d<p;d++)n.setXYZ(d,0,0,0);const s=new N,r=new N,o=new N,a=new N,c=new N,l=new N,u=new N,h=new N;if(e)for(let d=0,p=e.count;d<p;d+=3){const g=e.getX(d+0),_=e.getX(d+1),m=e.getX(d+2);s.fromBufferAttribute(t,g),r.fromBufferAttribute(t,_),o.fromBufferAttribute(t,m),u.subVectors(o,r),h.subVectors(s,r),u.cross(h),a.fromBufferAttribute(n,g),c.fromBufferAttribute(n,_),l.fromBufferAttribute(n,m),a.add(u),c.add(u),l.add(u),n.setXYZ(g,a.x,a.y,a.z),n.setXYZ(_,c.x,c.y,c.z),n.setXYZ(m,l.x,l.y,l.z)}else for(let d=0,p=t.count;d<p;d+=3)s.fromBufferAttribute(t,d+0),r.fromBufferAttribute(t,d+1),o.fromBufferAttribute(t,d+2),u.subVectors(o,r),h.subVectors(s,r),u.cross(h),n.setXYZ(d+0,u.x,u.y,u.z),n.setXYZ(d+1,u.x,u.y,u.z),n.setXYZ(d+2,u.x,u.y,u.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){const e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)Lt.fromBufferAttribute(e,t),Lt.normalize(),e.setXYZ(t,Lt.x,Lt.y,Lt.z)}toNonIndexed(){function e(a,c){const l=a.array,u=a.itemSize,h=a.normalized,d=new l.constructor(c.length*u);let p=0,g=0;for(let _=0,m=c.length;_<m;_++){a.isInterleavedBufferAttribute?p=c[_]*a.data.stride+a.offset:p=c[_]*u;for(let f=0;f<u;f++)d[g++]=l[p++]}return new Ft(d,u,h)}if(this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;const t=new Nt,n=this.index.array,s=this.attributes;for(const a in s){const c=s[a],l=e(c,n);t.setAttribute(a,l)}const r=this.morphAttributes;for(const a in r){const c=[],l=r[a];for(let u=0,h=l.length;u<h;u++){const d=l[u],p=e(d,n);c.push(p)}t.morphAttributes[a]=c}t.morphTargetsRelative=this.morphTargetsRelative;const o=this.groups;for(let a=0,c=o.length;a<c;a++){const l=o[a];t.addGroup(l.start,l.count,l.materialIndex)}return t}toJSON(){const e={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.type,this.name!==""&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0){const c=this.parameters;for(const l in c)c[l]!==void 0&&(e[l]=c[l]);return e}e.data={attributes:{}};const t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});const n=this.attributes;for(const c in n){const l=n[c];e.data.attributes[c]=l.toJSON(e.data)}const s={};let r=!1;for(const c in this.morphAttributes){const l=this.morphAttributes[c],u=[];for(let h=0,d=l.length;h<d;h++){const p=l[h];u.push(p.toJSON(e.data))}u.length>0&&(s[c]=u,r=!0)}r&&(e.data.morphAttributes=s,e.data.morphTargetsRelative=this.morphTargetsRelative);const o=this.groups;o.length>0&&(e.data.groups=JSON.parse(JSON.stringify(o)));const a=this.boundingSphere;return a!==null&&(e.data.boundingSphere=a.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;const t={};this.name=e.name;const n=e.index;n!==null&&this.setIndex(n.clone());const s=e.attributes;for(const l in s){const u=s[l];this.setAttribute(l,u.clone(t))}const r=e.morphAttributes;for(const l in r){const u=[],h=r[l];for(let d=0,p=h.length;d<p;d++)u.push(h[d].clone(t));this.morphAttributes[l]=u}this.morphTargetsRelative=e.morphTargetsRelative;const o=e.groups;for(let l=0,u=o.length;l<u;l++){const h=o[l];this.addGroup(h.start,h.count,h.materialIndex)}const a=e.boundingBox;a!==null&&(this.boundingBox=a.clone());const c=e.boundingSphere;return c!==null&&(this.boundingSphere=c.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}}const Ll=new He,Si=new bs,wr=new Un,Dl=new N,Rr=new N,Cr=new N,Ir=new N,Zo=new N,Pr=new N,Nl=new N,Lr=new N;class dt extends vt{constructor(e=new Nt,t=new on){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){const t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){const s=t[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=s.length;r<o;r++){const a=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}getVertexPosition(e,t){const n=this.geometry,s=n.attributes.position,r=n.morphAttributes.position,o=n.morphTargetsRelative;t.fromBufferAttribute(s,e);const a=this.morphTargetInfluences;if(r&&a){Pr.set(0,0,0);for(let c=0,l=r.length;c<l;c++){const u=a[c],h=r[c];u!==0&&(Zo.fromBufferAttribute(h,e),o?Pr.addScaledVector(Zo,u):Pr.addScaledVector(Zo.sub(t),u))}t.add(Pr)}return t}raycast(e,t){const n=this.geometry,s=this.material,r=this.matrixWorld;s!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),wr.copy(n.boundingSphere),wr.applyMatrix4(r),Si.copy(e.ray).recast(e.near),!(wr.containsPoint(Si.origin)===!1&&(Si.intersectSphere(wr,Dl)===null||Si.origin.distanceToSquared(Dl)>(e.far-e.near)**2))&&(Ll.copy(r).invert(),Si.copy(e.ray).applyMatrix4(Ll),!(n.boundingBox!==null&&Si.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(e,t,Si)))}_computeIntersections(e,t,n){let s;const r=this.geometry,o=this.material,a=r.index,c=r.attributes.position,l=r.attributes.uv,u=r.attributes.uv1,h=r.attributes.normal,d=r.groups,p=r.drawRange;if(a!==null)if(Array.isArray(o))for(let g=0,_=d.length;g<_;g++){const m=d[g],f=o[m.materialIndex],y=Math.max(m.start,p.start),x=Math.min(a.count,Math.min(m.start+m.count,p.start+p.count));for(let v=y,A=x;v<A;v+=3){const w=a.getX(v),R=a.getX(v+1),C=a.getX(v+2);s=Dr(this,f,e,n,l,u,h,w,R,C),s&&(s.faceIndex=Math.floor(v/3),s.face.materialIndex=m.materialIndex,t.push(s))}}else{const g=Math.max(0,p.start),_=Math.min(a.count,p.start+p.count);for(let m=g,f=_;m<f;m+=3){const y=a.getX(m),x=a.getX(m+1),v=a.getX(m+2);s=Dr(this,o,e,n,l,u,h,y,x,v),s&&(s.faceIndex=Math.floor(m/3),t.push(s))}}else if(c!==void 0)if(Array.isArray(o))for(let g=0,_=d.length;g<_;g++){const m=d[g],f=o[m.materialIndex],y=Math.max(m.start,p.start),x=Math.min(c.count,Math.min(m.start+m.count,p.start+p.count));for(let v=y,A=x;v<A;v+=3){const w=v,R=v+1,C=v+2;s=Dr(this,f,e,n,l,u,h,w,R,C),s&&(s.faceIndex=Math.floor(v/3),s.face.materialIndex=m.materialIndex,t.push(s))}}else{const g=Math.max(0,p.start),_=Math.min(c.count,p.start+p.count);for(let m=g,f=_;m<f;m+=3){const y=m,x=m+1,v=m+2;s=Dr(this,o,e,n,l,u,h,y,x,v),s&&(s.faceIndex=Math.floor(m/3),t.push(s))}}}}function bm(i,e,t,n,s,r,o,a){let c;if(e.side===Zt?c=n.intersectTriangle(o,r,s,!0,a):c=n.intersectTriangle(s,r,o,e.side===Jn,a),c===null)return null;Lr.copy(a),Lr.applyMatrix4(i.matrixWorld);const l=t.ray.origin.distanceTo(Lr);return l<t.near||l>t.far?null:{distance:l,point:Lr.clone(),object:i}}function Dr(i,e,t,n,s,r,o,a,c,l){i.getVertexPosition(a,Rr),i.getVertexPosition(c,Cr),i.getVertexPosition(l,Ir);const u=bm(i,e,t,n,Rr,Cr,Ir,Nl);if(u){const h=new N;mn.getBarycoord(Nl,Rr,Cr,Ir,h),s&&(u.uv=mn.getInterpolatedAttribute(s,a,c,l,h,new we)),r&&(u.uv1=mn.getInterpolatedAttribute(r,a,c,l,h,new we)),o&&(u.normal=mn.getInterpolatedAttribute(o,a,c,l,h,new N),u.normal.dot(n.direction)>0&&u.normal.multiplyScalar(-1));const d={a,b:c,c:l,normal:new N,materialIndex:0};mn.getNormal(Rr,Cr,Ir,d.normal),u.face=d,u.barycoord=h}return u}class mi extends Nt{constructor(e=1,t=1,n=1,s=1,r=1,o=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:n,widthSegments:s,heightSegments:r,depthSegments:o};const a=this;s=Math.floor(s),r=Math.floor(r),o=Math.floor(o);const c=[],l=[],u=[],h=[];let d=0,p=0;g("z","y","x",-1,-1,n,t,e,o,r,0),g("z","y","x",1,-1,n,t,-e,o,r,1),g("x","z","y",1,1,e,n,t,s,o,2),g("x","z","y",1,-1,e,n,-t,s,o,3),g("x","y","z",1,-1,e,t,n,s,r,4),g("x","y","z",-1,-1,e,t,-n,s,r,5),this.setIndex(c),this.setAttribute("position",new Mt(l,3)),this.setAttribute("normal",new Mt(u,3)),this.setAttribute("uv",new Mt(h,2));function g(_,m,f,y,x,v,A,w,R,C,S){const M=v/R,T=A/C,D=v/2,P=A/2,O=w/2,z=R+1,F=C+1;let X=0,V=0;const ee=new N;for(let re=0;re<F;re++){const ne=re*T-P;for(let Te=0;Te<z;Te++){const Fe=Te*M-D;ee[_]=Fe*y,ee[m]=ne*x,ee[f]=O,l.push(ee.x,ee.y,ee.z),ee[_]=0,ee[m]=0,ee[f]=w>0?1:-1,u.push(ee.x,ee.y,ee.z),h.push(Te/R),h.push(1-re/C),X+=1}}for(let re=0;re<C;re++)for(let ne=0;ne<R;ne++){const Te=d+ne+z*re,Fe=d+ne+z*(re+1),j=d+(ne+1)+z*(re+1),se=d+(ne+1)+z*re;c.push(Te,Fe,se),c.push(Fe,j,se),V+=6}a.addGroup(p,V,S),p+=V,d+=X}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new mi(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}}function Ms(i){const e={};for(const t in i){e[t]={};for(const n in i[t]){const s=i[t][n];s&&(s.isColor||s.isMatrix3||s.isMatrix4||s.isVector2||s.isVector3||s.isVector4||s.isTexture||s.isQuaternion)?s.isRenderTargetTexture?(console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][n]=null):e[t][n]=s.clone():Array.isArray(s)?e[t][n]=s.slice():e[t][n]=s}}return e}function Wt(i){const e={};for(let t=0;t<i.length;t++){const n=Ms(i[t]);for(const s in n)e[s]=n[s]}return e}function Am(i){const e=[];for(let t=0;t<i.length;t++)e.push(i[t].clone());return e}function jh(i){const e=i.getRenderTarget();return e===null?i.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:et.workingColorSpace}const wm={clone:Ms,merge:Wt};var Rm=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Cm=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class gi extends An{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Rm,this.fragmentShader=Cm,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=Ms(e.uniforms),this.uniformsGroups=Am(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this}toJSON(e){const t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(const s in this.uniforms){const o=this.uniforms[s].value;o&&o.isTexture?t.uniforms[s]={type:"t",value:o.toJSON(e).uuid}:o&&o.isColor?t.uniforms[s]={type:"c",value:o.getHex()}:o&&o.isVector2?t.uniforms[s]={type:"v2",value:o.toArray()}:o&&o.isVector3?t.uniforms[s]={type:"v3",value:o.toArray()}:o&&o.isVector4?t.uniforms[s]={type:"v4",value:o.toArray()}:o&&o.isMatrix3?t.uniforms[s]={type:"m3",value:o.toArray()}:o&&o.isMatrix4?t.uniforms[s]={type:"m4",value:o.toArray()}:t.uniforms[s]={value:o}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;const n={};for(const s in this.extensions)this.extensions[s]===!0&&(n[s]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}}class Kh extends vt{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new He,this.projectionMatrix=new He,this.projectionMatrixInverse=new He,this.coordinateSystem=Yn}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(e,t){super.updateWorldMatrix(e,t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}}const ai=new N,Ul=new we,Ol=new we;class Xt extends Kh{constructor(e=50,t=1,n=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=n,this.far=s,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){const t=.5*this.getFilmHeight()/e;this.fov=ys*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){const e=Math.tan(er*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return ys*2*Math.atan(Math.tan(er*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){ai.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(ai.x,ai.y).multiplyScalar(-e/ai.z),ai.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(ai.x,ai.y).multiplyScalar(-e/ai.z)}getViewSize(e,t){return this.getViewBounds(e,Ul,Ol),t.subVectors(Ol,Ul)}setViewOffset(e,t,n,s,r,o){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=this.near;let t=e*Math.tan(er*.5*this.fov)/this.zoom,n=2*t,s=this.aspect*n,r=-.5*s;const o=this.view;if(this.view!==null&&this.view.enabled){const c=o.fullWidth,l=o.fullHeight;r+=o.offsetX*s/c,t-=o.offsetY*n/l,s*=o.width/c,n*=o.height/l}const a=this.filmOffset;a!==0&&(r+=e*a/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+s,t,t-n,e,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}}const Zi=-90,Ji=1;class Im extends vt{constructor(e,t,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;const s=new Xt(Zi,Ji,e,t);s.layers=this.layers,this.add(s);const r=new Xt(Zi,Ji,e,t);r.layers=this.layers,this.add(r);const o=new Xt(Zi,Ji,e,t);o.layers=this.layers,this.add(o);const a=new Xt(Zi,Ji,e,t);a.layers=this.layers,this.add(a);const c=new Xt(Zi,Ji,e,t);c.layers=this.layers,this.add(c);const l=new Xt(Zi,Ji,e,t);l.layers=this.layers,this.add(l)}updateCoordinateSystem(){const e=this.coordinateSystem,t=this.children.concat(),[n,s,r,o,a,c]=t;for(const l of t)this.remove(l);if(e===Yn)n.up.set(0,1,0),n.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),o.up.set(0,0,1),o.lookAt(0,-1,0),a.up.set(0,1,0),a.lookAt(0,0,1),c.up.set(0,1,0),c.lookAt(0,0,-1);else if(e===fo)n.up.set(0,-1,0),n.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),o.up.set(0,0,-1),o.lookAt(0,-1,0),a.up.set(0,-1,0),a.lookAt(0,0,1),c.up.set(0,-1,0),c.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(const l of t)this.add(l),l.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();const{renderTarget:n,activeMipmapLevel:s}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());const[r,o,a,c,l,u]=this.children,h=e.getRenderTarget(),d=e.getActiveCubeFace(),p=e.getActiveMipmapLevel(),g=e.xr.enabled;e.xr.enabled=!1;const _=n.texture.generateMipmaps;n.texture.generateMipmaps=!1,e.setRenderTarget(n,0,s),e.render(t,r),e.setRenderTarget(n,1,s),e.render(t,o),e.setRenderTarget(n,2,s),e.render(t,a),e.setRenderTarget(n,3,s),e.render(t,c),e.setRenderTarget(n,4,s),e.render(t,l),n.texture.generateMipmaps=_,e.setRenderTarget(n,5,s),e.render(t,u),e.setRenderTarget(h,d,p),e.xr.enabled=g,n.texture.needsPMREMUpdate=!0}}class qh extends Ct{constructor(e=[],t=xs,n,s,r,o,a,c,l,u){super(e,t,n,s,r,o,a,c,l,u),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}}class Pm extends Oi{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;const n={width:e,height:e,depth:1},s=[n,n,n,n,n,n];this.texture=new qh(s),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;const n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},s=new mi(5,5,5),r=new gi({name:"CubemapFromEquirect",uniforms:Ms(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:Zt,blending:fi});r.uniforms.tEquirect.value=t;const o=new dt(s,r),a=t.minFilter;return t.minFilter===qn&&(t.minFilter=rn),new Im(1,10,this).update(e,o),t.minFilter=a,o.geometry.dispose(),o.material.dispose(),this}clear(e,t=!0,n=!0,s=!0){const r=e.getRenderTarget();for(let o=0;o<6;o++)e.setRenderTarget(this,o),e.clear(t,n,s);e.setRenderTarget(r)}}class an extends vt{constructor(){super(),this.isGroup=!0,this.type="Group"}}const Lm={type:"move"};class Jo{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new an,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new an,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new N,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new N),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new an,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new N,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new N),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){const t=this._hand;if(t)for(const n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let s=null,r=null,o=null;const a=this._targetRay,c=this._grip,l=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(l&&e.hand){o=!0;for(const _ of e.hand.values()){const m=t.getJointPose(_,n),f=this._getHandJoint(l,_);m!==null&&(f.matrix.fromArray(m.transform.matrix),f.matrix.decompose(f.position,f.rotation,f.scale),f.matrixWorldNeedsUpdate=!0,f.jointRadius=m.radius),f.visible=m!==null}const u=l.joints["index-finger-tip"],h=l.joints["thumb-tip"],d=u.position.distanceTo(h.position),p=.02,g=.005;l.inputState.pinching&&d>p+g?(l.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!l.inputState.pinching&&d<=p-g&&(l.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else c!==null&&e.gripSpace&&(r=t.getPose(e.gripSpace,n),r!==null&&(c.matrix.fromArray(r.transform.matrix),c.matrix.decompose(c.position,c.rotation,c.scale),c.matrixWorldNeedsUpdate=!0,r.linearVelocity?(c.hasLinearVelocity=!0,c.linearVelocity.copy(r.linearVelocity)):c.hasLinearVelocity=!1,r.angularVelocity?(c.hasAngularVelocity=!0,c.angularVelocity.copy(r.angularVelocity)):c.hasAngularVelocity=!1));a!==null&&(s=t.getPose(e.targetRaySpace,n),s===null&&r!==null&&(s=r),s!==null&&(a.matrix.fromArray(s.transform.matrix),a.matrix.decompose(a.position,a.rotation,a.scale),a.matrixWorldNeedsUpdate=!0,s.linearVelocity?(a.hasLinearVelocity=!0,a.linearVelocity.copy(s.linearVelocity)):a.hasLinearVelocity=!1,s.angularVelocity?(a.hasAngularVelocity=!0,a.angularVelocity.copy(s.angularVelocity)):a.hasAngularVelocity=!1,this.dispatchEvent(Lm)))}return a!==null&&(a.visible=s!==null),c!==null&&(c.visible=r!==null),l!==null&&(l.visible=o!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){const n=new an;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}}class Hc{constructor(e,t=1,n=1e3){this.isFog=!0,this.name="",this.color=new Ne(e),this.near=t,this.far=n}clone(){return new Hc(this.color,this.near,this.far)}toJSON(){return{type:"Fog",name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}}class Dm extends vt{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new Ln,this.environmentIntensity=1,this.environmentRotation=new Ln,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){const t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}}class Yh{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e!==void 0?e.length/t:0,this.usage=fc,this.updateRanges=[],this.version=0,this.uuid=bn()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,n){e*=this.stride,n*=t.stride;for(let s=0,r=this.stride;s<r;s++)this.array[e+s]=t.array[n+s];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=bn()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);const t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(t,this.stride);return n.setUsage(this.usage),n}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){return e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=bn()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}}const Gt=new N;class hr{constructor(e,t,n,s=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=e,this.itemSize=t,this.offset=n,this.normalized=s}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,n=this.data.count;t<n;t++)Gt.fromBufferAttribute(this,t),Gt.applyMatrix4(e),this.setXYZ(t,Gt.x,Gt.y,Gt.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Gt.fromBufferAttribute(this,t),Gt.applyNormalMatrix(e),this.setXYZ(t,Gt.x,Gt.y,Gt.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Gt.fromBufferAttribute(this,t),Gt.transformDirection(e),this.setXYZ(t,Gt.x,Gt.y,Gt.z);return this}getComponent(e,t){let n=this.array[e*this.data.stride+this.offset+t];return this.normalized&&(n=Sn(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=at(n,this.array)),this.data.array[e*this.data.stride+this.offset+t]=n,this}setX(e,t){return this.normalized&&(t=at(t,this.array)),this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.normalized&&(t=at(t,this.array)),this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.normalized&&(t=at(t,this.array)),this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.normalized&&(t=at(t,this.array)),this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];return this.normalized&&(t=Sn(t,this.array)),t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];return this.normalized&&(t=Sn(t,this.array)),t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];return this.normalized&&(t=Sn(t,this.array)),t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];return this.normalized&&(t=Sn(t,this.array)),t}setXY(e,t,n){return e=e*this.data.stride+this.offset,this.normalized&&(t=at(t,this.array),n=at(n,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this}setXYZ(e,t,n,s){return e=e*this.data.stride+this.offset,this.normalized&&(t=at(t,this.array),n=at(n,this.array),s=at(s,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=s,this}setXYZW(e,t,n,s,r){return e=e*this.data.stride+this.offset,this.normalized&&(t=at(t,this.array),n=at(n,this.array),s=at(s,this.array),r=at(r,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=s,this.data.array[e+3]=r,this}clone(e){if(e===void 0){console.log("THREE.InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");const t=[];for(let n=0;n<this.count;n++){const s=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[s+r])}return new Ft(new this.array.constructor(t),this.itemSize,this.normalized)}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.clone(e)),new hr(e.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){console.log("THREE.InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");const t=[];for(let n=0;n<this.count;n++){const s=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[s+r])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:t,normalized:this.normalized}}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}}class $h extends An{constructor(e){super(),this.isSpriteMaterial=!0,this.type="SpriteMaterial",this.color=new Ne(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.rotation=e.rotation,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}}let Qi;const zs=new N,es=new N,ts=new N,ns=new we,Hs=new we,Zh=new He,Nr=new N,Vs=new N,Ur=new N,Fl=new we,Qo=new we,kl=new we;class Nm extends vt{constructor(e=new $h){if(super(),this.isSprite=!0,this.type="Sprite",Qi===void 0){Qi=new Nt;const t=new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),n=new Yh(t,5);Qi.setIndex([0,1,2,0,2,3]),Qi.setAttribute("position",new hr(n,3,0,!1)),Qi.setAttribute("uv",new hr(n,2,3,!1))}this.geometry=Qi,this.material=e,this.center=new we(.5,.5),this.count=1}raycast(e,t){e.camera===null&&console.error('THREE.Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),es.setFromMatrixScale(this.matrixWorld),Zh.copy(e.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(e.camera.matrixWorldInverse,this.matrixWorld),ts.setFromMatrixPosition(this.modelViewMatrix),e.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&es.multiplyScalar(-ts.z);const n=this.material.rotation;let s,r;n!==0&&(r=Math.cos(n),s=Math.sin(n));const o=this.center;Or(Nr.set(-.5,-.5,0),ts,o,es,s,r),Or(Vs.set(.5,-.5,0),ts,o,es,s,r),Or(Ur.set(.5,.5,0),ts,o,es,s,r),Fl.set(0,0),Qo.set(1,0),kl.set(1,1);let a=e.ray.intersectTriangle(Nr,Vs,Ur,!1,zs);if(a===null&&(Or(Vs.set(-.5,.5,0),ts,o,es,s,r),Qo.set(0,1),a=e.ray.intersectTriangle(Nr,Ur,Vs,!1,zs),a===null))return;const c=e.ray.origin.distanceTo(zs);c<e.near||c>e.far||t.push({distance:c,point:zs.clone(),uv:mn.getInterpolation(zs,Nr,Vs,Ur,Fl,Qo,kl,new we),face:null,object:this})}copy(e,t){return super.copy(e,t),e.center!==void 0&&this.center.copy(e.center),this.material=e.material,this}}function Or(i,e,t,n,s,r){ns.subVectors(i,t).addScalar(.5).multiply(n),s!==void 0?(Hs.x=r*ns.x-s*ns.y,Hs.y=s*ns.x+r*ns.y):Hs.copy(ns),i.copy(e),i.x+=Hs.x,i.y+=Hs.y,i.applyMatrix4(Zh)}const Bl=new N,zl=new rt,Hl=new rt,Um=new N,Vl=new He,Fr=new N,ea=new Un,Gl=new He,ta=new bs;class Om extends dt{constructor(e,t){super(e,t),this.isSkinnedMesh=!0,this.type="SkinnedMesh",this.bindMode=gl,this.bindMatrix=new He,this.bindMatrixInverse=new He,this.boundingBox=null,this.boundingSphere=null}computeBoundingBox(){const e=this.geometry;this.boundingBox===null&&(this.boundingBox=new Nn),this.boundingBox.makeEmpty();const t=e.getAttribute("position");for(let n=0;n<t.count;n++)this.getVertexPosition(n,Fr),this.boundingBox.expandByPoint(Fr)}computeBoundingSphere(){const e=this.geometry;this.boundingSphere===null&&(this.boundingSphere=new Un),this.boundingSphere.makeEmpty();const t=e.getAttribute("position");for(let n=0;n<t.count;n++)this.getVertexPosition(n,Fr),this.boundingSphere.expandByPoint(Fr)}copy(e,t){return super.copy(e,t),this.bindMode=e.bindMode,this.bindMatrix.copy(e.bindMatrix),this.bindMatrixInverse.copy(e.bindMatrixInverse),this.skeleton=e.skeleton,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}raycast(e,t){const n=this.material,s=this.matrixWorld;n!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),ea.copy(this.boundingSphere),ea.applyMatrix4(s),e.ray.intersectsSphere(ea)!==!1&&(Gl.copy(s).invert(),ta.copy(e.ray).applyMatrix4(Gl),!(this.boundingBox!==null&&ta.intersectsBox(this.boundingBox)===!1)&&this._computeIntersections(e,t,ta)))}getVertexPosition(e,t){return super.getVertexPosition(e,t),this.applyBoneTransform(e,t),t}bind(e,t){this.skeleton=e,t===void 0&&(this.updateMatrixWorld(!0),this.skeleton.calculateInverses(),t=this.matrixWorld),this.bindMatrix.copy(t),this.bindMatrixInverse.copy(t).invert()}pose(){this.skeleton.pose()}normalizeSkinWeights(){const e=new rt,t=this.geometry.attributes.skinWeight;for(let n=0,s=t.count;n<s;n++){e.fromBufferAttribute(t,n);const r=1/e.manhattanLength();r!==1/0?e.multiplyScalar(r):e.set(1,0,0,0),t.setXYZW(n,e.x,e.y,e.z,e.w)}}updateMatrixWorld(e){super.updateMatrixWorld(e),this.bindMode===gl?this.bindMatrixInverse.copy(this.matrixWorld).invert():this.bindMode===wp?this.bindMatrixInverse.copy(this.bindMatrix).invert():console.warn("THREE.SkinnedMesh: Unrecognized bindMode: "+this.bindMode)}applyBoneTransform(e,t){const n=this.skeleton,s=this.geometry;zl.fromBufferAttribute(s.attributes.skinIndex,e),Hl.fromBufferAttribute(s.attributes.skinWeight,e),Bl.copy(t).applyMatrix4(this.bindMatrix),t.set(0,0,0);for(let r=0;r<4;r++){const o=Hl.getComponent(r);if(o!==0){const a=zl.getComponent(r);Vl.multiplyMatrices(n.bones[a].matrixWorld,n.boneInverses[a]),t.addScaledVector(Um.copy(Bl).applyMatrix4(Vl),o)}}return t.applyMatrix4(this.bindMatrixInverse)}}class Jh extends vt{constructor(){super(),this.isBone=!0,this.type="Bone"}}class Qh extends Ct{constructor(e=null,t=1,n=1,s,r,o,a,c,l=jt,u=jt,h,d){super(null,o,a,c,l,u,s,r,h,d),this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}const Wl=new He,Fm=new He;class Vc{constructor(e=[],t=[]){this.uuid=bn(),this.bones=e.slice(0),this.boneInverses=t,this.boneMatrices=null,this.boneTexture=null,this.init()}init(){const e=this.bones,t=this.boneInverses;if(this.boneMatrices=new Float32Array(e.length*16),t.length===0)this.calculateInverses();else if(e.length!==t.length){console.warn("THREE.Skeleton: Number of inverse bone matrices does not match amount of bones."),this.boneInverses=[];for(let n=0,s=this.bones.length;n<s;n++)this.boneInverses.push(new He)}}calculateInverses(){this.boneInverses.length=0;for(let e=0,t=this.bones.length;e<t;e++){const n=new He;this.bones[e]&&n.copy(this.bones[e].matrixWorld).invert(),this.boneInverses.push(n)}}pose(){for(let e=0,t=this.bones.length;e<t;e++){const n=this.bones[e];n&&n.matrixWorld.copy(this.boneInverses[e]).invert()}for(let e=0,t=this.bones.length;e<t;e++){const n=this.bones[e];n&&(n.parent&&n.parent.isBone?(n.matrix.copy(n.parent.matrixWorld).invert(),n.matrix.multiply(n.matrixWorld)):n.matrix.copy(n.matrixWorld),n.matrix.decompose(n.position,n.quaternion,n.scale))}}update(){const e=this.bones,t=this.boneInverses,n=this.boneMatrices,s=this.boneTexture;for(let r=0,o=e.length;r<o;r++){const a=e[r]?e[r].matrixWorld:Fm;Wl.multiplyMatrices(a,t[r]),Wl.toArray(n,r*16)}s!==null&&(s.needsUpdate=!0)}clone(){return new Vc(this.bones,this.boneInverses)}computeBoneTexture(){let e=Math.sqrt(this.bones.length*4);e=Math.ceil(e/4)*4,e=Math.max(e,4);const t=new Float32Array(e*e*4);t.set(this.boneMatrices);const n=new Qh(t,e,e,gn,Tn);return n.needsUpdate=!0,this.boneMatrices=t,this.boneTexture=n,this}getBoneByName(e){for(let t=0,n=this.bones.length;t<n;t++){const s=this.bones[t];if(s.name===e)return s}}dispose(){this.boneTexture!==null&&(this.boneTexture.dispose(),this.boneTexture=null)}fromJSON(e,t){this.uuid=e.uuid;for(let n=0,s=e.bones.length;n<s;n++){const r=e.bones[n];let o=t[r];o===void 0&&(console.warn("THREE.Skeleton: No bone found with UUID:",r),o=new Jh),this.bones.push(o),this.boneInverses.push(new He().fromArray(e.boneInverses[n]))}return this.init(),this}toJSON(){const e={metadata:{version:4.7,type:"Skeleton",generator:"Skeleton.toJSON"},bones:[],boneInverses:[]};e.uuid=this.uuid;const t=this.bones,n=this.boneInverses;for(let s=0,r=t.length;s<r;s++){const o=t[s];e.bones.push(o.uuid);const a=n[s];e.boneInverses.push(a.toArray())}return e}}class pc extends Ft{constructor(e,t,n,s=1){super(e,t,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=s}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){const e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}}const is=new He,Xl=new He,kr=[],jl=new Nn,km=new He,Gs=new dt,Ws=new Un;class ed extends dt{constructor(e,t,n){super(e,t),this.isInstancedMesh=!0,this.instanceMatrix=new pc(new Float32Array(n*16),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let s=0;s<n;s++)this.setMatrixAt(s,km)}computeBoundingBox(){const e=this.geometry,t=this.count;this.boundingBox===null&&(this.boundingBox=new Nn),e.boundingBox===null&&e.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,is),jl.copy(e.boundingBox).applyMatrix4(is),this.boundingBox.union(jl)}computeBoundingSphere(){const e=this.geometry,t=this.count;this.boundingSphere===null&&(this.boundingSphere=new Un),e.boundingSphere===null&&e.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,is),Ws.copy(e.boundingSphere).applyMatrix4(is),this.boundingSphere.union(Ws)}copy(e,t){return super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),e.morphTexture!==null&&(this.morphTexture=e.morphTexture.clone()),e.instanceColor!==null&&(this.instanceColor=e.instanceColor.clone()),this.count=e.count,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}getColorAt(e,t){t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){t.fromArray(this.instanceMatrix.array,e*16)}getMorphAt(e,t){const n=t.morphTargetInfluences,s=this.morphTexture.source.data.data,r=n.length+1,o=e*r+1;for(let a=0;a<n.length;a++)n[a]=s[o+a]}raycast(e,t){const n=this.matrixWorld,s=this.count;if(Gs.geometry=this.geometry,Gs.material=this.material,Gs.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),Ws.copy(this.boundingSphere),Ws.applyMatrix4(n),e.ray.intersectsSphere(Ws)!==!1))for(let r=0;r<s;r++){this.getMatrixAt(r,is),Xl.multiplyMatrices(n,is),Gs.matrixWorld=Xl,Gs.raycast(e,kr);for(let o=0,a=kr.length;o<a;o++){const c=kr[o];c.instanceId=r,c.object=this,t.push(c)}kr.length=0}}setColorAt(e,t){this.instanceColor===null&&(this.instanceColor=new pc(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),t.toArray(this.instanceColor.array,e*3)}setMatrixAt(e,t){t.toArray(this.instanceMatrix.array,e*16)}setMorphAt(e,t){const n=t.morphTargetInfluences,s=n.length+1;this.morphTexture===null&&(this.morphTexture=new Qh(new Float32Array(s*this.count),s,this.count,Dc,Tn));const r=this.morphTexture.source.data.data;let o=0;for(let l=0;l<n.length;l++)o+=n[l];const a=this.geometry.morphTargetsRelative?1:1-o,c=s*e;r[c]=a,r.set(n,c+1)}updateMorphTargets(){}dispose(){this.dispatchEvent({type:"dispose"}),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}}const na=new N,Bm=new N,zm=new Xe;class jn{constructor(e=new N(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,s){return this.normal.set(e,t,n),this.constant=s,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){const s=na.subVectors(n,t).cross(Bm.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(s,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){const e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t){const n=e.delta(na),s=this.normal.dot(n);if(s===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;const r=-(e.start.dot(this.normal)+this.constant)/s;return r<0||r>1?null:t.copy(e.start).addScaledVector(n,r)}intersectsLine(e){const t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){const n=t||zm.getNormalMatrix(e),s=this.coplanarPoint(na).applyMatrix4(e),r=this.normal.applyMatrix3(n).normalize();return this.constant=-s.dot(r),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}}const Ti=new Un,Hm=new we(.5,.5),Br=new N;class Gc{constructor(e=new jn,t=new jn,n=new jn,s=new jn,r=new jn,o=new jn){this.planes=[e,t,n,s,r,o]}set(e,t,n,s,r,o){const a=this.planes;return a[0].copy(e),a[1].copy(t),a[2].copy(n),a[3].copy(s),a[4].copy(r),a[5].copy(o),this}copy(e){const t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=Yn){const n=this.planes,s=e.elements,r=s[0],o=s[1],a=s[2],c=s[3],l=s[4],u=s[5],h=s[6],d=s[7],p=s[8],g=s[9],_=s[10],m=s[11],f=s[12],y=s[13],x=s[14],v=s[15];if(n[0].setComponents(c-r,d-l,m-p,v-f).normalize(),n[1].setComponents(c+r,d+l,m+p,v+f).normalize(),n[2].setComponents(c+o,d+u,m+g,v+y).normalize(),n[3].setComponents(c-o,d-u,m-g,v-y).normalize(),n[4].setComponents(c-a,d-h,m-_,v-x).normalize(),t===Yn)n[5].setComponents(c+a,d+h,m+_,v+x).normalize();else if(t===fo)n[5].setComponents(a,h,_,x).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),Ti.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{const t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),Ti.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(Ti)}intersectsSprite(e){Ti.center.set(0,0,0);const t=Hm.distanceTo(e.center);return Ti.radius=.7071067811865476+t,Ti.applyMatrix4(e.matrixWorld),this.intersectsSphere(Ti)}intersectsSphere(e){const t=this.planes,n=e.center,s=-e.radius;for(let r=0;r<6;r++)if(t[r].distanceToPoint(n)<s)return!1;return!0}intersectsBox(e){const t=this.planes;for(let n=0;n<6;n++){const s=t[n];if(Br.x=s.normal.x>0?e.max.x:e.min.x,Br.y=s.normal.y>0?e.max.y:e.min.y,Br.z=s.normal.z>0?e.max.z:e.min.z,s.distanceToPoint(Br)<0)return!1}return!0}containsPoint(e){const t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}class Wc extends An{constructor(e){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new Ne(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.fog=e.fog,this}}const po=new N,mo=new N,Kl=new He,Xs=new bs,zr=new Un,ia=new N,ql=new N;class Mo extends vt{constructor(e=new Nt,t=new Wc){super(),this.isLine=!0,this.type="Line",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}computeLineDistances(){const e=this.geometry;if(e.index===null){const t=e.attributes.position,n=[0];for(let s=1,r=t.count;s<r;s++)po.fromBufferAttribute(t,s-1),mo.fromBufferAttribute(t,s),n[s]=n[s-1],n[s]+=po.distanceTo(mo);e.setAttribute("lineDistance",new Mt(n,1))}else console.warn("THREE.Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}raycast(e,t){const n=this.geometry,s=this.matrixWorld,r=e.params.Line.threshold,o=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),zr.copy(n.boundingSphere),zr.applyMatrix4(s),zr.radius+=r,e.ray.intersectsSphere(zr)===!1)return;Kl.copy(s).invert(),Xs.copy(e.ray).applyMatrix4(Kl);const a=r/((this.scale.x+this.scale.y+this.scale.z)/3),c=a*a,l=this.isLineSegments?2:1,u=n.index,d=n.attributes.position;if(u!==null){const p=Math.max(0,o.start),g=Math.min(u.count,o.start+o.count);for(let _=p,m=g-1;_<m;_+=l){const f=u.getX(_),y=u.getX(_+1),x=Hr(this,e,Xs,c,f,y,_);x&&t.push(x)}if(this.isLineLoop){const _=u.getX(g-1),m=u.getX(p),f=Hr(this,e,Xs,c,_,m,g-1);f&&t.push(f)}}else{const p=Math.max(0,o.start),g=Math.min(d.count,o.start+o.count);for(let _=p,m=g-1;_<m;_+=l){const f=Hr(this,e,Xs,c,_,_+1,_);f&&t.push(f)}if(this.isLineLoop){const _=Hr(this,e,Xs,c,g-1,p,g-1);_&&t.push(_)}}}updateMorphTargets(){const t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){const s=t[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=s.length;r<o;r++){const a=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}}function Hr(i,e,t,n,s,r,o){const a=i.geometry.attributes.position;if(po.fromBufferAttribute(a,s),mo.fromBufferAttribute(a,r),t.distanceSqToSegment(po,mo,ia,ql)>n)return;ia.applyMatrix4(i.matrixWorld);const l=e.ray.origin.distanceTo(ia);if(!(l<e.near||l>e.far))return{distance:l,point:ql.clone().applyMatrix4(i.matrixWorld),index:o,face:null,faceIndex:null,barycoord:null,object:i}}const Yl=new N,$l=new N;class Vm extends Mo{constructor(e,t){super(e,t),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){const e=this.geometry;if(e.index===null){const t=e.attributes.position,n=[];for(let s=0,r=t.count;s<r;s+=2)Yl.fromBufferAttribute(t,s),$l.fromBufferAttribute(t,s+1),n[s]=s===0?0:n[s-1],n[s+1]=n[s]+Yl.distanceTo($l);e.setAttribute("lineDistance",new Mt(n,1))}else console.warn("THREE.LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}}class Gm extends Mo{constructor(e,t){super(e,t),this.isLineLoop=!0,this.type="LineLoop"}}class Xc extends An{constructor(e){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new Ne(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}}const Zl=new He,mc=new bs,Vr=new Un,Gr=new N;class td extends vt{constructor(e=new Nt,t=new Xc){super(),this.isPoints=!0,this.type="Points",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}raycast(e,t){const n=this.geometry,s=this.matrixWorld,r=e.params.Points.threshold,o=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),Vr.copy(n.boundingSphere),Vr.applyMatrix4(s),Vr.radius+=r,e.ray.intersectsSphere(Vr)===!1)return;Zl.copy(s).invert(),mc.copy(e.ray).applyMatrix4(Zl);const a=r/((this.scale.x+this.scale.y+this.scale.z)/3),c=a*a,l=n.index,h=n.attributes.position;if(l!==null){const d=Math.max(0,o.start),p=Math.min(l.count,o.start+o.count);for(let g=d,_=p;g<_;g++){const m=l.getX(g);Gr.fromBufferAttribute(h,m),Jl(Gr,m,c,s,e,t,this)}}else{const d=Math.max(0,o.start),p=Math.min(h.count,o.start+o.count);for(let g=d,_=p;g<_;g++)Gr.fromBufferAttribute(h,g),Jl(Gr,g,c,s,e,t,this)}}updateMorphTargets(){const t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){const s=t[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=s.length;r<o;r++){const a=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}}function Jl(i,e,t,n,s,r,o){const a=mc.distanceSqToPoint(i);if(a<t){const c=new N;mc.closestPointToPoint(i,c),c.applyMatrix4(n);const l=s.ray.origin.distanceTo(c);if(l<s.near||l>s.far)return;r.push({distance:l,distanceToRay:Math.sqrt(a),point:c,index:e,face:null,faceIndex:null,barycoord:null,object:o})}}class Eo extends Ct{constructor(e,t,n,s,r,o,a,c,l){super(e,t,n,s,r,o,a,c,l),this.isCanvasTexture=!0,this.needsUpdate=!0}}class nd extends Ct{constructor(e,t,n=Ui,s,r,o,a=jt,c=jt,l,u=or,h=1){if(u!==or&&u!==ar)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");const d={width:e,height:t,depth:h};super(d,s,r,o,a,c,u,n,l),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new Bc(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){const t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}}class Kn extends Nt{constructor(e=1,t=1,n=4,s=8,r=1){super(),this.type="CapsuleGeometry",this.parameters={radius:e,height:t,capSegments:n,radialSegments:s,heightSegments:r},t=Math.max(0,t),n=Math.max(1,Math.floor(n)),s=Math.max(3,Math.floor(s)),r=Math.max(1,Math.floor(r));const o=[],a=[],c=[],l=[],u=t/2,h=Math.PI/2*e,d=t,p=2*h+d,g=n*2+r,_=s+1,m=new N,f=new N;for(let y=0;y<=g;y++){let x=0,v=0,A=0,w=0;if(y<=n){const S=y/n,M=S*Math.PI/2;v=-u-e*Math.cos(M),A=e*Math.sin(M),w=-e*Math.cos(M),x=S*h}else if(y<=n+r){const S=(y-n)/r;v=-u+S*t,A=e,w=0,x=h+S*d}else{const S=(y-n-r)/n,M=S*Math.PI/2;v=u+e*Math.sin(M),A=e*Math.cos(M),w=e*Math.sin(M),x=h+d+S*h}const R=Math.max(0,Math.min(1,x/p));let C=0;y===0?C=.5/s:y===g&&(C=-.5/s);for(let S=0;S<=s;S++){const M=S/s,T=M*Math.PI*2,D=Math.sin(T),P=Math.cos(T);f.x=-A*P,f.y=v,f.z=A*D,a.push(f.x,f.y,f.z),m.set(-A*P,w,A*D),m.normalize(),c.push(m.x,m.y,m.z),l.push(M+C,R)}if(y>0){const S=(y-1)*_;for(let M=0;M<s;M++){const T=S+M,D=S+M+1,P=y*_+M,O=y*_+M+1;o.push(T,D,P),o.push(D,O,P)}}}this.setIndex(o),this.setAttribute("position",new Mt(a,3)),this.setAttribute("normal",new Mt(c,3)),this.setAttribute("uv",new Mt(l,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Kn(e.radius,e.height,e.capSegments,e.radialSegments,e.heightSegments)}}class jc extends Nt{constructor(e=1,t=32,n=0,s=Math.PI*2){super(),this.type="CircleGeometry",this.parameters={radius:e,segments:t,thetaStart:n,thetaLength:s},t=Math.max(3,t);const r=[],o=[],a=[],c=[],l=new N,u=new we;o.push(0,0,0),a.push(0,0,1),c.push(.5,.5);for(let h=0,d=3;h<=t;h++,d+=3){const p=n+h/t*s;l.x=e*Math.cos(p),l.y=e*Math.sin(p),o.push(l.x,l.y,l.z),a.push(0,0,1),u.x=(o[d]/e+1)/2,u.y=(o[d+1]/e+1)/2,c.push(u.x,u.y)}for(let h=1;h<=t;h++)r.push(h,h+1,0);this.setIndex(r),this.setAttribute("position",new Mt(o,3)),this.setAttribute("normal",new Mt(a,3)),this.setAttribute("uv",new Mt(c,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new jc(e.radius,e.segments,e.thetaStart,e.thetaLength)}}class go extends Nt{constructor(e=1,t=1,n=1,s=32,r=1,o=!1,a=0,c=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:e,radiusBottom:t,height:n,radialSegments:s,heightSegments:r,openEnded:o,thetaStart:a,thetaLength:c};const l=this;s=Math.floor(s),r=Math.floor(r);const u=[],h=[],d=[],p=[];let g=0;const _=[],m=n/2;let f=0;y(),o===!1&&(e>0&&x(!0),t>0&&x(!1)),this.setIndex(u),this.setAttribute("position",new Mt(h,3)),this.setAttribute("normal",new Mt(d,3)),this.setAttribute("uv",new Mt(p,2));function y(){const v=new N,A=new N;let w=0;const R=(t-e)/n;for(let C=0;C<=r;C++){const S=[],M=C/r,T=M*(t-e)+e;for(let D=0;D<=s;D++){const P=D/s,O=P*c+a,z=Math.sin(O),F=Math.cos(O);A.x=T*z,A.y=-M*n+m,A.z=T*F,h.push(A.x,A.y,A.z),v.set(z,R,F).normalize(),d.push(v.x,v.y,v.z),p.push(P,1-M),S.push(g++)}_.push(S)}for(let C=0;C<s;C++)for(let S=0;S<r;S++){const M=_[S][C],T=_[S+1][C],D=_[S+1][C+1],P=_[S][C+1];(e>0||S!==0)&&(u.push(M,T,P),w+=3),(t>0||S!==r-1)&&(u.push(T,D,P),w+=3)}l.addGroup(f,w,0),f+=w}function x(v){const A=g,w=new we,R=new N;let C=0;const S=v===!0?e:t,M=v===!0?1:-1;for(let D=1;D<=s;D++)h.push(0,m*M,0),d.push(0,M,0),p.push(.5,.5),g++;const T=g;for(let D=0;D<=s;D++){const O=D/s*c+a,z=Math.cos(O),F=Math.sin(O);R.x=S*F,R.y=m*M,R.z=S*z,h.push(R.x,R.y,R.z),d.push(0,M,0),w.x=z*.5+.5,w.y=F*.5*M+.5,p.push(w.x,w.y),g++}for(let D=0;D<s;D++){const P=A+D,O=T+D;v===!0?u.push(O,O+1,P):u.push(O+1,O,P),C+=3}l.addGroup(f,C,v===!0?1:2),f+=C}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new go(e.radiusTop,e.radiusBottom,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}}class Dn extends Nt{constructor(e=1,t=1,n=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:n,heightSegments:s};const r=e/2,o=t/2,a=Math.floor(n),c=Math.floor(s),l=a+1,u=c+1,h=e/a,d=t/c,p=[],g=[],_=[],m=[];for(let f=0;f<u;f++){const y=f*d-o;for(let x=0;x<l;x++){const v=x*h-r;g.push(v,-y,0),_.push(0,0,1),m.push(x/a),m.push(1-f/c)}}for(let f=0;f<c;f++)for(let y=0;y<a;y++){const x=y+l*f,v=y+l*(f+1),A=y+1+l*(f+1),w=y+1+l*f;p.push(x,v,w),p.push(v,A,w)}this.setIndex(p),this.setAttribute("position",new Mt(g,3)),this.setAttribute("normal",new Mt(_,3)),this.setAttribute("uv",new Mt(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Dn(e.width,e.height,e.widthSegments,e.heightSegments)}}class So extends Nt{constructor(e=.5,t=1,n=32,s=1,r=0,o=Math.PI*2){super(),this.type="RingGeometry",this.parameters={innerRadius:e,outerRadius:t,thetaSegments:n,phiSegments:s,thetaStart:r,thetaLength:o},n=Math.max(3,n),s=Math.max(1,s);const a=[],c=[],l=[],u=[];let h=e;const d=(t-e)/s,p=new N,g=new we;for(let _=0;_<=s;_++){for(let m=0;m<=n;m++){const f=r+m/n*o;p.x=h*Math.cos(f),p.y=h*Math.sin(f),c.push(p.x,p.y,p.z),l.push(0,0,1),g.x=(p.x/t+1)/2,g.y=(p.y/t+1)/2,u.push(g.x,g.y)}h+=d}for(let _=0;_<s;_++){const m=_*(n+1);for(let f=0;f<n;f++){const y=f+m,x=y,v=y+n+1,A=y+n+2,w=y+1;a.push(x,v,w),a.push(v,A,w)}}this.setIndex(a),this.setAttribute("position",new Mt(c,3)),this.setAttribute("normal",new Mt(l,3)),this.setAttribute("uv",new Mt(u,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new So(e.innerRadius,e.outerRadius,e.thetaSegments,e.phiSegments,e.thetaStart,e.thetaLength)}}class ms extends Nt{constructor(e=1,t=32,n=16,s=0,r=Math.PI*2,o=0,a=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:e,widthSegments:t,heightSegments:n,phiStart:s,phiLength:r,thetaStart:o,thetaLength:a},t=Math.max(3,Math.floor(t)),n=Math.max(2,Math.floor(n));const c=Math.min(o+a,Math.PI);let l=0;const u=[],h=new N,d=new N,p=[],g=[],_=[],m=[];for(let f=0;f<=n;f++){const y=[],x=f/n;let v=0;f===0&&o===0?v=.5/t:f===n&&c===Math.PI&&(v=-.5/t);for(let A=0;A<=t;A++){const w=A/t;h.x=-e*Math.cos(s+w*r)*Math.sin(o+x*a),h.y=e*Math.cos(o+x*a),h.z=e*Math.sin(s+w*r)*Math.sin(o+x*a),g.push(h.x,h.y,h.z),d.copy(h).normalize(),_.push(d.x,d.y,d.z),m.push(w+v,1-x),y.push(l++)}u.push(y)}for(let f=0;f<n;f++)for(let y=0;y<t;y++){const x=u[f][y+1],v=u[f][y],A=u[f+1][y],w=u[f+1][y+1];(f!==0||o>0)&&p.push(x,v,w),(f!==n-1||c<Math.PI)&&p.push(v,A,w)}this.setIndex(p),this.setAttribute("position",new Mt(g,3)),this.setAttribute("normal",new Mt(_,3)),this.setAttribute("uv",new Mt(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new ms(e.radius,e.widthSegments,e.heightSegments,e.phiStart,e.phiLength,e.thetaStart,e.thetaLength)}}class xn extends An{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new Ne(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Ne(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=kh,this.normalScale=new we(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Ln,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}}class On extends xn{constructor(e){super(),this.isMeshPhysicalMaterial=!0,this.defines={STANDARD:"",PHYSICAL:""},this.type="MeshPhysicalMaterial",this.anisotropyRotation=0,this.anisotropyMap=null,this.clearcoatMap=null,this.clearcoatRoughness=0,this.clearcoatRoughnessMap=null,this.clearcoatNormalScale=new we(1,1),this.clearcoatNormalMap=null,this.ior=1.5,Object.defineProperty(this,"reflectivity",{get:function(){return Ke(2.5*(this.ior-1)/(this.ior+1),0,1)},set:function(t){this.ior=(1+.4*t)/(1-.4*t)}}),this.iridescenceMap=null,this.iridescenceIOR=1.3,this.iridescenceThicknessRange=[100,400],this.iridescenceThicknessMap=null,this.sheenColor=new Ne(0),this.sheenColorMap=null,this.sheenRoughness=1,this.sheenRoughnessMap=null,this.transmissionMap=null,this.thickness=0,this.thicknessMap=null,this.attenuationDistance=1/0,this.attenuationColor=new Ne(1,1,1),this.specularIntensity=1,this.specularIntensityMap=null,this.specularColor=new Ne(1,1,1),this.specularColorMap=null,this._anisotropy=0,this._clearcoat=0,this._dispersion=0,this._iridescence=0,this._sheen=0,this._transmission=0,this.setValues(e)}get anisotropy(){return this._anisotropy}set anisotropy(e){this._anisotropy>0!=e>0&&this.version++,this._anisotropy=e}get clearcoat(){return this._clearcoat}set clearcoat(e){this._clearcoat>0!=e>0&&this.version++,this._clearcoat=e}get iridescence(){return this._iridescence}set iridescence(e){this._iridescence>0!=e>0&&this.version++,this._iridescence=e}get dispersion(){return this._dispersion}set dispersion(e){this._dispersion>0!=e>0&&this.version++,this._dispersion=e}get sheen(){return this._sheen}set sheen(e){this._sheen>0!=e>0&&this.version++,this._sheen=e}get transmission(){return this._transmission}set transmission(e){this._transmission>0!=e>0&&this.version++,this._transmission=e}copy(e){return super.copy(e),this.defines={STANDARD:"",PHYSICAL:""},this.anisotropy=e.anisotropy,this.anisotropyRotation=e.anisotropyRotation,this.anisotropyMap=e.anisotropyMap,this.clearcoat=e.clearcoat,this.clearcoatMap=e.clearcoatMap,this.clearcoatRoughness=e.clearcoatRoughness,this.clearcoatRoughnessMap=e.clearcoatRoughnessMap,this.clearcoatNormalMap=e.clearcoatNormalMap,this.clearcoatNormalScale.copy(e.clearcoatNormalScale),this.dispersion=e.dispersion,this.ior=e.ior,this.iridescence=e.iridescence,this.iridescenceMap=e.iridescenceMap,this.iridescenceIOR=e.iridescenceIOR,this.iridescenceThicknessRange=[...e.iridescenceThicknessRange],this.iridescenceThicknessMap=e.iridescenceThicknessMap,this.sheen=e.sheen,this.sheenColor.copy(e.sheenColor),this.sheenColorMap=e.sheenColorMap,this.sheenRoughness=e.sheenRoughness,this.sheenRoughnessMap=e.sheenRoughnessMap,this.transmission=e.transmission,this.transmissionMap=e.transmissionMap,this.thickness=e.thickness,this.thicknessMap=e.thicknessMap,this.attenuationDistance=e.attenuationDistance,this.attenuationColor.copy(e.attenuationColor),this.specularIntensity=e.specularIntensity,this.specularIntensityMap=e.specularIntensityMap,this.specularColor.copy(e.specularColor),this.specularColorMap=e.specularColorMap,this}}class Wm extends An{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=Dp,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}}class Xm extends An{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}}function Wr(i,e){return!i||i.constructor===e?i:typeof e.BYTES_PER_ELEMENT=="number"?new e(i):Array.prototype.slice.call(i)}function jm(i){return ArrayBuffer.isView(i)&&!(i instanceof DataView)}function Km(i){function e(s,r){return i[s]-i[r]}const t=i.length,n=new Array(t);for(let s=0;s!==t;++s)n[s]=s;return n.sort(e),n}function Ql(i,e,t){const n=i.length,s=new i.constructor(n);for(let r=0,o=0;o!==n;++r){const a=t[r]*e;for(let c=0;c!==e;++c)s[o++]=i[a+c]}return s}function id(i,e,t,n){let s=1,r=i[0];for(;r!==void 0&&r[n]===void 0;)r=i[s++];if(r===void 0)return;let o=r[n];if(o!==void 0)if(Array.isArray(o))do o=r[n],o!==void 0&&(e.push(r.time),t.push(...o)),r=i[s++];while(r!==void 0);else if(o.toArray!==void 0)do o=r[n],o!==void 0&&(e.push(r.time),o.toArray(t,t.length)),r=i[s++];while(r!==void 0);else do o=r[n],o!==void 0&&(e.push(r.time),t.push(o)),r=i[s++];while(r!==void 0)}class mr{constructor(e,t,n,s){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=s!==void 0?s:new t.constructor(n),this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){const t=this.parameterPositions;let n=this._cachedIndex,s=t[n],r=t[n-1];e:{t:{let o;n:{i:if(!(e<s)){for(let a=n+2;;){if(s===void 0){if(e<r)break i;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===a)break;if(r=s,s=t[++n],e<s)break t}o=t.length;break n}if(!(e>=r)){const a=t[1];e<a&&(n=2,r=a);for(let c=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===c)break;if(s=r,r=t[--n-1],e>=r)break t}o=n,n=0;break n}break e}for(;n<o;){const a=n+o>>>1;e<t[a]?o=a:n=a+1}if(s=t[n],r=t[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(s===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,s)}return this.interpolate_(n,r,e,s)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){const t=this.resultBuffer,n=this.sampleValues,s=this.valueSize,r=e*s;for(let o=0;o!==s;++o)t[o]=n[r+o];return t}interpolate_(){throw new Error("call to abstract method")}intervalChanged_(){}}class qm extends mr{constructor(e,t,n,s){super(e,t,n,s),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:as,endingEnd:as}}intervalChanged_(e,t,n){const s=this.parameterPositions;let r=e-2,o=e+1,a=s[r],c=s[o];if(a===void 0)switch(this.getSettings_().endingStart){case cs:r=e,a=2*t-n;break;case uo:r=s.length-2,a=t+s[r]-s[r+1];break;default:r=e,a=n}if(c===void 0)switch(this.getSettings_().endingEnd){case cs:o=e,c=2*n-t;break;case uo:o=1,c=n+s[1]-s[0];break;default:o=e-1,c=t}const l=(n-t)*.5,u=this.valueSize;this._weightPrev=l/(t-a),this._weightNext=l/(c-n),this._offsetPrev=r*u,this._offsetNext=o*u}interpolate_(e,t,n,s){const r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,c=e*a,l=c-a,u=this._offsetPrev,h=this._offsetNext,d=this._weightPrev,p=this._weightNext,g=(n-t)/(s-t),_=g*g,m=_*g,f=-d*m+2*d*_-d*g,y=(1+d)*m+(-1.5-2*d)*_+(-.5+d)*g+1,x=(-1-p)*m+(1.5+p)*_+.5*g,v=p*m-p*_;for(let A=0;A!==a;++A)r[A]=f*o[u+A]+y*o[l+A]+x*o[c+A]+v*o[h+A];return r}}class sd extends mr{constructor(e,t,n,s){super(e,t,n,s)}interpolate_(e,t,n,s){const r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,c=e*a,l=c-a,u=(n-t)/(s-t),h=1-u;for(let d=0;d!==a;++d)r[d]=o[l+d]*h+o[c+d]*u;return r}}class Ym extends mr{constructor(e,t,n,s){super(e,t,n,s)}interpolate_(e){return this.copySampleValue_(e-1)}}class wn{constructor(e,t,n,s){if(e===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(t===void 0||t.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+e);this.name=e,this.times=Wr(t,this.TimeBufferType),this.values=Wr(n,this.ValueBufferType),this.setInterpolation(s||this.DefaultInterpolation)}static toJSON(e){const t=e.constructor;let n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:Wr(e.times,Array),values:Wr(e.values,Array)};const s=e.getInterpolation();s!==e.DefaultInterpolation&&(n.interpolation=s)}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new Ym(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new sd(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new qm(this.times,this.values,this.getValueSize(),e)}setInterpolation(e){let t;switch(e){case cr:t=this.InterpolantFactoryMethodDiscrete;break;case lr:t=this.InterpolantFactoryMethodLinear;break;case Po:t=this.InterpolantFactoryMethodSmooth;break}if(t===void 0){const n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return console.warn("THREE.KeyframeTrack:",n),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return cr;case this.InterpolantFactoryMethodLinear:return lr;case this.InterpolantFactoryMethodSmooth:return Po}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){const t=this.times;for(let n=0,s=t.length;n!==s;++n)t[n]+=e}return this}scale(e){if(e!==1){const t=this.times;for(let n=0,s=t.length;n!==s;++n)t[n]*=e}return this}trim(e,t){const n=this.times,s=n.length;let r=0,o=s-1;for(;r!==s&&n[r]<e;)++r;for(;o!==-1&&n[o]>t;)--o;if(++o,r!==0||o!==s){r>=o&&(o=Math.max(o,1),r=o-1);const a=this.getValueSize();this.times=n.slice(r,o),this.values=this.values.slice(r*a,o*a)}return this}validate(){let e=!0;const t=this.getValueSize();t-Math.floor(t)!==0&&(console.error("THREE.KeyframeTrack: Invalid value size in track.",this),e=!1);const n=this.times,s=this.values,r=n.length;r===0&&(console.error("THREE.KeyframeTrack: Track is empty.",this),e=!1);let o=null;for(let a=0;a!==r;a++){const c=n[a];if(typeof c=="number"&&isNaN(c)){console.error("THREE.KeyframeTrack: Time is not a valid number.",this,a,c),e=!1;break}if(o!==null&&o>c){console.error("THREE.KeyframeTrack: Out of order keys.",this,a,c,o),e=!1;break}o=c}if(s!==void 0&&jm(s))for(let a=0,c=s.length;a!==c;++a){const l=s[a];if(isNaN(l)){console.error("THREE.KeyframeTrack: Value is not a valid number.",this,a,l),e=!1;break}}return e}optimize(){const e=this.times.slice(),t=this.values.slice(),n=this.getValueSize(),s=this.getInterpolation()===Po,r=e.length-1;let o=1;for(let a=1;a<r;++a){let c=!1;const l=e[a],u=e[a+1];if(l!==u&&(a!==1||l!==e[0]))if(s)c=!0;else{const h=a*n,d=h-n,p=h+n;for(let g=0;g!==n;++g){const _=t[h+g];if(_!==t[d+g]||_!==t[p+g]){c=!0;break}}}if(c){if(a!==o){e[o]=e[a];const h=a*n,d=o*n;for(let p=0;p!==n;++p)t[d+p]=t[h+p]}++o}}if(r>0){e[o]=e[r];for(let a=r*n,c=o*n,l=0;l!==n;++l)t[c+l]=t[a+l];++o}return o!==e.length?(this.times=e.slice(0,o),this.values=t.slice(0,o*n)):(this.times=e,this.values=t),this}clone(){const e=this.times.slice(),t=this.values.slice(),n=this.constructor,s=new n(this.name,e,t);return s.createInterpolant=this.createInterpolant,s}}wn.prototype.ValueTypeName="";wn.prototype.TimeBufferType=Float32Array;wn.prototype.ValueBufferType=Float32Array;wn.prototype.DefaultInterpolation=lr;class As extends wn{constructor(e,t,n){super(e,t,n)}}As.prototype.ValueTypeName="bool";As.prototype.ValueBufferType=Array;As.prototype.DefaultInterpolation=cr;As.prototype.InterpolantFactoryMethodLinear=void 0;As.prototype.InterpolantFactoryMethodSmooth=void 0;class rd extends wn{constructor(e,t,n,s){super(e,t,n,s)}}rd.prototype.ValueTypeName="color";class Es extends wn{constructor(e,t,n,s){super(e,t,n,s)}}Es.prototype.ValueTypeName="number";class $m extends mr{constructor(e,t,n,s){super(e,t,n,s)}interpolate_(e,t,n,s){const r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,c=(n-t)/(s-t);let l=e*a;for(let u=l+a;l!==u;l+=4)ln.slerpFlat(r,0,o,l-a,o,l,c);return r}}class Ss extends wn{constructor(e,t,n,s){super(e,t,n,s)}InterpolantFactoryMethodLinear(e){return new $m(this.times,this.values,this.getValueSize(),e)}}Ss.prototype.ValueTypeName="quaternion";Ss.prototype.InterpolantFactoryMethodSmooth=void 0;class ws extends wn{constructor(e,t,n){super(e,t,n)}}ws.prototype.ValueTypeName="string";ws.prototype.ValueBufferType=Array;ws.prototype.DefaultInterpolation=cr;ws.prototype.InterpolantFactoryMethodLinear=void 0;ws.prototype.InterpolantFactoryMethodSmooth=void 0;class Ts extends wn{constructor(e,t,n,s){super(e,t,n,s)}}Ts.prototype.ValueTypeName="vector";class gc{constructor(e="",t=-1,n=[],s=Fc){this.name=e,this.tracks=n,this.duration=t,this.blendMode=s,this.uuid=bn(),this.duration<0&&this.resetDuration()}static parse(e){const t=[],n=e.tracks,s=1/(e.fps||1);for(let o=0,a=n.length;o!==a;++o)t.push(Jm(n[o]).scale(s));const r=new this(e.name,e.duration,t,e.blendMode);return r.uuid=e.uuid,r}static toJSON(e){const t=[],n=e.tracks,s={name:e.name,duration:e.duration,tracks:t,uuid:e.uuid,blendMode:e.blendMode};for(let r=0,o=n.length;r!==o;++r)t.push(wn.toJSON(n[r]));return s}static CreateFromMorphTargetSequence(e,t,n,s){const r=t.length,o=[];for(let a=0;a<r;a++){let c=[],l=[];c.push((a+r-1)%r,a,(a+1)%r),l.push(0,1,0);const u=Km(c);c=Ql(c,1,u),l=Ql(l,1,u),!s&&c[0]===0&&(c.push(r),l.push(l[0])),o.push(new Es(".morphTargetInfluences["+t[a].name+"]",c,l).scale(1/n))}return new this(e,-1,o)}static findByName(e,t){let n=e;if(!Array.isArray(e)){const s=e;n=s.geometry&&s.geometry.animations||s.animations}for(let s=0;s<n.length;s++)if(n[s].name===t)return n[s];return null}static CreateClipsFromMorphTargetSequences(e,t,n){const s={},r=/^([\w-]*?)([\d]+)$/;for(let a=0,c=e.length;a<c;a++){const l=e[a],u=l.name.match(r);if(u&&u.length>1){const h=u[1];let d=s[h];d||(s[h]=d=[]),d.push(l)}}const o=[];for(const a in s)o.push(this.CreateFromMorphTargetSequence(a,s[a],t,n));return o}static parseAnimation(e,t){if(console.warn("THREE.AnimationClip: parseAnimation() is deprecated and will be removed with r185"),!e)return console.error("THREE.AnimationClip: No animation in JSONLoader data."),null;const n=function(h,d,p,g,_){if(p.length!==0){const m=[],f=[];id(p,m,f,g),m.length!==0&&_.push(new h(d,m,f))}},s=[],r=e.name||"default",o=e.fps||30,a=e.blendMode;let c=e.length||-1;const l=e.hierarchy||[];for(let h=0;h<l.length;h++){const d=l[h].keys;if(!(!d||d.length===0))if(d[0].morphTargets){const p={};let g;for(g=0;g<d.length;g++)if(d[g].morphTargets)for(let _=0;_<d[g].morphTargets.length;_++)p[d[g].morphTargets[_]]=-1;for(const _ in p){const m=[],f=[];for(let y=0;y!==d[g].morphTargets.length;++y){const x=d[g];m.push(x.time),f.push(x.morphTarget===_?1:0)}s.push(new Es(".morphTargetInfluence["+_+"]",m,f))}c=p.length*o}else{const p=".bones["+t[h].name+"]";n(Ts,p+".position",d,"pos",s),n(Ss,p+".quaternion",d,"rot",s),n(Ts,p+".scale",d,"scl",s)}}return s.length===0?null:new this(r,c,s,a)}resetDuration(){const e=this.tracks;let t=0;for(let n=0,s=e.length;n!==s;++n){const r=this.tracks[n];t=Math.max(t,r.times[r.times.length-1])}return this.duration=t,this}trim(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].trim(0,this.duration);return this}validate(){let e=!0;for(let t=0;t<this.tracks.length;t++)e=e&&this.tracks[t].validate();return e}optimize(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].optimize();return this}clone(){const e=[];for(let t=0;t<this.tracks.length;t++)e.push(this.tracks[t].clone());return new this.constructor(this.name,this.duration,e,this.blendMode)}toJSON(){return this.constructor.toJSON(this)}}function Zm(i){switch(i.toLowerCase()){case"scalar":case"double":case"float":case"number":case"integer":return Es;case"vector":case"vector2":case"vector3":case"vector4":return Ts;case"color":return rd;case"quaternion":return Ss;case"bool":case"boolean":return As;case"string":return ws}throw new Error("THREE.KeyframeTrack: Unsupported typeName: "+i)}function Jm(i){if(i.type===void 0)throw new Error("THREE.KeyframeTrack: track type undefined, can not parse");const e=Zm(i.type);if(i.times===void 0){const t=[],n=[];id(i.keys,t,n,"value"),i.times=t,i.values=n}return e.parse!==void 0?e.parse(i):new e(i.name,i.times,i.values,i.interpolation)}const $n={enabled:!1,files:{},add:function(i,e){this.enabled!==!1&&(this.files[i]=e)},get:function(i){if(this.enabled!==!1)return this.files[i]},remove:function(i){delete this.files[i]},clear:function(){this.files={}}};class Qm{constructor(e,t,n){const s=this;let r=!1,o=0,a=0,c;const l=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=n,this.itemStart=function(u){a++,r===!1&&s.onStart!==void 0&&s.onStart(u,o,a),r=!0},this.itemEnd=function(u){o++,s.onProgress!==void 0&&s.onProgress(u,o,a),o===a&&(r=!1,s.onLoad!==void 0&&s.onLoad())},this.itemError=function(u){s.onError!==void 0&&s.onError(u)},this.resolveURL=function(u){return c?c(u):u},this.setURLModifier=function(u){return c=u,this},this.addHandler=function(u,h){return l.push(u,h),this},this.removeHandler=function(u){const h=l.indexOf(u);return h!==-1&&l.splice(h,2),this},this.getHandler=function(u){for(let h=0,d=l.length;h<d;h+=2){const p=l[h],g=l[h+1];if(p.global&&(p.lastIndex=0),p.test(u))return g}return null}}}const eg=new Qm;class Rs{constructor(e){this.manager=e!==void 0?e:eg,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={}}load(){}loadAsync(e,t){const n=this;return new Promise(function(s,r){n.load(e,s,t,r)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}}Rs.DEFAULT_MATERIAL_NAME="__DEFAULT";const Gn={};class tg extends Error{constructor(e,t){super(e),this.response=t}}class od extends Rs{constructor(e){super(e),this.mimeType="",this.responseType=""}load(e,t,n,s){e===void 0&&(e=""),this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);const r=$n.get(`file:${e}`);if(r!==void 0)return this.manager.itemStart(e),setTimeout(()=>{t&&t(r),this.manager.itemEnd(e)},0),r;if(Gn[e]!==void 0){Gn[e].push({onLoad:t,onProgress:n,onError:s});return}Gn[e]=[],Gn[e].push({onLoad:t,onProgress:n,onError:s});const o=new Request(e,{headers:new Headers(this.requestHeader),credentials:this.withCredentials?"include":"same-origin"}),a=this.mimeType,c=this.responseType;fetch(o).then(l=>{if(l.status===200||l.status===0){if(l.status===0&&console.warn("THREE.FileLoader: HTTP Status 0 received."),typeof ReadableStream>"u"||l.body===void 0||l.body.getReader===void 0)return l;const u=Gn[e],h=l.body.getReader(),d=l.headers.get("X-File-Size")||l.headers.get("Content-Length"),p=d?parseInt(d):0,g=p!==0;let _=0;const m=new ReadableStream({start(f){y();function y(){h.read().then(({done:x,value:v})=>{if(x)f.close();else{_+=v.byteLength;const A=new ProgressEvent("progress",{lengthComputable:g,loaded:_,total:p});for(let w=0,R=u.length;w<R;w++){const C=u[w];C.onProgress&&C.onProgress(A)}f.enqueue(v),y()}},x=>{f.error(x)})}}});return new Response(m)}else throw new tg(`fetch for "${l.url}" responded with ${l.status}: ${l.statusText}`,l)}).then(l=>{switch(c){case"arraybuffer":return l.arrayBuffer();case"blob":return l.blob();case"document":return l.text().then(u=>new DOMParser().parseFromString(u,a));case"json":return l.json();default:if(a==="")return l.text();{const h=/charset="?([^;"\s]*)"?/i.exec(a),d=h&&h[1]?h[1].toLowerCase():void 0,p=new TextDecoder(d);return l.arrayBuffer().then(g=>p.decode(g))}}}).then(l=>{$n.add(`file:${e}`,l);const u=Gn[e];delete Gn[e];for(let h=0,d=u.length;h<d;h++){const p=u[h];p.onLoad&&p.onLoad(l)}}).catch(l=>{const u=Gn[e];if(u===void 0)throw this.manager.itemError(e),l;delete Gn[e];for(let h=0,d=u.length;h<d;h++){const p=u[h];p.onError&&p.onError(l)}this.manager.itemError(e)}).finally(()=>{this.manager.itemEnd(e)}),this.manager.itemStart(e)}setResponseType(e){return this.responseType=e,this}setMimeType(e){return this.mimeType=e,this}}const ss=new WeakMap;class ng extends Rs{constructor(e){super(e)}load(e,t,n,s){this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);const r=this,o=$n.get(`image:${e}`);if(o!==void 0){if(o.complete===!0)r.manager.itemStart(e),setTimeout(function(){t&&t(o),r.manager.itemEnd(e)},0);else{let h=ss.get(o);h===void 0&&(h=[],ss.set(o,h)),h.push({onLoad:t,onError:s})}return o}const a=ur("img");function c(){u(),t&&t(this);const h=ss.get(this)||[];for(let d=0;d<h.length;d++){const p=h[d];p.onLoad&&p.onLoad(this)}ss.delete(this),r.manager.itemEnd(e)}function l(h){u(),s&&s(h),$n.remove(`image:${e}`);const d=ss.get(this)||[];for(let p=0;p<d.length;p++){const g=d[p];g.onError&&g.onError(h)}ss.delete(this),r.manager.itemError(e),r.manager.itemEnd(e)}function u(){a.removeEventListener("load",c,!1),a.removeEventListener("error",l,!1)}return a.addEventListener("load",c,!1),a.addEventListener("error",l,!1),e.slice(0,5)!=="data:"&&this.crossOrigin!==void 0&&(a.crossOrigin=this.crossOrigin),$n.add(`image:${e}`,a),r.manager.itemStart(e),a.src=e,a}}class ig extends Rs{constructor(e){super(e)}load(e,t,n,s){const r=new Ct,o=new ng(this.manager);return o.setCrossOrigin(this.crossOrigin),o.setPath(this.path),o.load(e,function(a){r.image=a,r.needsUpdate=!0,t!==void 0&&t(r)},n,s),r}}class To extends vt{constructor(e,t=1){super(),this.isLight=!0,this.type="Light",this.color=new Ne(e),this.intensity=t}dispose(){}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){const t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,this.groundColor!==void 0&&(t.object.groundColor=this.groundColor.getHex()),this.distance!==void 0&&(t.object.distance=this.distance),this.angle!==void 0&&(t.object.angle=this.angle),this.decay!==void 0&&(t.object.decay=this.decay),this.penumbra!==void 0&&(t.object.penumbra=this.penumbra),this.shadow!==void 0&&(t.object.shadow=this.shadow.toJSON()),this.target!==void 0&&(t.object.target=this.target.uuid),t}}class sg extends To{constructor(e,t,n){super(e,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(vt.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Ne(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}}const sa=new He,eu=new N,tu=new N;class Kc{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new we(512,512),this.mapType=Pn,this.map=null,this.mapPass=null,this.matrix=new He,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Gc,this._frameExtents=new we(1,1),this._viewportCount=1,this._viewports=[new rt(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(e){const t=this.camera,n=this.matrix;eu.setFromMatrixPosition(e.matrixWorld),t.position.copy(eu),tu.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(tu),t.updateMatrixWorld(),sa.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this._frustum.setFromProjectionMatrix(sa),n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(sa)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.autoUpdate=e.autoUpdate,this.needsUpdate=e.needsUpdate,this.normalBias=e.normalBias,this.blurSamples=e.blurSamples,this.mapSize.copy(e.mapSize),this}clone(){return new this.constructor().copy(this)}toJSON(){const e={};return this.intensity!==1&&(e.intensity=this.intensity),this.bias!==0&&(e.bias=this.bias),this.normalBias!==0&&(e.normalBias=this.normalBias),this.radius!==1&&(e.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(e.mapSize=this.mapSize.toArray()),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}}class rg extends Kc{constructor(){super(new Xt(50,1,.5,500)),this.isSpotLightShadow=!0,this.focus=1,this.aspect=1}updateMatrices(e){const t=this.camera,n=ys*2*e.angle*this.focus,s=this.mapSize.width/this.mapSize.height*this.aspect,r=e.distance||t.far;(n!==t.fov||s!==t.aspect||r!==t.far)&&(t.fov=n,t.aspect=s,t.far=r,t.updateProjectionMatrix()),super.updateMatrices(e)}copy(e){return super.copy(e),this.focus=e.focus,this}}class ad extends To{constructor(e,t,n=0,s=Math.PI/3,r=0,o=2){super(e,t),this.isSpotLight=!0,this.type="SpotLight",this.position.copy(vt.DEFAULT_UP),this.updateMatrix(),this.target=new vt,this.distance=n,this.angle=s,this.penumbra=r,this.decay=o,this.map=null,this.shadow=new rg}get power(){return this.intensity*Math.PI}set power(e){this.intensity=e/Math.PI}dispose(){this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.angle=e.angle,this.penumbra=e.penumbra,this.decay=e.decay,this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}}const nu=new He,js=new N,ra=new N;class og extends Kc{constructor(){super(new Xt(90,1,.5,500)),this.isPointLightShadow=!0,this._frameExtents=new we(4,2),this._viewportCount=6,this._viewports=[new rt(2,1,1,1),new rt(0,1,1,1),new rt(3,1,1,1),new rt(1,1,1,1),new rt(3,0,1,1),new rt(1,0,1,1)],this._cubeDirections=[new N(1,0,0),new N(-1,0,0),new N(0,0,1),new N(0,0,-1),new N(0,1,0),new N(0,-1,0)],this._cubeUps=[new N(0,1,0),new N(0,1,0),new N(0,1,0),new N(0,1,0),new N(0,0,1),new N(0,0,-1)]}updateMatrices(e,t=0){const n=this.camera,s=this.matrix,r=e.distance||n.far;r!==n.far&&(n.far=r,n.updateProjectionMatrix()),js.setFromMatrixPosition(e.matrixWorld),n.position.copy(js),ra.copy(n.position),ra.add(this._cubeDirections[t]),n.up.copy(this._cubeUps[t]),n.lookAt(ra),n.updateMatrixWorld(),s.makeTranslation(-js.x,-js.y,-js.z),nu.multiplyMatrices(n.projectionMatrix,n.matrixWorldInverse),this._frustum.setFromProjectionMatrix(nu)}}class ag extends To{constructor(e,t,n=0,s=2){super(e,t),this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=s,this.shadow=new og}get power(){return this.intensity*4*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}}class qc extends Kh{constructor(e=-1,t=1,n=1,s=-1,r=.1,o=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=s,this.near=r,this.far=o,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,s,r,o){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,s=(this.top+this.bottom)/2;let r=n-e,o=n+e,a=s+t,c=s-t;if(this.view!==null&&this.view.enabled){const l=(this.right-this.left)/this.view.fullWidth/this.zoom,u=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=l*this.view.offsetX,o=r+l*this.view.width,a-=u*this.view.offsetY,c=a-u*this.view.height}this.projectionMatrix.makeOrthographic(r,o,a,c,this.near,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}}class cg extends Kc{constructor(){super(new qc(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}}class _c extends To{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(vt.DEFAULT_UP),this.updateMatrix(),this.target=new vt,this.shadow=new cg}dispose(){this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}}class nr{static extractUrlBase(e){const t=e.lastIndexOf("/");return t===-1?"./":e.slice(0,t+1)}static resolveURL(e,t){return typeof e!="string"||e===""?"":(/^https?:\/\//i.test(t)&&/^\//.test(e)&&(t=t.replace(/(^https?:\/\/[^\/]+).*/i,"$1")),/^(https?:)?\/\//i.test(e)||/^data:.*,.*$/i.test(e)||/^blob:.*$/i.test(e)?e:t+e)}}const oa=new WeakMap;class lg extends Rs{constructor(e){super(e),this.isImageBitmapLoader=!0,typeof createImageBitmap>"u"&&console.warn("THREE.ImageBitmapLoader: createImageBitmap() not supported."),typeof fetch>"u"&&console.warn("THREE.ImageBitmapLoader: fetch() not supported."),this.options={premultiplyAlpha:"none"}}setOptions(e){return this.options=e,this}load(e,t,n,s){e===void 0&&(e=""),this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);const r=this,o=$n.get(`image-bitmap:${e}`);if(o!==void 0){if(r.manager.itemStart(e),o.then){o.then(l=>{if(oa.has(o)===!0)s&&s(oa.get(o)),r.manager.itemError(e),r.manager.itemEnd(e);else return t&&t(l),r.manager.itemEnd(e),l});return}return setTimeout(function(){t&&t(o),r.manager.itemEnd(e)},0),o}const a={};a.credentials=this.crossOrigin==="anonymous"?"same-origin":"include",a.headers=this.requestHeader;const c=fetch(e,a).then(function(l){return l.blob()}).then(function(l){return createImageBitmap(l,Object.assign(r.options,{colorSpaceConversion:"none"}))}).then(function(l){return $n.add(`image-bitmap:${e}`,l),t&&t(l),r.manager.itemEnd(e),l}).catch(function(l){s&&s(l),oa.set(c,l),$n.remove(`image-bitmap:${e}`),r.manager.itemError(e),r.manager.itemEnd(e)});$n.add(`image-bitmap:${e}`,c),r.manager.itemStart(e)}}class ug extends Xt{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}}class hg{constructor(e,t,n){this.binding=e,this.valueSize=n;let s,r,o;switch(t){case"quaternion":s=this._slerp,r=this._slerpAdditive,o=this._setAdditiveIdentityQuaternion,this.buffer=new Float64Array(n*6),this._workIndex=5;break;case"string":case"bool":s=this._select,r=this._select,o=this._setAdditiveIdentityOther,this.buffer=new Array(n*5);break;default:s=this._lerp,r=this._lerpAdditive,o=this._setAdditiveIdentityNumeric,this.buffer=new Float64Array(n*5)}this._mixBufferRegion=s,this._mixBufferRegionAdditive=r,this._setIdentity=o,this._origIndex=3,this._addIndex=4,this.cumulativeWeight=0,this.cumulativeWeightAdditive=0,this.useCount=0,this.referenceCount=0}accumulate(e,t){const n=this.buffer,s=this.valueSize,r=e*s+s;let o=this.cumulativeWeight;if(o===0){for(let a=0;a!==s;++a)n[r+a]=n[a];o=t}else{o+=t;const a=t/o;this._mixBufferRegion(n,r,0,a,s)}this.cumulativeWeight=o}accumulateAdditive(e){const t=this.buffer,n=this.valueSize,s=n*this._addIndex;this.cumulativeWeightAdditive===0&&this._setIdentity(),this._mixBufferRegionAdditive(t,s,0,e,n),this.cumulativeWeightAdditive+=e}apply(e){const t=this.valueSize,n=this.buffer,s=e*t+t,r=this.cumulativeWeight,o=this.cumulativeWeightAdditive,a=this.binding;if(this.cumulativeWeight=0,this.cumulativeWeightAdditive=0,r<1){const c=t*this._origIndex;this._mixBufferRegion(n,s,c,1-r,t)}o>0&&this._mixBufferRegionAdditive(n,s,this._addIndex*t,1,t);for(let c=t,l=t+t;c!==l;++c)if(n[c]!==n[c+t]){a.setValue(n,s);break}}saveOriginalState(){const e=this.binding,t=this.buffer,n=this.valueSize,s=n*this._origIndex;e.getValue(t,s);for(let r=n,o=s;r!==o;++r)t[r]=t[s+r%n];this._setIdentity(),this.cumulativeWeight=0,this.cumulativeWeightAdditive=0}restoreOriginalState(){const e=this.valueSize*3;this.binding.setValue(this.buffer,e)}_setAdditiveIdentityNumeric(){const e=this._addIndex*this.valueSize,t=e+this.valueSize;for(let n=e;n<t;n++)this.buffer[n]=0}_setAdditiveIdentityQuaternion(){this._setAdditiveIdentityNumeric(),this.buffer[this._addIndex*this.valueSize+3]=1}_setAdditiveIdentityOther(){const e=this._origIndex*this.valueSize,t=this._addIndex*this.valueSize;for(let n=0;n<this.valueSize;n++)this.buffer[t+n]=this.buffer[e+n]}_select(e,t,n,s,r){if(s>=.5)for(let o=0;o!==r;++o)e[t+o]=e[n+o]}_slerp(e,t,n,s){ln.slerpFlat(e,t,e,t,e,n,s)}_slerpAdditive(e,t,n,s,r){const o=this._workIndex*r;ln.multiplyQuaternionsFlat(e,o,e,t,e,n),ln.slerpFlat(e,t,e,t,e,o,s)}_lerp(e,t,n,s,r){const o=1-s;for(let a=0;a!==r;++a){const c=t+a;e[c]=e[c]*o+e[n+a]*s}}_lerpAdditive(e,t,n,s,r){for(let o=0;o!==r;++o){const a=t+o;e[a]=e[a]+e[n+o]*s}}}const Yc="\\[\\]\\.:\\/",dg=new RegExp("["+Yc+"]","g"),$c="[^"+Yc+"]",fg="[^"+Yc.replace("\\.","")+"]",pg=/((?:WC+[\/:])*)/.source.replace("WC",$c),mg=/(WCOD+)?/.source.replace("WCOD",fg),gg=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",$c),_g=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",$c),xg=new RegExp("^"+pg+mg+gg+_g+"$"),vg=["material","materials","bones","map"];class yg{constructor(e,t,n){const s=n||ot.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,s)}getValue(e,t){this.bind();const n=this._targetGroup.nCachedObjects_,s=this._bindings[n];s!==void 0&&s.getValue(e,t)}setValue(e,t){const n=this._bindings;for(let s=this._targetGroup.nCachedObjects_,r=n.length;s!==r;++s)n[s].setValue(e,t)}bind(){const e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].bind()}unbind(){const e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].unbind()}}class ot{constructor(e,t,n){this.path=t,this.parsedPath=n||ot.parseTrackName(t),this.node=ot.findNode(e,this.parsedPath.nodeName),this.rootNode=e,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(e,t,n){return e&&e.isAnimationObjectGroup?new ot.Composite(e,t,n):new ot(e,t,n)}static sanitizeNodeName(e){return e.replace(/\s/g,"_").replace(dg,"")}static parseTrackName(e){const t=xg.exec(e);if(t===null)throw new Error("PropertyBinding: Cannot parse trackName: "+e);const n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},s=n.nodeName&&n.nodeName.lastIndexOf(".");if(s!==void 0&&s!==-1){const r=n.nodeName.substring(s+1);vg.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,s),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("PropertyBinding: can not parse propertyName from trackName: "+e);return n}static findNode(e,t){if(t===void 0||t===""||t==="."||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){const n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){const n=function(r){for(let o=0;o<r.length;o++){const a=r[o];if(a.name===t||a.uuid===t)return a;const c=n(a.children);if(c)return c}return null},s=n(e.children);if(s)return s}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){const n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)e[t++]=n[s]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){const n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=e[t++]}_setValue_array_setNeedsUpdate(e,t){const n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){const n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let e=this.node;const t=this.parsedPath,n=t.objectName,s=t.propertyName;let r=t.propertyIndex;if(e||(e=ot.findNode(this.rootNode,t.nodeName),this.node=e),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!e){console.warn("THREE.PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let l=t.objectIndex;switch(n){case"materials":if(!e.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.materials){console.error("THREE.PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}e=e.material.materials;break;case"bones":if(!e.skeleton){console.error("THREE.PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}e=e.skeleton.bones;for(let u=0;u<e.length;u++)if(e[u].name===l){l=u;break}break;case"map":if("map"in e){e=e.map;break}if(!e.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.map){console.error("THREE.PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}e=e.material.map;break;default:if(e[n]===void 0){console.error("THREE.PropertyBinding: Can not bind to objectName of node undefined.",this);return}e=e[n]}if(l!==void 0){if(e[l]===void 0){console.error("THREE.PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,e);return}e=e[l]}}const o=e[s];if(o===void 0){const l=t.nodeName;console.error("THREE.PropertyBinding: Trying to update property for track: "+l+"."+s+" but it wasn't found.",e);return}let a=this.Versioning.None;this.targetObject=e,e.isMaterial===!0?a=this.Versioning.NeedsUpdate:e.isObject3D===!0&&(a=this.Versioning.MatrixWorldNeedsUpdate);let c=this.BindingType.Direct;if(r!==void 0){if(s==="morphTargetInfluences"){if(!e.geometry){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!e.geometry.morphAttributes){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}e.morphTargetDictionary[r]!==void 0&&(r=e.morphTargetDictionary[r])}c=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=r}else o.fromArray!==void 0&&o.toArray!==void 0?(c=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(c=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=s;this.getValue=this.GetterByBindingType[c],this.setValue=this.SetterByBindingTypeAndVersioning[c][a]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}}ot.Composite=yg;ot.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};ot.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};ot.prototype.GetterByBindingType=[ot.prototype._getValue_direct,ot.prototype._getValue_array,ot.prototype._getValue_arrayElement,ot.prototype._getValue_toArray];ot.prototype.SetterByBindingTypeAndVersioning=[[ot.prototype._setValue_direct,ot.prototype._setValue_direct_setNeedsUpdate,ot.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[ot.prototype._setValue_array,ot.prototype._setValue_array_setNeedsUpdate,ot.prototype._setValue_array_setMatrixWorldNeedsUpdate],[ot.prototype._setValue_arrayElement,ot.prototype._setValue_arrayElement_setNeedsUpdate,ot.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[ot.prototype._setValue_fromArray,ot.prototype._setValue_fromArray_setNeedsUpdate,ot.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];class Mg{constructor(e,t,n=null,s=t.blendMode){this._mixer=e,this._clip=t,this._localRoot=n,this.blendMode=s;const r=t.tracks,o=r.length,a=new Array(o),c={endingStart:as,endingEnd:as};for(let l=0;l!==o;++l){const u=r[l].createInterpolant(null);a[l]=u,u.settings=c}this._interpolantSettings=c,this._interpolants=a,this._propertyBindings=new Array(o),this._cacheIndex=null,this._byClipCacheIndex=null,this._timeScaleInterpolant=null,this._weightInterpolant=null,this.loop=Cp,this._loopCount=-1,this._startTime=null,this.time=0,this.timeScale=1,this._effectiveTimeScale=1,this.weight=1,this._effectiveWeight=1,this.repetitions=1/0,this.paused=!1,this.enabled=!0,this.clampWhenFinished=!1,this.zeroSlopeAtStart=!0,this.zeroSlopeAtEnd=!0}play(){return this._mixer._activateAction(this),this}stop(){return this._mixer._deactivateAction(this),this.reset()}reset(){return this.paused=!1,this.enabled=!0,this.time=0,this._loopCount=-1,this._startTime=null,this.stopFading().stopWarping()}isRunning(){return this.enabled&&!this.paused&&this.timeScale!==0&&this._startTime===null&&this._mixer._isActiveAction(this)}isScheduled(){return this._mixer._isActiveAction(this)}startAt(e){return this._startTime=e,this}setLoop(e,t){return this.loop=e,this.repetitions=t,this}setEffectiveWeight(e){return this.weight=e,this._effectiveWeight=this.enabled?e:0,this.stopFading()}getEffectiveWeight(){return this._effectiveWeight}fadeIn(e){return this._scheduleFading(e,0,1)}fadeOut(e){return this._scheduleFading(e,1,0)}crossFadeFrom(e,t,n=!1){if(e.fadeOut(t),this.fadeIn(t),n===!0){const s=this._clip.duration,r=e._clip.duration,o=r/s,a=s/r;e.warp(1,o,t),this.warp(a,1,t)}return this}crossFadeTo(e,t,n=!1){return e.crossFadeFrom(this,t,n)}stopFading(){const e=this._weightInterpolant;return e!==null&&(this._weightInterpolant=null,this._mixer._takeBackControlInterpolant(e)),this}setEffectiveTimeScale(e){return this.timeScale=e,this._effectiveTimeScale=this.paused?0:e,this.stopWarping()}getEffectiveTimeScale(){return this._effectiveTimeScale}setDuration(e){return this.timeScale=this._clip.duration/e,this.stopWarping()}syncWith(e){return this.time=e.time,this.timeScale=e.timeScale,this.stopWarping()}halt(e){return this.warp(this._effectiveTimeScale,0,e)}warp(e,t,n){const s=this._mixer,r=s.time,o=this.timeScale;let a=this._timeScaleInterpolant;a===null&&(a=s._lendControlInterpolant(),this._timeScaleInterpolant=a);const c=a.parameterPositions,l=a.sampleValues;return c[0]=r,c[1]=r+n,l[0]=e/o,l[1]=t/o,this}stopWarping(){const e=this._timeScaleInterpolant;return e!==null&&(this._timeScaleInterpolant=null,this._mixer._takeBackControlInterpolant(e)),this}getMixer(){return this._mixer}getClip(){return this._clip}getRoot(){return this._localRoot||this._mixer._root}_update(e,t,n,s){if(!this.enabled){this._updateWeight(e);return}const r=this._startTime;if(r!==null){const c=(e-r)*n;c<0||n===0?t=0:(this._startTime=null,t=n*c)}t*=this._updateTimeScale(e);const o=this._updateTime(t),a=this._updateWeight(e);if(a>0){const c=this._interpolants,l=this._propertyBindings;switch(this.blendMode){case Pp:for(let u=0,h=c.length;u!==h;++u)c[u].evaluate(o),l[u].accumulateAdditive(a);break;case Fc:default:for(let u=0,h=c.length;u!==h;++u)c[u].evaluate(o),l[u].accumulate(s,a)}}}_updateWeight(e){let t=0;if(this.enabled){t=this.weight;const n=this._weightInterpolant;if(n!==null){const s=n.evaluate(e)[0];t*=s,e>n.parameterPositions[1]&&(this.stopFading(),s===0&&(this.enabled=!1))}}return this._effectiveWeight=t,t}_updateTimeScale(e){let t=0;if(!this.paused){t=this.timeScale;const n=this._timeScaleInterpolant;if(n!==null){const s=n.evaluate(e)[0];t*=s,e>n.parameterPositions[1]&&(this.stopWarping(),t===0?this.paused=!0:this.timeScale=t)}}return this._effectiveTimeScale=t,t}_updateTime(e){const t=this._clip.duration,n=this.loop;let s=this.time+e,r=this._loopCount;const o=n===Ip;if(e===0)return r===-1?s:o&&(r&1)===1?t-s:s;if(n===Rp){r===-1&&(this._loopCount=0,this._setEndings(!0,!0,!1));e:{if(s>=t)s=t;else if(s<0)s=0;else{this.time=s;break e}this.clampWhenFinished?this.paused=!0:this.enabled=!1,this.time=s,this._mixer.dispatchEvent({type:"finished",action:this,direction:e<0?-1:1})}}else{if(r===-1&&(e>=0?(r=0,this._setEndings(!0,this.repetitions===0,o)):this._setEndings(this.repetitions===0,!0,o)),s>=t||s<0){const a=Math.floor(s/t);s-=t*a,r+=Math.abs(a);const c=this.repetitions-r;if(c<=0)this.clampWhenFinished?this.paused=!0:this.enabled=!1,s=e>0?t:0,this.time=s,this._mixer.dispatchEvent({type:"finished",action:this,direction:e>0?1:-1});else{if(c===1){const l=e<0;this._setEndings(l,!l,o)}else this._setEndings(!1,!1,o);this._loopCount=r,this.time=s,this._mixer.dispatchEvent({type:"loop",action:this,loopDelta:a})}}else this.time=s;if(o&&(r&1)===1)return t-s}return s}_setEndings(e,t,n){const s=this._interpolantSettings;n?(s.endingStart=cs,s.endingEnd=cs):(e?s.endingStart=this.zeroSlopeAtStart?cs:as:s.endingStart=uo,t?s.endingEnd=this.zeroSlopeAtEnd?cs:as:s.endingEnd=uo)}_scheduleFading(e,t,n){const s=this._mixer,r=s.time;let o=this._weightInterpolant;o===null&&(o=s._lendControlInterpolant(),this._weightInterpolant=o);const a=o.parameterPositions,c=o.sampleValues;return a[0]=r,c[0]=t,a[1]=r+e,c[1]=n,this}}const Eg=new Float32Array(1);class Sg extends _i{constructor(e){super(),this._root=e,this._initMemoryManager(),this._accuIndex=0,this.time=0,this.timeScale=1}_bindAction(e,t){const n=e._localRoot||this._root,s=e._clip.tracks,r=s.length,o=e._propertyBindings,a=e._interpolants,c=n.uuid,l=this._bindingsByRootAndName;let u=l[c];u===void 0&&(u={},l[c]=u);for(let h=0;h!==r;++h){const d=s[h],p=d.name;let g=u[p];if(g!==void 0)++g.referenceCount,o[h]=g;else{if(g=o[h],g!==void 0){g._cacheIndex===null&&(++g.referenceCount,this._addInactiveBinding(g,c,p));continue}const _=t&&t._propertyBindings[h].binding.parsedPath;g=new hg(ot.create(n,p,_),d.ValueTypeName,d.getValueSize()),++g.referenceCount,this._addInactiveBinding(g,c,p),o[h]=g}a[h].resultBuffer=g.buffer}}_activateAction(e){if(!this._isActiveAction(e)){if(e._cacheIndex===null){const n=(e._localRoot||this._root).uuid,s=e._clip.uuid,r=this._actionsByClip[s];this._bindAction(e,r&&r.knownActions[0]),this._addInactiveAction(e,s,n)}const t=e._propertyBindings;for(let n=0,s=t.length;n!==s;++n){const r=t[n];r.useCount++===0&&(this._lendBinding(r),r.saveOriginalState())}this._lendAction(e)}}_deactivateAction(e){if(this._isActiveAction(e)){const t=e._propertyBindings;for(let n=0,s=t.length;n!==s;++n){const r=t[n];--r.useCount===0&&(r.restoreOriginalState(),this._takeBackBinding(r))}this._takeBackAction(e)}}_initMemoryManager(){this._actions=[],this._nActiveActions=0,this._actionsByClip={},this._bindings=[],this._nActiveBindings=0,this._bindingsByRootAndName={},this._controlInterpolants=[],this._nActiveControlInterpolants=0;const e=this;this.stats={actions:{get total(){return e._actions.length},get inUse(){return e._nActiveActions}},bindings:{get total(){return e._bindings.length},get inUse(){return e._nActiveBindings}},controlInterpolants:{get total(){return e._controlInterpolants.length},get inUse(){return e._nActiveControlInterpolants}}}}_isActiveAction(e){const t=e._cacheIndex;return t!==null&&t<this._nActiveActions}_addInactiveAction(e,t,n){const s=this._actions,r=this._actionsByClip;let o=r[t];if(o===void 0)o={knownActions:[e],actionByRoot:{}},e._byClipCacheIndex=0,r[t]=o;else{const a=o.knownActions;e._byClipCacheIndex=a.length,a.push(e)}e._cacheIndex=s.length,s.push(e),o.actionByRoot[n]=e}_removeInactiveAction(e){const t=this._actions,n=t[t.length-1],s=e._cacheIndex;n._cacheIndex=s,t[s]=n,t.pop(),e._cacheIndex=null;const r=e._clip.uuid,o=this._actionsByClip,a=o[r],c=a.knownActions,l=c[c.length-1],u=e._byClipCacheIndex;l._byClipCacheIndex=u,c[u]=l,c.pop(),e._byClipCacheIndex=null;const h=a.actionByRoot,d=(e._localRoot||this._root).uuid;delete h[d],c.length===0&&delete o[r],this._removeInactiveBindingsForAction(e)}_removeInactiveBindingsForAction(e){const t=e._propertyBindings;for(let n=0,s=t.length;n!==s;++n){const r=t[n];--r.referenceCount===0&&this._removeInactiveBinding(r)}}_lendAction(e){const t=this._actions,n=e._cacheIndex,s=this._nActiveActions++,r=t[s];e._cacheIndex=s,t[s]=e,r._cacheIndex=n,t[n]=r}_takeBackAction(e){const t=this._actions,n=e._cacheIndex,s=--this._nActiveActions,r=t[s];e._cacheIndex=s,t[s]=e,r._cacheIndex=n,t[n]=r}_addInactiveBinding(e,t,n){const s=this._bindingsByRootAndName,r=this._bindings;let o=s[t];o===void 0&&(o={},s[t]=o),o[n]=e,e._cacheIndex=r.length,r.push(e)}_removeInactiveBinding(e){const t=this._bindings,n=e.binding,s=n.rootNode.uuid,r=n.path,o=this._bindingsByRootAndName,a=o[s],c=t[t.length-1],l=e._cacheIndex;c._cacheIndex=l,t[l]=c,t.pop(),delete a[r],Object.keys(a).length===0&&delete o[s]}_lendBinding(e){const t=this._bindings,n=e._cacheIndex,s=this._nActiveBindings++,r=t[s];e._cacheIndex=s,t[s]=e,r._cacheIndex=n,t[n]=r}_takeBackBinding(e){const t=this._bindings,n=e._cacheIndex,s=--this._nActiveBindings,r=t[s];e._cacheIndex=s,t[s]=e,r._cacheIndex=n,t[n]=r}_lendControlInterpolant(){const e=this._controlInterpolants,t=this._nActiveControlInterpolants++;let n=e[t];return n===void 0&&(n=new sd(new Float32Array(2),new Float32Array(2),1,Eg),n.__cacheIndex=t,e[t]=n),n}_takeBackControlInterpolant(e){const t=this._controlInterpolants,n=e.__cacheIndex,s=--this._nActiveControlInterpolants,r=t[s];e.__cacheIndex=s,t[s]=e,r.__cacheIndex=n,t[n]=r}clipAction(e,t,n){const s=t||this._root,r=s.uuid;let o=typeof e=="string"?gc.findByName(s,e):e;const a=o!==null?o.uuid:e,c=this._actionsByClip[a];let l=null;if(n===void 0&&(o!==null?n=o.blendMode:n=Fc),c!==void 0){const h=c.actionByRoot[r];if(h!==void 0&&h.blendMode===n)return h;l=c.knownActions[0],o===null&&(o=l._clip)}if(o===null)return null;const u=new Mg(this,o,t,n);return this._bindAction(u,l),this._addInactiveAction(u,a,r),u}existingAction(e,t){const n=t||this._root,s=n.uuid,r=typeof e=="string"?gc.findByName(n,e):e,o=r?r.uuid:e,a=this._actionsByClip[o];return a!==void 0&&a.actionByRoot[s]||null}stopAllAction(){const e=this._actions,t=this._nActiveActions;for(let n=t-1;n>=0;--n)e[n].stop();return this}update(e){e*=this.timeScale;const t=this._actions,n=this._nActiveActions,s=this.time+=e,r=Math.sign(e),o=this._accuIndex^=1;for(let l=0;l!==n;++l)t[l]._update(s,e,r,o);const a=this._bindings,c=this._nActiveBindings;for(let l=0;l!==c;++l)a[l].apply(o);return this}setTime(e){this.time=0;for(let t=0;t<this._actions.length;t++)this._actions[t].time=0;return this.update(e)}getRoot(){return this._root}uncacheClip(e){const t=this._actions,n=e.uuid,s=this._actionsByClip,r=s[n];if(r!==void 0){const o=r.knownActions;for(let a=0,c=o.length;a!==c;++a){const l=o[a];this._deactivateAction(l);const u=l._cacheIndex,h=t[t.length-1];l._cacheIndex=null,l._byClipCacheIndex=null,h._cacheIndex=u,t[u]=h,t.pop(),this._removeInactiveBindingsForAction(l)}delete s[n]}}uncacheRoot(e){const t=e.uuid,n=this._actionsByClip;for(const o in n){const a=n[o].actionByRoot,c=a[t];c!==void 0&&(this._deactivateAction(c),this._removeInactiveAction(c))}const s=this._bindingsByRootAndName,r=s[t];if(r!==void 0)for(const o in r){const a=r[o];a.restoreOriginalState(),this._removeInactiveBinding(a)}}uncacheAction(e,t){const n=this.existingAction(e,t);n!==null&&(this._deactivateAction(n),this._removeInactiveAction(n))}}const iu=new He;class Tg{constructor(e,t,n=0,s=1/0){this.ray=new bs(e,t),this.near=n,this.far=s,this.camera=null,this.layers=new zc,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(e,t){this.ray.set(e,t)}setFromCamera(e,t){t.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(e.x,e.y,.5).unproject(t).sub(this.ray.origin).normalize(),this.camera=t):t.isOrthographicCamera?(this.ray.origin.set(e.x,e.y,(t.near+t.far)/(t.near-t.far)).unproject(t),this.ray.direction.set(0,0,-1).transformDirection(t.matrixWorld),this.camera=t):console.error("THREE.Raycaster: Unsupported camera type: "+t.type)}setFromXRController(e){return iu.identity().extractRotation(e.matrixWorld),this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(iu),this}intersectObject(e,t=!0,n=[]){return xc(e,this,n,t),n.sort(su),n}intersectObjects(e,t=!0,n=[]){for(let s=0,r=e.length;s<r;s++)xc(e[s],this,n,t);return n.sort(su),n}}function su(i,e){return i.distance-e.distance}function xc(i,e,t,n){let s=!0;if(i.layers.test(e.layers)&&i.raycast(e,t)===!1&&(s=!1),s===!0&&n===!0){const r=i.children;for(let o=0,a=r.length;o<a;o++)xc(r[o],e,t,!0)}}class ru{constructor(e=1,t=0,n=0){this.radius=e,this.phi=t,this.theta=n}set(e,t,n){return this.radius=e,this.phi=t,this.theta=n,this}copy(e){return this.radius=e.radius,this.phi=e.phi,this.theta=e.theta,this}makeSafe(){return this.phi=Ke(this.phi,1e-6,Math.PI-1e-6),this}setFromVector3(e){return this.setFromCartesianCoords(e.x,e.y,e.z)}setFromCartesianCoords(e,t,n){return this.radius=Math.sqrt(e*e+t*t+n*n),this.radius===0?(this.theta=0,this.phi=0):(this.theta=Math.atan2(e,n),this.phi=Math.acos(Ke(t/this.radius,-1,1))),this}clone(){return new this.constructor().copy(this)}}class bg extends _i{constructor(e,t=null){super(),this.object=e,this.domElement=t,this.enabled=!0,this.state=-1,this.keys={},this.mouseButtons={LEFT:null,MIDDLE:null,RIGHT:null},this.touches={ONE:null,TWO:null}}connect(e){if(e===void 0){console.warn("THREE.Controls: connect() now requires an element.");return}this.domElement!==null&&this.disconnect(),this.domElement=e}disconnect(){}dispose(){}update(){}}function ou(i,e,t,n){const s=Ag(n);switch(t){case Dh:return i*e;case Dc:return i*e/s.components*s.byteLength;case Nc:return i*e/s.components*s.byteLength;case Uh:return i*e*2/s.components*s.byteLength;case Uc:return i*e*2/s.components*s.byteLength;case Nh:return i*e*3/s.components*s.byteLength;case gn:return i*e*4/s.components*s.byteLength;case Oc:return i*e*4/s.components*s.byteLength;case Qr:case eo:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*8;case to:case no:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case Ha:case Ga:return Math.max(i,16)*Math.max(e,8)/4;case za:case Va:return Math.max(i,8)*Math.max(e,8)/2;case Wa:case Xa:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*8;case ja:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case Ka:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case qa:return Math.floor((i+4)/5)*Math.floor((e+3)/4)*16;case Ya:return Math.floor((i+4)/5)*Math.floor((e+4)/5)*16;case $a:return Math.floor((i+5)/6)*Math.floor((e+4)/5)*16;case Za:return Math.floor((i+5)/6)*Math.floor((e+5)/6)*16;case Ja:return Math.floor((i+7)/8)*Math.floor((e+4)/5)*16;case Qa:return Math.floor((i+7)/8)*Math.floor((e+5)/6)*16;case ec:return Math.floor((i+7)/8)*Math.floor((e+7)/8)*16;case tc:return Math.floor((i+9)/10)*Math.floor((e+4)/5)*16;case nc:return Math.floor((i+9)/10)*Math.floor((e+5)/6)*16;case ic:return Math.floor((i+9)/10)*Math.floor((e+7)/8)*16;case sc:return Math.floor((i+9)/10)*Math.floor((e+9)/10)*16;case rc:return Math.floor((i+11)/12)*Math.floor((e+9)/10)*16;case oc:return Math.floor((i+11)/12)*Math.floor((e+11)/12)*16;case io:case ac:case cc:return Math.ceil(i/4)*Math.ceil(e/4)*16;case Oh:case lc:return Math.ceil(i/4)*Math.ceil(e/4)*8;case uc:case hc:return Math.ceil(i/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}function Ag(i){switch(i){case Pn:case Ih:return{byteLength:1,components:1};case sr:case Ph:case pr:return{byteLength:2,components:1};case Pc:case Lc:return{byteLength:2,components:4};case Ui:case Ic:case Tn:return{byteLength:4,components:1};case Lh:return{byteLength:4,components:3}}throw new Error(`Unknown texture type ${i}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:Cc}}));typeof window<"u"&&(window.__THREE__?console.warn("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=Cc);function cd(){let i=null,e=!1,t=null,n=null;function s(r,o){t(r,o),n=i.requestAnimationFrame(s)}return{start:function(){e!==!0&&t!==null&&(n=i.requestAnimationFrame(s),e=!0)},stop:function(){i.cancelAnimationFrame(n),e=!1},setAnimationLoop:function(r){t=r},setContext:function(r){i=r}}}function wg(i){const e=new WeakMap;function t(a,c){const l=a.array,u=a.usage,h=l.byteLength,d=i.createBuffer();i.bindBuffer(c,d),i.bufferData(c,l,u),a.onUploadCallback();let p;if(l instanceof Float32Array)p=i.FLOAT;else if(typeof Float16Array<"u"&&l instanceof Float16Array)p=i.HALF_FLOAT;else if(l instanceof Uint16Array)a.isFloat16BufferAttribute?p=i.HALF_FLOAT:p=i.UNSIGNED_SHORT;else if(l instanceof Int16Array)p=i.SHORT;else if(l instanceof Uint32Array)p=i.UNSIGNED_INT;else if(l instanceof Int32Array)p=i.INT;else if(l instanceof Int8Array)p=i.BYTE;else if(l instanceof Uint8Array)p=i.UNSIGNED_BYTE;else if(l instanceof Uint8ClampedArray)p=i.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+l);return{buffer:d,type:p,bytesPerElement:l.BYTES_PER_ELEMENT,version:a.version,size:h}}function n(a,c,l){const u=c.array,h=c.updateRanges;if(i.bindBuffer(l,a),h.length===0)i.bufferSubData(l,0,u);else{h.sort((p,g)=>p.start-g.start);let d=0;for(let p=1;p<h.length;p++){const g=h[d],_=h[p];_.start<=g.start+g.count+1?g.count=Math.max(g.count,_.start+_.count-g.start):(++d,h[d]=_)}h.length=d+1;for(let p=0,g=h.length;p<g;p++){const _=h[p];i.bufferSubData(l,_.start*u.BYTES_PER_ELEMENT,u,_.start,_.count)}c.clearUpdateRanges()}c.onUploadCallback()}function s(a){return a.isInterleavedBufferAttribute&&(a=a.data),e.get(a)}function r(a){a.isInterleavedBufferAttribute&&(a=a.data);const c=e.get(a);c&&(i.deleteBuffer(c.buffer),e.delete(a))}function o(a,c){if(a.isInterleavedBufferAttribute&&(a=a.data),a.isGLBufferAttribute){const u=e.get(a);(!u||u.version<a.version)&&e.set(a,{buffer:a.buffer,type:a.type,bytesPerElement:a.elementSize,version:a.version});return}const l=e.get(a);if(l===void 0)e.set(a,t(a,c));else if(l.version<a.version){if(l.size!==a.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(l.buffer,a,c),l.version=a.version}}return{get:s,remove:r,update:o}}var Rg=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Cg=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,Ig=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,Pg=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Lg=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,Dg=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,Ng=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,Ug=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,Og=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec3 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
	}
#endif`,Fg=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,kg=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,Bg=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,zg=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,Hg=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,Vg=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,Gg=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,Wg=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,Xg=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,jg=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,Kg=`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,qg=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,Yg=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec3 vColor;
#endif`,$g=`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	vColor.xyz *= batchingColor.xyz;
#endif`,Zg=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,Jg=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,Qg=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,e_=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,t_=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,n_=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,i_=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,s_="gl_FragColor = linearToOutputTexel( gl_FragColor );",r_=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,o_=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,a_=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,c_=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,l_=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,u_=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,h_=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,d_=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,f_=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,p_=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,m_=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,g_=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,__=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,x_=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,v_=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,y_=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,M_=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,E_=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,S_=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,T_=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,b_=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,A_=`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return saturate(v);
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColor;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,w_=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,R_=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,C_=`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,I_=`#if defined( USE_LOGDEPTHBUF )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,P_=`#if defined( USE_LOGDEPTHBUF )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,L_=`#ifdef USE_LOGDEPTHBUF
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,D_=`#ifdef USE_LOGDEPTHBUF
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,N_=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,U_=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,O_=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,F_=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,k_=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,B_=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,z_=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,H_=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,V_=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,G_=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,W_=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,X_=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,j_=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,K_=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,q_=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Y_=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,$_=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,Z_=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,J_=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,Q_=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,e0=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,t0=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,n0=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,i0=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,s0=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,r0=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,o0=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,a0=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,c0=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,l0=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		return step( compare, unpackRGBAToDepth( texture2D( depths, uv ) ) );
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow (sampler2D shadow, vec2 uv, float compare ){
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		float hard_shadow = step( compare , distribution.x );
		if (hard_shadow != 1.0 ) {
			float distance = compare - distribution.x ;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		
		float lightToPositionLength = length( lightToPosition );
		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {
			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
				shadow = (
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
				) * ( 1.0 / 9.0 );
			#else
				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
			#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
#endif`,u0=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,h0=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,d0=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,f0=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,p0=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,m0=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,g0=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,_0=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,x0=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,v0=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,y0=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,M0=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,E0=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,S0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,T0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,b0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,A0=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const w0=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,R0=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,C0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,I0=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,P0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,L0=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,D0=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,N0=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,U0=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,O0=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,F0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,k0=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,B0=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,z0=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,H0=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,V0=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,G0=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,W0=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,X0=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,j0=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,K0=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,q0=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,Y0=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,$0=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Z0=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,J0=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;
	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Q0=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,ex=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,tx=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,nx=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,ix=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,sx=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,rx=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,ox=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,je={alphahash_fragment:Rg,alphahash_pars_fragment:Cg,alphamap_fragment:Ig,alphamap_pars_fragment:Pg,alphatest_fragment:Lg,alphatest_pars_fragment:Dg,aomap_fragment:Ng,aomap_pars_fragment:Ug,batching_pars_vertex:Og,batching_vertex:Fg,begin_vertex:kg,beginnormal_vertex:Bg,bsdfs:zg,iridescence_fragment:Hg,bumpmap_pars_fragment:Vg,clipping_planes_fragment:Gg,clipping_planes_pars_fragment:Wg,clipping_planes_pars_vertex:Xg,clipping_planes_vertex:jg,color_fragment:Kg,color_pars_fragment:qg,color_pars_vertex:Yg,color_vertex:$g,common:Zg,cube_uv_reflection_fragment:Jg,defaultnormal_vertex:Qg,displacementmap_pars_vertex:e_,displacementmap_vertex:t_,emissivemap_fragment:n_,emissivemap_pars_fragment:i_,colorspace_fragment:s_,colorspace_pars_fragment:r_,envmap_fragment:o_,envmap_common_pars_fragment:a_,envmap_pars_fragment:c_,envmap_pars_vertex:l_,envmap_physical_pars_fragment:y_,envmap_vertex:u_,fog_vertex:h_,fog_pars_vertex:d_,fog_fragment:f_,fog_pars_fragment:p_,gradientmap_pars_fragment:m_,lightmap_pars_fragment:g_,lights_lambert_fragment:__,lights_lambert_pars_fragment:x_,lights_pars_begin:v_,lights_toon_fragment:M_,lights_toon_pars_fragment:E_,lights_phong_fragment:S_,lights_phong_pars_fragment:T_,lights_physical_fragment:b_,lights_physical_pars_fragment:A_,lights_fragment_begin:w_,lights_fragment_maps:R_,lights_fragment_end:C_,logdepthbuf_fragment:I_,logdepthbuf_pars_fragment:P_,logdepthbuf_pars_vertex:L_,logdepthbuf_vertex:D_,map_fragment:N_,map_pars_fragment:U_,map_particle_fragment:O_,map_particle_pars_fragment:F_,metalnessmap_fragment:k_,metalnessmap_pars_fragment:B_,morphinstance_vertex:z_,morphcolor_vertex:H_,morphnormal_vertex:V_,morphtarget_pars_vertex:G_,morphtarget_vertex:W_,normal_fragment_begin:X_,normal_fragment_maps:j_,normal_pars_fragment:K_,normal_pars_vertex:q_,normal_vertex:Y_,normalmap_pars_fragment:$_,clearcoat_normal_fragment_begin:Z_,clearcoat_normal_fragment_maps:J_,clearcoat_pars_fragment:Q_,iridescence_pars_fragment:e0,opaque_fragment:t0,packing:n0,premultiplied_alpha_fragment:i0,project_vertex:s0,dithering_fragment:r0,dithering_pars_fragment:o0,roughnessmap_fragment:a0,roughnessmap_pars_fragment:c0,shadowmap_pars_fragment:l0,shadowmap_pars_vertex:u0,shadowmap_vertex:h0,shadowmask_pars_fragment:d0,skinbase_vertex:f0,skinning_pars_vertex:p0,skinning_vertex:m0,skinnormal_vertex:g0,specularmap_fragment:_0,specularmap_pars_fragment:x0,tonemapping_fragment:v0,tonemapping_pars_fragment:y0,transmission_fragment:M0,transmission_pars_fragment:E0,uv_pars_fragment:S0,uv_pars_vertex:T0,uv_vertex:b0,worldpos_vertex:A0,background_vert:w0,background_frag:R0,backgroundCube_vert:C0,backgroundCube_frag:I0,cube_vert:P0,cube_frag:L0,depth_vert:D0,depth_frag:N0,distanceRGBA_vert:U0,distanceRGBA_frag:O0,equirect_vert:F0,equirect_frag:k0,linedashed_vert:B0,linedashed_frag:z0,meshbasic_vert:H0,meshbasic_frag:V0,meshlambert_vert:G0,meshlambert_frag:W0,meshmatcap_vert:X0,meshmatcap_frag:j0,meshnormal_vert:K0,meshnormal_frag:q0,meshphong_vert:Y0,meshphong_frag:$0,meshphysical_vert:Z0,meshphysical_frag:J0,meshtoon_vert:Q0,meshtoon_frag:ex,points_vert:tx,points_frag:nx,shadow_vert:ix,shadow_frag:sx,sprite_vert:rx,sprite_frag:ox},ue={common:{diffuse:{value:new Ne(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Xe},alphaMap:{value:null},alphaMapTransform:{value:new Xe},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Xe}},envmap:{envMap:{value:null},envMapRotation:{value:new Xe},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Xe}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Xe}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Xe},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Xe},normalScale:{value:new we(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Xe},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Xe}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Xe}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Xe}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Ne(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new Ne(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Xe},alphaTest:{value:0},uvTransform:{value:new Xe}},sprite:{diffuse:{value:new Ne(16777215)},opacity:{value:1},center:{value:new we(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Xe},alphaMap:{value:null},alphaMapTransform:{value:new Xe},alphaTest:{value:0}}},In={basic:{uniforms:Wt([ue.common,ue.specularmap,ue.envmap,ue.aomap,ue.lightmap,ue.fog]),vertexShader:je.meshbasic_vert,fragmentShader:je.meshbasic_frag},lambert:{uniforms:Wt([ue.common,ue.specularmap,ue.envmap,ue.aomap,ue.lightmap,ue.emissivemap,ue.bumpmap,ue.normalmap,ue.displacementmap,ue.fog,ue.lights,{emissive:{value:new Ne(0)}}]),vertexShader:je.meshlambert_vert,fragmentShader:je.meshlambert_frag},phong:{uniforms:Wt([ue.common,ue.specularmap,ue.envmap,ue.aomap,ue.lightmap,ue.emissivemap,ue.bumpmap,ue.normalmap,ue.displacementmap,ue.fog,ue.lights,{emissive:{value:new Ne(0)},specular:{value:new Ne(1118481)},shininess:{value:30}}]),vertexShader:je.meshphong_vert,fragmentShader:je.meshphong_frag},standard:{uniforms:Wt([ue.common,ue.envmap,ue.aomap,ue.lightmap,ue.emissivemap,ue.bumpmap,ue.normalmap,ue.displacementmap,ue.roughnessmap,ue.metalnessmap,ue.fog,ue.lights,{emissive:{value:new Ne(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:je.meshphysical_vert,fragmentShader:je.meshphysical_frag},toon:{uniforms:Wt([ue.common,ue.aomap,ue.lightmap,ue.emissivemap,ue.bumpmap,ue.normalmap,ue.displacementmap,ue.gradientmap,ue.fog,ue.lights,{emissive:{value:new Ne(0)}}]),vertexShader:je.meshtoon_vert,fragmentShader:je.meshtoon_frag},matcap:{uniforms:Wt([ue.common,ue.bumpmap,ue.normalmap,ue.displacementmap,ue.fog,{matcap:{value:null}}]),vertexShader:je.meshmatcap_vert,fragmentShader:je.meshmatcap_frag},points:{uniforms:Wt([ue.points,ue.fog]),vertexShader:je.points_vert,fragmentShader:je.points_frag},dashed:{uniforms:Wt([ue.common,ue.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:je.linedashed_vert,fragmentShader:je.linedashed_frag},depth:{uniforms:Wt([ue.common,ue.displacementmap]),vertexShader:je.depth_vert,fragmentShader:je.depth_frag},normal:{uniforms:Wt([ue.common,ue.bumpmap,ue.normalmap,ue.displacementmap,{opacity:{value:1}}]),vertexShader:je.meshnormal_vert,fragmentShader:je.meshnormal_frag},sprite:{uniforms:Wt([ue.sprite,ue.fog]),vertexShader:je.sprite_vert,fragmentShader:je.sprite_frag},background:{uniforms:{uvTransform:{value:new Xe},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:je.background_vert,fragmentShader:je.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Xe}},vertexShader:je.backgroundCube_vert,fragmentShader:je.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:je.cube_vert,fragmentShader:je.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:je.equirect_vert,fragmentShader:je.equirect_frag},distanceRGBA:{uniforms:Wt([ue.common,ue.displacementmap,{referencePosition:{value:new N},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:je.distanceRGBA_vert,fragmentShader:je.distanceRGBA_frag},shadow:{uniforms:Wt([ue.lights,ue.fog,{color:{value:new Ne(0)},opacity:{value:1}}]),vertexShader:je.shadow_vert,fragmentShader:je.shadow_frag}};In.physical={uniforms:Wt([In.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Xe},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Xe},clearcoatNormalScale:{value:new we(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Xe},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Xe},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Xe},sheen:{value:0},sheenColor:{value:new Ne(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Xe},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Xe},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Xe},transmissionSamplerSize:{value:new we},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Xe},attenuationDistance:{value:0},attenuationColor:{value:new Ne(0)},specularColor:{value:new Ne(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Xe},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Xe},anisotropyVector:{value:new we},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Xe}}]),vertexShader:je.meshphysical_vert,fragmentShader:je.meshphysical_frag};const Xr={r:0,b:0,g:0},bi=new Ln,ax=new He;function cx(i,e,t,n,s,r,o){const a=new Ne(0);let c=r===!0?0:1,l,u,h=null,d=0,p=null;function g(x){let v=x.isScene===!0?x.background:null;return v&&v.isTexture&&(v=(x.backgroundBlurriness>0?t:e).get(v)),v}function _(x){let v=!1;const A=g(x);A===null?f(a,c):A&&A.isColor&&(f(A,1),v=!0);const w=i.xr.getEnvironmentBlendMode();w==="additive"?n.buffers.color.setClear(0,0,0,1,o):w==="alpha-blend"&&n.buffers.color.setClear(0,0,0,0,o),(i.autoClear||v)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),i.clear(i.autoClearColor,i.autoClearDepth,i.autoClearStencil))}function m(x,v){const A=g(v);A&&(A.isCubeTexture||A.mapping===yo)?(u===void 0&&(u=new dt(new mi(1,1,1),new gi({name:"BackgroundCubeMaterial",uniforms:Ms(In.backgroundCube.uniforms),vertexShader:In.backgroundCube.vertexShader,fragmentShader:In.backgroundCube.fragmentShader,side:Zt,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),u.geometry.deleteAttribute("normal"),u.geometry.deleteAttribute("uv"),u.onBeforeRender=function(w,R,C){this.matrixWorld.copyPosition(C.matrixWorld)},Object.defineProperty(u.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),s.update(u)),bi.copy(v.backgroundRotation),bi.x*=-1,bi.y*=-1,bi.z*=-1,A.isCubeTexture&&A.isRenderTargetTexture===!1&&(bi.y*=-1,bi.z*=-1),u.material.uniforms.envMap.value=A,u.material.uniforms.flipEnvMap.value=A.isCubeTexture&&A.isRenderTargetTexture===!1?-1:1,u.material.uniforms.backgroundBlurriness.value=v.backgroundBlurriness,u.material.uniforms.backgroundIntensity.value=v.backgroundIntensity,u.material.uniforms.backgroundRotation.value.setFromMatrix4(ax.makeRotationFromEuler(bi)),u.material.toneMapped=et.getTransfer(A.colorSpace)!==ut,(h!==A||d!==A.version||p!==i.toneMapping)&&(u.material.needsUpdate=!0,h=A,d=A.version,p=i.toneMapping),u.layers.enableAll(),x.unshift(u,u.geometry,u.material,0,0,null)):A&&A.isTexture&&(l===void 0&&(l=new dt(new Dn(2,2),new gi({name:"BackgroundMaterial",uniforms:Ms(In.background.uniforms),vertexShader:In.background.vertexShader,fragmentShader:In.background.fragmentShader,side:Jn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),s.update(l)),l.material.uniforms.t2D.value=A,l.material.uniforms.backgroundIntensity.value=v.backgroundIntensity,l.material.toneMapped=et.getTransfer(A.colorSpace)!==ut,A.matrixAutoUpdate===!0&&A.updateMatrix(),l.material.uniforms.uvTransform.value.copy(A.matrix),(h!==A||d!==A.version||p!==i.toneMapping)&&(l.material.needsUpdate=!0,h=A,d=A.version,p=i.toneMapping),l.layers.enableAll(),x.unshift(l,l.geometry,l.material,0,0,null))}function f(x,v){x.getRGB(Xr,jh(i)),n.buffers.color.setClear(Xr.r,Xr.g,Xr.b,v,o)}function y(){u!==void 0&&(u.geometry.dispose(),u.material.dispose(),u=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return a},setClearColor:function(x,v=1){a.set(x),c=v,f(a,c)},getClearAlpha:function(){return c},setClearAlpha:function(x){c=x,f(a,c)},render:_,addToRenderList:m,dispose:y}}function lx(i,e){const t=i.getParameter(i.MAX_VERTEX_ATTRIBS),n={},s=d(null);let r=s,o=!1;function a(M,T,D,P,O){let z=!1;const F=h(P,D,T);r!==F&&(r=F,l(r.object)),z=p(M,P,D,O),z&&g(M,P,D,O),O!==null&&e.update(O,i.ELEMENT_ARRAY_BUFFER),(z||o)&&(o=!1,v(M,T,D,P),O!==null&&i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,e.get(O).buffer))}function c(){return i.createVertexArray()}function l(M){return i.bindVertexArray(M)}function u(M){return i.deleteVertexArray(M)}function h(M,T,D){const P=D.wireframe===!0;let O=n[M.id];O===void 0&&(O={},n[M.id]=O);let z=O[T.id];z===void 0&&(z={},O[T.id]=z);let F=z[P];return F===void 0&&(F=d(c()),z[P]=F),F}function d(M){const T=[],D=[],P=[];for(let O=0;O<t;O++)T[O]=0,D[O]=0,P[O]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:T,enabledAttributes:D,attributeDivisors:P,object:M,attributes:{},index:null}}function p(M,T,D,P){const O=r.attributes,z=T.attributes;let F=0;const X=D.getAttributes();for(const V in X)if(X[V].location>=0){const re=O[V];let ne=z[V];if(ne===void 0&&(V==="instanceMatrix"&&M.instanceMatrix&&(ne=M.instanceMatrix),V==="instanceColor"&&M.instanceColor&&(ne=M.instanceColor)),re===void 0||re.attribute!==ne||ne&&re.data!==ne.data)return!0;F++}return r.attributesNum!==F||r.index!==P}function g(M,T,D,P){const O={},z=T.attributes;let F=0;const X=D.getAttributes();for(const V in X)if(X[V].location>=0){let re=z[V];re===void 0&&(V==="instanceMatrix"&&M.instanceMatrix&&(re=M.instanceMatrix),V==="instanceColor"&&M.instanceColor&&(re=M.instanceColor));const ne={};ne.attribute=re,re&&re.data&&(ne.data=re.data),O[V]=ne,F++}r.attributes=O,r.attributesNum=F,r.index=P}function _(){const M=r.newAttributes;for(let T=0,D=M.length;T<D;T++)M[T]=0}function m(M){f(M,0)}function f(M,T){const D=r.newAttributes,P=r.enabledAttributes,O=r.attributeDivisors;D[M]=1,P[M]===0&&(i.enableVertexAttribArray(M),P[M]=1),O[M]!==T&&(i.vertexAttribDivisor(M,T),O[M]=T)}function y(){const M=r.newAttributes,T=r.enabledAttributes;for(let D=0,P=T.length;D<P;D++)T[D]!==M[D]&&(i.disableVertexAttribArray(D),T[D]=0)}function x(M,T,D,P,O,z,F){F===!0?i.vertexAttribIPointer(M,T,D,O,z):i.vertexAttribPointer(M,T,D,P,O,z)}function v(M,T,D,P){_();const O=P.attributes,z=D.getAttributes(),F=T.defaultAttributeValues;for(const X in z){const V=z[X];if(V.location>=0){let ee=O[X];if(ee===void 0&&(X==="instanceMatrix"&&M.instanceMatrix&&(ee=M.instanceMatrix),X==="instanceColor"&&M.instanceColor&&(ee=M.instanceColor)),ee!==void 0){const re=ee.normalized,ne=ee.itemSize,Te=e.get(ee);if(Te===void 0)continue;const Fe=Te.buffer,j=Te.type,se=Te.bytesPerElement,_e=j===i.INT||j===i.UNSIGNED_INT||ee.gpuType===Ic;if(ee.isInterleavedBufferAttribute){const ce=ee.data,Ee=ce.stride,Ze=ee.offset;if(ce.isInstancedInterleavedBuffer){for(let Re=0;Re<V.locationSize;Re++)f(V.location+Re,ce.meshPerAttribute);M.isInstancedMesh!==!0&&P._maxInstanceCount===void 0&&(P._maxInstanceCount=ce.meshPerAttribute*ce.count)}else for(let Re=0;Re<V.locationSize;Re++)m(V.location+Re);i.bindBuffer(i.ARRAY_BUFFER,Fe);for(let Re=0;Re<V.locationSize;Re++)x(V.location+Re,ne/V.locationSize,j,re,Ee*se,(Ze+ne/V.locationSize*Re)*se,_e)}else{if(ee.isInstancedBufferAttribute){for(let ce=0;ce<V.locationSize;ce++)f(V.location+ce,ee.meshPerAttribute);M.isInstancedMesh!==!0&&P._maxInstanceCount===void 0&&(P._maxInstanceCount=ee.meshPerAttribute*ee.count)}else for(let ce=0;ce<V.locationSize;ce++)m(V.location+ce);i.bindBuffer(i.ARRAY_BUFFER,Fe);for(let ce=0;ce<V.locationSize;ce++)x(V.location+ce,ne/V.locationSize,j,re,ne*se,ne/V.locationSize*ce*se,_e)}}else if(F!==void 0){const re=F[X];if(re!==void 0)switch(re.length){case 2:i.vertexAttrib2fv(V.location,re);break;case 3:i.vertexAttrib3fv(V.location,re);break;case 4:i.vertexAttrib4fv(V.location,re);break;default:i.vertexAttrib1fv(V.location,re)}}}}y()}function A(){C();for(const M in n){const T=n[M];for(const D in T){const P=T[D];for(const O in P)u(P[O].object),delete P[O];delete T[D]}delete n[M]}}function w(M){if(n[M.id]===void 0)return;const T=n[M.id];for(const D in T){const P=T[D];for(const O in P)u(P[O].object),delete P[O];delete T[D]}delete n[M.id]}function R(M){for(const T in n){const D=n[T];if(D[M.id]===void 0)continue;const P=D[M.id];for(const O in P)u(P[O].object),delete P[O];delete D[M.id]}}function C(){S(),o=!0,r!==s&&(r=s,l(r.object))}function S(){s.geometry=null,s.program=null,s.wireframe=!1}return{setup:a,reset:C,resetDefaultState:S,dispose:A,releaseStatesOfGeometry:w,releaseStatesOfProgram:R,initAttributes:_,enableAttribute:m,disableUnusedAttributes:y}}function ux(i,e,t){let n;function s(l){n=l}function r(l,u){i.drawArrays(n,l,u),t.update(u,n,1)}function o(l,u,h){h!==0&&(i.drawArraysInstanced(n,l,u,h),t.update(u,n,h))}function a(l,u,h){if(h===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,u,0,h);let p=0;for(let g=0;g<h;g++)p+=u[g];t.update(p,n,1)}function c(l,u,h,d){if(h===0)return;const p=e.get("WEBGL_multi_draw");if(p===null)for(let g=0;g<l.length;g++)o(l[g],u[g],d[g]);else{p.multiDrawArraysInstancedWEBGL(n,l,0,u,0,d,0,h);let g=0;for(let _=0;_<h;_++)g+=u[_]*d[_];t.update(g,n,1)}}this.setMode=s,this.render=r,this.renderInstances=o,this.renderMultiDraw=a,this.renderMultiDrawInstances=c}function hx(i,e,t,n){let s;function r(){if(s!==void 0)return s;if(e.has("EXT_texture_filter_anisotropic")===!0){const R=e.get("EXT_texture_filter_anisotropic");s=i.getParameter(R.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else s=0;return s}function o(R){return!(R!==gn&&n.convert(R)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_FORMAT))}function a(R){const C=R===pr&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(R!==Pn&&n.convert(R)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_TYPE)&&R!==Tn&&!C)}function c(R){if(R==="highp"){if(i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.HIGH_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.HIGH_FLOAT).precision>0)return"highp";R="mediump"}return R==="mediump"&&i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.MEDIUM_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let l=t.precision!==void 0?t.precision:"highp";const u=c(l);u!==l&&(console.warn("THREE.WebGLRenderer:",l,"not supported, using",u,"instead."),l=u);const h=t.logarithmicDepthBuffer===!0,d=t.reverseDepthBuffer===!0&&e.has("EXT_clip_control"),p=i.getParameter(i.MAX_TEXTURE_IMAGE_UNITS),g=i.getParameter(i.MAX_VERTEX_TEXTURE_IMAGE_UNITS),_=i.getParameter(i.MAX_TEXTURE_SIZE),m=i.getParameter(i.MAX_CUBE_MAP_TEXTURE_SIZE),f=i.getParameter(i.MAX_VERTEX_ATTRIBS),y=i.getParameter(i.MAX_VERTEX_UNIFORM_VECTORS),x=i.getParameter(i.MAX_VARYING_VECTORS),v=i.getParameter(i.MAX_FRAGMENT_UNIFORM_VECTORS),A=g>0,w=i.getParameter(i.MAX_SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:c,textureFormatReadable:o,textureTypeReadable:a,precision:l,logarithmicDepthBuffer:h,reverseDepthBuffer:d,maxTextures:p,maxVertexTextures:g,maxTextureSize:_,maxCubemapSize:m,maxAttributes:f,maxVertexUniforms:y,maxVaryings:x,maxFragmentUniforms:v,vertexTextures:A,maxSamples:w}}function dx(i){const e=this;let t=null,n=0,s=!1,r=!1;const o=new jn,a=new Xe,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(h,d){const p=h.length!==0||d||n!==0||s;return s=d,n=h.length,p},this.beginShadows=function(){r=!0,u(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(h,d){t=u(h,d,0)},this.setState=function(h,d,p){const g=h.clippingPlanes,_=h.clipIntersection,m=h.clipShadows,f=i.get(h);if(!s||g===null||g.length===0||r&&!m)r?u(null):l();else{const y=r?0:n,x=y*4;let v=f.clippingState||null;c.value=v,v=u(g,d,x,p);for(let A=0;A!==x;++A)v[A]=t[A];f.clippingState=v,this.numIntersection=_?this.numPlanes:0,this.numPlanes+=y}};function l(){c.value!==t&&(c.value=t,c.needsUpdate=n>0),e.numPlanes=n,e.numIntersection=0}function u(h,d,p,g){const _=h!==null?h.length:0;let m=null;if(_!==0){if(m=c.value,g!==!0||m===null){const f=p+_*4,y=d.matrixWorldInverse;a.getNormalMatrix(y),(m===null||m.length<f)&&(m=new Float32Array(f));for(let x=0,v=p;x!==_;++x,v+=4)o.copy(h[x]).applyMatrix4(y,a),o.normal.toArray(m,v),m[v+3]=o.constant}c.value=m,c.needsUpdate=!0}return e.numPlanes=_,e.numIntersection=0,m}}function fx(i){let e=new WeakMap;function t(o,a){return a===ka?o.mapping=xs:a===Ba&&(o.mapping=vs),o}function n(o){if(o&&o.isTexture){const a=o.mapping;if(a===ka||a===Ba)if(e.has(o)){const c=e.get(o).texture;return t(c,o.mapping)}else{const c=o.image;if(c&&c.height>0){const l=new Pm(c.height);return l.fromEquirectangularTexture(i,o),e.set(o,l),o.addEventListener("dispose",s),t(l.texture,o.mapping)}else return null}}return o}function s(o){const a=o.target;a.removeEventListener("dispose",s);const c=e.get(a);c!==void 0&&(e.delete(a),c.dispose())}function r(){e=new WeakMap}return{get:n,dispose:r}}const ls=4,au=[.125,.215,.35,.446,.526,.582],Pi=20,aa=new qc,cu=new Ne;let ca=null,la=0,ua=0,ha=!1;const Ci=(1+Math.sqrt(5))/2,rs=1/Ci,lu=[new N(-Ci,rs,0),new N(Ci,rs,0),new N(-rs,0,Ci),new N(rs,0,Ci),new N(0,Ci,-rs),new N(0,Ci,rs),new N(-1,1,-1),new N(1,1,-1),new N(-1,1,1),new N(1,1,1)],px=new N;class uu{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(e,t=0,n=.1,s=100,r={}){const{size:o=256,position:a=px}=r;ca=this._renderer.getRenderTarget(),la=this._renderer.getActiveCubeFace(),ua=this._renderer.getActiveMipmapLevel(),ha=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(o);const c=this._allocateTargets();return c.depthBuffer=!0,this._sceneToCubeUV(e,n,s,c,a),t>0&&this._blur(c,0,0,t),this._applyPMREM(c),this._cleanup(c),c}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=fu(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=du(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodPlanes.length;e++)this._lodPlanes[e].dispose()}_cleanup(e){this._renderer.setRenderTarget(ca,la,ua),this._renderer.xr.enabled=ha,e.scissorTest=!1,jr(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===xs||e.mapping===vs?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),ca=this._renderer.getRenderTarget(),la=this._renderer.getActiveCubeFace(),ua=this._renderer.getActiveMipmapLevel(),ha=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){const e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:rn,minFilter:rn,generateMipmaps:!1,type:pr,format:gn,colorSpace:Kt,depthBuffer:!1},s=hu(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=hu(e,t,n);const{_lodMax:r}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=mx(r)),this._blurMaterial=gx(r,e,t)}return s}_compileMaterial(e){const t=new dt(this._lodPlanes[0],e);this._renderer.compile(t,aa)}_sceneToCubeUV(e,t,n,s,r){const c=new Xt(90,1,t,n),l=[1,-1,1,1,1,1],u=[1,1,1,-1,-1,-1],h=this._renderer,d=h.autoClear,p=h.toneMapping;h.getClearColor(cu),h.toneMapping=pi,h.autoClear=!1;const g=new on({name:"PMREM.Background",side:Zt,depthWrite:!1,depthTest:!1}),_=new dt(new mi,g);let m=!1;const f=e.background;f?f.isColor&&(g.color.copy(f),e.background=null,m=!0):(g.color.copy(cu),m=!0);for(let y=0;y<6;y++){const x=y%3;x===0?(c.up.set(0,l[y],0),c.position.set(r.x,r.y,r.z),c.lookAt(r.x+u[y],r.y,r.z)):x===1?(c.up.set(0,0,l[y]),c.position.set(r.x,r.y,r.z),c.lookAt(r.x,r.y+u[y],r.z)):(c.up.set(0,l[y],0),c.position.set(r.x,r.y,r.z),c.lookAt(r.x,r.y,r.z+u[y]));const v=this._cubeSize;jr(s,x*v,y>2?v:0,v,v),h.setRenderTarget(s),m&&h.render(_,c),h.render(e,c)}_.geometry.dispose(),_.material.dispose(),h.toneMapping=p,h.autoClear=d,e.background=f}_textureToCubeUV(e,t){const n=this._renderer,s=e.mapping===xs||e.mapping===vs;s?(this._cubemapMaterial===null&&(this._cubemapMaterial=fu()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=du());const r=s?this._cubemapMaterial:this._equirectMaterial,o=new dt(this._lodPlanes[0],r),a=r.uniforms;a.envMap.value=e;const c=this._cubeSize;jr(t,0,0,3*c,2*c),n.setRenderTarget(t),n.render(o,aa)}_applyPMREM(e){const t=this._renderer,n=t.autoClear;t.autoClear=!1;const s=this._lodPlanes.length;for(let r=1;r<s;r++){const o=Math.sqrt(this._sigmas[r]*this._sigmas[r]-this._sigmas[r-1]*this._sigmas[r-1]),a=lu[(s-r-1)%lu.length];this._blur(e,r-1,r,o,a)}t.autoClear=n}_blur(e,t,n,s,r){const o=this._pingPongRenderTarget;this._halfBlur(e,o,t,n,s,"latitudinal",r),this._halfBlur(o,e,n,n,s,"longitudinal",r)}_halfBlur(e,t,n,s,r,o,a){const c=this._renderer,l=this._blurMaterial;o!=="latitudinal"&&o!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");const u=3,h=new dt(this._lodPlanes[s],l),d=l.uniforms,p=this._sizeLods[n]-1,g=isFinite(r)?Math.PI/(2*p):2*Math.PI/(2*Pi-1),_=r/g,m=isFinite(r)?1+Math.floor(u*_):Pi;m>Pi&&console.warn(`sigmaRadians, ${r}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${Pi}`);const f=[];let y=0;for(let R=0;R<Pi;++R){const C=R/_,S=Math.exp(-C*C/2);f.push(S),R===0?y+=S:R<m&&(y+=2*S)}for(let R=0;R<f.length;R++)f[R]=f[R]/y;d.envMap.value=e.texture,d.samples.value=m,d.weights.value=f,d.latitudinal.value=o==="latitudinal",a&&(d.poleAxis.value=a);const{_lodMax:x}=this;d.dTheta.value=g,d.mipInt.value=x-n;const v=this._sizeLods[s],A=3*v*(s>x-ls?s-x+ls:0),w=4*(this._cubeSize-v);jr(t,A,w,3*v,2*v),c.setRenderTarget(t),c.render(h,aa)}}function mx(i){const e=[],t=[],n=[];let s=i;const r=i-ls+1+au.length;for(let o=0;o<r;o++){const a=Math.pow(2,s);t.push(a);let c=1/a;o>i-ls?c=au[o-i+ls-1]:o===0&&(c=0),n.push(c);const l=1/(a-2),u=-l,h=1+l,d=[u,u,h,u,h,h,u,u,h,h,u,h],p=6,g=6,_=3,m=2,f=1,y=new Float32Array(_*g*p),x=new Float32Array(m*g*p),v=new Float32Array(f*g*p);for(let w=0;w<p;w++){const R=w%3*2/3-1,C=w>2?0:-1,S=[R,C,0,R+2/3,C,0,R+2/3,C+1,0,R,C,0,R+2/3,C+1,0,R,C+1,0];y.set(S,_*g*w),x.set(d,m*g*w);const M=[w,w,w,w,w,w];v.set(M,f*g*w)}const A=new Nt;A.setAttribute("position",new Ft(y,_)),A.setAttribute("uv",new Ft(x,m)),A.setAttribute("faceIndex",new Ft(v,f)),e.push(A),s>ls&&s--}return{lodPlanes:e,sizeLods:t,sigmas:n}}function hu(i,e,t){const n=new Oi(i,e,t);return n.texture.mapping=yo,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function jr(i,e,t,n,s){i.viewport.set(e,t,n,s),i.scissor.set(e,t,n,s)}function gx(i,e,t){const n=new Float32Array(Pi),s=new N(0,1,0);return new gi({name:"SphericalGaussianBlur",defines:{n:Pi,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:s}},vertexShader:Zc(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:fi,depthTest:!1,depthWrite:!1})}function du(){return new gi({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Zc(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:fi,depthTest:!1,depthWrite:!1})}function fu(){return new gi({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Zc(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:fi,depthTest:!1,depthWrite:!1})}function Zc(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}function _x(i){let e=new WeakMap,t=null;function n(a){if(a&&a.isTexture){const c=a.mapping,l=c===ka||c===Ba,u=c===xs||c===vs;if(l||u){let h=e.get(a);const d=h!==void 0?h.texture.pmremVersion:0;if(a.isRenderTargetTexture&&a.pmremVersion!==d)return t===null&&(t=new uu(i)),h=l?t.fromEquirectangular(a,h):t.fromCubemap(a,h),h.texture.pmremVersion=a.pmremVersion,e.set(a,h),h.texture;if(h!==void 0)return h.texture;{const p=a.image;return l&&p&&p.height>0||u&&p&&s(p)?(t===null&&(t=new uu(i)),h=l?t.fromEquirectangular(a):t.fromCubemap(a),h.texture.pmremVersion=a.pmremVersion,e.set(a,h),a.addEventListener("dispose",r),h.texture):null}}}return a}function s(a){let c=0;const l=6;for(let u=0;u<l;u++)a[u]!==void 0&&c++;return c===l}function r(a){const c=a.target;c.removeEventListener("dispose",r);const l=e.get(c);l!==void 0&&(e.delete(c),l.dispose())}function o(){e=new WeakMap,t!==null&&(t.dispose(),t=null)}return{get:n,dispose:o}}function xx(i){const e={};function t(n){if(e[n]!==void 0)return e[n];let s;switch(n){case"WEBGL_depth_texture":s=i.getExtension("WEBGL_depth_texture")||i.getExtension("MOZ_WEBGL_depth_texture")||i.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":s=i.getExtension("EXT_texture_filter_anisotropic")||i.getExtension("MOZ_EXT_texture_filter_anisotropic")||i.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":s=i.getExtension("WEBGL_compressed_texture_s3tc")||i.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||i.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":s=i.getExtension("WEBGL_compressed_texture_pvrtc")||i.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:s=i.getExtension(n)}return e[n]=s,s}return{has:function(n){return t(n)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(n){const s=t(n);return s===null&&fs("THREE.WebGLRenderer: "+n+" extension not supported."),s}}}function vx(i,e,t,n){const s={},r=new WeakMap;function o(h){const d=h.target;d.index!==null&&e.remove(d.index);for(const g in d.attributes)e.remove(d.attributes[g]);d.removeEventListener("dispose",o),delete s[d.id];const p=r.get(d);p&&(e.remove(p),r.delete(d)),n.releaseStatesOfGeometry(d),d.isInstancedBufferGeometry===!0&&delete d._maxInstanceCount,t.memory.geometries--}function a(h,d){return s[d.id]===!0||(d.addEventListener("dispose",o),s[d.id]=!0,t.memory.geometries++),d}function c(h){const d=h.attributes;for(const p in d)e.update(d[p],i.ARRAY_BUFFER)}function l(h){const d=[],p=h.index,g=h.attributes.position;let _=0;if(p!==null){const y=p.array;_=p.version;for(let x=0,v=y.length;x<v;x+=3){const A=y[x+0],w=y[x+1],R=y[x+2];d.push(A,w,w,R,R,A)}}else if(g!==void 0){const y=g.array;_=g.version;for(let x=0,v=y.length/3-1;x<v;x+=3){const A=x+0,w=x+1,R=x+2;d.push(A,w,w,R,R,A)}}else return;const m=new(Hh(d)?Xh:Wh)(d,1);m.version=_;const f=r.get(h);f&&e.remove(f),r.set(h,m)}function u(h){const d=r.get(h);if(d){const p=h.index;p!==null&&d.version<p.version&&l(h)}else l(h);return r.get(h)}return{get:a,update:c,getWireframeAttribute:u}}function yx(i,e,t){let n;function s(d){n=d}let r,o;function a(d){r=d.type,o=d.bytesPerElement}function c(d,p){i.drawElements(n,p,r,d*o),t.update(p,n,1)}function l(d,p,g){g!==0&&(i.drawElementsInstanced(n,p,r,d*o,g),t.update(p,n,g))}function u(d,p,g){if(g===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,p,0,r,d,0,g);let m=0;for(let f=0;f<g;f++)m+=p[f];t.update(m,n,1)}function h(d,p,g,_){if(g===0)return;const m=e.get("WEBGL_multi_draw");if(m===null)for(let f=0;f<d.length;f++)l(d[f]/o,p[f],_[f]);else{m.multiDrawElementsInstancedWEBGL(n,p,0,r,d,0,_,0,g);let f=0;for(let y=0;y<g;y++)f+=p[y]*_[y];t.update(f,n,1)}}this.setMode=s,this.setIndex=a,this.render=c,this.renderInstances=l,this.renderMultiDraw=u,this.renderMultiDrawInstances=h}function Mx(i){const e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,o,a){switch(t.calls++,o){case i.TRIANGLES:t.triangles+=a*(r/3);break;case i.LINES:t.lines+=a*(r/2);break;case i.LINE_STRIP:t.lines+=a*(r-1);break;case i.LINE_LOOP:t.lines+=a*r;break;case i.POINTS:t.points+=a*r;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",o);break}}function s(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:s,update:n}}function Ex(i,e,t){const n=new WeakMap,s=new rt;function r(o,a,c){const l=o.morphTargetInfluences,u=a.morphAttributes.position||a.morphAttributes.normal||a.morphAttributes.color,h=u!==void 0?u.length:0;let d=n.get(a);if(d===void 0||d.count!==h){let S=function(){R.dispose(),n.delete(a),a.removeEventListener("dispose",S)};d!==void 0&&d.texture.dispose();const p=a.morphAttributes.position!==void 0,g=a.morphAttributes.normal!==void 0,_=a.morphAttributes.color!==void 0,m=a.morphAttributes.position||[],f=a.morphAttributes.normal||[],y=a.morphAttributes.color||[];let x=0;p===!0&&(x=1),g===!0&&(x=2),_===!0&&(x=3);let v=a.attributes.position.count*x,A=1;v>e.maxTextureSize&&(A=Math.ceil(v/e.maxTextureSize),v=e.maxTextureSize);const w=new Float32Array(v*A*4*h),R=new Vh(w,v,A,h);R.type=Tn,R.needsUpdate=!0;const C=x*4;for(let M=0;M<h;M++){const T=m[M],D=f[M],P=y[M],O=v*A*4*M;for(let z=0;z<T.count;z++){const F=z*C;p===!0&&(s.fromBufferAttribute(T,z),w[O+F+0]=s.x,w[O+F+1]=s.y,w[O+F+2]=s.z,w[O+F+3]=0),g===!0&&(s.fromBufferAttribute(D,z),w[O+F+4]=s.x,w[O+F+5]=s.y,w[O+F+6]=s.z,w[O+F+7]=0),_===!0&&(s.fromBufferAttribute(P,z),w[O+F+8]=s.x,w[O+F+9]=s.y,w[O+F+10]=s.z,w[O+F+11]=P.itemSize===4?s.w:1)}}d={count:h,texture:R,size:new we(v,A)},n.set(a,d),a.addEventListener("dispose",S)}if(o.isInstancedMesh===!0&&o.morphTexture!==null)c.getUniforms().setValue(i,"morphTexture",o.morphTexture,t);else{let p=0;for(let _=0;_<l.length;_++)p+=l[_];const g=a.morphTargetsRelative?1:1-p;c.getUniforms().setValue(i,"morphTargetBaseInfluence",g),c.getUniforms().setValue(i,"morphTargetInfluences",l)}c.getUniforms().setValue(i,"morphTargetsTexture",d.texture,t),c.getUniforms().setValue(i,"morphTargetsTextureSize",d.size)}return{update:r}}function Sx(i,e,t,n){let s=new WeakMap;function r(c){const l=n.render.frame,u=c.geometry,h=e.get(c,u);if(s.get(h)!==l&&(e.update(h),s.set(h,l)),c.isInstancedMesh&&(c.hasEventListener("dispose",a)===!1&&c.addEventListener("dispose",a),s.get(c)!==l&&(t.update(c.instanceMatrix,i.ARRAY_BUFFER),c.instanceColor!==null&&t.update(c.instanceColor,i.ARRAY_BUFFER),s.set(c,l))),c.isSkinnedMesh){const d=c.skeleton;s.get(d)!==l&&(d.update(),s.set(d,l))}return h}function o(){s=new WeakMap}function a(c){const l=c.target;l.removeEventListener("dispose",a),t.remove(l.instanceMatrix),l.instanceColor!==null&&t.remove(l.instanceColor)}return{update:r,dispose:o}}const ld=new Ct,pu=new nd(1,1),ud=new Vh,hd=new pm,dd=new qh,mu=[],gu=[],_u=new Float32Array(16),xu=new Float32Array(9),vu=new Float32Array(4);function Cs(i,e,t){const n=i[0];if(n<=0||n>0)return i;const s=e*t;let r=mu[s];if(r===void 0&&(r=new Float32Array(s),mu[s]=r),e!==0){n.toArray(r,0);for(let o=1,a=0;o!==e;++o)a+=t,i[o].toArray(r,a)}return r}function It(i,e){if(i.length!==e.length)return!1;for(let t=0,n=i.length;t<n;t++)if(i[t]!==e[t])return!1;return!0}function Pt(i,e){for(let t=0,n=e.length;t<n;t++)i[t]=e[t]}function bo(i,e){let t=gu[e];t===void 0&&(t=new Int32Array(e),gu[e]=t);for(let n=0;n!==e;++n)t[n]=i.allocateTextureUnit();return t}function Tx(i,e){const t=this.cache;t[0]!==e&&(i.uniform1f(this.addr,e),t[0]=e)}function bx(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(It(t,e))return;i.uniform2fv(this.addr,e),Pt(t,e)}}function Ax(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(i.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(It(t,e))return;i.uniform3fv(this.addr,e),Pt(t,e)}}function wx(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(It(t,e))return;i.uniform4fv(this.addr,e),Pt(t,e)}}function Rx(i,e){const t=this.cache,n=e.elements;if(n===void 0){if(It(t,e))return;i.uniformMatrix2fv(this.addr,!1,e),Pt(t,e)}else{if(It(t,n))return;vu.set(n),i.uniformMatrix2fv(this.addr,!1,vu),Pt(t,n)}}function Cx(i,e){const t=this.cache,n=e.elements;if(n===void 0){if(It(t,e))return;i.uniformMatrix3fv(this.addr,!1,e),Pt(t,e)}else{if(It(t,n))return;xu.set(n),i.uniformMatrix3fv(this.addr,!1,xu),Pt(t,n)}}function Ix(i,e){const t=this.cache,n=e.elements;if(n===void 0){if(It(t,e))return;i.uniformMatrix4fv(this.addr,!1,e),Pt(t,e)}else{if(It(t,n))return;_u.set(n),i.uniformMatrix4fv(this.addr,!1,_u),Pt(t,n)}}function Px(i,e){const t=this.cache;t[0]!==e&&(i.uniform1i(this.addr,e),t[0]=e)}function Lx(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(It(t,e))return;i.uniform2iv(this.addr,e),Pt(t,e)}}function Dx(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(It(t,e))return;i.uniform3iv(this.addr,e),Pt(t,e)}}function Nx(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(It(t,e))return;i.uniform4iv(this.addr,e),Pt(t,e)}}function Ux(i,e){const t=this.cache;t[0]!==e&&(i.uniform1ui(this.addr,e),t[0]=e)}function Ox(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(It(t,e))return;i.uniform2uiv(this.addr,e),Pt(t,e)}}function Fx(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(It(t,e))return;i.uniform3uiv(this.addr,e),Pt(t,e)}}function kx(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(It(t,e))return;i.uniform4uiv(this.addr,e),Pt(t,e)}}function Bx(i,e,t){const n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s);let r;this.type===i.SAMPLER_2D_SHADOW?(pu.compareFunction=Bh,r=pu):r=ld,t.setTexture2D(e||r,s)}function zx(i,e,t){const n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTexture3D(e||hd,s)}function Hx(i,e,t){const n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTextureCube(e||dd,s)}function Vx(i,e,t){const n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTexture2DArray(e||ud,s)}function Gx(i){switch(i){case 5126:return Tx;case 35664:return bx;case 35665:return Ax;case 35666:return wx;case 35674:return Rx;case 35675:return Cx;case 35676:return Ix;case 5124:case 35670:return Px;case 35667:case 35671:return Lx;case 35668:case 35672:return Dx;case 35669:case 35673:return Nx;case 5125:return Ux;case 36294:return Ox;case 36295:return Fx;case 36296:return kx;case 35678:case 36198:case 36298:case 36306:case 35682:return Bx;case 35679:case 36299:case 36307:return zx;case 35680:case 36300:case 36308:case 36293:return Hx;case 36289:case 36303:case 36311:case 36292:return Vx}}function Wx(i,e){i.uniform1fv(this.addr,e)}function Xx(i,e){const t=Cs(e,this.size,2);i.uniform2fv(this.addr,t)}function jx(i,e){const t=Cs(e,this.size,3);i.uniform3fv(this.addr,t)}function Kx(i,e){const t=Cs(e,this.size,4);i.uniform4fv(this.addr,t)}function qx(i,e){const t=Cs(e,this.size,4);i.uniformMatrix2fv(this.addr,!1,t)}function Yx(i,e){const t=Cs(e,this.size,9);i.uniformMatrix3fv(this.addr,!1,t)}function $x(i,e){const t=Cs(e,this.size,16);i.uniformMatrix4fv(this.addr,!1,t)}function Zx(i,e){i.uniform1iv(this.addr,e)}function Jx(i,e){i.uniform2iv(this.addr,e)}function Qx(i,e){i.uniform3iv(this.addr,e)}function ev(i,e){i.uniform4iv(this.addr,e)}function tv(i,e){i.uniform1uiv(this.addr,e)}function nv(i,e){i.uniform2uiv(this.addr,e)}function iv(i,e){i.uniform3uiv(this.addr,e)}function sv(i,e){i.uniform4uiv(this.addr,e)}function rv(i,e,t){const n=this.cache,s=e.length,r=bo(t,s);It(n,r)||(i.uniform1iv(this.addr,r),Pt(n,r));for(let o=0;o!==s;++o)t.setTexture2D(e[o]||ld,r[o])}function ov(i,e,t){const n=this.cache,s=e.length,r=bo(t,s);It(n,r)||(i.uniform1iv(this.addr,r),Pt(n,r));for(let o=0;o!==s;++o)t.setTexture3D(e[o]||hd,r[o])}function av(i,e,t){const n=this.cache,s=e.length,r=bo(t,s);It(n,r)||(i.uniform1iv(this.addr,r),Pt(n,r));for(let o=0;o!==s;++o)t.setTextureCube(e[o]||dd,r[o])}function cv(i,e,t){const n=this.cache,s=e.length,r=bo(t,s);It(n,r)||(i.uniform1iv(this.addr,r),Pt(n,r));for(let o=0;o!==s;++o)t.setTexture2DArray(e[o]||ud,r[o])}function lv(i){switch(i){case 5126:return Wx;case 35664:return Xx;case 35665:return jx;case 35666:return Kx;case 35674:return qx;case 35675:return Yx;case 35676:return $x;case 5124:case 35670:return Zx;case 35667:case 35671:return Jx;case 35668:case 35672:return Qx;case 35669:case 35673:return ev;case 5125:return tv;case 36294:return nv;case 36295:return iv;case 36296:return sv;case 35678:case 36198:case 36298:case 36306:case 35682:return rv;case 35679:case 36299:case 36307:return ov;case 35680:case 36300:case 36308:case 36293:return av;case 36289:case 36303:case 36311:case 36292:return cv}}class uv{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=Gx(t.type)}}class hv{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=lv(t.type)}}class dv{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){const s=this.seq;for(let r=0,o=s.length;r!==o;++r){const a=s[r];a.setValue(e,t[a.id],n)}}}const da=/(\w+)(\])?(\[|\.)?/g;function yu(i,e){i.seq.push(e),i.map[e.id]=e}function fv(i,e,t){const n=i.name,s=n.length;for(da.lastIndex=0;;){const r=da.exec(n),o=da.lastIndex;let a=r[1];const c=r[2]==="]",l=r[3];if(c&&(a=a|0),l===void 0||l==="["&&o+2===s){yu(t,l===void 0?new uv(a,i,e):new hv(a,i,e));break}else{let h=t.map[a];h===void 0&&(h=new dv(a),yu(t,h)),t=h}}}class so{constructor(e,t){this.seq=[],this.map={};const n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let s=0;s<n;++s){const r=e.getActiveUniform(t,s),o=e.getUniformLocation(t,r.name);fv(r,o,this)}}setValue(e,t,n,s){const r=this.map[t];r!==void 0&&r.setValue(e,n,s)}setOptional(e,t,n){const s=t[n];s!==void 0&&this.setValue(e,n,s)}static upload(e,t,n,s){for(let r=0,o=t.length;r!==o;++r){const a=t[r],c=n[a.id];c.needsUpdate!==!1&&a.setValue(e,c.value,s)}}static seqWithValue(e,t){const n=[];for(let s=0,r=e.length;s!==r;++s){const o=e[s];o.id in t&&n.push(o)}return n}}function Mu(i,e,t){const n=i.createShader(e);return i.shaderSource(n,t),i.compileShader(n),n}const pv=37297;let mv=0;function gv(i,e){const t=i.split(`
`),n=[],s=Math.max(e-6,0),r=Math.min(e+6,t.length);for(let o=s;o<r;o++){const a=o+1;n.push(`${a===e?">":" "} ${a}: ${t[o]}`)}return n.join(`
`)}const Eu=new Xe;function _v(i){et._getMatrix(Eu,et.workingColorSpace,i);const e=`mat3( ${Eu.elements.map(t=>t.toFixed(4))} )`;switch(et.getTransfer(i)){case ho:return[e,"LinearTransferOETF"];case ut:return[e,"sRGBTransferOETF"];default:return console.warn("THREE.WebGLProgram: Unsupported color space: ",i),[e,"LinearTransferOETF"]}}function Su(i,e,t){const n=i.getShaderParameter(e,i.COMPILE_STATUS),s=i.getShaderInfoLog(e).trim();if(n&&s==="")return"";const r=/ERROR: 0:(\d+)/.exec(s);if(r){const o=parseInt(r[1]);return t.toUpperCase()+`

`+s+`

`+gv(i.getShaderSource(e),o)}else return s}function xv(i,e){const t=_v(e);return[`vec4 ${i}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}function vv(i,e){let t;switch(e){case Mp:t="Linear";break;case Ep:t="Reinhard";break;case Sp:t="Cineon";break;case wh:t="ACESFilmic";break;case bp:t="AgX";break;case Ap:t="Neutral";break;case Tp:t="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",e),t="Linear"}return"vec3 "+i+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}const Kr=new N;function yv(){et.getLuminanceCoefficients(Kr);const i=Kr.x.toFixed(4),e=Kr.y.toFixed(4),t=Kr.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${i}, ${e}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function Mv(i){return[i.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",i.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Zs).join(`
`)}function Ev(i){const e=[];for(const t in i){const n=i[t];n!==!1&&e.push("#define "+t+" "+n)}return e.join(`
`)}function Sv(i,e){const t={},n=i.getProgramParameter(e,i.ACTIVE_ATTRIBUTES);for(let s=0;s<n;s++){const r=i.getActiveAttrib(e,s),o=r.name;let a=1;r.type===i.FLOAT_MAT2&&(a=2),r.type===i.FLOAT_MAT3&&(a=3),r.type===i.FLOAT_MAT4&&(a=4),t[o]={type:r.type,location:i.getAttribLocation(e,o),locationSize:a}}return t}function Zs(i){return i!==""}function Tu(i,e){const t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return i.replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function bu(i,e){return i.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}const Tv=/^[ \t]*#include +<([\w\d./]+)>/gm;function vc(i){return i.replace(Tv,Av)}const bv=new Map;function Av(i,e){let t=je[e];if(t===void 0){const n=bv.get(e);if(n!==void 0)t=je[n],console.warn('THREE.WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',e,n);else throw new Error("Can not resolve #include <"+e+">")}return vc(t)}const wv=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Au(i){return i.replace(wv,Rv)}function Rv(i,e,t,n){let s="";for(let r=parseInt(e);r<parseInt(t);r++)s+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return s}function wu(i){let e=`precision ${i.precision} float;
	precision ${i.precision} int;
	precision ${i.precision} sampler2D;
	precision ${i.precision} samplerCube;
	precision ${i.precision} sampler3D;
	precision ${i.precision} sampler2DArray;
	precision ${i.precision} sampler2DShadow;
	precision ${i.precision} samplerCubeShadow;
	precision ${i.precision} sampler2DArrayShadow;
	precision ${i.precision} isampler2D;
	precision ${i.precision} isampler3D;
	precision ${i.precision} isamplerCube;
	precision ${i.precision} isampler2DArray;
	precision ${i.precision} usampler2D;
	precision ${i.precision} usampler3D;
	precision ${i.precision} usamplerCube;
	precision ${i.precision} usampler2DArray;
	`;return i.precision==="highp"?e+=`
#define HIGH_PRECISION`:i.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:i.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}function Cv(i){let e="SHADOWMAP_TYPE_BASIC";return i.shadowMapType===Th?e="SHADOWMAP_TYPE_PCF":i.shadowMapType===bh?e="SHADOWMAP_TYPE_PCF_SOFT":i.shadowMapType===Wn&&(e="SHADOWMAP_TYPE_VSM"),e}function Iv(i){let e="ENVMAP_TYPE_CUBE";if(i.envMap)switch(i.envMapMode){case xs:case vs:e="ENVMAP_TYPE_CUBE";break;case yo:e="ENVMAP_TYPE_CUBE_UV";break}return e}function Pv(i){let e="ENVMAP_MODE_REFLECTION";return i.envMap&&i.envMapMode===vs&&(e="ENVMAP_MODE_REFRACTION"),e}function Lv(i){let e="ENVMAP_BLENDING_NONE";if(i.envMap)switch(i.combine){case Ah:e="ENVMAP_BLENDING_MULTIPLY";break;case vp:e="ENVMAP_BLENDING_MIX";break;case yp:e="ENVMAP_BLENDING_ADD";break}return e}function Dv(i){const e=i.envMapCubeUVHeight;if(e===null)return null;const t=Math.log2(e)-2,n=1/e;return{texelWidth:1/(3*Math.max(Math.pow(2,t),112)),texelHeight:n,maxMip:t}}function Nv(i,e,t,n){const s=i.getContext(),r=t.defines;let o=t.vertexShader,a=t.fragmentShader;const c=Cv(t),l=Iv(t),u=Pv(t),h=Lv(t),d=Dv(t),p=Mv(t),g=Ev(r),_=s.createProgram();let m,f,y=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(m=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g].filter(Zs).join(`
`),m.length>0&&(m+=`
`),f=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g].filter(Zs).join(`
`),f.length>0&&(f+=`
`)):(m=[wu(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+u:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+c:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",t.reverseDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Zs).join(`
`),f=[wu(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+l:"",t.envMap?"#define "+u:"",t.envMap?"#define "+h:"",d?"#define CUBEUV_TEXEL_WIDTH "+d.texelWidth:"",d?"#define CUBEUV_TEXEL_HEIGHT "+d.texelHeight:"",d?"#define CUBEUV_MAX_MIP "+d.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor||t.batchingColor?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+c:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",t.reverseDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==pi?"#define TONE_MAPPING":"",t.toneMapping!==pi?je.tonemapping_pars_fragment:"",t.toneMapping!==pi?vv("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",je.colorspace_pars_fragment,xv("linearToOutputTexel",t.outputColorSpace),yv(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(Zs).join(`
`)),o=vc(o),o=Tu(o,t),o=bu(o,t),a=vc(a),a=Tu(a,t),a=bu(a,t),o=Au(o),a=Au(a),t.isRawShaderMaterial!==!0&&(y=`#version 300 es
`,m=[p,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+m,f=["#define varying in",t.glslVersion===xl?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===xl?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+f);const x=y+m+o,v=y+f+a,A=Mu(s,s.VERTEX_SHADER,x),w=Mu(s,s.FRAGMENT_SHADER,v);s.attachShader(_,A),s.attachShader(_,w),t.index0AttributeName!==void 0?s.bindAttribLocation(_,0,t.index0AttributeName):t.morphTargets===!0&&s.bindAttribLocation(_,0,"position"),s.linkProgram(_);function R(T){if(i.debug.checkShaderErrors){const D=s.getProgramInfoLog(_).trim(),P=s.getShaderInfoLog(A).trim(),O=s.getShaderInfoLog(w).trim();let z=!0,F=!0;if(s.getProgramParameter(_,s.LINK_STATUS)===!1)if(z=!1,typeof i.debug.onShaderError=="function")i.debug.onShaderError(s,_,A,w);else{const X=Su(s,A,"vertex"),V=Su(s,w,"fragment");console.error("THREE.WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(_,s.VALIDATE_STATUS)+`

Material Name: `+T.name+`
Material Type: `+T.type+`

Program Info Log: `+D+`
`+X+`
`+V)}else D!==""?console.warn("THREE.WebGLProgram: Program Info Log:",D):(P===""||O==="")&&(F=!1);F&&(T.diagnostics={runnable:z,programLog:D,vertexShader:{log:P,prefix:m},fragmentShader:{log:O,prefix:f}})}s.deleteShader(A),s.deleteShader(w),C=new so(s,_),S=Sv(s,_)}let C;this.getUniforms=function(){return C===void 0&&R(this),C};let S;this.getAttributes=function(){return S===void 0&&R(this),S};let M=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return M===!1&&(M=s.getProgramParameter(_,pv)),M},this.destroy=function(){n.releaseStatesOfProgram(this),s.deleteProgram(_),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=mv++,this.cacheKey=e,this.usedTimes=1,this.program=_,this.vertexShader=A,this.fragmentShader=w,this}let Uv=0;class Ov{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e){const t=e.vertexShader,n=e.fragmentShader,s=this._getShaderStage(t),r=this._getShaderStage(n),o=this._getShaderCacheForMaterial(e);return o.has(s)===!1&&(o.add(s),s.usedTimes++),o.has(r)===!1&&(o.add(r),r.usedTimes++),this}remove(e){const t=this.materialCache.get(e);for(const n of t)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(e),this}getVertexShaderID(e){return this._getShaderStage(e.vertexShader).id}getFragmentShaderID(e){return this._getShaderStage(e.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){const t=this.materialCache;let n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){const t=this.shaderCache;let n=t.get(e);return n===void 0&&(n=new Fv(e),t.set(e,n)),n}}class Fv{constructor(e){this.id=Uv++,this.code=e,this.usedTimes=0}}function kv(i,e,t,n,s,r,o){const a=new zc,c=new Ov,l=new Set,u=[],h=s.logarithmicDepthBuffer,d=s.vertexTextures;let p=s.precision;const g={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function _(S){return l.add(S),S===0?"uv":`uv${S}`}function m(S,M,T,D,P){const O=D.fog,z=P.geometry,F=S.isMeshStandardMaterial?D.environment:null,X=(S.isMeshStandardMaterial?t:e).get(S.envMap||F),V=X&&X.mapping===yo?X.image.height:null,ee=g[S.type];S.precision!==null&&(p=s.getMaxPrecision(S.precision),p!==S.precision&&console.warn("THREE.WebGLProgram.getParameters:",S.precision,"not supported, using",p,"instead."));const re=z.morphAttributes.position||z.morphAttributes.normal||z.morphAttributes.color,ne=re!==void 0?re.length:0;let Te=0;z.morphAttributes.position!==void 0&&(Te=1),z.morphAttributes.normal!==void 0&&(Te=2),z.morphAttributes.color!==void 0&&(Te=3);let Fe,j,se,_e;if(ee){const Oe=In[ee];Fe=Oe.vertexShader,j=Oe.fragmentShader}else Fe=S.vertexShader,j=S.fragmentShader,c.update(S),se=c.getVertexShaderID(S),_e=c.getFragmentShaderID(S);const ce=i.getRenderTarget(),Ee=i.state.buffers.depth.getReversed(),Ze=P.isInstancedMesh===!0,Re=P.isBatchedMesh===!0,ct=!!S.map,it=!!S.matcap,Je=!!X,L=!!S.aoMap,bt=!!S.lightMap,Qe=!!S.bumpMap,nt=!!S.normalMap,xe=!!S.displacementMap,qe=!!S.emissiveMap,Ce=!!S.metalnessMap,Ve=!!S.roughnessMap,Et=S.anisotropy>0,I=S.clearcoat>0,E=S.dispersion>0,k=S.iridescence>0,q=S.sheen>0,Z=S.transmission>0,K=Et&&!!S.anisotropyMap,be=I&&!!S.clearcoatMap,oe=I&&!!S.clearcoatNormalMap,ge=I&&!!S.clearcoatRoughnessMap,Ae=k&&!!S.iridescenceMap,J=k&&!!S.iridescenceThicknessMap,pe=q&&!!S.sheenColorMap,he=q&&!!S.sheenRoughnessMap,Le=!!S.specularMap,ae=!!S.specularColorMap,Ue=!!S.specularIntensityMap,U=Z&&!!S.transmissionMap,le=Z&&!!S.thicknessMap,Q=!!S.gradientMap,ve=!!S.alphaMap,te=S.alphaTest>0,Y=!!S.alphaHash,Me=!!S.extensions;let $=pi;S.toneMapped&&(ce===null||ce.isXRRenderTarget===!0)&&($=i.toneMapping);const me={shaderID:ee,shaderType:S.type,shaderName:S.name,vertexShader:Fe,fragmentShader:j,defines:S.defines,customVertexShaderID:se,customFragmentShaderID:_e,isRawShaderMaterial:S.isRawShaderMaterial===!0,glslVersion:S.glslVersion,precision:p,batching:Re,batchingColor:Re&&P._colorsTexture!==null,instancing:Ze,instancingColor:Ze&&P.instanceColor!==null,instancingMorph:Ze&&P.morphTexture!==null,supportsVertexTextures:d,outputColorSpace:ce===null?i.outputColorSpace:ce.isXRRenderTarget===!0?ce.texture.colorSpace:Kt,alphaToCoverage:!!S.alphaToCoverage,map:ct,matcap:it,envMap:Je,envMapMode:Je&&X.mapping,envMapCubeUVHeight:V,aoMap:L,lightMap:bt,bumpMap:Qe,normalMap:nt,displacementMap:d&&xe,emissiveMap:qe,normalMapObjectSpace:nt&&S.normalMapType===Up,normalMapTangentSpace:nt&&S.normalMapType===kh,metalnessMap:Ce,roughnessMap:Ve,anisotropy:Et,anisotropyMap:K,clearcoat:I,clearcoatMap:be,clearcoatNormalMap:oe,clearcoatRoughnessMap:ge,dispersion:E,iridescence:k,iridescenceMap:Ae,iridescenceThicknessMap:J,sheen:q,sheenColorMap:pe,sheenRoughnessMap:he,specularMap:Le,specularColorMap:ae,specularIntensityMap:Ue,transmission:Z,transmissionMap:U,thicknessMap:le,gradientMap:Q,opaque:S.transparent===!1&&S.blending===ds&&S.alphaToCoverage===!1,alphaMap:ve,alphaTest:te,alphaHash:Y,combine:S.combine,mapUv:ct&&_(S.map.channel),aoMapUv:L&&_(S.aoMap.channel),lightMapUv:bt&&_(S.lightMap.channel),bumpMapUv:Qe&&_(S.bumpMap.channel),normalMapUv:nt&&_(S.normalMap.channel),displacementMapUv:xe&&_(S.displacementMap.channel),emissiveMapUv:qe&&_(S.emissiveMap.channel),metalnessMapUv:Ce&&_(S.metalnessMap.channel),roughnessMapUv:Ve&&_(S.roughnessMap.channel),anisotropyMapUv:K&&_(S.anisotropyMap.channel),clearcoatMapUv:be&&_(S.clearcoatMap.channel),clearcoatNormalMapUv:oe&&_(S.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:ge&&_(S.clearcoatRoughnessMap.channel),iridescenceMapUv:Ae&&_(S.iridescenceMap.channel),iridescenceThicknessMapUv:J&&_(S.iridescenceThicknessMap.channel),sheenColorMapUv:pe&&_(S.sheenColorMap.channel),sheenRoughnessMapUv:he&&_(S.sheenRoughnessMap.channel),specularMapUv:Le&&_(S.specularMap.channel),specularColorMapUv:ae&&_(S.specularColorMap.channel),specularIntensityMapUv:Ue&&_(S.specularIntensityMap.channel),transmissionMapUv:U&&_(S.transmissionMap.channel),thicknessMapUv:le&&_(S.thicknessMap.channel),alphaMapUv:ve&&_(S.alphaMap.channel),vertexTangents:!!z.attributes.tangent&&(nt||Et),vertexColors:S.vertexColors,vertexAlphas:S.vertexColors===!0&&!!z.attributes.color&&z.attributes.color.itemSize===4,pointsUvs:P.isPoints===!0&&!!z.attributes.uv&&(ct||ve),fog:!!O,useFog:S.fog===!0,fogExp2:!!O&&O.isFogExp2,flatShading:S.flatShading===!0&&S.wireframe===!1,sizeAttenuation:S.sizeAttenuation===!0,logarithmicDepthBuffer:h,reverseDepthBuffer:Ee,skinning:P.isSkinnedMesh===!0,morphTargets:z.morphAttributes.position!==void 0,morphNormals:z.morphAttributes.normal!==void 0,morphColors:z.morphAttributes.color!==void 0,morphTargetsCount:ne,morphTextureStride:Te,numDirLights:M.directional.length,numPointLights:M.point.length,numSpotLights:M.spot.length,numSpotLightMaps:M.spotLightMap.length,numRectAreaLights:M.rectArea.length,numHemiLights:M.hemi.length,numDirLightShadows:M.directionalShadowMap.length,numPointLightShadows:M.pointShadowMap.length,numSpotLightShadows:M.spotShadowMap.length,numSpotLightShadowsWithMaps:M.numSpotLightShadowsWithMaps,numLightProbes:M.numLightProbes,numClippingPlanes:o.numPlanes,numClipIntersection:o.numIntersection,dithering:S.dithering,shadowMapEnabled:i.shadowMap.enabled&&T.length>0,shadowMapType:i.shadowMap.type,toneMapping:$,decodeVideoTexture:ct&&S.map.isVideoTexture===!0&&et.getTransfer(S.map.colorSpace)===ut,decodeVideoTextureEmissive:qe&&S.emissiveMap.isVideoTexture===!0&&et.getTransfer(S.emissiveMap.colorSpace)===ut,premultipliedAlpha:S.premultipliedAlpha,doubleSided:S.side===sn,flipSided:S.side===Zt,useDepthPacking:S.depthPacking>=0,depthPacking:S.depthPacking||0,index0AttributeName:S.index0AttributeName,extensionClipCullDistance:Me&&S.extensions.clipCullDistance===!0&&n.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(Me&&S.extensions.multiDraw===!0||Re)&&n.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:n.has("KHR_parallel_shader_compile"),customProgramCacheKey:S.customProgramCacheKey()};return me.vertexUv1s=l.has(1),me.vertexUv2s=l.has(2),me.vertexUv3s=l.has(3),l.clear(),me}function f(S){const M=[];if(S.shaderID?M.push(S.shaderID):(M.push(S.customVertexShaderID),M.push(S.customFragmentShaderID)),S.defines!==void 0)for(const T in S.defines)M.push(T),M.push(S.defines[T]);return S.isRawShaderMaterial===!1&&(y(M,S),x(M,S),M.push(i.outputColorSpace)),M.push(S.customProgramCacheKey),M.join()}function y(S,M){S.push(M.precision),S.push(M.outputColorSpace),S.push(M.envMapMode),S.push(M.envMapCubeUVHeight),S.push(M.mapUv),S.push(M.alphaMapUv),S.push(M.lightMapUv),S.push(M.aoMapUv),S.push(M.bumpMapUv),S.push(M.normalMapUv),S.push(M.displacementMapUv),S.push(M.emissiveMapUv),S.push(M.metalnessMapUv),S.push(M.roughnessMapUv),S.push(M.anisotropyMapUv),S.push(M.clearcoatMapUv),S.push(M.clearcoatNormalMapUv),S.push(M.clearcoatRoughnessMapUv),S.push(M.iridescenceMapUv),S.push(M.iridescenceThicknessMapUv),S.push(M.sheenColorMapUv),S.push(M.sheenRoughnessMapUv),S.push(M.specularMapUv),S.push(M.specularColorMapUv),S.push(M.specularIntensityMapUv),S.push(M.transmissionMapUv),S.push(M.thicknessMapUv),S.push(M.combine),S.push(M.fogExp2),S.push(M.sizeAttenuation),S.push(M.morphTargetsCount),S.push(M.morphAttributeCount),S.push(M.numDirLights),S.push(M.numPointLights),S.push(M.numSpotLights),S.push(M.numSpotLightMaps),S.push(M.numHemiLights),S.push(M.numRectAreaLights),S.push(M.numDirLightShadows),S.push(M.numPointLightShadows),S.push(M.numSpotLightShadows),S.push(M.numSpotLightShadowsWithMaps),S.push(M.numLightProbes),S.push(M.shadowMapType),S.push(M.toneMapping),S.push(M.numClippingPlanes),S.push(M.numClipIntersection),S.push(M.depthPacking)}function x(S,M){a.disableAll(),M.supportsVertexTextures&&a.enable(0),M.instancing&&a.enable(1),M.instancingColor&&a.enable(2),M.instancingMorph&&a.enable(3),M.matcap&&a.enable(4),M.envMap&&a.enable(5),M.normalMapObjectSpace&&a.enable(6),M.normalMapTangentSpace&&a.enable(7),M.clearcoat&&a.enable(8),M.iridescence&&a.enable(9),M.alphaTest&&a.enable(10),M.vertexColors&&a.enable(11),M.vertexAlphas&&a.enable(12),M.vertexUv1s&&a.enable(13),M.vertexUv2s&&a.enable(14),M.vertexUv3s&&a.enable(15),M.vertexTangents&&a.enable(16),M.anisotropy&&a.enable(17),M.alphaHash&&a.enable(18),M.batching&&a.enable(19),M.dispersion&&a.enable(20),M.batchingColor&&a.enable(21),M.gradientMap&&a.enable(22),S.push(a.mask),a.disableAll(),M.fog&&a.enable(0),M.useFog&&a.enable(1),M.flatShading&&a.enable(2),M.logarithmicDepthBuffer&&a.enable(3),M.reverseDepthBuffer&&a.enable(4),M.skinning&&a.enable(5),M.morphTargets&&a.enable(6),M.morphNormals&&a.enable(7),M.morphColors&&a.enable(8),M.premultipliedAlpha&&a.enable(9),M.shadowMapEnabled&&a.enable(10),M.doubleSided&&a.enable(11),M.flipSided&&a.enable(12),M.useDepthPacking&&a.enable(13),M.dithering&&a.enable(14),M.transmission&&a.enable(15),M.sheen&&a.enable(16),M.opaque&&a.enable(17),M.pointsUvs&&a.enable(18),M.decodeVideoTexture&&a.enable(19),M.decodeVideoTextureEmissive&&a.enable(20),M.alphaToCoverage&&a.enable(21),S.push(a.mask)}function v(S){const M=g[S.type];let T;if(M){const D=In[M];T=wm.clone(D.uniforms)}else T=S.uniforms;return T}function A(S,M){let T;for(let D=0,P=u.length;D<P;D++){const O=u[D];if(O.cacheKey===M){T=O,++T.usedTimes;break}}return T===void 0&&(T=new Nv(i,M,S,r),u.push(T)),T}function w(S){if(--S.usedTimes===0){const M=u.indexOf(S);u[M]=u[u.length-1],u.pop(),S.destroy()}}function R(S){c.remove(S)}function C(){c.dispose()}return{getParameters:m,getProgramCacheKey:f,getUniforms:v,acquireProgram:A,releaseProgram:w,releaseShaderCache:R,programs:u,dispose:C}}function Bv(){let i=new WeakMap;function e(o){return i.has(o)}function t(o){let a=i.get(o);return a===void 0&&(a={},i.set(o,a)),a}function n(o){i.delete(o)}function s(o,a,c){i.get(o)[a]=c}function r(){i=new WeakMap}return{has:e,get:t,remove:n,update:s,dispose:r}}function zv(i,e){return i.groupOrder!==e.groupOrder?i.groupOrder-e.groupOrder:i.renderOrder!==e.renderOrder?i.renderOrder-e.renderOrder:i.material.id!==e.material.id?i.material.id-e.material.id:i.z!==e.z?i.z-e.z:i.id-e.id}function Ru(i,e){return i.groupOrder!==e.groupOrder?i.groupOrder-e.groupOrder:i.renderOrder!==e.renderOrder?i.renderOrder-e.renderOrder:i.z!==e.z?e.z-i.z:i.id-e.id}function Cu(){const i=[];let e=0;const t=[],n=[],s=[];function r(){e=0,t.length=0,n.length=0,s.length=0}function o(h,d,p,g,_,m){let f=i[e];return f===void 0?(f={id:h.id,object:h,geometry:d,material:p,groupOrder:g,renderOrder:h.renderOrder,z:_,group:m},i[e]=f):(f.id=h.id,f.object=h,f.geometry=d,f.material=p,f.groupOrder=g,f.renderOrder=h.renderOrder,f.z=_,f.group=m),e++,f}function a(h,d,p,g,_,m){const f=o(h,d,p,g,_,m);p.transmission>0?n.push(f):p.transparent===!0?s.push(f):t.push(f)}function c(h,d,p,g,_,m){const f=o(h,d,p,g,_,m);p.transmission>0?n.unshift(f):p.transparent===!0?s.unshift(f):t.unshift(f)}function l(h,d){t.length>1&&t.sort(h||zv),n.length>1&&n.sort(d||Ru),s.length>1&&s.sort(d||Ru)}function u(){for(let h=e,d=i.length;h<d;h++){const p=i[h];if(p.id===null)break;p.id=null,p.object=null,p.geometry=null,p.material=null,p.group=null}}return{opaque:t,transmissive:n,transparent:s,init:r,push:a,unshift:c,finish:u,sort:l}}function Hv(){let i=new WeakMap;function e(n,s){const r=i.get(n);let o;return r===void 0?(o=new Cu,i.set(n,[o])):s>=r.length?(o=new Cu,r.push(o)):o=r[s],o}function t(){i=new WeakMap}return{get:e,dispose:t}}function Vv(){const i={};return{get:function(e){if(i[e.id]!==void 0)return i[e.id];let t;switch(e.type){case"DirectionalLight":t={direction:new N,color:new Ne};break;case"SpotLight":t={position:new N,direction:new N,color:new Ne,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new N,color:new Ne,distance:0,decay:0};break;case"HemisphereLight":t={direction:new N,skyColor:new Ne,groundColor:new Ne};break;case"RectAreaLight":t={color:new Ne,position:new N,halfWidth:new N,halfHeight:new N};break}return i[e.id]=t,t}}}function Gv(){const i={};return{get:function(e){if(i[e.id]!==void 0)return i[e.id];let t;switch(e.type){case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new we};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new we};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new we,shadowCameraNear:1,shadowCameraFar:1e3};break}return i[e.id]=t,t}}}let Wv=0;function Xv(i,e){return(e.castShadow?2:0)-(i.castShadow?2:0)+(e.map?1:0)-(i.map?1:0)}function jv(i){const e=new Vv,t=Gv(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let l=0;l<9;l++)n.probe.push(new N);const s=new N,r=new He,o=new He;function a(l){let u=0,h=0,d=0;for(let S=0;S<9;S++)n.probe[S].set(0,0,0);let p=0,g=0,_=0,m=0,f=0,y=0,x=0,v=0,A=0,w=0,R=0;l.sort(Xv);for(let S=0,M=l.length;S<M;S++){const T=l[S],D=T.color,P=T.intensity,O=T.distance,z=T.shadow&&T.shadow.map?T.shadow.map.texture:null;if(T.isAmbientLight)u+=D.r*P,h+=D.g*P,d+=D.b*P;else if(T.isLightProbe){for(let F=0;F<9;F++)n.probe[F].addScaledVector(T.sh.coefficients[F],P);R++}else if(T.isDirectionalLight){const F=e.get(T);if(F.color.copy(T.color).multiplyScalar(T.intensity),T.castShadow){const X=T.shadow,V=t.get(T);V.shadowIntensity=X.intensity,V.shadowBias=X.bias,V.shadowNormalBias=X.normalBias,V.shadowRadius=X.radius,V.shadowMapSize=X.mapSize,n.directionalShadow[p]=V,n.directionalShadowMap[p]=z,n.directionalShadowMatrix[p]=T.shadow.matrix,y++}n.directional[p]=F,p++}else if(T.isSpotLight){const F=e.get(T);F.position.setFromMatrixPosition(T.matrixWorld),F.color.copy(D).multiplyScalar(P),F.distance=O,F.coneCos=Math.cos(T.angle),F.penumbraCos=Math.cos(T.angle*(1-T.penumbra)),F.decay=T.decay,n.spot[_]=F;const X=T.shadow;if(T.map&&(n.spotLightMap[A]=T.map,A++,X.updateMatrices(T),T.castShadow&&w++),n.spotLightMatrix[_]=X.matrix,T.castShadow){const V=t.get(T);V.shadowIntensity=X.intensity,V.shadowBias=X.bias,V.shadowNormalBias=X.normalBias,V.shadowRadius=X.radius,V.shadowMapSize=X.mapSize,n.spotShadow[_]=V,n.spotShadowMap[_]=z,v++}_++}else if(T.isRectAreaLight){const F=e.get(T);F.color.copy(D).multiplyScalar(P),F.halfWidth.set(T.width*.5,0,0),F.halfHeight.set(0,T.height*.5,0),n.rectArea[m]=F,m++}else if(T.isPointLight){const F=e.get(T);if(F.color.copy(T.color).multiplyScalar(T.intensity),F.distance=T.distance,F.decay=T.decay,T.castShadow){const X=T.shadow,V=t.get(T);V.shadowIntensity=X.intensity,V.shadowBias=X.bias,V.shadowNormalBias=X.normalBias,V.shadowRadius=X.radius,V.shadowMapSize=X.mapSize,V.shadowCameraNear=X.camera.near,V.shadowCameraFar=X.camera.far,n.pointShadow[g]=V,n.pointShadowMap[g]=z,n.pointShadowMatrix[g]=T.shadow.matrix,x++}n.point[g]=F,g++}else if(T.isHemisphereLight){const F=e.get(T);F.skyColor.copy(T.color).multiplyScalar(P),F.groundColor.copy(T.groundColor).multiplyScalar(P),n.hemi[f]=F,f++}}m>0&&(i.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=ue.LTC_FLOAT_1,n.rectAreaLTC2=ue.LTC_FLOAT_2):(n.rectAreaLTC1=ue.LTC_HALF_1,n.rectAreaLTC2=ue.LTC_HALF_2)),n.ambient[0]=u,n.ambient[1]=h,n.ambient[2]=d;const C=n.hash;(C.directionalLength!==p||C.pointLength!==g||C.spotLength!==_||C.rectAreaLength!==m||C.hemiLength!==f||C.numDirectionalShadows!==y||C.numPointShadows!==x||C.numSpotShadows!==v||C.numSpotMaps!==A||C.numLightProbes!==R)&&(n.directional.length=p,n.spot.length=_,n.rectArea.length=m,n.point.length=g,n.hemi.length=f,n.directionalShadow.length=y,n.directionalShadowMap.length=y,n.pointShadow.length=x,n.pointShadowMap.length=x,n.spotShadow.length=v,n.spotShadowMap.length=v,n.directionalShadowMatrix.length=y,n.pointShadowMatrix.length=x,n.spotLightMatrix.length=v+A-w,n.spotLightMap.length=A,n.numSpotLightShadowsWithMaps=w,n.numLightProbes=R,C.directionalLength=p,C.pointLength=g,C.spotLength=_,C.rectAreaLength=m,C.hemiLength=f,C.numDirectionalShadows=y,C.numPointShadows=x,C.numSpotShadows=v,C.numSpotMaps=A,C.numLightProbes=R,n.version=Wv++)}function c(l,u){let h=0,d=0,p=0,g=0,_=0;const m=u.matrixWorldInverse;for(let f=0,y=l.length;f<y;f++){const x=l[f];if(x.isDirectionalLight){const v=n.directional[h];v.direction.setFromMatrixPosition(x.matrixWorld),s.setFromMatrixPosition(x.target.matrixWorld),v.direction.sub(s),v.direction.transformDirection(m),h++}else if(x.isSpotLight){const v=n.spot[p];v.position.setFromMatrixPosition(x.matrixWorld),v.position.applyMatrix4(m),v.direction.setFromMatrixPosition(x.matrixWorld),s.setFromMatrixPosition(x.target.matrixWorld),v.direction.sub(s),v.direction.transformDirection(m),p++}else if(x.isRectAreaLight){const v=n.rectArea[g];v.position.setFromMatrixPosition(x.matrixWorld),v.position.applyMatrix4(m),o.identity(),r.copy(x.matrixWorld),r.premultiply(m),o.extractRotation(r),v.halfWidth.set(x.width*.5,0,0),v.halfHeight.set(0,x.height*.5,0),v.halfWidth.applyMatrix4(o),v.halfHeight.applyMatrix4(o),g++}else if(x.isPointLight){const v=n.point[d];v.position.setFromMatrixPosition(x.matrixWorld),v.position.applyMatrix4(m),d++}else if(x.isHemisphereLight){const v=n.hemi[_];v.direction.setFromMatrixPosition(x.matrixWorld),v.direction.transformDirection(m),_++}}}return{setup:a,setupView:c,state:n}}function Iu(i){const e=new jv(i),t=[],n=[];function s(u){l.camera=u,t.length=0,n.length=0}function r(u){t.push(u)}function o(u){n.push(u)}function a(){e.setup(t)}function c(u){e.setupView(t,u)}const l={lightsArray:t,shadowsArray:n,camera:null,lights:e,transmissionRenderTarget:{}};return{init:s,state:l,setupLights:a,setupLightsView:c,pushLight:r,pushShadow:o}}function Kv(i){let e=new WeakMap;function t(s,r=0){const o=e.get(s);let a;return o===void 0?(a=new Iu(i),e.set(s,[a])):r>=o.length?(a=new Iu(i),o.push(a)):a=o[r],a}function n(){e=new WeakMap}return{get:t,dispose:n}}const qv=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,Yv=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}`;function $v(i,e,t){let n=new Gc;const s=new we,r=new we,o=new rt,a=new Wm({depthPacking:Np}),c=new Xm,l={},u=t.maxTextureSize,h={[Jn]:Zt,[Zt]:Jn,[sn]:sn},d=new gi({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new we},radius:{value:4}},vertexShader:qv,fragmentShader:Yv}),p=d.clone();p.defines.HORIZONTAL_PASS=1;const g=new Nt;g.setAttribute("position",new Ft(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const _=new dt(g,d),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Th;let f=this.type;this.render=function(w,R,C){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||w.length===0)return;const S=i.getRenderTarget(),M=i.getActiveCubeFace(),T=i.getActiveMipmapLevel(),D=i.state;D.setBlending(fi),D.buffers.color.setClear(1,1,1,1),D.buffers.depth.setTest(!0),D.setScissorTest(!1);const P=f!==Wn&&this.type===Wn,O=f===Wn&&this.type!==Wn;for(let z=0,F=w.length;z<F;z++){const X=w[z],V=X.shadow;if(V===void 0){console.warn("THREE.WebGLShadowMap:",X,"has no shadow.");continue}if(V.autoUpdate===!1&&V.needsUpdate===!1)continue;s.copy(V.mapSize);const ee=V.getFrameExtents();if(s.multiply(ee),r.copy(V.mapSize),(s.x>u||s.y>u)&&(s.x>u&&(r.x=Math.floor(u/ee.x),s.x=r.x*ee.x,V.mapSize.x=r.x),s.y>u&&(r.y=Math.floor(u/ee.y),s.y=r.y*ee.y,V.mapSize.y=r.y)),V.map===null||P===!0||O===!0){const ne=this.type!==Wn?{minFilter:jt,magFilter:jt}:{};V.map!==null&&V.map.dispose(),V.map=new Oi(s.x,s.y,ne),V.map.texture.name=X.name+".shadowMap",V.camera.updateProjectionMatrix()}i.setRenderTarget(V.map),i.clear();const re=V.getViewportCount();for(let ne=0;ne<re;ne++){const Te=V.getViewport(ne);o.set(r.x*Te.x,r.y*Te.y,r.x*Te.z,r.y*Te.w),D.viewport(o),V.updateMatrices(X,ne),n=V.getFrustum(),v(R,C,V.camera,X,this.type)}V.isPointLightShadow!==!0&&this.type===Wn&&y(V,C),V.needsUpdate=!1}f=this.type,m.needsUpdate=!1,i.setRenderTarget(S,M,T)};function y(w,R){const C=e.update(_);d.defines.VSM_SAMPLES!==w.blurSamples&&(d.defines.VSM_SAMPLES=w.blurSamples,p.defines.VSM_SAMPLES=w.blurSamples,d.needsUpdate=!0,p.needsUpdate=!0),w.mapPass===null&&(w.mapPass=new Oi(s.x,s.y)),d.uniforms.shadow_pass.value=w.map.texture,d.uniforms.resolution.value=w.mapSize,d.uniforms.radius.value=w.radius,i.setRenderTarget(w.mapPass),i.clear(),i.renderBufferDirect(R,null,C,d,_,null),p.uniforms.shadow_pass.value=w.mapPass.texture,p.uniforms.resolution.value=w.mapSize,p.uniforms.radius.value=w.radius,i.setRenderTarget(w.map),i.clear(),i.renderBufferDirect(R,null,C,p,_,null)}function x(w,R,C,S){let M=null;const T=C.isPointLight===!0?w.customDistanceMaterial:w.customDepthMaterial;if(T!==void 0)M=T;else if(M=C.isPointLight===!0?c:a,i.localClippingEnabled&&R.clipShadows===!0&&Array.isArray(R.clippingPlanes)&&R.clippingPlanes.length!==0||R.displacementMap&&R.displacementScale!==0||R.alphaMap&&R.alphaTest>0||R.map&&R.alphaTest>0||R.alphaToCoverage===!0){const D=M.uuid,P=R.uuid;let O=l[D];O===void 0&&(O={},l[D]=O);let z=O[P];z===void 0&&(z=M.clone(),O[P]=z,R.addEventListener("dispose",A)),M=z}if(M.visible=R.visible,M.wireframe=R.wireframe,S===Wn?M.side=R.shadowSide!==null?R.shadowSide:R.side:M.side=R.shadowSide!==null?R.shadowSide:h[R.side],M.alphaMap=R.alphaMap,M.alphaTest=R.alphaToCoverage===!0?.5:R.alphaTest,M.map=R.map,M.clipShadows=R.clipShadows,M.clippingPlanes=R.clippingPlanes,M.clipIntersection=R.clipIntersection,M.displacementMap=R.displacementMap,M.displacementScale=R.displacementScale,M.displacementBias=R.displacementBias,M.wireframeLinewidth=R.wireframeLinewidth,M.linewidth=R.linewidth,C.isPointLight===!0&&M.isMeshDistanceMaterial===!0){const D=i.properties.get(M);D.light=C}return M}function v(w,R,C,S,M){if(w.visible===!1)return;if(w.layers.test(R.layers)&&(w.isMesh||w.isLine||w.isPoints)&&(w.castShadow||w.receiveShadow&&M===Wn)&&(!w.frustumCulled||n.intersectsObject(w))){w.modelViewMatrix.multiplyMatrices(C.matrixWorldInverse,w.matrixWorld);const P=e.update(w),O=w.material;if(Array.isArray(O)){const z=P.groups;for(let F=0,X=z.length;F<X;F++){const V=z[F],ee=O[V.materialIndex];if(ee&&ee.visible){const re=x(w,ee,S,M);w.onBeforeShadow(i,w,R,C,P,re,V),i.renderBufferDirect(C,null,P,re,w,V),w.onAfterShadow(i,w,R,C,P,re,V)}}}else if(O.visible){const z=x(w,O,S,M);w.onBeforeShadow(i,w,R,C,P,z,null),i.renderBufferDirect(C,null,P,z,w,null),w.onAfterShadow(i,w,R,C,P,z,null)}}const D=w.children;for(let P=0,O=D.length;P<O;P++)v(D[P],R,C,S,M)}function A(w){w.target.removeEventListener("dispose",A);for(const C in l){const S=l[C],M=w.target.uuid;M in S&&(S[M].dispose(),delete S[M])}}}const Zv={[Pa]:La,[Da]:Oa,[Na]:Fa,[_s]:Ua,[La]:Pa,[Oa]:Da,[Fa]:Na,[Ua]:_s};function Jv(i,e){function t(){let U=!1;const le=new rt;let Q=null;const ve=new rt(0,0,0,0);return{setMask:function(te){Q!==te&&!U&&(i.colorMask(te,te,te,te),Q=te)},setLocked:function(te){U=te},setClear:function(te,Y,Me,$,me){me===!0&&(te*=$,Y*=$,Me*=$),le.set(te,Y,Me,$),ve.equals(le)===!1&&(i.clearColor(te,Y,Me,$),ve.copy(le))},reset:function(){U=!1,Q=null,ve.set(-1,0,0,0)}}}function n(){let U=!1,le=!1,Q=null,ve=null,te=null;return{setReversed:function(Y){if(le!==Y){const Me=e.get("EXT_clip_control");Y?Me.clipControlEXT(Me.LOWER_LEFT_EXT,Me.ZERO_TO_ONE_EXT):Me.clipControlEXT(Me.LOWER_LEFT_EXT,Me.NEGATIVE_ONE_TO_ONE_EXT),le=Y;const $=te;te=null,this.setClear($)}},getReversed:function(){return le},setTest:function(Y){Y?ce(i.DEPTH_TEST):Ee(i.DEPTH_TEST)},setMask:function(Y){Q!==Y&&!U&&(i.depthMask(Y),Q=Y)},setFunc:function(Y){if(le&&(Y=Zv[Y]),ve!==Y){switch(Y){case Pa:i.depthFunc(i.NEVER);break;case La:i.depthFunc(i.ALWAYS);break;case Da:i.depthFunc(i.LESS);break;case _s:i.depthFunc(i.LEQUAL);break;case Na:i.depthFunc(i.EQUAL);break;case Ua:i.depthFunc(i.GEQUAL);break;case Oa:i.depthFunc(i.GREATER);break;case Fa:i.depthFunc(i.NOTEQUAL);break;default:i.depthFunc(i.LEQUAL)}ve=Y}},setLocked:function(Y){U=Y},setClear:function(Y){te!==Y&&(le&&(Y=1-Y),i.clearDepth(Y),te=Y)},reset:function(){U=!1,Q=null,ve=null,te=null,le=!1}}}function s(){let U=!1,le=null,Q=null,ve=null,te=null,Y=null,Me=null,$=null,me=null;return{setTest:function(Oe){U||(Oe?ce(i.STENCIL_TEST):Ee(i.STENCIL_TEST))},setMask:function(Oe){le!==Oe&&!U&&(i.stencilMask(Oe),le=Oe)},setFunc:function(Oe,mt,Ut){(Q!==Oe||ve!==mt||te!==Ut)&&(i.stencilFunc(Oe,mt,Ut),Q=Oe,ve=mt,te=Ut)},setOp:function(Oe,mt,Ut){(Y!==Oe||Me!==mt||$!==Ut)&&(i.stencilOp(Oe,mt,Ut),Y=Oe,Me=mt,$=Ut)},setLocked:function(Oe){U=Oe},setClear:function(Oe){me!==Oe&&(i.clearStencil(Oe),me=Oe)},reset:function(){U=!1,le=null,Q=null,ve=null,te=null,Y=null,Me=null,$=null,me=null}}}const r=new t,o=new n,a=new s,c=new WeakMap,l=new WeakMap;let u={},h={},d=new WeakMap,p=[],g=null,_=!1,m=null,f=null,y=null,x=null,v=null,A=null,w=null,R=new Ne(0,0,0),C=0,S=!1,M=null,T=null,D=null,P=null,O=null;const z=i.getParameter(i.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let F=!1,X=0;const V=i.getParameter(i.VERSION);V.indexOf("WebGL")!==-1?(X=parseFloat(/^WebGL (\d)/.exec(V)[1]),F=X>=1):V.indexOf("OpenGL ES")!==-1&&(X=parseFloat(/^OpenGL ES (\d)/.exec(V)[1]),F=X>=2);let ee=null,re={};const ne=i.getParameter(i.SCISSOR_BOX),Te=i.getParameter(i.VIEWPORT),Fe=new rt().fromArray(ne),j=new rt().fromArray(Te);function se(U,le,Q,ve){const te=new Uint8Array(4),Y=i.createTexture();i.bindTexture(U,Y),i.texParameteri(U,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(U,i.TEXTURE_MAG_FILTER,i.NEAREST);for(let Me=0;Me<Q;Me++)U===i.TEXTURE_3D||U===i.TEXTURE_2D_ARRAY?i.texImage3D(le,0,i.RGBA,1,1,ve,0,i.RGBA,i.UNSIGNED_BYTE,te):i.texImage2D(le+Me,0,i.RGBA,1,1,0,i.RGBA,i.UNSIGNED_BYTE,te);return Y}const _e={};_e[i.TEXTURE_2D]=se(i.TEXTURE_2D,i.TEXTURE_2D,1),_e[i.TEXTURE_CUBE_MAP]=se(i.TEXTURE_CUBE_MAP,i.TEXTURE_CUBE_MAP_POSITIVE_X,6),_e[i.TEXTURE_2D_ARRAY]=se(i.TEXTURE_2D_ARRAY,i.TEXTURE_2D_ARRAY,1,1),_e[i.TEXTURE_3D]=se(i.TEXTURE_3D,i.TEXTURE_3D,1,1),r.setClear(0,0,0,1),o.setClear(1),a.setClear(0),ce(i.DEPTH_TEST),o.setFunc(_s),Qe(!1),nt(dl),ce(i.CULL_FACE),L(fi);function ce(U){u[U]!==!0&&(i.enable(U),u[U]=!0)}function Ee(U){u[U]!==!1&&(i.disable(U),u[U]=!1)}function Ze(U,le){return h[U]!==le?(i.bindFramebuffer(U,le),h[U]=le,U===i.DRAW_FRAMEBUFFER&&(h[i.FRAMEBUFFER]=le),U===i.FRAMEBUFFER&&(h[i.DRAW_FRAMEBUFFER]=le),!0):!1}function Re(U,le){let Q=p,ve=!1;if(U){Q=d.get(le),Q===void 0&&(Q=[],d.set(le,Q));const te=U.textures;if(Q.length!==te.length||Q[0]!==i.COLOR_ATTACHMENT0){for(let Y=0,Me=te.length;Y<Me;Y++)Q[Y]=i.COLOR_ATTACHMENT0+Y;Q.length=te.length,ve=!0}}else Q[0]!==i.BACK&&(Q[0]=i.BACK,ve=!0);ve&&i.drawBuffers(Q)}function ct(U){return g!==U?(i.useProgram(U),g=U,!0):!1}const it={[Ii]:i.FUNC_ADD,[np]:i.FUNC_SUBTRACT,[ip]:i.FUNC_REVERSE_SUBTRACT};it[sp]=i.MIN,it[rp]=i.MAX;const Je={[op]:i.ZERO,[ap]:i.ONE,[cp]:i.SRC_COLOR,[Ca]:i.SRC_ALPHA,[pp]:i.SRC_ALPHA_SATURATE,[dp]:i.DST_COLOR,[up]:i.DST_ALPHA,[lp]:i.ONE_MINUS_SRC_COLOR,[Ia]:i.ONE_MINUS_SRC_ALPHA,[fp]:i.ONE_MINUS_DST_COLOR,[hp]:i.ONE_MINUS_DST_ALPHA,[mp]:i.CONSTANT_COLOR,[gp]:i.ONE_MINUS_CONSTANT_COLOR,[_p]:i.CONSTANT_ALPHA,[xp]:i.ONE_MINUS_CONSTANT_ALPHA};function L(U,le,Q,ve,te,Y,Me,$,me,Oe){if(U===fi){_===!0&&(Ee(i.BLEND),_=!1);return}if(_===!1&&(ce(i.BLEND),_=!0),U!==tp){if(U!==m||Oe!==S){if((f!==Ii||v!==Ii)&&(i.blendEquation(i.FUNC_ADD),f=Ii,v=Ii),Oe)switch(U){case ds:i.blendFuncSeparate(i.ONE,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case fl:i.blendFunc(i.ONE,i.ONE);break;case pl:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case ml:i.blendFuncSeparate(i.DST_COLOR,i.ONE_MINUS_SRC_ALPHA,i.ZERO,i.ONE);break;default:console.error("THREE.WebGLState: Invalid blending: ",U);break}else switch(U){case ds:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case fl:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE,i.ONE,i.ONE);break;case pl:console.error("THREE.WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case ml:console.error("THREE.WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:console.error("THREE.WebGLState: Invalid blending: ",U);break}y=null,x=null,A=null,w=null,R.set(0,0,0),C=0,m=U,S=Oe}return}te=te||le,Y=Y||Q,Me=Me||ve,(le!==f||te!==v)&&(i.blendEquationSeparate(it[le],it[te]),f=le,v=te),(Q!==y||ve!==x||Y!==A||Me!==w)&&(i.blendFuncSeparate(Je[Q],Je[ve],Je[Y],Je[Me]),y=Q,x=ve,A=Y,w=Me),($.equals(R)===!1||me!==C)&&(i.blendColor($.r,$.g,$.b,me),R.copy($),C=me),m=U,S=!1}function bt(U,le){U.side===sn?Ee(i.CULL_FACE):ce(i.CULL_FACE);let Q=U.side===Zt;le&&(Q=!Q),Qe(Q),U.blending===ds&&U.transparent===!1?L(fi):L(U.blending,U.blendEquation,U.blendSrc,U.blendDst,U.blendEquationAlpha,U.blendSrcAlpha,U.blendDstAlpha,U.blendColor,U.blendAlpha,U.premultipliedAlpha),o.setFunc(U.depthFunc),o.setTest(U.depthTest),o.setMask(U.depthWrite),r.setMask(U.colorWrite);const ve=U.stencilWrite;a.setTest(ve),ve&&(a.setMask(U.stencilWriteMask),a.setFunc(U.stencilFunc,U.stencilRef,U.stencilFuncMask),a.setOp(U.stencilFail,U.stencilZFail,U.stencilZPass)),qe(U.polygonOffset,U.polygonOffsetFactor,U.polygonOffsetUnits),U.alphaToCoverage===!0?ce(i.SAMPLE_ALPHA_TO_COVERAGE):Ee(i.SAMPLE_ALPHA_TO_COVERAGE)}function Qe(U){M!==U&&(U?i.frontFace(i.CW):i.frontFace(i.CCW),M=U)}function nt(U){U!==Qf?(ce(i.CULL_FACE),U!==T&&(U===dl?i.cullFace(i.BACK):U===ep?i.cullFace(i.FRONT):i.cullFace(i.FRONT_AND_BACK))):Ee(i.CULL_FACE),T=U}function xe(U){U!==D&&(F&&i.lineWidth(U),D=U)}function qe(U,le,Q){U?(ce(i.POLYGON_OFFSET_FILL),(P!==le||O!==Q)&&(i.polygonOffset(le,Q),P=le,O=Q)):Ee(i.POLYGON_OFFSET_FILL)}function Ce(U){U?ce(i.SCISSOR_TEST):Ee(i.SCISSOR_TEST)}function Ve(U){U===void 0&&(U=i.TEXTURE0+z-1),ee!==U&&(i.activeTexture(U),ee=U)}function Et(U,le,Q){Q===void 0&&(ee===null?Q=i.TEXTURE0+z-1:Q=ee);let ve=re[Q];ve===void 0&&(ve={type:void 0,texture:void 0},re[Q]=ve),(ve.type!==U||ve.texture!==le)&&(ee!==Q&&(i.activeTexture(Q),ee=Q),i.bindTexture(U,le||_e[U]),ve.type=U,ve.texture=le)}function I(){const U=re[ee];U!==void 0&&U.type!==void 0&&(i.bindTexture(U.type,null),U.type=void 0,U.texture=void 0)}function E(){try{i.compressedTexImage2D(...arguments)}catch(U){console.error("THREE.WebGLState:",U)}}function k(){try{i.compressedTexImage3D(...arguments)}catch(U){console.error("THREE.WebGLState:",U)}}function q(){try{i.texSubImage2D(...arguments)}catch(U){console.error("THREE.WebGLState:",U)}}function Z(){try{i.texSubImage3D(...arguments)}catch(U){console.error("THREE.WebGLState:",U)}}function K(){try{i.compressedTexSubImage2D(...arguments)}catch(U){console.error("THREE.WebGLState:",U)}}function be(){try{i.compressedTexSubImage3D(...arguments)}catch(U){console.error("THREE.WebGLState:",U)}}function oe(){try{i.texStorage2D(...arguments)}catch(U){console.error("THREE.WebGLState:",U)}}function ge(){try{i.texStorage3D(...arguments)}catch(U){console.error("THREE.WebGLState:",U)}}function Ae(){try{i.texImage2D(...arguments)}catch(U){console.error("THREE.WebGLState:",U)}}function J(){try{i.texImage3D(...arguments)}catch(U){console.error("THREE.WebGLState:",U)}}function pe(U){Fe.equals(U)===!1&&(i.scissor(U.x,U.y,U.z,U.w),Fe.copy(U))}function he(U){j.equals(U)===!1&&(i.viewport(U.x,U.y,U.z,U.w),j.copy(U))}function Le(U,le){let Q=l.get(le);Q===void 0&&(Q=new WeakMap,l.set(le,Q));let ve=Q.get(U);ve===void 0&&(ve=i.getUniformBlockIndex(le,U.name),Q.set(U,ve))}function ae(U,le){const ve=l.get(le).get(U);c.get(le)!==ve&&(i.uniformBlockBinding(le,ve,U.__bindingPointIndex),c.set(le,ve))}function Ue(){i.disable(i.BLEND),i.disable(i.CULL_FACE),i.disable(i.DEPTH_TEST),i.disable(i.POLYGON_OFFSET_FILL),i.disable(i.SCISSOR_TEST),i.disable(i.STENCIL_TEST),i.disable(i.SAMPLE_ALPHA_TO_COVERAGE),i.blendEquation(i.FUNC_ADD),i.blendFunc(i.ONE,i.ZERO),i.blendFuncSeparate(i.ONE,i.ZERO,i.ONE,i.ZERO),i.blendColor(0,0,0,0),i.colorMask(!0,!0,!0,!0),i.clearColor(0,0,0,0),i.depthMask(!0),i.depthFunc(i.LESS),o.setReversed(!1),i.clearDepth(1),i.stencilMask(4294967295),i.stencilFunc(i.ALWAYS,0,4294967295),i.stencilOp(i.KEEP,i.KEEP,i.KEEP),i.clearStencil(0),i.cullFace(i.BACK),i.frontFace(i.CCW),i.polygonOffset(0,0),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),i.bindFramebuffer(i.READ_FRAMEBUFFER,null),i.useProgram(null),i.lineWidth(1),i.scissor(0,0,i.canvas.width,i.canvas.height),i.viewport(0,0,i.canvas.width,i.canvas.height),u={},ee=null,re={},h={},d=new WeakMap,p=[],g=null,_=!1,m=null,f=null,y=null,x=null,v=null,A=null,w=null,R=new Ne(0,0,0),C=0,S=!1,M=null,T=null,D=null,P=null,O=null,Fe.set(0,0,i.canvas.width,i.canvas.height),j.set(0,0,i.canvas.width,i.canvas.height),r.reset(),o.reset(),a.reset()}return{buffers:{color:r,depth:o,stencil:a},enable:ce,disable:Ee,bindFramebuffer:Ze,drawBuffers:Re,useProgram:ct,setBlending:L,setMaterial:bt,setFlipSided:Qe,setCullFace:nt,setLineWidth:xe,setPolygonOffset:qe,setScissorTest:Ce,activeTexture:Ve,bindTexture:Et,unbindTexture:I,compressedTexImage2D:E,compressedTexImage3D:k,texImage2D:Ae,texImage3D:J,updateUBOMapping:Le,uniformBlockBinding:ae,texStorage2D:oe,texStorage3D:ge,texSubImage2D:q,texSubImage3D:Z,compressedTexSubImage2D:K,compressedTexSubImage3D:be,scissor:pe,viewport:he,reset:Ue}}function Qv(i,e,t,n,s,r,o){const a=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,c=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),l=new we,u=new WeakMap;let h;const d=new WeakMap;let p=!1;try{p=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function g(I,E){return p?new OffscreenCanvas(I,E):ur("canvas")}function _(I,E,k){let q=1;const Z=Et(I);if((Z.width>k||Z.height>k)&&(q=k/Math.max(Z.width,Z.height)),q<1)if(typeof HTMLImageElement<"u"&&I instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&I instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&I instanceof ImageBitmap||typeof VideoFrame<"u"&&I instanceof VideoFrame){const K=Math.floor(q*Z.width),be=Math.floor(q*Z.height);h===void 0&&(h=g(K,be));const oe=E?g(K,be):h;return oe.width=K,oe.height=be,oe.getContext("2d").drawImage(I,0,0,K,be),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+Z.width+"x"+Z.height+") to ("+K+"x"+be+")."),oe}else return"data"in I&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+Z.width+"x"+Z.height+")."),I;return I}function m(I){return I.generateMipmaps}function f(I){i.generateMipmap(I)}function y(I){return I.isWebGLCubeRenderTarget?i.TEXTURE_CUBE_MAP:I.isWebGL3DRenderTarget?i.TEXTURE_3D:I.isWebGLArrayRenderTarget||I.isCompressedArrayTexture?i.TEXTURE_2D_ARRAY:i.TEXTURE_2D}function x(I,E,k,q,Z=!1){if(I!==null){if(i[I]!==void 0)return i[I];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+I+"'")}let K=E;if(E===i.RED&&(k===i.FLOAT&&(K=i.R32F),k===i.HALF_FLOAT&&(K=i.R16F),k===i.UNSIGNED_BYTE&&(K=i.R8)),E===i.RED_INTEGER&&(k===i.UNSIGNED_BYTE&&(K=i.R8UI),k===i.UNSIGNED_SHORT&&(K=i.R16UI),k===i.UNSIGNED_INT&&(K=i.R32UI),k===i.BYTE&&(K=i.R8I),k===i.SHORT&&(K=i.R16I),k===i.INT&&(K=i.R32I)),E===i.RG&&(k===i.FLOAT&&(K=i.RG32F),k===i.HALF_FLOAT&&(K=i.RG16F),k===i.UNSIGNED_BYTE&&(K=i.RG8)),E===i.RG_INTEGER&&(k===i.UNSIGNED_BYTE&&(K=i.RG8UI),k===i.UNSIGNED_SHORT&&(K=i.RG16UI),k===i.UNSIGNED_INT&&(K=i.RG32UI),k===i.BYTE&&(K=i.RG8I),k===i.SHORT&&(K=i.RG16I),k===i.INT&&(K=i.RG32I)),E===i.RGB_INTEGER&&(k===i.UNSIGNED_BYTE&&(K=i.RGB8UI),k===i.UNSIGNED_SHORT&&(K=i.RGB16UI),k===i.UNSIGNED_INT&&(K=i.RGB32UI),k===i.BYTE&&(K=i.RGB8I),k===i.SHORT&&(K=i.RGB16I),k===i.INT&&(K=i.RGB32I)),E===i.RGBA_INTEGER&&(k===i.UNSIGNED_BYTE&&(K=i.RGBA8UI),k===i.UNSIGNED_SHORT&&(K=i.RGBA16UI),k===i.UNSIGNED_INT&&(K=i.RGBA32UI),k===i.BYTE&&(K=i.RGBA8I),k===i.SHORT&&(K=i.RGBA16I),k===i.INT&&(K=i.RGBA32I)),E===i.RGB&&k===i.UNSIGNED_INT_5_9_9_9_REV&&(K=i.RGB9_E5),E===i.RGBA){const be=Z?ho:et.getTransfer(q);k===i.FLOAT&&(K=i.RGBA32F),k===i.HALF_FLOAT&&(K=i.RGBA16F),k===i.UNSIGNED_BYTE&&(K=be===ut?i.SRGB8_ALPHA8:i.RGBA8),k===i.UNSIGNED_SHORT_4_4_4_4&&(K=i.RGBA4),k===i.UNSIGNED_SHORT_5_5_5_1&&(K=i.RGB5_A1)}return(K===i.R16F||K===i.R32F||K===i.RG16F||K===i.RG32F||K===i.RGBA16F||K===i.RGBA32F)&&e.get("EXT_color_buffer_float"),K}function v(I,E){let k;return I?E===null||E===Ui||E===rr?k=i.DEPTH24_STENCIL8:E===Tn?k=i.DEPTH32F_STENCIL8:E===sr&&(k=i.DEPTH24_STENCIL8,console.warn("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):E===null||E===Ui||E===rr?k=i.DEPTH_COMPONENT24:E===Tn?k=i.DEPTH_COMPONENT32F:E===sr&&(k=i.DEPTH_COMPONENT16),k}function A(I,E){return m(I)===!0||I.isFramebufferTexture&&I.minFilter!==jt&&I.minFilter!==rn?Math.log2(Math.max(E.width,E.height))+1:I.mipmaps!==void 0&&I.mipmaps.length>0?I.mipmaps.length:I.isCompressedTexture&&Array.isArray(I.image)?E.mipmaps.length:1}function w(I){const E=I.target;E.removeEventListener("dispose",w),C(E),E.isVideoTexture&&u.delete(E)}function R(I){const E=I.target;E.removeEventListener("dispose",R),M(E)}function C(I){const E=n.get(I);if(E.__webglInit===void 0)return;const k=I.source,q=d.get(k);if(q){const Z=q[E.__cacheKey];Z.usedTimes--,Z.usedTimes===0&&S(I),Object.keys(q).length===0&&d.delete(k)}n.remove(I)}function S(I){const E=n.get(I);i.deleteTexture(E.__webglTexture);const k=I.source,q=d.get(k);delete q[E.__cacheKey],o.memory.textures--}function M(I){const E=n.get(I);if(I.depthTexture&&(I.depthTexture.dispose(),n.remove(I.depthTexture)),I.isWebGLCubeRenderTarget)for(let q=0;q<6;q++){if(Array.isArray(E.__webglFramebuffer[q]))for(let Z=0;Z<E.__webglFramebuffer[q].length;Z++)i.deleteFramebuffer(E.__webglFramebuffer[q][Z]);else i.deleteFramebuffer(E.__webglFramebuffer[q]);E.__webglDepthbuffer&&i.deleteRenderbuffer(E.__webglDepthbuffer[q])}else{if(Array.isArray(E.__webglFramebuffer))for(let q=0;q<E.__webglFramebuffer.length;q++)i.deleteFramebuffer(E.__webglFramebuffer[q]);else i.deleteFramebuffer(E.__webglFramebuffer);if(E.__webglDepthbuffer&&i.deleteRenderbuffer(E.__webglDepthbuffer),E.__webglMultisampledFramebuffer&&i.deleteFramebuffer(E.__webglMultisampledFramebuffer),E.__webglColorRenderbuffer)for(let q=0;q<E.__webglColorRenderbuffer.length;q++)E.__webglColorRenderbuffer[q]&&i.deleteRenderbuffer(E.__webglColorRenderbuffer[q]);E.__webglDepthRenderbuffer&&i.deleteRenderbuffer(E.__webglDepthRenderbuffer)}const k=I.textures;for(let q=0,Z=k.length;q<Z;q++){const K=n.get(k[q]);K.__webglTexture&&(i.deleteTexture(K.__webglTexture),o.memory.textures--),n.remove(k[q])}n.remove(I)}let T=0;function D(){T=0}function P(){const I=T;return I>=s.maxTextures&&console.warn("THREE.WebGLTextures: Trying to use "+I+" texture units while this GPU supports only "+s.maxTextures),T+=1,I}function O(I){const E=[];return E.push(I.wrapS),E.push(I.wrapT),E.push(I.wrapR||0),E.push(I.magFilter),E.push(I.minFilter),E.push(I.anisotropy),E.push(I.internalFormat),E.push(I.format),E.push(I.type),E.push(I.generateMipmaps),E.push(I.premultiplyAlpha),E.push(I.flipY),E.push(I.unpackAlignment),E.push(I.colorSpace),E.join()}function z(I,E){const k=n.get(I);if(I.isVideoTexture&&Ce(I),I.isRenderTargetTexture===!1&&I.version>0&&k.__version!==I.version){const q=I.image;if(q===null)console.warn("THREE.WebGLRenderer: Texture marked for update but no image data found.");else if(q.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{_e(k,I,E);return}}t.bindTexture(i.TEXTURE_2D,k.__webglTexture,i.TEXTURE0+E)}function F(I,E){const k=n.get(I);if(I.version>0&&k.__version!==I.version){_e(k,I,E);return}t.bindTexture(i.TEXTURE_2D_ARRAY,k.__webglTexture,i.TEXTURE0+E)}function X(I,E){const k=n.get(I);if(I.version>0&&k.__version!==I.version){_e(k,I,E);return}t.bindTexture(i.TEXTURE_3D,k.__webglTexture,i.TEXTURE0+E)}function V(I,E){const k=n.get(I);if(I.version>0&&k.__version!==I.version){ce(k,I,E);return}t.bindTexture(i.TEXTURE_CUBE_MAP,k.__webglTexture,i.TEXTURE0+E)}const ee={[Ni]:i.REPEAT,[di]:i.CLAMP_TO_EDGE,[lo]:i.MIRRORED_REPEAT},re={[jt]:i.NEAREST,[Ch]:i.NEAREST_MIPMAP_NEAREST,[$s]:i.NEAREST_MIPMAP_LINEAR,[rn]:i.LINEAR,[Jr]:i.LINEAR_MIPMAP_NEAREST,[qn]:i.LINEAR_MIPMAP_LINEAR},ne={[Op]:i.NEVER,[Vp]:i.ALWAYS,[Fp]:i.LESS,[Bh]:i.LEQUAL,[kp]:i.EQUAL,[Hp]:i.GEQUAL,[Bp]:i.GREATER,[zp]:i.NOTEQUAL};function Te(I,E){if(E.type===Tn&&e.has("OES_texture_float_linear")===!1&&(E.magFilter===rn||E.magFilter===Jr||E.magFilter===$s||E.magFilter===qn||E.minFilter===rn||E.minFilter===Jr||E.minFilter===$s||E.minFilter===qn)&&console.warn("THREE.WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),i.texParameteri(I,i.TEXTURE_WRAP_S,ee[E.wrapS]),i.texParameteri(I,i.TEXTURE_WRAP_T,ee[E.wrapT]),(I===i.TEXTURE_3D||I===i.TEXTURE_2D_ARRAY)&&i.texParameteri(I,i.TEXTURE_WRAP_R,ee[E.wrapR]),i.texParameteri(I,i.TEXTURE_MAG_FILTER,re[E.magFilter]),i.texParameteri(I,i.TEXTURE_MIN_FILTER,re[E.minFilter]),E.compareFunction&&(i.texParameteri(I,i.TEXTURE_COMPARE_MODE,i.COMPARE_REF_TO_TEXTURE),i.texParameteri(I,i.TEXTURE_COMPARE_FUNC,ne[E.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(E.magFilter===jt||E.minFilter!==$s&&E.minFilter!==qn||E.type===Tn&&e.has("OES_texture_float_linear")===!1)return;if(E.anisotropy>1||n.get(E).__currentAnisotropy){const k=e.get("EXT_texture_filter_anisotropic");i.texParameterf(I,k.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(E.anisotropy,s.getMaxAnisotropy())),n.get(E).__currentAnisotropy=E.anisotropy}}}function Fe(I,E){let k=!1;I.__webglInit===void 0&&(I.__webglInit=!0,E.addEventListener("dispose",w));const q=E.source;let Z=d.get(q);Z===void 0&&(Z={},d.set(q,Z));const K=O(E);if(K!==I.__cacheKey){Z[K]===void 0&&(Z[K]={texture:i.createTexture(),usedTimes:0},o.memory.textures++,k=!0),Z[K].usedTimes++;const be=Z[I.__cacheKey];be!==void 0&&(Z[I.__cacheKey].usedTimes--,be.usedTimes===0&&S(E)),I.__cacheKey=K,I.__webglTexture=Z[K].texture}return k}function j(I,E,k){return Math.floor(Math.floor(I/k)/E)}function se(I,E,k,q){const K=I.updateRanges;if(K.length===0)t.texSubImage2D(i.TEXTURE_2D,0,0,0,E.width,E.height,k,q,E.data);else{K.sort((J,pe)=>J.start-pe.start);let be=0;for(let J=1;J<K.length;J++){const pe=K[be],he=K[J],Le=pe.start+pe.count,ae=j(he.start,E.width,4),Ue=j(pe.start,E.width,4);he.start<=Le+1&&ae===Ue&&j(he.start+he.count-1,E.width,4)===ae?pe.count=Math.max(pe.count,he.start+he.count-pe.start):(++be,K[be]=he)}K.length=be+1;const oe=i.getParameter(i.UNPACK_ROW_LENGTH),ge=i.getParameter(i.UNPACK_SKIP_PIXELS),Ae=i.getParameter(i.UNPACK_SKIP_ROWS);i.pixelStorei(i.UNPACK_ROW_LENGTH,E.width);for(let J=0,pe=K.length;J<pe;J++){const he=K[J],Le=Math.floor(he.start/4),ae=Math.ceil(he.count/4),Ue=Le%E.width,U=Math.floor(Le/E.width),le=ae,Q=1;i.pixelStorei(i.UNPACK_SKIP_PIXELS,Ue),i.pixelStorei(i.UNPACK_SKIP_ROWS,U),t.texSubImage2D(i.TEXTURE_2D,0,Ue,U,le,Q,k,q,E.data)}I.clearUpdateRanges(),i.pixelStorei(i.UNPACK_ROW_LENGTH,oe),i.pixelStorei(i.UNPACK_SKIP_PIXELS,ge),i.pixelStorei(i.UNPACK_SKIP_ROWS,Ae)}}function _e(I,E,k){let q=i.TEXTURE_2D;(E.isDataArrayTexture||E.isCompressedArrayTexture)&&(q=i.TEXTURE_2D_ARRAY),E.isData3DTexture&&(q=i.TEXTURE_3D);const Z=Fe(I,E),K=E.source;t.bindTexture(q,I.__webglTexture,i.TEXTURE0+k);const be=n.get(K);if(K.version!==be.__version||Z===!0){t.activeTexture(i.TEXTURE0+k);const oe=et.getPrimaries(et.workingColorSpace),ge=E.colorSpace===hi?null:et.getPrimaries(E.colorSpace),Ae=E.colorSpace===hi||oe===ge?i.NONE:i.BROWSER_DEFAULT_WEBGL;i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,E.flipY),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,E.premultiplyAlpha),i.pixelStorei(i.UNPACK_ALIGNMENT,E.unpackAlignment),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,Ae);let J=_(E.image,!1,s.maxTextureSize);J=Ve(E,J);const pe=r.convert(E.format,E.colorSpace),he=r.convert(E.type);let Le=x(E.internalFormat,pe,he,E.colorSpace,E.isVideoTexture);Te(q,E);let ae;const Ue=E.mipmaps,U=E.isVideoTexture!==!0,le=be.__version===void 0||Z===!0,Q=K.dataReady,ve=A(E,J);if(E.isDepthTexture)Le=v(E.format===ar,E.type),le&&(U?t.texStorage2D(i.TEXTURE_2D,1,Le,J.width,J.height):t.texImage2D(i.TEXTURE_2D,0,Le,J.width,J.height,0,pe,he,null));else if(E.isDataTexture)if(Ue.length>0){U&&le&&t.texStorage2D(i.TEXTURE_2D,ve,Le,Ue[0].width,Ue[0].height);for(let te=0,Y=Ue.length;te<Y;te++)ae=Ue[te],U?Q&&t.texSubImage2D(i.TEXTURE_2D,te,0,0,ae.width,ae.height,pe,he,ae.data):t.texImage2D(i.TEXTURE_2D,te,Le,ae.width,ae.height,0,pe,he,ae.data);E.generateMipmaps=!1}else U?(le&&t.texStorage2D(i.TEXTURE_2D,ve,Le,J.width,J.height),Q&&se(E,J,pe,he)):t.texImage2D(i.TEXTURE_2D,0,Le,J.width,J.height,0,pe,he,J.data);else if(E.isCompressedTexture)if(E.isCompressedArrayTexture){U&&le&&t.texStorage3D(i.TEXTURE_2D_ARRAY,ve,Le,Ue[0].width,Ue[0].height,J.depth);for(let te=0,Y=Ue.length;te<Y;te++)if(ae=Ue[te],E.format!==gn)if(pe!==null)if(U){if(Q)if(E.layerUpdates.size>0){const Me=ou(ae.width,ae.height,E.format,E.type);for(const $ of E.layerUpdates){const me=ae.data.subarray($*Me/ae.data.BYTES_PER_ELEMENT,($+1)*Me/ae.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,te,0,0,$,ae.width,ae.height,1,pe,me)}E.clearLayerUpdates()}else t.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,te,0,0,0,ae.width,ae.height,J.depth,pe,ae.data)}else t.compressedTexImage3D(i.TEXTURE_2D_ARRAY,te,Le,ae.width,ae.height,J.depth,0,ae.data,0,0);else console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else U?Q&&t.texSubImage3D(i.TEXTURE_2D_ARRAY,te,0,0,0,ae.width,ae.height,J.depth,pe,he,ae.data):t.texImage3D(i.TEXTURE_2D_ARRAY,te,Le,ae.width,ae.height,J.depth,0,pe,he,ae.data)}else{U&&le&&t.texStorage2D(i.TEXTURE_2D,ve,Le,Ue[0].width,Ue[0].height);for(let te=0,Y=Ue.length;te<Y;te++)ae=Ue[te],E.format!==gn?pe!==null?U?Q&&t.compressedTexSubImage2D(i.TEXTURE_2D,te,0,0,ae.width,ae.height,pe,ae.data):t.compressedTexImage2D(i.TEXTURE_2D,te,Le,ae.width,ae.height,0,ae.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):U?Q&&t.texSubImage2D(i.TEXTURE_2D,te,0,0,ae.width,ae.height,pe,he,ae.data):t.texImage2D(i.TEXTURE_2D,te,Le,ae.width,ae.height,0,pe,he,ae.data)}else if(E.isDataArrayTexture)if(U){if(le&&t.texStorage3D(i.TEXTURE_2D_ARRAY,ve,Le,J.width,J.height,J.depth),Q)if(E.layerUpdates.size>0){const te=ou(J.width,J.height,E.format,E.type);for(const Y of E.layerUpdates){const Me=J.data.subarray(Y*te/J.data.BYTES_PER_ELEMENT,(Y+1)*te/J.data.BYTES_PER_ELEMENT);t.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,Y,J.width,J.height,1,pe,he,Me)}E.clearLayerUpdates()}else t.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,0,J.width,J.height,J.depth,pe,he,J.data)}else t.texImage3D(i.TEXTURE_2D_ARRAY,0,Le,J.width,J.height,J.depth,0,pe,he,J.data);else if(E.isData3DTexture)U?(le&&t.texStorage3D(i.TEXTURE_3D,ve,Le,J.width,J.height,J.depth),Q&&t.texSubImage3D(i.TEXTURE_3D,0,0,0,0,J.width,J.height,J.depth,pe,he,J.data)):t.texImage3D(i.TEXTURE_3D,0,Le,J.width,J.height,J.depth,0,pe,he,J.data);else if(E.isFramebufferTexture){if(le)if(U)t.texStorage2D(i.TEXTURE_2D,ve,Le,J.width,J.height);else{let te=J.width,Y=J.height;for(let Me=0;Me<ve;Me++)t.texImage2D(i.TEXTURE_2D,Me,Le,te,Y,0,pe,he,null),te>>=1,Y>>=1}}else if(Ue.length>0){if(U&&le){const te=Et(Ue[0]);t.texStorage2D(i.TEXTURE_2D,ve,Le,te.width,te.height)}for(let te=0,Y=Ue.length;te<Y;te++)ae=Ue[te],U?Q&&t.texSubImage2D(i.TEXTURE_2D,te,0,0,pe,he,ae):t.texImage2D(i.TEXTURE_2D,te,Le,pe,he,ae);E.generateMipmaps=!1}else if(U){if(le){const te=Et(J);t.texStorage2D(i.TEXTURE_2D,ve,Le,te.width,te.height)}Q&&t.texSubImage2D(i.TEXTURE_2D,0,0,0,pe,he,J)}else t.texImage2D(i.TEXTURE_2D,0,Le,pe,he,J);m(E)&&f(q),be.__version=K.version,E.onUpdate&&E.onUpdate(E)}I.__version=E.version}function ce(I,E,k){if(E.image.length!==6)return;const q=Fe(I,E),Z=E.source;t.bindTexture(i.TEXTURE_CUBE_MAP,I.__webglTexture,i.TEXTURE0+k);const K=n.get(Z);if(Z.version!==K.__version||q===!0){t.activeTexture(i.TEXTURE0+k);const be=et.getPrimaries(et.workingColorSpace),oe=E.colorSpace===hi?null:et.getPrimaries(E.colorSpace),ge=E.colorSpace===hi||be===oe?i.NONE:i.BROWSER_DEFAULT_WEBGL;i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,E.flipY),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,E.premultiplyAlpha),i.pixelStorei(i.UNPACK_ALIGNMENT,E.unpackAlignment),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,ge);const Ae=E.isCompressedTexture||E.image[0].isCompressedTexture,J=E.image[0]&&E.image[0].isDataTexture,pe=[];for(let Y=0;Y<6;Y++)!Ae&&!J?pe[Y]=_(E.image[Y],!0,s.maxCubemapSize):pe[Y]=J?E.image[Y].image:E.image[Y],pe[Y]=Ve(E,pe[Y]);const he=pe[0],Le=r.convert(E.format,E.colorSpace),ae=r.convert(E.type),Ue=x(E.internalFormat,Le,ae,E.colorSpace),U=E.isVideoTexture!==!0,le=K.__version===void 0||q===!0,Q=Z.dataReady;let ve=A(E,he);Te(i.TEXTURE_CUBE_MAP,E);let te;if(Ae){U&&le&&t.texStorage2D(i.TEXTURE_CUBE_MAP,ve,Ue,he.width,he.height);for(let Y=0;Y<6;Y++){te=pe[Y].mipmaps;for(let Me=0;Me<te.length;Me++){const $=te[Me];E.format!==gn?Le!==null?U?Q&&t.compressedTexSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,Me,0,0,$.width,$.height,Le,$.data):t.compressedTexImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,Me,Ue,$.width,$.height,0,$.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):U?Q&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,Me,0,0,$.width,$.height,Le,ae,$.data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,Me,Ue,$.width,$.height,0,Le,ae,$.data)}}}else{if(te=E.mipmaps,U&&le){te.length>0&&ve++;const Y=Et(pe[0]);t.texStorage2D(i.TEXTURE_CUBE_MAP,ve,Ue,Y.width,Y.height)}for(let Y=0;Y<6;Y++)if(J){U?Q&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0,0,0,pe[Y].width,pe[Y].height,Le,ae,pe[Y].data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0,Ue,pe[Y].width,pe[Y].height,0,Le,ae,pe[Y].data);for(let Me=0;Me<te.length;Me++){const me=te[Me].image[Y].image;U?Q&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,Me+1,0,0,me.width,me.height,Le,ae,me.data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,Me+1,Ue,me.width,me.height,0,Le,ae,me.data)}}else{U?Q&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0,0,0,Le,ae,pe[Y]):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0,Ue,Le,ae,pe[Y]);for(let Me=0;Me<te.length;Me++){const $=te[Me];U?Q&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,Me+1,0,0,Le,ae,$.image[Y]):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,Me+1,Ue,Le,ae,$.image[Y])}}}m(E)&&f(i.TEXTURE_CUBE_MAP),K.__version=Z.version,E.onUpdate&&E.onUpdate(E)}I.__version=E.version}function Ee(I,E,k,q,Z,K){const be=r.convert(k.format,k.colorSpace),oe=r.convert(k.type),ge=x(k.internalFormat,be,oe,k.colorSpace),Ae=n.get(E),J=n.get(k);if(J.__renderTarget=E,!Ae.__hasExternalTextures){const pe=Math.max(1,E.width>>K),he=Math.max(1,E.height>>K);Z===i.TEXTURE_3D||Z===i.TEXTURE_2D_ARRAY?t.texImage3D(Z,K,ge,pe,he,E.depth,0,be,oe,null):t.texImage2D(Z,K,ge,pe,he,0,be,oe,null)}t.bindFramebuffer(i.FRAMEBUFFER,I),qe(E)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,q,Z,J.__webglTexture,0,xe(E)):(Z===i.TEXTURE_2D||Z>=i.TEXTURE_CUBE_MAP_POSITIVE_X&&Z<=i.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&i.framebufferTexture2D(i.FRAMEBUFFER,q,Z,J.__webglTexture,K),t.bindFramebuffer(i.FRAMEBUFFER,null)}function Ze(I,E,k){if(i.bindRenderbuffer(i.RENDERBUFFER,I),E.depthBuffer){const q=E.depthTexture,Z=q&&q.isDepthTexture?q.type:null,K=v(E.stencilBuffer,Z),be=E.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,oe=xe(E);qe(E)?a.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,oe,K,E.width,E.height):k?i.renderbufferStorageMultisample(i.RENDERBUFFER,oe,K,E.width,E.height):i.renderbufferStorage(i.RENDERBUFFER,K,E.width,E.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,be,i.RENDERBUFFER,I)}else{const q=E.textures;for(let Z=0;Z<q.length;Z++){const K=q[Z],be=r.convert(K.format,K.colorSpace),oe=r.convert(K.type),ge=x(K.internalFormat,be,oe,K.colorSpace),Ae=xe(E);k&&qe(E)===!1?i.renderbufferStorageMultisample(i.RENDERBUFFER,Ae,ge,E.width,E.height):qe(E)?a.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,Ae,ge,E.width,E.height):i.renderbufferStorage(i.RENDERBUFFER,ge,E.width,E.height)}}i.bindRenderbuffer(i.RENDERBUFFER,null)}function Re(I,E){if(E&&E.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(t.bindFramebuffer(i.FRAMEBUFFER,I),!(E.depthTexture&&E.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");const q=n.get(E.depthTexture);q.__renderTarget=E,(!q.__webglTexture||E.depthTexture.image.width!==E.width||E.depthTexture.image.height!==E.height)&&(E.depthTexture.image.width=E.width,E.depthTexture.image.height=E.height,E.depthTexture.needsUpdate=!0),z(E.depthTexture,0);const Z=q.__webglTexture,K=xe(E);if(E.depthTexture.format===or)qe(E)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,i.DEPTH_ATTACHMENT,i.TEXTURE_2D,Z,0,K):i.framebufferTexture2D(i.FRAMEBUFFER,i.DEPTH_ATTACHMENT,i.TEXTURE_2D,Z,0);else if(E.depthTexture.format===ar)qe(E)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,i.DEPTH_STENCIL_ATTACHMENT,i.TEXTURE_2D,Z,0,K):i.framebufferTexture2D(i.FRAMEBUFFER,i.DEPTH_STENCIL_ATTACHMENT,i.TEXTURE_2D,Z,0);else throw new Error("Unknown depthTexture format")}function ct(I){const E=n.get(I),k=I.isWebGLCubeRenderTarget===!0;if(E.__boundDepthTexture!==I.depthTexture){const q=I.depthTexture;if(E.__depthDisposeCallback&&E.__depthDisposeCallback(),q){const Z=()=>{delete E.__boundDepthTexture,delete E.__depthDisposeCallback,q.removeEventListener("dispose",Z)};q.addEventListener("dispose",Z),E.__depthDisposeCallback=Z}E.__boundDepthTexture=q}if(I.depthTexture&&!E.__autoAllocateDepthBuffer){if(k)throw new Error("target.depthTexture not supported in Cube render targets");const q=I.texture.mipmaps;q&&q.length>0?Re(E.__webglFramebuffer[0],I):Re(E.__webglFramebuffer,I)}else if(k){E.__webglDepthbuffer=[];for(let q=0;q<6;q++)if(t.bindFramebuffer(i.FRAMEBUFFER,E.__webglFramebuffer[q]),E.__webglDepthbuffer[q]===void 0)E.__webglDepthbuffer[q]=i.createRenderbuffer(),Ze(E.__webglDepthbuffer[q],I,!1);else{const Z=I.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,K=E.__webglDepthbuffer[q];i.bindRenderbuffer(i.RENDERBUFFER,K),i.framebufferRenderbuffer(i.FRAMEBUFFER,Z,i.RENDERBUFFER,K)}}else{const q=I.texture.mipmaps;if(q&&q.length>0?t.bindFramebuffer(i.FRAMEBUFFER,E.__webglFramebuffer[0]):t.bindFramebuffer(i.FRAMEBUFFER,E.__webglFramebuffer),E.__webglDepthbuffer===void 0)E.__webglDepthbuffer=i.createRenderbuffer(),Ze(E.__webglDepthbuffer,I,!1);else{const Z=I.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,K=E.__webglDepthbuffer;i.bindRenderbuffer(i.RENDERBUFFER,K),i.framebufferRenderbuffer(i.FRAMEBUFFER,Z,i.RENDERBUFFER,K)}}t.bindFramebuffer(i.FRAMEBUFFER,null)}function it(I,E,k){const q=n.get(I);E!==void 0&&Ee(q.__webglFramebuffer,I,I.texture,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,0),k!==void 0&&ct(I)}function Je(I){const E=I.texture,k=n.get(I),q=n.get(E);I.addEventListener("dispose",R);const Z=I.textures,K=I.isWebGLCubeRenderTarget===!0,be=Z.length>1;if(be||(q.__webglTexture===void 0&&(q.__webglTexture=i.createTexture()),q.__version=E.version,o.memory.textures++),K){k.__webglFramebuffer=[];for(let oe=0;oe<6;oe++)if(E.mipmaps&&E.mipmaps.length>0){k.__webglFramebuffer[oe]=[];for(let ge=0;ge<E.mipmaps.length;ge++)k.__webglFramebuffer[oe][ge]=i.createFramebuffer()}else k.__webglFramebuffer[oe]=i.createFramebuffer()}else{if(E.mipmaps&&E.mipmaps.length>0){k.__webglFramebuffer=[];for(let oe=0;oe<E.mipmaps.length;oe++)k.__webglFramebuffer[oe]=i.createFramebuffer()}else k.__webglFramebuffer=i.createFramebuffer();if(be)for(let oe=0,ge=Z.length;oe<ge;oe++){const Ae=n.get(Z[oe]);Ae.__webglTexture===void 0&&(Ae.__webglTexture=i.createTexture(),o.memory.textures++)}if(I.samples>0&&qe(I)===!1){k.__webglMultisampledFramebuffer=i.createFramebuffer(),k.__webglColorRenderbuffer=[],t.bindFramebuffer(i.FRAMEBUFFER,k.__webglMultisampledFramebuffer);for(let oe=0;oe<Z.length;oe++){const ge=Z[oe];k.__webglColorRenderbuffer[oe]=i.createRenderbuffer(),i.bindRenderbuffer(i.RENDERBUFFER,k.__webglColorRenderbuffer[oe]);const Ae=r.convert(ge.format,ge.colorSpace),J=r.convert(ge.type),pe=x(ge.internalFormat,Ae,J,ge.colorSpace,I.isXRRenderTarget===!0),he=xe(I);i.renderbufferStorageMultisample(i.RENDERBUFFER,he,pe,I.width,I.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+oe,i.RENDERBUFFER,k.__webglColorRenderbuffer[oe])}i.bindRenderbuffer(i.RENDERBUFFER,null),I.depthBuffer&&(k.__webglDepthRenderbuffer=i.createRenderbuffer(),Ze(k.__webglDepthRenderbuffer,I,!0)),t.bindFramebuffer(i.FRAMEBUFFER,null)}}if(K){t.bindTexture(i.TEXTURE_CUBE_MAP,q.__webglTexture),Te(i.TEXTURE_CUBE_MAP,E);for(let oe=0;oe<6;oe++)if(E.mipmaps&&E.mipmaps.length>0)for(let ge=0;ge<E.mipmaps.length;ge++)Ee(k.__webglFramebuffer[oe][ge],I,E,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,ge);else Ee(k.__webglFramebuffer[oe],I,E,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,0);m(E)&&f(i.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(be){for(let oe=0,ge=Z.length;oe<ge;oe++){const Ae=Z[oe],J=n.get(Ae);t.bindTexture(i.TEXTURE_2D,J.__webglTexture),Te(i.TEXTURE_2D,Ae),Ee(k.__webglFramebuffer,I,Ae,i.COLOR_ATTACHMENT0+oe,i.TEXTURE_2D,0),m(Ae)&&f(i.TEXTURE_2D)}t.unbindTexture()}else{let oe=i.TEXTURE_2D;if((I.isWebGL3DRenderTarget||I.isWebGLArrayRenderTarget)&&(oe=I.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),t.bindTexture(oe,q.__webglTexture),Te(oe,E),E.mipmaps&&E.mipmaps.length>0)for(let ge=0;ge<E.mipmaps.length;ge++)Ee(k.__webglFramebuffer[ge],I,E,i.COLOR_ATTACHMENT0,oe,ge);else Ee(k.__webglFramebuffer,I,E,i.COLOR_ATTACHMENT0,oe,0);m(E)&&f(oe),t.unbindTexture()}I.depthBuffer&&ct(I)}function L(I){const E=I.textures;for(let k=0,q=E.length;k<q;k++){const Z=E[k];if(m(Z)){const K=y(I),be=n.get(Z).__webglTexture;t.bindTexture(K,be),f(K),t.unbindTexture()}}}const bt=[],Qe=[];function nt(I){if(I.samples>0){if(qe(I)===!1){const E=I.textures,k=I.width,q=I.height;let Z=i.COLOR_BUFFER_BIT;const K=I.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,be=n.get(I),oe=E.length>1;if(oe)for(let Ae=0;Ae<E.length;Ae++)t.bindFramebuffer(i.FRAMEBUFFER,be.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+Ae,i.RENDERBUFFER,null),t.bindFramebuffer(i.FRAMEBUFFER,be.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+Ae,i.TEXTURE_2D,null,0);t.bindFramebuffer(i.READ_FRAMEBUFFER,be.__webglMultisampledFramebuffer);const ge=I.texture.mipmaps;ge&&ge.length>0?t.bindFramebuffer(i.DRAW_FRAMEBUFFER,be.__webglFramebuffer[0]):t.bindFramebuffer(i.DRAW_FRAMEBUFFER,be.__webglFramebuffer);for(let Ae=0;Ae<E.length;Ae++){if(I.resolveDepthBuffer&&(I.depthBuffer&&(Z|=i.DEPTH_BUFFER_BIT),I.stencilBuffer&&I.resolveStencilBuffer&&(Z|=i.STENCIL_BUFFER_BIT)),oe){i.framebufferRenderbuffer(i.READ_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.RENDERBUFFER,be.__webglColorRenderbuffer[Ae]);const J=n.get(E[Ae]).__webglTexture;i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,J,0)}i.blitFramebuffer(0,0,k,q,0,0,k,q,Z,i.NEAREST),c===!0&&(bt.length=0,Qe.length=0,bt.push(i.COLOR_ATTACHMENT0+Ae),I.depthBuffer&&I.resolveDepthBuffer===!1&&(bt.push(K),Qe.push(K),i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,Qe)),i.invalidateFramebuffer(i.READ_FRAMEBUFFER,bt))}if(t.bindFramebuffer(i.READ_FRAMEBUFFER,null),t.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),oe)for(let Ae=0;Ae<E.length;Ae++){t.bindFramebuffer(i.FRAMEBUFFER,be.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+Ae,i.RENDERBUFFER,be.__webglColorRenderbuffer[Ae]);const J=n.get(E[Ae]).__webglTexture;t.bindFramebuffer(i.FRAMEBUFFER,be.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+Ae,i.TEXTURE_2D,J,0)}t.bindFramebuffer(i.DRAW_FRAMEBUFFER,be.__webglMultisampledFramebuffer)}else if(I.depthBuffer&&I.resolveDepthBuffer===!1&&c){const E=I.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,[E])}}}function xe(I){return Math.min(s.maxSamples,I.samples)}function qe(I){const E=n.get(I);return I.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&E.__useRenderToTexture!==!1}function Ce(I){const E=o.render.frame;u.get(I)!==E&&(u.set(I,E),I.update())}function Ve(I,E){const k=I.colorSpace,q=I.format,Z=I.type;return I.isCompressedTexture===!0||I.isVideoTexture===!0||k!==Kt&&k!==hi&&(et.getTransfer(k)===ut?(q!==gn||Z!==Pn)&&console.warn("THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):console.error("THREE.WebGLTextures: Unsupported texture color space:",k)),E}function Et(I){return typeof HTMLImageElement<"u"&&I instanceof HTMLImageElement?(l.width=I.naturalWidth||I.width,l.height=I.naturalHeight||I.height):typeof VideoFrame<"u"&&I instanceof VideoFrame?(l.width=I.displayWidth,l.height=I.displayHeight):(l.width=I.width,l.height=I.height),l}this.allocateTextureUnit=P,this.resetTextureUnits=D,this.setTexture2D=z,this.setTexture2DArray=F,this.setTexture3D=X,this.setTextureCube=V,this.rebindTextures=it,this.setupRenderTarget=Je,this.updateRenderTargetMipmap=L,this.updateMultisampleRenderTarget=nt,this.setupDepthRenderbuffer=ct,this.setupFrameBufferTexture=Ee,this.useMultisampledRTT=qe}function ey(i,e){function t(n,s=hi){let r;const o=et.getTransfer(s);if(n===Pn)return i.UNSIGNED_BYTE;if(n===Pc)return i.UNSIGNED_SHORT_4_4_4_4;if(n===Lc)return i.UNSIGNED_SHORT_5_5_5_1;if(n===Lh)return i.UNSIGNED_INT_5_9_9_9_REV;if(n===Ih)return i.BYTE;if(n===Ph)return i.SHORT;if(n===sr)return i.UNSIGNED_SHORT;if(n===Ic)return i.INT;if(n===Ui)return i.UNSIGNED_INT;if(n===Tn)return i.FLOAT;if(n===pr)return i.HALF_FLOAT;if(n===Dh)return i.ALPHA;if(n===Nh)return i.RGB;if(n===gn)return i.RGBA;if(n===or)return i.DEPTH_COMPONENT;if(n===ar)return i.DEPTH_STENCIL;if(n===Dc)return i.RED;if(n===Nc)return i.RED_INTEGER;if(n===Uh)return i.RG;if(n===Uc)return i.RG_INTEGER;if(n===Oc)return i.RGBA_INTEGER;if(n===Qr||n===eo||n===to||n===no)if(o===ut)if(r=e.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===Qr)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===eo)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===to)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===no)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=e.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===Qr)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===eo)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===to)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===no)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===za||n===Ha||n===Va||n===Ga)if(r=e.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===za)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===Ha)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===Va)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===Ga)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===Wa||n===Xa||n===ja)if(r=e.get("WEBGL_compressed_texture_etc"),r!==null){if(n===Wa||n===Xa)return o===ut?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===ja)return o===ut?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC}else return null;if(n===Ka||n===qa||n===Ya||n===$a||n===Za||n===Ja||n===Qa||n===ec||n===tc||n===nc||n===ic||n===sc||n===rc||n===oc)if(r=e.get("WEBGL_compressed_texture_astc"),r!==null){if(n===Ka)return o===ut?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===qa)return o===ut?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===Ya)return o===ut?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===$a)return o===ut?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===Za)return o===ut?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===Ja)return o===ut?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===Qa)return o===ut?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===ec)return o===ut?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===tc)return o===ut?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===nc)return o===ut?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===ic)return o===ut?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===sc)return o===ut?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===rc)return o===ut?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===oc)return o===ut?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===io||n===ac||n===cc)if(r=e.get("EXT_texture_compression_bptc"),r!==null){if(n===io)return o===ut?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===ac)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===cc)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===Oh||n===lc||n===uc||n===hc)if(r=e.get("EXT_texture_compression_rgtc"),r!==null){if(n===io)return r.COMPRESSED_RED_RGTC1_EXT;if(n===lc)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===uc)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===hc)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===rr?i.UNSIGNED_INT_24_8:i[n]!==void 0?i[n]:null}return{convert:t}}const ty=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,ny=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`;class iy{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t,n){if(this.texture===null){const s=new Ct,r=e.properties.get(s);r.__webglTexture=t.texture,(t.depthNear!==n.depthNear||t.depthFar!==n.depthFar)&&(this.depthNear=t.depthNear,this.depthFar=t.depthFar),this.texture=s}}getMesh(e){if(this.texture!==null&&this.mesh===null){const t=e.cameras[0].viewport,n=new gi({vertexShader:ty,fragmentShader:ny,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new dt(new Dn(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class sy extends _i{constructor(e,t){super();const n=this;let s=null,r=1,o=null,a="local-floor",c=1,l=null,u=null,h=null,d=null,p=null,g=null;const _=new iy,m=t.getContextAttributes();let f=null,y=null;const x=[],v=[],A=new we;let w=null;const R=new Xt;R.viewport=new rt;const C=new Xt;C.viewport=new rt;const S=[R,C],M=new ug;let T=null,D=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(j){let se=x[j];return se===void 0&&(se=new Jo,x[j]=se),se.getTargetRaySpace()},this.getControllerGrip=function(j){let se=x[j];return se===void 0&&(se=new Jo,x[j]=se),se.getGripSpace()},this.getHand=function(j){let se=x[j];return se===void 0&&(se=new Jo,x[j]=se),se.getHandSpace()};function P(j){const se=v.indexOf(j.inputSource);if(se===-1)return;const _e=x[se];_e!==void 0&&(_e.update(j.inputSource,j.frame,l||o),_e.dispatchEvent({type:j.type,data:j.inputSource}))}function O(){s.removeEventListener("select",P),s.removeEventListener("selectstart",P),s.removeEventListener("selectend",P),s.removeEventListener("squeeze",P),s.removeEventListener("squeezestart",P),s.removeEventListener("squeezeend",P),s.removeEventListener("end",O),s.removeEventListener("inputsourceschange",z);for(let j=0;j<x.length;j++){const se=v[j];se!==null&&(v[j]=null,x[j].disconnect(se))}T=null,D=null,_.reset(),e.setRenderTarget(f),p=null,d=null,h=null,s=null,y=null,Fe.stop(),n.isPresenting=!1,e.setPixelRatio(w),e.setSize(A.width,A.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(j){r=j,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(j){a=j,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return l||o},this.setReferenceSpace=function(j){l=j},this.getBaseLayer=function(){return d!==null?d:p},this.getBinding=function(){return h},this.getFrame=function(){return g},this.getSession=function(){return s},this.setSession=async function(j){if(s=j,s!==null){if(f=e.getRenderTarget(),s.addEventListener("select",P),s.addEventListener("selectstart",P),s.addEventListener("selectend",P),s.addEventListener("squeeze",P),s.addEventListener("squeezestart",P),s.addEventListener("squeezeend",P),s.addEventListener("end",O),s.addEventListener("inputsourceschange",z),m.xrCompatible!==!0&&await t.makeXRCompatible(),w=e.getPixelRatio(),e.getSize(A),typeof XRWebGLBinding<"u"&&"createProjectionLayer"in XRWebGLBinding.prototype){let _e=null,ce=null,Ee=null;m.depth&&(Ee=m.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,_e=m.stencil?ar:or,ce=m.stencil?rr:Ui);const Ze={colorFormat:t.RGBA8,depthFormat:Ee,scaleFactor:r};h=new XRWebGLBinding(s,t),d=h.createProjectionLayer(Ze),s.updateRenderState({layers:[d]}),e.setPixelRatio(1),e.setSize(d.textureWidth,d.textureHeight,!1),y=new Oi(d.textureWidth,d.textureHeight,{format:gn,type:Pn,depthTexture:new nd(d.textureWidth,d.textureHeight,ce,void 0,void 0,void 0,void 0,void 0,void 0,_e),stencilBuffer:m.stencil,colorSpace:e.outputColorSpace,samples:m.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1})}else{const _e={antialias:m.antialias,alpha:!0,depth:m.depth,stencil:m.stencil,framebufferScaleFactor:r};p=new XRWebGLLayer(s,t,_e),s.updateRenderState({baseLayer:p}),e.setPixelRatio(1),e.setSize(p.framebufferWidth,p.framebufferHeight,!1),y=new Oi(p.framebufferWidth,p.framebufferHeight,{format:gn,type:Pn,colorSpace:e.outputColorSpace,stencilBuffer:m.stencil,resolveDepthBuffer:p.ignoreDepthValues===!1,resolveStencilBuffer:p.ignoreDepthValues===!1})}y.isXRRenderTarget=!0,this.setFoveation(c),l=null,o=await s.requestReferenceSpace(a),Fe.setContext(s),Fe.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode},this.getDepthTexture=function(){return _.getDepthTexture()};function z(j){for(let se=0;se<j.removed.length;se++){const _e=j.removed[se],ce=v.indexOf(_e);ce>=0&&(v[ce]=null,x[ce].disconnect(_e))}for(let se=0;se<j.added.length;se++){const _e=j.added[se];let ce=v.indexOf(_e);if(ce===-1){for(let Ze=0;Ze<x.length;Ze++)if(Ze>=v.length){v.push(_e),ce=Ze;break}else if(v[Ze]===null){v[Ze]=_e,ce=Ze;break}if(ce===-1)break}const Ee=x[ce];Ee&&Ee.connect(_e)}}const F=new N,X=new N;function V(j,se,_e){F.setFromMatrixPosition(se.matrixWorld),X.setFromMatrixPosition(_e.matrixWorld);const ce=F.distanceTo(X),Ee=se.projectionMatrix.elements,Ze=_e.projectionMatrix.elements,Re=Ee[14]/(Ee[10]-1),ct=Ee[14]/(Ee[10]+1),it=(Ee[9]+1)/Ee[5],Je=(Ee[9]-1)/Ee[5],L=(Ee[8]-1)/Ee[0],bt=(Ze[8]+1)/Ze[0],Qe=Re*L,nt=Re*bt,xe=ce/(-L+bt),qe=xe*-L;if(se.matrixWorld.decompose(j.position,j.quaternion,j.scale),j.translateX(qe),j.translateZ(xe),j.matrixWorld.compose(j.position,j.quaternion,j.scale),j.matrixWorldInverse.copy(j.matrixWorld).invert(),Ee[10]===-1)j.projectionMatrix.copy(se.projectionMatrix),j.projectionMatrixInverse.copy(se.projectionMatrixInverse);else{const Ce=Re+xe,Ve=ct+xe,Et=Qe-qe,I=nt+(ce-qe),E=it*ct/Ve*Ce,k=Je*ct/Ve*Ce;j.projectionMatrix.makePerspective(Et,I,E,k,Ce,Ve),j.projectionMatrixInverse.copy(j.projectionMatrix).invert()}}function ee(j,se){se===null?j.matrixWorld.copy(j.matrix):j.matrixWorld.multiplyMatrices(se.matrixWorld,j.matrix),j.matrixWorldInverse.copy(j.matrixWorld).invert()}this.updateCamera=function(j){if(s===null)return;let se=j.near,_e=j.far;_.texture!==null&&(_.depthNear>0&&(se=_.depthNear),_.depthFar>0&&(_e=_.depthFar)),M.near=C.near=R.near=se,M.far=C.far=R.far=_e,(T!==M.near||D!==M.far)&&(s.updateRenderState({depthNear:M.near,depthFar:M.far}),T=M.near,D=M.far),R.layers.mask=j.layers.mask|2,C.layers.mask=j.layers.mask|4,M.layers.mask=R.layers.mask|C.layers.mask;const ce=j.parent,Ee=M.cameras;ee(M,ce);for(let Ze=0;Ze<Ee.length;Ze++)ee(Ee[Ze],ce);Ee.length===2?V(M,R,C):M.projectionMatrix.copy(R.projectionMatrix),re(j,M,ce)};function re(j,se,_e){_e===null?j.matrix.copy(se.matrixWorld):(j.matrix.copy(_e.matrixWorld),j.matrix.invert(),j.matrix.multiply(se.matrixWorld)),j.matrix.decompose(j.position,j.quaternion,j.scale),j.updateMatrixWorld(!0),j.projectionMatrix.copy(se.projectionMatrix),j.projectionMatrixInverse.copy(se.projectionMatrixInverse),j.isPerspectiveCamera&&(j.fov=ys*2*Math.atan(1/j.projectionMatrix.elements[5]),j.zoom=1)}this.getCamera=function(){return M},this.getFoveation=function(){if(!(d===null&&p===null))return c},this.setFoveation=function(j){c=j,d!==null&&(d.fixedFoveation=j),p!==null&&p.fixedFoveation!==void 0&&(p.fixedFoveation=j)},this.hasDepthSensing=function(){return _.texture!==null},this.getDepthSensingMesh=function(){return _.getMesh(M)};let ne=null;function Te(j,se){if(u=se.getViewerPose(l||o),g=se,u!==null){const _e=u.views;p!==null&&(e.setRenderTargetFramebuffer(y,p.framebuffer),e.setRenderTarget(y));let ce=!1;_e.length!==M.cameras.length&&(M.cameras.length=0,ce=!0);for(let Re=0;Re<_e.length;Re++){const ct=_e[Re];let it=null;if(p!==null)it=p.getViewport(ct);else{const L=h.getViewSubImage(d,ct);it=L.viewport,Re===0&&(e.setRenderTargetTextures(y,L.colorTexture,L.depthStencilTexture),e.setRenderTarget(y))}let Je=S[Re];Je===void 0&&(Je=new Xt,Je.layers.enable(Re),Je.viewport=new rt,S[Re]=Je),Je.matrix.fromArray(ct.transform.matrix),Je.matrix.decompose(Je.position,Je.quaternion,Je.scale),Je.projectionMatrix.fromArray(ct.projectionMatrix),Je.projectionMatrixInverse.copy(Je.projectionMatrix).invert(),Je.viewport.set(it.x,it.y,it.width,it.height),Re===0&&(M.matrix.copy(Je.matrix),M.matrix.decompose(M.position,M.quaternion,M.scale)),ce===!0&&M.cameras.push(Je)}const Ee=s.enabledFeatures;if(Ee&&Ee.includes("depth-sensing")&&s.depthUsage=="gpu-optimized"&&h){const Re=h.getDepthInformation(_e[0]);Re&&Re.isValid&&Re.texture&&_.init(e,Re,s.renderState)}}for(let _e=0;_e<x.length;_e++){const ce=v[_e],Ee=x[_e];ce!==null&&Ee!==void 0&&Ee.update(ce,se,l||o)}ne&&ne(j,se),se.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:se}),g=null}const Fe=new cd;Fe.setAnimationLoop(Te),this.setAnimationLoop=function(j){ne=j},this.dispose=function(){}}}const Ai=new Ln,ry=new He;function oy(i,e){function t(m,f){m.matrixAutoUpdate===!0&&m.updateMatrix(),f.value.copy(m.matrix)}function n(m,f){f.color.getRGB(m.fogColor.value,jh(i)),f.isFog?(m.fogNear.value=f.near,m.fogFar.value=f.far):f.isFogExp2&&(m.fogDensity.value=f.density)}function s(m,f,y,x,v){f.isMeshBasicMaterial||f.isMeshLambertMaterial?r(m,f):f.isMeshToonMaterial?(r(m,f),h(m,f)):f.isMeshPhongMaterial?(r(m,f),u(m,f)):f.isMeshStandardMaterial?(r(m,f),d(m,f),f.isMeshPhysicalMaterial&&p(m,f,v)):f.isMeshMatcapMaterial?(r(m,f),g(m,f)):f.isMeshDepthMaterial?r(m,f):f.isMeshDistanceMaterial?(r(m,f),_(m,f)):f.isMeshNormalMaterial?r(m,f):f.isLineBasicMaterial?(o(m,f),f.isLineDashedMaterial&&a(m,f)):f.isPointsMaterial?c(m,f,y,x):f.isSpriteMaterial?l(m,f):f.isShadowMaterial?(m.color.value.copy(f.color),m.opacity.value=f.opacity):f.isShaderMaterial&&(f.uniformsNeedUpdate=!1)}function r(m,f){m.opacity.value=f.opacity,f.color&&m.diffuse.value.copy(f.color),f.emissive&&m.emissive.value.copy(f.emissive).multiplyScalar(f.emissiveIntensity),f.map&&(m.map.value=f.map,t(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,t(f.alphaMap,m.alphaMapTransform)),f.bumpMap&&(m.bumpMap.value=f.bumpMap,t(f.bumpMap,m.bumpMapTransform),m.bumpScale.value=f.bumpScale,f.side===Zt&&(m.bumpScale.value*=-1)),f.normalMap&&(m.normalMap.value=f.normalMap,t(f.normalMap,m.normalMapTransform),m.normalScale.value.copy(f.normalScale),f.side===Zt&&m.normalScale.value.negate()),f.displacementMap&&(m.displacementMap.value=f.displacementMap,t(f.displacementMap,m.displacementMapTransform),m.displacementScale.value=f.displacementScale,m.displacementBias.value=f.displacementBias),f.emissiveMap&&(m.emissiveMap.value=f.emissiveMap,t(f.emissiveMap,m.emissiveMapTransform)),f.specularMap&&(m.specularMap.value=f.specularMap,t(f.specularMap,m.specularMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest);const y=e.get(f),x=y.envMap,v=y.envMapRotation;x&&(m.envMap.value=x,Ai.copy(v),Ai.x*=-1,Ai.y*=-1,Ai.z*=-1,x.isCubeTexture&&x.isRenderTargetTexture===!1&&(Ai.y*=-1,Ai.z*=-1),m.envMapRotation.value.setFromMatrix4(ry.makeRotationFromEuler(Ai)),m.flipEnvMap.value=x.isCubeTexture&&x.isRenderTargetTexture===!1?-1:1,m.reflectivity.value=f.reflectivity,m.ior.value=f.ior,m.refractionRatio.value=f.refractionRatio),f.lightMap&&(m.lightMap.value=f.lightMap,m.lightMapIntensity.value=f.lightMapIntensity,t(f.lightMap,m.lightMapTransform)),f.aoMap&&(m.aoMap.value=f.aoMap,m.aoMapIntensity.value=f.aoMapIntensity,t(f.aoMap,m.aoMapTransform))}function o(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,f.map&&(m.map.value=f.map,t(f.map,m.mapTransform))}function a(m,f){m.dashSize.value=f.dashSize,m.totalSize.value=f.dashSize+f.gapSize,m.scale.value=f.scale}function c(m,f,y,x){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.size.value=f.size*y,m.scale.value=x*.5,f.map&&(m.map.value=f.map,t(f.map,m.uvTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,t(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function l(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.rotation.value=f.rotation,f.map&&(m.map.value=f.map,t(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,t(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function u(m,f){m.specular.value.copy(f.specular),m.shininess.value=Math.max(f.shininess,1e-4)}function h(m,f){f.gradientMap&&(m.gradientMap.value=f.gradientMap)}function d(m,f){m.metalness.value=f.metalness,f.metalnessMap&&(m.metalnessMap.value=f.metalnessMap,t(f.metalnessMap,m.metalnessMapTransform)),m.roughness.value=f.roughness,f.roughnessMap&&(m.roughnessMap.value=f.roughnessMap,t(f.roughnessMap,m.roughnessMapTransform)),f.envMap&&(m.envMapIntensity.value=f.envMapIntensity)}function p(m,f,y){m.ior.value=f.ior,f.sheen>0&&(m.sheenColor.value.copy(f.sheenColor).multiplyScalar(f.sheen),m.sheenRoughness.value=f.sheenRoughness,f.sheenColorMap&&(m.sheenColorMap.value=f.sheenColorMap,t(f.sheenColorMap,m.sheenColorMapTransform)),f.sheenRoughnessMap&&(m.sheenRoughnessMap.value=f.sheenRoughnessMap,t(f.sheenRoughnessMap,m.sheenRoughnessMapTransform))),f.clearcoat>0&&(m.clearcoat.value=f.clearcoat,m.clearcoatRoughness.value=f.clearcoatRoughness,f.clearcoatMap&&(m.clearcoatMap.value=f.clearcoatMap,t(f.clearcoatMap,m.clearcoatMapTransform)),f.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=f.clearcoatRoughnessMap,t(f.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),f.clearcoatNormalMap&&(m.clearcoatNormalMap.value=f.clearcoatNormalMap,t(f.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(f.clearcoatNormalScale),f.side===Zt&&m.clearcoatNormalScale.value.negate())),f.dispersion>0&&(m.dispersion.value=f.dispersion),f.iridescence>0&&(m.iridescence.value=f.iridescence,m.iridescenceIOR.value=f.iridescenceIOR,m.iridescenceThicknessMinimum.value=f.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=f.iridescenceThicknessRange[1],f.iridescenceMap&&(m.iridescenceMap.value=f.iridescenceMap,t(f.iridescenceMap,m.iridescenceMapTransform)),f.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=f.iridescenceThicknessMap,t(f.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),f.transmission>0&&(m.transmission.value=f.transmission,m.transmissionSamplerMap.value=y.texture,m.transmissionSamplerSize.value.set(y.width,y.height),f.transmissionMap&&(m.transmissionMap.value=f.transmissionMap,t(f.transmissionMap,m.transmissionMapTransform)),m.thickness.value=f.thickness,f.thicknessMap&&(m.thicknessMap.value=f.thicknessMap,t(f.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=f.attenuationDistance,m.attenuationColor.value.copy(f.attenuationColor)),f.anisotropy>0&&(m.anisotropyVector.value.set(f.anisotropy*Math.cos(f.anisotropyRotation),f.anisotropy*Math.sin(f.anisotropyRotation)),f.anisotropyMap&&(m.anisotropyMap.value=f.anisotropyMap,t(f.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=f.specularIntensity,m.specularColor.value.copy(f.specularColor),f.specularColorMap&&(m.specularColorMap.value=f.specularColorMap,t(f.specularColorMap,m.specularColorMapTransform)),f.specularIntensityMap&&(m.specularIntensityMap.value=f.specularIntensityMap,t(f.specularIntensityMap,m.specularIntensityMapTransform))}function g(m,f){f.matcap&&(m.matcap.value=f.matcap)}function _(m,f){const y=e.get(f).light;m.referencePosition.value.setFromMatrixPosition(y.matrixWorld),m.nearDistance.value=y.shadow.camera.near,m.farDistance.value=y.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:s}}function ay(i,e,t,n){let s={},r={},o=[];const a=i.getParameter(i.MAX_UNIFORM_BUFFER_BINDINGS);function c(y,x){const v=x.program;n.uniformBlockBinding(y,v)}function l(y,x){let v=s[y.id];v===void 0&&(g(y),v=u(y),s[y.id]=v,y.addEventListener("dispose",m));const A=x.program;n.updateUBOMapping(y,A);const w=e.render.frame;r[y.id]!==w&&(d(y),r[y.id]=w)}function u(y){const x=h();y.__bindingPointIndex=x;const v=i.createBuffer(),A=y.__size,w=y.usage;return i.bindBuffer(i.UNIFORM_BUFFER,v),i.bufferData(i.UNIFORM_BUFFER,A,w),i.bindBuffer(i.UNIFORM_BUFFER,null),i.bindBufferBase(i.UNIFORM_BUFFER,x,v),v}function h(){for(let y=0;y<a;y++)if(o.indexOf(y)===-1)return o.push(y),y;return console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function d(y){const x=s[y.id],v=y.uniforms,A=y.__cache;i.bindBuffer(i.UNIFORM_BUFFER,x);for(let w=0,R=v.length;w<R;w++){const C=Array.isArray(v[w])?v[w]:[v[w]];for(let S=0,M=C.length;S<M;S++){const T=C[S];if(p(T,w,S,A)===!0){const D=T.__offset,P=Array.isArray(T.value)?T.value:[T.value];let O=0;for(let z=0;z<P.length;z++){const F=P[z],X=_(F);typeof F=="number"||typeof F=="boolean"?(T.__data[0]=F,i.bufferSubData(i.UNIFORM_BUFFER,D+O,T.__data)):F.isMatrix3?(T.__data[0]=F.elements[0],T.__data[1]=F.elements[1],T.__data[2]=F.elements[2],T.__data[3]=0,T.__data[4]=F.elements[3],T.__data[5]=F.elements[4],T.__data[6]=F.elements[5],T.__data[7]=0,T.__data[8]=F.elements[6],T.__data[9]=F.elements[7],T.__data[10]=F.elements[8],T.__data[11]=0):(F.toArray(T.__data,O),O+=X.storage/Float32Array.BYTES_PER_ELEMENT)}i.bufferSubData(i.UNIFORM_BUFFER,D,T.__data)}}}i.bindBuffer(i.UNIFORM_BUFFER,null)}function p(y,x,v,A){const w=y.value,R=x+"_"+v;if(A[R]===void 0)return typeof w=="number"||typeof w=="boolean"?A[R]=w:A[R]=w.clone(),!0;{const C=A[R];if(typeof w=="number"||typeof w=="boolean"){if(C!==w)return A[R]=w,!0}else if(C.equals(w)===!1)return C.copy(w),!0}return!1}function g(y){const x=y.uniforms;let v=0;const A=16;for(let R=0,C=x.length;R<C;R++){const S=Array.isArray(x[R])?x[R]:[x[R]];for(let M=0,T=S.length;M<T;M++){const D=S[M],P=Array.isArray(D.value)?D.value:[D.value];for(let O=0,z=P.length;O<z;O++){const F=P[O],X=_(F),V=v%A,ee=V%X.boundary,re=V+ee;v+=ee,re!==0&&A-re<X.storage&&(v+=A-re),D.__data=new Float32Array(X.storage/Float32Array.BYTES_PER_ELEMENT),D.__offset=v,v+=X.storage}}}const w=v%A;return w>0&&(v+=A-w),y.__size=v,y.__cache={},this}function _(y){const x={boundary:0,storage:0};return typeof y=="number"||typeof y=="boolean"?(x.boundary=4,x.storage=4):y.isVector2?(x.boundary=8,x.storage=8):y.isVector3||y.isColor?(x.boundary=16,x.storage=12):y.isVector4?(x.boundary=16,x.storage=16):y.isMatrix3?(x.boundary=48,x.storage=48):y.isMatrix4?(x.boundary=64,x.storage=64):y.isTexture?console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group."):console.warn("THREE.WebGLRenderer: Unsupported uniform value type.",y),x}function m(y){const x=y.target;x.removeEventListener("dispose",m);const v=o.indexOf(x.__bindingPointIndex);o.splice(v,1),i.deleteBuffer(s[x.id]),delete s[x.id],delete r[x.id]}function f(){for(const y in s)i.deleteBuffer(s[y]);o=[],s={},r={}}return{bind:c,update:l,dispose:f}}class cy{constructor(e={}){const{canvas:t=rm(),context:n=null,depth:s=!0,stencil:r=!1,alpha:o=!1,antialias:a=!1,premultipliedAlpha:c=!0,preserveDrawingBuffer:l=!1,powerPreference:u="default",failIfMajorPerformanceCaveat:h=!1,reverseDepthBuffer:d=!1}=e;this.isWebGLRenderer=!0;let p;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");p=n.getContextAttributes().alpha}else p=o;const g=new Uint32Array(4),_=new Int32Array(4);let m=null,f=null;const y=[],x=[];this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=pi,this.toneMappingExposure=1,this.transmissionResolutionScale=1;const v=this;let A=!1;this._outputColorSpace=wt;let w=0,R=0,C=null,S=-1,M=null;const T=new rt,D=new rt;let P=null;const O=new Ne(0);let z=0,F=t.width,X=t.height,V=1,ee=null,re=null;const ne=new rt(0,0,F,X),Te=new rt(0,0,F,X);let Fe=!1;const j=new Gc;let se=!1,_e=!1;const ce=new He,Ee=new He,Ze=new N,Re=new rt,ct={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let it=!1;function Je(){return C===null?V:1}let L=n;function bt(b,B){return t.getContext(b,B)}try{const b={alpha:!0,depth:s,stencil:r,antialias:a,premultipliedAlpha:c,preserveDrawingBuffer:l,powerPreference:u,failIfMajorPerformanceCaveat:h};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${Cc}`),t.addEventListener("webglcontextlost",ve,!1),t.addEventListener("webglcontextrestored",te,!1),t.addEventListener("webglcontextcreationerror",Y,!1),L===null){const B="webgl2";if(L=bt(B,b),L===null)throw bt(B)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(b){throw console.error("THREE.WebGLRenderer: "+b.message),b}let Qe,nt,xe,qe,Ce,Ve,Et,I,E,k,q,Z,K,be,oe,ge,Ae,J,pe,he,Le,ae,Ue,U;function le(){Qe=new xx(L),Qe.init(),ae=new ey(L,Qe),nt=new hx(L,Qe,e,ae),xe=new Jv(L,Qe),nt.reverseDepthBuffer&&d&&xe.buffers.depth.setReversed(!0),qe=new Mx(L),Ce=new Bv,Ve=new Qv(L,Qe,xe,Ce,nt,ae,qe),Et=new fx(v),I=new _x(v),E=new wg(L),Ue=new lx(L,E),k=new vx(L,E,qe,Ue),q=new Sx(L,k,E,qe),pe=new Ex(L,nt,Ve),ge=new dx(Ce),Z=new kv(v,Et,I,Qe,nt,Ue,ge),K=new oy(v,Ce),be=new Hv,oe=new Kv(Qe),J=new cx(v,Et,I,xe,q,p,c),Ae=new $v(v,q,nt),U=new ay(L,qe,nt,xe),he=new ux(L,Qe,qe),Le=new yx(L,Qe,qe),qe.programs=Z.programs,v.capabilities=nt,v.extensions=Qe,v.properties=Ce,v.renderLists=be,v.shadowMap=Ae,v.state=xe,v.info=qe}le();const Q=new sy(v,L);this.xr=Q,this.getContext=function(){return L},this.getContextAttributes=function(){return L.getContextAttributes()},this.forceContextLoss=function(){const b=Qe.get("WEBGL_lose_context");b&&b.loseContext()},this.forceContextRestore=function(){const b=Qe.get("WEBGL_lose_context");b&&b.restoreContext()},this.getPixelRatio=function(){return V},this.setPixelRatio=function(b){b!==void 0&&(V=b,this.setSize(F,X,!1))},this.getSize=function(b){return b.set(F,X)},this.setSize=function(b,B,G=!0){if(Q.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}F=b,X=B,t.width=Math.floor(b*V),t.height=Math.floor(B*V),G===!0&&(t.style.width=b+"px",t.style.height=B+"px"),this.setViewport(0,0,b,B)},this.getDrawingBufferSize=function(b){return b.set(F*V,X*V).floor()},this.setDrawingBufferSize=function(b,B,G){F=b,X=B,V=G,t.width=Math.floor(b*G),t.height=Math.floor(B*G),this.setViewport(0,0,b,B)},this.getCurrentViewport=function(b){return b.copy(T)},this.getViewport=function(b){return b.copy(ne)},this.setViewport=function(b,B,G,W){b.isVector4?ne.set(b.x,b.y,b.z,b.w):ne.set(b,B,G,W),xe.viewport(T.copy(ne).multiplyScalar(V).round())},this.getScissor=function(b){return b.copy(Te)},this.setScissor=function(b,B,G,W){b.isVector4?Te.set(b.x,b.y,b.z,b.w):Te.set(b,B,G,W),xe.scissor(D.copy(Te).multiplyScalar(V).round())},this.getScissorTest=function(){return Fe},this.setScissorTest=function(b){xe.setScissorTest(Fe=b)},this.setOpaqueSort=function(b){ee=b},this.setTransparentSort=function(b){re=b},this.getClearColor=function(b){return b.copy(J.getClearColor())},this.setClearColor=function(){J.setClearColor(...arguments)},this.getClearAlpha=function(){return J.getClearAlpha()},this.setClearAlpha=function(){J.setClearAlpha(...arguments)},this.clear=function(b=!0,B=!0,G=!0){let W=0;if(b){let H=!1;if(C!==null){const ie=C.texture.format;H=ie===Oc||ie===Uc||ie===Nc}if(H){const ie=C.texture.type,de=ie===Pn||ie===Ui||ie===sr||ie===rr||ie===Pc||ie===Lc,Se=J.getClearColor(),ye=J.getClearAlpha(),ke=Se.r,ze=Se.g,Pe=Se.b;de?(g[0]=ke,g[1]=ze,g[2]=Pe,g[3]=ye,L.clearBufferuiv(L.COLOR,0,g)):(_[0]=ke,_[1]=ze,_[2]=Pe,_[3]=ye,L.clearBufferiv(L.COLOR,0,_))}else W|=L.COLOR_BUFFER_BIT}B&&(W|=L.DEPTH_BUFFER_BIT),G&&(W|=L.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),L.clear(W)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){t.removeEventListener("webglcontextlost",ve,!1),t.removeEventListener("webglcontextrestored",te,!1),t.removeEventListener("webglcontextcreationerror",Y,!1),J.dispose(),be.dispose(),oe.dispose(),Ce.dispose(),Et.dispose(),I.dispose(),q.dispose(),Ue.dispose(),U.dispose(),Z.dispose(),Q.dispose(),Q.removeEventListener("sessionstart",Is),Q.removeEventListener("sessionend",Fi),Rn.stop()};function ve(b){b.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),A=!0}function te(){console.log("THREE.WebGLRenderer: Context Restored."),A=!1;const b=qe.autoReset,B=Ae.enabled,G=Ae.autoUpdate,W=Ae.needsUpdate,H=Ae.type;le(),qe.autoReset=b,Ae.enabled=B,Ae.autoUpdate=G,Ae.needsUpdate=W,Ae.type=H}function Y(b){console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ",b.statusMessage)}function Me(b){const B=b.target;B.removeEventListener("dispose",Me),$(B)}function $(b){me(b),Ce.remove(b)}function me(b){const B=Ce.get(b).programs;B!==void 0&&(B.forEach(function(G){Z.releaseProgram(G)}),b.isShaderMaterial&&Z.releaseShaderCache(b))}this.renderBufferDirect=function(b,B,G,W,H,ie){B===null&&(B=ct);const de=H.isMesh&&H.matrixWorld.determinant()<0,Se=Qn(b,B,G,W,H);xe.setMaterial(W,de);let ye=G.index,ke=1;if(W.wireframe===!0){if(ye=k.getWireframeAttribute(G),ye===void 0)return;ke=2}const ze=G.drawRange,Pe=G.attributes.position;let $e=ze.start*ke,lt=(ze.start+ze.count)*ke;ie!==null&&($e=Math.max($e,ie.start*ke),lt=Math.min(lt,(ie.start+ie.count)*ke)),ye!==null?($e=Math.max($e,0),lt=Math.min(lt,ye.count)):Pe!=null&&($e=Math.max($e,0),lt=Math.min(lt,Pe.count));const Tt=lt-$e;if(Tt<0||Tt===1/0)return;Ue.setup(H,W,Se,G,ye);let gt,ft=he;if(ye!==null&&(gt=E.get(ye),ft=Le,ft.setIndex(gt)),H.isMesh)W.wireframe===!0?(xe.setLineWidth(W.wireframeLinewidth*Je()),ft.setMode(L.LINES)):ft.setMode(L.TRIANGLES);else if(H.isLine){let De=W.linewidth;De===void 0&&(De=1),xe.setLineWidth(De*Je()),H.isLineSegments?ft.setMode(L.LINES):H.isLineLoop?ft.setMode(L.LINE_LOOP):ft.setMode(L.LINE_STRIP)}else H.isPoints?ft.setMode(L.POINTS):H.isSprite&&ft.setMode(L.TRIANGLES);if(H.isBatchedMesh)if(H._multiDrawInstances!==null)fs("THREE.WebGLRenderer: renderMultiDrawInstances has been deprecated and will be removed in r184. Append to renderMultiDraw arguments and use indirection."),ft.renderMultiDrawInstances(H._multiDrawStarts,H._multiDrawCounts,H._multiDrawCount,H._multiDrawInstances);else if(Qe.get("WEBGL_multi_draw"))ft.renderMultiDraw(H._multiDrawStarts,H._multiDrawCounts,H._multiDrawCount);else{const De=H._multiDrawStarts,St=H._multiDrawCounts,st=H._multiDrawCount,Jt=ye?E.get(ye).bytesPerElement:1,ki=Ce.get(W).currentProgram.getUniforms();for(let Qt=0;Qt<st;Qt++)ki.setValue(L,"_gl_DrawID",Qt),ft.render(De[Qt]/Jt,St[Qt])}else if(H.isInstancedMesh)ft.renderInstances($e,Tt,H.count);else if(G.isInstancedBufferGeometry){const De=G._maxInstanceCount!==void 0?G._maxInstanceCount:1/0,St=Math.min(G.instanceCount,De);ft.renderInstances($e,Tt,St)}else ft.render($e,Tt)};function Oe(b,B,G){b.transparent===!0&&b.side===sn&&b.forceSinglePass===!1?(b.side=Zt,b.needsUpdate=!0,Ie(b,B,G),b.side=Jn,b.needsUpdate=!0,Ie(b,B,G),b.side=sn):Ie(b,B,G)}this.compile=function(b,B,G=null){G===null&&(G=b),f=oe.get(G),f.init(B),x.push(f),G.traverseVisible(function(H){H.isLight&&H.layers.test(B.layers)&&(f.pushLight(H),H.castShadow&&f.pushShadow(H))}),b!==G&&b.traverseVisible(function(H){H.isLight&&H.layers.test(B.layers)&&(f.pushLight(H),H.castShadow&&f.pushShadow(H))}),f.setupLights();const W=new Set;return b.traverse(function(H){if(!(H.isMesh||H.isPoints||H.isLine||H.isSprite))return;const ie=H.material;if(ie)if(Array.isArray(ie))for(let de=0;de<ie.length;de++){const Se=ie[de];Oe(Se,G,H),W.add(Se)}else Oe(ie,G,H),W.add(ie)}),f=x.pop(),W},this.compileAsync=function(b,B,G=null){const W=this.compile(b,B,G);return new Promise(H=>{function ie(){if(W.forEach(function(de){Ce.get(de).currentProgram.isReady()&&W.delete(de)}),W.size===0){H(b);return}setTimeout(ie,10)}Qe.get("KHR_parallel_shader_compile")!==null?ie():setTimeout(ie,10)})};let mt=null;function Ut(b){mt&&mt(b)}function Is(){Rn.stop()}function Fi(){Rn.start()}const Rn=new cd;Rn.setAnimationLoop(Ut),typeof self<"u"&&Rn.setContext(self),this.setAnimationLoop=function(b){mt=b,Q.setAnimationLoop(b),b===null?Rn.stop():Rn.start()},Q.addEventListener("sessionstart",Is),Q.addEventListener("sessionend",Fi),this.render=function(b,B){if(B!==void 0&&B.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(A===!0)return;if(b.matrixWorldAutoUpdate===!0&&b.updateMatrixWorld(),B.parent===null&&B.matrixWorldAutoUpdate===!0&&B.updateMatrixWorld(),Q.enabled===!0&&Q.isPresenting===!0&&(Q.cameraAutoUpdate===!0&&Q.updateCamera(B),B=Q.getCamera()),b.isScene===!0&&b.onBeforeRender(v,b,B,C),f=oe.get(b,x.length),f.init(B),x.push(f),Ee.multiplyMatrices(B.projectionMatrix,B.matrixWorldInverse),j.setFromProjectionMatrix(Ee),_e=this.localClippingEnabled,se=ge.init(this.clippingPlanes,_e),m=be.get(b,y.length),m.init(),y.push(m),Q.enabled===!0&&Q.isPresenting===!0){const ie=v.xr.getDepthSensingMesh();ie!==null&&xi(ie,B,-1/0,v.sortObjects)}xi(b,B,0,v.sortObjects),m.finish(),v.sortObjects===!0&&m.sort(ee,re),it=Q.enabled===!1||Q.isPresenting===!1||Q.hasDepthSensing()===!1,it&&J.addToRenderList(m,b),this.info.render.frame++,se===!0&&ge.beginShadows();const G=f.state.shadowsArray;Ae.render(G,b,B),se===!0&&ge.endShadows(),this.info.autoReset===!0&&this.info.reset();const W=m.opaque,H=m.transmissive;if(f.setupLights(),B.isArrayCamera){const ie=B.cameras;if(H.length>0)for(let de=0,Se=ie.length;de<Se;de++){const ye=ie[de];_r(W,H,b,ye)}it&&J.render(b);for(let de=0,Se=ie.length;de<Se;de++){const ye=ie[de];gr(m,b,ye,ye.viewport)}}else H.length>0&&_r(W,H,b,B),it&&J.render(b),gr(m,b,B);C!==null&&R===0&&(Ve.updateMultisampleRenderTarget(C),Ve.updateRenderTargetMipmap(C)),b.isScene===!0&&b.onAfterRender(v,b,B),Ue.resetDefaultState(),S=-1,M=null,x.pop(),x.length>0?(f=x[x.length-1],se===!0&&ge.setGlobalState(v.clippingPlanes,f.state.camera)):f=null,y.pop(),y.length>0?m=y[y.length-1]:m=null};function xi(b,B,G,W){if(b.visible===!1)return;if(b.layers.test(B.layers)){if(b.isGroup)G=b.renderOrder;else if(b.isLOD)b.autoUpdate===!0&&b.update(B);else if(b.isLight)f.pushLight(b),b.castShadow&&f.pushShadow(b);else if(b.isSprite){if(!b.frustumCulled||j.intersectsSprite(b)){W&&Re.setFromMatrixPosition(b.matrixWorld).applyMatrix4(Ee);const de=q.update(b),Se=b.material;Se.visible&&m.push(b,de,Se,G,Re.z,null)}}else if((b.isMesh||b.isLine||b.isPoints)&&(!b.frustumCulled||j.intersectsObject(b))){const de=q.update(b),Se=b.material;if(W&&(b.boundingSphere!==void 0?(b.boundingSphere===null&&b.computeBoundingSphere(),Re.copy(b.boundingSphere.center)):(de.boundingSphere===null&&de.computeBoundingSphere(),Re.copy(de.boundingSphere.center)),Re.applyMatrix4(b.matrixWorld).applyMatrix4(Ee)),Array.isArray(Se)){const ye=de.groups;for(let ke=0,ze=ye.length;ke<ze;ke++){const Pe=ye[ke],$e=Se[Pe.materialIndex];$e&&$e.visible&&m.push(b,de,$e,G,Re.z,Pe)}}else Se.visible&&m.push(b,de,Se,G,Re.z,null)}}const ie=b.children;for(let de=0,Se=ie.length;de<Se;de++)xi(ie[de],B,G,W)}function gr(b,B,G,W){const H=b.opaque,ie=b.transmissive,de=b.transparent;f.setupLightsView(G),se===!0&&ge.setGlobalState(v.clippingPlanes,G),W&&xe.viewport(T.copy(W)),H.length>0&&vi(H,B,G),ie.length>0&&vi(ie,B,G),de.length>0&&vi(de,B,G),xe.buffers.depth.setTest(!0),xe.buffers.depth.setMask(!0),xe.buffers.color.setMask(!0),xe.setPolygonOffset(!1)}function _r(b,B,G,W){if((G.isScene===!0?G.overrideMaterial:null)!==null)return;f.state.transmissionRenderTarget[W.id]===void 0&&(f.state.transmissionRenderTarget[W.id]=new Oi(1,1,{generateMipmaps:!0,type:Qe.has("EXT_color_buffer_half_float")||Qe.has("EXT_color_buffer_float")?pr:Pn,minFilter:qn,samples:4,stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:et.workingColorSpace}));const ie=f.state.transmissionRenderTarget[W.id],de=W.viewport||T;ie.setSize(de.z*v.transmissionResolutionScale,de.w*v.transmissionResolutionScale);const Se=v.getRenderTarget(),ye=v.getActiveCubeFace(),ke=v.getActiveMipmapLevel();v.setRenderTarget(ie),v.getClearColor(O),z=v.getClearAlpha(),z<1&&v.setClearColor(16777215,.5),v.clear(),it&&J.render(G);const ze=v.toneMapping;v.toneMapping=pi;const Pe=W.viewport;if(W.viewport!==void 0&&(W.viewport=void 0),f.setupLightsView(W),se===!0&&ge.setGlobalState(v.clippingPlanes,W),vi(b,G,W),Ve.updateMultisampleRenderTarget(ie),Ve.updateRenderTargetMipmap(ie),Qe.has("WEBGL_multisampled_render_to_texture")===!1){let $e=!1;for(let lt=0,Tt=B.length;lt<Tt;lt++){const gt=B[lt],ft=gt.object,De=gt.geometry,St=gt.material,st=gt.group;if(St.side===sn&&ft.layers.test(W.layers)){const Jt=St.side;St.side=Zt,St.needsUpdate=!0,Ps(ft,G,W,De,St,st),St.side=Jt,St.needsUpdate=!0,$e=!0}}$e===!0&&(Ve.updateMultisampleRenderTarget(ie),Ve.updateRenderTargetMipmap(ie))}v.setRenderTarget(Se,ye,ke),v.setClearColor(O,z),Pe!==void 0&&(W.viewport=Pe),v.toneMapping=ze}function vi(b,B,G){const W=B.isScene===!0?B.overrideMaterial:null;for(let H=0,ie=b.length;H<ie;H++){const de=b[H],Se=de.object,ye=de.geometry,ke=de.group;let ze=de.material;ze.allowOverride===!0&&W!==null&&(ze=W),Se.layers.test(G.layers)&&Ps(Se,B,G,ye,ze,ke)}}function Ps(b,B,G,W,H,ie){b.onBeforeRender(v,B,G,W,H,ie),b.modelViewMatrix.multiplyMatrices(G.matrixWorldInverse,b.matrixWorld),b.normalMatrix.getNormalMatrix(b.modelViewMatrix),H.onBeforeRender(v,B,G,W,b,ie),H.transparent===!0&&H.side===sn&&H.forceSinglePass===!1?(H.side=Zt,H.needsUpdate=!0,v.renderBufferDirect(G,B,W,H,b,ie),H.side=Jn,H.needsUpdate=!0,v.renderBufferDirect(G,B,W,H,b,ie),H.side=sn):v.renderBufferDirect(G,B,W,H,b,ie),b.onAfterRender(v,B,G,W,H,ie)}function Ie(b,B,G){B.isScene!==!0&&(B=ct);const W=Ce.get(b),H=f.state.lights,ie=f.state.shadowsArray,de=H.state.version,Se=Z.getParameters(b,H.state,ie,B,G),ye=Z.getProgramCacheKey(Se);let ke=W.programs;W.environment=b.isMeshStandardMaterial?B.environment:null,W.fog=B.fog,W.envMap=(b.isMeshStandardMaterial?I:Et).get(b.envMap||W.environment),W.envMapRotation=W.environment!==null&&b.envMap===null?B.environmentRotation:b.envMapRotation,ke===void 0&&(b.addEventListener("dispose",Me),ke=new Map,W.programs=ke);let ze=ke.get(ye);if(ze!==void 0){if(W.currentProgram===ze&&W.lightsStateVersion===de)return un(b,Se),ze}else Se.uniforms=Z.getUniforms(b),b.onBeforeCompile(Se,v),ze=Z.acquireProgram(Se,ye),ke.set(ye,ze),W.uniforms=Se.uniforms;const Pe=W.uniforms;return(!b.isShaderMaterial&&!b.isRawShaderMaterial||b.clipping===!0)&&(Pe.clippingPlanes=ge.uniform),un(b,Se),W.needsLights=Ls(b),W.lightsStateVersion=de,W.needsLights&&(Pe.ambientLightColor.value=H.state.ambient,Pe.lightProbe.value=H.state.probe,Pe.directionalLights.value=H.state.directional,Pe.directionalLightShadows.value=H.state.directionalShadow,Pe.spotLights.value=H.state.spot,Pe.spotLightShadows.value=H.state.spotShadow,Pe.rectAreaLights.value=H.state.rectArea,Pe.ltc_1.value=H.state.rectAreaLTC1,Pe.ltc_2.value=H.state.rectAreaLTC2,Pe.pointLights.value=H.state.point,Pe.pointLightShadows.value=H.state.pointShadow,Pe.hemisphereLights.value=H.state.hemi,Pe.directionalShadowMap.value=H.state.directionalShadowMap,Pe.directionalShadowMatrix.value=H.state.directionalShadowMatrix,Pe.spotShadowMap.value=H.state.spotShadowMap,Pe.spotLightMatrix.value=H.state.spotLightMatrix,Pe.spotLightMap.value=H.state.spotLightMap,Pe.pointShadowMap.value=H.state.pointShadowMap,Pe.pointShadowMatrix.value=H.state.pointShadowMatrix),W.currentProgram=ze,W.uniformsList=null,ze}function pt(b){if(b.uniformsList===null){const B=b.currentProgram.getUniforms();b.uniformsList=so.seqWithValue(B.seq,b.uniforms)}return b.uniformsList}function un(b,B){const G=Ce.get(b);G.outputColorSpace=B.outputColorSpace,G.batching=B.batching,G.batchingColor=B.batchingColor,G.instancing=B.instancing,G.instancingColor=B.instancingColor,G.instancingMorph=B.instancingMorph,G.skinning=B.skinning,G.morphTargets=B.morphTargets,G.morphNormals=B.morphNormals,G.morphColors=B.morphColors,G.morphTargetsCount=B.morphTargetsCount,G.numClippingPlanes=B.numClippingPlanes,G.numIntersection=B.numClipIntersection,G.vertexAlphas=B.vertexAlphas,G.vertexTangents=B.vertexTangents,G.toneMapping=B.toneMapping}function Qn(b,B,G,W,H){B.isScene!==!0&&(B=ct),Ve.resetTextureUnits();const ie=B.fog,de=W.isMeshStandardMaterial?B.environment:null,Se=C===null?v.outputColorSpace:C.isXRRenderTarget===!0?C.texture.colorSpace:Kt,ye=(W.isMeshStandardMaterial?I:Et).get(W.envMap||de),ke=W.vertexColors===!0&&!!G.attributes.color&&G.attributes.color.itemSize===4,ze=!!G.attributes.tangent&&(!!W.normalMap||W.anisotropy>0),Pe=!!G.morphAttributes.position,$e=!!G.morphAttributes.normal,lt=!!G.morphAttributes.color;let Tt=pi;W.toneMapped&&(C===null||C.isXRRenderTarget===!0)&&(Tt=v.toneMapping);const gt=G.morphAttributes.position||G.morphAttributes.normal||G.morphAttributes.color,ft=gt!==void 0?gt.length:0,De=Ce.get(W),St=f.state.lights;if(se===!0&&(_e===!0||b!==M)){const Vt=b===M&&W.id===S;ge.setState(W,b,Vt)}let st=!1;W.version===De.__version?(De.needsLights&&De.lightsStateVersion!==St.state.version||De.outputColorSpace!==Se||H.isBatchedMesh&&De.batching===!1||!H.isBatchedMesh&&De.batching===!0||H.isBatchedMesh&&De.batchingColor===!0&&H.colorTexture===null||H.isBatchedMesh&&De.batchingColor===!1&&H.colorTexture!==null||H.isInstancedMesh&&De.instancing===!1||!H.isInstancedMesh&&De.instancing===!0||H.isSkinnedMesh&&De.skinning===!1||!H.isSkinnedMesh&&De.skinning===!0||H.isInstancedMesh&&De.instancingColor===!0&&H.instanceColor===null||H.isInstancedMesh&&De.instancingColor===!1&&H.instanceColor!==null||H.isInstancedMesh&&De.instancingMorph===!0&&H.morphTexture===null||H.isInstancedMesh&&De.instancingMorph===!1&&H.morphTexture!==null||De.envMap!==ye||W.fog===!0&&De.fog!==ie||De.numClippingPlanes!==void 0&&(De.numClippingPlanes!==ge.numPlanes||De.numIntersection!==ge.numIntersection)||De.vertexAlphas!==ke||De.vertexTangents!==ze||De.morphTargets!==Pe||De.morphNormals!==$e||De.morphColors!==lt||De.toneMapping!==Tt||De.morphTargetsCount!==ft)&&(st=!0):(st=!0,De.__version=W.version);let Jt=De.currentProgram;st===!0&&(Jt=Ie(W,B,H));let ki=!1,Qt=!1,Ns=!1;const yt=Jt.getUniforms(),hn=De.uniforms;if(xe.useProgram(Jt.program)&&(ki=!0,Qt=!0,Ns=!0),W.id!==S&&(S=W.id,Qt=!0),ki||M!==b){xe.buffers.depth.getReversed()?(ce.copy(b.projectionMatrix),am(ce),cm(ce),yt.setValue(L,"projectionMatrix",ce)):yt.setValue(L,"projectionMatrix",b.projectionMatrix),yt.setValue(L,"viewMatrix",b.matrixWorldInverse);const qt=yt.map.cameraPosition;qt!==void 0&&qt.setValue(L,Ze.setFromMatrixPosition(b.matrixWorld)),nt.logarithmicDepthBuffer&&yt.setValue(L,"logDepthBufFC",2/(Math.log(b.far+1)/Math.LN2)),(W.isMeshPhongMaterial||W.isMeshToonMaterial||W.isMeshLambertMaterial||W.isMeshBasicMaterial||W.isMeshStandardMaterial||W.isShaderMaterial)&&yt.setValue(L,"isOrthographic",b.isOrthographicCamera===!0),M!==b&&(M=b,Qt=!0,Ns=!0)}if(H.isSkinnedMesh){yt.setOptional(L,H,"bindMatrix"),yt.setOptional(L,H,"bindMatrixInverse");const Vt=H.skeleton;Vt&&(Vt.boneTexture===null&&Vt.computeBoneTexture(),yt.setValue(L,"boneTexture",Vt.boneTexture,Ve))}H.isBatchedMesh&&(yt.setOptional(L,H,"batchingTexture"),yt.setValue(L,"batchingTexture",H._matricesTexture,Ve),yt.setOptional(L,H,"batchingIdTexture"),yt.setValue(L,"batchingIdTexture",H._indirectTexture,Ve),yt.setOptional(L,H,"batchingColorTexture"),H._colorsTexture!==null&&yt.setValue(L,"batchingColorTexture",H._colorsTexture,Ve));const dn=G.morphAttributes;if((dn.position!==void 0||dn.normal!==void 0||dn.color!==void 0)&&pe.update(H,G,Jt),(Qt||De.receiveShadow!==H.receiveShadow)&&(De.receiveShadow=H.receiveShadow,yt.setValue(L,"receiveShadow",H.receiveShadow)),W.isMeshGouraudMaterial&&W.envMap!==null&&(hn.envMap.value=ye,hn.flipEnvMap.value=ye.isCubeTexture&&ye.isRenderTargetTexture===!1?-1:1),W.isMeshStandardMaterial&&W.envMap===null&&B.environment!==null&&(hn.envMapIntensity.value=B.environmentIntensity),Qt&&(yt.setValue(L,"toneMappingExposure",v.toneMappingExposure),De.needsLights&&Cn(hn,Ns),ie&&W.fog===!0&&K.refreshFogUniforms(hn,ie),K.refreshMaterialUniforms(hn,W,V,X,f.state.transmissionRenderTarget[b.id]),so.upload(L,pt(De),hn,Ve)),W.isShaderMaterial&&W.uniformsNeedUpdate===!0&&(so.upload(L,pt(De),hn,Ve),W.uniformsNeedUpdate=!1),W.isSpriteMaterial&&yt.setValue(L,"center",H.center),yt.setValue(L,"modelViewMatrix",H.modelViewMatrix),yt.setValue(L,"normalMatrix",H.normalMatrix),yt.setValue(L,"modelMatrix",H.matrixWorld),W.isShaderMaterial||W.isRawShaderMaterial){const Vt=W.uniformsGroups;for(let qt=0,wo=Vt.length;qt<wo;qt++){const yi=Vt[qt];U.update(yi,Jt),U.bind(yi,Jt)}}return Jt}function Cn(b,B){b.ambientLightColor.needsUpdate=B,b.lightProbe.needsUpdate=B,b.directionalLights.needsUpdate=B,b.directionalLightShadows.needsUpdate=B,b.pointLights.needsUpdate=B,b.pointLightShadows.needsUpdate=B,b.spotLights.needsUpdate=B,b.spotLightShadows.needsUpdate=B,b.rectAreaLights.needsUpdate=B,b.hemisphereLights.needsUpdate=B}function Ls(b){return b.isMeshLambertMaterial||b.isMeshToonMaterial||b.isMeshPhongMaterial||b.isMeshStandardMaterial||b.isShadowMaterial||b.isShaderMaterial&&b.lights===!0}this.getActiveCubeFace=function(){return w},this.getActiveMipmapLevel=function(){return R},this.getRenderTarget=function(){return C},this.setRenderTargetTextures=function(b,B,G){const W=Ce.get(b);W.__autoAllocateDepthBuffer=b.resolveDepthBuffer===!1,W.__autoAllocateDepthBuffer===!1&&(W.__useRenderToTexture=!1),Ce.get(b.texture).__webglTexture=B,Ce.get(b.depthTexture).__webglTexture=W.__autoAllocateDepthBuffer?void 0:G,W.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(b,B){const G=Ce.get(b);G.__webglFramebuffer=B,G.__useDefaultFramebuffer=B===void 0};const Ds=L.createFramebuffer();this.setRenderTarget=function(b,B=0,G=0){C=b,w=B,R=G;let W=!0,H=null,ie=!1,de=!1;if(b){const ye=Ce.get(b);if(ye.__useDefaultFramebuffer!==void 0)xe.bindFramebuffer(L.FRAMEBUFFER,null),W=!1;else if(ye.__webglFramebuffer===void 0)Ve.setupRenderTarget(b);else if(ye.__hasExternalTextures)Ve.rebindTextures(b,Ce.get(b.texture).__webglTexture,Ce.get(b.depthTexture).__webglTexture);else if(b.depthBuffer){const Pe=b.depthTexture;if(ye.__boundDepthTexture!==Pe){if(Pe!==null&&Ce.has(Pe)&&(b.width!==Pe.image.width||b.height!==Pe.image.height))throw new Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");Ve.setupDepthRenderbuffer(b)}}const ke=b.texture;(ke.isData3DTexture||ke.isDataArrayTexture||ke.isCompressedArrayTexture)&&(de=!0);const ze=Ce.get(b).__webglFramebuffer;b.isWebGLCubeRenderTarget?(Array.isArray(ze[B])?H=ze[B][G]:H=ze[B],ie=!0):b.samples>0&&Ve.useMultisampledRTT(b)===!1?H=Ce.get(b).__webglMultisampledFramebuffer:Array.isArray(ze)?H=ze[G]:H=ze,T.copy(b.viewport),D.copy(b.scissor),P=b.scissorTest}else T.copy(ne).multiplyScalar(V).floor(),D.copy(Te).multiplyScalar(V).floor(),P=Fe;if(G!==0&&(H=Ds),xe.bindFramebuffer(L.FRAMEBUFFER,H)&&W&&xe.drawBuffers(b,H),xe.viewport(T),xe.scissor(D),xe.setScissorTest(P),ie){const ye=Ce.get(b.texture);L.framebufferTexture2D(L.FRAMEBUFFER,L.COLOR_ATTACHMENT0,L.TEXTURE_CUBE_MAP_POSITIVE_X+B,ye.__webglTexture,G)}else if(de){const ye=Ce.get(b.texture),ke=B;L.framebufferTextureLayer(L.FRAMEBUFFER,L.COLOR_ATTACHMENT0,ye.__webglTexture,G,ke)}else if(b!==null&&G!==0){const ye=Ce.get(b.texture);L.framebufferTexture2D(L.FRAMEBUFFER,L.COLOR_ATTACHMENT0,L.TEXTURE_2D,ye.__webglTexture,G)}S=-1},this.readRenderTargetPixels=function(b,B,G,W,H,ie,de,Se=0){if(!(b&&b.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let ye=Ce.get(b).__webglFramebuffer;if(b.isWebGLCubeRenderTarget&&de!==void 0&&(ye=ye[de]),ye){xe.bindFramebuffer(L.FRAMEBUFFER,ye);try{const ke=b.textures[Se],ze=ke.format,Pe=ke.type;if(!nt.textureFormatReadable(ze)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!nt.textureTypeReadable(Pe)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}B>=0&&B<=b.width-W&&G>=0&&G<=b.height-H&&(b.textures.length>1&&L.readBuffer(L.COLOR_ATTACHMENT0+Se),L.readPixels(B,G,W,H,ae.convert(ze),ae.convert(Pe),ie))}finally{const ke=C!==null?Ce.get(C).__webglFramebuffer:null;xe.bindFramebuffer(L.FRAMEBUFFER,ke)}}},this.readRenderTargetPixelsAsync=async function(b,B,G,W,H,ie,de,Se=0){if(!(b&&b.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let ye=Ce.get(b).__webglFramebuffer;if(b.isWebGLCubeRenderTarget&&de!==void 0&&(ye=ye[de]),ye)if(B>=0&&B<=b.width-W&&G>=0&&G<=b.height-H){xe.bindFramebuffer(L.FRAMEBUFFER,ye);const ke=b.textures[Se],ze=ke.format,Pe=ke.type;if(!nt.textureFormatReadable(ze))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!nt.textureTypeReadable(Pe))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");const $e=L.createBuffer();L.bindBuffer(L.PIXEL_PACK_BUFFER,$e),L.bufferData(L.PIXEL_PACK_BUFFER,ie.byteLength,L.STREAM_READ),b.textures.length>1&&L.readBuffer(L.COLOR_ATTACHMENT0+Se),L.readPixels(B,G,W,H,ae.convert(ze),ae.convert(Pe),0);const lt=C!==null?Ce.get(C).__webglFramebuffer:null;xe.bindFramebuffer(L.FRAMEBUFFER,lt);const Tt=L.fenceSync(L.SYNC_GPU_COMMANDS_COMPLETE,0);return L.flush(),await om(L,Tt,4),L.bindBuffer(L.PIXEL_PACK_BUFFER,$e),L.getBufferSubData(L.PIXEL_PACK_BUFFER,0,ie),L.deleteBuffer($e),L.deleteSync(Tt),ie}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(b,B=null,G=0){const W=Math.pow(2,-G),H=Math.floor(b.image.width*W),ie=Math.floor(b.image.height*W),de=B!==null?B.x:0,Se=B!==null?B.y:0;Ve.setTexture2D(b,0),L.copyTexSubImage2D(L.TEXTURE_2D,G,0,0,de,Se,H,ie),xe.unbindTexture()};const Fn=L.createFramebuffer(),Ht=L.createFramebuffer();this.copyTextureToTexture=function(b,B,G=null,W=null,H=0,ie=null){ie===null&&(H!==0?(fs("WebGLRenderer: copyTextureToTexture function signature has changed to support src and dst mipmap levels."),ie=H,H=0):ie=0);let de,Se,ye,ke,ze,Pe,$e,lt,Tt;const gt=b.isCompressedTexture?b.mipmaps[ie]:b.image;if(G!==null)de=G.max.x-G.min.x,Se=G.max.y-G.min.y,ye=G.isBox3?G.max.z-G.min.z:1,ke=G.min.x,ze=G.min.y,Pe=G.isBox3?G.min.z:0;else{const dn=Math.pow(2,-H);de=Math.floor(gt.width*dn),Se=Math.floor(gt.height*dn),b.isDataArrayTexture?ye=gt.depth:b.isData3DTexture?ye=Math.floor(gt.depth*dn):ye=1,ke=0,ze=0,Pe=0}W!==null?($e=W.x,lt=W.y,Tt=W.z):($e=0,lt=0,Tt=0);const ft=ae.convert(B.format),De=ae.convert(B.type);let St;B.isData3DTexture?(Ve.setTexture3D(B,0),St=L.TEXTURE_3D):B.isDataArrayTexture||B.isCompressedArrayTexture?(Ve.setTexture2DArray(B,0),St=L.TEXTURE_2D_ARRAY):(Ve.setTexture2D(B,0),St=L.TEXTURE_2D),L.pixelStorei(L.UNPACK_FLIP_Y_WEBGL,B.flipY),L.pixelStorei(L.UNPACK_PREMULTIPLY_ALPHA_WEBGL,B.premultiplyAlpha),L.pixelStorei(L.UNPACK_ALIGNMENT,B.unpackAlignment);const st=L.getParameter(L.UNPACK_ROW_LENGTH),Jt=L.getParameter(L.UNPACK_IMAGE_HEIGHT),ki=L.getParameter(L.UNPACK_SKIP_PIXELS),Qt=L.getParameter(L.UNPACK_SKIP_ROWS),Ns=L.getParameter(L.UNPACK_SKIP_IMAGES);L.pixelStorei(L.UNPACK_ROW_LENGTH,gt.width),L.pixelStorei(L.UNPACK_IMAGE_HEIGHT,gt.height),L.pixelStorei(L.UNPACK_SKIP_PIXELS,ke),L.pixelStorei(L.UNPACK_SKIP_ROWS,ze),L.pixelStorei(L.UNPACK_SKIP_IMAGES,Pe);const yt=b.isDataArrayTexture||b.isData3DTexture,hn=B.isDataArrayTexture||B.isData3DTexture;if(b.isDepthTexture){const dn=Ce.get(b),Vt=Ce.get(B),qt=Ce.get(dn.__renderTarget),wo=Ce.get(Vt.__renderTarget);xe.bindFramebuffer(L.READ_FRAMEBUFFER,qt.__webglFramebuffer),xe.bindFramebuffer(L.DRAW_FRAMEBUFFER,wo.__webglFramebuffer);for(let yi=0;yi<ye;yi++)yt&&(L.framebufferTextureLayer(L.READ_FRAMEBUFFER,L.COLOR_ATTACHMENT0,Ce.get(b).__webglTexture,H,Pe+yi),L.framebufferTextureLayer(L.DRAW_FRAMEBUFFER,L.COLOR_ATTACHMENT0,Ce.get(B).__webglTexture,ie,Tt+yi)),L.blitFramebuffer(ke,ze,de,Se,$e,lt,de,Se,L.DEPTH_BUFFER_BIT,L.NEAREST);xe.bindFramebuffer(L.READ_FRAMEBUFFER,null),xe.bindFramebuffer(L.DRAW_FRAMEBUFFER,null)}else if(H!==0||b.isRenderTargetTexture||Ce.has(b)){const dn=Ce.get(b),Vt=Ce.get(B);xe.bindFramebuffer(L.READ_FRAMEBUFFER,Fn),xe.bindFramebuffer(L.DRAW_FRAMEBUFFER,Ht);for(let qt=0;qt<ye;qt++)yt?L.framebufferTextureLayer(L.READ_FRAMEBUFFER,L.COLOR_ATTACHMENT0,dn.__webglTexture,H,Pe+qt):L.framebufferTexture2D(L.READ_FRAMEBUFFER,L.COLOR_ATTACHMENT0,L.TEXTURE_2D,dn.__webglTexture,H),hn?L.framebufferTextureLayer(L.DRAW_FRAMEBUFFER,L.COLOR_ATTACHMENT0,Vt.__webglTexture,ie,Tt+qt):L.framebufferTexture2D(L.DRAW_FRAMEBUFFER,L.COLOR_ATTACHMENT0,L.TEXTURE_2D,Vt.__webglTexture,ie),H!==0?L.blitFramebuffer(ke,ze,de,Se,$e,lt,de,Se,L.COLOR_BUFFER_BIT,L.NEAREST):hn?L.copyTexSubImage3D(St,ie,$e,lt,Tt+qt,ke,ze,de,Se):L.copyTexSubImage2D(St,ie,$e,lt,ke,ze,de,Se);xe.bindFramebuffer(L.READ_FRAMEBUFFER,null),xe.bindFramebuffer(L.DRAW_FRAMEBUFFER,null)}else hn?b.isDataTexture||b.isData3DTexture?L.texSubImage3D(St,ie,$e,lt,Tt,de,Se,ye,ft,De,gt.data):B.isCompressedArrayTexture?L.compressedTexSubImage3D(St,ie,$e,lt,Tt,de,Se,ye,ft,gt.data):L.texSubImage3D(St,ie,$e,lt,Tt,de,Se,ye,ft,De,gt):b.isDataTexture?L.texSubImage2D(L.TEXTURE_2D,ie,$e,lt,de,Se,ft,De,gt.data):b.isCompressedTexture?L.compressedTexSubImage2D(L.TEXTURE_2D,ie,$e,lt,gt.width,gt.height,ft,gt.data):L.texSubImage2D(L.TEXTURE_2D,ie,$e,lt,de,Se,ft,De,gt);L.pixelStorei(L.UNPACK_ROW_LENGTH,st),L.pixelStorei(L.UNPACK_IMAGE_HEIGHT,Jt),L.pixelStorei(L.UNPACK_SKIP_PIXELS,ki),L.pixelStorei(L.UNPACK_SKIP_ROWS,Qt),L.pixelStorei(L.UNPACK_SKIP_IMAGES,Ns),ie===0&&B.generateMipmaps&&L.generateMipmap(St),xe.unbindTexture()},this.copyTextureToTexture3D=function(b,B,G=null,W=null,H=0){return fs('WebGLRenderer: copyTextureToTexture3D function has been deprecated. Use "copyTextureToTexture" instead.'),this.copyTextureToTexture(b,B,G,W,H)},this.initRenderTarget=function(b){Ce.get(b).__webglFramebuffer===void 0&&Ve.setupRenderTarget(b)},this.initTexture=function(b){b.isCubeTexture?Ve.setTextureCube(b,0):b.isData3DTexture?Ve.setTexture3D(b,0):b.isDataArrayTexture||b.isCompressedArrayTexture?Ve.setTexture2DArray(b,0):Ve.setTexture2D(b,0),xe.unbindTexture()},this.resetState=function(){w=0,R=0,C=null,xe.reset(),Ue.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return Yn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;const t=this.getContext();t.drawingBufferColorSpace=et._getDrawingBufferColorSpace(e),t.unpackColorSpace=et._getUnpackColorSpace()}}function ly(i,e){const t=new cy({antialias:e.antialias,powerPreference:"high-performance"});return t.setPixelRatio(e.dpr),t.setSize(window.innerWidth,window.innerHeight),t.outputColorSpace=wt,t.toneMapping=wh,e.shadowSize>0&&(t.shadowMap.enabled=!0,t.shadowMap.type=bh),i.appendChild(t.domElement),t}function uy(){const i=new Dm;return i.background=new Ne(724506),i.fog=new Hc(724506,28,62),i}function hy(){const i=new Xt(55,window.innerWidth/window.innerHeight,.1,120);return i.position.set(13,8,15),i.lookAt(0,1.5,0),i}function dy(i,e){const t=new sg(4872844,1316897,.5);i.add(t);const n=new _c(16773080,2.6);n.position.set(8,20,6),e.shadowSize>0&&(n.castShadow=!0,n.shadow.mapSize.set(e.shadowSize,e.shadowSize),n.shadow.camera.left=-14,n.shadow.camera.right=14,n.shadow.camera.top=14,n.shadow.camera.bottom=-14,n.shadow.camera.near=1,n.shadow.camera.far=45,n.shadow.bias=-4e-4),i.add(n);const s=new _c(6258175,.7);s.position.set(-9,12,-14),i.add(s);for(const o of[7,-7]){const a=new ad(16770751,260,40,.62,.55,1.6);a.position.set(0,15,o*.55),a.target.position.set(0,0,o*.6),i.add(a),i.add(a.target)}let r=0;return{setTension(o,a){r+=((o?1:0)-r)*(1-Math.exp(-3*a)),t.intensity=.5-.22*r,s.intensity=.7+.55*r,n.intensity=2.6-.25*r}}}function fy(i,e){window.addEventListener("resize",()=>{e.aspect=window.innerWidth/window.innerHeight,e.updateProjectionMatrix(),i.setSize(window.innerWidth,window.innerHeight)})}function py(i,e){const t=e.shadowSize>0,n=new an;my(n,t),gy(n);const s=_y(n);n.traverse(c=>{c.isMesh&&(c.matrixAutoUpdate=!1)}),i.add(n);const r=s.geometry.attributes.position.array.slice(),o={amp:0,x:0,t:0};let a=0;return{group:n,update(c,l){let u=0;if(l&&(Math.abs(l.z)<.35&&l.y<fe.NET_HEIGHT+.2&&a!==0&&Math.sign(l.vz)!==Math.sign(a)&&Math.abs(a)>.8&&(o.amp=Math.min(.16,.03+Math.abs(a)*.012),o.x=l.x,o.t=0,u=Math.min(1,Math.abs(a)/12)),a=l.vz),o.amp<=.001)return u;o.t+=c;const h=o.amp*Math.exp(-4.5*o.t);if(h<.001)return o.amp=0,s.geometry.attributes.position.array.set(r),s.geometry.attributes.position.needsUpdate=!0,u;const d=s.geometry.attributes.position;for(let p=0;p<d.count;p+=1){const g=r[p*3],_=Math.abs(g-o.x),m=Math.max(0,1-_/3.5);d.array[p*3+2]=r[p*3+2]+h*m*Math.sin(o.t*22-_*2.2)}return d.needsUpdate=!0,u}}}function my(i,e){const t=fe.WIDTH+fe.FREE_ZONE*2,n=fe.LENGTH+fe.FREE_ZONE*2,s=new dt(new Dn(t+4,n+4),new xn({color:7032629,roughness:.9}));s.rotation.x=-Math.PI/2,s.receiveShadow=e,s.updateMatrix(),i.add(s);const r=new dt(new Dn(fe.WIDTH,fe.LENGTH),new xn({color:13204285,roughness:.85}));r.rotation.x=-Math.PI/2,r.position.y=.005,r.receiveShadow=e,r.updateMatrix(),i.add(r)}function gy(i){const e=new on({color:16118248}),t=.011,n=fe.LINE_WIDTH,s=fe.WIDTH/2,r=fe.LENGTH/2,o=(a,c,l,u)=>{const h=new dt(new Dn(a,c),e);h.rotation.x=-Math.PI/2,h.position.set(l,t,u),h.updateMatrix(),i.add(h)};o(fe.WIDTH+n,n,0,r),o(fe.WIDTH+n,n,0,-r),o(n,fe.LENGTH+n,s,0),o(n,fe.LENGTH+n,-s,0),o(fe.WIDTH,n,0,fe.ATTACK_LINE),o(fe.WIDTH,n,0,-3),o(fe.WIDTH,n,0,0)}function _y(i){const e=fe.WIDTH+fe.NET_OVERHANG*2,t=fe.NET_HEIGHT-fe.NET_BAND,n=new dt(new Dn(e,fe.NET_BAND,48,6),new xn({map:xy(e),transparent:!0,side:sn,roughness:1}));n.position.set(0,t+fe.NET_BAND/2,0),n.updateMatrix(),i.add(n);const s=new xn({color:16118248,side:sn});for(const o of[fe.NET_HEIGHT-.035,t+.025]){const a=new dt(new Dn(e,.07),s);a.position.set(0,o,0),a.updateMatrix(),i.add(a)}const r=new xn({color:4015185,roughness:.5});for(const o of[1,-1]){const a=new dt(new go(.05,.05,fe.NET_HEIGHT+.12,12),r);a.position.set(o*(fe.WIDTH/2+fe.NET_OVERHANG),(fe.NET_HEIGHT+.12)/2,0),a.castShadow=!0,a.updateMatrix(),i.add(a)}for(const o of[1,-1]){const a=new an;for(let c=0;c<8;c+=1){const l=new dt(new go(.012,.012,.1,8),new on({color:c%2===0?14694970:16118248}));l.position.y=c*.1+.05,l.updateMatrix(),a.add(l)}a.position.set(o*fe.WIDTH/2,fe.NET_HEIGHT-.4+.02,0),i.add(a)}return n}function xy(i){const e=document.createElement("canvas");e.width=512,e.height=128;const t=e.getContext("2d");t.clearRect(0,0,e.width,e.height),t.strokeStyle="rgba(235, 238, 245, 0.85)",t.lineWidth=1.5;const n=8;for(let r=0;r<=e.width;r+=n)t.beginPath(),t.moveTo(r,0),t.lineTo(r,e.height),t.stroke();for(let r=0;r<=e.height;r+=n)t.beginPath(),t.moveTo(0,r),t.lineTo(e.width,r),t.stroke();const s=new Eo(e);return s.wrapS=Ni,s.repeat.x=i/5,s}const vy=1251884,fa=[2765650,3813194,2569546,4206666,2240583,4864560];function pa(i){let e=Math.imul(i|0,2654435761);return e^=e>>>16,e=Math.imul(e,73244475),e^=e>>>16,(e>>>0)/4294967296}function yy(i){const e=new an;return My(e),Ey(e),Ty(e),e.traverse(t=>{t.isMesh&&(t.matrixAutoUpdate=!1)}),i.add(e),e}const fd=4,pd=13.2,md=15.6,us=2,gd=1.15;function My(i){const e=new xn({color:vy,roughness:.95});for(let t=0;t<fd;t+=1){const n=t*gd+.5,s=new mi(us,1,34);for(const o of[1,-1]){const a=new dt(s,e);a.position.set(o*(pd+t*us),n,0),a.updateMatrix(),i.add(a)}const r=new mi(24,1,us);for(const o of[1,-1]){const a=new dt(r,e);a.position.set(0,n,o*(md+t*us)),a.updateMatrix(),i.add(a)}}}function Ey(i){const e=[];for(let a=0;a<fd;a+=1){const c=a*gd+1.25,l=pd+a*us;for(let h=0;h<52;h+=1){const d=-15.5+h*.61;e.push([l,c,d],[-l,c,d])}const u=md+a*us;for(let h=0;h<36;h+=1){const d=-10.8+h*.62;e.push([d,c,u],[d,c,-u])}}const t=new Kn(.17,.36,3,8),n=new xn({roughness:1}),s=new ed(t,n,e.length),r=new He,o=new Ne;e.forEach(([a,c,l],u)=>{const h=pa(u*7919+13),d=h<.88,p=(pa(u*104729+7)-.5)*.22,g=(pa(u*1301+3)-.5)*.14;r.makeTranslation(d?a+p:0,d?c+g:-50,l),s.setMatrixAt(u,r),o.setHex(fa[Math.floor(h*fa.length)%fa.length]),s.setColorAt(u,o)}),s.instanceMatrix.needsUpdate=!0,s.instanceColor&&(s.instanceColor.needsUpdate=!0),i.add(s)}const Sy=["排球夢 VOLLEYBALL DREAM","SAWMAH SPORTS","NIGHT MATCH ★ 夜賽"],Pu=[["#0b1430","#6ee7ff"],["#301010","#ff9d7a"],["#101f14","#8dffb0"]];function Ty(i){const t=Sy.map((a,c)=>by(a,Pu[c][0],Pu[c][1])).map(a=>new on({map:a,toneMapped:!1})),n=new Dn(7.2,.85),s=fe.WIDTH/2+fe.FREE_ZONE+.6,r=fe.LENGTH/2+fe.FREE_ZONE+.6,o=(a,c,l,u)=>{const h=new dt(n,t[u%t.length]);h.position.set(a,.46,c),h.rotation.y=l,h.updateMatrix(),i.add(h)};o(s,5.5,-Math.PI/2,0),o(s,-5.5,-Math.PI/2,1),o(-s,5.5,Math.PI/2,2),o(-s,-5.5,Math.PI/2,0),o(0,r,Math.PI,1),o(0,-r,0,2)}function by(i,e,t){const n=document.createElement("canvas");n.width=1024,n.height=128;const s=n.getContext("2d");s.fillStyle=e,s.fillRect(0,0,1024,128),s.strokeStyle=t,s.lineWidth=4,s.strokeRect(6,6,1012,116),s.font="bold 64px system-ui, sans-serif",s.textAlign="center",s.textBaseline="middle",s.fillStyle=t,s.fillText(i,512,68);const r=new Eo(n);return r.colorSpace=wt,r}function Lu(i,e){if(e===Lp)return console.warn("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles."),i;if(e===dc||e===Fh){let t=i.getIndex();if(t===null){const o=[],a=i.getAttribute("position");if(a!==void 0){for(let c=0;c<a.count;c++)o.push(c);i.setIndex(o),t=i.getIndex()}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible."),i}const n=t.count-2,s=[];if(e===dc)for(let o=1;o<=n;o++)s.push(t.getX(0)),s.push(t.getX(o)),s.push(t.getX(o+1));else for(let o=0;o<n;o++)o%2===0?(s.push(t.getX(o)),s.push(t.getX(o+1)),s.push(t.getX(o+2))):(s.push(t.getX(o+2)),s.push(t.getX(o+1)),s.push(t.getX(o)));s.length/3!==n&&console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.");const r=i.clone();return r.setIndex(s),r.clearGroups(),r}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:",e),i}class Ay extends Rs{constructor(e){super(e),this.dracoLoader=null,this.ktx2Loader=null,this.meshoptDecoder=null,this.pluginCallbacks=[],this.register(function(t){return new Py(t)}),this.register(function(t){return new Ly(t)}),this.register(function(t){return new Hy(t)}),this.register(function(t){return new Vy(t)}),this.register(function(t){return new Gy(t)}),this.register(function(t){return new Ny(t)}),this.register(function(t){return new Uy(t)}),this.register(function(t){return new Oy(t)}),this.register(function(t){return new Fy(t)}),this.register(function(t){return new Iy(t)}),this.register(function(t){return new ky(t)}),this.register(function(t){return new Dy(t)}),this.register(function(t){return new zy(t)}),this.register(function(t){return new By(t)}),this.register(function(t){return new Ry(t)}),this.register(function(t){return new Wy(t)}),this.register(function(t){return new Xy(t)})}load(e,t,n,s){const r=this;let o;if(this.resourcePath!=="")o=this.resourcePath;else if(this.path!==""){const l=nr.extractUrlBase(e);o=nr.resolveURL(l,this.path)}else o=nr.extractUrlBase(e);this.manager.itemStart(e);const a=function(l){s?s(l):console.error(l),r.manager.itemError(e),r.manager.itemEnd(e)},c=new od(this.manager);c.setPath(this.path),c.setResponseType("arraybuffer"),c.setRequestHeader(this.requestHeader),c.setWithCredentials(this.withCredentials),c.load(e,function(l){try{r.parse(l,o,function(u){t(u),r.manager.itemEnd(e)},a)}catch(u){a(u)}},n,a)}setDRACOLoader(e){return this.dracoLoader=e,this}setKTX2Loader(e){return this.ktx2Loader=e,this}setMeshoptDecoder(e){return this.meshoptDecoder=e,this}register(e){return this.pluginCallbacks.indexOf(e)===-1&&this.pluginCallbacks.push(e),this}unregister(e){return this.pluginCallbacks.indexOf(e)!==-1&&this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(e),1),this}parse(e,t,n,s){let r;const o={},a={},c=new TextDecoder;if(typeof e=="string")r=JSON.parse(e);else if(e instanceof ArrayBuffer)if(c.decode(new Uint8Array(e,0,4))===_d){try{o[Ye.KHR_BINARY_GLTF]=new jy(e)}catch(h){s&&s(h);return}r=JSON.parse(o[Ye.KHR_BINARY_GLTF].content)}else r=JSON.parse(c.decode(e));else r=e;if(r.asset===void 0||r.asset.version[0]<2){s&&s(new Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."));return}const l=new rM(r,{path:t||this.resourcePath||"",crossOrigin:this.crossOrigin,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder});l.fileLoader.setRequestHeader(this.requestHeader);for(let u=0;u<this.pluginCallbacks.length;u++){const h=this.pluginCallbacks[u](l);h.name||console.error("THREE.GLTFLoader: Invalid plugin found: missing name"),a[h.name]=h,o[h.name]=!0}if(r.extensionsUsed)for(let u=0;u<r.extensionsUsed.length;++u){const h=r.extensionsUsed[u],d=r.extensionsRequired||[];switch(h){case Ye.KHR_MATERIALS_UNLIT:o[h]=new Cy;break;case Ye.KHR_DRACO_MESH_COMPRESSION:o[h]=new Ky(r,this.dracoLoader);break;case Ye.KHR_TEXTURE_TRANSFORM:o[h]=new qy;break;case Ye.KHR_MESH_QUANTIZATION:o[h]=new Yy;break;default:d.indexOf(h)>=0&&a[h]===void 0&&console.warn('THREE.GLTFLoader: Unknown extension "'+h+'".')}}l.setExtensions(o),l.setPlugins(a),l.parse(n,s)}parseAsync(e,t){const n=this;return new Promise(function(s,r){n.parse(e,t,s,r)})}}function wy(){let i={};return{get:function(e){return i[e]},add:function(e,t){i[e]=t},remove:function(e){delete i[e]},removeAll:function(){i={}}}}const Ye={KHR_BINARY_GLTF:"KHR_binary_glTF",KHR_DRACO_MESH_COMPRESSION:"KHR_draco_mesh_compression",KHR_LIGHTS_PUNCTUAL:"KHR_lights_punctual",KHR_MATERIALS_CLEARCOAT:"KHR_materials_clearcoat",KHR_MATERIALS_DISPERSION:"KHR_materials_dispersion",KHR_MATERIALS_IOR:"KHR_materials_ior",KHR_MATERIALS_SHEEN:"KHR_materials_sheen",KHR_MATERIALS_SPECULAR:"KHR_materials_specular",KHR_MATERIALS_TRANSMISSION:"KHR_materials_transmission",KHR_MATERIALS_IRIDESCENCE:"KHR_materials_iridescence",KHR_MATERIALS_ANISOTROPY:"KHR_materials_anisotropy",KHR_MATERIALS_UNLIT:"KHR_materials_unlit",KHR_MATERIALS_VOLUME:"KHR_materials_volume",KHR_TEXTURE_BASISU:"KHR_texture_basisu",KHR_TEXTURE_TRANSFORM:"KHR_texture_transform",KHR_MESH_QUANTIZATION:"KHR_mesh_quantization",KHR_MATERIALS_EMISSIVE_STRENGTH:"KHR_materials_emissive_strength",EXT_MATERIALS_BUMP:"EXT_materials_bump",EXT_TEXTURE_WEBP:"EXT_texture_webp",EXT_TEXTURE_AVIF:"EXT_texture_avif",EXT_MESHOPT_COMPRESSION:"EXT_meshopt_compression",EXT_MESH_GPU_INSTANCING:"EXT_mesh_gpu_instancing"};class Ry{constructor(e){this.parser=e,this.name=Ye.KHR_LIGHTS_PUNCTUAL,this.cache={refs:{},uses:{}}}_markDefs(){const e=this.parser,t=this.parser.json.nodes||[];for(let n=0,s=t.length;n<s;n++){const r=t[n];r.extensions&&r.extensions[this.name]&&r.extensions[this.name].light!==void 0&&e._addNodeRef(this.cache,r.extensions[this.name].light)}}_loadLight(e){const t=this.parser,n="light:"+e;let s=t.cache.get(n);if(s)return s;const r=t.json,c=((r.extensions&&r.extensions[this.name]||{}).lights||[])[e];let l;const u=new Ne(16777215);c.color!==void 0&&u.setRGB(c.color[0],c.color[1],c.color[2],Kt);const h=c.range!==void 0?c.range:0;switch(c.type){case"directional":l=new _c(u),l.target.position.set(0,0,-1),l.add(l.target);break;case"point":l=new ag(u),l.distance=h;break;case"spot":l=new ad(u),l.distance=h,c.spot=c.spot||{},c.spot.innerConeAngle=c.spot.innerConeAngle!==void 0?c.spot.innerConeAngle:0,c.spot.outerConeAngle=c.spot.outerConeAngle!==void 0?c.spot.outerConeAngle:Math.PI/4,l.angle=c.spot.outerConeAngle,l.penumbra=1-c.spot.innerConeAngle/c.spot.outerConeAngle,l.target.position.set(0,0,-1),l.add(l.target);break;default:throw new Error("THREE.GLTFLoader: Unexpected light type: "+c.type)}return l.position.set(0,0,0),Xn(l,c),c.intensity!==void 0&&(l.intensity=c.intensity),l.name=t.createUniqueName(c.name||"light_"+e),s=Promise.resolve(l),t.cache.add(n,s),s}getDependency(e,t){if(e==="light")return this._loadLight(t)}createNodeAttachment(e){const t=this,n=this.parser,r=n.json.nodes[e],a=(r.extensions&&r.extensions[this.name]||{}).light;return a===void 0?null:this._loadLight(a).then(function(c){return n._getNodeRef(t.cache,a,c)})}}class Cy{constructor(){this.name=Ye.KHR_MATERIALS_UNLIT}getMaterialType(){return on}extendParams(e,t,n){const s=[];e.color=new Ne(1,1,1),e.opacity=1;const r=t.pbrMetallicRoughness;if(r){if(Array.isArray(r.baseColorFactor)){const o=r.baseColorFactor;e.color.setRGB(o[0],o[1],o[2],Kt),e.opacity=o[3]}r.baseColorTexture!==void 0&&s.push(n.assignTexture(e,"map",r.baseColorTexture,wt))}return Promise.all(s)}}class Iy{constructor(e){this.parser=e,this.name=Ye.KHR_MATERIALS_EMISSIVE_STRENGTH}extendMaterialParams(e,t){const s=this.parser.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const r=s.extensions[this.name].emissiveStrength;return r!==void 0&&(t.emissiveIntensity=r),Promise.resolve()}}class Py{constructor(e){this.parser=e,this.name=Ye.KHR_MATERIALS_CLEARCOAT}getMaterialType(e){const n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:On}extendMaterialParams(e,t){const n=this.parser,s=n.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const r=[],o=s.extensions[this.name];if(o.clearcoatFactor!==void 0&&(t.clearcoat=o.clearcoatFactor),o.clearcoatTexture!==void 0&&r.push(n.assignTexture(t,"clearcoatMap",o.clearcoatTexture)),o.clearcoatRoughnessFactor!==void 0&&(t.clearcoatRoughness=o.clearcoatRoughnessFactor),o.clearcoatRoughnessTexture!==void 0&&r.push(n.assignTexture(t,"clearcoatRoughnessMap",o.clearcoatRoughnessTexture)),o.clearcoatNormalTexture!==void 0&&(r.push(n.assignTexture(t,"clearcoatNormalMap",o.clearcoatNormalTexture)),o.clearcoatNormalTexture.scale!==void 0)){const a=o.clearcoatNormalTexture.scale;t.clearcoatNormalScale=new we(a,a)}return Promise.all(r)}}class Ly{constructor(e){this.parser=e,this.name=Ye.KHR_MATERIALS_DISPERSION}getMaterialType(e){const n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:On}extendMaterialParams(e,t){const s=this.parser.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const r=s.extensions[this.name];return t.dispersion=r.dispersion!==void 0?r.dispersion:0,Promise.resolve()}}class Dy{constructor(e){this.parser=e,this.name=Ye.KHR_MATERIALS_IRIDESCENCE}getMaterialType(e){const n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:On}extendMaterialParams(e,t){const n=this.parser,s=n.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const r=[],o=s.extensions[this.name];return o.iridescenceFactor!==void 0&&(t.iridescence=o.iridescenceFactor),o.iridescenceTexture!==void 0&&r.push(n.assignTexture(t,"iridescenceMap",o.iridescenceTexture)),o.iridescenceIor!==void 0&&(t.iridescenceIOR=o.iridescenceIor),t.iridescenceThicknessRange===void 0&&(t.iridescenceThicknessRange=[100,400]),o.iridescenceThicknessMinimum!==void 0&&(t.iridescenceThicknessRange[0]=o.iridescenceThicknessMinimum),o.iridescenceThicknessMaximum!==void 0&&(t.iridescenceThicknessRange[1]=o.iridescenceThicknessMaximum),o.iridescenceThicknessTexture!==void 0&&r.push(n.assignTexture(t,"iridescenceThicknessMap",o.iridescenceThicknessTexture)),Promise.all(r)}}class Ny{constructor(e){this.parser=e,this.name=Ye.KHR_MATERIALS_SHEEN}getMaterialType(e){const n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:On}extendMaterialParams(e,t){const n=this.parser,s=n.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const r=[];t.sheenColor=new Ne(0,0,0),t.sheenRoughness=0,t.sheen=1;const o=s.extensions[this.name];if(o.sheenColorFactor!==void 0){const a=o.sheenColorFactor;t.sheenColor.setRGB(a[0],a[1],a[2],Kt)}return o.sheenRoughnessFactor!==void 0&&(t.sheenRoughness=o.sheenRoughnessFactor),o.sheenColorTexture!==void 0&&r.push(n.assignTexture(t,"sheenColorMap",o.sheenColorTexture,wt)),o.sheenRoughnessTexture!==void 0&&r.push(n.assignTexture(t,"sheenRoughnessMap",o.sheenRoughnessTexture)),Promise.all(r)}}class Uy{constructor(e){this.parser=e,this.name=Ye.KHR_MATERIALS_TRANSMISSION}getMaterialType(e){const n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:On}extendMaterialParams(e,t){const n=this.parser,s=n.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const r=[],o=s.extensions[this.name];return o.transmissionFactor!==void 0&&(t.transmission=o.transmissionFactor),o.transmissionTexture!==void 0&&r.push(n.assignTexture(t,"transmissionMap",o.transmissionTexture)),Promise.all(r)}}class Oy{constructor(e){this.parser=e,this.name=Ye.KHR_MATERIALS_VOLUME}getMaterialType(e){const n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:On}extendMaterialParams(e,t){const n=this.parser,s=n.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const r=[],o=s.extensions[this.name];t.thickness=o.thicknessFactor!==void 0?o.thicknessFactor:0,o.thicknessTexture!==void 0&&r.push(n.assignTexture(t,"thicknessMap",o.thicknessTexture)),t.attenuationDistance=o.attenuationDistance||1/0;const a=o.attenuationColor||[1,1,1];return t.attenuationColor=new Ne().setRGB(a[0],a[1],a[2],Kt),Promise.all(r)}}class Fy{constructor(e){this.parser=e,this.name=Ye.KHR_MATERIALS_IOR}getMaterialType(e){const n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:On}extendMaterialParams(e,t){const s=this.parser.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const r=s.extensions[this.name];return t.ior=r.ior!==void 0?r.ior:1.5,Promise.resolve()}}class ky{constructor(e){this.parser=e,this.name=Ye.KHR_MATERIALS_SPECULAR}getMaterialType(e){const n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:On}extendMaterialParams(e,t){const n=this.parser,s=n.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const r=[],o=s.extensions[this.name];t.specularIntensity=o.specularFactor!==void 0?o.specularFactor:1,o.specularTexture!==void 0&&r.push(n.assignTexture(t,"specularIntensityMap",o.specularTexture));const a=o.specularColorFactor||[1,1,1];return t.specularColor=new Ne().setRGB(a[0],a[1],a[2],Kt),o.specularColorTexture!==void 0&&r.push(n.assignTexture(t,"specularColorMap",o.specularColorTexture,wt)),Promise.all(r)}}class By{constructor(e){this.parser=e,this.name=Ye.EXT_MATERIALS_BUMP}getMaterialType(e){const n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:On}extendMaterialParams(e,t){const n=this.parser,s=n.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const r=[],o=s.extensions[this.name];return t.bumpScale=o.bumpFactor!==void 0?o.bumpFactor:1,o.bumpTexture!==void 0&&r.push(n.assignTexture(t,"bumpMap",o.bumpTexture)),Promise.all(r)}}class zy{constructor(e){this.parser=e,this.name=Ye.KHR_MATERIALS_ANISOTROPY}getMaterialType(e){const n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:On}extendMaterialParams(e,t){const n=this.parser,s=n.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const r=[],o=s.extensions[this.name];return o.anisotropyStrength!==void 0&&(t.anisotropy=o.anisotropyStrength),o.anisotropyRotation!==void 0&&(t.anisotropyRotation=o.anisotropyRotation),o.anisotropyTexture!==void 0&&r.push(n.assignTexture(t,"anisotropyMap",o.anisotropyTexture)),Promise.all(r)}}class Hy{constructor(e){this.parser=e,this.name=Ye.KHR_TEXTURE_BASISU}loadTexture(e){const t=this.parser,n=t.json,s=n.textures[e];if(!s.extensions||!s.extensions[this.name])return null;const r=s.extensions[this.name],o=t.options.ktx2Loader;if(!o){if(n.extensionsRequired&&n.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");return null}return t.loadTextureImage(e,r.source,o)}}class Vy{constructor(e){this.parser=e,this.name=Ye.EXT_TEXTURE_WEBP}loadTexture(e){const t=this.name,n=this.parser,s=n.json,r=s.textures[e];if(!r.extensions||!r.extensions[t])return null;const o=r.extensions[t],a=s.images[o.source];let c=n.textureLoader;if(a.uri){const l=n.options.manager.getHandler(a.uri);l!==null&&(c=l)}return n.loadTextureImage(e,o.source,c)}}class Gy{constructor(e){this.parser=e,this.name=Ye.EXT_TEXTURE_AVIF}loadTexture(e){const t=this.name,n=this.parser,s=n.json,r=s.textures[e];if(!r.extensions||!r.extensions[t])return null;const o=r.extensions[t],a=s.images[o.source];let c=n.textureLoader;if(a.uri){const l=n.options.manager.getHandler(a.uri);l!==null&&(c=l)}return n.loadTextureImage(e,o.source,c)}}class Wy{constructor(e){this.name=Ye.EXT_MESHOPT_COMPRESSION,this.parser=e}loadBufferView(e){const t=this.parser.json,n=t.bufferViews[e];if(n.extensions&&n.extensions[this.name]){const s=n.extensions[this.name],r=this.parser.getDependency("buffer",s.buffer),o=this.parser.options.meshoptDecoder;if(!o||!o.supported){if(t.extensionsRequired&&t.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");return null}return r.then(function(a){const c=s.byteOffset||0,l=s.byteLength||0,u=s.count,h=s.byteStride,d=new Uint8Array(a,c,l);return o.decodeGltfBufferAsync?o.decodeGltfBufferAsync(u,h,d,s.mode,s.filter).then(function(p){return p.buffer}):o.ready.then(function(){const p=new ArrayBuffer(u*h);return o.decodeGltfBuffer(new Uint8Array(p),u,h,d,s.mode,s.filter),p})})}else return null}}class Xy{constructor(e){this.name=Ye.EXT_MESH_GPU_INSTANCING,this.parser=e}createNodeMesh(e){const t=this.parser.json,n=t.nodes[e];if(!n.extensions||!n.extensions[this.name]||n.mesh===void 0)return null;const s=t.meshes[n.mesh];for(const l of s.primitives)if(l.mode!==pn.TRIANGLES&&l.mode!==pn.TRIANGLE_STRIP&&l.mode!==pn.TRIANGLE_FAN&&l.mode!==void 0)return null;const o=n.extensions[this.name].attributes,a=[],c={};for(const l in o)a.push(this.parser.getDependency("accessor",o[l]).then(u=>(c[l]=u,c[l])));return a.length<1?null:(a.push(this.parser.createNodeMesh(e)),Promise.all(a).then(l=>{const u=l.pop(),h=u.isGroup?u.children:[u],d=l[0].count,p=[];for(const g of h){const _=new He,m=new N,f=new ln,y=new N(1,1,1),x=new ed(g.geometry,g.material,d);for(let v=0;v<d;v++)c.TRANSLATION&&m.fromBufferAttribute(c.TRANSLATION,v),c.ROTATION&&f.fromBufferAttribute(c.ROTATION,v),c.SCALE&&y.fromBufferAttribute(c.SCALE,v),x.setMatrixAt(v,_.compose(m,f,y));for(const v in c)if(v==="_COLOR_0"){const A=c[v];x.instanceColor=new pc(A.array,A.itemSize,A.normalized)}else v!=="TRANSLATION"&&v!=="ROTATION"&&v!=="SCALE"&&g.geometry.setAttribute(v,c[v]);vt.prototype.copy.call(x,g),this.parser.assignFinalMaterial(x),p.push(x)}return u.isGroup?(u.clear(),u.add(...p),u):p[0]}))}}const _d="glTF",Ks=12,Du={JSON:1313821514,BIN:5130562};class jy{constructor(e){this.name=Ye.KHR_BINARY_GLTF,this.content=null,this.body=null;const t=new DataView(e,0,Ks),n=new TextDecoder;if(this.header={magic:n.decode(new Uint8Array(e.slice(0,4))),version:t.getUint32(4,!0),length:t.getUint32(8,!0)},this.header.magic!==_d)throw new Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");if(this.header.version<2)throw new Error("THREE.GLTFLoader: Legacy binary file detected.");const s=this.header.length-Ks,r=new DataView(e,Ks);let o=0;for(;o<s;){const a=r.getUint32(o,!0);o+=4;const c=r.getUint32(o,!0);if(o+=4,c===Du.JSON){const l=new Uint8Array(e,Ks+o,a);this.content=n.decode(l)}else if(c===Du.BIN){const l=Ks+o;this.body=e.slice(l,l+a)}o+=a}if(this.content===null)throw new Error("THREE.GLTFLoader: JSON content not found.")}}class Ky{constructor(e,t){if(!t)throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");this.name=Ye.KHR_DRACO_MESH_COMPRESSION,this.json=e,this.dracoLoader=t,this.dracoLoader.preload()}decodePrimitive(e,t){const n=this.json,s=this.dracoLoader,r=e.extensions[this.name].bufferView,o=e.extensions[this.name].attributes,a={},c={},l={};for(const u in o){const h=yc[u]||u.toLowerCase();a[h]=o[u]}for(const u in e.attributes){const h=yc[u]||u.toLowerCase();if(o[u]!==void 0){const d=n.accessors[e.attributes[u]],p=gs[d.componentType];l[h]=p.name,c[h]=d.normalized===!0}}return t.getDependency("bufferView",r).then(function(u){return new Promise(function(h,d){s.decodeDracoFile(u,function(p){for(const g in p.attributes){const _=p.attributes[g],m=c[g];m!==void 0&&(_.normalized=m)}h(p)},a,l,Kt,d)})})}}class qy{constructor(){this.name=Ye.KHR_TEXTURE_TRANSFORM}extendTexture(e,t){return(t.texCoord===void 0||t.texCoord===e.channel)&&t.offset===void 0&&t.rotation===void 0&&t.scale===void 0||(e=e.clone(),t.texCoord!==void 0&&(e.channel=t.texCoord),t.offset!==void 0&&e.offset.fromArray(t.offset),t.rotation!==void 0&&(e.rotation=t.rotation),t.scale!==void 0&&e.repeat.fromArray(t.scale),e.needsUpdate=!0),e}}class Yy{constructor(){this.name=Ye.KHR_MESH_QUANTIZATION}}class xd extends mr{constructor(e,t,n,s){super(e,t,n,s)}copySampleValue_(e){const t=this.resultBuffer,n=this.sampleValues,s=this.valueSize,r=e*s*3+s;for(let o=0;o!==s;o++)t[o]=n[r+o];return t}interpolate_(e,t,n,s){const r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,c=a*2,l=a*3,u=s-t,h=(n-t)/u,d=h*h,p=d*h,g=e*l,_=g-l,m=-2*p+3*d,f=p-d,y=1-m,x=f-d+h;for(let v=0;v!==a;v++){const A=o[_+v+a],w=o[_+v+c]*u,R=o[g+v+a],C=o[g+v]*u;r[v]=y*A+x*w+m*R+f*C}return r}}const $y=new ln;class Zy extends xd{interpolate_(e,t,n,s){const r=super.interpolate_(e,t,n,s);return $y.fromArray(r).normalize().toArray(r),r}}const pn={POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6},gs={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},Nu={9728:jt,9729:rn,9984:Ch,9985:Jr,9986:$s,9987:qn},Uu={33071:di,33648:lo,10497:Ni},ma={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},yc={POSITION:"position",NORMAL:"normal",TANGENT:"tangent",TEXCOORD_0:"uv",TEXCOORD_1:"uv1",TEXCOORD_2:"uv2",TEXCOORD_3:"uv3",COLOR_0:"color",WEIGHTS_0:"skinWeight",JOINTS_0:"skinIndex"},ci={scale:"scale",translation:"position",rotation:"quaternion",weights:"morphTargetInfluences"},Jy={CUBICSPLINE:void 0,LINEAR:lr,STEP:cr},ga={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};function Qy(i){return i.DefaultMaterial===void 0&&(i.DefaultMaterial=new xn({color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:Jn})),i.DefaultMaterial}function wi(i,e,t){for(const n in t.extensions)i[n]===void 0&&(e.userData.gltfExtensions=e.userData.gltfExtensions||{},e.userData.gltfExtensions[n]=t.extensions[n])}function Xn(i,e){e.extras!==void 0&&(typeof e.extras=="object"?Object.assign(i.userData,e.extras):console.warn("THREE.GLTFLoader: Ignoring primitive type .extras, "+e.extras))}function eM(i,e,t){let n=!1,s=!1,r=!1;for(let l=0,u=e.length;l<u;l++){const h=e[l];if(h.POSITION!==void 0&&(n=!0),h.NORMAL!==void 0&&(s=!0),h.COLOR_0!==void 0&&(r=!0),n&&s&&r)break}if(!n&&!s&&!r)return Promise.resolve(i);const o=[],a=[],c=[];for(let l=0,u=e.length;l<u;l++){const h=e[l];if(n){const d=h.POSITION!==void 0?t.getDependency("accessor",h.POSITION):i.attributes.position;o.push(d)}if(s){const d=h.NORMAL!==void 0?t.getDependency("accessor",h.NORMAL):i.attributes.normal;a.push(d)}if(r){const d=h.COLOR_0!==void 0?t.getDependency("accessor",h.COLOR_0):i.attributes.color;c.push(d)}}return Promise.all([Promise.all(o),Promise.all(a),Promise.all(c)]).then(function(l){const u=l[0],h=l[1],d=l[2];return n&&(i.morphAttributes.position=u),s&&(i.morphAttributes.normal=h),r&&(i.morphAttributes.color=d),i.morphTargetsRelative=!0,i})}function tM(i,e){if(i.updateMorphTargets(),e.weights!==void 0)for(let t=0,n=e.weights.length;t<n;t++)i.morphTargetInfluences[t]=e.weights[t];if(e.extras&&Array.isArray(e.extras.targetNames)){const t=e.extras.targetNames;if(i.morphTargetInfluences.length===t.length){i.morphTargetDictionary={};for(let n=0,s=t.length;n<s;n++)i.morphTargetDictionary[t[n]]=n}else console.warn("THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.")}}function nM(i){let e;const t=i.extensions&&i.extensions[Ye.KHR_DRACO_MESH_COMPRESSION];if(t?e="draco:"+t.bufferView+":"+t.indices+":"+_a(t.attributes):e=i.indices+":"+_a(i.attributes)+":"+i.mode,i.targets!==void 0)for(let n=0,s=i.targets.length;n<s;n++)e+=":"+_a(i.targets[n]);return e}function _a(i){let e="";const t=Object.keys(i).sort();for(let n=0,s=t.length;n<s;n++)e+=t[n]+":"+i[t[n]]+";";return e}function Mc(i){switch(i){case Int8Array:return 1/127;case Uint8Array:return 1/255;case Int16Array:return 1/32767;case Uint16Array:return 1/65535;default:throw new Error("THREE.GLTFLoader: Unsupported normalized accessor component type.")}}function iM(i){return i.search(/\.jpe?g($|\?)/i)>0||i.search(/^data\:image\/jpeg/)===0?"image/jpeg":i.search(/\.webp($|\?)/i)>0||i.search(/^data\:image\/webp/)===0?"image/webp":i.search(/\.ktx2($|\?)/i)>0||i.search(/^data\:image\/ktx2/)===0?"image/ktx2":"image/png"}const sM=new He;class rM{constructor(e={},t={}){this.json=e,this.extensions={},this.plugins={},this.options=t,this.cache=new wy,this.associations=new Map,this.primitiveCache={},this.nodeCache={},this.meshCache={refs:{},uses:{}},this.cameraCache={refs:{},uses:{}},this.lightCache={refs:{},uses:{}},this.sourceCache={},this.textureCache={},this.nodeNamesUsed={};let n=!1,s=-1,r=!1,o=-1;if(typeof navigator<"u"){const a=navigator.userAgent;n=/^((?!chrome|android).)*safari/i.test(a)===!0;const c=a.match(/Version\/(\d+)/);s=n&&c?parseInt(c[1],10):-1,r=a.indexOf("Firefox")>-1,o=r?a.match(/Firefox\/([0-9]+)\./)[1]:-1}typeof createImageBitmap>"u"||n&&s<17||r&&o<98?this.textureLoader=new ig(this.options.manager):this.textureLoader=new lg(this.options.manager),this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader=new od(this.options.manager),this.fileLoader.setResponseType("arraybuffer"),this.options.crossOrigin==="use-credentials"&&this.fileLoader.setWithCredentials(!0)}setExtensions(e){this.extensions=e}setPlugins(e){this.plugins=e}parse(e,t){const n=this,s=this.json,r=this.extensions;this.cache.removeAll(),this.nodeCache={},this._invokeAll(function(o){return o._markDefs&&o._markDefs()}),Promise.all(this._invokeAll(function(o){return o.beforeRoot&&o.beforeRoot()})).then(function(){return Promise.all([n.getDependencies("scene"),n.getDependencies("animation"),n.getDependencies("camera")])}).then(function(o){const a={scene:o[0][s.scene||0],scenes:o[0],animations:o[1],cameras:o[2],asset:s.asset,parser:n,userData:{}};return wi(r,a,s),Xn(a,s),Promise.all(n._invokeAll(function(c){return c.afterRoot&&c.afterRoot(a)})).then(function(){for(const c of a.scenes)c.updateMatrixWorld();e(a)})}).catch(t)}_markDefs(){const e=this.json.nodes||[],t=this.json.skins||[],n=this.json.meshes||[];for(let s=0,r=t.length;s<r;s++){const o=t[s].joints;for(let a=0,c=o.length;a<c;a++)e[o[a]].isBone=!0}for(let s=0,r=e.length;s<r;s++){const o=e[s];o.mesh!==void 0&&(this._addNodeRef(this.meshCache,o.mesh),o.skin!==void 0&&(n[o.mesh].isSkinnedMesh=!0)),o.camera!==void 0&&this._addNodeRef(this.cameraCache,o.camera)}}_addNodeRef(e,t){t!==void 0&&(e.refs[t]===void 0&&(e.refs[t]=e.uses[t]=0),e.refs[t]++)}_getNodeRef(e,t,n){if(e.refs[t]<=1)return n;const s=n.clone(),r=(o,a)=>{const c=this.associations.get(o);c!=null&&this.associations.set(a,c);for(const[l,u]of o.children.entries())r(u,a.children[l])};return r(n,s),s.name+="_instance_"+e.uses[t]++,s}_invokeOne(e){const t=Object.values(this.plugins);t.push(this);for(let n=0;n<t.length;n++){const s=e(t[n]);if(s)return s}return null}_invokeAll(e){const t=Object.values(this.plugins);t.unshift(this);const n=[];for(let s=0;s<t.length;s++){const r=e(t[s]);r&&n.push(r)}return n}getDependency(e,t){const n=e+":"+t;let s=this.cache.get(n);if(!s){switch(e){case"scene":s=this.loadScene(t);break;case"node":s=this._invokeOne(function(r){return r.loadNode&&r.loadNode(t)});break;case"mesh":s=this._invokeOne(function(r){return r.loadMesh&&r.loadMesh(t)});break;case"accessor":s=this.loadAccessor(t);break;case"bufferView":s=this._invokeOne(function(r){return r.loadBufferView&&r.loadBufferView(t)});break;case"buffer":s=this.loadBuffer(t);break;case"material":s=this._invokeOne(function(r){return r.loadMaterial&&r.loadMaterial(t)});break;case"texture":s=this._invokeOne(function(r){return r.loadTexture&&r.loadTexture(t)});break;case"skin":s=this.loadSkin(t);break;case"animation":s=this._invokeOne(function(r){return r.loadAnimation&&r.loadAnimation(t)});break;case"camera":s=this.loadCamera(t);break;default:if(s=this._invokeOne(function(r){return r!=this&&r.getDependency&&r.getDependency(e,t)}),!s)throw new Error("Unknown type: "+e);break}this.cache.add(n,s)}return s}getDependencies(e){let t=this.cache.get(e);if(!t){const n=this,s=this.json[e+(e==="mesh"?"es":"s")]||[];t=Promise.all(s.map(function(r,o){return n.getDependency(e,o)})),this.cache.add(e,t)}return t}loadBuffer(e){const t=this.json.buffers[e],n=this.fileLoader;if(t.type&&t.type!=="arraybuffer")throw new Error("THREE.GLTFLoader: "+t.type+" buffer type is not supported.");if(t.uri===void 0&&e===0)return Promise.resolve(this.extensions[Ye.KHR_BINARY_GLTF].body);const s=this.options;return new Promise(function(r,o){n.load(nr.resolveURL(t.uri,s.path),r,void 0,function(){o(new Error('THREE.GLTFLoader: Failed to load buffer "'+t.uri+'".'))})})}loadBufferView(e){const t=this.json.bufferViews[e];return this.getDependency("buffer",t.buffer).then(function(n){const s=t.byteLength||0,r=t.byteOffset||0;return n.slice(r,r+s)})}loadAccessor(e){const t=this,n=this.json,s=this.json.accessors[e];if(s.bufferView===void 0&&s.sparse===void 0){const o=ma[s.type],a=gs[s.componentType],c=s.normalized===!0,l=new a(s.count*o);return Promise.resolve(new Ft(l,o,c))}const r=[];return s.bufferView!==void 0?r.push(this.getDependency("bufferView",s.bufferView)):r.push(null),s.sparse!==void 0&&(r.push(this.getDependency("bufferView",s.sparse.indices.bufferView)),r.push(this.getDependency("bufferView",s.sparse.values.bufferView))),Promise.all(r).then(function(o){const a=o[0],c=ma[s.type],l=gs[s.componentType],u=l.BYTES_PER_ELEMENT,h=u*c,d=s.byteOffset||0,p=s.bufferView!==void 0?n.bufferViews[s.bufferView].byteStride:void 0,g=s.normalized===!0;let _,m;if(p&&p!==h){const f=Math.floor(d/p),y="InterleavedBuffer:"+s.bufferView+":"+s.componentType+":"+f+":"+s.count;let x=t.cache.get(y);x||(_=new l(a,f*p,s.count*p/u),x=new Yh(_,p/u),t.cache.add(y,x)),m=new hr(x,c,d%p/u,g)}else a===null?_=new l(s.count*c):_=new l(a,d,s.count*c),m=new Ft(_,c,g);if(s.sparse!==void 0){const f=ma.SCALAR,y=gs[s.sparse.indices.componentType],x=s.sparse.indices.byteOffset||0,v=s.sparse.values.byteOffset||0,A=new y(o[1],x,s.sparse.count*f),w=new l(o[2],v,s.sparse.count*c);a!==null&&(m=new Ft(m.array.slice(),m.itemSize,m.normalized)),m.normalized=!1;for(let R=0,C=A.length;R<C;R++){const S=A[R];if(m.setX(S,w[R*c]),c>=2&&m.setY(S,w[R*c+1]),c>=3&&m.setZ(S,w[R*c+2]),c>=4&&m.setW(S,w[R*c+3]),c>=5)throw new Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.")}m.normalized=g}return m})}loadTexture(e){const t=this.json,n=this.options,r=t.textures[e].source,o=t.images[r];let a=this.textureLoader;if(o.uri){const c=n.manager.getHandler(o.uri);c!==null&&(a=c)}return this.loadTextureImage(e,r,a)}loadTextureImage(e,t,n){const s=this,r=this.json,o=r.textures[e],a=r.images[t],c=(a.uri||a.bufferView)+":"+o.sampler;if(this.textureCache[c])return this.textureCache[c];const l=this.loadImageSource(t,n).then(function(u){u.flipY=!1,u.name=o.name||a.name||"",u.name===""&&typeof a.uri=="string"&&a.uri.startsWith("data:image/")===!1&&(u.name=a.uri);const d=(r.samplers||{})[o.sampler]||{};return u.magFilter=Nu[d.magFilter]||rn,u.minFilter=Nu[d.minFilter]||qn,u.wrapS=Uu[d.wrapS]||Ni,u.wrapT=Uu[d.wrapT]||Ni,u.generateMipmaps=!u.isCompressedTexture&&u.minFilter!==jt&&u.minFilter!==rn,s.associations.set(u,{textures:e}),u}).catch(function(){return null});return this.textureCache[c]=l,l}loadImageSource(e,t){const n=this,s=this.json,r=this.options;if(this.sourceCache[e]!==void 0)return this.sourceCache[e].then(h=>h.clone());const o=s.images[e],a=self.URL||self.webkitURL;let c=o.uri||"",l=!1;if(o.bufferView!==void 0)c=n.getDependency("bufferView",o.bufferView).then(function(h){l=!0;const d=new Blob([h],{type:o.mimeType});return c=a.createObjectURL(d),c});else if(o.uri===void 0)throw new Error("THREE.GLTFLoader: Image "+e+" is missing URI and bufferView");const u=Promise.resolve(c).then(function(h){return new Promise(function(d,p){let g=d;t.isImageBitmapLoader===!0&&(g=function(_){const m=new Ct(_);m.needsUpdate=!0,d(m)}),t.load(nr.resolveURL(h,r.path),g,void 0,p)})}).then(function(h){return l===!0&&a.revokeObjectURL(c),Xn(h,o),h.userData.mimeType=o.mimeType||iM(o.uri),h}).catch(function(h){throw console.error("THREE.GLTFLoader: Couldn't load texture",c),h});return this.sourceCache[e]=u,u}assignTexture(e,t,n,s){const r=this;return this.getDependency("texture",n.index).then(function(o){if(!o)return null;if(n.texCoord!==void 0&&n.texCoord>0&&(o=o.clone(),o.channel=n.texCoord),r.extensions[Ye.KHR_TEXTURE_TRANSFORM]){const a=n.extensions!==void 0?n.extensions[Ye.KHR_TEXTURE_TRANSFORM]:void 0;if(a){const c=r.associations.get(o);o=r.extensions[Ye.KHR_TEXTURE_TRANSFORM].extendTexture(o,a),r.associations.set(o,c)}}return s!==void 0&&(o.colorSpace=s),e[t]=o,o})}assignFinalMaterial(e){const t=e.geometry;let n=e.material;const s=t.attributes.tangent===void 0,r=t.attributes.color!==void 0,o=t.attributes.normal===void 0;if(e.isPoints){const a="PointsMaterial:"+n.uuid;let c=this.cache.get(a);c||(c=new Xc,An.prototype.copy.call(c,n),c.color.copy(n.color),c.map=n.map,c.sizeAttenuation=!1,this.cache.add(a,c)),n=c}else if(e.isLine){const a="LineBasicMaterial:"+n.uuid;let c=this.cache.get(a);c||(c=new Wc,An.prototype.copy.call(c,n),c.color.copy(n.color),c.map=n.map,this.cache.add(a,c)),n=c}if(s||r||o){let a="ClonedMaterial:"+n.uuid+":";s&&(a+="derivative-tangents:"),r&&(a+="vertex-colors:"),o&&(a+="flat-shading:");let c=this.cache.get(a);c||(c=n.clone(),r&&(c.vertexColors=!0),o&&(c.flatShading=!0),s&&(c.normalScale&&(c.normalScale.y*=-1),c.clearcoatNormalScale&&(c.clearcoatNormalScale.y*=-1)),this.cache.add(a,c),this.associations.set(c,this.associations.get(n))),n=c}e.material=n}getMaterialType(){return xn}loadMaterial(e){const t=this,n=this.json,s=this.extensions,r=n.materials[e];let o;const a={},c=r.extensions||{},l=[];if(c[Ye.KHR_MATERIALS_UNLIT]){const h=s[Ye.KHR_MATERIALS_UNLIT];o=h.getMaterialType(),l.push(h.extendParams(a,r,t))}else{const h=r.pbrMetallicRoughness||{};if(a.color=new Ne(1,1,1),a.opacity=1,Array.isArray(h.baseColorFactor)){const d=h.baseColorFactor;a.color.setRGB(d[0],d[1],d[2],Kt),a.opacity=d[3]}h.baseColorTexture!==void 0&&l.push(t.assignTexture(a,"map",h.baseColorTexture,wt)),a.metalness=h.metallicFactor!==void 0?h.metallicFactor:1,a.roughness=h.roughnessFactor!==void 0?h.roughnessFactor:1,h.metallicRoughnessTexture!==void 0&&(l.push(t.assignTexture(a,"metalnessMap",h.metallicRoughnessTexture)),l.push(t.assignTexture(a,"roughnessMap",h.metallicRoughnessTexture))),o=this._invokeOne(function(d){return d.getMaterialType&&d.getMaterialType(e)}),l.push(Promise.all(this._invokeAll(function(d){return d.extendMaterialParams&&d.extendMaterialParams(e,a)})))}r.doubleSided===!0&&(a.side=sn);const u=r.alphaMode||ga.OPAQUE;if(u===ga.BLEND?(a.transparent=!0,a.depthWrite=!1):(a.transparent=!1,u===ga.MASK&&(a.alphaTest=r.alphaCutoff!==void 0?r.alphaCutoff:.5)),r.normalTexture!==void 0&&o!==on&&(l.push(t.assignTexture(a,"normalMap",r.normalTexture)),a.normalScale=new we(1,1),r.normalTexture.scale!==void 0)){const h=r.normalTexture.scale;a.normalScale.set(h,h)}if(r.occlusionTexture!==void 0&&o!==on&&(l.push(t.assignTexture(a,"aoMap",r.occlusionTexture)),r.occlusionTexture.strength!==void 0&&(a.aoMapIntensity=r.occlusionTexture.strength)),r.emissiveFactor!==void 0&&o!==on){const h=r.emissiveFactor;a.emissive=new Ne().setRGB(h[0],h[1],h[2],Kt)}return r.emissiveTexture!==void 0&&o!==on&&l.push(t.assignTexture(a,"emissiveMap",r.emissiveTexture,wt)),Promise.all(l).then(function(){const h=new o(a);return r.name&&(h.name=r.name),Xn(h,r),t.associations.set(h,{materials:e}),r.extensions&&wi(s,h,r),h})}createUniqueName(e){const t=ot.sanitizeNodeName(e||"");return t in this.nodeNamesUsed?t+"_"+ ++this.nodeNamesUsed[t]:(this.nodeNamesUsed[t]=0,t)}loadGeometries(e){const t=this,n=this.extensions,s=this.primitiveCache;function r(a){return n[Ye.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(a,t).then(function(c){return Ou(c,a,t)})}const o=[];for(let a=0,c=e.length;a<c;a++){const l=e[a],u=nM(l),h=s[u];if(h)o.push(h.promise);else{let d;l.extensions&&l.extensions[Ye.KHR_DRACO_MESH_COMPRESSION]?d=r(l):d=Ou(new Nt,l,t),s[u]={primitive:l,promise:d},o.push(d)}}return Promise.all(o)}loadMesh(e){const t=this,n=this.json,s=this.extensions,r=n.meshes[e],o=r.primitives,a=[];for(let c=0,l=o.length;c<l;c++){const u=o[c].material===void 0?Qy(this.cache):this.getDependency("material",o[c].material);a.push(u)}return a.push(t.loadGeometries(o)),Promise.all(a).then(function(c){const l=c.slice(0,c.length-1),u=c[c.length-1],h=[];for(let p=0,g=u.length;p<g;p++){const _=u[p],m=o[p];let f;const y=l[p];if(m.mode===pn.TRIANGLES||m.mode===pn.TRIANGLE_STRIP||m.mode===pn.TRIANGLE_FAN||m.mode===void 0)f=r.isSkinnedMesh===!0?new Om(_,y):new dt(_,y),f.isSkinnedMesh===!0&&f.normalizeSkinWeights(),m.mode===pn.TRIANGLE_STRIP?f.geometry=Lu(f.geometry,Fh):m.mode===pn.TRIANGLE_FAN&&(f.geometry=Lu(f.geometry,dc));else if(m.mode===pn.LINES)f=new Vm(_,y);else if(m.mode===pn.LINE_STRIP)f=new Mo(_,y);else if(m.mode===pn.LINE_LOOP)f=new Gm(_,y);else if(m.mode===pn.POINTS)f=new td(_,y);else throw new Error("THREE.GLTFLoader: Primitive mode unsupported: "+m.mode);Object.keys(f.geometry.morphAttributes).length>0&&tM(f,r),f.name=t.createUniqueName(r.name||"mesh_"+e),Xn(f,r),m.extensions&&wi(s,f,m),t.assignFinalMaterial(f),h.push(f)}for(let p=0,g=h.length;p<g;p++)t.associations.set(h[p],{meshes:e,primitives:p});if(h.length===1)return r.extensions&&wi(s,h[0],r),h[0];const d=new an;r.extensions&&wi(s,d,r),t.associations.set(d,{meshes:e});for(let p=0,g=h.length;p<g;p++)d.add(h[p]);return d})}loadCamera(e){let t;const n=this.json.cameras[e],s=n[n.type];if(!s){console.warn("THREE.GLTFLoader: Missing camera parameters.");return}return n.type==="perspective"?t=new Xt(zh.radToDeg(s.yfov),s.aspectRatio||1,s.znear||1,s.zfar||2e6):n.type==="orthographic"&&(t=new qc(-s.xmag,s.xmag,s.ymag,-s.ymag,s.znear,s.zfar)),n.name&&(t.name=this.createUniqueName(n.name)),Xn(t,n),Promise.resolve(t)}loadSkin(e){const t=this.json.skins[e],n=[];for(let s=0,r=t.joints.length;s<r;s++)n.push(this._loadNodeShallow(t.joints[s]));return t.inverseBindMatrices!==void 0?n.push(this.getDependency("accessor",t.inverseBindMatrices)):n.push(null),Promise.all(n).then(function(s){const r=s.pop(),o=s,a=[],c=[];for(let l=0,u=o.length;l<u;l++){const h=o[l];if(h){a.push(h);const d=new He;r!==null&&d.fromArray(r.array,l*16),c.push(d)}else console.warn('THREE.GLTFLoader: Joint "%s" could not be found.',t.joints[l])}return new Vc(a,c)})}loadAnimation(e){const t=this.json,n=this,s=t.animations[e],r=s.name?s.name:"animation_"+e,o=[],a=[],c=[],l=[],u=[];for(let h=0,d=s.channels.length;h<d;h++){const p=s.channels[h],g=s.samplers[p.sampler],_=p.target,m=_.node,f=s.parameters!==void 0?s.parameters[g.input]:g.input,y=s.parameters!==void 0?s.parameters[g.output]:g.output;_.node!==void 0&&(o.push(this.getDependency("node",m)),a.push(this.getDependency("accessor",f)),c.push(this.getDependency("accessor",y)),l.push(g),u.push(_))}return Promise.all([Promise.all(o),Promise.all(a),Promise.all(c),Promise.all(l),Promise.all(u)]).then(function(h){const d=h[0],p=h[1],g=h[2],_=h[3],m=h[4],f=[];for(let y=0,x=d.length;y<x;y++){const v=d[y],A=p[y],w=g[y],R=_[y],C=m[y];if(v===void 0)continue;v.updateMatrix&&v.updateMatrix();const S=n._createAnimationTracks(v,A,w,R,C);if(S)for(let M=0;M<S.length;M++)f.push(S[M])}return new gc(r,void 0,f)})}createNodeMesh(e){const t=this.json,n=this,s=t.nodes[e];return s.mesh===void 0?null:n.getDependency("mesh",s.mesh).then(function(r){const o=n._getNodeRef(n.meshCache,s.mesh,r);return s.weights!==void 0&&o.traverse(function(a){if(a.isMesh)for(let c=0,l=s.weights.length;c<l;c++)a.morphTargetInfluences[c]=s.weights[c]}),o})}loadNode(e){const t=this.json,n=this,s=t.nodes[e],r=n._loadNodeShallow(e),o=[],a=s.children||[];for(let l=0,u=a.length;l<u;l++)o.push(n.getDependency("node",a[l]));const c=s.skin===void 0?Promise.resolve(null):n.getDependency("skin",s.skin);return Promise.all([r,Promise.all(o),c]).then(function(l){const u=l[0],h=l[1],d=l[2];d!==null&&u.traverse(function(p){p.isSkinnedMesh&&p.bind(d,sM)});for(let p=0,g=h.length;p<g;p++)u.add(h[p]);return u})}_loadNodeShallow(e){const t=this.json,n=this.extensions,s=this;if(this.nodeCache[e]!==void 0)return this.nodeCache[e];const r=t.nodes[e],o=r.name?s.createUniqueName(r.name):"",a=[],c=s._invokeOne(function(l){return l.createNodeMesh&&l.createNodeMesh(e)});return c&&a.push(c),r.camera!==void 0&&a.push(s.getDependency("camera",r.camera).then(function(l){return s._getNodeRef(s.cameraCache,r.camera,l)})),s._invokeAll(function(l){return l.createNodeAttachment&&l.createNodeAttachment(e)}).forEach(function(l){a.push(l)}),this.nodeCache[e]=Promise.all(a).then(function(l){let u;if(r.isBone===!0?u=new Jh:l.length>1?u=new an:l.length===1?u=l[0]:u=new vt,u!==l[0])for(let h=0,d=l.length;h<d;h++)u.add(l[h]);if(r.name&&(u.userData.name=r.name,u.name=o),Xn(u,r),r.extensions&&wi(n,u,r),r.matrix!==void 0){const h=new He;h.fromArray(r.matrix),u.applyMatrix4(h)}else r.translation!==void 0&&u.position.fromArray(r.translation),r.rotation!==void 0&&u.quaternion.fromArray(r.rotation),r.scale!==void 0&&u.scale.fromArray(r.scale);if(!s.associations.has(u))s.associations.set(u,{});else if(r.mesh!==void 0&&s.meshCache.refs[r.mesh]>1){const h=s.associations.get(u);s.associations.set(u,{...h})}return s.associations.get(u).nodes=e,u}),this.nodeCache[e]}loadScene(e){const t=this.extensions,n=this.json.scenes[e],s=this,r=new an;n.name&&(r.name=s.createUniqueName(n.name)),Xn(r,n),n.extensions&&wi(t,r,n);const o=n.nodes||[],a=[];for(let c=0,l=o.length;c<l;c++)a.push(s.getDependency("node",o[c]));return Promise.all(a).then(function(c){for(let u=0,h=c.length;u<h;u++)r.add(c[u]);const l=u=>{const h=new Map;for(const[d,p]of s.associations)(d instanceof An||d instanceof Ct)&&h.set(d,p);return u.traverse(d=>{const p=s.associations.get(d);p!=null&&h.set(d,p)}),h};return s.associations=l(r),r})}_createAnimationTracks(e,t,n,s,r){const o=[],a=e.name?e.name:e.uuid,c=[];ci[r.path]===ci.weights?e.traverse(function(d){d.morphTargetInfluences&&c.push(d.name?d.name:d.uuid)}):c.push(a);let l;switch(ci[r.path]){case ci.weights:l=Es;break;case ci.rotation:l=Ss;break;case ci.translation:case ci.scale:l=Ts;break;default:n.itemSize===1?l=Es:l=Ts;break}const u=s.interpolation!==void 0?Jy[s.interpolation]:lr,h=this._getArrayFromAccessor(n);for(let d=0,p=c.length;d<p;d++){const g=new l(c[d]+"."+ci[r.path],t.array,h,u);s.interpolation==="CUBICSPLINE"&&this._createCubicSplineTrackInterpolant(g),o.push(g)}return o}_getArrayFromAccessor(e){let t=e.array;if(e.normalized){const n=Mc(t.constructor),s=new Float32Array(t.length);for(let r=0,o=t.length;r<o;r++)s[r]=t[r]*n;t=s}return t}_createCubicSplineTrackInterpolant(e){e.createInterpolant=function(n){const s=this instanceof Ss?Zy:xd;return new s(this.times,this.values,this.getValueSize()/3,n)},e.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline=!0}}function oM(i,e,t){const n=e.attributes,s=new Nn;if(n.POSITION!==void 0){const a=t.json.accessors[n.POSITION],c=a.min,l=a.max;if(c!==void 0&&l!==void 0){if(s.set(new N(c[0],c[1],c[2]),new N(l[0],l[1],l[2])),a.normalized){const u=Mc(gs[a.componentType]);s.min.multiplyScalar(u),s.max.multiplyScalar(u)}}else{console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");return}}else return;const r=e.targets;if(r!==void 0){const a=new N,c=new N;for(let l=0,u=r.length;l<u;l++){const h=r[l];if(h.POSITION!==void 0){const d=t.json.accessors[h.POSITION],p=d.min,g=d.max;if(p!==void 0&&g!==void 0){if(c.setX(Math.max(Math.abs(p[0]),Math.abs(g[0]))),c.setY(Math.max(Math.abs(p[1]),Math.abs(g[1]))),c.setZ(Math.max(Math.abs(p[2]),Math.abs(g[2]))),d.normalized){const _=Mc(gs[d.componentType]);c.multiplyScalar(_)}a.max(c)}else console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.")}}s.expandByVector(a)}i.boundingBox=s;const o=new Un;s.getCenter(o.center),o.radius=s.min.distanceTo(s.max)/2,i.boundingSphere=o}function Ou(i,e,t){const n=e.attributes,s=[];function r(o,a){return t.getDependency("accessor",o).then(function(c){i.setAttribute(a,c)})}for(const o in n){const a=yc[o]||o.toLowerCase();a in i.attributes||s.push(r(n[o],a))}if(e.indices!==void 0&&!i.index){const o=t.getDependency("accessor",e.indices).then(function(a){i.setIndex(a)});s.push(o)}return et.workingColorSpace!==Kt&&"COLOR_0"in n&&console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${et.workingColorSpace}" not supported.`),Xn(i,e),oM(i,e,t),Promise.all(s).then(function(){return e.targets!==void 0?eM(i,e.targets,t):i})}function aM(i){const e=new Map,t=new Map,n=i.clone();return vd(i,n,function(s,r){e.set(r,s),t.set(s,r)}),n.traverse(function(s){if(!s.isSkinnedMesh)return;const r=s,o=e.get(s),a=o.skeleton.bones;r.skeleton=o.skeleton.clone(),r.bindMatrix.copy(o.bindMatrix),r.skeleton.bones=a.map(function(c){return t.get(c)}),r.bind(r.skeleton,r.bindMatrix)}),n}function vd(i,e,t){t(i,e);for(let n=0;n<i.children.length;n++)vd(i.children[n],e.children[n],t)}const Fu=[1.98,1.85,1.72,1.9,2.02,1.8,1.95,1.88,1.7,1.92,2,1.78],ku=["Idle","Idle","Walk","Idle","Run","Walk"];async function cM(i,e){const t=await new Ay().loadAsync(`./models/${e.model}`),n=t.scene,s=t.animations,r=new Nn().setFromObject(n),o=r.max.y-r.min.y||1,a=e.shadowSize>0,c=[],l=uM(e.players);return l.forEach((u,h)=>{const d=aM(n);d.scale.setScalar(Fu[h%Fu.length]/o),d.position.set(u.x,0,u.z),d.rotation.y=u.z>0?Math.PI:0,d.traverse(_=>{_.isMesh&&(_.castShadow=a,_.frustumCulled=!1)}),i.add(d);const p=new Sg(d),g=lM(s,h);g&&(p.clipAction(g).play(),p.update(h*.37%g.duration)),c.push(p)}),{count:l.length,update(u){for(const h of c)h.update(u)}}}function lM(i,e){if(i.length===0)return null;const t=ku[e%ku.length];return i.find(n=>n.name===t)??i.find(n=>n.name!=="TPose")??i[0]}function uM(i){const e=[];for(const n of[2.5,6.5])for(const s of[-3,0,3])for(const r of[1,-1])e.push({x:s,z:n*r});const t=fe.WIDTH/2+fe.FREE_ZONE+1;for(let n=12;n<i;n+=1){const s=n-12,r=Math.floor(s/12),o=s%12,a=r%2===0?1:-1;e.push({x:a*(t+Math.floor(r/2)*1.2),z:(o-5.5)*1.6})}return e.slice(0,i)}const hM=1.85,dM={A:{jersey:3046399,shorts:1450559,trim:12572927},B:{jersey:16732992,shorts:3937554,trim:16765636}},fM={A:{jersey:16762161,shorts:1450559,trim:7033872},B:{jersey:15922424,shorts:3937554,trim:10133675}},Bu=[15249548,14260850,13208163,11104591,9067069],zu=[2106412,3352092,4009502,1382432,4863011],pM=15922424;function mM(i){let e=0;for(let t=0;t<i.length;t+=1)e=e*31+i.charCodeAt(t)>>>0;return e}let li=null;function gM(){return li||(li={hips:new Kn(.135,.1,4,12),torso:new Kn(.165,.34,4,14),head:new ms(.125,18,14),hair:new ms(.132,16,12),upperArm:new Kn(.058,.3,4,10),forearm:new Kn(.05,.28,4,10),hand:new ms(.055,10,8),thigh:new Kn(.088,.42,4,10),shin:new Kn(.062,.4,4,10),shoe:new mi(.13,.09,.26)},li.upperArm.translate(0,-.21,0),li.forearm.translate(0,-.19,0),li.thigh.translate(0,-.26,0),li.shin.translate(0,-.25,0),li)}const xa=new Map;function Ri(i){return xa.has(i)||xa.set(i,new xn({color:i,roughness:.82,metalness:.02})),xa.get(i)}function _M(i,e,t,n,s=!1){const r=gM(),o=s?fM[e]:dM[e],a=mM(i),c=Ri(Bu[a%Bu.length]),l=Ri(zu[(a>>3)%zu.length]),u=new an,h={},d=[],p=(x,v,A,w,R,C)=>{const S=new dt(v,A);return S.position.set(w,R,C),S.castShadow=n,x.add(S),d.push(S),S},g=(x,v,A,w,R)=>{const C=new an;return C.position.set(A,w,R),x.add(C),h[v]=C,C},_=new an;_.position.y=.96,u.add(_),p(_,r.hips,Ri(o.shorts),0,0,0).scale.set(1.05,.9,.8);for(const[x,v]of[["r",1],["l",-1]]){const A=g(_,`${x}Hip`,v*.095,-.04,0);p(A,r.thigh,Ri(o.shorts),0,0,0);const w=g(A,`${x}Knee`,0,-.46,0);p(w,r.shin,c,0,0,0),p(w,r.shoe,Ri(pM),0,-.44,.05)}const m=g(_,"spine",0,.12,0);p(m,r.torso,Ri(o.jersey),0,.26,0).scale.set(1.12,1,.8);const f=g(m,"neck",0,.5,0);p(f,r.head,c,0,.14,0),p(f,r.hair,l,0,.195,-.035).scale.set(.98,.62,.95);for(const[x,v]of[["r",1],["l",-1]]){const A=g(m,`${x}Shoulder`,v*.225,.42,0);p(A,r.upperArm,Ri(o.jersey),0,0,0);const w=g(A,`${x}Elbow`,0,-.32,0);p(w,r.forearm,c,0,0,0),p(w,r.hand,c,0,-.34,0)}return u.scale.setScalar(t/hM),{root:u,joints:h,meshes:d}}const xM=4.5,vM=5,yM=2.4,qr={bumpReady:{rSh:[-.95,-.24],lSh:[-.95,.24],rEl:0,lEl:0,spine:.5,neck:-.35,crouch:.2},bumpHit:{rSh:[-1.2,-.24],lSh:[-1.2,.24],rEl:0,lEl:0,spine:.32,neck:-.3,crouch:.08},setReach:{rSh:[-2.3,.3],lSh:[-2.3,-.3],rEl:-1,lEl:-1,spine:-.04,neck:-.45,crouch:.06},setPush:{rSh:[-2.72,.26],lSh:[-2.72,-.26],rEl:-.25,lEl:-.25,spine:0,neck:-.3},spikeWind:{rSh:[-2.5,-.38],lSh:[-2.1,.15],rEl:-1.9,lEl:-.3,spine:-.24,neck:-.2},spikeHit:{rSh:[-2.82,-.05],lSh:[-.85,.2],rEl:-.08,lEl:-.4,spine:.18,neck:-.05},spikeFollow:{rSh:[-.6,-.1],lSh:[-.45,.15],rEl:-.5,lEl:-.3,spine:.46,neck:.1},blockUp:{rSh:[-2.95,.12],lSh:[-2.95,-.12],rEl:0,lEl:0,spine:.04,neck:-.15},blockPunch:{rSh:[-2.52,.1],lSh:[-2.52,-.1],rEl:0,lEl:0,spine:.3,neck:-.2},windup:{rSh:[-2.35,-.35],lSh:[-2,.15],rEl:-1.8,lEl:-.3,spine:-.2,neck:-.18},land:{spine:.2,crouch:.26}},va={bump:{dur:.5,jump:0,land:!1,keys:[{at:0,p:"bumpReady"},{at:.45,p:"bumpHit"},{at:1,p:"bumpReady"}]},overhead:{dur:.55,jump:0,land:!1,keys:[{at:0,p:"setReach"},{at:.5,p:"setPush"},{at:1,p:"setReach"}]},spike:{dur:.6,jump:.55,land:!0,keys:[{at:0,p:"spikeWind"},{at:.42,p:"spikeHit"},{at:1,p:"spikeFollow"}]},serve:{dur:.72,jump:.3,land:!1,keys:[{at:0,p:"spikeWind"},{at:.5,p:"spikeHit"},{at:1,p:"spikeFollow"}]},block:{dur:.7,jump:.34,land:!0,keys:[{at:0,p:"blockUp"},{at:.4,p:"blockPunch"},{at:1,p:"blockUp"}]},windup:{dur:.75,jump:.5,land:!1,keys:[{at:0,p:"windup"},{at:1,p:"windup"}]},cheer:{dur:.9,jump:.26,land:!1,keys:[{at:0,p:"blockUp"},{at:1,p:"blockUp"}]}},MM=.08,EM=.2,ya=.72;function ui(i,e,t){return i+(e-i)*t}function Hu(i,e,t=0){return i[e]??t}function Vu(i,e){return i[e]??SM}const SM=[0,0];function TM(i){const e=i.joints;let t=null,n=null,s=0,r=0;const o={};function a(c,l,u){const h=c.keys;let d=0;for(;d<h.length-1&&l>h[d+1].at;)d+=1;const p=h[d],g=h[Math.min(d+1,h.length-1)],_=Math.max(g.at-p.at,1e-4),m=Math.min(Math.max((l-p.at)/_,0),1),f=qr[p.p],y=qr[g.p];for(const x of["rSh","lSh"]){const v=Vu(f,x),A=Vu(y,x);u[x]=[ui(v[0],A[0],m),ui(v[1],A[1],m)]}for(const x of["rEl","lEl","spine","neck","crouch"])u[x]=ui(Hu(f,x),Hu(y,x),m)}return{trigger(c){const l=va[c];if(!l)return;const u=t&&t.seq.jump>0&&l.jump>0?Math.min(t.t/t.seq.dur,.5)*l.dur:0;t={seq:l,t:u}},setHold(c){n=c},isIdle(){return t===null},update(c,l){const u=Math.min(l/xM,1);s+=(u-s)*(1-Math.exp(-10*c)),r+=c*(vM+l*yM);const h=Math.sin(r);let d=0,p=0,g=null;if(t){t.t+=c;const{seq:C}=t;if(t.t>=C.dur)t=null;else{const S=t.t/C.dur;if(d=Math.min(Math.min(t.t/MM,1),Math.min((C.dur-t.t)/EM,1)),a(C,S,o),g=o,C.jump>0&&(p=C.jump*Math.sin(S*Math.PI)),C.land&&S>ya){const M=(S-ya)/(1-ya);o.crouch+=qr.land.crouch*M,o.spine+=qr.land.spine*M}}}!g&&n&&va[n]&&(a(va[n],0,o),g=o,d=1);const _=Math.sin(r*.35)*.02,m=.62*s,f=.5*s,y=1-s,x=.16*s+.07*y+_,v=(g?o.crouch*d:0)+.02*y;e.rHip.rotation.x=-m*h-v*1.1,e.lHip.rotation.x=m*h-v*1.1,e.rKnee.rotation.x=(.12+Math.max(0,-h)*.95)*s+.14*y+v*2.2,e.lKnee.rotation.x=(.12+Math.max(0,h)*.95)*s+.14*y+v*2.2,e.spine.rotation.x=g?ui(x,o.spine,d):x,e.spine.rotation.y=0,e.neck.rotation.x=g?ui(-.04,o.neck,d):-.04;const A=-.35*y-.6*s,w={r:f*h-.12*y,l:-f*h-.12*y};for(const C of["r","l"]){const S=e[`${C}Shoulder`],M=e[`${C}Elbow`],T=g?o[`${C}Sh`]:null;S.rotation.x=g?ui(w[C],T[0],d):w[C],S.rotation.z=g?ui(0,T[1],d):0,M.rotation.x=g?ui(A,o[`${C}El`],d):A}const R=-.03*s*(.5+.5*Math.cos(r*2));return p-v*.55+R}}}const bM=1.6,AM={A:"#6ee7ff",B:"#ff9d7a"},wM={setter:"S",outside:"OH",middle:"MB",opposite:"OPP",libero:"L"};async function RM(i,e,t,n,s=null){let r=n;const o=e.shadowSize>0,a={};for(const d of Object.values(t.players)){const p=_M(d.id,d.teamId,d.height.current,o,d.currentRole==="libero");p.root.rotation.y=xt[d.teamId]===1?Math.PI:0,i.add(p.root),a[d.id]={rig:p,animator:TM(p),yaw:p.root.rotation.y,tag:PM(i),tagText:"",tagY:d.height.current+.45}}const c=CM(i),l=new dt(new So(.42,.55,40),new on({color:7268351,transparent:!0,opacity:.85}));l.rotation.x=-Math.PI/2,l.position.y=.02,i.add(l);let u=!1;function h(d){for(const p of d){const g=a[p.playerId];g&&(p.type==="SERVE"?g.animator.trigger("serve"):p.type==="BLOCK_TOUCH"?g.animator.trigger("block"):p.type==="TOUCH"&&(p.kind==="spike"?g.animator.trigger("spike"):p.kind==="set"?g.animator.trigger("overhead"):g.animator.trigger(p.ballY>=bM?"overhead":"bump")))}for(const p of d)p.type==="DEAD_BALL"&&p.at&&c.burst(p.at.x,p.at.z,10,.9)}return{count:Object.keys(a).length,triggerPose(d,p){a[d]?.animator.trigger(p)},setControlled(d){r=d},setHot(d){d!==u&&(u=d,l.material.color.setHex(d?16747586:7268351),l.scale.setScalar(d?1.35:1))},sync(d,p,g,_=[]){h(_);for(const[m,f]of Object.entries(a)){let y=!1;if(s)f.animator.setHold(s);else{const z=d.players[m].teamId,F=d.rally,X=d.phase==="rally"&&F.possession&&F.possession!==z&&F.touches>=1&&vn(d.match.rotations[z],m)&&Math.abs(d.actors[m].z)<2.2;y=d.actors[m].blockUntil>=d.tick||X,f.animator.setHold(y?"block":null)}const x=d.actors[m],v=x.px+(x.x-x.px)*p,A=x.pz+(x.z-x.pz)*p,w=d.players[m].teamId,R=(m===r?"你·":"")+(wM[d.players[m].currentRole]??"?");R!==f.tagText&&(f.tagText=R,LM(f.tag,R,AM[w])),f.tag.sprite.position.set(v,f.tagY,A);const C=(x.x-x.px)/Dt,S=(x.z-x.pz)/Dt,M=Math.hypot(C,S),T=d.players[m].teamId;let P=xt[T]===1?Math.PI:0;if(d.phase==="rally"&&!y){const z=d.ball,F=z.x-v,X=z.z-A;if(Math.hypot(F,X)>1.1)P=Math.atan2(F,X);else{const V=z.x-z.px,ee=z.z-z.pz;P=Math.hypot(V,ee)>1e-4?Math.atan2(-V,-ee):f.yaw}}f.yaw+=IM(f.yaw,P)*(1-Math.exp(-25*g));const O=f.animator.update(g,M);(f.lastBodyY??0)>.18&&O<=.03&&c.burst(v,A,6,.55),f.lastBodyY=O,f.rig.root.position.set(v,O,A),f.rig.root.rotation.y=f.yaw,m===r&&(l.position.x=v,l.position.z=A)}c.update(g)}}}function CM(i){const t=new Float32Array(288).fill(-100),n=new Float32Array(288),s=new Float32Array(96),r=new Nt;r.setAttribute("position",new Ft(t,3));const o=new td(r,new Xc({color:12166025,size:.09,transparent:!0,opacity:.55,depthWrite:!1}));o.frustumCulled=!1,i.add(o);let a=0,c=2166136261;const l=()=>(c=Math.imul(c^c>>>15,2246822519),(c>>>0)%1e3/1e3);return{burst(u,h,d,p){for(let g=0;g<d;g+=1){const _=a;a=(a+1)%96;const m=l()*Math.PI*2,f=(.4+l()*.9)*p;t[_*3]=u,t[_*3+1]=.06,t[_*3+2]=h,n[_*3]=Math.cos(m)*f,n[_*3+1]=.8+l()*1.2*p,n[_*3+2]=Math.sin(m)*f,s[_]=.4+l()*.25}},update(u){let h=!1;for(let d=0;d<96;d+=1)if(!(s[d]<=0)){if(h=!0,s[d]-=u,s[d]<=0){t[d*3+1]=-100;continue}n[d*3+1]-=4.5*u,t[d*3]+=n[d*3]*u,t[d*3+1]=Math.max(.02,t[d*3+1]+n[d*3+1]*u),t[d*3+2]+=n[d*3+2]*u}h&&(r.attributes.position.needsUpdate=!0)}}}function IM(i,e){let t=(e-i)%(Math.PI*2);return t>Math.PI&&(t-=Math.PI*2),t<-Math.PI&&(t+=Math.PI*2),t}function PM(i){const e=document.createElement("canvas");e.width=128,e.height=56;const t=new Eo(e),n=new Nm(new $h({map:t,transparent:!0,depthTest:!1}));return n.scale.set(.9,.4,1),n.renderOrder=5,i.add(n),{sprite:n,canvas:e,texture:t}}function LM(i,e,t){const n=i.canvas.getContext("2d");n.clearRect(0,0,128,56),n.font="bold 34px system-ui, sans-serif",n.textAlign="center",n.textBaseline="middle",n.lineWidth=6,n.strokeStyle="rgba(12,16,26,0.85)",n.strokeText(e,64,28),n.fillStyle=t,n.fillText(e,64,28),i.texture.needsUpdate=!0}const Gu=10,DM=9;function NM(i,e){const t=new dt(new ms(.105,24,18),new xn({map:UM(),roughness:.55}));t.castShadow=e.shadowSize>0,i.add(t);const n=new dt(new jc(.14,24),new on({color:0,transparent:!0,opacity:.35}));n.rotation.x=-Math.PI/2,n.position.y=.012,i.add(n);const s=new Float32Array(Gu*3),r=new Nt;r.setAttribute("position",new Ft(s,3));const o=new Mo(r,new Wc({color:16774064,transparent:!0,opacity:.55}));return o.visible=!1,o.frustumCulled=!1,i.add(o),{sync(a,c,l=1/60){const u=a.px+(a.x-a.px)*c,h=a.py+(a.y-a.py)*c,d=a.pz+(a.z-a.pz)*c;t.position.set(u,h,d),t.rotation.x+=4.8*l,n.position.x=u,n.position.z=d;for(let m=Gu-1;m>0;m-=1)s[m*3]=s[(m-1)*3],s[m*3+1]=s[(m-1)*3+1],s[m*3+2]=s[(m-1)*3+2];s[0]=u,s[1]=h,s[2]=d,r.attributes.position.needsUpdate=!0;const p=Math.hypot(a.x-a.px,a.y-a.py,a.z-a.pz)/Dt;o.visible=p>DM;const g=Math.min(Math.max(h,0),8)/8;n.material.opacity=.4*(1-g*.8);const _=1+g*1.5;n.scale.set(_,_,1)}}}function UM(){const i=document.createElement("canvas");i.width=256,i.height=128;const e=i.getContext("2d"),t=["#f7d117","#1a4fa0","#f7d117","#ffffff","#1a4fa0","#f7d117"],n=i.height/t.length;t.forEach((r,o)=>{e.fillStyle=r,e.fillRect(0,o*n,i.width,n+1)});const s=new Eo(i);return s.colorSpace=wt,s}const zt={TRANSITION_SEC:.07,THIRD_BACK:5.4,THIRD_HEIGHT:3.8,LOOK_AHEAD:4.5,LOOK_HEIGHT:1,FOLLOW_K:9,FP_EYE_RATIO:.93,FP_YAW_RANGE:1.05,FP_PITCH_RANGE:.5,SPIKE_CAM_DIST:3};function OM(i,e){return 1-Math.exp(-9*Math.max(e,0))}function FM(i,e){let t=e,n="third",s=0;const r=new N,o=new N,a=new N().copy(i.position),c=new N(0,1,0);let l={x:0,y:0},u=!1,h=!1,d=!1;function p(g){const _=g.players[t];if(!_)return"third";if(u)return"attack";if(h)return"defend";if(g.phase==="serve"&&_n(g.match)===t)return"first";if(g.phase==="rally"){const m=g.rally,f=g.actors[t],y=Math.hypot(g.ball.x-f.x,g.ball.z-f.z)<zt.SPIKE_CAM_DIST;if(m.possession===_.teamId&&m.touches===2&&y&&d)return"first"}return"third"}return{setPlayerId(g){t=g},setAttackView(g){u=g},setDefendView(g){h=g},setSpikeMine(g){d=g},setLook(g,_){l={x:g,y:_}},resetLook(){l={x:0,y:0}},getMode(){return n},gazePoint(g){const _=g.players[t],m=g.actors[t],f=xt[_.teamId],y=_.height.current*zt.FP_EYE_RATIO,x=Wu(f)+l.x*zt.FP_YAW_RANGE*-f,v=-.28+l.y*zt.FP_PITCH_RANGE,A=Xu(x,v);if(A.y>=-.02)return{x:m.x+A.x*9,z:m.z+A.z*9};const w=y/-A.y;return{x:m.x+A.x*w,z:m.z+A.z*w}},update(g,_,m=1/60){const f=g.players[t],y=g.actors[t],x=xt[f.teamId],v=y.px+(y.x-y.px)*_,A=y.pz+(y.z-y.pz)*_,w=p(g);w!==n&&(n=w,s=zt.TRANSITION_SEC,r.copy(a),o.copy(c));const R=new N,C=new N;if(n==="defend"){const S=f.height.current*zt.FP_EYE_RATIO;R.set(v*.92,S+1.15,A+x*1.7),C.set(v*.6,2,A-x*5)}else if(n==="attack"){const S=f.height.current*zt.FP_EYE_RATIO;R.set(v*.92,S+1.3,A+x*2),C.set(v*.5,1.7,A-x*6)}else if(n==="first"){const S=f.height.current*zt.FP_EYE_RATIO,M=Wu(x)+l.x*zt.FP_YAW_RANGE*-x,T=-.12+l.y*zt.FP_PITCH_RANGE,D=Xu(M,T);R.set(v,S,A),C.set(v+D.x*8,S+D.y*8,A+D.z*8)}else R.set(v*.72,zt.THIRD_HEIGHT,A+x*zt.THIRD_BACK),C.set(v*.5,zt.LOOK_HEIGHT,A-x*zt.LOOK_AHEAD);if(s>0){s=Math.max(0,s-m);const S=1-s/zt.TRANSITION_SEC;a.lerpVectors(r,R,ju(S)),c.lerpVectors(o,C,ju(S))}else if(n==="third"){const S=OM(zt.FOLLOW_K,m);a.lerp(R,S),c.lerp(C,S)}else a.copy(R),c.copy(C);i.position.copy(a),i.lookAt(c)}}}function Wu(i){return i===1?Math.PI:0}function Xu(i,e){const t=Math.cos(e);return new N(Math.sin(i)*t,Math.sin(e),Math.cos(i)*t)}function ju(i){return 1-(1-i)*(1-i)}const Ku={type:"change"},Jc={type:"start"},yd={type:"end"},Yr=new bs,qu=new jn,kM=Math.cos(70*zh.DEG2RAD),Rt=new N,Yt=2*Math.PI,ht={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},Ma=1e-6;class BM extends bg{constructor(e,t=null){super(e,t),this.state=ht.NONE,this.target=new N,this.cursor=new N,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.keyRotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:"ArrowLeft",UP:"ArrowUp",RIGHT:"ArrowRight",BOTTOM:"ArrowDown"},this.mouseButtons={LEFT:hs.ROTATE,MIDDLE:hs.DOLLY,RIGHT:hs.PAN},this.touches={ONE:os.ROTATE,TWO:os.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._domElementKeyEvents=null,this._lastPosition=new N,this._lastQuaternion=new ln,this._lastTargetPosition=new N,this._quat=new ln().setFromUnitVectors(e.up,new N(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new ru,this._sphericalDelta=new ru,this._scale=1,this._panOffset=new N,this._rotateStart=new we,this._rotateEnd=new we,this._rotateDelta=new we,this._panStart=new we,this._panEnd=new we,this._panDelta=new we,this._dollyStart=new we,this._dollyEnd=new we,this._dollyDelta=new we,this._dollyDirection=new N,this._mouse=new we,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=HM.bind(this),this._onPointerDown=zM.bind(this),this._onPointerUp=VM.bind(this),this._onContextMenu=YM.bind(this),this._onMouseWheel=XM.bind(this),this._onKeyDown=jM.bind(this),this._onTouchStart=KM.bind(this),this._onTouchMove=qM.bind(this),this._onMouseDown=GM.bind(this),this._onMouseMove=WM.bind(this),this._interceptControlDown=$M.bind(this),this._interceptControlUp=ZM.bind(this),this.domElement!==null&&this.connect(this.domElement),this.update()}connect(e){super.connect(e),this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointercancel",this._onPointerUp),this.domElement.addEventListener("contextmenu",this._onContextMenu),this.domElement.addEventListener("wheel",this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener("keydown",this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction="none"}disconnect(){this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.domElement.removeEventListener("pointercancel",this._onPointerUp),this.domElement.removeEventListener("wheel",this._onMouseWheel),this.domElement.removeEventListener("contextmenu",this._onContextMenu),this.stopListenToKeyEvents(),this.domElement.getRootNode().removeEventListener("keydown",this._interceptControlDown,{capture:!0}),this.domElement.style.touchAction="auto"}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(e){e.addEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=e}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(Ku),this.update(),this.state=ht.NONE}update(e=null){const t=this.object.position;Rt.copy(t).sub(this.target),Rt.applyQuaternion(this._quat),this._spherical.setFromVector3(Rt),this.autoRotate&&this.state===ht.NONE&&this._rotateLeft(this._getAutoRotationAngle(e)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let n=this.minAzimuthAngle,s=this.maxAzimuthAngle;isFinite(n)&&isFinite(s)&&(n<-Math.PI?n+=Yt:n>Math.PI&&(n-=Yt),s<-Math.PI?s+=Yt:s>Math.PI&&(s-=Yt),n<=s?this._spherical.theta=Math.max(n,Math.min(s,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(n+s)/2?Math.max(n,this._spherical.theta):Math.min(s,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let r=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{const o=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),r=o!=this._spherical.radius}if(Rt.setFromSpherical(this._spherical),Rt.applyQuaternion(this._quatInverse),t.copy(this.target).add(Rt),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let o=null;if(this.object.isPerspectiveCamera){const a=Rt.length();o=this._clampDistance(a*this._scale);const c=a-o;this.object.position.addScaledVector(this._dollyDirection,c),this.object.updateMatrixWorld(),r=!!c}else if(this.object.isOrthographicCamera){const a=new N(this._mouse.x,this._mouse.y,0);a.unproject(this.object);const c=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),r=c!==this.object.zoom;const l=new N(this._mouse.x,this._mouse.y,0);l.unproject(this.object),this.object.position.sub(l).add(a),this.object.updateMatrixWorld(),o=Rt.length()}else console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled."),this.zoomToCursor=!1;o!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(o).add(this.object.position):(Yr.origin.copy(this.object.position),Yr.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(Yr.direction))<kM?this.object.lookAt(this.target):(qu.setFromNormalAndCoplanarPoint(this.object.up,this.target),Yr.intersectPlane(qu,this.target))))}else if(this.object.isOrthographicCamera){const o=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),o!==this.object.zoom&&(this.object.updateProjectionMatrix(),r=!0)}return this._scale=1,this._performCursorZoom=!1,r||this._lastPosition.distanceToSquared(this.object.position)>Ma||8*(1-this._lastQuaternion.dot(this.object.quaternion))>Ma||this._lastTargetPosition.distanceToSquared(this.target)>Ma?(this.dispatchEvent(Ku),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(e){return e!==null?Yt/60*this.autoRotateSpeed*e:Yt/60/60*this.autoRotateSpeed}_getZoomScale(e){const t=Math.abs(e*.01);return Math.pow(.95,this.zoomSpeed*t)}_rotateLeft(e){this._sphericalDelta.theta-=e}_rotateUp(e){this._sphericalDelta.phi-=e}_panLeft(e,t){Rt.setFromMatrixColumn(t,0),Rt.multiplyScalar(-e),this._panOffset.add(Rt)}_panUp(e,t){this.screenSpacePanning===!0?Rt.setFromMatrixColumn(t,1):(Rt.setFromMatrixColumn(t,0),Rt.crossVectors(this.object.up,Rt)),Rt.multiplyScalar(e),this._panOffset.add(Rt)}_pan(e,t){const n=this.domElement;if(this.object.isPerspectiveCamera){const s=this.object.position;Rt.copy(s).sub(this.target);let r=Rt.length();r*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*e*r/n.clientHeight,this.object.matrix),this._panUp(2*t*r/n.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(e*(this.object.right-this.object.left)/this.object.zoom/n.clientWidth,this.object.matrix),this._panUp(t*(this.object.top-this.object.bottom)/this.object.zoom/n.clientHeight,this.object.matrix)):(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled."),this.enablePan=!1)}_dollyOut(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=e:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_dollyIn(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=e:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_updateZoomParameters(e,t){if(!this.zoomToCursor)return;this._performCursorZoom=!0;const n=this.domElement.getBoundingClientRect(),s=e-n.left,r=t-n.top,o=n.width,a=n.height;this._mouse.x=s/o*2-1,this._mouse.y=-(r/a)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(e){return Math.max(this.minDistance,Math.min(this.maxDistance,e))}_handleMouseDownRotate(e){this._rotateStart.set(e.clientX,e.clientY)}_handleMouseDownDolly(e){this._updateZoomParameters(e.clientX,e.clientX),this._dollyStart.set(e.clientX,e.clientY)}_handleMouseDownPan(e){this._panStart.set(e.clientX,e.clientY)}_handleMouseMoveRotate(e){this._rotateEnd.set(e.clientX,e.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);const t=this.domElement;this._rotateLeft(Yt*this._rotateDelta.x/t.clientHeight),this._rotateUp(Yt*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(e){this._dollyEnd.set(e.clientX,e.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(e){this._panEnd.set(e.clientX,e.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(e){this._updateZoomParameters(e.clientX,e.clientY),e.deltaY<0?this._dollyIn(this._getZoomScale(e.deltaY)):e.deltaY>0&&this._dollyOut(this._getZoomScale(e.deltaY)),this.update()}_handleKeyDown(e){let t=!1;switch(e.code){case this.keys.UP:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(Yt*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,this.keyPanSpeed),t=!0;break;case this.keys.BOTTOM:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(-Yt*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,-this.keyPanSpeed),t=!0;break;case this.keys.LEFT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(Yt*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(this.keyPanSpeed,0),t=!0;break;case this.keys.RIGHT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(-Yt*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(-this.keyPanSpeed,0),t=!0;break}t&&(e.preventDefault(),this.update())}_handleTouchStartRotate(e){if(this._pointers.length===1)this._rotateStart.set(e.pageX,e.pageY);else{const t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),s=.5*(e.pageY+t.y);this._rotateStart.set(n,s)}}_handleTouchStartPan(e){if(this._pointers.length===1)this._panStart.set(e.pageX,e.pageY);else{const t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),s=.5*(e.pageY+t.y);this._panStart.set(n,s)}}_handleTouchStartDolly(e){const t=this._getSecondPointerPosition(e),n=e.pageX-t.x,s=e.pageY-t.y,r=Math.sqrt(n*n+s*s);this._dollyStart.set(0,r)}_handleTouchStartDollyPan(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enablePan&&this._handleTouchStartPan(e)}_handleTouchStartDollyRotate(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enableRotate&&this._handleTouchStartRotate(e)}_handleTouchMoveRotate(e){if(this._pointers.length==1)this._rotateEnd.set(e.pageX,e.pageY);else{const n=this._getSecondPointerPosition(e),s=.5*(e.pageX+n.x),r=.5*(e.pageY+n.y);this._rotateEnd.set(s,r)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);const t=this.domElement;this._rotateLeft(Yt*this._rotateDelta.x/t.clientHeight),this._rotateUp(Yt*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(e){if(this._pointers.length===1)this._panEnd.set(e.pageX,e.pageY);else{const t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),s=.5*(e.pageY+t.y);this._panEnd.set(n,s)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(e){const t=this._getSecondPointerPosition(e),n=e.pageX-t.x,s=e.pageY-t.y,r=Math.sqrt(n*n+s*s);this._dollyEnd.set(0,r),this._dollyDelta.set(0,Math.pow(this._dollyEnd.y/this._dollyStart.y,this.zoomSpeed)),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);const o=(e.pageX+t.x)*.5,a=(e.pageY+t.y)*.5;this._updateZoomParameters(o,a)}_handleTouchMoveDollyPan(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enablePan&&this._handleTouchMovePan(e)}_handleTouchMoveDollyRotate(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enableRotate&&this._handleTouchMoveRotate(e)}_addPointer(e){this._pointers.push(e.pointerId)}_removePointer(e){delete this._pointerPositions[e.pointerId];for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId){this._pointers.splice(t,1);return}}_isTrackingPointer(e){for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId)return!0;return!1}_trackPointer(e){let t=this._pointerPositions[e.pointerId];t===void 0&&(t=new we,this._pointerPositions[e.pointerId]=t),t.set(e.pageX,e.pageY)}_getSecondPointerPosition(e){const t=e.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[t]}_customWheelEvent(e){const t=e.deltaMode,n={clientX:e.clientX,clientY:e.clientY,deltaY:e.deltaY};switch(t){case 1:n.deltaY*=16;break;case 2:n.deltaY*=100;break}return e.ctrlKey&&!this._controlActive&&(n.deltaY*=10),n}}function zM(i){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(i.pointerId),this.domElement.addEventListener("pointermove",this._onPointerMove),this.domElement.addEventListener("pointerup",this._onPointerUp)),!this._isTrackingPointer(i)&&(this._addPointer(i),i.pointerType==="touch"?this._onTouchStart(i):this._onMouseDown(i)))}function HM(i){this.enabled!==!1&&(i.pointerType==="touch"?this._onTouchMove(i):this._onMouseMove(i))}function VM(i){switch(this._removePointer(i),this._pointers.length){case 0:this.domElement.releasePointerCapture(i.pointerId),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.dispatchEvent(yd),this.state=ht.NONE;break;case 1:const e=this._pointers[0],t=this._pointerPositions[e];this._onTouchStart({pointerId:e,pageX:t.x,pageY:t.y});break}}function GM(i){let e;switch(i.button){case 0:e=this.mouseButtons.LEFT;break;case 1:e=this.mouseButtons.MIDDLE;break;case 2:e=this.mouseButtons.RIGHT;break;default:e=-1}switch(e){case hs.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(i),this.state=ht.DOLLY;break;case hs.ROTATE:if(i.ctrlKey||i.metaKey||i.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(i),this.state=ht.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(i),this.state=ht.ROTATE}break;case hs.PAN:if(i.ctrlKey||i.metaKey||i.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(i),this.state=ht.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(i),this.state=ht.PAN}break;default:this.state=ht.NONE}this.state!==ht.NONE&&this.dispatchEvent(Jc)}function WM(i){switch(this.state){case ht.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(i);break;case ht.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(i);break;case ht.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(i);break}}function XM(i){this.enabled===!1||this.enableZoom===!1||this.state!==ht.NONE||(i.preventDefault(),this.dispatchEvent(Jc),this._handleMouseWheel(this._customWheelEvent(i)),this.dispatchEvent(yd))}function jM(i){this.enabled!==!1&&this._handleKeyDown(i)}function KM(i){switch(this._trackPointer(i),this._pointers.length){case 1:switch(this.touches.ONE){case os.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(i),this.state=ht.TOUCH_ROTATE;break;case os.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(i),this.state=ht.TOUCH_PAN;break;default:this.state=ht.NONE}break;case 2:switch(this.touches.TWO){case os.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(i),this.state=ht.TOUCH_DOLLY_PAN;break;case os.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(i),this.state=ht.TOUCH_DOLLY_ROTATE;break;default:this.state=ht.NONE}break;default:this.state=ht.NONE}this.state!==ht.NONE&&this.dispatchEvent(Jc)}function qM(i){switch(this._trackPointer(i),this.state){case ht.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(i),this.update();break;case ht.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(i),this.update();break;case ht.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(i),this.update();break;case ht.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(i),this.update();break;default:this.state=ht.NONE}}function YM(i){this.enabled!==!1&&i.preventDefault()}function $M(i){i.key==="Control"&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}function ZM(i){i.key==="Control"&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}function JM(i,e){const t=new BM(i,e);return t.target.set(0,1.5,0),t.enableDamping=!0,t.dampingFactor=.08,t.minDistance=3,t.maxDistance=45,t.maxPolarAngle=Math.PI/2-.02,t.update(),t}const QM=1.1;function Yu(i,e){const t=i.players[e].teamId,n=cn(t),s=xt[t],r=i.actors[e],o=-s*1.9,a=r.x>=0?1:-1,l=[i.match.rotations[n][1],i.match.rotations[n][2],i.match.rotations[n][3]].map(d=>i.actors[d].x),u=-s*5.2,h=[{key:"line",label:"直線",aim:{x:a*4.15,z:u},power:1},{key:"cross",label:"斜線",aim:{x:-a*3.9,z:-s*6.3},power:1},{key:"middle",label:"中路",aim:{x:0,z:-s*5},power:1}];vn(i.match.rotations[t],e)&&h.push({key:"tip",label:"吊球",aim:{x:-a*1.2,z:o},power:.25});for(const d of h)d.blocked=eE(r,d.aim,l,d.key);return h}function Ec(i,e){const t=i.z/(i.z-e.z);return i.x+(e.x-i.x)*t}function eE(i,e,t,n){if(n==="tip")return!1;const s=Ec(i,e);return Math.abs(s)>fe.WIDTH/2+.3?!1:t.some(r=>Math.abs(r-s)<QM)}const $u=600,Zu=64,tE=We.REACH_RADIUS*.9,nE=36,iE=2.15,sE=900;function rE(i,e,t,n,s=!1){let r=t;const o=new Set;let a=null,c=null,l=null,u={x:0,y:0},h={x:0,y:0},d=!1,p=!1,g=!1,_=!1;const m=new Tg,f=new jn(new N(0,1,0),0);window.addEventListener("keydown",T=>{if((T.code==="KeyJ"||T.code==="Space"&&!s)&&!T.repeat){T.preventDefault(),A("key");return}if(T.code==="KeyK"&&!T.repeat){y();return}o.add(T.code)}),window.addEventListener("keyup",T=>{if((T.code==="KeyJ"||T.code==="Space")&&c?.pointerId==="key"){w();return}o.delete(T.code)}),window.addEventListener("blur",()=>{o.clear(),c=null,d=!1,p=!1});function y(){l={timing:1,gaze:null,aimNdc:null,aimVec:null,forceAction:"block",expiresTick:null,jumpAt:null},p=!0}let x=null,v=null;function A(T){c||(c={pointerId:T,startedAt:performance.now(),gaze:null,btnDrag:T==="button"?{dx:0,dy:0}:null})}function w(){if(!c)return;const T=performance.now()-c.startedAt,D=c.btnDrag,P=x?M(x):null,O=P==="spike";O&&(d=!0,performance.now());let z=T/$u;if(P==="receive"&&x){const F=x.players[r],X=x.actors[r],V=x.ball;z=Math.hypot(V.x-X.x,V.z-X.z)<=We.REACH_RADIUS*1.1&&V.vy<0&&V.y<=Di(F)+.6?1:.7}l={timing:z,gaze:c.gaze,aimNdc:D?null:{...u},aimVec:D&&Math.hypot(D.dx,D.dy)>14?{...D}:null,expiresTick:null,jumpAt:O?performance.now():null},c=null}i.addEventListener("pointerdown",T=>{if(T.pointerType==="touch"){T.clientX<window.innerWidth*.4&&!a&&(a={pointerId:T.pointerId,ox:T.clientX,oy:T.clientY,dx:0,dy:0});return}C(T),c||A(T.pointerId)}),i.addEventListener("pointermove",T=>{if(a&&T.pointerId===a.pointerId){a.dx=T.clientX-a.ox,a.dy=T.clientY-a.oy;return}C(T)});const R=T=>{if(a&&T.pointerId===a.pointerId){a=null;return}c&&T.pointerId===c.pointerId&&(C(T),w())};i.addEventListener("pointerup",R),i.addEventListener("pointercancel",R);function C(T){h={x:T.clientX,y:T.clientY},u={x:T.clientX/window.innerWidth*2-1,y:-(T.clientY/window.innerHeight)*2+1},c&&n.setLook(u.x,u.y)}function S(T){m.setFromCamera(new we(T.x,T.y),e);const D=new N;return m.ray.intersectPlane(f,D)?{x:D.x,z:D.z}:null}function M(T){const D=T.players[r];if(T.phase==="serve")return _n(T.match)===r?"serve":null;if(T.phase!=="rally")return null;const P=T.rally;if(P.possession===D.teamId&&P.touches===2)return"spike";if(P.possession===D.teamId&&P.touches===1)return"set";const O=T.actors[r],z=Math.abs(O.z)<4.2;return P.possession&&P.possession!==D.teamId&&vn(T.match.rotations[D.teamId],r)&&z?"block":"receive"}return{collect(T,D=null){x=T,v=D,g&&!this.isAttackMoment(T)&&(g=!1);const P=T.tick,O=T.players[r],z=T.actors[r];let F=oE(o,a,xt[O.teamId]);if(T.phase==="serve"?_=!1:T.phase==="rally"&&Math.hypot(F.x,F.z)>=.1&&(_=!0),T.phase==="serve"&&r!==_n(T.match)&&Math.hypot(F.x,F.z)<.1){const ne=dr(T.match.rotations[O.teamId],r),Te=xo(O.teamId,ne),Fe=Te.x-z.x,j=Te.z-z.z,se=Math.hypot(Fe,j);se>.3&&(F={x:Fe/se,z:j/se})}if(T.phase==="rally"&&!c&&!_&&Math.hypot(F.x,F.z)<.1&&D?.claimId!==r){const ne=Ra(T,O.teamId,r),Te=ne.x-z.x,Fe=ne.z-z.z,j=Math.hypot(Te,Fe);j>.3&&(F={x:Te/j,z:Fe/j})}let X=null,V={x:0,z:-6.5*xt[O.teamId]},ee=null,re=1;if(l){if(l.expiresTick===null&&(l.expiresTick=P+nE),X=l.forceAction??M(T),X==="block"&&!l.forceAction&&(p=!0),X==="spike"&&(l.jumpAt===null?1/0:performance.now()-l.jumpAt)>sE&&(X="receive"),l.aimWorld)V=l.aimWorld;else if(l.aimVec){const Te=l.aimVec,Fe=Math.hypot(Te.dx,Te.dy)||1,j=3+Math.min(Fe,130)/130*6;V={x:z.x+Te.dx/Fe*j,z:z.z+Te.dy/Fe*j}}else if(l.aimNdc){const Te=S(l.aimNdc);Te&&(V=Te)}ee=l.gaze??n.gazePoint(T),re=l.timing;const ne=T.phase==="serve"&&X==="serve";l.attack?T.ball.y<1.3&&(l=null):!ne&&P>=l.expiresTick&&(l=null)}else if(c&&n.getMode()==="first"&&!c.gaze)c.gaze=n.gazePoint(T);else if(T.phase==="rally"&&!c){const ne=T.rally,Te=T.ball,Fe=ne.touches<3&&!(ne.profile==="serve"&&ne.lastTouchTeam===O.teamId)&&ne.lastToucherId!==r,se=Math.hypot(Te.x-z.x,Te.z-z.z)<=tE&&Te.vy<0&&Te.y<=Di(O)+.3,_e=D?.claimId===r;if(Fe&&se&&ne.touches===0)X="receive",V=_t(O.teamId,1.2,1.2),re=.6;else if(Fe&&se&&_e&&ne.touches===1){X="set";const ce=D?.attackerId&&T.actors[D.attackerId],Ee=ce?-xt[O.teamId]*ce.x:2;V=_t(O.teamId,Ee,1.3),re=.75}else Fe&&se&&_e&&ne.touches===2&&Te.y<iE&&(X="receive",V=_t(O.teamId==="A"?"B":"A",0,6.5),re=.6)}return[co({playerId:r,tick:P,move:F,action:X,aim:V,gaze:ee,timing:re,style:l?.style??null})]},onEvents(T){if(l){for(const D of T)if((D.type==="TOUCH"||D.type==="SERVE")&&D.playerId===r){l=null;return}}},isCharging(){return c!==null},setPlayerId(T){T!==r&&(r=T,l=null,c=null,d=!1,p=!1)},getPlayerId(){return r},beginAction(T,D){T!=null&&(h={x:T,y:D}),A("button")},dragAction(T,D,P,O){c?.btnDrag&&(c.btnDrag={dx:T,dy:D},P!=null&&(h={x:P,y:O}))},endAction(){c?.btnDrag&&w()},pressBlock(){y()},currentContext(){return x?M(x):null},isAttackMoment(T){const D=T.players[r],P=T.rally;return!(T.phase!=="rally"||P.possession!==D.teamId||P.touches!==2||P.lastToucherId===r||v?.claimId!==r)},attackZones(T){return this.isAttackMoment(T)?Yu(T,r):null},chooseAttack(T){d=!0,g=!0,l={timing:T.power,gaze:{x:T.aim.x,z:T.aim.z},aimWorld:T.aim,aimNdc:null,aimVec:null,forceAction:"spike",expiresTick:null,jumpAt:performance.now(),attack:!0}},chooseAttackFake(T,D){this.chooseAttack(D),l.gaze={x:T.aim.x,z:T.aim.z}},attackPending(){return g},serveNow(T,D=null,P=null){const O=T.players[r];if(T.phase!=="serve"||_n(T.match)!==r)return;n.resetLook();const z=O.teamId==="A"?"B":"A",F=D??_t(z,1.5,7.5);l={timing:P==="jump"?1.2:1,style:P==="float"?"float":null,gaze:null,aimWorld:F,aimNdc:null,aimVec:null,forceAction:"serve",expiresTick:null,jumpAt:null}},diveNow(T){const D=T.players[r];T.phase==="rally"&&(l={timing:.5,style:null,gaze:null,aimWorld:_t(D.teamId,1.2,1.2),aimNdc:null,aimVec:null,forceAction:"dive",expiresTick:null,jumpAt:null})},serveZones(T){const P=T.players[r].teamId==="A"?"B":"A";return[{key:"dl",label:"深左",aim:_t(P,2.8,7.8)},{key:"dm",label:"深中",aim:_t(P,0,8)},{key:"dr",label:"深右",aim:_t(P,-2.8,7.8)},{key:"short",label:"短球",aim:_t(P,0,3.6)}]},isDefendMoment(T,D){const P=T.players[r],O=T.rally;return T.phase!=="rally"||!O.possession||O.possession===P.teamId||O.touches!==2||!vn(T.match.rotations[P.teamId],r)?!1:!!(D?.claimId&&T.players[D.claimId]?.teamId===O.possession)},blockOptions(T,D){const P=D?.claimId;if(!P)return null;const O=Yu(T,P),z=T.actors[P],F=[];for(const X of O)X.key==="line"&&F.push({key:"line",label:"封直線",x:Ec(z,X.aim)}),X.key==="cross"&&F.push({key:"cross",label:"封斜線",x:Ec(z,X.aim)});return F.push({key:"off",label:"退防",x:null}),F},consumeJumpSignal(){const T=d;return d=!1,T},consumeBlockSignal(){const T=p;return p=!1,T},uiState(){if(!c)return{joystick:a?{...a}:null,charge:null};const T=(performance.now()-c.startedAt)/$u;return{joystick:a?{...a}:null,charge:{x:h.x,y:h.y,progress:T,sweet:T>=.7&&T<=1.05,over:T>1.15}}},currentAimPoint(T){if(!c)return null;const D=T??x;if(!D)return null;if(c.btnDrag){const P=D.actors[r],O=c.btnDrag,z=Math.hypot(O.dx,O.dy),F=xt[D.players[r].teamId],X=z>14?O.dx/z:0,V=z>14?O.dy/z:-F,ee=3+Math.min(z,130)/130*6;return{x:P.x+X*ee,z:P.z+V*ee}}return S(u)}}}function oE(i,e,t){let n=0,s=0;(i.has("KeyW")||i.has("ArrowUp"))&&(s-=1),(i.has("KeyS")||i.has("ArrowDown"))&&(s+=1),(i.has("KeyA")||i.has("ArrowLeft"))&&(n-=1),(i.has("KeyD")||i.has("ArrowRight"))&&(n+=1),t===-1&&(n=-n,s=-s),e&&(n=e.dx/Zu,s=e.dy/Zu,t===-1&&(n=-n,s=-s));const r=Math.hypot(n,s);return r>1&&(n/=r,s/=r),{x:n,z:s}}function Ju(i,e=16762967,t=.42){const n=new dt(new So(t-.12,t,32),new on({color:e,transparent:!0,opacity:.9,side:sn}));return n.rotation.x=-Math.PI/2,n.position.y=.015,n.visible=!1,i.add(n),{show(s){n.visible=!0,n.position.x=s.x,n.position.z=s.z},hide(){n.visible=!1},setColor(s){n.material.color.setHex(s)}}}function aE(i,e,t,n=!1){const s=cE(t);let r=0,o=0,a=0,c=performance.now();n||i.classList.add("hud-min"),i.innerHTML=`
    <div class="fps">— <span>FPS</span></div>
    <div class="stats">${n?"量測中…":""}</div>
    <div class="settings">${s}</div>
  `;const l=i.querySelector(".fps"),u=i.querySelector(".stats");return{frame(h,d,p){r+=1,o+=d*1e3,a+=p;const g=h-c;if(g<500)return;const _=g/1e3,m=Math.round(r/_),f=r>0?(o/r).toFixed(1):"—",y=Math.round(a/_),x=e.info.render;l.innerHTML=`${m} <span>FPS</span>`,u.textContent=`render ${f} ms/幀 · sim ${y} Hz（固定60）
三角形 ${x.triangles.toLocaleString()} · draw calls ${x.calls}
dpr ${e.getPixelRatio().toFixed(2)} · ${e.domElement.width}×${e.domElement.height}`,r=0,o=0,a=0,c=h},error(h){u.classList.add("hud-error"),u.textContent=`錯誤：${h}`}}}function cE(i){return String(i).replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e])}const lE="cubic-bezier(0.23, 1, 0.32, 1)",Qu={action:{bg:"#ffd166",border:"#1a1405",text:"#1a1405"},beat:{bg:"#f7f9ff",border:"#101420",text:"#101420"},ambient:{bg:"#f7f9ff",border:"#101420",text:"#2a3247"}};function uE(i){const e=document.createElement("div");if(e.id="scoreboard",e.style.cssText=["position:fixed","top:calc(env(safe-area-inset-top, 0px) + 8px)","left:0","right:0","z-index:10","display:flex","flex-direction:column","align-items:center","gap:7px","font-family:system-ui,sans-serif","text-align:center","pointer-events:none","user-select:none"].join(";"),e.innerHTML=`
    <div class="pill" style="color:#eef2fa;background:rgba(12,16,26,0.6);
      padding:6px 22px;border-radius:14px">
      <div class="setpt" style="display:none;font-size:13px;font-weight:800;letter-spacing:3px;
        margin-bottom:1px;animation:vd-pulse 0.9s ease-in-out infinite"></div>
      <div class="line" style="font-size:clamp(30px, 8vw, 38px);font-weight:800;
        letter-spacing:2px;line-height:1.15">0 : 0</div>
    </div>
    <div class="bubble" style="display:none;background:#f7f9ff;transition:opacity 120ms ease">
      <div class="tail" style="background:#f7f9ff"></div>
      <div class="btext"></div>
    </div>
  `,document.body.appendChild(e),!document.getElementById("vd-pulse-style")){const g=document.createElement("style");g.id="vd-pulse-style",g.textContent=`
@keyframes vd-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.55;transform:scale(1.08)}}
#scoreboard .bubble{position:relative;max-width:min(84vw,460px);padding:9px 18px;
  border-radius:14px;border:2.5px solid #101420;box-shadow:0 3px 0 rgba(8,10,18,0.55)}
#scoreboard .tail{position:absolute;top:-7px;left:50%;width:13px;height:13px;
  transform:translateX(-50%) rotate(45deg);
  border-left:2.5px solid #101420;border-top:2.5px solid #101420}
#scoreboard .btext{position:relative;font-weight:800;letter-spacing:1px;line-height:1.45;
  font-size:clamp(15px, 4.2vw, 18px)}
@media (max-height: 520px) {
  #scoreboard .bubble{position:fixed;left:calc(env(safe-area-inset-left, 0px) + 10px);
    top:calc(env(safe-area-inset-top, 0px) + 36px);max-width:min(44vw, 340px);
    padding:6px 12px;text-align:left}
  #scoreboard .tail{display:none}
  #scoreboard .btext{font-size:14px;letter-spacing:0.5px}
}`,document.head.appendChild(g)}const t=e.querySelector(".line"),n=e.querySelector(".setpt"),s=e.querySelector(".bubble"),r=e.querySelector(".tail"),o=e.querySelector(".btext");t.style.transition="transform 0.12s ease-out, color 0.12s";let a=0,c=null,l="",u="",h=null;const d=typeof matchMedia=="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches;function p(g){const{text:_,kind:m}=typeof g=="string"?{text:g,kind:"action"}:g;if(!_){l&&(l="",s.style.opacity="0",setTimeout(()=>{l||(s.style.display="none")},130));return}if(_===l&&m===u)return;const f=_!==l;l=_,u=m;const y=Qu[m]??Qu.beat;s.style.display="block",s.style.opacity="1",s.style.background=y.bg,s.style.borderColor=y.border,r.style.background=y.bg,r.style.borderLeftColor=y.border,r.style.borderTopColor=y.border,o.style.color=y.text,o.textContent=_,f&&m!=="ambient"&&!d&&(h?.cancel(),h=s.animate([{transform:"scale(0.92) translateY(-5px)",opacity:.5},{transform:"scale(1) translateY(0)",opacity:1}],{duration:180,easing:lE}))}return{update(g,_=!1,m=i,f=void 0){const{score:y}=g.match,x=g.match.servingTeam;t.textContent=`${y.A} : ${y.B}`;const v=y.A+y.B;v!==a&&(a=v,t.style.transform="scale(1.45)",t.style.color="#ffd166",clearTimeout(c),c=setTimeout(()=>{t.style.transform="scale(1)",t.style.color="#eef2fa"},220)),p(f!==void 0?f:_?"🟠 這球歸你！跑向藍色落點圈":hE(g,m,x));const A=Md(g),w=g.players[m]?.teamId;A&&g.phase!=="set_over"?(n.style.display="block",n.textContent=A===w?"🔥 局點":"⚠ 對方局點",n.style.color=A===w?"#ffd166":"#ff6b6b"):n.style.display="none"}}}function Md(i){const{score:e,target:t}=i.match;for(const[n,s]of[["A","B"],["B","A"]])if(e[n]+1>=t&&e[n]+1-e[s]>=2)return n;return null}function hE(i,e,t){if(i.phase==="set_over")return`本局結束——${i.match.winner} 隊勝！點擊畫面再來一局`;if(i.phase==="serve")return _n(i.match)===e?i.tick<i.serveReadyTick?"準備發球…":"你發球：按住蓄力、拖曳瞄準、放開出手":`${t} 隊發球（WASD/左半螢幕搖桿走位）`;const n=i.rally,s=i.players[e];return n.possession===s.teamId&&n.touches===2?"第三擊！按下＝起跳、放開＝揮臂（短點輕吊、蓄滿重扣）":n.possession===s.teamId&&n.touches===1?"二傳中——點按可自己處理":n.possession&&n.possession!==s.teamId?"對方進攻：前排點一下＝跳攔網；後排卡防守位":"走位到球落點會自動墊球"}const dE=2200,Ea=3e3,fE=8,pE=.45,mE=.9,gE=.95,_E=.5;function xE(i=null){let e=null,t=0,n=null,s=0,r=null,o=0;const a=i?.name??"對方",c=(h,d,p)=>d===h.players[p]?.teamId?"我方":a,l=(h,d)=>h.players[d]?.name??d,u=(h,d,p=dE)=>{e={text:h,until:d+p}};return{onEvents(h,d,p,g,_){for(const m of h)if(m.type==="SERVE")t=d.rally.flightId,m.playerId!==_&&u(`${l(d,m.playerId)} 發球`,g,1400);else if(m.type==="TOUCH"&&m.kind==="dive")u(`${l(d,m.playerId)} 魚躍救球！！`,g);else if(m.type==="TOUCH"&&m.kind==="receive"&&d.rally.touches===1)(m.power??0)>=gE?u(`${l(d,m.playerId)} Perfect 一傳！`,g):(m.ballY??1)<_E&&u(`${l(d,m.playerId)} 貼地撈起來了！`,g);else if(m.type==="TOUCH"&&m.kind==="set"){const f=p?.attackerId?p.attackKind:null;f==="quick"?u("中路快攻——！",g):f==="pipe"?u("後排 pipe 攻擊！",g):f==="dball"&&u("右後 D 球！",g)}else if(m.type==="TOUCH"&&m.kind==="spike")m.touches===2&&d.players[m.playerId]?.currentRole==="setter"?u("二次球偷襲！",g):(m.power??1)<=pE?u("輕吊——！",g):(m.power??0)>=mE&&u(`${l(d,m.playerId)} 全力重扣！`,g);else if(m.type==="BLOCK_TOUCH")u("攔網碰到球！還活著！",g);else if(m.type==="SCORE"){const{score:f}=d.match,y=f.A+f.B;y<o&&(n=null,s=0,r=null),o=y,m.team===n?s+=1:(n=m.team,s=1);const x=f.A===f.B?null:f.A>f.B?"A":"B",v=c(d,m.team,_);x&&r&&x!==r?u(`${c(d,x,_)}逆轉超前！`,g,Ea):!x&&y>0?u(`追平了 ${f.A}:${f.B}！`,g,Ea):s>=3&&u(`${v}連下 ${s} 分！`,g,Ea),x&&(r=x)}},line(h,d,p,g){if(h.phase==="set_over")return{text:"",kind:"ambient"};const _=h.players[p];if(h.phase==="serve"){if(_n(h.match)===p)return{text:"你發球——從面板選個落點！",kind:"action"}}else if(d?.claimId===p&&h.rally.possession===_?.teamId&&(h.rally.touches===1||h.rally.touches===2))return{text:"舉球給你——讀攔網、點攻擊區！",kind:"action"};if(e&&g<e.until)return{text:e.text,kind:"beat"};if(h.phase==="serve"){const{score:f}=h.match;return i&&f.A===0&&f.B===0?{text:`對手 ${i.name}：${i.trait}`,kind:"ambient"}:{text:`${c(h,h.match.servingTeam,p)}發球`,kind:"ambient"}}const m=h.rally.flightId-t;return m>=fE?{text:`第 ${m} 拍攻防！`,kind:"ambient"}:{text:"",kind:"ambient"}}}}function vE(){let i=null,e=!1;function t(){if(!i){const m=window.AudioContext||window.webkitAudioContext;if(!m)return null;i=new m}return i.state==="suspended"&&i.resume(),e||n(),i}window.addEventListener("pointerdown",t);function n(){e=!0;const m=i.sampleRate*2,f=i.createBuffer(1,m,i.sampleRate),y=f.getChannelData(0);let x=0;for(let R=0;R<m;R+=1)x=x*.98+(Math.random()*2-1)*.02,y[R]=x;const v=i.createBufferSource();v.buffer=f,v.loop=!0;const A=i.createBiquadFilter();A.type="lowpass",A.frequency.value=900;const w=i.createGain();w.gain.value=.05,v.connect(A).connect(w).connect(i.destination),v.start(),s=w}let s=null;function r(m){!i||!s||s.gain.setTargetAtTime(m,i.currentTime,.5)}function o(m=450){if(!t())return;const f=i.currentTime,y=m/1e3,x=i.createOscillator();x.type="square",x.frequency.value=2650;const v=i.createOscillator();v.frequency.value=55;const A=i.createGain();A.gain.value=320,v.connect(A).connect(x.frequency);const w=i.createGain();w.gain.setValueAtTime(.001,f),w.gain.exponentialRampToValueAtTime(.16,f+.02),w.gain.setValueAtTime(.16,f+y-.08),w.gain.exponentialRampToValueAtTime(.001,f+y),x.connect(w).connect(i.destination),x.start(f),v.start(f),x.stop(f+y),v.stop(f+y)}function a(m=1){if(!t())return;const f=i.currentTime,y=Math.floor(i.sampleRate*(1.1+.35*m)),x=i.createBuffer(1,y,i.sampleRate),v=x.getChannelData(0);for(let C=0;C<y;C+=1)v[C]=Math.random()*2-1;const A=i.createBufferSource();A.buffer=x;const w=i.createBiquadFilter();w.type="bandpass",w.frequency.value=1100,w.Q.value=.7;const R=i.createGain();R.gain.setValueAtTime(.001,f),R.gain.exponentialRampToValueAtTime(.22*m,f+.18),R.gain.exponentialRampToValueAtTime(.001,f+1.05+.35*m),A.connect(w).connect(R).connect(i.destination),A.start(f)}function c(m=1){if(!t())return;const f=i.currentTime,y=i.createBufferSource(),x=Math.floor(i.sampleRate*.12),v=i.createBuffer(1,x,i.sampleRate),A=v.getChannelData(0);for(let C=0;C<x;C+=1)A[C]=(Math.random()*2-1)*(1-C/x);y.buffer=v;const w=i.createBiquadFilter();w.type="bandpass",w.frequency.value=320,w.Q.value=1.2;const R=i.createGain();R.gain.setValueAtTime(.3*Math.min(m,1),f),R.gain.exponentialRampToValueAtTime(.001,f+.16),y.connect(w).connect(R).connect(i.destination),y.start(f)}function l(){if(!t())return;const m=i.currentTime,f=i.createOscillator();f.type="sine",f.frequency.setValueAtTime(120,m),f.frequency.exponentialRampToValueAtTime(48,m+.16);const y=i.createGain();y.gain.setValueAtTime(.32,m),y.gain.exponentialRampToValueAtTime(.001,m+.2),f.connect(y).connect(i.destination),f.start(m),f.stop(m+.22)}function u(m=1){if(!t())return;const f=i.currentTime,y=i.createBufferSource(),x=i.createBuffer(1,2600,i.sampleRate),v=x.getChannelData(0);for(let C=0;C<v.length;C+=1)v[C]=(Math.random()*2-1)*(1-C/v.length)**2;y.buffer=x;const A=i.createGain();A.gain.setValueAtTime(.5*m,f),A.gain.exponentialRampToValueAtTime(.001,f+.09),y.connect(A).connect(i.destination),y.start(f);const w=i.createOscillator();w.type="sine",w.frequency.setValueAtTime(150,f),w.frequency.exponentialRampToValueAtTime(60,f+.12);const R=i.createGain();R.gain.setValueAtTime(.45*m,f),R.gain.exponentialRampToValueAtTime(.001,f+.13),w.connect(R).connect(i.destination),w.start(f),w.stop(f+.15)}function h(){if(!t())return;const m=i.currentTime,f=i.createOscillator();f.type="sine",f.frequency.setValueAtTime(210,m),f.frequency.exponentialRampToValueAtTime(95,m+.07);const y=i.createBiquadFilter();y.type="lowpass",y.frequency.value=420;const x=i.createGain();x.gain.setValueAtTime(.5,m),x.gain.exponentialRampToValueAtTime(.001,m+.09),f.connect(y).connect(x).connect(i.destination),f.start(m),f.stop(m+.1)}function d(m=640){if(!t())return;const f=i.currentTime,y=i.createOscillator();y.type="triangle",y.frequency.setValueAtTime(m,f),y.frequency.exponentialRampToValueAtTime(m*1.35,f+.05);const x=i.createGain();x.gain.setValueAtTime(.32,f),x.gain.exponentialRampToValueAtTime(.001,f+.08),y.connect(x).connect(i.destination),y.start(f),y.stop(f+.09)}let p=null;function g(m,f,y){const x=i.createOscillator();x.type="sine",x.frequency.setValueAtTime(f,m),x.frequency.exponentialRampToValueAtTime(f*.6,m+.1);const v=i.createGain();v.gain.setValueAtTime(y,m),v.gain.exponentialRampToValueAtTime(.001,m+.14),x.connect(v).connect(i.destination),x.start(m),x.stop(m+.16)}function _(m){m&&!p?p=setInterval(()=>{if(!t())return;const f=i.currentTime;g(f,62,.12),g(f+.22,55,.08)},1150):!m&&p&&(clearInterval(p),p=null)}return{whistle:o,setHeartbeat:_,setCrowdLevel:r,netHit:c,onEvents(m,f={}){for(const y of m)y.type==="SERVE"?u(.7):y.type==="BLOCK_TOUCH"?h():y.type==="DEAD_BALL"?(l(),o(480),a(Math.min(1+(f.rallyFlights??0)/10,1.8))):y.type==="TOUCH"&&(y.kind==="spike"?(y.power??1)<.45?h():u(1):y.kind==="receive"&&(y.power??0)>=.95?d(980):y.kind==="receive"&&y.touches===3?h():y.kind==="set"?d(760):d(600))}}}const yE=40;function ME(){const i=eh(96,"rgba(238,242,250,0.12)","2px solid rgba(238,242,250,0.35)"),e=eh(44,"rgba(238,242,250,0.45)","none"),t=document.createElement("div");return t.style.cssText=Ed(76),t.style.borderRadius="50%",t.style.border="4px solid rgba(110,231,255,0.25)",document.body.append(i,e,t),{update(n){if(n.joystick){const s=n.joystick,r=Math.hypot(s.dx,s.dy)||1,o=Math.min(r,yE);Sa(i,s.ox,s.oy),Sa(e,s.ox+s.dx/r*o,s.oy+s.dy/r*o)}else Ta(i),Ta(e);if(n.charge){const s=n.charge;Sa(t,s.x,s.y);const r=Math.min(s.progress,1),o=s.over?"255,91,91":s.sweet?"96,255,160":"110,231,255";t.style.borderColor=`rgba(${o},${.4+r*.6})`,t.style.borderWidth=s.sweet?"6px":"4px",t.style.transform=`translate(-50%,-50%) scale(${1+r*.35})`}else Ta(t)}}}function eh(i,e,t){const n=document.createElement("div");return n.style.cssText=Ed(i),n.style.borderRadius="50%",n.style.background=e,t!=="none"&&(n.style.border=t),n}function Ed(i){return["position:fixed","left:0","top:0",`width:${i}px`,`height:${i}px`,"transform:translate(-50%,-50%)","pointer-events:none","z-index:15","display:none"].join(";")}function Sa(i,e,t){i.style.display="block",i.style.left=`${e}px`,i.style.top=`${t}px`}function Ta(i){i.style.display="none"}const EE={serve:"發球",spike:"扣球",set:"舉球",receive:"墊球",block:"攔網"};function SE(i){const e=th("墊球",92,"rgba(110,231,255,0.9)",108),t=th("攔網",64,"rgba(238,242,250,0.85)",214);let n=null;e.addEventListener("pointerdown",r=>{r.stopPropagation(),r.preventDefault();try{e.setPointerCapture(r.pointerId)}catch{}n={id:r.pointerId,ox:r.clientX,oy:r.clientY},i.beginAction(r.clientX,r.clientY)}),e.addEventListener("pointermove",r=>{!n||r.pointerId!==n.id||i.dragAction(r.clientX-n.ox,r.clientY-n.oy,r.clientX,r.clientY)});const s=r=>{!n||r.pointerId!==n.id||(n=null,i.endAction())};return e.addEventListener("pointerup",s),e.addEventListener("pointercancel",s),t.addEventListener("pointerdown",r=>{r.stopPropagation(),r.preventDefault(),i.pressBlock(),t.style.transform="scale(0.9)",setTimeout(()=>{t.style.transform="scale(1)"},120)}),{update(r){const o=EE[r]??"墊球";e.textContent!==o&&(e.textContent=o)}}}function th(i,e,t,n){const s=document.createElement("button");return s.textContent=i,s.style.cssText=["position:fixed","right:calc(env(safe-area-inset-right, 0px) + 18px)",`bottom:calc(env(safe-area-inset-bottom, 0px) + ${n}px)`,`width:${e}px`,`height:${e}px`,"border-radius:50%","border:none",`background:${t}`,"color:#1c2230",`font-size:${Math.round(e*.24)}px`,"font-weight:700","font-family:system-ui,sans-serif","z-index:16","touch-action:none","cursor:pointer","user-select:none","box-shadow:0 2px 10px rgba(0,0,0,0.4)"].join(";"),document.body.appendChild(s),s}const TE={green:"rgba(96,255,160,0.92)",red:"rgba(255,91,91,0.9)",orange:"rgba(255,176,76,0.94)",cyan:"rgba(110,231,255,0.92)",neutral:"rgba(200,214,235,0.92)"};function bE(){const i=document.createElement("div");i.style.cssText=["position:fixed","left:50%","bottom:calc(env(safe-area-inset-bottom, 0px) + 90px)","transform:translateX(-50%)","z-index:18","display:none","gap:10px","flex-wrap:wrap","justify-content:center","max-width:92vw"].join(";"),document.body.appendChild(i);const e=document.createElement("div");if(e.style.cssText=["position:fixed","left:50%","bottom:calc(env(safe-area-inset-bottom, 0px) + 168px)","transform:translateX(-50%)","z-index:18","display:none","color:#ffd166","font-family:system-ui,sans-serif","font-size:18px","font-weight:700","text-shadow:0 2px 6px rgba(0,0,0,0.7)","pointer-events:none"].join(";"),document.body.appendChild(e),!document.getElementById("vd-pop-style")){const a=document.createElement("style");a.id="vd-pop-style",a.textContent="@keyframes vd-pop{from{opacity:0;transform:translateY(16px) scale(0.92)}to{opacity:1;transform:translateY(0) scale(1)}}",document.head.appendChild(a)}let t=[],n="";function s(a,c,l){for(const u of t)u.remove();t=a.map((u,h)=>{const d=document.createElement("button");return d.textContent=u.label,d.dataset.zoneKey=u.key,d.style.cssText=["min-width:74px","height:60px","border-radius:14px","border:none",`background:${TE[u.color??"neutral"]}`,"color:#12131a","font-size:17px","font-weight:800","font-family:system-ui,sans-serif","touch-action:none","cursor:pointer","box-shadow:0 2px 10px rgba(0,0,0,0.4)",`animation:vd-pop 0.2s ease-out ${h*.04}s both`].join(";"),d.addEventListener("pointerdown",p=>{if(p.stopPropagation(),!l){c(u),o();return}p.preventDefault(),d.style.transform="scale(1.12)";const g=_=>{window.removeEventListener("pointerup",g),window.removeEventListener("pointercancel",g),d.style.transform="";const f=document.elementFromPoint(_.clientX,_.clientY)?.closest?.("button")?.dataset?.zoneKey??null,y=f&&f!==u.key?a.find(x=>x.key===f):null;y?l(u,y):c(u),o()};window.addEventListener("pointerup",g),window.addEventListener("pointercancel",g)}),i.appendChild(d),d})}function r(a,c,l,u=null){e.textContent=a;const h=a+c.map(d=>d.key+(d.color??"")).join(",");h!==n&&(n=h,s(c,l,u)),i.style.display="flex",e.style.display="block"}function o(){i.style.display="none",e.style.display="none",n=""}return{show:r,hide:o}}function AE(){return{show(i,e="#60ffa0",t=900){const n=document.createElement("div");n.textContent=i,n.style.cssText=["position:fixed","left:50%","bottom:30%","z-index:20","transform:translateX(-50%)",`color:${e}`,"font-family:system-ui,sans-serif","font-size:34px","font-weight:800","letter-spacing:2px","text-shadow:0 2px 8px rgba(0,0,0,0.6)","pointer-events:none","user-select:none","transition:transform 0.8s ease-out, opacity 0.8s ease-out","opacity:1"].join(";"),document.body.appendChild(n),requestAnimationFrame(()=>{n.style.transform="translateX(-50%) translateY(-60px)",n.style.opacity="0"}),setTimeout(()=>n.remove(),t)}}}const nh="vd-banner-style",wE=`
@keyframes vd-banner-in {
  0% { opacity: 0; transform: translate(-50%, -26px) scale(0.88); }
  60% { opacity: 1; transform: translate(-50%, 4px) scale(1.03); }
  100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
}
@keyframes vd-banner-out {
  to { opacity: 0; transform: translate(-50%, -18px) scale(0.94); }
}
@keyframes vd-banner-shine {
  from { transform: translateX(-140%) skewX(-18deg); }
  to { transform: translateX(340%) skewX(-18deg); }
}
@keyframes vd-banner-icon {
  0% { transform: scale(0.4) rotate(-14deg); }
  55% { transform: scale(1.18) rotate(4deg); }
  100% { transform: scale(1) rotate(0deg); }
}
`,RE=.45;function CE({reason:i,winner:e,myTeam:t,lastTouch:n,controlledId:s,score:r}){const o=e===t,a=n?.kind,c=a==="spike"&&(n?.power??1)<=RE;let l,u;return i==="POSITIONAL_FAULT"?(l="站位犯規",u="🚫"):i==="FOUR_HITS"?(l="四擊犯規",u="🚫"):i==="BACK_ROW_ATTACK"?(l="後排攻擊違例",u="🚫"):i==="OUT"?(u="📏",l=a==="serve"?"發球出界":c?"吊球出界":a==="spike"?"扣球出界":a==="block"?"攔網出界":"擊球出界"):n&&n.team===e?a==="serve"?(l="ACE！發球直得",u="🎯"):c?(l=o&&n.playerId===s?"你的吊球得分！":"吊球得分",u="🪶"):a==="spike"?(l=o&&n.playerId===s?"你的殺球得分！":"殺球得分",u="💥"):a==="block"?(l="攔網得分",u="🧱"):(l="球落地得分",u="🏐"):(l="處理失誤",u="💧"),{title:l,icon:u,mine:o,sub:`${o?"我方得分":"對方得分"}　${r.A} : ${r.B}`}}function IE(){if(!document.getElementById(nh)){const s=document.createElement("style");s.id=nh,s.textContent=wE,document.head.appendChild(s)}let i=null,e=null,t=null;function n(){clearTimeout(e),clearTimeout(t),i&&(i.remove(),i=null)}return{show(s){n();const r=s.mine?"#ffd166":"#ff6b6b";i=document.createElement("div"),i.style.cssText=["position:fixed","left:50%","top:min(22vh, 190px)","z-index:18","transform:translate(-50%, 0)","display:flex","align-items:center","gap:12px","max-width:min(90vw, 480px)","padding:12px 24px 12px 14px","border-radius:14px","overflow:hidden","background:linear-gradient(135deg, rgba(14,18,30,0.92), rgba(24,32,52,0.85))",`border:1px solid ${r}55`,`border-left:4px solid ${r}`,"backdrop-filter:blur(8px)","-webkit-backdrop-filter:blur(8px)",`box-shadow:0 10px 30px rgba(0,0,0,0.5), 0 0 24px ${r}22`,"font-family:system-ui,sans-serif","pointer-events:none","user-select:none","animation:vd-banner-in 0.45s cubic-bezier(0.16,1,0.3,1) both"].join(";");const o=document.createElement("div");o.textContent=s.icon,o.style.cssText=["width:44px","height:44px","flex:0 0 44px","display:grid","place-items:center","font-size:24px","border-radius:12px",`background:${r}22`,"animation:vd-banner-icon 0.5s cubic-bezier(0.34,1.56,0.64,1) both"].join(";");const a=document.createElement("div"),c=document.createElement("div");c.textContent=s.title,c.style.cssText=["font-size:clamp(20px, 5.5vw, 30px)","font-weight:800","letter-spacing:3px","color:#f4f7ff","line-height:1.15","text-shadow:0 2px 10px rgba(0,0,0,0.55)","white-space:nowrap"].join(";");const l=document.createElement("div");l.textContent=s.sub,l.style.cssText=["font-size:13px","font-weight:700","letter-spacing:2px",`color:${r}`,"margin-top:2px"].join(";"),a.appendChild(c),a.appendChild(l);const u=document.createElement("div");u.style.cssText=["position:absolute","top:0","bottom:0","left:0","width:38%","background:linear-gradient(105deg, transparent, rgba(255,255,255,0.16), transparent)","animation:vd-banner-shine 0.85s ease-out 0.18s both","pointer-events:none"].join(";"),i.appendChild(o),i.appendChild(a),i.appendChild(u),document.body.appendChild(i),e=setTimeout(()=>{i&&(i.style.animation="vd-banner-out 0.4s ease-in forwards")},1150),t=setTimeout(n,1600)},hide:n}}const ih="vd-tutorial-v10";function PE(i=!0){let e=!1;try{e=!!localStorage.getItem(ih)}catch{}if(e)return;const t="ontouchstart"in window,n=i?`<div style="margin-bottom:8px">每球開始系統<b>帶你就位</b>；${t?"推<b>左半螢幕搖桿</b>":"按 <b>WASD</b>"}即<b>接管走位</b>——這球歸你跑：</div>
       <div style="line-height:2">
       ⚔️ <b>進攻</b>：舉球給你→時間放慢，讀攔網選攻擊區<br>
       （<span style="color:#60ffa0">綠＝空檔</span>、<span style="color:#ff5b5b">紅✋＝被封</span>；按A滑B＝假動作）<br>
       🧱 <b>攔網</b>：對方要扣→自己沿網卡位、${t?"點一下":"<b>K</b>"}起跳封他<br>
       🏐 <b>發球</b>：輪你發球→面板選球路與落點<br>
       🤿 <b>魚躍</b>：右側大鈕亮起＝搆得到→拍下去飛身救球<br>
       💡 隊友扣球時該站哪掩護？——打著打著你會懂的</div>`:`<div>${t?"<b>左半螢幕</b>走位；<b>右側大鈕</b>蓄力/拖曳瞄準/放開出手":"<b>WASD</b>走位；<b>J/滑鼠</b>蓄力出手、<b>K</b>攔網"}</div>`,s=document.createElement("div");s.style.cssText=["position:fixed","inset:0","z-index:30","background:rgba(12,16,26,0.82)","display:flex","align-items:center","justify-content:center","color:#eef2fa","font-family:system-ui,sans-serif","text-align:center"].join(";"),s.innerHTML=`
    <div style="max-width:520px;padding:24px;line-height:1.7;font-size:15px">
      <div style="font-size:22px;font-weight:700;margin-bottom:14px">排球夢 — 怎麼玩</div>
      ${n}
      <div style="margin-top:18px;font-size:13px;opacity:0.6">點擊任意處開始</div>
    </div>`,document.body.appendChild(s),s.addEventListener("pointerdown",r=>{r.stopPropagation(),s.remove();try{localStorage.setItem(ih,"1")}catch{}})}function LE(){const i=document.createElement("div");i.style.cssText=["position:fixed","inset:0","z-index:24","display:flex","flex-direction:column","align-items:center","justify-content:center","background:rgba(7,9,16,0.72)","pointer-events:none","font-family:system-ui,sans-serif","text-align:center","user-select:none","opacity:0","transition:opacity 0.45s ease","visibility:hidden"].join(";"),i.innerHTML=`
    <div class="title" style="font-size:52px;font-weight:900;letter-spacing:6px;
      text-shadow:0 4px 24px rgba(0,0,0,0.8)"></div>
    <div class="score" style="font-size:34px;font-weight:700;color:#eef2fa;margin-top:10px;
      letter-spacing:4px"></div>
    <div class="again" style="font-size:15px;color:#9fb0cc;margin-top:26px">點擊任意處再來一局</div>
  `,document.body.appendChild(i);const e=i.querySelector(".title"),t=i.querySelector(".score"),n=i.querySelector(".again");return{show(s,r,o,a){const c=s===o;n.textContent=a??"點擊任意處再來一局",e.textContent=c?"🏆 你贏了這一局！":"這局輸了…再來！",e.style.color=c?"#ffd166":"#ff8a8a",t.textContent=`${r.A} : ${r.B}`,i.style.visibility="visible",requestAnimationFrame(()=>{i.style.opacity="1"})},hide(){i.style.opacity="0",setTimeout(()=>{i.style.visibility="hidden"},460)}}}const DE=[{id:"north-tech",name:"北原工商",style:"steady",trait:"紀律型隊伍——發球保守、失誤極少，節奏四平八穩",level:52,attrBias:{control:6},roleBias:{},trustBias:{},heights:[1.8,1.85,1.92,1.86,1.83,1.9],scoutRead:0,ai:{tipRate:.06,dumpRate:.04,floatServeRate:.25}},{id:"white-wave",name:"白浪高中",style:"defense",trait:"防守黏得可怕——救球救不完，還愛用吊球打亂你的節奏",level:57,attrBias:{reaction:10,speed:6,power:-4},roleBias:{},trustBias:{},heights:[1.81,1.84,1.9,1.85,1.83,1.89],scoutRead:.25,ai:{tipRate:.22,dumpRate:.08,floatServeRate:.15}},{id:"obsidian",name:"曜石體中",style:"quick",trait:"這隊 MB 攔網極快、快攻又急又狠——中路是他們的天下",level:60,attrBias:{},roleBias:{middle:{block:10,jump:8,power:4}},trustBias:{middle:22},heights:[1.83,1.87,1.98,1.89,1.85,1.96],scoutRead:.7,ai:{tipRate:.1,dumpRate:.1,jumpServeRate:.05}},{id:"iron-mist",name:"鐵霧工業",style:"serve",trait:"發球輪就是他們的得分輪——強力發球連發，一傳頂不住就崩",level:64,attrBias:{serve:12,power:4},roleBias:{},trustBias:{},heights:[1.84,1.89,1.95,1.91,1.87,1.93],scoutRead:.5,ai:{tipRate:.08,dumpRate:.06,jumpServeRate:.45,floatServeRate:.2}},{id:"sky-hawk",name:"天鷹學園",style:"power",trait:"全國決賽常客——兩翼重砲全面壓制，硬碰硬幾乎沒有勝算",level:72,attrBias:{power:6,jump:5},roleBias:{outside:{power:6}},trustBias:{outside:8},heights:[1.86,1.92,1.99,1.94,1.9,1.97],scoutRead:.9,ai:{tipRate:.1,dumpRate:.08,jumpServeRate:.25,floatServeRate:.1}}];function Ao(i){return DE.find(e=>e.id===i)??null}const ro=3,Sd=[{id:"group-1",stage:"group",opponentId:"north-tech",label:""},{id:"group-2",stage:"group",opponentId:"white-wave",label:""},{id:"group-3",stage:"group",opponentId:"obsidian",label:""},{id:"national-qf",stage:"national",opponentId:"iron-mist",label:"八強"},{id:"national-sf",stage:"national",opponentId:"obsidian",label:"準決賽"},{id:"national-final",stage:"national",opponentId:"sky-hawk",label:"決賽"}];function ba(i){return Ao(i)?.name??i}function NE({seed:i,playerName:e="小夢"}={}){if(!Number.isFinite(i))throw new Error("createCareer 需要數值 seed");return{version:ro,seed:i>>>0,playerName:e,schedule:Sd.map(t=>({...t})),results:[],growthPoints:0}}function Td(i){const e=n=>i.schedule.find(s=>s.id===n)?.stage;return i.results.some(n=>!n.won&&e(n.matchId)==="national")?"eliminated":i.results.some(n=>n.matchId==="national-final"&&n.won)?"champion":i.schedule.filter(n=>n.stage==="group").every(n=>i.results.some(s=>s.matchId===n.id))?"national":"group"}function bd(i){const e=Td(i);return e==="eliminated"||e==="champion"?null:i.schedule.find(t=>!i.results.some(n=>n.matchId===t.id))??null}function sh(i){let e=0;for(const t of i.results)t.won&&(e+=1);return{wins:e,losses:i.results.length-e,played:i.results.length}}function Ad(i,e){let t=(i.seed^2166136261)>>>0;for(const n of String(e))t=(t^n.codePointAt(0))>>>0,t=Math.imul(t,16777619)>>>0;return t%1000000007||1}function UE(i,e){return{...i,pendingMatch:e}}function OE(i){const e=i.pendingMatch;if(!e)return i;if(i.results.some(t=>t.matchId===e)){const{pendingMatch:t,...n}=i;return n}return wd(i,{matchId:e,won:!1,scoreFor:0,scoreAgainst:25})}function wd(i,{matchId:e,won:t,scoreFor:n,scoreAgainst:s,gp:r=0,stats:o=null}){const a=i.schedule.find(u=>u.id===e);if(!a)throw new Error(`recordResult：賽程裡沒有比賽 ${e}`);if(i.results.some(u=>u.matchId===e))return i;const{pendingMatch:c,...l}=i;return{...l,growthPoints:(i.growthPoints??0)+(r|0),results:[...i.results,{matchId:e,opponentId:a.opponentId,won:!!t,scoreFor:n|0,scoreAgainst:s|0,gp:r|0,...o?{stats:o}:{}}]}}function FE(i){return vo({id:"A2",name:i,teamId:"A",naturalRole:"outside",currentRole:"outside",height:1.88,trust:40,attributes:{jump:60,power:62,reaction:60,stamina:60,speed:62,control:68,serve:60,block:58},trustFloor:.27,techniques:{tip:0,pipe:0,feint:0,feintUses:0,jumpServe:0,floatServe:0,dive:0,v:2}})}const kE=["setter","outside","middle","opposite","outside","middle"],BE=[20,60,20,20,20,20],zE=[1.83,1.88,1.96,1.9,1.86,1.94];function HE(i){return kE.map((e,t)=>{const n={};for(const s of bc)n[s]=i.level+(i.attrBias?.[s]??0)+(i.roleBias?.[e]?.[s]??0);return vo({id:`B${t+1}`,name:`${i.name}${t+1}號`,teamId:"B",naturalRole:e,currentRole:e,height:i.heights?.[t]??zE[t],trust:BE[t]+(i.trustBias?.[e]??0),attributes:n})})}function Rd(i){i.trust.floorShare===void 0&&(i.trust.floorShare=.27);const e=i.techniques??(i.techniques={});e.v||(e.jumpServe=e.powerServe??0,delete e.powerServe,e.v=2);for(const t of["tip","pipe","feint","floatServe","dive"])e[t]=e[t]??0;return e.feintUses=e.feintUses??0,i}function VE(i,e=null){if(i?.id!=="A2"||i?.teamId!=="A")throw new Error("careerTeams：生涯主角必須是 A 隊 A2（主攻手槽）");Rd(i);const t=Eh();return t.A[1]=i,e&&(t.B=HE(e)),t}function GE(i,e,t){if(!t)return i;const n=i.scouting?.[e]??{zones:{line:0,cross:0,middle:0,tip:0},feints:0,spikes:0},s={zones:{line:n.zones.line+(t.zones?.line??0),cross:n.zones.cross+(t.zones?.cross??0),middle:n.zones.middle+(t.zones?.middle??0),tip:n.zones.tip+(t.zones?.tip??0)},feints:n.feints+(t.feints??0),spikes:n.spikes+(t.spikes??0)};return{...i,scouting:{...i.scouting??{},[e]:s}}}function _o(i,e,t=60){const n=Math.min(100,t+14);return vo({id:`${i}L`,name:e,teamId:i,naturalRole:"libero",currentRole:"libero",height:1.72,trust:5,attributes:{jump:40,power:40,reaction:n,stamina:70,speed:n-2,control:n-2,serve:30,block:30}})}function WE(i,e,t){const n=Ao(t.opponentId);if(!n)throw new Error(`careerMatchSetup：未知對手 ${t.opponentId}`);const s=i.scouting?.[t.opponentId],r=s&&(n.scoutRead??0)>0?{B:{targetId:"A2",read:n.scoutRead,zones:s.zones}}:void 0;return{seed:Ad(i,t.id),teams:VE(e,n),aiProfiles:{B:{...n.ai}},...r?{scoutRead:r}:{},liberos:{A:_o("A","小守"),B:_o("B",`${n.name}·自由人`,n.level)},opponent:n}}function XE(i){return JSON.stringify(i)}function rh(i){let e=JSON.parse(i);if(e.version===1&&(e={version:2,seed:e.seed,playerName:e.playerName,schedule:Sd.map(t=>({...t})),results:e.results}),e.version===2&&(e={...e,version:ro,growthPoints:(e.results?.length??0)*4}),e.version!==ro)throw new Error(`生涯存檔版本不符：${e.version}（需 ${ro}）`);for(const t of["seed","playerName","schedule","results","growthPoints"])if(e[t]===void 0)throw new Error(`生涯存檔缺欄位：${t}`);if(!Array.isArray(e.schedule)||!Array.isArray(e.results))throw new Error("生涯存檔 schedule/results 必須是陣列");for(const t of e.schedule){if(!t.id||!t.opponentId)throw new Error("生涯存檔賽程項缺 id/opponentId");if(!Ao(t.opponentId))throw new Error(`生涯存檔含未知對手：${t.opponentId}`)}return e}const nn={BASE_POINTS:2,WIN_BONUS:2,KILL_POINT:1,ACE_POINT:1,BLOCK_POINT:1,PERFECT_PER_POINT:2,MATCH_CAP:12,ATTR_STEP:1,ATTR_CAP:90,TIP_POWER:.45},Cd=[{key:"power",name:"力量"},{key:"jump",name:"彈跳"},{key:"reaction",name:"反應"},{key:"speed",name:"速度"},{key:"serve",name:"發球"},{key:"block",name:"攔網"}],jE=[{key:"tip",name:"吊球",desc:"攻擊面板新增「吊球」——騙重心的輕放"},{key:"dive",name:"魚躍救球",desc:"救球鈕：撲向搆不到的球——撲空會倒地"},{key:"pipe",name:"後排 pipe",desc:"輪到後排也能主導進攻（後排攻擊面板）"},{key:"floatServe",name:"飄浮發球",desc:"不轉的球最難接——破壞對方一傳品質"},{key:"feint",name:"假動作",desc:"按A滑B視線騙攔網；越用越純熟"},{key:"jumpServe",name:"跳躍發球",desc:"最強的發球——力量換準度"}];function KE(i,e,t){const n={kills:0,tipKills:0,aces:0,blockPoints:0,perfects:0,spikes:0};let s=null;for(const r of i)r.type==="TOUCH"||r.type==="SERVE"?(s={playerId:r.playerId,team:r.team,kind:r.kind??"serve",power:r.power},r.type==="TOUCH"&&r.playerId===e&&(r.kind==="spike"&&(n.spikes+=1),r.kind==="receive"&&(r.power??0)>=.95&&(n.perfects+=1))):r.type==="BLOCK_TOUCH"?s={playerId:r.playerId,team:r.team,kind:"block"}:r.type==="SCORE"&&(r.team===t&&s&&s.team===t&&s.playerId===e&&(s.kind==="spike"?(s.power??1)<=nn.TIP_POWER?n.tipKills+=1:n.kills+=1:s.kind==="serve"?n.aces+=1:s.kind==="block"&&(n.blockPoints+=1)),s=null);return n}function qE(i,e){const t=nn.BASE_POINTS+(e?nn.WIN_BONUS:0)+(i.kills+i.tipKills)*nn.KILL_POINT+i.aces*nn.ACE_POINT+i.blockPoints*nn.BLOCK_POINT+Math.floor(i.perfects/nn.PERFECT_PER_POINT);return Math.min(t,nn.MATCH_CAP)}function YE(i){const e=i.attributes.reaction;return e<55?"none":e<70?"slow":"instant"}function $E(i,e){if(!Cd.some(n=>n.key===e))throw new Error(`spendAttribute：不可加點的屬性 ${e}`);const t=i.attributes[e];if(t>=nn.ATTR_CAP)throw new Error(`spendAttribute：${e} 已達上限 ${nn.ATTR_CAP}`);return{...i,attributes:{...i.attributes,[e]:Math.min(nn.ATTR_CAP,t+nn.ATTR_STEP)}}}const ZE=[{id:"debut",moment:"pre",when:{matchId:"group-1"},lines:[{speaker:"隊長（MB）",text:"新人，第一場別想太多——球來了就打，其他交給我們。"},{speaker:"二傳（S）",text:"舉給你的球，放心打。打丟了算我的。"}]},{id:"mb-warn",moment:"pre",when:{opponentId:"obsidian",stage:"group"},lines:[{speaker:"隊長（MB）",text:"曜石的中間手又快又急——中路封起來之前，別跟他硬碰。"}]},{id:"first-win",moment:"post",when:{wonLast:!0,playedCount:1},effect:{trust:3},lines:[{speaker:"二傳（S）",text:"打得不錯嘛，新人。下一場，關鍵分也敢給你了。"}]},{id:"first-loss",moment:"post",when:{wonLast:!1,lossCount:1},effect:{trust:2},lines:[{speaker:"二傳（S）",text:"別背著。輸球是全隊的事——下一顆，我照樣給你。"}]},{id:"hot-hand",moment:"post",when:{minKills:5},effect:{trust:4},lines:[{speaker:"二傳（S）",text:"你手感燙起來了。之後的球，會更常到你手上。"}]},{id:"teach-tip",moment:"post",when:{lastMatchId:"group-1"},effect:{unlock:"tip"},lines:[{speaker:"北原工商・隊長",text:"你只會全力打直球啊，新人。力量不夠的時候——用腦子打。"},{speaker:"北原工商・隊長",text:"看好，手腕放軟、指尖推球。這叫吊球。拿去用吧。"}]},{id:"teach-dive",moment:"post",when:{lastMatchId:"group-2"},effect:{unlock:"dive"},lines:[{speaker:"白浪高中・自由人",text:"看到我們救了幾顆你們以為落地的球嗎？防守不是站著等球來。"},{speaker:"白浪高中・自由人",text:"撲出去。會痛，但球不會落地。這叫魚躍——送你了。"}]},{id:"teach-pipe",moment:"post",when:{lastMatchId:"group-3"},effect:{unlock:"pipe"},lines:[{speaker:"曜石體中・MB",text:"你的進攻只有前排三公尺。我們的進攻，是整片場地。"},{speaker:"曜石體中・MB",text:"後排起跳、攻擊線後起飛——pipe。學會它，你才算立體。"}]},{id:"teach-float",moment:"post",when:{lastMatchId:"national-qf"},effect:{unlock:"floatServe"},lines:[{speaker:"鐵霧工業・王牌發球手",text:"光有力氣的發球，練十年也就那樣。最難接的球——是不轉的球。"},{speaker:"鐵霧工業・王牌發球手",text:"掌根擊球心、瞬間停腕。飄浮球會自己跳舞。"}]},{id:"teach-feint",moment:"post",when:{lastMatchId:"group-3"},effect:{unlock:"feint"},lines:[{speaker:"曜石體中・隊長",text:"你的每一球，我們都記下來了。再遇到的時候——你那些慣用線，一條都過不了。"},{speaker:"曜石體中・隊長",text:"會被讀的人，才需要學騙。眼睛看左、手打右——當作見面禮，拿去。"}]},{id:"teach-jump",moment:"pre",when:{matchId:"national-final"},effect:{unlock:"jumpServe"},lines:[{speaker:"隊長（MB）",text:"決賽了。把我壓箱的東西給你——跳躍發球，我們隊史上只有兩個人發得動。"},{speaker:"隊長（MB）",text:"助跑、拋球、當它是扣球打下去。去吧，把天鷹轟下來。"}]},{id:"nationals",moment:"pre",when:{matchId:"national-qf"},lines:[{speaker:"教練",text:"全國賽，單淘汰——輸一場就收隊回家。放開打，別留手。"}]},{id:"rematch-won",moment:"pre",when:{matchId:"national-sf",wonVs:"obsidian"},lines:[{speaker:"隊長（MB）",text:"曜石。小組賽輸給我們之後，他們把你的每一球都看了三遍。"},{speaker:"二傳（S）",text:"他們衝著你來的。慣用的線路會被讀死——換節奏，或者用騙的。"}]},{id:"rematch-lost",moment:"pre",when:{matchId:"national-sf",lostVs:"obsidian"},lines:[{speaker:"隊長（MB）",text:"又是曜石。小組賽欠他們一場——今天當面討回來。"},{speaker:"二傳（S）",text:"他們記得你怎麼打的。上次的套路不會再通——拿出新的東西。"}]}];function oh(i,e){const t=i.events??[],n=i.results[i.results.length-1]??null,s=bd(i);return ZE.filter(r=>r.moment===e&&!t.includes(r.id)&&QE(r.when,{career:i,last:n,next:s}))}function JE(i,e){return{...i,events:[...i.events??[],e]}}function QE(i,{career:e,last:t,next:n}){for(const[s,r]of Object.entries(i))switch(s){case"matchId":if(n?.id!==r)return!1;break;case"opponentId":if(n?.opponentId!==r)return!1;break;case"stage":if(n?.stage!==r)return!1;break;case"wonLast":if(!t||!!t.won!==r)return!1;break;case"lastMatchId":if(t?.matchId!==r)return!1;break;case"wonVs":if(!ah(e,r,!0))return!1;break;case"lostVs":if(!ah(e,r,!1))return!1;break;case"playedCount":if(e.results.length!==r)return!1;break;case"lossCount":if(e.results.filter(o=>!o.won).length!==r)return!1;break;case"minKills":if((t?.stats?.kills??0)+(t?.stats?.tipKills??0)<r)return!1;break;default:return!1}return!0}function ah(i,e,t){return i.results.some(n=>n.opponentId===e&&!!n.won===t)}const Ge={bg:"linear-gradient(180deg, #070a12 0%, #0b1120 55%, #070a12 100%)",text:"#eef2fa",dim:"#9fb0cc",gold:"#ffd166",red:"#ff8a8a",cyan:"#6ee7ff",card:"rgba(18,24,40,0.85)"};function eS(i,{onPlay:e,onQuick:t}){const n=Be("div",["position:fixed","inset:0","z-index:30","display:none","flex-direction:column","align-items:center","justify-content:safe center","gap:14px",`background:${Ge.bg}`,`color:${Ge.text}`,"font-family:system-ui,sans-serif","user-select:none","overflow-y:auto","padding:calc(env(safe-area-inset-top, 0px) + 24px) 20px 40px"]);document.body.appendChild(n);const s=Be("div",["min-height:20px","font-size:14px",`color:${Ge.red}`,"text-align:center"]),r=A=>{s.textContent=A??""},o=Be("input",["display:none"]);o.type="file",o.accept="application/json,.json",o.addEventListener("change",async()=>{const A=o.files?.[0];if(o.value="",!!A)try{i.importSave(await A.text()),y()}catch(w){r(`匯入失敗：${w.message??w}`)}}),document.body.appendChild(o);const a=Be("div",["position:fixed","inset:0","z-index:34","display:none","background:rgba(4,6,12,0.5)","align-items:flex-end","justify-content:center","padding-bottom:calc(env(safe-area-inset-bottom, 0px) + 26px)"]),c=Be("div",["width:min(480px, 92vw)",`background:${Ge.card}`,"border-radius:16px","border:1px solid #2c3a58","padding:16px 20px","cursor:pointer","box-shadow:0 12px 40px rgba(0,0,0,0.6)"]),l=Be("div",["font-size:13px","font-weight:800",`color:${Ge.gold}`,"letter-spacing:2px"]),u=Be("div",["font-size:15px",`color:${Ge.text}`,"line-height:1.6","margin-top:6px","text-align:left","min-height:44px"]),h=Be("div",["font-size:11px",`color:${Ge.dim}`,"text-align:right","margin-top:8px"],"▼ 點擊繼續");c.appendChild(l),c.appendChild(u),c.appendChild(h),a.appendChild(c),document.body.appendChild(a);let d=null;function p(A,w){const R=A.flatMap(C=>C.lines);if(!R.length){w();return}d={queue:R,onDone:w},a.style.display="flex",g()}function g(){const A=d.queue[0];l.textContent=A.speaker,u.textContent=A.text}a.addEventListener("pointerdown",A=>{if(A.stopPropagation(),!d)return;if(d.queue.shift(),d.queue.length){g();return}a.style.display="none";const w=d.onDone;d=null,w()});function _(A,w,R,C){let S=w;for(const D of A)if(S=JE(S,D.id),D.effect?.trust&&uf(R,D.effect.trust),D.effect?.unlock){const P=D.effect.unlock;R.techniques[P]=Math.max(1,R.techniques[P]??0),P==="feint"&&(R.techniques.feintUses=R.techniques.feintUses||0)}const M=i.saveCareer(S),T=i.savePlayer(R);(!M||!T)&&r("⚠ 存檔寫入失敗——事件進度可能未保存"),p(A,C)}function m(){try{const A=new Blob([i.exportSave()],{type:"application/json"}),w=document.createElement("a");w.href=URL.createObjectURL(A),w.download="volleyball-dream-save.json",w.click(),setTimeout(()=>URL.revokeObjectURL(w.href),5e3)}catch(A){r(`匯出失敗：${A.message??A}`)}}function f(){n.replaceChildren(),r(""),n.appendChild(Be("div",["font-size:52px","font-weight:900","letter-spacing:10px",`color:${Ge.gold}`,"text-shadow:0 4px 24px rgba(0,0,0,0.8)"],"排球夢")),n.appendChild(Be("div",["font-size:15px",`color:${Ge.dim}`,"letter-spacing:4px","margin-bottom:10px"],"生涯模式"));const A=i.loadCareer(),w=A!==null&&i.loadPlayer()!==null;if(w){const D=sh(A);n.appendChild(qs("▶ 繼續生涯",!0,()=>y())),n.appendChild(Be("div",["font-size:13px",`color:${Ge.dim}`],`${A.playerName}・地區賽 ${D.wins} 勝 ${D.losses} 敗`))}const R=Be("div",["display:none","flex-direction:column","align-items:center","gap:10px",`background:${Ge.card}`,"border-radius:14px","padding:16px 20px"]),C=Be("input",["width:200px","height:44px","border-radius:10px","border:1px solid #2c3a58","background:#0d1322",`color:${Ge.text}`,"font-size:16px","text-align:center"]);C.maxLength=12,C.placeholder="你的名字",C.value="小夢";let S=!1;const M=qs("開始生涯",!0,()=>{if(w&&!S){S=!0,M.textContent="將覆蓋現有生涯——再點一次確認",M.style.background="#8a3a3a";return}const D=C.value.trim()||"小夢",P=NE({seed:Date.now()%1000000007,playerName:D}),O=FE(D);(!i.saveCareer(P)||!i.savePlayer(O))&&r("存檔寫入失敗——瀏覽器儲存空間不可用（進度將無法保留）"),y()});R.appendChild(C),R.appendChild(M),n.appendChild(qs("新生涯",!1,()=>{R.style.display=R.style.display==="none"?"flex":"none"})),n.appendChild(R),n.appendChild(qs("快速比賽",!1,()=>{v(),t()}));const T=Be("div",["display:flex","gap:10px","margin-top:6px"]);w&&T.appendChild($r("匯出存檔",m)),T.appendChild($r("匯入存檔",()=>o.click())),n.appendChild(T),n.appendChild(s)}function y(){let A=i.loadCareer();const w=i.loadPlayer();if(!A||!w){f();return}Rd(w);const R=OE(A);if(R!==A){const z=R.results.length>A.results.length;i.saveCareer(R),A=R,z&&r("上一場中途離開——依規記為棄賽敗（0:25）")}const C=oh(A,"post");if(C.length){_(C,A,w,()=>y());return}n.replaceChildren(),r("");const S=sh(A),M=bd(A);n.appendChild(Be("div",["font-size:26px","font-weight:800",`color:${Ge.text}`,"letter-spacing:2px"],`${A.playerName}・你·OH`)),n.appendChild(Be("div",["font-size:14px",`color:${Ge.dim}`],`戰績 ${S.wins} 勝 ${S.losses} 敗・二傳信任 ${w.trust.fromSetter}`)),n.appendChild(x(A,w));const T=Td(A),D=z=>{const F=A.results.find(ne=>ne.matchId===z.id),X=M?.id===z.id,V=Be("div",["display:flex","justify-content:space-between","align-items:center","height:52px","padding:0 16px","border-radius:12px",`background:${Ge.card}`,`border:1px solid ${X?Ge.cyan:"transparent"}`]),ee=z.label?`${z.label}・${ba(z.opponentId)}`:ba(z.opponentId);V.appendChild(Be("div",["font-size:16px","font-weight:600"],ee));let re;return F?re=Be("div",["font-size:15px","font-weight:700",`color:${F.won?Ge.gold:Ge.red}`],`${F.won?"勝":"負"} ${F.scoreFor}:${F.scoreAgainst}`):X?re=Be("div",["font-size:14px",`color:${Ge.cyan}`],"▶ 下一場"):T==="eliminated"?re=Be("div",["font-size:14px",`color:${Ge.dim}`],"—"):z.stage==="national"&&T==="group"?re=Be("div",["font-size:14px",`color:${Ge.dim}`],"🔒"):re=Be("div",["font-size:14px",`color:${Ge.dim}`],"未開打"),V.appendChild(re),V},P=Be("div",["display:flex","flex-direction:column","gap:8px","width:min(340px, 92vw)"]);P.appendChild(Be("div",["font-size:14px",`color:${Ge.cyan}`,"letter-spacing:3px","margin-top:4px"],"地區賽・小組循環"));for(const z of A.schedule.filter(F=>F.stage==="group"))P.appendChild(D(z));P.appendChild(Be("div",["font-size:14px",`color:${Ge.cyan}`,"letter-spacing:3px","margin-top:8px"],"全國賽・單淘汰"));for(const z of A.schedule.filter(F=>F.stage==="national"))P.appendChild(D(z));if(n.appendChild(P),T==="champion")n.appendChild(Be("div",["font-size:22px","font-weight:900",`color:${Ge.gold}`,"margin-top:8px","letter-spacing:2px"],"🏆 全國冠軍！")),n.appendChild(Be("div",["font-size:14px",`color:${Ge.dim}`],`生涯首冠達成（${S.wins} 勝 ${S.losses} 敗）`));else if(T==="eliminated"){const z=A.results.find(X=>!X.won&&A.schedule.find(V=>V.id===X.matchId)?.stage==="national"),F=A.schedule.find(X=>X.id===z?.matchId)?.label??"全國賽";n.appendChild(Be("div",["font-size:20px","font-weight:800",`color:${Ge.red}`,"margin-top:8px"],`止步${F}`)),n.appendChild(Be("div",["font-size:14px",`color:${Ge.dim}`],`本屆戰績 ${S.wins} 勝 ${S.losses} 敗——從主選單開新生涯再挑戰`))}else if(M){n.appendChild(qs(`▶ 出戰 ${ba(M.opponentId)}`,!0,()=>{const F=()=>{v(),e({career:i.loadCareer()??A,player:w,matchEntry:M})},X=oh(A,"pre");X.length?_(X,A,w,F):F()}));const z=Ao(M.opponentId)?.trait;z&&n.appendChild(Be("div",["font-size:13px",`color:${Ge.dim}`,"max-width:min(340px, 92vw)","text-align:center","line-height:1.5"],`敵情：${z}`))}const O=Be("div",["display:flex","gap:10px","margin-top:4px"]);O.appendChild($r("返回主選單",f)),O.appendChild($r("匯出存檔",m)),n.appendChild(O),n.appendChild(s)}function x(A,w){const R=A.growthPoints??0,C=Be("div",["display:flex","flex-direction:column","gap:9px",`background:${Ge.card}`,"border-radius:14px","padding:12px 16px","width:min(340px, 92vw)","margin-top:4px"]),S=Be("div",["display:flex","justify-content:space-between","align-items:center"]);S.appendChild(Be("div",["font-size:14px",`color:${Ge.cyan}`,"letter-spacing:3px"],"成長")),S.appendChild(Be("div",["font-size:15px","font-weight:800",`color:${R>0?Ge.gold:Ge.dim}`],`點數 ${R}`)),C.appendChild(S);const M=A.results[A.results.length-1];if(M?.stats){const P=M.stats;C.appendChild(Be("div",["font-size:12px",`color:${Ge.dim}`,"text-align:left"],`上場：殺球${P.kills}｜吊球${P.tipKills}｜ACE${P.aces}｜攔網${P.blockPoints}｜Perfect ${P.perfects}（＋${M.gp??0} 點）`))}const T=(P,O)=>{try{const z=i.saveCareer({...A,growthPoints:R-O}),F=z&&i.savePlayer(P());(!z||!F)&&r("⚠ 存檔寫入失敗——瀏覽器儲存空間不可用，本次變更未保存"),y()}catch(z){r(String(z.message??z))}},D=Be("div",["display:grid","grid-template-columns:repeat(3,1fr)","gap:6px"]);for(const P of Cd){const O=w.attributes[P.key],z=R>=1&&O<nn.ATTR_CAP,F=Be("button",["height:38px","border-radius:10px","border:1px solid #2c3a58","font-size:13px","cursor:pointer","touch-action:manipulation","font-weight:600",z?`background:rgba(30,40,64,0.9);color:${Ge.text}`:`background:transparent;color:${Ge.dim};opacity:0.5`],`${P.name} ${O} ＋`);F.disabled=!z,F.addEventListener("pointerdown",X=>{X.stopPropagation(),z&&T(()=>$E(w,P.key),1)}),D.appendChild(F)}C.appendChild(D);for(const P of jE){const O=(w.techniques?.[P.key]??0)>=1,z=Be("div",["display:flex","justify-content:space-between","align-items:center","gap:10px"]),F=Be("div",["flex:1","text-align:left"]),X=O?P.name+(P.key==="feint"?`（熟練 ${w.techniques.feintUses??0}）`:""):"？？？";F.appendChild(Be("div",["font-size:14px","font-weight:700",O?"":`color:${Ge.dim}`],X)),F.appendChild(Be("div",["font-size:11px",`color:${Ge.dim}`,"line-height:1.4"],O?P.desc:"未習得——比賽裡自有人教你")),z.appendChild(F),z.appendChild(Be("div",["font-size:13px","font-weight:700","white-space:nowrap",`color:${O?Ge.gold:Ge.dim}`],O?"✓ 已習得":"—")),C.appendChild(z)}return C}function v(){n.style.display="none"}return{show(A="home"){n.style.display="flex",A==="career"&&i.hasSave()?y():f()},hide:v}}function Be(i,e,t){const n=document.createElement(i);return n.style.cssText=e.join(";"),t!==void 0&&(n.textContent=t),n}function qs(i,e,t){const n=Be("button",["min-width:220px","height:52px","padding:0 24px","border-radius:26px","border:none","font-size:17px","font-weight:700","cursor:pointer","touch-action:manipulation","letter-spacing:1px",e?`background:${Ge.gold};color:#1a1405`:`background:rgba(30,40,64,0.9);color:${Ge.text}`],i);return n.addEventListener("pointerdown",s=>{s.stopPropagation(),t()}),n}function $r(i,e){const t=Be("button",["height:40px","padding:0 16px","border-radius:20px","border:1px solid #2c3a58","background:transparent",`color:${Ge.dim}`,"font-size:14px","cursor:pointer","touch-action:manipulation"],i);return t.addEventListener("pointerdown",n=>{n.stopPropagation(),e()}),t}const Js="vd-career-v1",Zr="vd-career-player-v1",ch="volleyball-dream-save";function tS(i){const e=nS(),t=s=>{try{return e.getItem(s)}catch{return null}},n=(s,r)=>{try{return e.setItem(s,r),!0}catch{return!1}};return{hasSave(){return t(Js)!==null&&t(Zr)!==null},loadCareer(){const s=t(Js);if(s===null)return null;try{return rh(s)}catch{return null}},saveCareer(s){return n(Js,XE(s))},loadPlayer(){const s=t(Zr);if(s===null)return null;try{return nl(s)}catch{return null}},savePlayer(s){return n(Zr,Zd(s))},clear(){try{e.removeItem(Js),e.removeItem(Zr)}catch{}},exportSave(){const s=this.loadCareer(),r=this.loadPlayer();if(!s||!r)throw new Error("沒有可匯出的生涯存檔");return JSON.stringify({format:ch,career:s,player:r},null,2)},importSave(s){const r=JSON.parse(s);if(r.format!==ch)throw new Error("不是排球夢的存檔檔案");const o=rh(JSON.stringify(r.career)),a=nl(JSON.stringify(r.player));if(!this.saveCareer(o)||!this.savePlayer(a))throw new Error("存檔寫入失敗（儲存空間不可用）");return{career:o,player:a}}}}function nS(){try{const i=globalThis.localStorage;return i.getItem(Js),i}catch{const i=new Map;return{getItem:e=>i.has(e)?i.get(e):null,setItem:(e,t)=>{i.set(e,String(t))},removeItem:e=>{i.delete(e)}}}}const iS=7777,sS=10,rS=15e3,oS=3,aS=90;function cS(i,e,t,n=null){const s=Aa({seed:(i+iS)%1000000007,setTarget:sS,teams:e,...t?{aiProfiles:t}:{},...n?{liberos:n}:{}}),r=wa(),o=[];let a=null;for(;s.phase!=="set_over"&&s.tick<rS;){s.phase==="serve"&&a===null&&(a={snapshot:structuredClone({...s,events:[]}),steps:[]});const c=Sh(s,r);a&&a.steps.push({intents:c});const l=Ys(s,c);for(const u of l)u.type==="SCORE"&&(u.team==="B"&&a&&a.steps.length>=aS&&o.push(a),a=null)}return o.sort((c,l)=>l.steps.length-c.steps.length),o.slice(0,oS)}const $t="A2";async function lS(){window.addEventListener("contextmenu",p=>p.preventDefault()),document.addEventListener("gesturestart",p=>p.preventDefault());const i=new URLSearchParams(window.location.search),e=$f(),t=document.getElementById("app"),n=document.getElementById("loading"),s=ly(t,e),r=uy(),o=hy(),a=dy(r,e),c=py(r,e);yy(r);const l=NM(r,e);fy(s,o);const u=i.get("hud")==="1"||i.get("mode")==="bench",h=aE(document.getElementById("hud"),s,Jf(e),u),d={renderer:s,scene:r,camera:o,quality:e,ballView:l,hud:h,loadingEl:n,params:i,court:c,lights:a};i.get("mode")==="bench"?await hS(d):i.get("quick")==="1"?await Sc(d,null):uS(d)}function uS(i){i.loadingEl.remove();const e=tS(),t=eS(e,{onQuick:()=>{Sc(i,null)},onPlay:({career:s,player:r,matchEntry:o})=>{Sc(i,{store:e,career:s,player:r,matchEntry:o})}}),n=i.params.get("career")==="resume"&&e.hasSave();t.show(n?"career":"home")}async function Sc(i,e=null){const{renderer:t,scene:n,camera:s,quality:r,ballView:o,hud:a,loadingEl:c,params:l,court:u,lights:h}=i,d=Number.parseInt(l.get("seed"),10);let p=Number.isFinite(d)?d:e?Ad(e.career,e.matchEntry.id):Date.now()%1000000007;const g=Number.parseInt(l.get("points"),10),_=Number.isFinite(g)?Math.min(Math.max(g,5),25):25,m=l.get("classic")!=="1",f=e?WE(e.career,e.player,e.matchEntry):null;e&&e.store.saveCareer(UE(e.career,e.matchEntry.id));const y=f?.liberos??{A:_o("A","A隊自由人"),B:_o("B","B隊自由人")};let x=Aa({seed:p,setTarget:_,liberos:y,...f?{teams:f.teams,aiProfiles:f.aiProfiles,...f.scoutRead?{scoutRead:f.scoutRead}:{}}:{}}),v=wa();const A=f?cS(p,f.teams,f.aiProfiles,f.liberos):[];let w=0;const R=e?x.players[$t].techniques??{}:null,C=!R||(R.tip??0)>=1,S=!R||(R.pipe??0)>=1,M=!R||(R.jumpServe??0)>=1,T=!R||(R.floatServe??0)>=1,D=!R||(R.feint??0)>=1,P=!R||(R.dive??0)>=1;let O=!1;const z=e?YE(x.players[$t]):"instant";let F=0,X=-1,V=-1e9,ee;try{ee=await RM(n,r,x,$t,l.get("pose"))}catch($){c.textContent=`模型載入失敗：${$.message??$}`,a.error(`模型載入失敗（${r.model}）`),ee={count:0,sync(){}}}ee.count>0&&c.remove();const re=FM(s,$t),ne=rE(t.domElement,s,$t,re,m),Te=uE($t),Fe=m?xE(f?.opponent??null):null,j=vE(),se=ME(),_e=m?bE():null,ce=m?null:SE(ne);let Ee=!1,Ze=!1,Re=!0;try{Re=localStorage.getItem("vd-hints")!=="off"}catch{}if(z==="none"&&(Re=!1),m&&z!=="none"){const $=document.createElement("button"),me=()=>{$.textContent=Re?"👁 提示:開":"👁 提示:關"};$.style.cssText=["position:fixed","top:calc(env(safe-area-inset-top, 0px) + 8px)","right:calc(env(safe-area-inset-right, 0px) + 64px)","height:44px","padding:0 12px","border-radius:22px","border:none","background:rgba(12,16,26,0.6)","color:#eef2fa","font-size:14px","font-family:system-ui,sans-serif","z-index:16","cursor:pointer","touch-action:manipulation"].join(";"),me(),$.addEventListener("pointerdown",Oe=>{Oe.stopPropagation(),Re=!Re,me();try{localStorage.setItem("vd-hints",Re?"on":"off")}catch{}}),document.body.appendChild($)}const ct=document.createElement("button");ct.textContent="🎬",ct.style.cssText=["position:fixed","top:calc(env(safe-area-inset-top, 0px) + 8px)","right:calc(env(safe-area-inset-right, 0px) + 12px)","width:44px","height:44px","border-radius:50%","border:none","background:rgba(12,16,26,0.6)","font-size:20px","z-index:16","cursor:pointer","touch-action:manipulation"].join(";"),ct.addEventListener("pointerdown",$=>{$.stopPropagation(),Ue()}),document.body.appendChild(ct);const it=document.createElement("button");it.textContent="魚躍!",it.style.cssText=["position:fixed","right:calc(env(safe-area-inset-right, 0px) + 16px)","bottom:38%","width:74px","height:74px","border-radius:50%","border:3px solid #101420","background:rgba(70,80,100,0.5)","color:rgba(255,255,255,0.4)","font-size:17px","font-weight:800","z-index:16","cursor:pointer","touch-action:manipulation","display:none","box-shadow:0 3px 0 rgba(8,10,18,0.55)","transition:background 120ms ease, color 120ms ease, transform 120ms ease"].join(";"),it.addEventListener("pointerdown",$=>{$.stopPropagation(),O&&ne.diveNow(x)}),document.body.appendChild(it),window.addEventListener("keydown",$=>{($.code==="KeyL"||m&&$.code==="Space")&&!$.repeat&&O&&($.preventDefault(),ne.diveNow(x))});const Je=Ju(n),L=l.get("assist")!=="off",bt=Ju(n,7268351,.6);let Qe=-1,nt=null;PE(m),window.addEventListener("pointerdown",()=>{if(x.phase==="set_over"){if(e){const $=new URLSearchParams;$.set("career","resume");for(const me of["points","classic","assist"]){const Oe=l.get(me);Oe!==null&&$.set(me,Oe)}window.location.assign(`${window.location.pathname}?${$.toString()}`);return}p+=1,x=Aa({seed:p,setTarget:_}),v=wa(),k=$t,q="",he=null,qe=null,xe={snapshot:null,steps:[]},Ee=!1,Ce.hide(),_e&&_e.hide(),ne.setPlayerId($t),re.setPlayerId($t),ee.setControlled($t),window.__phase1.game=x,window.__phase1.aiState=v}});let xe={snapshot:null,steps:[]},qe=null;const Ce=LE();let Ve=x.phase,Et=0,I=0;const E=l.get("teamcontrol")==="1";let k=$t,q="",Z=-1,K=0,be=0,oe=0;const ge=AE(),Ae=IE();let J=null,pe=null,he=null;const Le=180,ae=.5;function Ue(){const $=qe;if(!$||!$.snapshot||$.steps.length===0||he)return;const me=structuredClone($.snapshot),Oe=Math.max(0,$.steps.length-Le);for(let mt=0;mt<Oe;mt+=1)Ys(me,$.steps[mt].intents);he={state:me,steps:$.steps,idx:Oe,acc:0},ge.show("🎬 回放","#ffd166",1200)}window.addEventListener("keydown",$=>{$.code==="KeyR"&&Ue()});const U=240;function le(){const $=A[w];if(!$)return;const me=structuredClone($.snapshot),Oe=Math.max(0,$.steps.length-U);for(let mt=0;mt<Oe;mt+=1)Ys(me,$.steps[mt].intents);he={state:me,steps:$.steps,idx:Oe,acc:0,tape:!0},ge.show(`📼 情蒐：對手關鍵球 ${w+1}/${A.length}（點擊跳過）`,"#6ee7ff",2e3),w+=1}window.addEventListener("pointerdown",()=>{he?.tape&&(he=null,w=A.length,ge.show("跳過情蒐——比賽開始！","#9fb0cc",1e3))});function Q(){if(x.phase==="serve")return x.match.servingTeam==="A"?_n(x.match):k;if(x.phase!=="rally")return k;const $=v.claimId;if($&&x.players[$].teamId==="A")return $;if(x.rally.possession==="B"){const me=x.match.rotations.A;let Oe=me[1];for(const mt of[me[1],me[2],me[3]])Math.abs(x.actors[mt].x-x.ball.x)<Math.abs(x.actors[Oe].x-x.ball.x)&&(Oe=mt);return Oe}return k}function ve(){if(!E||ne.isCharging())return;const $=`${x.phase}:${x.rally.flightId}:${v.claimId??""}`;if($===q)return;q=$;const me=Q();me!==k&&(k=me,ne.setPlayerId(me),re.setPlayerId(me),ee.setControlled(me))}window.__phase1={game:x,aiState:v,renderer:t,scene:n,camera:s,quality:r,rig:re,vcr:()=>qe,controlled:()=>k,tapeCount:A.length},A.length&&le();let te=performance.now(),Y=0;document.addEventListener("visibilitychange",()=>{document.hidden||(te=performance.now())});function Me($){requestAnimationFrame(Me);let me=($-te)/1e3;if(te=$,me>oo&&(me=oo),me<0&&(me=0),he){for(he.acc+=me*ae;he.acc>=Dt&&he.idx<he.steps.length;)Ys(he.state,he.steps[he.idx].intents),he.idx+=1,he.acc-=Dt;const Ie=Math.min(he.acc/Dt,1);if(o.sync(he.state.ball,Ie,me),ee.sync(he.state,Ie,me,[]),Je.hide(),bt.hide(),s.position.set(0,12,12.5),s.lookAt(0,.6,0),t.render(n,s),a.frame($,me,0),_e&&_e.hide(),he.idx>=he.steps.length){const pt=he.tape;he=null,pt&&(w<A.length?le():ge.show("情蒐結束——比賽開始！","#ffd166",1500))}return}let Oe=!1;if(m){re.setAttackView(ne.isAttackMoment(x));const Ie=ne.attackZones(x),pt=Ie&&Ie.filter(Fn=>Fn.key!=="tip"||C),un=hh(x.match.rotations[x.players[k].teamId],k),Qn=!!pt&&(S||!un)&&x.ball.vy<0&&x.ball.y>2&&!ne.attackPending(),Cn=ne.isDefendMoment(x,v)&&x.ball.vy<0&&x.ball.y>2;re.setDefendView(Cn);const Ls=x.phase==="serve"&&_n(x.match)===k&&x.tick>=x.serveReadyTick&&!Ee;x.phase!=="serve"&&(Ee=!1),x.phase==="serve"&&x.tick>=x.serveReadyTick&&!Ze&&(Ze=!0,j.whistle(200)),x.phase!=="serve"&&(Ze=!1),Oe=Qn||Cn,Qn?X<0&&(X=$):X=-1;const Ds=Re&&(z==="instant"||z==="slow"&&X>=0&&$-X>600);if(Qn){const Fn=D?"（按A滑B＝假動作）":"";_e.show((Ds?"選攻擊區！":"看攔網選區！")+Fn,pt.map(Ht=>({key:Ht.key,label:Ds?Ht.label+(Ht.blocked?" ✋":""):Ht.label,color:Ds?Ht.blocked?"red":"green":"neutral",zone:Ht})),Ht=>ne.chooseAttack(Ht.zone),(Ht,b)=>{if(!D){ne.chooseAttack(b.zone);return}F+=1,ne.chooseAttackFake(Ht.zone,b.zone),ge.show("假動作!")})}else if(Ls){const Fn=ne.serveZones(x),Ht=[T?"藍＝飄浮":null,M?"橘＝跳發":null].filter(Boolean).join("、");_e.show(Ht?`選發球目標！（${Ht}）`:"選發球目標！",[...Fn.map(b=>({key:b.key,label:b.label,color:"neutral",zone:b,style:null})),...T?Fn.filter(b=>b.key!=="short").map(b=>({key:`f-${b.key}`,label:`飄${b.label.slice(1)}`,color:"cyan",zone:b,style:"float"})):[],...M?Fn.filter(b=>b.key!=="short").map(b=>({key:`j-${b.key}`,label:`跳${b.label.slice(1)}`,color:"orange",zone:b,style:"jump"})):[]],b=>{ne.serveNow(x,b.zone.aim,b.style),Ee=!0})}else _e.hide()}$<K?me=0:Oe?(me*=.4,V=$):$-V<350?me*=.4+.6*(($-V)/350):$<be&&(me*=.35),Y+=me;let mt=0;const Ut=[];for(;Y>=Dt;){x.phase==="serve"&&xe.snapshot===null&&(xe.snapshot=structuredClone({...x,events:[]})),ve();const Ie=[...ne.collect(x,v),...Sh(x,v,[k])];xe.snapshot&&xe.steps.push({tick:x.tick,intents:Ie});const pt=Ys(x,Ie);Ut.push(...pt),pt.some(un=>un.type==="DEAD_BALL")&&(qe=xe,xe={snapshot:null,steps:[]}),Y-=Dt,mt+=1}if(Ut.length>0){j.onEvents(Ut,{rallyFlights:x.rally.flightId-I}),ne.onEvents(Ut),Fe&&Fe.onEvents(Ut,x,v,$,k);for(const Ie of Ut)if(Ie.type==="SERVE"&&(I=x.rally.flightId),Ie.type==="TOUCH"||Ie.type==="SERVE"?J={team:Ie.team,playerId:Ie.playerId,kind:Ie.kind??"serve",power:Ie.power}:Ie.type==="BLOCK_TOUCH"&&(J={team:Ie.team,playerId:Ie.playerId,kind:"block"}),Ie.type==="TOUCH"&&Ie.kind==="spike")K=$+((Ie.power??1)>=.7?70:40),(Ie.power??1)>=.7&&(be=$+450),oe=Math.max(oe,.12);else if(Ie.type==="BLOCK_TOUCH")K=$+60,oe=Math.max(oe,.2);else if(Ie.type==="DEAD_BALL")oe=Math.max(oe,.26),pe={reason:Ie.reason};else if(Ie.type==="SCORE"){Et=$+700;for(const pt of x.match.rotations[Ie.team])ee.triggerPose(pt,"cheer");pe&&(Ae.show(CE({reason:pe.reason,winner:Ie.team,myTeam:x.players[k]?.teamId,lastTouch:J,controlledId:k,score:Ie.score})),pe=null,J=null)}else Ie.type==="TOUCH"&&Ie.kind==="receive"&&Ie.playerId===k&&(Ie.power??0)>=.95&&ge.show("PERFECT!")}if(L&&x.phase==="rally")if(Qe!==x.rally.flightId&&(Qe=x.rally.flightId,nt=_h(x.ball)),nt&&nt.z>0){const Ie=dh(nt.x,nt.z)===null;bt.setColor(Ie?16735067:7268351),bt.show(nt)}else bt.hide();else bt.hide();const Is=x.phase==="rally"&&v.claimId===k;if(ee.setHot(Is),ne.consumeJumpSignal()&&ee.triggerPose(k,"windup"),ne.consumeBlockSignal()&&ee.triggerPose(k,"block"),x.phase==="rally"&&x.rally.touches===2&&v.claimId&&v.claimId!==k&&v.flightId!==Z){const Ie=x.actors[v.claimId],pt=x.ball;pt.vy<0&&pt.y<3.6&&Math.hypot(pt.x-Ie.x,pt.z-Ie.z)<2.2&&(Z=v.flightId,ee.triggerPose(v.claimId,"windup"))}const Fi=Y/Dt;o.sync(x.ball,Fi,me);const Rn=u.update(me,x.ball);Rn>0&&j.netHit(Rn),ee.sync(x,Fi,me,Ut),re.setSpikeMine(v?.claimId===k),re.update(x,Fi,me);const xi=x.phase!=="set_over"&&Md(x)!==null;h.setTension(xi,me),j.setHeartbeat(xi),j.setCrowdLevel(xi&&x.phase==="serve"?.016:.05);const gr=$<Et?6.5*Math.sin(Math.PI*(1-(Et-$)/700)):0,_r=$<be?3.5:0,vi=55-gr-_r;if(Math.abs(s.fov-vi)>.01&&(s.fov=vi,s.updateProjectionMatrix()),x.phase==="set_over"&&Ve!=="set_over"){if(e){const Ie=x.players[$t].teamId,pt=x.match.score,un=x.match.winner===Ie,Qn=KE(x.events,$t,Ie);let Cn=!0;F>0&&(e.player.techniques.feintUses=(e.player.techniques.feintUses??0)+F,Cn=e.store.savePlayer(e.player)&&Cn);const Ls=GE(e.career,e.matchEntry.opponentId,x.scoutTally[$t]);Cn=e.store.saveCareer(wd(Ls,{matchId:e.matchEntry.id,won:un,scoreFor:Ie==="A"?pt.A:pt.B,scoreAgainst:Ie==="A"?pt.B:pt.A,gp:qE(Qn,un),stats:Qn}))&&Cn,Cn||ge.show("⚠ 戰績寫入失敗（儲存空間不可用）","#ff8a8a",2600)}Ce.show(x.match.winner,x.match.score,x.players[k].teamId,e?"點擊任意處返回生涯":void 0)}if(Ve=x.phase,oe>.004&&(s.position.x+=(Math.random()-.5)*oe,s.position.y+=(Math.random()-.5)*oe*.6,oe*=.82),P){const Ie=x.actors[k],pt=v?.landing;if(O=x.phase==="rally"&&!he&&x.tick>=Ie.divedUntil&&!!pt&&v.landingTeam===x.players[k].teamId&&x.ball.vy<0,O){const un=Math.hypot(pt.x-Ie.x,pt.z-Ie.z);O=un>1.1&&un<=3.4}it.style.display=m&&x.phase!=="set_over"&&!he?"block":"none",it.style.background=O?"rgba(255,120,96,0.95)":"rgba(70,80,100,0.5)",it.style.color=O?"#1a0e08":"rgba(255,255,255,0.4)",it.style.transform=O?"scale(1.12)":"scale(1)"}Te.update(x,Is,k,Fe?Fe.line(x,v,k,$):void 0),ce&&ce.update(ne.currentContext()),se.update(ne.uiState());const Ps=m?null:ne.currentAimPoint(x);Ps?Je.show(Ps):Je.hide(),t.render(n,s),a.frame($,me,mt)}requestAnimationFrame(Me)}async function hS(i){const{renderer:e,scene:t,camera:n,quality:s,ballView:r,hud:o,loadingEl:a}=i,c=JM(n,e.domElement);let l;try{l=await cM(t,s)}catch(g){a.textContent=`模型載入失敗：${g.message??g}`,o.error(`模型載入失敗（${s.model}）`),l={count:0,update(){}}}l.count>0&&a.remove();const u=kd();window.__phase0={world:u,renderer:e,scene:t,camera:n,quality:s};let h=performance.now(),d=0;document.addEventListener("visibilitychange",()=>{document.hidden||(h=performance.now())});function p(g){requestAnimationFrame(p);let _=(g-h)/1e3;h=g,_>oo&&(_=oo),_<0&&(_=0),d+=_;let m=0;for(;d>=Dt;)Bd(u),d-=Dt,m+=1;r.sync(u.ball,d/Dt),l.update(_),c.update(),e.render(t,n),o.frame(g,_,m)}requestAnimationFrame(p)}lS();if("serviceWorker"in navigator){let i=!1;navigator.serviceWorker.addEventListener("controllerchange",()=>{i||performance.now()>15e3||(i=!0,window.location.reload())}),Ld(async()=>{const{registerSW:e}=await import("./virtual_pwa-register-BWqKvjYb.js");return{registerSW:e}},[],import.meta.url).then(({registerSW:e})=>e({immediate:!0})).catch(()=>{})}export{Ld as _};
