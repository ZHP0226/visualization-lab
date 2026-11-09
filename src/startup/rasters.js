// Exact v13 layout and type metrics; dark mode changes text ink only.
export async function createStartupRasters(dark=false) {
  const W=1920,H=1080,image=new Image();image.src='./branding/visualization-lab-mark-v1.svg';
  await Promise.all([image.decode(),document.fonts.load('900 104px "Noto Sans SC"'),document.fonts.load('900 48px "Noto Sans SC"')]);
  const rasters=Array.from({length:3},()=>{const c=document.createElement('canvas');c.width=W;c.height=H;return c;});
  rasters[0].getContext('2d').drawImage(image,675,190,570,350.14);
  for(const [index,style] of [[1,{text:'可视化实验室',size:104,spacing:14,y:675,color:dark?'#e4efff':'#182b3c'}],[2,{text:'所见即所得',size:48,spacing:17,y:770,color:dark?'#a9ddec':'#506472'}]]) {
    const context=rasters[index].getContext('2d');context.font=`900 ${style.size}px "Noto Sans SC"`;context.textBaseline='alphabetic';context.fillStyle=style.color;
    const widths=[...style.text].map(char=>context.measureText(char).width);let x=(W-widths.reduce((a,b)=>a+b,0)-style.spacing*(widths.length-1))/2;
    [...style.text].forEach((char,i)=>{context.fillText(char,x,style.y);x+=widths[i]+style.spacing;});
  }
  return rasters;
}
