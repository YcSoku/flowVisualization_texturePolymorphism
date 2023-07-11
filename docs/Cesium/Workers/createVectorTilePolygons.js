define(["./AttributeCompression-48e336db","./Matrix3-81054f0f","./Color-7d827393","./defaultValue-f6d5e6da","./IndexDatatype-d3db4e7d","./Math-2ce22ee9","./OrientedBoundingBox-cfd17917","./Matrix2-413c4048","./createTaskProcessorWorker","./ComponentDatatype-ab629b88","./WebGLConstants-7f557f93","./Transforms-fce95115","./combine-0c102d93","./RuntimeError-9b4ce3fb","./EllipsoidTangentPlane-82f2a887","./AxisAlignedBoundingBox-39ab50d0","./IntersectionTests-357c3d7f","./Plane-6add0ae1"],(function(e,t,n,a,r,o,i,s,c,f,d,l,u,h,g,p,y,m){"use strict";const b=new t.Cartesian3,x=new t.Ellipsoid,C=new s.Rectangle,I={min:void 0,max:void 0,indexBytesPerElement:void 0};function w(e,t,a){const r=t.length,o=2+r*i.OrientedBoundingBox.packedLength+1+function(e){const t=e.length;let a=0;for(let r=0;r<t;++r)a+=n.Color.packedLength+3+e[r].batchIds.length;return a}(a),s=new Float64Array(o);let c=0;s[c++]=e,s[c++]=r;for(let e=0;e<r;++e)i.OrientedBoundingBox.pack(t[e],s,c),c+=i.OrientedBoundingBox.packedLength;const f=a.length;s[c++]=f;for(let e=0;e<f;++e){const t=a[e];n.Color.pack(t.color,s,c),c+=n.Color.packedLength,s[c++]=t.offset,s[c++]=t.count;const r=t.batchIds,o=r.length;s[c++]=o;for(let e=0;e<o;++e)s[c++]=r[e]}return s}const A=32767,E=new t.Cartesian3,N=new t.Cartesian3,T=new t.Cartesian3,B=new t.Cartesian3,k=new t.Cartesian3,L=new t.Cartographic,O=new s.Rectangle;return c((function(c,f){let d;!function(e){const n=new Float64Array(e);let a=0;I.indexBytesPerElement=n[a++],I.min=n[a++],I.max=n[a++],t.Cartesian3.unpack(n,a,b),a+=t.Cartesian3.packedLength,t.Ellipsoid.unpack(n,a,x),a+=t.Ellipsoid.packedLength,s.Rectangle.unpack(n,a,C)}(c.packedBuffer),d=2===I.indexBytesPerElement?new Uint16Array(c.indices):new Uint32Array(c.indices);const l=new Uint16Array(c.positions),u=new Uint32Array(c.counts),h=new Uint32Array(c.indexCounts),g=new Uint32Array(c.batchIds),p=new Uint32Array(c.batchTableColors),y=new Array(u.length),m=b,U=x;let P=C;const F=I.min,M=I.max;let S,D,R,_=c.minimumHeights,G=c.maximumHeights;a.defined(_)&&a.defined(G)&&(_=new Float32Array(_),G=new Float32Array(G));const V=l.length/2,Y=l.subarray(0,V),v=l.subarray(V,2*V);e.AttributeCompression.zigZagDeltaDecode(Y,v);const H=new Float64Array(3*V);for(S=0;S<V;++S){const e=Y[S],n=v[S],a=o.CesiumMath.lerp(P.west,P.east,e/A),r=o.CesiumMath.lerp(P.south,P.north,n/A),i=t.Cartographic.fromRadians(a,r,0,L),s=U.cartographicToCartesian(i,E);t.Cartesian3.pack(s,H,3*S)}const W=u.length,z=new Array(W),K=new Array(W);let Z=0,j=0;for(S=0;S<W;++S)z[S]=Z,K[S]=j,Z+=u[S],j+=h[S];const q=new Float32Array(3*V*2),J=new Uint16Array(2*V),Q=new Uint32Array(K.length),X=new Uint32Array(h.length);let $=[];const ee={};for(S=0;S<W;++S)R=p[S],a.defined(ee[R])?(ee[R].positionLength+=u[S],ee[R].indexLength+=h[S],ee[R].batchIds.push(S)):ee[R]={positionLength:u[S],indexLength:h[S],offset:0,indexOffset:0,batchIds:[S]};let te,ne=0,ae=0;for(R in ee)if(ee.hasOwnProperty(R)){te=ee[R],te.offset=ne,te.indexOffset=ae;const e=2*te.positionLength,t=2*te.indexLength+6*te.positionLength;ne+=e,ae+=t,te.indexLength=t}const re=[];for(R in ee)ee.hasOwnProperty(R)&&(te=ee[R],re.push({color:n.Color.fromRgba(parseInt(R)),offset:te.indexOffset,count:te.indexLength,batchIds:te.batchIds}));for(S=0;S<W;++S){R=p[S],te=ee[R];const e=te.offset;let n=3*e,r=e;const o=z[S],s=u[S],c=g[S];let f=F,l=M;a.defined(_)&&a.defined(G)&&(f=_[S],l=G[S]);let b=Number.POSITIVE_INFINITY,x=Number.NEGATIVE_INFINITY,C=Number.POSITIVE_INFINITY,I=Number.NEGATIVE_INFINITY;for(D=0;D<s;++D){const e=t.Cartesian3.unpack(H,3*o+3*D,E);U.scaleToGeodeticSurface(e,e);const a=U.cartesianToCartographic(e,L),i=a.latitude,s=a.longitude;b=Math.min(i,b),x=Math.max(i,x),C=Math.min(s,C),I=Math.max(s,I);const d=U.geodeticSurfaceNormal(e,N);let u=t.Cartesian3.multiplyByScalar(d,f,T);const h=t.Cartesian3.add(e,u,B);u=t.Cartesian3.multiplyByScalar(d,l,u);const g=t.Cartesian3.add(e,u,k);t.Cartesian3.subtract(g,m,g),t.Cartesian3.subtract(h,m,h),t.Cartesian3.pack(g,q,n),t.Cartesian3.pack(h,q,n+3),J[r]=c,J[r+1]=c,n+=6,r+=2}P=O,P.west=C,P.east=I,P.south=b,P.north=x,y[S]=i.OrientedBoundingBox.fromRectangle(P,F,M,U);let w=te.indexOffset;const A=K[S],V=h[S];for(Q[S]=w,D=0;D<V;D+=3){const t=d[A+D]-o,n=d[A+D+1]-o,a=d[A+D+2]-o;$[w++]=2*t+e,$[w++]=2*n+e,$[w++]=2*a+e,$[w++]=2*a+1+e,$[w++]=2*n+1+e,$[w++]=2*t+1+e}for(D=0;D<s;++D){const t=D,n=(D+1)%s;$[w++]=2*t+1+e,$[w++]=2*n+e,$[w++]=2*t+e,$[w++]=2*t+1+e,$[w++]=2*n+1+e,$[w++]=2*n+e}te.offset+=2*s,te.indexOffset=w,X[S]=w-Q[S]}$=r.IndexDatatype.createTypedArray(q.length/3,$);const oe=re.length;for(let e=0;e<oe;++e){const t=re[e].batchIds;let n=0;const a=t.length;for(let e=0;e<a;++e)n+=X[t[e]];re[e].count=n}const ie=w(2===$.BYTES_PER_ELEMENT?r.IndexDatatype.UNSIGNED_SHORT:r.IndexDatatype.UNSIGNED_INT,y,re);return f.push(q.buffer,$.buffer,Q.buffer,X.buffer,J.buffer,ie.buffer),{positions:q.buffer,indices:$.buffer,indexOffsets:Q.buffer,indexCounts:X.buffer,batchIds:J.buffer,packedBuffer:ie.buffer}}))}));
