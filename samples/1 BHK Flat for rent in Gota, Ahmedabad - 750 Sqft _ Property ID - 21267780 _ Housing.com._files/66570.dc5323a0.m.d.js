"use strict";(self.webpackChunkhousing_demand=self.webpackChunkhousing_demand||[]).push([[66570],{66570:(t,n,e)=>{e.d(n,{B1:()=>slideUpAnimation,IH:()=>delayRender,L9:()=>textEllipsis,ei:()=>shimmerHighlight,r$:()=>dots,zi:()=>multiLineEllipsis});var s=e(63502);var a={name:"1d0tddh",styles:"overflow:hidden;white-space:nowrap;text-overflow:ellipsis;"};const textEllipsis=()=>a,multiLineEllipsis=t=>(0,s.css)("overflow:hidden;-webkit-line-clamp:",t,";display:-webkit-box;-webkit-box-orient:vertical;"),i=s.keyframes`
  0% {
    content: ".  ";
  }
  50% {
    content: ".. ";
  }
  100% {
    content: "...";
  }
`,dots=()=>(0,s.css)("position:absolute;content:'...';animation:",i," 1s linear infinite;");const slideUpAnimation=function(){let t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:500,n=arguments.length>2&&void 0!==arguments[2]?arguments[2]:0;return(0,s.css)("animation:",(e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:20,s.keyframes`
  0% {
    opacity: 0;
    transform: translateY(${e}px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
`)," ",t,"ms ease-in-out ",n,"ms;");var e},delayRender=t=>(0,s.css)(t&&(t=>(0,s.css)("contain-intrinsic-size:",t,";"))(t),"");const o=s.keyframes`
  23% {
    transform: translateX(100%);
  }
  37% {
    transform: translateX(-100%);
  }
  47% {
    transform: translateX(-100%);
  }
  65% {
    transform: translateX(100%);
  }
`,shimmerHighlight=(t,n)=>(0,s.css)("&:",t,"{content:'';position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient( -70deg,transparent 30%,",n," 50%,transparent 70% );transform:translateX(100%);animation:",o," 2.92s infinite ease-in-out;}")}}]);