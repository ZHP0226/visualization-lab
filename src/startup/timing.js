export const TIMING={duration:8,logoSolid:[1.78,2.02],titleSolid:[2.60,2.78],mottoSolid:[2.90,3.08],dustStart:3.65,dustEnd:6.75,whiteEnd:7.00,homeEnd:7.85};
// World-space trajectory matches the reverse of the earlier lens-crossing exit.
export function reverseLensPosition(target,random,t){
 const start=-.22,delay=random[3]*.50,duration=1.65,q=Math.max(0,Math.min(1,(t-start-delay)/duration)),travel=Math.pow(1-q,2.14);
 let dx=(random[0]-.5)*6-target[0]*.25,dy=(random[2]-.5)*6-target[1]*.65;
 if(random[1]<.004){dx=((random[0]-.5)*2.35-target[0])/.8;dy=((random[2]-.5)*1.35-target[1])/.8;}
 return{x:target[0]+dx*travel,y:target[1]+dy*travel,z:25*travel,depth:20-25*travel,q,travel};
}
