"use strict";(self.webpackChunkhousing_demand=self.webpackChunkhousing_demand||[]).push([[24785],{13216:(e,r,t)=>{t.d(r,{ML:()=>fetchFeaturedLocalities,jM:()=>fetchTopLocalities});t(62234);var a=t(16411),i=t(59085);const n={popular:!0,affordable:!0,investment_hotspots:!0,great_lifestyle:!0},fetchFeaturedLocalities=e=>{let r=e.localityTypes,t=void 0===r?[]:r,o=e.service,l=e.poly,c=e.inventoryCountRequired,d=void 0!==c&&c,s=e.propertyTypeId,p=e.apartmentTypeIds;return(e,r)=>{let c=r(),y=c.filters,u=void 0===y?{}:y,v=u.selectedCity,T=void 0===v?{}:v,h=T.id,g=T.cityId,f=u.service,m=u.category,I=u.subCategory,P=c.seo,A=(void 0===P?{}:P).pageTypeMajor,b=c.shell.newRendering;const _=(0,i.A)(f,m,I),E=t.map(r=>n[r]&&e((0,a.b$)({featureType:r,cityUuid:l||h,service:o||f,inventoryCountRequired:d,propertyTypeId:s,apartmentTypeIds:p,...(b||"home"===A)&&["buy","rent"].includes(_)&&"popular"===r&&{fallback:{entityId:g,componentName:"top_localities",pageType:"home"}}})));return Promise.all(E).then(e=>e).catch(e=>{throw e})}},fetchTopLocalities=e=>{let r=e.localityTypes,t=void 0===r?[]:r,a=e.poly,i=e.service;return async e=>{if(i&&!["buy","rent","plots"].includes(i))return e({type:"UPDATE_META_DATA",payload:{featuredLocalities:[]}}),Promise.resolve();let r="plots"===i?"buy":i;try{const i=await e(fetchFeaturedLocalities({localityTypes:t,inventoryCountRequired:!0,poly:a,service:r}));e({type:"UPDATE_META_DATA",payload:{featuredLocalities:i.filter(e=>{let r=e.data,t=void 0===r?[]:r;return t?.length>0})}})}catch(e){console.error("Error fetching top localities:",e)}}}},13799:(e,r,t)=>{t.d(r,{default:()=>P});var a=t(55973),i=t(19097),n=t(75641),o=t.n(n),l=t(28667),c=t(5961),d=t(61502),s=t(16411),p=t(47651),y=t(75114),u=t(78580),v=t(79641),T=t(49032),h=t(63261),g=t(74171),f=t(63004);t(1814);function _slicedToArray(e,r){return function _arrayWithHoles(e){if(Array.isArray(e))return e}(e)||function _iterableToArrayLimit(e,r){var t=null==e?null:"undefined"!=typeof Symbol&&e[Symbol.iterator]||e["@@iterator"];if(null!=t){var a,i,n,o,l=[],c=!0,d=!1;try{if(n=(t=t.call(e)).next,0===r){if(Object(t)!==t)return;c=!1}else for(;!(c=(a=n.call(t)).done)&&(l.push(a.value),l.length!==r);c=!0);}catch(e){d=!0,i=e}finally{try{if(!c&&null!=t.return&&(o=t.return(),Object(o)!==o))return}finally{if(d)throw i}}return l}}(e,r)||function _unsupportedIterableToArray(e,r){if(e){if("string"==typeof e)return _arrayLikeToArray(e,r);var t={}.toString.call(e).slice(8,-1);return"Object"===t&&e.constructor&&(t=e.constructor.name),"Map"===t||"Set"===t?Array.from(e):"Arguments"===t||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t)?_arrayLikeToArray(e,r):void 0}}(e,r)||function _nonIterableRest(){throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}()}function _arrayLikeToArray(e,r){(null==r||r>e.length)&&(r=e.length);for(var t=0,a=Array(r);t<r;t++)a[t]=e[t];return a}const m=(0,u.A)(()=>Promise.all([t.e(48069),t.e(14942),t.e(10472),t.e(53556),t.e(10278),t.e(89433),t.e(56139),t.e(83899),t.e(48555),t.e(74746),t.e(80461)]).then(t.bind(t,95351)),{type:"local",container:"housing.demand",module:"common/components/PriceTrensNew"}),I=((0,u.A)(()=>Promise.resolve().then(t.bind(t,30134)),{type:"local",container:"housing.demand",module:"common/components/ShortList/rewrite"}),(0,u.A)(()=>t.e(50572).then(t.bind(t,28785)),{type:"local",container:"housing.demand",module:"common/components/PriceTrensNew/NoPriceTrends"}));(0,u.A)(()=>t.e(28953).then(t.bind(t,45245)),{type:"local",container:"housing.demand",module:"common/components/PriceTrensNew/ShareButton"});const P=(0,l.A)({props:e=>{let r=e.filters,t=void 0===r?{}:r,a=t.service,i=t.entities,n=t.selectedCity,o=(void 0===n?{}:n).id,l=e.propertyDetails,c=e.seo,d=(void 0===c?{}:c).pageTypeMajor,s=e.meta,p=void 0===s?{}:s,y=p.selectedItemsModalPriceTrends,u=void 0===y?{}:y;return{propertyDetails:l,service:a,pageTypeMajor:d,entities:i,selectedCityId:o,selectedItems:u.data,lastUpdated:u.lastUpdated,localityTrendsData:p.localityTrendsData,priceTrendsData:p.priceTrendsData}},actions:{fetchPriceTrendsData:s.Ay,fetchLocalityPriceTrends:s.rW,emptySelectedItems:T.pQ}})(function PriceTrendsRentResale(e){let r=e.propertyDetails,t=e.ready,a=void 0===t?()=>{}:t,l=e.render,u=e.id,T=e.index,P=e.isSequenced,A=e.showFooter,b=e.markRendered,_=void 0===b?()=>{}:b,E=e.fetchPriceTrendsData,C=e.fetchLocalityPriceTrends,S=e.emptySelectedItems,D=e.service,w=void 0===D?"buy":D,L=e.entities,k=void 0===L?[]:L,R=e.selectedCityId,j=e.selectedItems,$=void 0===j?[]:j,O=e.lastUpdated,q=e.isRentPDP,U=e.localityTrendsData,Y=void 0===U?{}:U,G=e.priceTrendsData,N=void 0===G?{}:G,x=e.ssr,M=void 0!==x&&x,F=e.isLinkedProjectActive,W=void 0===F||F;const B=k[0]||{},J=B.id,z=B.name,H=r||{},K=(H.details,H.details),V=void 0===K?{}:K,X=V.title,Z=V.listingId,Q=V.coverImage,ee=(void 0===Q?{}:Q).src,re=V.propertyType,te=V.details,ae=void 0===te?{}:te,ie=ae.meta,ne=void 0===ie?{}:ie,oe=ne.linkedProjectId,le=ne.linkedProjectName,ce=ae.localityInfo,de=ae.config,se=(void 0===de?{}:de).propertyConfig,pe=void 0===se?[]:se,ye=V.meta,ue=(void 0===ye?{}:ye).polygon,ve=(void 0===ue?{}:ue).id,Te=pe?.[0]?.propertyTypeId,he=s.v1[w][Te]?.label||s.v1[w][1]?.label,ge=(0,p.A)(g.A),fe=(ce||{}).priceTrendsUrl,me=_slicedToArray((0,n.useState)(M?N:{}),2),Ie=me[0],Pe=me[1],Ae=_slicedToArray((0,n.useState)(M?Y:{}),2),be=Ae[0],_e=Ae[1],Ee=_slicedToArray((0,n.useState)(!1),2),Ce=(Ee[0],Ee[1],(0,n.useContext)(c.A).navItemsRef),Se=_slicedToArray((0,n.useState)({value:h.xj,clicked:!1}),2),De=Se[0],we=Se[1],Le=_slicedToArray((0,n.useState)(M),2),ke=Le[0],Re=Le[1],je={..."resale"===re?h.KS:h.nh},$e=_slicedToArray((0,n.useState)({nearLocality1:{},nearLocality2:{},nearLocality3:{}}),2),Oe=$e[0],qe=$e[1],Ue=Oe.nearLocality1,Ye=void 0===Ue?{}:Ue,Ge=Oe.nearLocality2,Ne=void 0===Ge?{}:Ge,xe=Oe.nearLocality3,Me=void 0===xe?{}:xe,Fe=_slicedToArray((0,n.useState)([]),2),We=Fe[0],Be=Fe[1],Je=$.length;if((0,n.useEffect)(()=>{if(M)return;S();const e=[E({listingId:oe||Z,service:w}),J&&C({poly:J,service:w})];Promise.all(e).then(e=>{let r=_slicedToArray(e,2),t=r[0],i=void 0===t?[]:t,n=r[1],o=(void 0===n?{}:n).priceTrends,l=void 0===o?{}:o;const c=i[0]||{};Pe(c),_e(l||{}),Re(!0),P&&a(T)})},[]),(0,n.useEffect)(()=>{P&&l&&_(T)},[l]),(0,n.useEffect)(()=>{["nearLocality1","nearLocality2","nearLocality3"].forEach((e,r)=>{const t=$[r]||{},a=t.name,i=t.priceTrend,n=t.priceTrend,o=void 0===n?{}:n,l=o.averagePrice,c=o.percentageGrowth,d=o.avgRate,s=void 0===d?{}:d;qe(r=>({...r,[e]:{name:a,avgRate:Object(s).hasOwnProperty("value")?s:{value:l},percentGrowth:parseFloat(c),...i}||{}}))})},[O]),!P&&!ke)return o().createElement(y.A,{height:"553px",allowPadding:!0});if(P&&!l&&A)return o().createElement(d.A,null);if(P&&!l)return null;const ze=(Ie||{}).trend,He=void 0===ze?[]:ze,Ke=!!be.localityTrend?.length,Ve=!!He.length&&W,Xe=!Ke&&!Ve,Ze=(Ve?Ie:be)||{},Qe=Ze.percentGrowth,er=(Ze.avgRate||{}).value,rr=oe?"trend":"localityTrend",tr=oe?"Project":"Locality",ar={project:{check:oe&&(Ve||Xe),data:Ie||{},strokeColor:"#E3AF64",title:le||X,trend:He,types:"Project"},locality:{check:(Ke||Xe)&&(0===Je||!Ve),data:{...be,trend:be.localityTrend,percentGrowth:be.percentageGrowth}||{},strokeColor:"#75C7F5",title:z,trend:be.localityTrend,types:"Locality"},nearLocality1:{check:!!Ye[rr]?.length&&Je>0,data:Ye,strokeColor:"#BE95FF",title:Ye.name,trend:Ye[rr],types:tr},nearLocality2:{check:!!Ne[rr]?.length&&Je>0,data:Ne,strokeColor:"#44DFDC",title:Ne.name,trend:Ne[rr],types:tr},nearLocality3:{check:!!Me[rr]?.length&&Je>0,data:Me,strokeColor:Ve?"#75C7F5":"#E3AF64",title:Me.name,trend:Me[rr],types:tr}},ir=h.kz.filter(e=>ar[e]?.check),nr="resale"===re?"buy":"rent";let or=[],lr=[],cr=[],dr=[];const getGraphRenderedData=e=>{let r=e.index,t=e.modifiedTrendsData;const a=(0,h.K3)({ptDetailsObj:ar[ir[r]],selectedYears:De.value,key:0==r?"price":`price${r}`,selectedService:nr});a.trend=t?.slice(-4*De.value)||a.trend,lr.push(a.title),or.push(a),dr=Xe?[]:t||ar[ir[r]]?.trend};Ie&&Ie.hasOwnProperty("trend"),!Xe&&ir.length>1&&(cr=(0,h.xY)(ir,ar)),cr.length>=1||Xe?ir.map((e,r)=>getGraphRenderedData({index:r,modifiedTrendsData:cr})):1!=ir.length&&0!=cr.length||getGraphRenderedData({index:0});const sr=`Price Trends for ${lr.join(" vs. ")}`,pr=(0,h.IX)({originalTrendData:dr}),yr=pr.DROPDOWN_OPTIONS,ur=pr.DROPDOWN_LABEL,vr=pr.SELECTED_YEARS;return o().createElement("section",{className:(0,i.cx)(v.IK,q&&v.pH),ref:Ce&&!!Ce&&Ce[T],id:u,"data-testid":"rentResalePTID"},o().createElement(f.A,{"data-testid":"waypoint",onEnter:()=>{Ve&&ge("PRICE_TRENDS_SEEN",{trackingDetails:je}),Ke&&ge("LOCALITY_PRICE_TRENDS_SEEN",{trackingDetails:je})}}),Xe?o().createElement(I,{priceTrendsUrl:fe,localityName:z,style:v.Z0,trackingDetails:je,renderedData:or,selectedService:nr}):o().createElement(m,{renderedData:or,priceTrendsUrl:fe,originalProjectListingId:Z,setSelectedYears:we,selectedYears:De.clicked?De.value:vr,projectTitle:le||X,localityName:z,heading:sr,dropDownText:ur,options:yr,style:Je>0?v.hC:v.Z0,trackingDetails:je,propertyDetails:r,apiCallFinished:ke,shareBtn:!1,saveBtn:!1,pageType:"rentResale",listingId:oe||ve,linkedProjectId:oe,poly:J,boundingBoxUuid:R,projectPolygonId:ve,selectedItems:$,preData:{id:Ve?oe||ve:J,avgRate:er,name:Ve?le||X:z,loaded:!0,service:w,percentageGrowth:Qe?Qe.toFixed(2):be?.percentageGrowth,image:ee},disabledIndex:We,setDisableIndex:Be,propertyTypeValue:he}))});(0,a.A)(v.pH)},16411:(e,r,t)=>{t.d(r,{Ay:()=>__WEBPACK_DEFAULT_EXPORT__,Ij:()=>fetchPriceTrends,RB:()=>localityPriceTrendsAction,b$:()=>fetchFeaturedLocalityPriceTrends,rW:()=>fetchLocalityPriceTrends,v1:()=>p,vd:()=>projectPriceTrendsAction});var a=t(99413),i=t(47307);const n=a.J`
  query(
    $projectIds: String!
    $service: String
    $apartmentTypeIds: String
    $propertyTypeId: String
  ) {
    projectTrends(
      projectIds: $projectIds
      service: $service
      apartmentTypeIds: $apartmentTypeIds
      propertyTypeId: $propertyTypeId
    ) {
      ...BS
    }
  }
  fragment BS on ProjectTrend {
    avgPrice
    percentGrowth
    numberOfYears
    listingId
    trend {
      q1
      q2
      q3
      q4
      year
      price
    }
    monthlyTrend {
      m1
      m2
      quarter
      year
    }
    projectPriceTrendForEachYear {
      percentGrowth1Yr
      percentGrowth3Yr
      percentGrowth5Yr
    }
  }
`,o=a.J`
  query(
    $localityUuid: String!
    $service: String
    $durationYears: Int
    $fetchChildTrends: Boolean
    $withChilds: Boolean!
    $apartmentTypeIds: String
    $propertyTypeId: String
  ) {
    localityPriceTrends(
      localityUuid: $localityUuid
      service: $service
      durationYears: $durationYears
      fetchChildTrends: $fetchChildTrends
      pageInfo: { page: 1, size: 99 }
      apartmentTypeIds: $apartmentTypeIds
      propertyTypeId: $propertyTypeId
    ) {
      name
      avgRate
      averagePrice
      minPrice
      maxPrice
      percentageGrowth
      priceTrendUrl
      numberOfYears
      trend
      localityTrend {
        q1
        q2
        q3
        q4
        year
        price
      }
      localityPriceTrendForEachYear {
        percentGrowth1Yr
        percentGrowth3Yr
        percentGrowth5Yr
      }
      childTrends @include(if: $withChilds) {
        childInfo {
          id
          name
        }
        minPrice
        maxPrice
        averagePrice
        priceTrendUrl
      }
      monthlyTrend {
        m1
        m2
        quarter
        year
      }
    }
  }
`,l=a.J`
  query(
    $featureType: String
    $cityUuid: String!
    $service: String
    $category: String
    $overviewUrlRequired: Boolean
    $inventoryCountRequired: Boolean
    $apartmentTypeIds: String
    $propertyTypeId: String
    $fallback: FallbackInput
  ) {
    featuredLocalityPriceTrends(
      featureType: $featureType
      cityUuid: $cityUuid
      service: $service
      category: $category
      overviewUrlRequired: $overviewUrlRequired
      inventoryCountRequired: $inventoryCountRequired
      apartmentTypeIds: $apartmentTypeIds
      propertyTypeId: $propertyTypeId
      fallback: $fallback
    ) {
      key
      label
      data {
        id
        name
        title
        price {
          displayValue
          value
          unit
        }
        type
        displayType
        subType
        growthRate
        insightsPresent
        url
        canonical
        mobileUrl
        overviewPageUrl
        priceTrends
        features {
          label
          description
        }
      }
    }
  }
`,fetcher=(e,r,t,a)=>e({apiName:r,cacheType:"stale",query:{query:t,variables:a}}).then(e=>{let r=e.data;return(void 0===r?{}:r).data}),c={0:3,1:6,2:9,3:12},d={1:0,2:3,3:6,4:9},s={1:{key:"1",label:"Apartments"},15:{key:"37",label:"Plot"}},p={buy:{...s,3:{key:"2",label:"Independent House"}},rent:{...s,2:{key:"2",label:"Independent House"}}},getApartmentId=e=>{let r=e.service,t=e.pageTypeMajor,a=e.propertyConfig;return"rent"===r?"details"===t&&a?.[0]?.key?String(a[0].key):"4":""},getPropertyTypeDetails=e=>{let r=e.pageTypeMajor,t=e.propertyConfig,a=e.service;const i=t?.[0]?.propertyTypeId;return"details"===r&&i?p[a][i]?.key||"1":"localityOverview"===r?"1":"1, 35, 2, 38"},getDateFormate=e=>{let r=e.year,t=e.quarter;return new Date(Date.UTC(r,t,1)).getTime()},getFormatedPriceTrend=(e,r)=>{let t=[],a=!1;if(e&&e.length>0&&e.forEach(e=>{let r=e.q1,a=e.q2,i=e.q3,n=e.q4,o=e.year;[r,a,i,n].forEach((e,r)=>{const a=getDateFormate({year:o,quarter:c[r]});e&&t.push({year:a,price:e})})}),r&&e.length>0){const e=r||{},i=e.m1,n=e.m2,o=e.quarter,l=e.year;if(i){const e=getDateFormate({year:l,quarter:d[o]+1});a=!0,t.push({year:e,price:i})}if(n){const e=getDateFormate({year:l,quarter:d[o]+2});a=!0,t.push({year:e,price:n})}}return{res:t,monthlyTrendAvailable:a}},localityPriceTrendsAction=e=>{let r=e.data,t=e.dispatch;const a=(r||{}).localityPriceTrends,i=a||{},n=i.localityTrend,o=i.monthlyTrend,l=getFormatedPriceTrend(n,o),c=l.res,d=l.monthlyTrendAvailable;return a.localityTrend=c,a.monthlyTrendAvailable=d,r.priceTrends=a,t({type:"UPDATE_META_DATA",payload:{localityTrendsData:a}}),r},fetchLocalityPriceTrends=e=>{let r=e.poly,t=e.service,a=e.noChilds,i=void 0===a||a,n=e.fetchChildTrends,l=void 0!==n&&n,c=e.durationYears,d=void 0===c?5:c,s=e.propertyTypeId,p=e.apartmentTypeIds;return(e,a,n)=>{let c=n.fetch;const y=a(),u=y.seo.pageTypeMajor,v=y.propertyDetails,T=(void 0===v?{}:v).details,h=(void 0===T?{}:T).details,g=(void 0===h?{}:h).config,f=(void 0===g?{}:g).propertyConfig,m=void 0===f?[]:f,I=s?String(s):getPropertyTypeDetails({pageTypeMajor:u,propertyConfig:m,service:t});return fetcher(c,"LOCALITY_PRICE_TREND",o,JSON.stringify({localityUuid:r,service:t,durationYears:d,fetchChildTrends:l,withChilds:!i,propertyTypeId:I,apartmentTypeIds:String(p||getApartmentId({service:t,pageTypeMajor:u,propertyConfig:m}))})).then(r=>localityPriceTrendsAction({data:r,dispatch:e})).catch(()=>{})}},fetchPriceTrends=e=>{let r=e.poly,t=e.service,a=e.noChilds,i=e.fetchChildTrends,n=e.durationYears;return async(e,o,l)=>(l.fetch,(await e(fetchLocalityPriceTrends({poly:r,service:t,noChilds:a,fetchChildTrends:i,durationYears:n}))||{}).priceTrends)},projectPriceTrendsAction=e=>{let r=e.data,t=e.dispatch,a=e.shouldUpdateState,n=void 0===a||a;const o=(r||{}).projectTrends;return o?o.map(e=>{let r=e.percentGrowth,a=e.numberOfYears,o=e.avgPrice,l=e.trend,c=e.listingId,d=e.monthlyTrend,s=e.projectPriceTrendForEachYear;const p=getFormatedPriceTrend(l,d),y=p.res,u=p.monthlyTrendAvailable,v={percentGrowth:r,numberOfYears:a,avgRate:{value:(0,i.A)({val:o,kPrec:1,lPrec:1,cPrec:1,unitChar:1,currency:!0})},listingId:c,trend:y,monthlyTrendAvailable:u,projectPriceTrendForEachYear:s};return n&&t({type:"UPDATE_META_DATA",payload:{priceTrendsData:v}}),v}):[]},fetchFeaturedLocalityPriceTrends=e=>{let r=e.featureType,t=e.cityUuid,a=e.service,i=e.overviewUrlRequired,n=void 0!==i&&i,o=e.inventoryCountRequired,c=void 0!==o&&o,d=e.propertyTypeId,s=e.apartmentTypeIds,p=e.fallback;return(e,i,o)=>{let y=o.fetch;const u=i(),v=u.filters,T=(void 0===v?{}:v).category,h=u.seo.pageTypeMajor,g=u.propertyDetails,f=(void 0===g?{}:g).details,m=(void 0===f?{}:f).details,I=(void 0===m?{}:m).config,P=(void 0===I?{}:I).propertyConfig,A=void 0===P?[]:P;if(!t)return Promise.resolve({});const b=d?String(d):getPropertyTypeDetails({pageTypeMajor:h,propertyConfig:A,service:a});return fetcher(y,`${r}_LOCALITY_PRICE_TREND`.toUpperCase(),l,JSON.stringify({featureType:r,cityUuid:t,service:a,category:T,overviewUrlRequired:n,inventoryCountRequired:c,propertyTypeId:b,apartmentTypeIds:String(s||getApartmentId({service:a,pageTypeMajor:h,propertyConfig:A})),fallback:p})).then(e=>e.featuredLocalityPriceTrends||{}).catch(()=>{})}},__WEBPACK_DEFAULT_EXPORT__=e=>{let r=e.listingId,t=(e.service,e.shouldUpdateState);return(e,a,i)=>{let o=i.fetch;const l=a().filters,c=(void 0===l?{}:l).service;return fetcher(o,"PROJECT_PRICE_TRENDS",n,JSON.stringify({projectIds:r,service:c,propertyTypeId:"1, 35, 2, 38"})).then(r=>projectPriceTrendsAction({data:r,dispatch:e,shouldUpdateState:t})).catch(()=>{})}}},47307:(e,r,t)=>{t.d(r,{A:()=>a});const a=function numberToCurrency(e){let r=e.val,t=e.kPrec,a=void 0===t?0:t,i=e.lPrec,n=void 0===i?0:i,o=e.cPrec,l=void 0===o?0:o,c=e.unitChar,d=void 0===c?0:c,s=e.separator,p=void 0===s?"":s,y=e.returnValues,u=void 0!==y&&y,v=e.unitObj,T=void 0===v?{}:v,h=e.currency,g=void 0!==h&&h;const f=1e7,m=1e5;let I="",P=parseInt(r,10),A="";return r>=f?(I="Cr",P=parseFloat(r/f).toFixed(l),1===parseInt(P,10)&&(I="Cr")):r>=m?(I=T.Lacs||"Lacs",P=parseFloat(r/m).toFixed(n),1===parseInt(P,10)&&(I=T.Lac||"Lac"),1===d&&(I="L")):r>=1e3&&(I="K",P=parseFloat(r/1e3).toFixed(a)),u?{value:P,unit:I}:(A=`${P}${p}${I}`,g&&(A="₹"+A),A)}},49032:(e,r,t)=>{t.d(r,{A2:()=>fetchPopularProjects,NX:()=>getLocalityPriceTrends,Xz:()=>fetchNearByLocalities,de:()=>modifySelectedItem,gI:()=>cleanPriceTrendGraphData,pQ:()=>emptySelectedItems,ts:()=>getProjectPriceTrends,zI:()=>storePriceTrends});var a=t(99413),i=t(16411),n=t(13216);const o=["price","growthRate"],l=["listingId","title"],c=["percentGrowth","avgRate","avgRate","listingId"];function _objectWithoutProperties(e,r){if(null==e)return{};var t,a,i=function _objectWithoutPropertiesLoose(e,r){if(null==e)return{};var t={};for(var a in e)if({}.hasOwnProperty.call(e,a)){if(-1!==r.indexOf(a))continue;t[a]=e[a]}return t}(e,r);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);for(a=0;a<n.length;a++)t=n[a],-1===r.indexOf(t)&&{}.propertyIsEnumerable.call(e,t)&&(i[t]=e[t])}return i}function _arrayLikeToArray(e,r){(null==r||r>e.length)&&(r=e.length);for(var t=0,a=Array(r);t<r;t++)a[t]=e[t];return a}const d=a.J`
  query($poly: String!, $size: Int) {
    popularProjects(poly: $poly, size: $size) {
      listingId
      title
      displayPrice {
        displayValue
      }
      coverImage {
        src
        alt
      }
    }
  }
`,emptySelectedItems=()=>(e,r,t)=>{t.fetch,e({type:"UPDATE_META_DATA",payload:{selectedItemsModalPriceTrends:[]}})},modifySelectedItem=e=>(r,t,a)=>{a.fetch;const i=t().meta,n=(void 0===i?[]:i).priceTrendsGraphData,o=void 0===n?{}:n;r({type:"UPDATE_META_DATA",payload:{selectedItemsModalPriceTrends:{data:e.slice(1).map(e=>({...e,priceTrend:o[e.id]})),lastUpdated:Date.now()}}})},storePriceTrends=e=>{let r=e.id,t=e.priceTrend;return(e,a,i)=>{i.fetch;const n=a().meta,o=(void 0===n?[]:n).priceTrendsGraphData;e({type:"UPDATE_META_DATA",payload:{priceTrendsGraphData:{...void 0===o?{}:o,[r]:t}}})}},cleanPriceTrendGraphData=e=>(r,t,a)=>{a.fetch;const i=t().meta,n=(void 0===i?[]:i).priceTrendsGraphData,o=void 0===n?{}:n;let l={};[...e].map(e=>{l={...l,[e.id]:o[e.id]}}),r({type:"UPDATE_META_DATA",payload:{priceTrendsGraphData:l}})},fetchNearByLocalities=e=>{let r=e.cityUuid,t=e.service,a=e.propertyTypeId,i=e.apartmentTypeIds;return e=>e((0,n.ML)({localityTypes:["investment_hotspots","affordable"],service:t,poly:r,propertyTypeId:a,apartmentTypeIds:i})).then(e=>{let r=function _slicedToArray(e,r){return function _arrayWithHoles(e){if(Array.isArray(e))return e}(e)||function _iterableToArrayLimit(e,r){var t=null==e?null:"undefined"!=typeof Symbol&&e[Symbol.iterator]||e["@@iterator"];if(null!=t){var a,i,n,o,l=[],c=!0,d=!1;try{if(n=(t=t.call(e)).next,0===r){if(Object(t)!==t)return;c=!1}else for(;!(c=(a=n.call(t)).done)&&(l.push(a.value),l.length!==r);c=!0);}catch(e){d=!0,i=e}finally{try{if(!c&&null!=t.return&&(o=t.return(),Object(o)!==o))return}finally{if(d)throw i}}return l}}(e,r)||function _unsupportedIterableToArray(e,r){if(e){if("string"==typeof e)return _arrayLikeToArray(e,r);var t={}.toString.call(e).slice(8,-1);return"Object"===t&&e.constructor&&(t=e.constructor.name),"Map"===t||"Set"===t?Array.from(e):"Arguments"===t||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t)?_arrayLikeToArray(e,r):void 0}}(e,r)||function _nonIterableRest(){throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}()}(e,2),t=r[0],a=r[1];const i=(t||{}).data,n=void 0===i?[]:i,l=(a||{}).data;return[...(void 0===l?[]:l).filter(e=>!n.find(r=>r.id===e.id)),...n].map(e=>({avgPricePerSqft:e.price,percentGrowth:e.growthRate,..._objectWithoutProperties(e,o)}))})},fetchPopularProjects=e=>(r,t,a)=>(0,a.fetch)({apiName:"POPULAR_PROJECTS",query:{query:d,variables:JSON.stringify({poly:e,size:10})}}).then(e=>{let r=e.data,t=(void 0===r?{}:r).data.popularProjects;return(void 0===t?[]:t).map(e=>({id:e.listingId,name:e.title,..._objectWithoutProperties(e,l)}))}).catch(()=>[]),getProjectPriceTrends=e=>{let r=e.listingId,t=e.service,a=e.storePriceTrends,n=e.shouldUpdateState;return(e,o,l)=>(l.fetch,e((0,i.Ay)({listingId:r,service:t,shouldUpdateState:n})).then(e=>{let r={};return e.forEach(e=>{const t=e||{},i=t.percentGrowth,n=t.avgRate,o=t.avgRate,l=(void 0===o?{}:o).value,d=t.listingId,s=_objectWithoutProperties(t,c);r={id:d,avgRate:l&&`₹${l}`,percentageGrowth:i&&i.toFixed(2),loaded:!0,isLoading:!1,priceTrend:{averagePrice:l&&`₹${l}`,percentageGrowth:i&&i.toFixed(2),...s}},a({id:d,priceTrend:{averagePrice:l,percentageGrowth:i&&i.toFixed(2),avgRate:n,...s}})}),{priceTrend:e,priceTrendObj:r}}))},getLocalityPriceTrends=e=>{let r=e.poly,t=e.service,a=e.noChilds,n=e.storePriceTrends,o=e.propertyTypeId,l=e.apartmentTypeIds;return(e,c,d)=>(d.fetch,e((0,i.rW)({poly:r,service:t,noChilds:a,propertyTypeId:o,apartmentTypeIds:l})).then(e=>{let t=e.priceTrends;const a=t||{},i=a.percentageGrowth,o=a.averagePrice,l={id:r,avgRate:o,percentageGrowth:i,loaded:!0,isLoading:!1,priceTrend:t};return n({id:r,priceTrend:t}),{priceTrendObj:l}}))}},55185:(e,r,t)=>{t.r(r)},63261:(e,r,t)=>{t.d(r,{IX:()=>getDropDownOptions,K3:()=>getPriceTrendsDetails,KS:()=>c,eW:()=>o,kz:()=>a,nh:()=>l,xY:()=>commonYearPT,xj:()=>i});const a=["project","locality","nearLocality1","nearLocality2","nearLocality3","nearLocality4","nearLocality5"],getPriceTrendsDetails=e=>{let r=e.key,t=void 0===r?"price":r,a=e.selectedYears,i=void 0===a?1:a,n=e.ptDetailsObj,o=void 0===n?{}:n,l=e.selectedService,c=void 0===l?"buy":l;const d=o||{},s=d.strokeColor,p=void 0===s?"":s,y=d.title,u=void 0===y?"":y,v=d.data,T=void 0===v?{}:v,h=d.types,g=d.priceTrendForEachYear;return{key:t,strokeColor:p,title:u,trend:T.trend?.slice(-4*i)||[],percentGrowth:T.percentGrowth||0,numberOfYears:T.numberOfYears||1,avgRate:T.avgRate,types:h,priceText:"buy"===c?"avg. price / sq.ft":"avg. price",metric:"buy"===c?"/sq.ft":"/month",priceTrendForEachYear:g}},commonYearPT=(e,r)=>{const t={};r[e[0]]?.trend.map(e=>{let r=e.year,a=e.price;t[r]={price:a,count:1}});let a=[];return e.map((e,i)=>{if(0==i)return;const n=r[e]?.trend;n.map(e=>{let r=e.year,n=e.price;t[r]&&(t[r]={...t[r],[`price${[i]}`]:n,count:t[r]?.count+1,year:r},a.push(t[r]))})}),a.filter(r=>r.count===e.length)},i=10,n=[{key:1,label:"Last 1 year",value:"last 1 year"},{key:3,label:"Last 3 years",value:"last 3 years"},{key:5,label:"Last 5 years",value:"last 5 years"},{key:8,label:"Max Duration",value:"max Duration"}],getDropDownOptions=e=>{let r=e.originalTrendData;const t=Math.ceil(r?.length/4),a=n.filter(e=>e.key<=t+1),i=a.slice(-1)[0]||{};return{DROPDOWN_OPTIONS:a,DROPDOWN_LABEL:i.value,SELECTED_YEARS:i.key}},o={eventCategory:"Price_Trends",eventLabel:"PROJECT DETAIL PAGE"},l={eventCategory:"Price_Trends",eventLabel:"RENT DETAIL PAGE"},c={eventCategory:"Price_Trends",eventLabel:"RESALE DETAIL PAGE"}},74171:(e,r,t)=>{t.d(r,{A:()=>a});const a={PRICE_TRENDS_SEEN:(e,r)=>{const t=r.trackingDetails;return{category:t.eventCategory,action:"hook_seen",label:t.eventLabel}},LOCALITY_PRICE_TRENDS_SEEN:()=>({category:"Locality_Price_trend",action:"hook_seen",label:"PDP"})}},79641:(e,r,t)=>{t.d(r,{IK:()=>n,Z0:()=>a,_u:()=>i,hC:()=>l,pH:()=>o});t(1814);const a="_vy1osq _tcsk1wug T_newPriceTrendContainerStyle",i="_tcsk1c5i T_noPriceTrendsStyle",n="_26glyw _9s1txw _ar1bp4 _0h1h6o _j6e0nm _legktf _2djk66 _156v1wug T_rentResalePriceTrendsStyle",o="_leidpf _2d1x77 _j61wug T_rentPriceTrendStyle",l="_vy1osq _tcsk1wug T_priceTrendContainerStyle";t(55185)}}]);