import { DIRECT_PHYSICS as C } from './directConstants.js';
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function closestPoint(p,a,b) {
  const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y+(p.z-a.z)*z)/(x*x+y*y+z*z||1)));
  return {...lerp(a,b,t),t};
}
// Conservative advancement over each short curved-pose interval. The distance
// Lipschitz bound includes BOTH endpoint displacements, so fast translating balls
// cannot jump over a capsule even when no displayed frame overlaps it.
export function sweepCapsule(start,end,old,next,radius) {
  const bound=distance(start,end)+Math.max(distance(old.a,next.a),distance(old.b,next.b));
  let t=0;
  for(let i=0;i<80;i++) {
    const center=lerp(start,end,t),a=lerp(old.a,next.a,t),b=lerp(old.b,next.b,t);
    const q=closestPoint(center,a,b),d=distance(center,q),gap=d-radius-next.radius;
    if(gap<=0.00001) return {t,center,q,d};
    if(bound<1e-12)return null;
    t+=Math.max(0.0000001,gap/bound*0.95);if(t>1)return null;
  }
  return null;
}
export function collideBody(state,oldPose,nextPose,dt) {
  const b=state.ball,start={x:b.x,y:b.y,z:b.z},end={x:b.x+b.vx*dt,y:b.y+b.vy*dt,z:b.z+b.vz*dt};
  let earliest=null;
  for(let i=0;i<nextPose.length;i++) {
    const hit=sweepCapsule(start,end,oldPose[i],nextPose[i],b.radius);
    if(hit && (!earliest||hit.t<earliest.hit.t))earliest={hit,old:oldPose[i],next:nextPose[i]};
  }
  if(!earliest){Object.assign(b,end);return false;}
  const {hit,old,next}=earliest;
  let nx=(hit.center.x-hit.q.x)/(hit.d||1),ny=(hit.center.y-hit.q.y)/(hit.d||1),nz=(hit.center.z-hit.q.z)/(hit.d||1);
  if(hit.d<1e-9){nx=0;ny=1;nz=0;}
  const q0=lerp(old.a,old.b,hit.q.t),q1=lerp(next.a,next.b,hit.q.t);
  const surface={x:(q1.x-q0.x)/dt,y:(q1.y-q0.y)/dt,z:(q1.z-q0.z)/dt};
  const speed=(b.vx-surface.x)*nx+(b.vy-surface.y)*ny+(b.vz-surface.z)*nz;
  if(!state.contactEpisode) {
    state.contactEpisode=true;state.stats.contacts++;
    state.events.push({type:'contact',tick:state.tick,part:next.part,id:next.id,active:next.active,position:{...hit.center}});
    if(speed<0){const impulse=-(1+(next.active?C.activeRestitution:C.passiveRestitution))*speed;b.vx+=impulse*nx;b.vy+=impulse*ny;b.vz+=impulse*nz;}
  } else {
    // Persistent contact only removes inward ball motion; no repeated moving-arm boost.
    const inward=b.vx*nx+b.vy*ny+b.vz*nz;
    if(inward<0){b.vx-=inward*nx;b.vy-=inward*ny;b.vz-=inward*nz;}
  }
  const radius=b.radius+next.radius+0.00002;
  b.x=hit.q.x+nx*radius+b.vx*dt*(1-hit.t);b.y=hit.q.y+ny*radius+b.vy*dt*(1-hit.t);b.z=hit.q.z+nz*radius+b.vz*dt*(1-hit.t);
  return true;
}
export function bodySeparated(ball,pose) {return pose.every(p=>distance(ball,closestPoint(ball,p.a,p.b))>ball.radius+p.radius+C.separation);}
