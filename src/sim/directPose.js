import { DIRECT_ACTIONS } from './directConstants.js';

// The renderer consumes these exact collision capsules. Fraction is a partial tick,
// allowing physics to sample the curved action path between displayed frames.
export function getDirectPose(state, fraction = 0) {
  const p = state.player, h = p.height, def = DIRECT_ACTIONS[p.action];
  const t = p.actionTick + fraction;
  const active = !!def && t >= def.windup && t < def.windup + def.active;
  const phase = def ? Math.max(0, Math.min(1, (t - def.windup) / def.active)) : 0;
  const raise = def ? Math.min(1, t / def.windup) : 0;
  const recover = def ? Math.max(0, 1 - Math.max(0, t - def.windup - def.active) / def.recovery) : 1;
  const start = state.poseAimStart || p.aim;
  const a0 = Math.atan2(start.x, -start.z), a1 = Math.atan2(p.aim.x, -p.aim.z);
  const delta = Math.atan2(Math.sin(a1-a0),Math.cos(a1-a0));
  const angle = a0 + delta * (state.poseAimStart ? fraction : 1);
  const fx = Math.sin(angle), fz = -Math.cos(angle);
  const crouch = p.action === 'receive' ? 0.1 * raise * recover : p.action === 'dive' ? 0.28 * raise * recover : 0;
  const point = (x,y,f) => ({ x:p.x + (x * -fz + f * fx)*h, y:p.y+(y-crouch)*h, z:p.z+(x*fx+f*fz)*h });
  const segments=[];
  const add=(id,part,a,b,r,on=false)=>segments.push({id,part,a,b,radius:r*h,active:on});
  add('torso','torso',point(0,0.48,0),point(0,0.78,0),0.115);
  add('head','head',point(0,0.91,0),point(0,0.91,0),0.09);
  for(const [side,sign] of [['left',-1],['right',1]]) {
    const hip=point(sign*0.085,0.49,0),knee=point(sign*0.09,0.27,0.025),foot=point(sign*0.09,0.065,0.04);
    add(`${side}-thigh`,'leg',hip,knee,0.062); add(`${side}-shin`,'leg',knee,foot,0.045);
    const shoulder=point(sign*0.145,0.77,0);
    let elbow=point(sign*0.18,0.60,0.02), hand=point(sign*0.18,0.43,0.04);
    const blend = (a,b,q) => ({x:a.x+(b.x-a.x)*q,y:a.y+(b.y-a.y)*q,z:a.z+(b.z-a.z)*q});
    if(p.action==='receive'||p.action==='dive') {
      elbow=blend(elbow,point(sign*0.11,0.69+phase*0.11,0.21),raise*recover);
      hand=blend(hand,point(sign*0.045,0.66+phase*0.24,0.41),raise*recover);
    } else if(p.action==='spike'||p.action==='tip') {
      if(sign===1) {
        const angle=-0.8+phase*2.5;
        elbow=blend(elbow,point(sign*0.16,0.89+0.10*Math.cos(angle),0.10*Math.sin(angle)),raise*recover);
        hand=blend(hand,point(sign*0.14,0.89+0.36*Math.cos(angle),0.36*Math.sin(angle)),raise*recover);
      }
    } else if(p.action==='set'||p.action==='block') {
      elbow=blend(elbow,point(sign*0.15,0.87,0.08),raise*recover);
      hand=blend(hand,point(sign*0.11,1.02+phase*0.16,0.15),raise*recover);
    }
    add(`${side}-upper-arm`,'arm',shoulder,elbow,0.038);
    add(`${side}-forearm`,'forearm',elbow,hand,0.038,active && (p.action!=='spike'&&p.action!=='tip'||sign===1));
    add(`${side}-hand`,'hand',hand,hand,0.045,active && (p.action!=='spike'&&p.action!=='tip'||sign===1));
  }
  return segments;
}
