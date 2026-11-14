import { effect, glyph, distance, angle, strength, count, seed, tint, limit, ease, arc, sin, cos, rnd } from './lyricMotion.ts';

function polygon(points: [number, number][]) {
  return `polygon(${points.map(([x, y]) => `${x}% ${y}%`).join(', ')})`;
}

export const transitionTemplates = [
  effect(0, 'radial-sector-in', '時計の針で開く', [], p => {
    const turn = ease(p);
    const points: [number, number][] = [[50, 50], [50, -30]];
    for (let step = 1; step < turn * 24; step++) points.push([50 + 80 * sin(step / 24), 50 - 80 * cos(step / 24)]);
    points.push([50 + 80 * sin(turn), 50 - 80 * cos(turn)]);
    return { reveal: p >= 1 ? undefined : polygon(points) };
  }),
  effect(0, 'cross-grow-in', '十字の窓が開く', [strength], (p,k) => {
    const x = 50 * ease(p), y = 50 * (ease(p) ** (1 + k.s));
    return { reveal: polygon([[50-x,0],[50+x,0],[50+x,50-y],[100,50-y],[100,50+y],[50+x,50+y],
      [50+x,100],[50-x,100],[50-x,50+y],[0,50+y],[0,50-y],[50-x,50-y]]) };
  }),
  effect(0, 'jagged-window', 'ぎざぎざの窓から登場', [count, strength], (p,k) => {
    const edge = 125 * ease(p) - 25;
    const points: [number,number][] = [[0,0]];
    for (let i=0;i<=2*k.n;i++) points.push([edge + (i%2 ? -1 : 1)*25*k.s*(1-p),50*i/k.n]);
    points.push([0,100]);
    return { reveal:polygon(points) };
  }),
  effect(0, 'star-window-in', '星形の窓が開く', [], p => {
    const r = 196 * ease(p);
    return { reveal:polygon(Array.from({length:10},(_,i)=>{
      const radius=r*(i%2 ? .48 : 1);
      return [50+radius*sin(i/10),50-radius*cos(i/10)];
    })) };
  }),
  effect(0, 'capsule-close', 'カプセル状に閉じる', [strength], (p,k) => ({
    reveal:`inset(${50*ease(p)}% ${50*p*p}% round ${80*k.s*p}%)`,scaleX:1+.4*arc(p),
  }), 'exit'),
  effect(0, 'torn-paper-exit', 'ちぎれた紙がめくれる', [count,angle], (p,k) => {
    const points: [number,number][] = [[0,0],[100,0]];
    const edge=100*(1-ease(p));
    for(let i=Math.floor(2*k.n);i>=0;i--) points.push([50*i/k.n,edge*(1-(i%2)*arc(p)*.55)]);
    return {reveal:polygon(points),tiltX:k.a*ease(p)};
  }, 'exit'),
  effect(0, 'counterweight-entry', '重りで持ち上がって登場', [distance,angle], (p,k) => ({
    y:k.d*(1-ease(p*1.43)),tiltX:k.a*sin(p)*(1-p),scaleX:1-.43*arc(p)**5,opacity:ease(p*2),
  })),
  effect(0, 'lens-unfold', 'レンズ越しに開く', [strength], (p,k) => ({
    reveal:`ellipse(${78*ease(p)}% ${96*ease(p**2)}% at 50% 50%)`,scale:.8+.2*p+k.s*.34*arc(p),
  })),
  effect(1, 'clover-path', '四つ葉の軌道', [distance], (p,k) => ({x:k.d*sin(p)*sin(2*p),y:k.d*cos(p)*sin(2*p)})),
  effect(1, 'wave-crawl', '尺取り虫のように進む', [distance,count], (p,k) => {
    const t=p*k.n; const crawl=arc(t%1);
    return {x:k.d*(Math.floor(t)+ease(t%1))/k.n,scaleX:1+.63*crawl,scaleY:1-.4*crawl};
  }),
  effect(1, 'ramp-launch', '斜面から空中へ', [distance,angle], (p,k) => ({
    x:k.d*p*.9,y:-k.d*(p<.4 ? p*.8 : .32+.62*arc((p-.4)/.6)),rotation:-k.a*arc(limit(p/.8)),
  })),
  effect(1, 'searchlight-arc', '光を探すように往復', [distance,angle], (p,k) => ({
    x:k.d*sin(p)*arc(p), y:-k.d*.3*sin(p)**2,tiltY:k.a*sin(p),skew:30*sin(p)*arc(p)**2,
  })),
  effect(1, 'inertia-eddy', '慣性で渦を巻いて止まる', [distance,strength], (p,k) => ({
    x:k.d*(ease(2*p)+.45*k.s*sin(2*p)*arc(p)),y:k.d*.5*(cos(2*p)-1)*arc(p),rotation:35*sin(2*p)*arc(p)**2,
  })),
  effect(2, 'surface-peek', '面を倒してのぞく', [angle,distance], (p,k) => ({
    tiltX:k.a*ease((p-.2)*3)*(1-ease((p-.72)*4)), y:-k.d*.33*arc(p)**4, scale:1+.3*arc(p)**6,
  })),
  effect(2, 'flipping-tile', 'タイルが面を替える', [angle,count], (p,k) => {
    const t=p*k.n;const step=Math.floor(t); const flip=180*ease(t%1);
    return {tiltX:step%2 ? flip : 0,tiltY:step%2 ? 0 : flip, rotation:k.a*step/k.n};
  }),
  effect(2, 'screw-in', 'ねじを回して締める', [angle,count], (p,k) => ({
    rotation:k.a*k.n*p, tiltX:k.a*.7*cos(p*k.n)*(1-p), scale:1+.45*(1-p)**2,
  })),
  effect(2, 'swing-zoom', '振ってから奥へ戻る', [distance,angle], (p,k) => ({
    x:k.d*.55*sin(p),tiltY:k.a*sin(p)*arc(p),scale:1-.45*ease((p-.42)/.58),
  })),
  effect(3, 'bounce-switchback', '跳ねながら折り返す', [distance,count], (p,k) => ({
    x:k.d*(1-2*Math.abs(p-.5)),y:-k.d*.6*arc(p*k.n%1)*(1-p)**2,rotation:37*sin(p)*arc(p*k.n%1),
  })),
  effect(3, 'spring-latch', 'ばねが引っ掛かって戻る', [distance,count], (p,k) => ({
    y:-k.d*arc(limit(p*2)) + k.d*.5*(1-p)*arc(limit(p*2-1))*sin(p*k.n),
    scaleY:1-.4*arc(p)**9,
  })),
  effect(3, 'stagger-bumps', '段差で二度はねる', [distance,strength], (p,k) => ({
    x:k.d*p,y:-k.d*k.s*(arc(limit(p/.33))+.66*arc(limit((p-.43)/.57))),rotation:28*arc(limit((p-.43)/.57)),
  })),
  glyph('letter-pendulum', '文字が交互に振り子になる', [distance,angle], (p,i,_,k) => {
    const w=sin(p+i/2)*arc(p);
    return {rotation:k.a*w,x:k.d*w*.52,y:k.d*w*w*.36};
  }, {stagger:false}),
  glyph('letter-rolling-wave', '文字が転がる波', [distance,count], (p,i,_,k) => ({
    rotation:360*ease(p),y:-k.d*arc(p)*Math.abs(sin(p*k.n)),x:k.d*.4*arc(p)*(i%2?1:-1),
  })),
  glyph('letter-drop-stretch', '文字が引き伸ばされて着地', [distance,strength], (p,_i,_,k) => ({
    y:-k.d*(1-p)**2,scaleY:1+k.s*arc(p)*sin(p),scaleX:1-.5*k.s*arc(p)*sin(p),
  }), {role:'entrance'}),
  glyph('letter-color-echo', '文字色を順番に残す', [tint,strength], (p,_i,_,k) => ({
    tint:{target:k.color,weight:k.s*ease(p)},glow:{color:k.color,radius:48*k.s*arc(p)**4},y:-30*arc(p)**4,
  })),
  glyph('letter-opacity-ripple', '文字を透過の波が通る', [strength,count], (p,i,_,k) => ({
    opacity:1-k.s*arc(p)*(.5+.5*sin(p*k.n+i/7)),scaleY:1-.23*arc(p)*cos(p*k.n+i/7),
  }), {stagger:false}),
  glyph('letter-beam-in', '文字が光線のように立ち上がる', [tint,strength], (p,_i,_,k) => ({
    scaleY:1+1.5*k.s*(1-p)**3, scaleX:ease(p*2.5), glow:{color:k.color,radius:64*k.s*arc(p)**2},
  }), {role:'entrance'}),
  glyph('letter-corkscrew', '文字を回転させて絞る', [angle,strength], (p,i,_,k) => ({
    rotation:k.a*2*sin(p)*(i%2?1:-1),scaleY:1-.76*k.s*arc(p)**6,x:25*sin(2*p)*arc(p),
  })),
  glyph('letter-safety-pin', '文字が外れて戻る', [distance,angle], (p,i,_,k) => ({
    x:k.d*arc(p)*sin(p+i/2),y:k.d*arc(p)**2,rotation:k.a*arc(p)*(i%2?1:-1),opacity:1-.5*arc(p)**7,
  })),
  glyph('letter-shutters', '文字ごとのシャッター', [strength,count], (p,i,_,k) => ({
    scaleY:1-.95*k.s*arc(p)*Math.max(0,cos(p*k.n+i/4))**4,y:35*arc(p)*sin(p*k.n+i/4),
  }), {stagger:false}),
  glyph('letter-rolling-fold', '文字の波が折り返す', [distance,strength], (p,i,_,k) => ({
    y:k.d*sin(p+i/10)*arc(p)**3,scaleX:1-.8*k.s*arc(p)*Math.max(0,sin(p+i/10))**4,
  }), {stagger:false}),
  glyph('letter-lens', '文字列をレンズが横切る', [strength,tint], (p,_i,_,k) => ({
    scaleX:1+.8*k.s*arc(p)**7,scaleY:1+.35*k.s*arc(p)**3,tint:{target:k.color,weight:.5*k.s*arc(p)**7},
  })),
  glyph('letter-shrink-away', '文字が縮んで軌道から外れる', [distance,seed], (p,i,_,k) => ({
    scale:1-ease(p),x:k.d*(rnd(i,k.seed)-.5)*p*p,y:-k.d*p**4,rotation:120*p*p*(rnd(i,k.seed+1)-.5),
  }), {role:'exit'}),
  glyph('letter-swish', '文字がしなって立ち直る', [angle,distance], (p,i,_,k) => ({
    rotation:k.a*(Math.sin(Math.PI*p)**3)*cos(p+i/2), y:k.d*.3*arc(p)**4,scaleX:1-.39*arc(p)**3,
  })),
  effect(5, 'heat-ramp', '熱で色が段階的に変わる', [strength], (p,k) => {
    const ramp=['#4852cd','#c93090','#ff6348','#ffe585'];
    return {color:{target:ramp[Math.min(3,Math.floor(p*4))],weight:k.s*ease(p*3)},glow:70*k.s*p**3};
  }),
  effect(5, 'color-phosphor', '蛍光色が焼き付いて戻る', [tint,strength], (p,k) => ({
    color:{target:k.color,weight:k.s*ease(p*7)*(1-p)**2},filters:[{kind:'saturate',value:1+1.3*k.s*arc(p)**4}],
  })),
  effect(5, 'luminance-sweep', '明暗の階調を通過', [strength], (p,k) => ({
    filters:[{kind:'contrast',value:1+k.s*arc(p)**5},{kind:'brightness',value:1+.63*k.s*sin(p)*arc(p)},{kind:'grayscale',value:k.s*p*p}],
  })),
  effect(5, 'negative-pulse', '色反転から瞬時に戻る', [strength], (p,k) => ({
    filters:[{kind:'invert',value:k.s*arc(p)**9},{kind:'contrast',value:1+2*k.s*arc(p)**8}],
  })),
  effect(5, 'spectral-blend', '三色が滑らかに移り変わる', [strength], (p,k) => {
    const channels=[0,1/3,2/3].map(phase=>Math.round(144+108*cos(p+phase)).toString(16).padStart(2,'0'));
    return {color:{target:'#'+channels.join(''),weight:k.s*arc(p)},filters:[{kind:'brightness',value:1+.24*arc(p)*sin(p)}]};
  }),
  effect(6, 'interlace-slip', '走査が縦に滑る', [distance,count], (p,k) => ({
    y:k.d*.33*Math.round(4*sin(p*k.n))*arc(p)/4,lines:{spacing:14,offset:115*p,color:'#8ee3ff',opacity:.65*arc(p)},scaleY:1-.34*arc(p)**6,
  })),
  effect(6, 'chroma-dropout', '色信号が欠落する', [strength,seed], (p,k) => {
    const loss=k.s*arc(p)*Number(rnd(Math.floor(p*19),k.seed)>.44);
    return {opacity:1-.4*loss,filters:[{kind:'saturate',value:1-loss},{kind:'contrast',value:1+loss}],skew:26*loss};
  }),
  effect(6, 'long-exposure', '長時間露光の尾', [distance,strength,tint], (p,k) => ({
    x:k.d*.7*ease(p),y:-k.d*.35*sin(p),rotation:36*arc(p),trail:{count:6,interval:.09,opacity:k.s,color:k.color},
  })),
  effect(6, 'projector-blink', '映写機の明滅と送り', [distance,count], (p,k) => ({
    y:k.d*.33*arc(p)*Number(cos(p*k.n)>.85),opacity:1-.88*arc(p)*Number(sin(p*k.n)>.57),
    filters:[{kind:'sepia',value:.42*arc(p)}],
  })),
  effect(6, 'broken-sync', '縦同期が乱れて戻る', [distance,count,seed], (p,k) => {
    const drop=arc(p)*rnd(Math.floor(p*k.n*7),k.seed)**5;
    return {y:-k.d*drop,slice:40*drop,rgb:22*drop,scaleY:1+.65*drop};
  }),
  effect(6, 'backlight-lift', '逆光に浮かぶ', [strength,tint], (p,k) => ({
    filters:[{kind:'shadow',x:0,y:-35*arc(p),blur:45*k.s*arc(p),color:k.color+'b0'},{kind:'brightness',value:1-.8*k.s*arc(p)**2}],
  })),
  effect(6, 'shutter-smear', 'シャッターで残像が流れる', [distance,strength], (p,k) => ({
    rotation:80*ease(p), x:k.d*arc(p)*sin(p),trail:{count:4,interval:.065,opacity:k.s*arc(p)},
    filters:[{kind:'directional',x:k.d*.45*arc(p)**6,y:-k.d*.3*arc(p)**6,strength:k.s}],
  })),
  effect(7, 'perspective-crease', '折り目で遠近がずれる', [angle,strength], (p,k) => ({
    tiltY:k.a*arc(p),skew:-k.a*.48*arc(p)**2,scaleY:1+k.s*.38*sin(2*p)*arc(p),
  })),
  effect(7, 'sine-squeeze', '細長くなってねじれる', [angle,strength], (p,k) => ({
    scaleX:1-.79*k.s*arc(p)**4,scaleY:1+1.4*k.s*arc(p)**5,tiltX:k.a*sin(p),rotation:35*arc(p)**9,
  })),
  effect(7, 'hinged-corners', '四隅が交互に折れる', [strength,count], (p,k) => {
    const q=45*k.s*arc(p)*Math.max(0,sin(p*k.n)), r=45*k.s*arc(p)*Math.max(0,-sin(p*k.n));
    return {reveal:polygon([[q,0],[100-r,0],[100,r],[100,100-q],[100-q,100],[r,100],[0,100-r],[0,q]])};
  }),
  effect(7, 'concertina', '蛇腹が二方向にたわむ', [angle,strength,count], (p,k) => ({
    tiltX:k.a*.43*arc(p)*sin(p*k.n),scaleX:1-.58*k.s*arc(p)*cos(p*k.n)**4,
    scaleY:1-.45*k.s*arc(p)*sin(p*k.n)**4,skew:k.a*.47*sin(p)*arc(p),
  })),
];
