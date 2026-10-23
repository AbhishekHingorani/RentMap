"use strict";(self.webpackChunkhousing_demand=self.webpackChunkhousing_demand||[]).push([[16308,60792],{78779:(e,t,i)=>{i.d(t,{mT:()=>fetchEntityRatings,HZ:()=>fetchFilteredReviews,PQ:()=>fetchMultiEntityRatings,Se:()=>reviewsAction});var a=i(99413),r=i(44588),n=i.n(r);const o=a.J`
  query {
    multiUserDetails {
      name
      uuid
      image
      profile
    }
  }
`,s=["reviewerName"],l=a.J`
  query($entityId: String!, $entityType: String!, $formVersion: Int) {
    entityRatings(
      entityId: $entityId
      entityType: $entityType
      formVersion: $formVersion
    ) {
      avgRating
      showRating
      goodPills
      negativePills
      ratingTypeDetails {
        avgRating
        ratingTypeId
        ratingTypeLabel
      }
      totalRatings
      ratingWiseCounts {
        one
        two
        three
        four
        five
      }
    }
  }
`,p=a.J`
  query($entityIds: [String], $entityType: String!) {
    multiEntityRatings(entityIds: $entityIds, entityType: $entityType) {
      entityId
      avgRating
      goodPills
      ratingTypeDetails {
        avgRating
        ratingTypeId
        ratingTypeLabel
      }
      totalRatings
      ratingWiseCounts {
        one
        two
        three
        four
        five
      }
    }
  }
`,d=a.J`
  query(
    $entityId: String!
    $entityType: String!
    $page: Int!
    $size: Int!
    $sortDirection: String
    $sortBy: String
    $ratings: Int
  ) {
    reviews(
      entityId: $entityId
      entityType: $entityType
      page: $page
      size: $size
      sortDirection: $sortDirection
      sortBy: $sortBy
      ratings: $ratings
    ) {
      totalCount
      reviewsData {
        avgRating
        postedAt
        postedBy
        testimonial
        reviewerName
        userCategory
        id
        needImprovementReview
        goodPills
        badPills
        helpfulCount
        showReviewerCategory
      }
    }
  }
`,fetchEntityRatings=e=>(t,i,a)=>{let r=a.fetch;const n=e.entityId,o=e.entityType,s=e.formVersion;return r({apiName:"ENTITY_RATINGS_API",cacheType:"stale",query:{query:l,variables:JSON.stringify({entityId:n,entityType:o,formVersion:s})}}).then(e=>{const t=(e||{}).data,i=(void 0===t?{}:t).data;return(void 0===i?{}:i).entityRatings}).catch(()=>{})},fetchMultiEntityRatings=e=>(t,i,a)=>{let r=a.fetch;const n=e.entityIds,o=e.entityType;return r({apiName:"MULTI_ENTITY_RATINGS_API",cacheType:"stale",query:{query:p,variables:JSON.stringify({entityIds:n,entityType:o})}}).then(e=>{const t=(e||{}).data,i=(void 0===t?{}:t).data;return(void 0===i?{}:i).multiEntityRatings})},reviewsAction=e=>{let t=e.reviews,i=e.dispatch,a=e.type,r=void 0===a?"polygon":a,n=t||{},o=n.totalCount,l=n.reviewsData,p=void 0===l?[]:l;p=p.map(e=>{let t=e.reviewerName;return{...function _objectWithoutProperties(e,t){if(null==e)return{};var i,a,r=function _objectWithoutPropertiesLoose(e,t){if(null==e)return{};var i={};for(var a in e)if({}.hasOwnProperty.call(e,a)){if(-1!==t.indexOf(a))continue;i[a]=e[a]}return i}(e,t);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);for(a=0;a<n.length;a++)i=n[a],-1===t.indexOf(i)&&{}.propertyIsEnumerable.call(e,i)&&(r[i]=e[i])}return r}(e,s),postedBy:t||"Anonymous"}});const d={totalCount:o,reviewsData:p};i("polygon"===r?{type:"UPDATE_META_DATA",payload:{localityReviews:d}}:{type:"UPDATE_META_DATA",payload:{projectReviews:d}})},fetchFilteredReviews=e=>(t,i,a)=>(0,a.fetch)({apiName:"ENTITY_REVIEWS_API",cacheType:"stale",query:{query:d,variables:JSON.stringify({page:0,...e})}}).then(e=>{const i=(e||{}).data,a=(void 0===i?{}:i).data;let r=(void 0===a?{}:a).reviews||{},s=r.totalCount,l=r.reviewsData;l=l||[];const p=[];l.forEach((e,t)=>{let i=e.postedBy,a=e.reviewerName;null===a&&p.push(i),l[t].uuid=i,l[t].postedBy=a||"Anonymous"});const d=[...p].join(",");return t((e=>(t,i,a)=>(0,a.fetch)({query:{query:o,profileUuid:e,multiUser:!0},cacheType:"network-only",log:!1,withCredentials:!0,url:`${n().endPoints.gql}/auth`,apiName:"MULTI_USER_DETAILS_API"}).catch(e=>e).then(function(){let e=(arguments.length>0&&void 0!==arguments[0]?arguments[0]:{}).data,t=(void 0===e?{}:e).data;return(void 0===t?{}:t).multiUserDetails}))(d)).then(e=>{if(e){let t={};e.forEach(e=>{let i=e.name,a=e.uuid;t[a]=i||"Anonymous"}),addUserDetailsToReviews(t,l)}return{totalCount:s,reviewsData:l}})}).catch(()=>{}),addUserDetailsToReviews=(e,t)=>{t&&t.forEach(t=>{const i=e[t.uuid];i&&(t.postedBy=i.split(" ").map(e=>{let t=e;return e&&(t=e[0].toUpperCase()+e.substring(1)),t}).join(" "))})}},96026:(e,t,i)=>{i.d(t,{A:()=>__WEBPACK_DEFAULT_EXPORT__});i(62234);var a=i(59085),r=i(99413),n=i(78779);const o=["count","propertyType","propertyStatus","variant","apartmentTypeId","area","hasReviewRating","fallback","addFallbackData"],s=r.J`
  query(
    $propertyId: Int!
    $service: String!
    $variants: [String!]
    $page: Int
    $isBot: Boolean!
    $propertyType: String
    $propertyStatus: String
    $count: Int
    $variant: String
    $apartment_type_ids: Int
    $area: Float
    $meta: JSON
    $id: String
    $type: String
    $distance: Int
    $lat: String
    $long: String
    $isMapSelected: Boolean
    $paid: Boolean
    $hasReviewRating: Boolean
    $gaId: String
    $fallback: FallbackInput
  ) {
    similarProperties(
      propertyId: $propertyId
      service: $service
      variants: $variants
      count: $count
      variant: $variant
      apartment_type_ids: $apartment_type_ids
      area: $area
      page: $page
      propertyType: $propertyType
      propertyStatus: $propertyStatus
      meta: $meta
      id: $id
      type: $type
      distance: $distance
      lat: $lat
      long: $long
      isMapSelected: $isMapSelected
      paid: $paid
      hasReviewRating: $hasReviewRating
      gaId: $gaId
      fallback: $fallback
    ) {
      totalCount
      url
      variant
      properties {
        meta
        polygonsHash
        isUc
        price
        coverImage {
          src
          alt
        }
        showNewLaunch
        certifiedDetails {
          isVerifiedProperty
          similarPropertyKeys
          isCertifiedProperty
        }
        entityProjectName
        updatedAt
        highlights
        nearByPlaces {
          establishmentType
          name
          distance
          travelDistance
          duration
        }
        carouselTags
        postedDate
        imageCount
        title
        reviewRating
        tags
        subtitle
        saleTag
        digitour {
          url
        }
        photoUnderReview
        boostedAs
        displayPrice {
          value
          displayValue
          unit
          deposit
          brokerage
          maintenance
          displayMaintenance
          displayDeposit
          displayBrokerage
          totalRent
          brokerageDuration
          depositDuration
          displayParkingCharges
          displayPaintingCharges
          paintingDuration
          lockInPeriod
        }
        address {
          address
        }
        url
        tracking
        listingId
        isActiveProperty
        promotions
        insights {
          id
          value
        }
        emi
        porDetails {
          apartmentTypeId
          apartmentType
          displayMinPrice
          displayMaxPrice
          range
        }
        details {
          amenities {
            type
            label
            data
            additionalData {
              label
              value
            }
          }
          averagePrice
          avgPriceValue
          images {
            type
            images {
              src
              alt
              caption
              tag
              type
              videoUrl
              category
            }
          }
          propertyConfigs {
            id
            icon
            label
            description
            meta
          }
          config {
            propertyConfig {
              key
              label
              propertyTypeName
              propertyTypeId
              range
              data {
                id
                price {
                  value
                  displayValue
                  unit
                  deposit
                  description
                }
                unitsAvailable
                areaConfig {
                  name
                  areaInfo {
                    value
                    unit
                    displayArea
                  }
                }
                emi
                averagePrice
                floorPlan {
                  src
                  alt
                  tag
                  floor
                  caption
                  type
                }
                projectAttributes {
                  name
                  status
                  reraId
                  possessionDate
                }
                features
                additionalFields {
                  id
                  value
                  label
                }
              }
            }
            displayAreaType
            type
          }
        }
        features {
          label
          description
        }
        featureAndConfig {
          id
          description
          label
        }
        propertyType
        brands {
          name
        }
        sellers {
          name
          id
          image
          url
          isPaid
          type
          isPrime
          sellerBadge
          sellerClassification
          designation
          phone {
            partialValue
          }
          isCertifiedAgent
          adDeficit
          contactPersonId
        }
        coords
        keyHighlight
        isVerified
      }
      structuredData @include(if: $isBot)
    }
  }
`,__WEBPACK_DEFAULT_EXPORT__=e=>{let t=e.count,i=void 0===t?3:t,r=e.propertyType,l=e.propertyStatus,p=void 0===l?"active":l,d=e.variant,y=void 0===d?"":d,u=e.apartmentTypeId,c=void 0===u?0:u,g=e.area,v=void 0===g?0:g,f=e.hasReviewRating,m=void 0!==f&&f,h=e.fallback,$=e.addFallbackData,I=void 0!==$&&$,T=function _objectWithoutProperties(e,t){if(null==e)return{};var i,a,r=function _objectWithoutPropertiesLoose(e,t){if(null==e)return{};var i={};for(var a in e)if({}.hasOwnProperty.call(e,a)){if(-1!==t.indexOf(a))continue;i[a]=e[a]}return i}(e,t);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);for(a=0;a<n.length;a++)i=n[a],-1===t.indexOf(i)&&{}.propertyIsEnumerable.call(e,i)&&(r[i]=e[i])}return r}(e,o);return(e,t,o)=>{let l=o.fetch;const d=t()||{},u=d.filters,g=void 0===u?{}:u,f=g.service,$=g.category,b=g.selectedCity,S=g[f],P=void 0===S?{}:S,w=P.outer_radius,R=void 0===w?4e3:w,_=P.latWhole,D=void 0===_?null:_,A=P.latFractionalZero,C=P.latFractional,k=void 0===C?null:C,N=P.longWhole,E=void 0===N?null:N,B=P.longFractionalZero,O=P.longFractional,q=void 0===O?null:O,j=d.shell,M=(void 0===j?{}:j).useragent,U=void 0===M?{}:M,V=U.isBot,F=U.isNewBot,J=U.isMobile,L=d.searchResults,W=(void 0===L?{}:L).searchEntityDetails,x=d.cookies._ga;r=r||(0,a.A)(f,$);const z=W||{},H=z.id,Y=void 0===H?"":H,Z=z.type,G=void 0===Z?"":Z,Q=R/1e3;let K=![D,k,A,E,q,B].some(e=>[null,void 0].includes(e)),X="",ee="";if(K){const e=String(D),t="0".repeat(A)+String(k),i=String(E),a="0".repeat(B)+String(q);X=[e,t].join("."),ee=[i,a].join(".")}return l({apiName:"SIMILAR_PROPERTIES_API",cacheType:"stale",query:{query:s,variables:JSON.stringify({service:f,category:$,count:i,variant:y,apartment_type_ids:c,area:v,id:Y,type:G,distance:Q,lat:X,long:ee,isMapSelected:K,meta:{city:b,addFallbackData:I},...T,propertyType:r,propertyStatus:p,isBot:!!V||!!F,hasReviewRating:m,gaId:x,fallback:h})}}).then(t=>{let i=t.data.data.similarProperties,a=void 0===i?[]:i;if(!V&&J){const t=(a&&a.length?a[0]:[]).properties,i=t.map(e=>e.listingId);return e((0,n.PQ)({entityIds:i,entityType:"region_entity_id"})).then(e=>(t.map(t=>{const i=e.find(e=>e.entityId.toString()===t.listingId)||null;return t.ratings=i,t}),a))}return a}).catch(()=>[])}}}}]);