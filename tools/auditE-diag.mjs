const winListeners={};
globalThis.window={innerWidth:1280,innerHeight:720,
  addEventListener(t,f){(winListeners[t]??=[]).push(f);},removeEventListener(){}};
const THREE=await import('three');
const {createGame,createDefaultTeams,stepGame}=await import('../src/sim/game.js');
const {createAiState,aiCollectIntents}=await import('../src/sim/ai.js');
const {buildQuickSetup}=await import('../src/app/matchConfig.js');
const {buildLibero}=await import('../src/career/careerState.js');
const {createMatchControls}=await import('../src/input/matchControls.js');
const {serverId}=await import('../src/sim/match.js');
const {positionOf}=await import('../src/sim/rotation.js');
const ME='A2';
function mk(){const cam=new THREE.PerspectiveCamera(60,16/9,.1,200);cam.position.set(0,6,14);cam.lookAt(0,1,0);cam.updateMatrixWorld();
 return createMatchControls({addEventListener(){}},cam,ME,{setLook(){},resetLook(){},setSetScan(){},setAttackView(){},setDefendView(){},gazePoint(){return null;},getMode(){return 'third';}},true);}
for(const role of ['setter','outside','middle']){
  const q=buildQuickSetup(role);const teams=q?.teams??createDefaultTeams();
  const g=createGame({seed:700000,teams,liberos:{A:q?.liberoA??buildLibero('A','L'),B:buildLibero('B','L')},setTarget:25,momentum:true});
  const ai=createAiState();const c=mk();
  const posHist={};let served=false;let guard=0;let possOpp=0,possOppFront=0;
  while(g.phase!=='set_over'&&g.phase!=='matchover'&&guard<200000){guard++;
    if(g.phase!=='serve')served=false;
    else if(serverId(g.match)===ME&&g.tick>=g.serveReadyTick&&!served){c.serveNow(g,c.serveZones(g)[0].aim,null);served=true;}
    const p=positionOf(g.match.rotations.A,ME);posHist[p]=(posHist[p]??0)+1;
    if(g.phase==='rally'&&g.rally.possession&&g.rally.possession!=='A'){possOpp++;if([2,3,4].includes(p))possOppFront++;}
    const pi=c.collect(g,ai);const ev=stepGame(g,[...pi,...aiCollectIntents(g,ai,[ME])]);c.onEvents(ev);
  }
  console.log(role,'posHist',JSON.stringify(posHist),'oppPossTicks',possOpp,'ofWhichFront',possOppFront,'score',JSON.stringify(g.match.score??g.match.points??{}));
}
