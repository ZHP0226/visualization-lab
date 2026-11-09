import * as THREE from 'three';
import {Glow} from './glow.js';
import {particleVertex,particleFragment,brandVertex,brandFragment} from './shaders.js';
import {reverseLensPosition,TIMING} from './timing.js';
let seed=192309;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
const COUNTS=[480000,200000,100000],W=1920,H=1080;
export class BrandParticles{
 constructor(rasters,{dark=false}={}){
  this.dark=dark;
  this.count=COUNTS.reduce((a,b)=>a+b,0);this.focal=H/(2*Math.tan(21*Math.PI/180));
  this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:true});this.renderer.setSize(W,H,false);this.renderer.setPixelRatio(1);this.renderer.setClearColor(0,0);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.camera=new THREE.PerspectiveCamera(42,W/H,.1,100);this.camera.position.z=20;this.scene=new THREE.Scene();
  const positions=new Float32Array(this.count*3),colors=new Float32Array(this.count*3),random=new Float32Array(this.count*4),groups=new Float32Array(this.count),edges=new Float32Array(this.count);
  const lut=Float32Array.from({length:256},(_,i)=>i/255<=.04045?i/255/12.92:Math.pow((i/255+.055)/1.055,2.4));
  let index=0;seed=192309;
  for(let group=0;group<3;group++){
   const data=rasters[group].getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data,pool=[];
   for(let y=150;y<800;y++)for(let x=450;x<1470;x++){const k=(y*W+x)*4;if(data[k+3]>235)pool.push(k);}
   if(!pool.length)throw new Error('Empty particle target '+group);
   const edgeAt=k=>{let edge=0;for(const d of [-12,12,-W*12,W*12]){const p=k+d;edge=Math.max(edge,1-data[p+3]/255);if(data[p+3]>235)edge=Math.max(edge,(Math.abs(data[p]-data[k])+Math.abs(data[p+1]-data[k+1])+Math.abs(data[p+2]-data[k+2]))/700);}return edge;};
   for(let n=0;n<COUNTS[group];n++,index++){
    const k=pool[Math.floor(rand()*pool.length)],pixel=k/4,x=pixel%W,y=Math.floor(pixel/W),j=index*3,r=index*4;
    positions[j]=x-960+(rand()-.5);positions[j+1]=540-y+(rand()-.5);positions[j+2]=0;
    for(let c=0;c<3;c++)colors[j+c]=lut[data[k+c]];
    random[r]=rand();random[r+1]=rand();random[r+2]=rand();random[r+3]=rand();groups[index]=group;edges[index]=edgeAt(k);
   }
  }
  const geo=new THREE.BufferGeometry();for(const [name,a,size] of [['position',positions,3],['aColor',colors,3],['aRandom',random,4],['aGroup',groups,1],['aEdge',edges,1]])geo.setAttribute(name,new THREE.BufferAttribute(a,size));
  this.geometry=geo;
  this.uniforms={time:{value:0},focal:{value:this.focal},emissionPass:{value:0},darkMode:{value:dark?1:0}};
  this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,uniforms:this.uniforms,vertexShader:particleVertex,fragmentShader:particleFragment});
  const brandCanvas=document.createElement('canvas');brandCanvas.width=W;brandCanvas.height=H;const bc=brandCanvas.getContext('2d');for(const raster of rasters)bc.drawImage(raster,0,0);
  const texture=new THREE.CanvasTexture(brandCanvas);texture.colorSpace=THREE.SRGBColorSpace;
  this.brandMaterial=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,uniforms:{...this.uniforms,brand:{value:texture}},vertexShader:brandVertex,fragmentShader:brandFragment});
  const brandMesh=new THREE.Mesh(new THREE.PlaneGeometry(W*20/this.focal,H*20/this.focal),this.brandMaterial);brandMesh.renderOrder=0;this.scene.add(brandMesh);
  this.points=new THREE.Points(geo,this.material);this.points.frustumCulled=false;this.points.renderOrder=1;this.scene.add(this.points);this.glow=new Glow(this.renderer,W,H,{dark});
 }
 render(t){
  this.material.uniforms.time.value=t;
  // Once the last text has assembled, render beauty directly: no emission or bloom pass.
  if(this.dark&&t>=TIMING.mottoSolid[1]){this.renderer.setRenderTarget(null);this.renderer.clear();this.renderer.render(this.scene,this.camera);return this.renderer.domElement;}
  const q=Math.max(0,Math.min(1,(t-TIMING.mottoSolid[0])/(TIMING.mottoSolid[1]-TIMING.mottoSolid[0]))),fade=1-q*q*(3-2*q);
  return this.glow.render(this.scene,this.camera,this.material,this.dark?.9*fade:.95,this.dark?.5:(t<2.02?.06:1));
 }
 dispose(){this.geometry.dispose();this.material.dispose();this.brandMaterial.uniforms.brand.value.dispose();this.brandMaterial.dispose();this.scene.traverse(node=>{if(node.isMesh)node.geometry.dispose();});this.glow.dispose();this.renderer.dispose();this.renderer.forceContextLoss();}
 metricsAt(t){const p=this.geometry.attributes.position.array,r=this.geometry.attributes.aRandom.array;const samples=[];for(const i of [120,17003,80007,260009,479990]){const target=[p[i*3]*20/this.focal,p[i*3+1]*20/this.focal,0],random=Array.from(r.slice(i*4,i*4+4));samples.push({particle:i,...reverseLensPosition(target,random,t)});}return{total:this.count,logo:COUNTS[0],title:COUNTS[1],motto:COUNTS[2],samples,allParticlesRemoved:t>=6.75};}
 stats(){return{particleCount:this.count,logoParticles:COUNTS[0],titleParticles:COUNTS[1],mottoParticles:COUNTS[2],entrance:'world-space lens crossing: sharp large foreground grains with tapered motion trails, medium sparks, dense fine target grains; z25 through camera z20 to z0',logo:'original approved 2D SVG',type:'Noto Sans SC weight900, real particle assembly',exit:'2.05-second stochastic grain erosion; noise-warped asymmetric eddies with nonuniform phases, speed, drift and lifetime; no mirrored periodic geometry',pureWhiteHold:[6.75,7.00],homeReveal:[7.00,7.85],glow:'independent HDR emission and three-scale bloom',usesReferenceFlowerMedia:false};}
}
