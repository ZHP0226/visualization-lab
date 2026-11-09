// Edge-only backdrop refraction. UI text is never part of the displaced image.
export function setupLiquidGlass() {
  if (!CSS.supports('backdrop-filter', 'url("#glass")')) return;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none';
  const defs = document.createElementNS(ns, 'defs');
  svg.append(defs); document.body.append(svg);
  const selector = '.viewport-toolbar,.presentation-switch,.creation-popover,.edit-notes-list,.project-dialog,.point-edit-dialog,.sidebar-menu';
  const initialized = new WeakSet(); let serial = 0;
  const node = (name, attributes) => {
    const element = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  };
  function attach(element) {
    if (initialized.has(element)) return;
    initialized.add(element); element.classList.add('refractive-surface');
    const id = `vl-glass-${++serial}`;
    const filter = node('filter', {id, x:'0', y:'0', filterUnits:'userSpaceOnUse', primitiveUnits:'userSpaceOnUse', 'color-interpolation-filters':'sRGB'});
    const image = node('feImage', {x:'0', y:'0', preserveAspectRatio:'none', result:'lens-map'});
    const neutral = node('feComponentTransfer', {in:'lens-map', result:'lens-normal'});
    // 128/255 is the neutral byte value. Centre it exactly on 0.5 for displacement.
    for (const channel of ['R', 'G']) neutral.append(node(`feFunc${channel}`, {type:'linear', slope:'1', intercept:String(-.5/255)}));
    filter.append(image, neutral,
      node('feDisplacementMap', {in:'SourceGraphic', in2:'lens-normal', scale:'20', xChannelSelector:'R', yChannelSelector:'G', result:'refracted'}),
      node('feGaussianBlur', {in:'refracted', stdDeviation:'.35'}));
    defs.append(filter);
    let signature = '', timer;
    function update() {
      if (!element.isConnected) { observer.disconnect(); filter.remove(); return; }
      const rect = {width:element.offsetWidth,height:element.offsetHeight};
      if (rect.width < 2 || rect.height < 2) return;
      const radius = Math.min(parseFloat(getComputedStyle(element).borderTopLeftRadius) || 16, rect.width/2, rect.height/2);
      const next = `${Math.round(rect.width)}:${Math.round(rect.height)}:${radius}`;
      if (next === signature) return;
      signature = next;
      filter.setAttribute('width',rect.width); filter.setAttribute('height',rect.height);
      image.setAttribute('width',rect.width); image.setAttribute('height',rect.height);
      const ratio = Math.min(1, 640/Math.max(rect.width, rect.height));
      const width = Math.max(2, Math.round(rect.width*ratio)), height = Math.max(2, Math.round(rect.height*ratio));
      const corner = radius*ratio, band = Math.min(15, Math.min(rect.width, rect.height)*.24)*ratio;
      const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
      const context = canvas.getContext('2d'), pixels = context.createImageData(width,height);
      for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
        const px=x+.5-width/2, py=y+.5-height/2;
        const qx=Math.abs(px)-width/2+corner, qy=Math.abs(py)-height/2+corner;
        const ax=Math.max(qx,0), ay=Math.max(qy,0), length=Math.hypot(ax,ay);
        const distance=-(length+Math.min(Math.max(qx,qy),0)-corner);
        let nx=0, ny=0, bend=0;
        if (distance>=0 && distance<band) {
          if (length>0) {nx=ax/length*Math.sign(px);ny=ay/length*Math.sign(py);}
          else if (qx>qy) nx=Math.sign(px); else ny=Math.sign(py);
          bend=Math.sin(distance/band*Math.PI)*108;
        }
        const i=(y*width+x)*4;
        pixels.data[i]=Math.round(128+nx*bend); pixels.data[i+1]=Math.round(128+ny*bend);
        pixels.data[i+2]=128; pixels.data[i+3]=255;
      }
      context.putImageData(pixels,0,0); image.setAttribute('href',canvas.toDataURL());
      element.style.backdropFilter=`url("#${id}")`;
      element.dataset.glassRefraction=id;
    }
    const observer = new ResizeObserver(() => {clearTimeout(timer);timer=setTimeout(update,100);});
    observer.observe(element); update();
  }
  document.querySelectorAll(selector).forEach(attach);
  new MutationObserver(records => {
    for (const record of records) for (const added of record.addedNodes) if (added.nodeType===1) {
      if (added.matches(selector)) attach(added);
      added.querySelectorAll(selector).forEach(attach);
    }
  }).observe(document.body,{childList:true,subtree:true});
}
