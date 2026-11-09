export const common=`
float sat(float x){return clamp(x,0.,1.);}
float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash2(i),hash2(i+vec2(1.,0.)),f.x),mix(hash2(i+vec2(0.,1.)),hash2(i+vec2(1.,1.)),f.x),f.y);}
float solidFor(float group,float t){return group<.5?smoothstep(1.78,2.02,t):(group<1.5?smoothstep(2.60,2.78,t):smoothstep(2.90,3.08,t));}
float releaseAt(vec2 p){float erosionNoise=noise2(p*.021)+.45*noise2(p*.063+vec2(13.,7.));float grain=fract(hash2(floor(p/2.8))+.30*erosionNoise);return 3.65+grain*2.05;}
`;
export const particleVertex=common+`
attribute vec3 aColor;attribute vec4 aRandom;attribute float aGroup;attribute float aEdge;
uniform float time;uniform float focal;uniform float darkMode;
varying vec3 vColor;varying float vAlpha;varying float vEnergy;varying float vNear;varying vec2 vDirection;varying float vAspect;varying float vCrisp;varying float vHeadShift;varying float vSeed;
vec3 lensPosition(vec3 target,float t){
 float q=sat((t+.22-aRandom.w*.50)/1.65);float travel=pow(1.-q,2.14);
 vec2 drift=vec2((aRandom.x-.5)*6.-target.x*.25,(aRandom.z-.5)*6.-target.y*.65);
 if(aRandom.y<.004){vec2 aperture=vec2((aRandom.x-.5)*2.35,(aRandom.z-.5)*1.35);drift=(aperture-target.xy)/.8;}
 return vec3(target.xy+drift*travel,25.*travel);
}
void main(){
 bool logo=aGroup<.5;bool title=aGroup>.5&&aGroup<1.5;vec3 target=vec3(position.xy*20./focal,0.);
 float start=title?2.05:2.40,duration=title?.50:.45,delay=aRandom.y*(title?.12:.08);
 float raw=(time-start-delay)/duration,q=smoothstep(0.,1.,raw);vec3 world;
 float solid=solidFor(aGroup,time),alpha;vec3 blue=vec3(.0016,.0865,.7835),cyan=vec3(.0021,.658,.8714),palette=mix(blue,cyan,.12+aRandom.w*.78);
 if(logo){world=lensPosition(target,time);q=sat((time+.22-aRandom.w*.50)/1.65);alpha=(1.-solid)*(.52+.30*aRandom.z);}
 else{float remain=pow(1.-q,1.7);world=target+vec3((aRandom.x-.5)*9.*remain,(aRandom.z-.5)*4.*remain,12.*pow(1.-q,1.5));alpha=step(0.,raw)*(1.-solid)*(.24+.20*aRandom.z);}
 float depth=20.-world.z;
 float hero=1.-step(.00008,aRandom.y),nearGrain=1.-step(.00065,aRandom.y),midGrain=1.-step(.004,aRandom.y);
 if(logo){float layerVisibility=midGrain+(1.-midGrain)*smoothstep(10.,18.,depth);alpha*=smoothstep(.40,1.30,depth)*layerVisibility;alpha*=mix(.62,1.5,nearGrain);}
 vColor=logo?mix(palette,aColor,smoothstep(.55,.98,q)):mix(palette,aColor,solid);
 vEnergy=(.015+aEdge*(logo?1.4:3.5))*(.45+.55*aRandom.z)*(1.-solid);
 vDirection=vec2(1.,0.);vAspect=1.;vHeadShift=0.;vCrisp=logo?1.:0.;vSeed=aRandom.x;
 float size=(1.65+aRandom.x*.42)*20./max(.4,depth);
 if(logo){float magnify=1.-smoothstep(8.,19.,depth);float base=mix(1.7,2.+aRandom.z*1.3,midGrain);base=mix(base,4.+aRandom.z*2.,nearGrain);base=mix(base,7.+aRandom.z*3.,hero);size=clamp(mix(1.8,base,magnify)*20./max(.4,depth),1.6,64.);vEnergy+=magnify*(hero*.5+nearGrain*.2+midGrain*.04)*(1.-solid);}
 if(time>=3.65){
  float release=releaseAt(position.xy),age=max(0.,time-release),life=min(1.60+aRandom.z*.35,6.65-release);
  float direction=aRandom.w<.46?-1.:1.,branch=floor(aRandom.y*6.);float seed=hash2(vec2(branch+3.,direction*7.));
  float envelope=1.-exp(-age*2.1),distance=(235.*age+145.*age*age)*(.72+seed*.58)*(.98+aRandom.x*.04);
  float flowX=noise2(vec2(distance*.004+seed*13.,17.+direction*3.));
  float flowY=noise2(vec2(distance*.0024+seed*5.,29.+direction*7.));
  float loose=step(.76,fract(aRandom.y*6.));float angle=distance*(.005+seed*.009)+seed*13.+flowY*2.1+(aRandom.x-.5)*(.08+age*.14);
  float fine=(aRandom.z-.5)*(8.+age*14.)+sin(age*(4.+aRandom.x*6.)+aRandom.z*6.283)*age*4.;
  vec2 pixel=vec2(position.x*exp(-age*3.8)+direction*distance+(flowX-.5)*95.*envelope,position.y*exp(-age*3.8)+(90.+seed*160.)*envelope*sin(angle)+(flowY-.5)*80.*envelope+fine*envelope);
  pixel+=loose*vec2((aRandom.x-.5)*190.*age,(aRandom.z-.5)*190.*age+sin(age*(3.+aRandom.x*5.)+aRandom.z*6.283)*35.*envelope);
  world=vec3(pixel*20./focal,((flowX-.5)*4.+cos(angle)*(1.5+seed))*envelope);depth=20.-world.z;
  float born=smoothstep(release-.025,release+.10,time),death=1.-smoothstep(life*.72,life,age);
  float selected=step(fract(aRandom.x*37.7+aRandom.z*19.4),.48);
  alpha=born*death*(.48+.30*aRandom.z)*selected;vColor=mix(aColor,palette,.70*smoothstep(0.,.45,age));
  vEnergy=.006+aEdge*.12;size=(1.30+aRandom.x*.85)*20./depth;vCrisp=0.;
 }
 vec4 mv=modelViewMatrix*vec4(world,1.);gl_Position=projectionMatrix*mv;
 if(logo&&time<2.02&&depth>.45){
  vec3 previous=lensPosition(target,time-.016);vec4 pp=projectionMatrix*modelViewMatrix*vec4(previous,1.);
  if(pp.w>.45){vec2 velocity=(gl_Position.xy/gl_Position.w-pp.xy/pp.w)*vec2(960.,540.);float trail=min(length(velocity)*.35,60.);vDirection=length(velocity)>.01?normalize(velocity):vec2(1.,0.);vAspect=(size+trail)/size;vHeadShift=trail/(size+trail);size+=trail;gl_Position.xy-=vDirection*trail/vec2(1920.,1080.)*gl_Position.w;}
 }
 if(depth<=.4||time>=6.75)alpha=0.;
 if(darkMode>.5){vEnergy*=6.;vColor*=1.25;}
 gl_PointSize=clamp(size,1.,256.);vAlpha=alpha;vNear=1.-smoothstep(2.,12.,depth);
}
`;
export const particleFragment=`
uniform float emissionPass;uniform float darkMode;varying vec3 vColor;varying float vAlpha;varying float vEnergy;varying float vNear;varying vec2 vDirection;varying float vAspect;varying float vCrisp;varying float vHeadShift;varying float vSeed;
void main(){if(vAlpha<.001)discard;vec2 uv=(gl_PointCoord-.5)*2.;uv.y=-uv.y;vec2 side=vec2(-vDirection.y,vDirection.x),axis=vec2(dot(uv,vDirection),dot(uv,side));float core,body,alpha;
if(vCrisp>.5){vec2 head=(axis-vec2(vHeadShift,0.))*vAspect;float radius=length(head)*(1.+.08*sin(atan(head.y,head.x)*5.+vSeed*6.283));float headBody=1.-smoothstep(.42,.48,radius);float along=clamp((axis.x+1.)/(1.+vHeadShift),0.,1.);float tailWidth=.025+.095*along;float tail=(1.-smoothstep(tailWidth,tailWidth+.035,abs(axis.y)*vAspect))*along*along*step(axis.x,vHeadShift)*step(-1.,axis.x)*smoothstep(.01,.06,vHeadShift);body=max(headBody,tail*.26);core=1.-smoothstep(.035,.085,radius);alpha=body*vAlpha;}
else{vec2 p=vec2(axis.x,axis.y*vAspect);float r2=dot(p,p);if(r2>1.)discard;core=exp(-r2*27.);body=exp(-r2*5.7);alpha=(core*.45+body*.70)*vAlpha;}
if(body<.001)discard;
if(emissionPass>.5){gl_FragColor=vec4(mix(vColor,vec3(.025,.80,1.),.65)*vEnergy*(vCrisp>.5?(core*.20+body*.12):core)*vAlpha,1.);return;}
float grainLight=vCrisp>.5?(.82+.18*clamp(.5+(axis.x-vHeadShift)*vAspect-axis.y*vAspect,0.,1.)):1.;vec3 color=mix(vColor*grainLight,vec3(.86,.99,1.),core*(darkMode>.5?.55:(vCrisp>.5?.12:(.05+vNear*.22))));gl_FragColor=vec4(color,min(.96,alpha));
#include <colorspace_fragment>
}
`;
export const brandVertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
export const brandFragment=common+`
uniform sampler2D brand;uniform float time;uniform float emissionPass;uniform float darkMode;varying vec2 vUv;
void main(){if(emissionPass>.5)discard;vec4 c=texture2D(brand,vUv);if(c.a<.001)discard;
vec2 pixel=vec2(vUv.x*1920.-960.,vUv.y*1080.-540.);float y=1080.-vUv.y*1080.;float group=y<550.?0.:(y<710.?1.:2.);
float opacity=solidFor(group,time)*(1.-smoothstep(releaseAt(pixel)-.025,releaseAt(pixel)+.10,time));
gl_FragColor=vec4(c.rgb,c.a*opacity);
#include <colorspace_fragment>
}
`;
