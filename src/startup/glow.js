import * as THREE from 'three';

// Independent linear HDR emission buffers; never blur the white background or the typography.
export class Glow {
 constructor(renderer,width,height,{dark=false}={}){
  this.renderer=renderer;
  this.dark=dark;
  const rt=(w,h)=>new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false});
  this.beauty=rt(width,height);this.emission=rt(width,height);
  this.small=rt(width/2,height/2);this.medium=rt(width/4,height/4);this.large=rt(width/8,height/8);
  this.scratch=[rt(width/2,height/2),rt(width/4,height/4),rt(width/8,height/8)];
  this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);this.scene=new THREE.Scene();
  const vertexShader='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  this.downsample=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{source:{value:null},texel:{value:new THREE.Vector2()}},vertexShader,fragmentShader:`varying vec2 vUv;uniform sampler2D source;uniform vec2 texel;void main(){gl_FragColor=(texture2D(source,vUv+texel*.5)+texture2D(source,vUv-texel*.5)+texture2D(source,vUv+vec2(texel.x,-texel.y)*.5)+texture2D(source,vUv+vec2(-texel.x,texel.y)*.5))*.25;}`});
  this.blur=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{source:{value:null},step:{value:new THREE.Vector2()}},vertexShader,fragmentShader:`
   varying vec2 vUv;uniform sampler2D source;uniform vec2 step;
   void main(){vec4 c=texture2D(source,vUv)*.227027;
    c+=(texture2D(source,vUv+step*1.384615)+texture2D(source,vUv-step*1.384615))*.316216;
    c+=(texture2D(source,vUv+step*3.230769)+texture2D(source,vUv-step*3.230769))*.070270;
    gl_FragColor=c;
   }`});
  this.compose=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,premultipliedAlpha:true,uniforms:{beauty:{value:this.beauty.texture},emission:{value:this.emission.texture},small:{value:this.small.texture},medium:{value:this.medium.texture},large:{value:this.large.texture},strength:{value:1},spread:{value:1},darkMode:{value:dark?1:0}},vertexShader,fragmentShader:`
   varying vec2 vUv;uniform sampler2D beauty;uniform sampler2D emission;uniform sampler2D small;uniform sampler2D medium;uniform sampler2D large;uniform float strength;uniform float spread;uniform float darkMode;
   void main(){
    vec4 b=texture2D(beauty,vUv);vec3 e=texture2D(emission,vUv).rgb;
    vec3 h=(texture2D(small,vUv).rgb*1.25+(texture2D(medium,vUv).rgb*1.35+texture2D(large,vUv).rgb*.85)*spread)*strength;
    if(darkMode>.5){
     vec3 radiance=e*strength*.85+h*1.5;
     gl_FragColor=vec4(b.rgb+vec3(1.)-exp(-radiance),1.);
     #include <colorspace_fragment>
     return;
    }
    float energy=max(e.r,max(e.g,e.b));float halo=max(h.r,max(h.g,h.b));
    float haloAlpha=1.-exp(-halo*.78);float coreAlpha=1.-exp(-energy*.72*strength);
    vec3 hue=mix(vec3(.002,.12,.95),vec3(.002,.84,1.),clamp(h.g/max(.001,h.b),0.,1.));
    // A saturated narrow carrier preserves bright-white light contrast on a white canvas.
    vec3 p=b.rgb+hue*haloAlpha*(1.-b.a);float alpha=b.a+haloAlpha*(1.-b.a);
    p=p*(1.-coreAlpha)+vec3(.91,.995,1.)*coreAlpha;alpha=alpha+coreAlpha*(1.-alpha);
    gl_FragColor=vec4(alpha>.00001?p/alpha:vec3(0.),alpha);
    #include <colorspace_fragment>
    gl_FragColor.rgb*=gl_FragColor.a;
   }`});
  this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.blur);this.quad.frustumCulled=false;this.scene.add(this.quad);
 }
 pass(source,target,dx,dy){
  this.blur.uniforms.source.value=source.texture;this.blur.uniforms.step.value.set(dx,dy);this.quad.material=this.blur;
  this.renderer.setRenderTarget(target);this.renderer.render(this.scene,this.camera);
 }
 dispose(){for(const target of [this.beauty,this.emission,this.small,this.medium,this.large,...this.scratch])target.dispose();this.blur.dispose();this.downsample.dispose();this.compose.dispose();this.quad.geometry.dispose();}
 render(scene,camera,material,strength,spread=1){
  const r=this.renderer;r.setRenderTarget(this.beauty);r.clear();material.uniforms.emissionPass.value=0;r.render(scene,camera);
  material.uniforms.emissionPass.value=1;material.blending=THREE.AdditiveBlending;
  r.setRenderTarget(this.emission);r.clear();r.render(scene,camera);
  material.uniforms.emissionPass.value=0;material.blending=THREE.NormalBlending;
  for(const [i,target] of [this.small,this.medium,this.large].entries()){
   const source=i===0?this.emission:i===1?this.small:this.medium,scale=i===0?1.15:i===1?2.3:3.5;
   if(this.dark){this.downsample.uniforms.source.value=source.texture;this.downsample.uniforms.texel.value.set(1/source.width,1/source.height);this.quad.material=this.downsample;r.setRenderTarget(target);r.render(this.scene,this.camera);}
   this.pass(this.dark?target:source,this.scratch[i],scale/target.width,0);
   this.pass(this.scratch[i],target,0,scale/target.height);
  }
  this.compose.uniforms.strength.value=strength;this.compose.uniforms.spread.value=spread;this.quad.material=this.compose;r.setRenderTarget(null);r.clear();r.render(this.scene,this.camera);
  return r.domElement;
 }
}
